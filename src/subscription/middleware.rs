//! Axum middleware enforcing subscription access on the core HTTP server.
//!
//! Sits between `rpc_auth_middleware` (bearer auth) and the RPC handler,
//! exactly as specified in `docs/subscription-gating-design.md`. Gates:
//!
//! * `POST /rpc` — JSON-RPC. The body is buffered (capped) to read the
//!   method name, then the request is reconstructed and forwarded or
//!   refused with a structured JSON-RPC error.
//! * `POST /v1/*` — the OpenAI-compatible inference endpoint, treated as
//!   an agent-category action.
//!
//! Error code registry (mirrors the design doc, +1 addition):
//!
//! | Code   | Name                 | Meaning                                  |
//! |--------|----------------------|------------------------------------------|
//! | -32001 | `subscription_gated` | Blocked by access level (dunning state)   |
//! | -32002 | `tier_gated`         | Feature requires a higher tier            |
//! | -32003 | `no_subscription`    | No valid subscription for the license     |
//! | -32004 | `limit_exceeded`     | Tier usage limit (rate/weekly/etc.) hit   |

use axum::{
    body::{to_bytes, Body},
    extract::Request,
    http::{Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

use super::enforce::{self, check_agent_allowed, AgentBlock};
use super::{gating_enabled, supabase, tier_allows_feature, AccessLevel, SubscriptionRecord};

/// Max `/rpc` body the gate will buffer. Mirrors a generous JSON-RPC
/// payload; larger bodies are refused outright (they would also fail
/// downstream parsing).
const MAX_RPC_BODY_BYTES: usize = 8 * 1024 * 1024;

/// Methods that must work regardless of subscription state: health,
/// version, the auth/login flow, and the subscription/billing surface
/// itself (a suspended customer must be able to see *why* they are
/// suspended and fix their payment).
fn is_exempt_method(method: &str) -> bool {
    method == "core.ping"
        || method == "core.version"
        || method == "core.events_subscribe_token"
        || method.starts_with("subscription.")
        || method.starts_with("openhuman.auth")
        || method.starts_with("openhuman.credentials")
        || method.starts_with("openhuman.billing")
        || method.starts_with("openhuman.config_get")
        || method == "openhuman.ping"
        || method == "openhuman.health_snapshot"
        || method == "openhuman.health_system_info"
        || method == "openhuman.system_info"
        // Legacy config reads that use the `get_` prefix. Listed explicitly
        // rather than using a `starts_with("openhuman.get_")` wildcard — a
        // wildcard would exempt any future data-access method named
        // `openhuman.get_conversations` or `openhuman.get_vault_entries`,
        // leaking read access to denied/suspended users.
        || method == "openhuman.get_analytics_settings"
        || method == "openhuman.get_composio_trigger_settings"
        || method == "openhuman.get_dashboard_settings"
        || method == "openhuman.get_config"
        || method == "openhuman.get_runtime_flags"
}

/// Request category for access-level decisions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MethodCategory {
    /// Cheap, side-effect-free reads — allowed in `ReadOnly`.
    Read,
    /// State mutation (settings, config) — requires `Full`.
    Write,
    /// LLM/agent work — requires `Full` and counts against usage limits.
    Agent,
}

/// Conservative method categorization.
///
/// Reads are recognized by well-known read suffixes/substrings; agent
/// work by the prefixes that reach the LLM or execute tools; everything
/// else defaults to `Write` (blocked in dunning's read-only phase —
/// failing toward "ask them to pay" rather than leaking paid function).
pub fn categorize_method(method: &str) -> MethodCategory {
    const AGENT_PREFIXES: &[&str] = &[
        "openhuman.chat",
        "openhuman.agent",
        "openhuman.subagent",
        "openhuman.orchestrator",
        "openhuman.voice",
        "openhuman.meet",
        "openhuman.tool_registry_call",
        "openhuman.mcp_clients_tool_call",
        "openhuman.inference_embed",
        "openhuman.embeddings_embed",
        "openhuman.composio_execute",
        "openhuman.subconscious",
        "warroom.",
        "adversary.",
    ];
    if AGENT_PREFIXES.iter().any(|p| method.starts_with(p)) {
        return MethodCategory::Agent;
    }

    const READ_MARKERS: &[&str] = &[
        "_get",
        "_list",
        "_status",
        "_info",
        "_exists",
        "_search",
        "_snapshot",
        "_history",
        "_presets",
        "_diagnostics",
        "_device_profile",
        "_read",
    ];
    if READ_MARKERS.iter().any(|m| method.contains(m)) {
        return MethodCategory::Read;
    }

    MethodCategory::Write
}

/// Map an RPC method to a tier-gated feature, if any.
fn feature_for_method(method: &str) -> Option<&'static str> {
    if method.starts_with("openhuman.voice") || method.starts_with("openhuman.meet") {
        Some("voice_enabled")
    } else if method.starts_with("warroom.") {
        Some("war_room")
    } else if method.contains("crm") {
        Some("crm_integration")
    } else {
        None
    }
}

