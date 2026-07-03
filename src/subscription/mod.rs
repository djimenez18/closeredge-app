//! Subscription gating middleware for the CloserEdge AI RPC server.
//!
//! This module intercepts every inbound RPC request and enforces subscription-based
//! access control before the request reaches domain handlers. The flow is:
//!
//! 1. Extract the license key or auth token from the request.
//! 2. Check a local TTL cache for a cached subscription record.
//! 3. On cache miss, validate against Supabase and populate the cache.
//! 4. Determine the access level: `Full`, `ReadOnly`, `BillingOnly`, or `Denied`.
//! 5. Check whether the requested feature is available for the customer's tier.
//!
//! # Cache strategy
//!
//! Subscription records are cached in-process for 5 minutes (300 seconds) to avoid
//! hitting Supabase on every RPC call. The cache is invalidated early when a Stripe
//! webhook pushes a subscription status change through the `/webhooks/stripe`
//! endpoint (see `invalidate_cache`).
//!
//! # Access levels
//!
//! | Level        | Read | Write | Agent | Admin | Billing |
//! |--------------|------|-------|-------|-------|---------|
//! | Full         |  Y   |   Y   |   Y   |   Y   |    Y    |
//! | ReadOnly     |  Y   |   N   |   N   |   N   |    N    |
//! | BillingOnly  |  N   |   N   |   N   |   N   |    Y    |
//! | Denied       |  N   |   N   |   N   |   N   |    N    |
//!
//! # Integration point
//!
//! The middleware is designed to sit between the existing `rpc_auth_middleware`
//! (bearer token validation) and the `rpc_handler` (JSON-RPC dispatch). See
//! `docs/subscription-gating-design.md` for the full architectural specification.

pub mod enforce;
pub mod middleware;
pub mod supabase;
pub mod usage;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// Env var that turns the subscription gate on. Off by default so local
/// desktop cores and dev builds are unaffected; Railway deployments set
/// `CLOSEREDGE_SUBSCRIPTION_GATING=1`.
pub const GATING_ENV: &str = "CLOSEREDGE_SUBSCRIPTION_GATING";

/// Returns true when subscription gating is enabled for this process.
///
/// Read per-call (not cached) so tests can toggle it; the cost is one
/// env read which is negligible next to the RPC work being gated.
pub fn gating_enabled() -> bool {
    matches!(
        std::env::var(GATING_ENV).as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE")
    )
}

/// How long a cached subscription record is considered fresh.
const CACHE_TTL: Duration = Duration::from_secs(300); // 5 minutes

/// Subscription tier levels corresponding to CloserEdge pricing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    Foundation,
    Pro,
    Elite,
}

impl Tier {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "foundation" => Some(Tier::Foundation),
            "pro" => Some(Tier::Pro),
            "elite" => Some(Tier::Elite),
            _ => None,
        }
    }
}

/// Access level determined by subscription status and dunning state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccessLevel {
    /// All features available for the subscription tier.
    Full,
    /// Can view dashboard, vault, and data. Cannot trigger agents, send
    /// messages, or modify settings.
    ReadOnly,
    /// Can only access the payment/billing update page.
    BillingOnly,
    /// No access whatsoever.
    Denied,
}

impl AccessLevel {
    pub fn can_read(&self) -> bool {
        matches!(self, AccessLevel::Full | AccessLevel::ReadOnly)
    }

    pub fn can_write(&self) -> bool {
        matches!(self, AccessLevel::Full)
    }

    pub fn can_agent(&self) -> bool {
        matches!(self, AccessLevel::Full)
    }

    pub fn can_admin(&self) -> bool {
        matches!(self, AccessLevel::Full)
    }

    pub fn can_billing(&self) -> bool {
        matches!(self, AccessLevel::Full | AccessLevel::BillingOnly)
    }
}

/// Agent type (which CloserEdge archetype is deployed).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    Eden,
    Crest,
    Lexis,
    Haven,
    Forge,
    Nora,
}

