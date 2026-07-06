//! Supabase license validation for the subscription gate.
//!
//! The Railway-deployed core is single-tenant: each deployment is bound to
//! one customer's license key via `CLOSEREDGE_LICENSE_KEY`. Validation
//! calls the `check_license` SQL function (SECURITY DEFINER, executable by
//! the anon role — see `supabase/migrations/005_license_check.sql`) so the
//! deployment only needs the public anon key, never the service-role key.
//!
//! Resolution order (mirrors `docs/subscription-gating-design.md` §2):
//! fresh cache → Supabase → stale cache (outage grace) → deny.

use super::{
    cache_get, cache_get_stale, cache_set, gating_enabled, resolve_access_level, AgentType,
    SubscriptionRecord, Tier,
};
use sha2::{Digest, Sha256};

/// How long a disk-persisted record may serve as an outage fallback. Bounds
/// how long a canceled customer could keep access by blocking the network:
/// after 72h with no successful validation, the gate denies.
const DISK_STALE_MAX_SECS: i64 = 72 * 3600;

/// Env vars the gate needs. `SUPABASE_URL`/`SUPABASE_ANON_KEY` may also be
/// provided via the `VITE_`-prefixed names the frontend uses, so Railway
/// only needs one pair configured.
pub const LICENSE_KEY_ENV: &str = "CLOSEREDGE_LICENSE_KEY";

#[derive(Debug, Clone)]
pub struct GateEnv {
    pub supabase_url: String,
    pub anon_key: String,
    pub license_key_hash: String,
}

fn env_first(names: &[&str]) -> Option<String> {
    names
        .iter()
        .filter_map(|n| std::env::var(n).ok())
        .map(|v| v.trim().to_string())
        .find(|v| !v.is_empty())
}

/// SHA-256 hex digest of a license key — matches `license_keys.key_hash`.
pub fn hash_license_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.trim().as_bytes());
    hex::encode(hasher.finalize())
}

/// Read the gate configuration from the environment. `None` when any piece
/// is missing — the middleware treats that as a misconfiguration and denies
/// (gating on + no license = no access, never fail open).
pub fn gate_env() -> Option<GateEnv> {
    let supabase_url = env_first(&["SUPABASE_URL", "VITE_SUPABASE_URL"])?;
    let anon_key = env_first(&["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"])?;
    let license_key = env_first(&[LICENSE_KEY_ENV])?;
    Some(GateEnv {
        supabase_url: supabase_url.trim_end_matches('/').to_string(),
        anon_key,
        license_key_hash: hash_license_key(&license_key),
    })
}

/// Shape returned by the `check_license` SQL function.
#[derive(Debug, serde::Deserialize)]
struct CheckLicenseRow {
    found: bool,
    #[serde(default)]
    subscription_id: Option<String>,
    #[serde(default)]
    customer_id: Option<String>,
    #[serde(default)]
    agent_type: Option<String>,
    #[serde(default)]
    tier: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    current_period_end: Option<String>,
    #[serde(default)]
    cancel_at_period_end: Option<bool>,
    #[serde(default)]
    days_overdue: Option<i64>,
}

fn agent_type_from_str(s: &str) -> AgentType {
    match s {
        "crest" => AgentType::Crest,
        "lexis" => AgentType::Lexis,
        "haven" => AgentType::Haven,
        "forge" => AgentType::Forge,
        "nora" => AgentType::Nora,
        _ => AgentType::Eden,
    }
}