fn rpc_error(id: Value, code: i64, message: &str, data: Value) -> Response {
    (
        StatusCode::OK,
        Json(json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": code, "message": message, "data": data }
        })),
    )
        .into_response()
}

fn blocked_response(
    id: Value,
    record: Option<&SubscriptionRecord>,
    block: &AgentBlock,
) -> Response {
    match block {
        AgentBlock::Subscription {
            access_level,
            status,
            human_message,
        } => {
            if record.is_none() {
                rpc_error(
                    id,
                    -32003,
                    "no_subscription",
                    json!({
                        "access_level": "denied",
                        "signup_url": "https://closeredge.ai/pricing",
                        "human_message": human_message,
                    }),
                )
            } else {
                rpc_error(
                    id,
                    -32001,
                    "subscription_gated",
                    json!({
                        "access_level": access_level,
                        "required_level": "full",
                        "subscription_status": status,
                        "upgrade_url": "https://closeredge.ai/billing",
                        "human_message": human_message,
                    }),
                )
            }
        }
        AgentBlock::Limit(l) => rpc_error(
            id,
            -32004,
            "limit_exceeded",
            json!({
                "limit_type": l.limit_type,
                "limit": l.limit,
                "used": l.used,
                "resets_at": l.resets_at,
                "upgrade_url": "https://closeredge.ai/pricing",
                "human_message": format!(
                    "You've reached your plan's {} limit ({} of {}). It resets at {}.",
                    l.limit_type, l.used, l.limit, l.resets_at
                ),
            }),
        ),
    }
}