/// A resolved subscription record, either from cache or Supabase.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionRecord {
    pub subscription_id: String,
    pub customer_id: String,
    pub agent_type: AgentType,
    pub tier: Tier,
    pub status: String,
    pub access_level: AccessLevel,
    pub current_period_end: Option<String>,
    pub cancel_at_period_end: bool,
}

/// A cached entry wrapping a subscription record with an expiry timestamp.
#[derive(Debug, Clone)]
struct CacheEntry {
    record: SubscriptionRecord,
    expires_at: Instant,
}

/// In-process subscription cache keyed by license key hash.
///
/// Uses `RwLock` for concurrent read access from multiple Tokio tasks with
/// exclusive write access only on cache miss or webhook invalidation.
static SUBSCRIPTION_CACHE: std::sync::LazyLock<RwLock<HashMap<String, CacheEntry>>> =
    std::sync::LazyLock::new(|| RwLock::new(HashMap::new()));

/// Look up a subscription from the cache. Returns `None` on miss or expiry.
pub fn cache_get(license_key_hash: &str) -> Option<SubscriptionRecord> {
    let cache = SUBSCRIPTION_CACHE.read().ok()?;
    let entry = cache.get(license_key_hash)?;
    if Instant::now() < entry.expires_at {
        Some(entry.record.clone())
    } else {
        None
    }
}

/// Insert or update a subscription record in the cache.
pub fn cache_set(license_key_hash: &str, record: SubscriptionRecord) {
    if let Ok(mut cache) = SUBSCRIPTION_CACHE.write() {
        cache.insert(
            license_key_hash.to_string(),
            CacheEntry {
                record,
                expires_at: Instant::now() + CACHE_TTL,
            },
        );
    }
}

/// Look up a subscription from the cache, returning entries even after
/// their TTL has expired. Used as a fallback when Supabase is unreachable
/// during a cache miss: a stale record beats locking out every customer
/// during a brief outage (see `docs/subscription-gating-design.md` §3).
pub fn cache_get_stale(license_key_hash: &str) -> Option<SubscriptionRecord> {
    let cache = SUBSCRIPTION_CACHE.read().ok()?;
    cache.get(license_key_hash).map(|e| e.record.clone())
}

/// Invalidate a specific cache entry. Called by the Stripe webhook handler
/// when a subscription status changes.
pub fn invalidate_cache(license_key_hash: &str) {
    if let Ok(mut cache) = SUBSCRIPTION_CACHE.write() {
        cache.remove(license_key_hash);
    }
}

/// Invalidate all cache entries for a given customer. Used when a webhook
/// carries a customer ID but not a specific license key.
pub fn invalidate_cache_for_customer(customer_id: &str) {
    if let Ok(mut cache) = SUBSCRIPTION_CACHE.write() {
        cache.retain(|_, entry| entry.record.customer_id != customer_id);
    }
}

/// Flush the entire subscription cache. Used in tests and on full config reload.
pub fn flush_cache() {
    if let Ok(mut cache) = SUBSCRIPTION_CACHE.write() {
        cache.clear();
    }
}

/// Determine the access level from a raw subscription status string and the
/// number of days past the current_period_end.
///
/// This mirrors the Supabase `check_access_level` SQL function so the Rust
/// side can make the same decision without a round-trip when the record is
/// already cached.
pub fn resolve_access_level(status: &str, days_overdue: Option<i64>) -> AccessLevel {
    match status {
        "active" | "trialing" => AccessLevel::Full,
        "canceled" => AccessLevel::Denied,
        "suspended" => AccessLevel::BillingOnly,
        "paused" => AccessLevel::ReadOnly,
        "past_due" => {
            let days = days_overdue.unwrap_or(0);
            if days <= 7 {
                AccessLevel::Full // Grace period
            } else if days <= 14 {
                AccessLevel::ReadOnly // Degraded
            } else {
                AccessLevel::BillingOnly // Suspended-equivalent
            }
        }
        _ => AccessLevel::Denied,
    }
}

