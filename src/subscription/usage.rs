//! Local usage metering for subscription limits.
//!
//! Persists per-period counters (agent requests, LLM tokens) in a small
//! SQLite database under the workspace so limits survive restarts. Two
//! kinds of events are recorded:
//!
//! * **Agent requests** — one per agent turn, recorded by the turn engine
//!   so every surface (RPC, Telegram, voice, cron) counts identically.
//! * **LLM tokens** — input+output tokens from every provider response
//!   carrying a usage block, recorded at the same engine choke point.
//!
//! Periods are UTC-based: `day:YYYY-MM-DD`, `week:YYYY-Www` (ISO week)
//! and `month:YYYY-MM`. Writes go through a dedicated background thread
//! (fire-and-forget mpsc) so the async turn loop never blocks on disk;
//! reads open a short-lived connection per check, which is fine at the
//! one-read-per-agent-turn cadence this is used at.

use chrono::{DateTime, Datelike, Duration as ChronoDuration, TimeZone, Utc};
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};

use super::TierLimits;

/// A usage event flowing to the background writer.
#[derive(Debug, Clone, Copy)]
pub enum UsageEvent {
    /// One user-visible agent turn started.
    AgentRequest,
    /// Undo one previously-reserved agent turn (the reserve-then-check
    /// pattern in `enforce::reserve_agent_turn` refunds when the turn is
    /// refused, so blocked turns never consume quota).
    RefundAgentRequest,
    /// One provider response's token usage.
    LlmTokens { input: u64, output: u64 },
}

/// Counters for the periods relevant to limit checks.
#[derive(Debug, Clone, Copy, Default, serde::Serialize)]
pub struct UsageSnapshot {
    pub requests_today: i64,
    pub requests_this_week: i64,
    pub tokens_this_week: i64,
    pub tokens_this_month: i64,
}

/// A limit that has been exceeded, with everything the UI needs to
/// explain the situation to the customer.
#[derive(Debug, Clone, serde::Serialize)]
pub struct LimitExceeded {
    /// Which limit tripped: `daily_requests`, `weekly_requests`,
    /// `weekly_tokens`, or `monthly_tokens`.
    pub limit_type: &'static str,
    pub limit: i64,
    pub used: i64,
    /// RFC3339 UTC timestamp when the relevant period rolls over.
    pub resets_at: String,
}

/// Resolve the directory subscription state lives in (usage DB, disk-cached
/// license record).
///
/// `CLOSEREDGE_USAGE_DB_DIR` wins (tests, unusual deployments), then the
/// `OPENHUMAN_WORKSPACE` workspace, then the default workspace fallback.
pub(crate) fn subscription_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("CLOSEREDGE_USAGE_DB_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    let workspace = std::env::var("OPENHUMAN_WORKSPACE")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".openhuman")
                .join("workspace")
        });
    workspace.join("subscription")
}

fn usage_db_path() -> PathBuf {
    subscription_dir().join("usage.db")
}

fn open_db(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 5000;
         CREATE TABLE IF NOT EXISTS usage_counters (
            period_key TEXT PRIMARY KEY,
            requests   INTEGER NOT NULL DEFAULT 0,
            tokens_in  INTEGER NOT NULL DEFAULT 0,
            tokens_out INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
         );",
    )?;
    Ok(conn)
}

/// The three period keys for a given instant.
fn period_keys(now: DateTime<Utc>) -> [String; 3] {
    let iso = now.iso_week();
    [
        format!("day:{}", now.format("%Y-%m-%d")),
        format!("week:{}-W{:02}", iso.year(), iso.week()),
        format!("month:{}", now.format("%Y-%m")),
    ]
}

fn apply_event(conn: &Connection, event: UsageEvent, now: DateTime<Utc>) -> rusqlite::Result<()> {
    let (req, t_in, t_out) = match event {
        UsageEvent::AgentRequest => (1i64, 0i64, 0i64),
        UsageEvent::RefundAgentRequest => (-1i64, 0i64, 0i64),
        UsageEvent::LlmTokens { input, output } => (0, input as i64, output as i64),
    };
    let ts = now.to_rfc3339();
    // Clamp at zero: a refund that lands after a period rollover would
    // otherwise seed the new period's row at -1 (free quota).
    let insert_req = req.max(0);
    for key in period_keys(now) {
        conn.execute(
            "INSERT INTO usage_counters (period_key, requests, tokens_in, tokens_out, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(period_key) DO UPDATE SET
               requests   = MAX(requests + ?6, 0),
               tokens_in  = tokens_in + excluded.tokens_in,
               tokens_out = tokens_out + excluded.tokens_out,
               updated_at = excluded.updated_at",
            params![key, insert_req, t_in, t_out, ts, req],
        )?;
    }
    Ok(())
}

