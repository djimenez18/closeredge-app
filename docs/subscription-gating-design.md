# Subscription Gating Design

**Module:** `src/subscription/mod.rs`
**Config:** `src/subscription/access_control.json`
**Schema:** `supabase/migrations/001_subscription_schema.sql`

---

## 1. Where the Subscription Check Sits in the RPC Chain

The closeredge-core HTTP server (`src/core/jsonrpc.rs`) builds its Axum router in `build_core_http_router` with this middleware stack (outermost to innermost):

```
cors_middleware -> rpc_auth_middleware -> http_request_log_middleware -> rpc_handler
```

The subscription check middleware inserts **between `rpc_auth_middleware` and `http_request_log_middleware`**:

```
cors_middleware
  -> rpc_auth_middleware          (validates Bearer token -- existing)
  -> subscription_gate_middleware (NEW -- validates subscription status & tier)
  -> http_request_log_middleware
  -> rpc_handler -> invoke_method -> dispatch
```

**Why this position:**

- It runs AFTER bearer auth so `get_rpc_token()` is already validated -- every request reaching the subscription gate is already authenticated as a legitimate caller.
- It runs BEFORE dispatch so denied/degraded callers never reach domain handlers. The gate either passes the request through with an `AccessLevel` extension on the Axum request, or returns an error response immediately.
- Public paths (`/health`, `/schema`, `/`) are already bypassed by `rpc_auth_middleware`. The subscription gate only fires on `POST /rpc` requests.

**Implementation in `build_core_http_router`:**

```rust
// In src/core/jsonrpc.rs, update build_core_http_router:
.layer(middleware::from_fn(http_request_log_middleware))
.layer(middleware::from_fn(crate::subscription::subscription_gate_middleware))  // NEW
.layer(middleware::from_fn(crate::core::auth::rpc_auth_middleware))
.layer(middleware::from_fn(cors_middleware))
```

**Exempt methods** (always allowed regardless of subscription):
- `core.ping`
- `core.version`
- `core.events_subscribe_token`
- `openhuman.config_get_*` (read-only config)
- `openhuman.credentials_*` (login/logout flow)

---

## 2. Data Flow

```
 Inbound RPC Request
        |
        v
 [1] Extract Token
     - License key from `X-License-Key` header, OR
     - Customer ID from the JWT session (already decoded by auth middleware)
     - Hash the license key: SHA-256(key) for cache lookup
        |
        v
 [2] Cache Check (in-process HashMap behind RwLock)
     - Key: license_key_hash or customer_id
     - Hit + fresh (< 5 min old)?
       YES -> use cached SubscriptionRecord, skip to step [4]
       NO  -> proceed to step [3]
        |
        v
 [3] Supabase Fallback
     - Query: SELECT s.*, c.business_type
              FROM subscriptions s
              JOIN license_keys lk ON lk.subscription_id = s.id
              JOIN customers c ON c.id = s.customer_id
              WHERE lk.key_hash = $1 AND lk.is_active = true
     - Alternative: call check_access_level(sub_id) SQL function
     - On success: populate cache, proceed to step [4]
     - On Supabase unreachable: use stale cache if available (grace), else deny
        |
        v
 [4] Access Decision
     - Compute AccessLevel from subscription status + days_overdue:
       active/trialing        -> Full
       past_due (0-7 days)    -> Full       (grace period)
       past_due (8-14 days)   -> ReadOnly   (degraded)
       past_due (15+ days)    -> BillingOnly
       suspended              -> BillingOnly
       paused                 -> ReadOnly
       canceled               -> Denied
       no record found        -> Denied
        |
        v
 [5] Feature Gate
     - For the specific RPC method being called, map it to a feature:
       e.g. "openhuman.voice_*"         -> voice_enabled
            "openhuman.crm_*"           -> crm_integration
            "openhuman.agent_advanced_*" -> advanced_agents
     - Check access_control.json: tier_allows_feature(tier, feature)
     - If not allowed: return error with upgrade CTA
        |
        v
 [6] Pass / Reject
     - If AccessLevel permits the operation category (read/write/agent/admin):
       -> Attach SubscriptionRecord to Axum request extensions
       -> Forward to next middleware layer
     - If not:
       -> Return JSON-RPC error response:
          {
            "jsonrpc": "2.0",
            "id": <request_id>,
            "error": {
              "code": -32001,
              "message": "Subscription required",
              "data": {
                "access_level": "read_only",
                "required_level": "full",
                "upgrade_url": "https://closeredge.ai/billing"
              }
            }
          }
```

---

## 3. Cache Strategy

**Storage:** Process-global `HashMap<String, CacheEntry>` behind `std::sync::RwLock`.

**Key:** SHA-256 hash of the license key (same hash stored in the `license_keys.key_hash` column).

**TTL:** 5 minutes (300 seconds). After expiry, the next request triggers a Supabase lookup.