/// Feature gate: check whether a specific feature is available for the given tier.
///
/// Reads the compiled-in `access_control.json` config at build time via
/// `include_str!`. Returns `true` if the tier grants access to the feature,
/// `false` otherwise.
pub fn tier_allows_feature(tier: Tier, feature: &str) -> bool {
    // The access_control.json is embedded at compile time.
    static CONFIG: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
        let raw = include_str!("access_control.json");
        serde_json::from_str(raw).expect("access_control.json must be valid JSON")
    });

    let tier_key = match tier {
        Tier::Foundation => "foundation",
        Tier::Pro => "pro",
        Tier::Elite => "elite",
    };

    let tier_config = match CONFIG.get("tiers").and_then(|t| t.get(tier_key)) {
        Some(c) => c,
        None => return false,
    };

    // Boolean feature flags (voice_enabled, crm_integration, etc.)
    if let Some(val) = tier_config.get(feature) {
        if let Some(b) = val.as_bool() {
            return b;
        }
        // Numeric limits: -1 means unlimited, 0 means disabled, >0 means capped.
        if let Some(n) = val.as_i64() {
            return n != 0;
        }
    }

    false
}

/// Check whether a specific integration is available for the given tier.
pub fn tier_allows_integration(tier: Tier, integration: &str) -> bool {
    static CONFIG: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
        let raw = include_str!("access_control.json");
        serde_json::from_str(raw).expect("access_control.json must be valid JSON")
    });

    let tier_key = match tier {
        Tier::Foundation => "foundation",
        Tier::Pro => "pro",
        Tier::Elite => "elite",
    };

    CONFIG
        .get("tiers")
        .and_then(|t| t.get(tier_key))
        .and_then(|c| c.get("integrations"))
        .and_then(|arr| arr.as_array())
        .map(|arr| arr.iter().any(|v| v.as_str() == Some(integration)))
        .unwrap_or(false)
}

/// Get the daily conversation limit for a tier. Returns `None` for unlimited (-1).
pub fn conversation_limit(tier: Tier) -> Option<u32> {
    static CONFIG: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
        let raw = include_str!("access_control.json");
        serde_json::from_str(raw).expect("access_control.json must be valid JSON")
    });

    let tier_key = match tier {
        Tier::Foundation => "foundation",
        Tier::Pro => "pro",
        Tier::Elite => "elite",
    };

    let limit = CONFIG
        .get("tiers")
        .and_then(|t| t.get(tier_key))
        .and_then(|c| c.get("max_conversations_per_day"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    if limit < 0 {
        None // unlimited
    } else {
        Some(limit as u32)
    }
}

/// Usage limits for a tier. `-1` means unlimited; any other value is a cap.
///
/// Loaded from `access_control.json` so limits can be tuned without code
/// changes. Request limits count agent turns (one per user-visible agent
/// invocation); token limits count LLM input+output tokens across every
/// surface (RPC, channels, voice, cron) as recorded by the turn engine.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct TierLimits {
    pub max_agent_requests_per_day: i64,
    pub max_agent_requests_per_week: i64,
    pub max_tokens_per_week: i64,
    pub max_tokens_per_month: i64,
}

