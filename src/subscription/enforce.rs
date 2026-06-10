//! Shared enforcement entry points.
//!
//! Two callers consume the same resolution + limit logic:
//!
//! * the HTTP middleware (`super::middleware`) — gates `/rpc` and `/v1`
//!   requests with structured JSON-RPC errors the desktop app renders;
//! * the turn engine (`agent/harness/engine/core.rs`) — gates every agent
//!   turn regardless of surface (RPC, Telegram, voice, cron), so a
//!   suspended customer's agent goes quiet everywhere, not just in the
//!   desktop app.
//!
//! Everything is a no-op unless `CLOSEREDGE_SUBSCRIPTION_GATING=1`.

use super::usage::{check_limits, current_snapshot, LimitExceeded, UsageSnapshot};
use super::{gating_enabled, supabase, tier_limits, AccessLevel, SubscriptionRecord};

/// Why an agent turn (or agent-category RPC) was refused.
#[derive(Debug, Clone)]
pub enum AgentBlock {
    /// Subscription state forbids agent actions (past-due beyond grace,
    /// suspended, canceled, or no subscription at all).
    Subscription {
        access_level: AccessLevel,
        status: String,
        human_message: String,
    },
    /// Usage limits for the tier are exhausted.
    Limit(LimitExceeded),
}

impl AgentBlock {
    /// One-line message suitable for surfacing as the agent's reply on
    /// conversational channels.
    pub fn user_message(&self) -> String {
        match self {
            AgentBlock::Subscription { human_message, .. } => human_message.clone(),
            AgentBlock::Limit(l) => format!(
                "Usage limit reached ({}: {} of {}). Limits reset at {}. \
                 Upgrade your plan at https://closeredge.ai/pricing for higher limits.",
                l.limit_type, l.used, l.limit, l.resets_at
            ),
        }
    }
}

fn human_message_for(level: AccessLevel, status: &str) -> String {
    match level {
        AccessLevel::ReadOnly => {
            "Your subscription payment is past due. Agent actions are paused — \
             update your billing at https://closeredge.ai/billing to restore them."
                .to_string()
        }
        AccessLevel::BillingOnly => {
            "Your subscription is suspended due to a billing issue. Update your \
             payment method at https://closeredge.ai/billing to restore access."
                .to_string()
        }
        AccessLevel::Denied => {
            if status == "canceled" {
                "Your subscription has ended. Visit https://closeredge.ai/pricing to resubscribe."
                    .to_string()
            } else {
                "No active subscription was found for this deployment. Visit \
                 https://closeredge.ai/pricing to subscribe."
                    .to_string()
            }
        }
        AccessLevel::Full => String::new(),
    }
}

/// Resolve the current subscription record (cache → Supabase → stale).
/// `None` when gating is disabled.
pub async fn resolve_if_gating() -> Option<supabase::Resolution> {
    if !gating_enabled() {
        return None;
    }
    Some(supabase::resolve().await)
}

/// Gate an agent turn. Returns `Some(block)` when the turn must not run.
///
/// On success this does NOT record the request — call
/// [`record_allowed_agent_request`] once the turn actually starts, so
/// refused turns don't consume quota.
pub async fn check_agent_allowed() -> Option<AgentBlock> {
    let resolution = resolve_if_gating().await?;

    let Some(record) = resolution.record else {
        return Some(AgentBlock::Subscription {
            access_level: AccessLevel::Denied,
            status: "none".to_string(),
            human_message: human_message_for(AccessLevel::Denied, "none"),
        });
    };

    if !record.access_level.can_agent() {
        return Some(AgentBlock::Subscription {
            access_level: record.access_level,
            status: record.status.clone(),
            human_message: human_message_for(record.access_level, &record.status),
        });
    }

    let limits = tier_limits(record.tier);
    if let Some(exceeded) = check_limits(&limits, &current_snapshot()) {
        return Some(AgentBlock::Limit(exceeded));
    }

    None
}

/// Atomically reserve one agent turn: count it, then check limits on the
/// pre-reservation snapshot, refunding if the turn must be refused.
///
/// This is the engine's authoritative gate. Unlike the advisory
/// [`check_agent_allowed`] (used by the HTTP middleware for fast structured
/// errors), the reserve-then-check pattern closes the TOCTOU window: two
/// concurrent turns both reserve, SQLite serializes the increments, and
/// whichever one pushes the counter past the cap sees it in its own
/// snapshot, gets refused, and is refunded. Refused turns never consume
/// quota.
///
/// With gating disabled this still meters (fire-and-forget) so usage
/// history is accurate if gating is enabled later.
pub async fn reserve_agent_turn() -> Option<AgentBlock> {
    let Some(resolution) = resolve_if_gating().await else {
        // Gating off — meter and allow.
        super::usage::record_agent_request();
        return None;
    };

    let Some(record) = resolution.record else {
        return Some(AgentBlock::Subscription {
            access_level: AccessLevel::Denied,
            status: "none".to_string(),
            human_message: human_message_for(AccessLevel::Denied, "none"),
        });
    };

    if !record.access_level.can_agent() {
        return Some(AgentBlock::Subscription {
            access_level: record.access_level,
            status: record.status.clone(),
            human_message: human_message_for(record.access_level, &record.status),
        });
    }

    // Reserve first, then check on the pre-reservation count so the
    // semantics match check_limits' >= comparison (`limit` turns allowed,
    // the next refused). Metering unavailable → allow unmetered, same as
    // the fire-and-forget path.
    let Some(post) = super::usage::reserve_agent_request() else {
        return None;
    };
    let pre = UsageSnapshot {
        requests_today: post.requests_today - 1,
        requests_this_week: post.requests_this_week - 1,
        ..post
    };

    let limits = tier_limits(record.tier);
    if let Some(exceeded) = check_limits(&limits, &pre) {
        super::usage::refund_agent_request();
        return Some(AgentBlock::Limit(exceeded));
    }

    None
}

/// Check only the usage limits for an already-resolved subscription record.
/// Used by the HTTP middleware, which has just resolved the record for its
/// access-level decision — calling this instead of [`check_agent_allowed`]
/// avoids resolving twice per request.
pub fn check_limits_for(record: &SubscriptionRecord) -> Option<LimitExceeded> {
    let limits = tier_limits(record.tier);
    check_limits(&limits, &current_snapshot())
}

/// Record a turn that passed the gate (or that ran with gating disabled —
/// metering stays on so usage history is accurate if gating is enabled
/// later).
pub fn record_allowed_agent_request() {
    super::usage::record_agent_request();
}

/// Record LLM token usage from the turn engine. Always meters, even with
/// gating off, so the `subscription.usage` RPC has real numbers in dev.
pub fn record_llm_usage(input_tokens: u64, output_tokens: u64) {
    super::usage::record_llm_tokens(input_tokens, output_tokens);
}

/// Snapshot of subscription + usage for the `subscription.status` RPC.
pub async fn status_report() -> serde_json::Value {
    let gating = gating_enabled();
    let snapshot = current_snapshot();

    let (record, source): (Option<SubscriptionRecord>, &str) = if gating {
        let r = supabase::resolve().await;
        (r.record, r.source)
    } else {
        (None, "gating_disabled")
    };

    let limits = record.as_ref().map(|r| tier_limits(r.tier));
    let exceeded = limits
        .as_ref()
        .and_then(|l| check_limits(l, &snapshot));

    serde_json::json!({
        "gating_enabled": gating,
        "source": source,
        "subscription": record,
        "usage": snapshot,
        "limits": limits,
        "limit_exceeded": exceeded.map(|e| serde_json::to_value(&e).unwrap_or_default()),
    })
}