fn read_snapshot(conn: &Connection, now: DateTime<Utc>) -> rusqlite::Result<UsageSnapshot> {
    let [day, week, month] = period_keys(now);
    let mut snap = UsageSnapshot::default();
    let mut stmt = conn.prepare(
        "SELECT period_key, requests, tokens_in + tokens_out FROM usage_counters
         WHERE period_key IN (?1, ?2, ?3)",
    )?;
    let rows = stmt.query_map(params![day, week, month], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
        ))
    })?;
    for row in rows {
        let (key, requests, tokens) = row?;
        if key == day {
            snap.requests_today = requests;
        } else if key == week {
            snap.requests_this_week = requests;
            snap.tokens_this_week = tokens;
        } else if key == month {
            snap.tokens_this_month = tokens;
        }
    }
    Ok(snap)
}

// ---------------------------------------------------------------------------
// Background writer
// ---------------------------------------------------------------------------

static WRITER: OnceLock<Mutex<Sender<UsageEvent>>> = OnceLock::new();

fn writer() -> &'static Mutex<Sender<UsageEvent>> {
    WRITER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<UsageEvent>();
        std::thread::Builder::new()
            .name("subscription-usage-writer".into())
            .spawn(move || {
                let path = usage_db_path();
                let conn = match open_db(&path) {
                    Ok(c) => c,
                    Err(e) => {
                        log::error!(
                            "[subscription/usage] cannot open usage DB at {}: {e} — usage metering disabled",
                            path.display()
                        );
                        // Drain forever so senders never block or error.
                        while rx.recv().is_ok() {}
                        return;
                    }
                };
                while let Ok(event) = rx.recv() {
                    if let Err(e) = apply_event(&conn, event, Utc::now()) {
                        log::warn!("[subscription/usage] failed to record usage event: {e}");
                    }
                }
            })
            .expect("spawn usage writer thread");
        Mutex::new(tx)
    })
}

/// Record one agent turn. Fire-and-forget; never blocks.
pub fn record_agent_request() {
    if let Ok(tx) = writer().lock() {
        let _ = tx.send(UsageEvent::AgentRequest);
    }
}

/// Refund one previously-reserved agent turn. Fire-and-forget. Used by
/// `enforce::reserve_agent_turn` when the reserve-then-check pattern
/// refuses a turn that was already counted.
pub fn refund_agent_request() {
    if let Ok(tx) = writer().lock() {
        let _ = tx.send(UsageEvent::RefundAgentRequest);
    }
}

/// Atomically count one agent turn and return the post-increment snapshot.
///
/// Unlike `record_agent_request` this is a synchronous write on the calling
/// thread — the reserve-then-check pattern needs the counter to be visible
/// before the limit check runs, otherwise two concurrent turns both read
/// the pre-increment value and both slip past the cap (TOCTOU). SQLite
/// serializes the writes; whichever reservation pushes the counter over the
/// limit sees it in its own snapshot, gets refused, and is refunded.
///
/// Returns `None` when the usage DB is unavailable (metering disabled) —
/// callers treat that the same as the fire-and-forget path: allow, unmetered.
pub fn reserve_agent_request() -> Option<UsageSnapshot> {
    let path = usage_db_path();
    let now = Utc::now();
    match open_db(&path).and_then(|conn| {
        apply_event(&conn, UsageEvent::AgentRequest, now)?;
        read_snapshot(&conn, now)
    }) {
        Ok(snap) => Some(snap),
        Err(e) => {
            log::warn!("[subscription/usage] reserve failed (metering unavailable): {e}");
            None
        }
    }
}

/// Record token usage from one provider response. Fire-and-forget.
pub fn record_llm_tokens(input: u64, output: u64) {
    if input == 0 && output == 0 {
        return;
    }
    if let Ok(tx) = writer().lock() {
        let _ = tx.send(UsageEvent::LlmTokens { input, output });
    }
}