/// Read the usage limits for a tier from the embedded access control config.
pub fn tier_limits(tier: Tier) -> TierLimits {
    static CONFIG: std::sync::LazyLock<serde_json::Value> = std::sync::LazyLock::new(|| {
        let raw = include_str!("access_control.json");
        serde_json::from_str(raw).expect("access_control.json must be valid JSON")
    });

    let tier_key = match tier {
        Tier::Foundation => "foundation",
        Tier::Pro => "pro",
        Tier::Elite => "elite",
    };

    let get = |field: &str| -> i64 {
        CONFIG
            .get("tiers")
            .and_then(|t| t.get(tier_key))
            .and_then(|c| c.get(field))
            .and_then(|v| v.as_i64())
            // Missing config reads as 0 (disabled), not unlimited — a config
            // regression should fail closed, loudly, rather than silently
            // lifting every cap.
            .unwrap_or(0)
    };

    TierLimits {
        max_agent_requests_per_day: get("max_agent_requests_per_day"),
        max_agent_requests_per_week: get("max_agent_requests_per_week"),
        max_tokens_per_week: get("max_tokens_per_week"),
        max_tokens_per_month: get("max_tokens_per_month"),
    }
}

/// Result of a full subscription check against a request.
#[derive(Debug, Clone, Serialize)]
pub struct SubscriptionCheckResult {
    pub access_level: AccessLevel,
    pub tier: Option<Tier>,
    pub subscription: Option<SubscriptionRecord>,
    pub reason: String,
}

impl SubscriptionCheckResult {
    /// Construct a denial result with a reason.
    pub fn denied(reason: impl Into<String>) -> Self {
        Self {
            access_level: AccessLevel::Denied,
            tier: None,
            subscription: None,
            reason: reason.into(),
        }
    }