/// The subscription gate. Inserted between bearer auth and request logging
/// in `build_core_http_router`; inert unless `CLOSEREDGE_SUBSCRIPTION_GATING=1`.
pub async fn subscription_gate_middleware(req: Request, next: Next) -> Response {
    if !gating_enabled() {
        return next.run(req).await;
    }

    let path = req.uri().path().to_string();
    let is_rpc = path == "/rpc" && req.method() == Method::POST;
    let is_inference = path.starts_with("/v1/") && req.method() == Method::POST;
    if !is_rpc && !is_inference {
        return next.run(req).await;
    }

    // The OpenAI-compatible endpoint is agent work with no JSON-RPC id.
    if is_inference {
        if let Some(block) = check_agent_allowed().await {
            let body = json!({
                "error": {
                    "type": "subscription_gated",
                    "message": block.user_message(),
                }
            });
            return (StatusCode::PAYMENT_REQUIRED, Json(body)).into_response();
        }
        return next.run(req).await;
    }

    // Buffer the JSON-RPC body to read the method, then reconstruct.
    let (parts, body) = req.into_parts();
    let bytes = match to_bytes(body, MAX_RPC_BODY_BYTES).await {
        Ok(b) => b,
        Err(_) => {
            return rpc_error(
                Value::Null,
                -32600,
                "invalid_request",
                json!({ "human_message": "Request body too large." }),
            )
        }
    };

    let (method, id) = match serde_json::from_slice::<Value>(&bytes) {
        Ok(v) => (
            v.get("method")
                .and_then(|m| m.as_str())
                .unwrap_or_default()
                .to_string(),
            v.get("id").cloned().unwrap_or(Value::Null),
        ),
        // Let the real handler produce its own parse error.
        Err(_) => (String::new(), Value::Null),
    };

    let req = Request::from_parts(parts, Body::from(bytes));

    if method.is_empty() || is_exempt_method(&method) {
        return next.run(req).await;
    }

    let resolution = supabase::resolve().await;
    let Some(record) = resolution.record.clone() else {
        let block = AgentBlock::Subscription {
            access_level: AccessLevel::Denied,
            status: "none".to_string(),
            human_message: "No active subscription was found for this deployment. Visit \
                 https://closeredge.ai/pricing to subscribe."
                .to_string(),
        };
        return blocked_response(id, None, &block);
    };

    let category = categorize_method(&method);
    let allowed = match category {
        MethodCategory::Read => record.access_level.can_read(),
        MethodCategory::Write => record.access_level.can_write(),
        MethodCategory::Agent => record.access_level.can_agent(),
    };
    if !allowed {
        let block = AgentBlock::Subscription {
            access_level: record.access_level,
            status: record.status.clone(),
            human_message: match record.access_level {
                AccessLevel::ReadOnly => {
                    "Your payment is past due — this action is paused until billing is updated."
                        .to_string()
                }
                _ => "Your subscription does not permit this action. Update billing at \
                      https://closeredge.ai/billing."
                    .to_string(),
            },
        };
        return blocked_response(id, Some(&record), &block);
    }

    if let Some(feature) = feature_for_method(&method) {
        if !tier_allows_feature(record.tier, feature) {
            return rpc_error(
                id,
                -32002,
                "tier_gated",
                json!({
                    "current_tier": record.tier,
                    "feature": feature,
                    "upgrade_url": "https://closeredge.ai/pricing",
                    "human_message": format!(
                        "This feature ({feature}) requires a higher plan. Upgrade to unlock."
                    ),
                }),
            );
        }
    }

    if category == MethodCategory::Agent {
        // Access level was already checked above (can_agent); only usage
        // limits remain. `check_limits_for` reuses the record resolved for
        // the access decision instead of resolving a second time. This is
        // an advisory fast-fail — the engine's `reserve_agent_turn` is the
        // authoritative (atomic) gate and counts the turn itself.
        if let Some(exceeded) = enforce::check_limits_for(&record) {
            return blocked_response(id, Some(&record), &AgentBlock::Limit(exceeded));
        }
    }

    next.run(req).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exemptions_cover_login_billing_and_health() {
        for m in [
            "core.ping",
            "core.version",
            "subscription.status",
            "subscription.usage",
            "openhuman.auth.login",
            "openhuman.credentials_set",
            "openhuman.billing_purchase_plan",
            "openhuman.config_get_runtime_flags",
            "openhuman.health_snapshot",
            // Legacy config reads (explicit allowlist, not wildcard).
            "openhuman.get_analytics_settings",
            "openhuman.get_composio_trigger_settings",
            "openhuman.get_dashboard_settings",
            "openhuman.get_config",
            "openhuman.get_runtime_flags",
        ] {
            assert!(is_exempt_method(m), "{m} should be exempt");
        }
        for m in [
            "openhuman.chat_send",
            "openhuman.config_update_agent_settings",
            "openhuman.tool_registry_call",
            // Data-access methods must NOT be exempt, even if they
            // start with `openhuman.get_` (the old wildcard was removed).
            "openhuman.get_conversations",
            "openhuman.get_vault_entries",
            "openhuman.get_crm_contacts",
        ] {
            assert!(!is_exempt_method(m), "{m} should NOT be exempt");
        }
    }

    #[test]
    fn categorization_is_conservative() {
        assert_eq!(
            categorize_method("openhuman.chat_send"),
            MethodCategory::Agent
        );
        assert_eq!(
            categorize_method("openhuman.voice_speak"),
            MethodCategory::Agent
        );
        assert_eq!(
            categorize_method("openhuman.mcp_clients_tool_call"),
            MethodCategory::Agent
        );
        assert_eq!(
            categorize_method("openhuman.inference_list_models"),
            MethodCategory::Read
        );
        assert_eq!(
            categorize_method("openhuman.screen_intelligence_status"),
            MethodCategory::Read
        );
        // Unknown methods default to Write, not Read.
        assert_eq!(
            categorize_method("openhuman.update_model_settings"),
            MethodCategory::Write
        );
        assert_eq!(
            categorize_method("openhuman.something_new"),
            MethodCategory::Write
        );
    }

    #[test]
    fn feature_mapping() {
        assert_eq!(
            feature_for_method("openhuman.voice_speak"),
            Some("voice_enabled")
        );
        assert_eq!(feature_for_method("warroom.post"), Some("war_room"));
        assert_eq!(
            feature_for_method("openhuman.crm_contact_create"),
            Some("crm_integration")
        );
        assert_eq!(feature_for_method("openhuman.chat_send"), None);
    }
}