/// Validate the license against Supabase. Returns `Ok(None)` when the
/// license has no active subscription; `Err` on transport failures so the
/// caller can decide whether stale-cache grace applies.
pub async fn fetch_subscription(env: &GateEnv) -> Result<Option<SubscriptionRecord>, String> {
    let url = format!("{}/rest/v1/rpc/check_license", env.supabase_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    let resp = client
        .post(&url)
        .header("apikey", &env.anon_key)
        .header("Authorization", format!("Bearer {}", env.anon_key))
        .json(&serde_json::json!({ "license_key_hash": env.license_key_hash }))
        .send()
        .await
        .map_err(|e| format!("supabase unreachable: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("supabase check_license returned {status}"));
    }

    let row: CheckLicenseRow = resp
        .json()
        .await
        .map_err(|e| format!("check_license decode: {e}"))?;

    if !row.found {
        return Ok(None);
    }

    let status_str = row.status.unwrap_or_else(|| "canceled".to_string());
    let tier = row
        .tier
        .as_deref()
        .and_then(Tier::from_str)
        .unwrap_or(Tier::Foundation);
    let access_level = resolve_access_level(&status_str, row.days_overdue);

    Ok(Some(SubscriptionRecord {
        subscription_id: row.subscription_id.unwrap_or_default(),
        customer_id: row.customer_id.unwrap_or_default(),
        agent_type: agent_type_from_str(row.agent_type.as_deref().unwrap_or("eden")),
        tier,
        status: status_str,
        access_level,
        current_period_end: row.current_period_end,
        cancel_at_period_end: row.cancel_at_period_end.unwrap_or(false),
    }))
}

// ---------------------------------------------------------------------------
// Disk-persisted cache
//
// The in-memory cache dies with the process, so a Railway cold start during
// a Supabase outage would deny every request until Supabase recovers (the
// stale-cache grace has nothing stale to read). Persisting the last
// successful validation to disk closes that gap, with a 72h cap so it can't
// become an indefinite offline bypass.
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct DiskCacheEntry {
    /// Hash the record was validated for — ignored if the configured
    /// license changes.
    license_key_hash: String,
    /// RFC3339 UTC timestamp of the successful validation.
    fetched_at: String,
    record: SubscriptionRecord,
}

fn disk_cache_path() -> std::path::PathBuf {
    super::usage::subscription_dir().join("license_cache.json")
}

fn persist_disk_cache_at(
    path: &std::path::Path,
    license_key_hash: &str,
    record: &SubscriptionRecord,
) {
    let entry = DiskCacheEntry {
        license_key_hash: license_key_hash.to_string(),
        fetched_at: chrono::Utc::now().to_rfc3339(),
        record: record.clone(),
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match serde_json::to_vec_pretty(&entry) {
        Ok(bytes) => {
            if let Err(e) = std::fs::write(path, bytes) {
                log::warn!("[subscription] failed to persist license cache: {e}");
            }
        }
        Err(e) => log::warn!("[subscription] failed to serialize license cache: {e}"),
    }
}

fn persist_disk_cache(license_key_hash: &str, record: &SubscriptionRecord) {
    persist_disk_cache_at(&disk_cache_path(), license_key_hash, record);
}

/// Load the disk-cached record for outage grace. Returns `None` when the
/// file is missing/corrupt, was written for a different license, or is
/// older than the 72h cap. For `past_due` records, days-overdue (and the
/// derived access level) is recomputed from `current_period_end` so dunning
/// keeps advancing on schedule even while Supabase is unreachable.
fn load_disk_cache_at(
    path: &std::path::Path,
    license_key_hash: &str,
) -> Option<SubscriptionRecord> {
    let bytes = std::fs::read(path).ok()?;
    let entry: DiskCacheEntry = serde_json::from_slice(&bytes).ok()?;
    if entry.license_key_hash != license_key_hash {
        return None;
    }
    let fetched_at = chrono::DateTime::parse_from_rfc3339(&entry.fetched_at).ok()?;
    let age = chrono::Utc::now().signed_duration_since(fetched_at);
    if age.num_seconds() < 0 || age.num_seconds() > DISK_STALE_MAX_SECS {
        return None;
    }

    let mut record = entry.record;
    if record.status == "past_due" {
        if let Some(end) = record
            .current_period_end
            .as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        {
            let days = chrono::Utc::now()
                .signed_duration_since(end)
                .num_days()
                .max(0);
            record.access_level = resolve_access_level(&record.status, Some(days));
        }
    }
    Some(record)
}

fn load_disk_cache(license_key_hash: &str) -> Option<SubscriptionRecord> {
    load_disk_cache_at(&disk_cache_path(), license_key_hash)
}

/// Outcome of a full resolution pass, including how it was resolved (for
/// logging and the `subscription.status` RPC).
#[derive(Debug, Clone, serde::Serialize)]
pub struct Resolution {
    pub record: Option<SubscriptionRecord>,
    /// `cache` | `supabase` | `stale_cache` | `stale_disk` | `none` | `misconfigured`
    pub source: &'static str,
}

/// Resolve the deployment's subscription: fresh cache → Supabase → stale
/// cache → none. Never panics; transport failures degrade to stale cache.
pub async fn resolve() -> Resolution {
    let Some(env) = gate_env() else {
        return Resolution {
            record: None,
            source: "misconfigured",
        };
    };

    if let Some(record) = cache_get(&env.license_key_hash) {
        return Resolution {
            record: Some(record),
            source: "cache",
        };
    }

    match fetch_subscription(&env).await {
        Ok(Some(record)) => {
            cache_set(&env.license_key_hash, record.clone());
            persist_disk_cache(&env.license_key_hash, &record);
            Resolution {
                record: Some(record),
                source: "supabase",
            }
        }
        Ok(None) => {
            // Definitive answer: this license has no active subscription.
            // Drop any disk-cached record so a canceled customer can't
            // fall back to it during a later outage.
            let _ = std::fs::remove_file(disk_cache_path());
            Resolution {
                record: None,
                source: "none",
            }
        }
        Err(e) => {
            if let Some(stale) = cache_get_stale(&env.license_key_hash) {
                log::warn!("[subscription] Supabase unreachable ({e}); using stale cached record");
                Resolution {
                    record: Some(stale),
                    source: "stale_cache",
                }
            } else if let Some(disk) = load_disk_cache(&env.license_key_hash) {
                // Cold start during an outage: no in-memory cache exists
                // yet, but a prior process validated successfully within
                // the 72h window.
                log::warn!("[subscription] Supabase unreachable ({e}); using disk-cached record");
                cache_set(&env.license_key_hash, disk.clone());
                Resolution {
                    record: Some(disk),
                    source: "stale_disk",
                }
            } else {
                log::error!(
                    "[subscription] Supabase unreachable ({e}) and no cached record — denying"
                );
                Resolution {
                    record: None,
                    source: "none",
                }
            }
        }
    }
}

/// Spawn the startup warmup: retry license validation with backoff until it
/// succeeds, so the in-memory cache is populated as soon as connectivity
/// allows rather than on the first (possibly denied) customer request.
/// No-op when gating is disabled or the gate env is incomplete.
pub fn spawn_warmup() {
    // bootstrap_core_runtime can run more than once per process (embedded
    // re-init); only ever spawn one warmup loop.
    static SPAWNED: std::sync::Once = std::sync::Once::new();
    let mut first = false;
    SPAWNED.call_once(|| first = true);
    if !first || !gating_enabled() {
        return;
    }
    let Some(env) = gate_env() else {
        log::error!(
            "[subscription] gating enabled but SUPABASE_URL / SUPABASE_ANON_KEY / \
             CLOSEREDGE_LICENSE_KEY incomplete — every gated request will be denied"
        );
        return;
    };
    tokio::spawn(async move {
        let mut delay_secs = 5u64;
        loop {
            match fetch_subscription(&env).await {
                Ok(Some(record)) => {
                    log::info!(
                        "[subscription] warmup validated license (status={}, tier={:?})",
                        record.status,
                        record.tier
                    );
                    cache_set(&env.license_key_hash, record.clone());
                    persist_disk_cache(&env.license_key_hash, &record);
                    break;
                }
                Ok(None) => {
                    // Definitive: no subscription. Nothing to warm.
                    log::warn!("[subscription] warmup: license has no active subscription");
                    break;
                }
                Err(e) => {
                    log::warn!(
                        "[subscription] warmup: Supabase unreachable ({e}); retrying in {delay_secs}s"
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
                    delay_secs = (delay_secs * 2).min(300);
                }
            }
        }
    });
}

/// Spawn the periodic usage reporter: pushes the local period counters to
/// the `report_usage` Supabase function (migration 005) every 15 minutes
/// for fleet-wide admin visibility. Best-effort — failures are logged and
/// retried at the next tick; enforcement never depends on this. No-op when
/// gating is disabled or the gate env is incomplete.
pub fn spawn_usage_reporter() {
    static SPAWNED: std::sync::Once = std::sync::Once::new();
    let mut first = false;
    SPAWNED.call_once(|| first = true);
    if !first || !gating_enabled() {
        return;
    }
    let Some(env) = gate_env() else {
        return;
    };
    tokio::spawn(async move {
        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                log::warn!("[subscription] usage reporter: http client failed: {e}");
                return;
            }
        };
        let url = format!("{}/rest/v1/rpc/report_usage", env.supabase_url);
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(15 * 60)).await;
            for row in super::usage::current_period_rows() {
                let body = serde_json::json!({
                    "license_key_hash": env.license_key_hash,
                    "period_key": row.period_key,
                    "requests": row.requests,
                    "tokens_in": row.tokens_in,
                    "tokens_out": row.tokens_out,
                });
                match client
                    .post(&url)
                    .header("apikey", &env.anon_key)
                    .header("Authorization", format!("Bearer {}", env.anon_key))
                    .json(&body)
                    .send()
                    .await
                {
                    Ok(resp) if resp.status().is_success() => {}
                    Ok(resp) => log::debug!(
                        "[subscription] usage report for {} returned {}",
                        row.period_key,
                        resp.status()
                    ),
                    Err(e) => {
                        log::debug!("[subscription] usage report failed: {e}");
                        break; // network down — wait for the next tick
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn license_hash_is_stable_and_trimmed() {
        let a = hash_license_key("ce_live_abc123");
        let b = hash_license_key("  ce_live_abc123  ");
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
        assert_ne!(a, hash_license_key("ce_live_abc124"));
    }

    #[test]
    fn agent_type_parsing_defaults_to_eden() {
        assert_eq!(agent_type_from_str("nora"), AgentType::Nora);
        assert_eq!(agent_type_from_str("unknown"), AgentType::Eden);
    }

    fn test_record(status: &str) -> SubscriptionRecord {
        SubscriptionRecord {
            subscription_id: "sub_disk".into(),
            customer_id: "cust_disk".into(),
            agent_type: AgentType::Eden,
            tier: Tier::Pro,
            status: status.into(),
            access_level: resolve_access_level(status, Some(0)),
            current_period_end: None,
            cancel_at_period_end: false,
        }
    }

    #[test]
    fn disk_cache_roundtrip_and_hash_binding() {
        let dir = std::env::temp_dir().join(format!("ce-disk-cache-{}", std::process::id()));
        let path = dir.join("license_cache.json");
        let _ = std::fs::remove_file(&path);

        persist_disk_cache_at(&path, "hash_a", &test_record("active"));

        let loaded = load_disk_cache_at(&path, "hash_a").expect("fresh entry loads");
        assert_eq!(loaded.subscription_id, "sub_disk");
        assert_eq!(loaded.tier, Tier::Pro);

        // A different license hash must not be served someone else's record.
        assert!(load_disk_cache_at(&path, "hash_b").is_none());

        let _ = std::fs::remove_file(&path);
        std::fs::remove_dir(&dir).ok();
    }

    #[test]
    fn disk_cache_expires_after_72h() {
        let dir = std::env::temp_dir().join(format!("ce-disk-expiry-{}", std::process::id()));
        let path = dir.join("license_cache.json");
        std::fs::create_dir_all(&dir).unwrap();

        let stale_entry = DiskCacheEntry {
            license_key_hash: "hash_a".into(),
            fetched_at: (chrono::Utc::now() - chrono::Duration::hours(73)).to_rfc3339(),
            record: test_record("active"),
        };
        std::fs::write(&path, serde_json::to_vec(&stale_entry).unwrap()).unwrap();
        assert!(
            load_disk_cache_at(&path, "hash_a").is_none(),
            "entries older than 72h must not serve"
        );

        let fresh_entry = DiskCacheEntry {
            license_key_hash: "hash_a".into(),
            fetched_at: (chrono::Utc::now() - chrono::Duration::hours(71)).to_rfc3339(),
            record: test_record("active"),
        };
        std::fs::write(&path, serde_json::to_vec(&fresh_entry).unwrap()).unwrap();
        assert!(
            load_disk_cache_at(&path, "hash_a").is_some(),
            "entries within 72h serve"
        );

        let _ = std::fs::remove_file(&path);
        std::fs::remove_dir(&dir).ok();
    }

    #[test]
    fn disk_cache_advances_dunning_offline() {
        // A past_due record cached 2 days ago at grace must degrade on load
        // when the billing period end says the customer is now 10 days
        // overdue — offline time still counts toward dunning.
        let dir = std::env::temp_dir().join(format!("ce-disk-dunning-{}", std::process::id()));
        let path = dir.join("license_cache.json");
        std::fs::create_dir_all(&dir).unwrap();

        let mut record = test_record("past_due");
        record.access_level = super::super::AccessLevel::Full; // grace at cache time
        record.current_period_end =
            Some((chrono::Utc::now() - chrono::Duration::days(10)).to_rfc3339());
        let entry = DiskCacheEntry {
            license_key_hash: "hash_a".into(),
            fetched_at: (chrono::Utc::now() - chrono::Duration::hours(48)).to_rfc3339(),
            record,
        };
        std::fs::write(&path, serde_json::to_vec(&entry).unwrap()).unwrap();

        let loaded = load_disk_cache_at(&path, "hash_a").expect("loads within 72h");
        assert_eq!(
            loaded.access_level,
            super::super::AccessLevel::ReadOnly,
            "10 days overdue = read-only, even though the cached level was Full"
        );

        let _ = std::fs::remove_file(&path);
        std::fs::remove_dir(&dir).ok();
    }
}