// ---------------------------------------------------------------------------
// Reads + limit checks
// ---------------------------------------------------------------------------

/// Current usage snapshot. Opens a short-lived read connection.
pub fn current_snapshot() -> UsageSnapshot {
    let path = usage_db_path();
    match open_db(&path).and_then(|conn| read_snapshot(&conn, Utc::now())) {
        Ok(snap) => snap,
        Err(e) => {
            log::warn!("[subscription/usage] snapshot read failed: {e}");
            UsageSnapshot::default()
        }
    }
}

/// One raw period counter row, as stored. Used by the usage reporter to
/// push per-period numbers (with the in/out token split intact) to the
/// `report_usage` Supabase function.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PeriodRow {
    pub period_key: String,
    pub requests: i64,
    pub tokens_in: i64,
    pub tokens_out: i64,
}

/// Raw counter rows for the current day/week/month periods. Periods with
/// no recorded usage yet are omitted.
pub fn current_period_rows() -> Vec<PeriodRow> {
    let path = usage_db_path();
    let now = Utc::now();
    let read = |conn: Connection| -> rusqlite::Result<Vec<PeriodRow>> {
        let [day, week, month] = period_keys(now);
        let mut stmt = conn.prepare(
            "SELECT period_key, requests, tokens_in, tokens_out FROM usage_counters
             WHERE period_key IN (?1, ?2, ?3)",
        )?;
        let rows = stmt.query_map(params![day, week, month], |row| {
            Ok(PeriodRow {
                period_key: row.get(0)?,
                requests: row.get(1)?,
                tokens_in: row.get(2)?,
                tokens_out: row.get(3)?,
            })
        })?;
        rows.collect()
    };
    match open_db(&path).and_then(read) {
        Ok(rows) => rows,
        Err(e) => {
            log::warn!("[subscription/usage] period rows read failed: {e}");
            Vec::new()
        }
    }
}

/// Next UTC midnight / Monday / first-of-month after `now`.
fn reset_times(now: DateTime<Utc>) -> (DateTime<Utc>, DateTime<Utc>, DateTime<Utc>) {
    let day_start = Utc
        .with_ymd_and_hms(now.year(), now.month(), now.day(), 0, 0, 0)
        .single()
        .unwrap_or(now);
    let next_day = day_start + ChronoDuration::days(1);
    let days_from_monday = now.weekday().num_days_from_monday() as i64;
    let next_week = day_start + ChronoDuration::days(7 - days_from_monday);
    let (ny, nm) = if now.month() == 12 {
        (now.year() + 1, 1)
    } else {
        (now.year(), now.month() + 1)
    };
    let next_month = Utc
        .with_ymd_and_hms(ny, nm, 1, 0, 0, 0)
        .single()
        .unwrap_or(next_day);
    (next_day, next_week, next_month)
}