    /// Construct a result from a resolved subscription record.
    pub fn from_record(record: SubscriptionRecord) -> Self {
        Self {
            access_level: record.access_level,
            tier: Some(record.tier),
            reason: format!(
                "subscription {} is {}",
                record.subscription_id, record.status
            ),
            subscription: Some(record),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_access_active() {
        assert_eq!(resolve_access_level("active", None), AccessLevel::Full);
        assert_eq!(resolve_access_level("trialing", None), AccessLevel::Full);
    }

    #[test]
    fn resolve_access_canceled() {
        assert_eq!(resolve_access_level("canceled", None), AccessLevel::Denied);
    }

    #[test]
    fn resolve_access_suspended() {
        assert_eq!(
            resolve_access_level("suspended", None),
            AccessLevel::BillingOnly
        );
    }

    #[test]
    fn resolve_access_past_due_grace() {
        assert_eq!(resolve_access_level("past_due", Some(3)), AccessLevel::Full);
        assert_eq!(resolve_access_level("past_due", Some(7)), AccessLevel::Full);
    }

    #[test]
    fn resolve_access_past_due_degraded() {
        assert_eq!(
            resolve_access_level("past_due", Some(10)),
            AccessLevel::ReadOnly
        );
        assert_eq!(
            resolve_access_level("past_due", Some(14)),
            AccessLevel::ReadOnly
        );
    }

    #[test]
    fn resolve_access_past_due_suspended() {
        assert_eq!(
            resolve_access_level("past_due", Some(15)),
            AccessLevel::BillingOnly
        );
        assert_eq!(
            resolve_access_level("past_due", Some(30)),
            AccessLevel::BillingOnly
        );
    }

    #[test]
    fn access_level_permissions() {
        assert!(AccessLevel::Full.can_read());
        assert!(AccessLevel::Full.can_write());
        assert!(AccessLevel::Full.can_agent());
        assert!(AccessLevel::Full.can_admin());
        assert!(AccessLevel::Full.can_billing());

        assert!(AccessLevel::ReadOnly.can_read());
        assert!(!AccessLevel::ReadOnly.can_write());
        assert!(!AccessLevel::ReadOnly.can_agent());

        assert!(!AccessLevel::BillingOnly.can_read());
        assert!(!AccessLevel::BillingOnly.can_write());
        assert!(AccessLevel::BillingOnly.can_billing());

        assert!(!AccessLevel::Denied.can_read());
        assert!(!AccessLevel::Denied.can_write());
        assert!(!AccessLevel::Denied.can_billing());
    }

    #[test]
    fn tier_feature_gating() {
        // Foundation: no voice, no CRM
        assert!(!tier_allows_feature(Tier::Foundation, "voice_enabled"));
        assert!(!tier_allows_feature(Tier::Foundation, "crm_integration"));
        assert!(!tier_allows_feature(Tier::Foundation, "war_room"));

        // Pro: voice and CRM enabled
        assert!(tier_allows_feature(Tier::Pro, "voice_enabled"));
        assert!(tier_allows_feature(Tier::Pro, "crm_integration"));
        assert!(tier_allows_feature(Tier::Pro, "war_room"));
        assert!(!tier_allows_feature(Tier::Pro, "custom_brain_tuning"));

        // Elite: everything enabled
        assert!(tier_allows_feature(Tier::Elite, "voice_enabled"));
        assert!(tier_allows_feature(Tier::Elite, "custom_brain_tuning"));
        assert!(tier_allows_feature(Tier::Elite, "dedicated_infrastructure"));
    }

    #[test]
    fn tier_integration_gating() {
        // Foundation has basic integrations
        assert!(tier_allows_integration(Tier::Foundation, "gmail"));
        assert!(tier_allows_integration(Tier::Foundation, "telegram"));
        assert!(!tier_allows_integration(Tier::Foundation, "elevenlabs"));
        assert!(!tier_allows_integration(Tier::Foundation, "crm_native"));

        // Pro adds elevenlabs and crm_native
        assert!(tier_allows_integration(Tier::Pro, "elevenlabs"));
        assert!(tier_allows_integration(Tier::Pro, "crm_native"));
        assert!(!tier_allows_integration(Tier::Pro, "custom"));

        // Elite has everything including custom
        assert!(tier_allows_integration(Tier::Elite, "custom"));
    }

    #[test]
    fn conversation_limits() {
        assert_eq!(conversation_limit(Tier::Foundation), Some(50));
        assert_eq!(conversation_limit(Tier::Pro), Some(200));
        assert_eq!(conversation_limit(Tier::Elite), None); // unlimited
    }

    #[test]
    fn cache_roundtrip() {
        let record = SubscriptionRecord {
            subscription_id: "sub_test_123".into(),
            customer_id: "cust_abc".into(),
            agent_type: AgentType::Eden,
            tier: Tier::Pro,
            status: "active".into(),
            access_level: AccessLevel::Full,
            current_period_end: None,
            cancel_at_period_end: false,
        };

        let key = "hash_test_key";
        cache_set(key, record.clone());
        let cached = cache_get(key).expect("should hit cache");
        assert_eq!(cached.subscription_id, "sub_test_123");
        assert_eq!(cached.tier, Tier::Pro);

        invalidate_cache(key);
        assert!(cache_get(key).is_none());
    }

    #[test]
    fn cache_invalidate_by_customer() {
        let make_record = |sub_id: &str, cust_id: &str| SubscriptionRecord {
            subscription_id: sub_id.into(),
            customer_id: cust_id.into(),
            agent_type: AgentType::Crest,
            tier: Tier::Foundation,
            status: "active".into(),
            access_level: AccessLevel::Full,
            current_period_end: None,
            cancel_at_period_end: false,
        };

        cache_set("key_a", make_record("sub_1", "cust_X"));
        cache_set("key_b", make_record("sub_2", "cust_X"));
        cache_set("key_c", make_record("sub_3", "cust_Y"));

        invalidate_cache_for_customer("cust_X");

        assert!(cache_get("key_a").is_none());
        assert!(cache_get("key_b").is_none());
        assert!(cache_get("key_c").is_some()); // different customer, untouched

        // Cleanup
        flush_cache();
    }

    #[test]
    fn denied_result_has_correct_fields() {
        let result = SubscriptionCheckResult::denied("no license key");
        assert_eq!(result.access_level, AccessLevel::Denied);
        assert!(result.tier.is_none());
        assert!(result.subscription.is_none());
        assert_eq!(result.reason, "no license key");
    }
}