**Invalidation triggers:**
- Stripe webhook `customer.subscription.updated` -> `invalidate_cache_for_customer(customer_id)`
- Stripe webhook `customer.subscription.deleted` -> `invalidate_cache_for_customer(customer_id)`
- Stripe webhook `invoice.payment_succeeded` -> `invalidate_cache_for_customer(customer_id)`
- Stripe webhook `invoice.payment_failed` -> `invalidate_cache_for_customer(customer_id)`
- Manual admin override via `openhuman.admin_invalidate_subscription_cache` RPC

**Failure mode:** If Supabase is unreachable during a cache miss:
- If a stale (expired) in-memory cache entry exists, use it with a log warning. This prevents a brief Supabase outage from locking out all customers.
- Otherwise, fall back to the disk-persisted record (`<workspace>/subscription/license_cache.json`, written on every successful validation). This covers the cold-start-during-outage case where the in-memory cache died with the previous process. Disk entries are bound to the configured license hash, capped at 72 hours of age, and for `past_due` records the days-overdue (and access level) is recomputed from `current_period_end` at load time so dunning keeps advancing while offline.
- If neither exists, deny access. A brand-new customer with no validation history during an outage is an acceptable edge case -- they can retry in minutes.

**Startup warmup:** When gating is enabled, the core spawns a warmup task at boot (`supabase::spawn_warmup`) that retries license validation with exponential backoff (5s doubling to 5min) until it succeeds, so the cache is populated as soon as connectivity allows rather than on the first customer request. A definitive "no subscription" answer also deletes the disk-persisted record, so a canceled customer cannot keep access by blocking the network.

**Limit atomicity:** The turn engine's gate (`enforce::reserve_agent_turn`) uses reserve-then-check: the turn is counted synchronously in SQLite first, then limits are checked on the pre-reservation count, refunding the reservation if refused. Two concurrent turns therefore cannot both slip past a cap (the HTTP middleware's limit check remains advisory/fast-fail; the engine is authoritative). Refused turns never consume quota.

**Usage reporting:** Every 15 minutes the core pushes its local period counters to the `report_usage` Supabase function (migration 005) for fleet-wide admin visibility. This is best-effort telemetry -- enforcement never depends on it.

**Size bound:** The cache stores one entry per active license key. With a projected ceiling of 500 concurrent customers in year one, memory usage is negligible (< 1 MB).

---

## 4. Access Level Matrix

### Status-to-Access Mapping

| Subscription Status | Days Past Due | Access Level | Rationale |
|---------------------|---------------|--------------|-----------|
| `active`            | --            | `full`       | Paid and current |
| `trialing`          | --            | `full`       | Free trial, full access |
| `past_due` | 0-7 | `full` | Grace period: payment retry in progress |
| `past_due` | 8-14 | `read_only` | Degraded: can see data, cannot act |
| `past_due` | 15+ | `billing_only` | Must update payment to continue |
| `suspended`         | --            | `billing_only` | Manually suspended by admin |
| `paused`            | --            | `read_only`  | Customer-initiated pause |
| `canceled`          | --            | `denied`     | Subscription ended |
| (no record)         | --            | `denied`     | Invalid or expired license |

### Access Level Permissions

| Permission | `full` | `read_only` | `billing_only` | `denied` |
|------------|--------|-------------|-----------------|----------|
| View dashboard | Y | Y | N | N |
| View vault/data | Y | Y | N | N |
| Read conversation history | Y | Y | N | N |
| Trigger AI agents | Y | N | N | N |
| Send messages (SMS, email, Telegram) | Y | N | N | N |
| Modify settings/config | Y | N | N | N |
| CRM write operations | Y | N | N | N |
| View billing page | Y | Y | Y | N |
| Update payment method | Y | Y | Y | N |
| Cancel/modify subscription | Y | Y | Y | N |
| Access API/RPC at all | Y | Y | Y | N |

---

## 5. Tier Feature Matrix

Features available per subscription tier, as defined in `src/subscription/access_control.json`:

| Feature | Foundation | Pro | Elite |
|---------|-----------|-----|-------|
| Max conversations/day | 50 | 200 | Unlimited |
| Voice (ElevenLabs TTS) | -- | Y | Y |
| CRM integration (native) | -- | Y | Y |
| Advanced agents (multi-step) | -- | Y | Y |
| Custom brain tuning | -- | -- | Y |
| War Room (team dashboard) | -- | Y | Y |
| Audio briefings | -- | Y | Y |
| Dedicated infrastructure | -- | -- | Y |

### Integration Availability

| Integration | Foundation | Pro | Elite |
|-------------|-----------|-----|-------|
| Gmail | Y | Y | Y |
| Google Calendar | Y | Y | Y |
| Telegram | Y | Y | Y |
| SMS | Y | Y | Y |
| ElevenLabs | -- | Y | Y |
| Native CRM | -- | Y | Y |
| Custom integrations | -- | -- | Y |

### Agent-Specific Additions

Each CloserEdge archetype (Eden, Crest, Lexis, Haven, Forge, Nora) shares the same tier structure. Agent-specific feature caps are handled at the application layer:

- **Nora** (property management): per-unit tracking with overage billing (20/50/100 units for Foundation/Pro/Elite)
- **Crest** (commercial RE): deal pipeline limits scale with tier
- **Eden** (residential RE): lead volume limits scale with tier
- **Haven** (medical/dental): HIPAA compliance features gated to Pro+ only