/// Check a usage snapshot against tier limits. Returns the first exceeded
/// limit, or `None` when the tier is within bounds. `-1` limits are
/// unlimited; `0` limits read as "disabled" and always trip (fail closed
/// on config regressions).
pub fn check_limits(limits: &TierLimits, snap: &UsageSnapshot) -> Option<LimitExceeded> {
    let now = Utc::now();
    let (next_day, next_week, next_month) = reset_times(now);
    let over = |limit: i64, used: i64| limit >= 0 && used >= limit;

    if over(limits.max_agent_requests_per_day, snap.requests_today) {
        return Some(LimitExceeded {
            limit_type: "daily_requests",
            limit: limits.max_agent_requests_per_day,
            used: snap.requests_today,
            resets_at: next_day.to_rfc3339(),
        });
    }
    if over(limits.max_agent_requests_per_week, snap.requests_this_week) {
        return Some(LimitExceeded {
            limit_type: "weekly_requests",
            limit: limits.max_agent_requests_per_week,
            used: snap.requests_this_week,
            resets_at: next_week.to_rfc3339(),
        });
    }
    if over(limits.max_tokens_per_week, snap.tokens_this_week) {
        return Some(LimitExceeded {
            limit_type: "weekly_tokens",
            limit: limits.max_tokens_per_week,
            used: snap.tokens_this_week,
            resets_at: next_week.to_rfc3339(),
        });
    }
    if over(limits.max_tokens_per_month, snap.tokens_this_month) {
        return Some(LimitExceeded {
            limit_type: "monthly_tokens",
            limit: limits.max_tokens_per_month,
            used: snap.tokens_this_month,
            resets_at: next_month.to_rfc3339(),
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE usage_counters (
                period_key TEXT PRIMARY KEY,
                requests   INTEGER NOT NULL DEFAULT 0,
                tokens_in  INTEGER NOT NULL DEFAULT 0,
                tokens_out INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
             );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn events_roll_up_into_periods() {
        let conn = mem_conn();
        let now = Utc.with_ymd_and_hms(2026, 6, 9, 12, 0, 0).unwrap();
        apply_event(&conn, UsageEvent::AgentRequest, now).unwrap();
        apply_event(&conn, UsageEvent::AgentRequest, now).unwrap();
        apply_event(
            &conn,
            UsageEvent::LlmTokens {
                input: 1000,
                output: 500,
            },
            now,
        )
        .unwrap();

        let snap = read_snapshot(&conn, now).unwrap();
        assert_eq!(snap.requests_today, 2);
        assert_eq!(snap.requests_this_week, 2);
        assert_eq!(snap.tokens_this_week, 1500);
        assert_eq!(snap.tokens_this_month, 1500);
    }

    #[test]
    fn day_rollover_resets_daily_counter_only() {
        let conn = mem_conn();
        let monday = Utc.with_ymd_and_hms(2026, 6, 8, 23, 0, 0).unwrap();
        let tuesday = Utc.with_ymd_and_hms(2026, 6, 9, 1, 0, 0).unwrap();
        apply_event(&conn, UsageEvent::AgentRequest, monday).unwrap();

        let snap = read_snapshot(&conn, tuesday).unwrap();
        assert_eq!(snap.requests_today, 0, "new day starts at zero");
        assert_eq!(snap.requests_this_week, 1, "same ISO week accumulates");
    }

    #[test]
    fn week_boundary_is_iso_monday() {
        let conn = mem_conn();
        let sunday = Utc.with_ymd_and_hms(2026, 6, 7, 12, 0, 0).unwrap();
        let monday = Utc.with_ymd_and_hms(2026, 6, 8, 12, 0, 0).unwrap();
        apply_event(
            &conn,
            UsageEvent::LlmTokens {
                input: 100,
                output: 0,
            },
            sunday,
        )
        .unwrap();

        let snap = read_snapshot(&conn, monday).unwrap();
        assert_eq!(snap.tokens_this_week, 0, "new ISO week starts Monday");
        assert_eq!(snap.tokens_this_month, 100, "same month accumulates");
    }

    #[test]
    fn limits_trip_in_priority_order() {
        let limits = TierLimits {
            max_agent_requests_per_day: 10,
            max_agent_requests_per_week: 50,
            max_tokens_per_week: 1000,
            max_tokens_per_month: 5000,
        };
        let ok = UsageSnapshot {
            requests_today: 9,
            requests_this_week: 40,
            tokens_this_week: 900,
            tokens_this_month: 4000,
        };
        assert!(check_limits(&limits, &ok).is_none());

        let daily = UsageSnapshot {
            requests_today: 10,
            ..ok
        };
        assert_eq!(
            check_limits(&limits, &daily).unwrap().limit_type,
            "daily_requests"
        );

        let weekly_tokens = UsageSnapshot {
            tokens_this_week: 1000,
            ..ok
        };
        assert_eq!(
            check_limits(&limits, &weekly_tokens).unwrap().limit_type,
            "weekly_tokens"
        );
    }

    #[test]
    fn unlimited_and_zero_limits() {
        let unlimited = TierLimits {
            max_agent_requests_per_day: -1,
            max_agent_requests_per_week: -1,
            max_tokens_per_week: -1,
            max_tokens_per_month: -1,
        };
        let heavy = UsageSnapshot {
            requests_today: 1_000_000,
            requests_this_week: 1_000_000,
            tokens_this_week: i64::MAX / 2,
            tokens_this_month: i64::MAX / 2,
        };
        assert!(check_limits(&unlimited, &heavy).is_none());

        // 0 = disabled: fails closed even at zero usage.
        let disabled = TierLimits {
            max_agent_requests_per_day: 0,
            max_agent_requests_per_week: -1,
            max_tokens_per_week: -1,
            max_tokens_per_month: -1,
        };
        assert_eq!(
            check_limits(&disabled, &UsageSnapshot::default())
                .unwrap()
                .limit_type,
            "daily_requests"
        );
    }

    #[test]
    fn refund_decrements_and_clamps_at_zero() {
        let conn = mem_conn();
        let now = Utc.with_ymd_and_hms(2026, 6, 9, 12, 0, 0).unwrap();
        apply_event(&conn, UsageEvent::AgentRequest, now).unwrap();
        apply_event(&conn, UsageEvent::AgentRequest, now).unwrap();
        apply_event(&conn, UsageEvent::RefundAgentRequest, now).unwrap();

        let snap = read_snapshot(&conn, now).unwrap();
        assert_eq!(snap.requests_today, 1, "2 reserved - 1 refunded = 1");

        // Refunds never push a counter negative — even an unmatched refund
        // (e.g. one that lands after a period rollover).
        apply_event(&conn, UsageEvent::RefundAgentRequest, now).unwrap();
        apply_event(&conn, UsageEvent::RefundAgentRequest, now).unwrap();
        let snap = read_snapshot(&conn, now).unwrap();
        assert_eq!(snap.requests_today, 0, "clamped at zero");

        // A refund seeding a brand-new period row inserts 0, not -1.
        let next_month = Utc.with_ymd_and_hms(2026, 7, 1, 12, 0, 0).unwrap();
        apply_event(&conn, UsageEvent::RefundAgentRequest, next_month).unwrap();
        let snap = read_snapshot(&conn, next_month).unwrap();
        assert_eq!(snap.requests_today, 0, "fresh period seeds at zero");
    }

    #[test]
    fn reserve_then_check_blocks_at_exact_limit() {
        // Simulates the reserve-then-check flow: the limit check runs on the
        // PRE-reservation count (post - 1), so semantics match the old
        // check-then-record path — `limit` requests are allowed, the
        // (limit+1)th is refused.
        let conn = mem_conn();
        let now = Utc.with_ymd_and_hms(2026, 6, 9, 12, 0, 0).unwrap();
        let limits = TierLimits {
            max_agent_requests_per_day: 3,
            max_agent_requests_per_week: -1,
            max_tokens_per_week: -1,
            max_tokens_per_month: -1,
        };

        for i in 1..=3 {
            apply_event(&conn, UsageEvent::AgentRequest, now).unwrap();
            let post = read_snapshot(&conn, now).unwrap();
            let pre = UsageSnapshot {
                requests_today: post.requests_today - 1,
                requests_this_week: post.requests_this_week - 1,
                ..post
            };
            assert!(
                check_limits(&limits, &pre).is_none(),
                "request {i} of 3 should be allowed"
            );
        }

        // 4th request: reserved, then refused on the pre-count of 3.
        apply_event(&conn, UsageEvent::AgentRequest, now).unwrap();
        let post = read_snapshot(&conn, now).unwrap();
        let pre = UsageSnapshot {
            requests_today: post.requests_today - 1,
            requests_this_week: post.requests_this_week - 1,
            ..post
        };
        let exceeded = check_limits(&limits, &pre).expect("4th request must be refused");
        assert_eq!(exceeded.limit_type, "daily_requests");

        // Refund restores the counter so the customer isn't charged for it.
        apply_event(&conn, UsageEvent::RefundAgentRequest, now).unwrap();
        let snap = read_snapshot(&conn, now).unwrap();
        assert_eq!(snap.requests_today, 3);
    }

    #[test]
    fn reset_times_are_sane() {
        let tue = Utc.with_ymd_and_hms(2026, 6, 9, 15, 30, 0).unwrap();
        let (day, week, month) = reset_times(tue);
        assert_eq!(day, Utc.with_ymd_and_hms(2026, 6, 10, 0, 0, 0).unwrap());
        assert_eq!(week, Utc.with_ymd_and_hms(2026, 6, 15, 0, 0, 0).unwrap());
        assert_eq!(month, Utc.with_ymd_and_hms(2026, 7, 1, 0, 0, 0).unwrap());
    }
}