---

## 6. Desktop App: Handling Each Access Level

The Tauri desktop app reads the `SubscriptionCheckResult` returned by the RPC server and adjusts the UI accordingly.

### `full` -- Normal Operation

- All UI surfaces active and interactive.
- No banners or restrictions.
- All sidebar items, agent triggers, and settings pages accessible.

### `read_only` -- Degraded Mode

- **Banner:** Persistent warning bar at the top of every page:
  > "Your payment is past due. Update your billing information to restore full access."
  > [Update Payment] button links to billing page.
- **Dashboard:** Visible and functional (read-only).
- **Vault/data:** Browseable, searchable, exportable.
- **Agent panel:** Greyed out with tooltip: "Agent actions are suspended while payment is past due."
- **Message compose:** Disabled with lock icon.
- **Settings:** Greyed out; individual controls show "Upgrade to modify" on hover.
- **Sidebar:** All items visible but agent/action items show a lock badge.

### `billing_only` -- Billing-Only Mode

- **Full-screen overlay** replaces the normal app content:
  > "Your subscription is suspended due to a billing issue."
  > "Update your payment method to restore access to your data and agents."
  > [Update Payment Method] -- opens Stripe billing portal
  > [Contact Support] -- opens support email/chat
  > [Export My Data] -- available during data retention window only
- **No sidebar navigation** except Billing.
- **All RPC calls** except billing-related ones are blocked client-side before they are sent.

### `denied` -- No Access

- **Full-screen redirect** to the CloserEdge website:
  > "Your subscription has ended."
  > "Visit closeredge.ai to resubscribe, or contact support to recover your data."
  > [Resubscribe] -- links to closeredge.ai/pricing
  > [Contact Support]
- **App clears local session** and stops all background polling/sync.
- **Tauri tray icon** shows "Inactive" status.

---

## 7. Railway Backend: Handling Each Access Level

The Railway-deployed closeredge-core instance returns structured JSON-RPC errors that encode the access level so the desktop app (or any RPC client) can react programmatically.

### RPC Response Shapes

**Allowed request (any access level that permits the operation):**
Standard JSON-RPC 2.0 success response -- no change from current behavior.

**Blocked by access level:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "subscription_gated",
    "data": {
      "access_level": "read_only",
      "required_level": "full",
      "subscription_status": "past_due",
      "days_overdue": 10,
      "upgrade_url": "https://closeredge.ai/billing",
      "human_message": "Your subscription is past due. Agent actions are suspended until payment is updated."
    }
  }
}
```

**Blocked by tier (feature not available):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32002,
    "message": "tier_gated",
    "data": {
      "current_tier": "foundation",
      "required_tier": "pro",
      "feature": "voice_enabled",
      "upgrade_url": "https://closeredge.ai/pricing",
      "human_message": "Voice features require a Pro or Elite subscription. Upgrade to unlock."
    }
  }
}
```

**No subscription found (denied):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32003,
    "message": "no_subscription",
    "data": {
      "access_level": "denied",
      "signup_url": "https://closeredge.ai/pricing",
      "human_message": "No active subscription found for this license key."
    }
  }
}
```

### Error Code Registry

| Code | Name | Meaning |
|------|------|---------|
| -32001 | `subscription_gated` | Request blocked by access level (past_due, suspended, etc.) |
| -32002 | `tier_gated` | Request blocked because the feature requires a higher tier |
| -32003 | `no_subscription` | No valid subscription found for the credentials |

### Backend Agent Behavior

When the subscription middleware resolves a non-`full` access level, the backend also:

1. **Pauses scheduled agents** -- cron jobs and background polling stop for degraded subscriptions. The `agent_deployments.deployment_status` is set to `paused`.
2. **Queues outbound messages** -- during `read_only`, outbound messages (SMS, email) are queued but not sent. If payment is restored within 14 days, the queue is flushed. After 14 days, the queue is discarded.
3. **Stops billing meters** -- usage-based billing (Nora per-unit, conversation counts) stops accruing during suspension.
4. **Preserves data** -- customer data in the vault, conversation history, and CRM records are preserved for 90 days after cancellation. After 90 days, a `data_deletion_scheduled` dunning event is created and the customer is notified.

---

## Implementation Sequence

1. **Phase 1:** Ship `src/subscription/mod.rs` with the cache, access level resolver, and feature gate functions. No middleware wired yet -- purely a library.
2. **Phase 2:** Add `subscription_gate_middleware` to `src/core/jsonrpc.rs` behind a feature flag (`cfg(feature = "subscription_gating")`). Wire it into `build_core_http_router`.
3. **Phase 3:** Add the Supabase client for license key validation (REST call to Supabase PostgREST). Connect cache miss path.
4. **Phase 4:** Add Stripe webhook handler at `/webhooks/stripe` that invalidates the cache on subscription changes.
5. **Phase 5:** Update the Tauri desktop app to read the new error codes and render the appropriate UI states.
6. **Phase 6:** Remove the feature flag and make subscription gating the default for Railway deployments.
