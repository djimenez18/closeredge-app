import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

// Service-role client bypasses RLS for direct DB writes.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Dunning thresholds (days) — keep in sync with src/subscription/mod.rs
// (resolve_access_level) and supabase/migrations/001 check_access_level.
// ---------------------------------------------------------------------------
const GRACE_PERIOD_DAYS = 7; // Day 0-7:  full access, Smart Retries active
const READONLY_DAYS = 14; //    Day 7-14: read-only, agents finish in-progress
const DATA_EXPORT_REMINDER_DAYS = 90;

const VALID_TIERS = new Set(["foundation", "pro", "elite"]);
const VALID_AGENT_TYPES = new Set([
  "eden",
  "crest",
  "lexis",
  "haven",
  "forge",
  "nora",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize price/subscription metadata into a schema-valid tier. */
function normalizeTier(raw: string | undefined | null): string {
  const tier = (raw ?? "").toLowerCase();
  if (VALID_TIERS.has(tier)) return tier;
  if (tier === "starter") return "foundation"; // legacy price metadata
  return "foundation";
}

/** Normalize price/subscription metadata into a schema-valid agent type. */
function normalizeAgentType(raw: string | undefined | null): string {
  const agent = (raw ?? "").toLowerCase();
  return VALID_AGENT_TYPES.has(agent) ? agent : "eden";
}

/** Persist an event to dunning_events for audit / timeline. */
async function logDunningEvent(
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
  subscriptionRowId: string | null = null,
): Promise<void> {
  const { error } = await supabase.from("dunning_events").insert({
    subscription_id: subscriptionRowId,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    event_type: eventType,
    metadata,
  });
  if (error) {
    console.error("[dunning_events] insert failed:", error);
  }
}

/** Compute days between two epoch-seconds timestamps. */
function daysBetween(startEpoch: number, endEpoch: number): number {
  return Math.floor((endEpoch - startEpoch) / 86_400);
}

/** Generate a URL-safe license key (shown once to the customer). */
function generateLicenseKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .replace(/(.{8})/g, "$1-")
    .slice(0, -1) // remove trailing dash
    .toUpperCase();
}

/** SHA-256 hex digest — matches license_keys.key_hash and the Rust core's
 * hash_license_key (which trims before hashing). */
async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Look up our internal subscription row by Stripe subscription id. */
async function findSubscriptionRow(
  stripeSubscriptionId: string,
): Promise<{ id: string; status: string; customer_id: string } | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("id, status, customer_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  return data ?? null;
}

/** Update deployment_status for all deployments of a subscription row. */
async function setDeploymentStatus(
  subscriptionRowId: string,
  fromStatuses: string[],
  toStatus: string,
): Promise<void> {
  const { error } = await supabase
    .from("agent_deployments")
    .update({ deployment_status: toStatus })
    .eq("subscription_id", subscriptionRowId)
    .in("deployment_status", fromStatuses);
  if (error) {
    console.error(
      `[agent_deployments] ${fromStatuses.join("/")} -> ${toStatus} failed:`,
      error,
    );
  }
}

/**
 * Resolve the internal customers.id for a checkout session.
 *
 * The checkout link should set `client_reference_id` to the Supabase auth
 * user id (customers.id). Fall back to matching contact_email for sessions
 * created without it.
 */
async function resolveCustomerId(
  session: Stripe.Checkout.Session,
  stripeCustomerId: string,
  email: string,
): Promise<string | null> {
  if (session.client_reference_id) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("id", session.client_reference_id)
      .maybeSingle();
    if (data) return data.id;
  }
  if (email) {
    const { data } = await supabase
      .from("customers")
      .select("id")
      .eq("contact_email", email)
      .maybeSingle();
    if (data) return data.id;
  }
  // Last resort: a customer row previously linked to this Stripe customer.
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

/**
 * checkout.session.completed
 * A brand-new subscription has been created through Stripe Checkout.
 *
 * Precondition: the customer signed up in the app first (Supabase auth +
 * customers row, created by useAuth.signUp). The checkout link must carry
 * client_reference_id = auth user id; email match is the fallback.
 */
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? "";
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as Stripe.Subscription)?.id ?? "";
  const customerEmail = session.customer_details?.email ?? "";

  // Fetch full subscription to get plan / tier metadata.
  const subscription = await stripe.subscriptions.retrieve(
    stripeSubscriptionId,
  );
  const tier = normalizeTier(
    subscription.metadata?.tier ??
      subscription.items.data[0]?.price?.metadata?.tier,
  );
  const agentType = normalizeAgentType(
    subscription.metadata?.archetype ??
      subscription.metadata?.agent_type ??
      subscription.items.data[0]?.price?.metadata?.archetype ??
      subscription.items.data[0]?.price?.metadata?.agent_type,
  );

  // 1. Resolve the internal customer (created at app sign-up) and link the
  //    Stripe customer id to it.
  const customerId = await resolveCustomerId(
    session,
    stripeCustomerId,
    customerEmail,
  );
  if (!customerId) {
    console.error(
      `[checkout.session.completed] No customers row for session ${session.id} ` +
        `(client_reference_id=${session.client_reference_id}, email=${customerEmail}). ` +
        `Customer must sign up in the app before checkout.`,
    );
    await logDunningEvent(
      stripeCustomerId,
      stripeSubscriptionId,
      "subscription_created",
      {
        error: "customer_row_not_found",
        email: customerEmail,
        client_reference_id: session.client_reference_id,
      },
    );
    return;
  }

  const { error: custErr } = await supabase
    .from("customers")
    .update({ stripe_customer_id: stripeCustomerId })
    .eq("id", customerId);
  if (custErr) console.error("[customers] stripe link failed:", custErr);

  // 2. Create subscription record (idempotent on stripe_subscription_id).
  const { data: subRow, error: subErr } = await supabase
    .from("subscriptions")
    .upsert(
      {
        customer_id: customerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_customer_id: stripeCustomerId,
        stripe_price_id: subscription.items.data[0]?.price?.id ?? null,
        status: "active",
        tier,
        agent_type: agentType,
        days_overdue: 0,
        current_period_start: new Date(
          subscription.current_period_start * 1000,
        ).toISOString(),
        current_period_end: new Date(
          subscription.current_period_end * 1000,
        ).toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    )
    .select("id")
    .single();
  if (subErr || !subRow) {
    console.error("[subscriptions] upsert failed:", subErr);
    return;
  }

  // 3. Issue a license key. Only the SHA-256 hash is stored in
  //    license_keys; the plaintext lives in the deployment config so the
  //    customer (and the provisioning admin) can retrieve it.
  const licenseKey = generateLicenseKey();
  const keyHash = await sha256Hex(licenseKey);
  const { error: lkErr } = await supabase.from("license_keys").insert({
    subscription_id: subRow.id,
    key_hash: keyHash,
    is_active: true,
  });
  if (lkErr) console.error("[license_keys] insert failed:", lkErr);

  // 4. Provision agent deployment record (Railway provisioning reads this).
  const { error: deployErr } = await supabase.from("agent_deployments").insert(
    {
      subscription_id: subRow.id,
      agent_type: agentType,
      deployment_mode: tier === "elite" ? "dedicated" : "shared",
      deployment_status: "provisioning",
      config: {
        tier,
        agent_type: agentType,
        license_key: licenseKey,
        provisioned_at: new Date().toISOString(),
      },
    },
  );
  if (deployErr) console.error("[agent_deployments] insert failed:", deployErr);

  // 5. Log event (never the plaintext license key).
  await logDunningEvent(
    stripeCustomerId,
    stripeSubscriptionId,
    "subscription_created",
    { tier, agent_type: agentType, email: customerEmail },
    subRow.id,
  );

  console.log(
    `[checkout.session.completed] Provisioned subscription ${stripeSubscriptionId} ` +
      `for customer ${customerId} (tier=${tier}, agent=${agentType})`,
  );
}

/**
 * invoice.payment_succeeded
 * A recurring (or first) invoice was paid successfully.
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer as Stripe.Customer)?.id ?? "";
  const stripeSubscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : (invoice.subscription as Stripe.Subscription)?.id ?? "";

  if (!stripeSubscriptionId) return; // one-off invoice, skip

  const existing = await findSubscriptionRow(stripeSubscriptionId);
  const wasDegraded =
    existing?.status === "past_due" || existing?.status === "suspended";

  // Update subscription back to active and clear dunning state.
  const { error: subErr } = await supabase
    .from("subscriptions")
    .update({
      status: "active",
      days_overdue: 0,
      suspended_at: null,
    })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (subErr) console.error("[subscriptions] update failed:", subErr);

  // Restart agent deployments that were paused/stopped during dunning.
  if (existing && wasDegraded) {
    await setDeploymentStatus(existing.id, ["paused", "stopped"], "running");
    await logDunningEvent(
      stripeCustomerId,
      stripeSubscriptionId,
      "subscription_reactivated",
      { previous_status: existing.status, invoice_id: invoice.id },
      existing.id,
    );
    console.log(
      `[invoice.payment_succeeded] Reactivated subscription ${stripeSubscriptionId} ` +
        `(was ${existing.status})`,
    );
  }

  await logDunningEvent(
    stripeCustomerId,
    stripeSubscriptionId,
    "payment_succeeded",
    {
      invoice_id: invoice.id,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
    },
    existing?.id ?? null,
  );
}

/**
 * invoice.payment_failed
 * A payment attempt failed. This drives the dunning flow:
 *   Day 0-7:  grace period (full access, Smart Retries)
 *   Day 7-14: read-only (agents stop taking new actions)
 *   Day 14+:  suspended (billing page only, cloud agents stopped)
 *   Day 90:   data export reminder
 *
 * Note: stage advancement is also computed server-side at access-check time
 * (check_license derives days_overdue from current_period_end), so access
 * degrades on schedule even if Stripe's retry cadence is sparse. This
 * handler mirrors the state into the DB and pauses/stops deployments.
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer as Stripe.Customer)?.id ?? "";
  const stripeSubscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : (invoice.subscription as Stripe.Subscription)?.id ?? "";

  if (!stripeSubscriptionId) return;

  const existing = await findSubscriptionRow(stripeSubscriptionId);

  // Determine how many days overdue.
  const periodEnd = invoice.period_end ?? invoice.created;
  const now = Math.floor(Date.now() / 1000);
  const daysOverdue = Math.max(0, daysBetween(periodEnd, now));

  // Update subscription to past_due (Stripe sets this too, but we mirror it).
  const { error: subErr } = await supabase
    .from("subscriptions")
    .update({
      status: "past_due",
      days_overdue: daysOverdue,
    })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (subErr) console.error("[subscriptions] update failed:", subErr);

  await logDunningEvent(
    stripeCustomerId,
    stripeSubscriptionId,
    "payment_failed",
    {
      invoice_id: invoice.id,
      days_overdue: daysOverdue,
      attempt_count: invoice.attempt_count,
    },
    existing?.id ?? null,
  );

  // Day 7-14: read-only — pause agent deployments.
  if (
    existing &&
    daysOverdue > GRACE_PERIOD_DAYS &&
    daysOverdue <= READONLY_DAYS
  ) {
    await setDeploymentStatus(existing.id, ["running"], "paused");
    await logDunningEvent(
      stripeCustomerId,
      stripeSubscriptionId,
      "deployment_paused_dunning",
      { days_overdue: daysOverdue },
      existing.id,
    );
    console.log(
      `[invoice.payment_failed] Paused deployments for ${stripeSubscriptionId} ` +
        `(${daysOverdue} days overdue)`,
    );
  }

  // Day 14+: suspended — stop everything.
  if (daysOverdue > READONLY_DAYS) {
    const { error: subSuspErr } = await supabase
      .from("subscriptions")
      .update({
        status: "suspended",
        suspended_at: new Date().toISOString(),
        days_overdue: daysOverdue,
      })
      .eq("stripe_subscription_id", stripeSubscriptionId);
    if (subSuspErr) console.error("[subscriptions] suspend failed:", subSuspErr);

    if (existing) {
      await setDeploymentStatus(existing.id, ["running", "paused"], "stopped");
      await logDunningEvent(
        stripeCustomerId,
        stripeSubscriptionId,
        "subscription_suspended",
        { days_overdue: daysOverdue },
        existing.id,
      );
    }
    console.log(
      `[invoice.payment_failed] Suspended subscription ${stripeSubscriptionId} ` +
        `(${daysOverdue} days overdue)`,
    );
  }

  // Day 90: log data export reminder.
  if (daysOverdue >= DATA_EXPORT_REMINDER_DAYS) {
    await logDunningEvent(
      stripeCustomerId,
      stripeSubscriptionId,
      "data_export_reminder",
      { days_overdue: daysOverdue },
      existing?.id ?? null,
    );
  }
}

/**
 * customer.subscription.updated
 * Handles tier upgrades, downgrades, and other subscription changes.
 */
async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer as Stripe.Customer)?.id ?? "";
  const stripeSubscriptionId = subscription.id;

  const newTier = normalizeTier(
    subscription.metadata?.tier ??
      subscription.items.data[0]?.price?.metadata?.tier,
  );
  const newAgentType = normalizeAgentType(
    subscription.metadata?.archetype ??
      subscription.metadata?.agent_type ??
      subscription.items.data[0]?.price?.metadata?.archetype ??
      subscription.items.data[0]?.price?.metadata?.agent_type,
  );
  // Stripe statuses not in our schema enum (unpaid, incomplete*) map to
  // suspended — payment is required either way.
  const stripeStatus = subscription.status;
  const newStatus = [
    "trialing",
    "active",
    "past_due",
    "canceled",
    "paused",
  ].includes(stripeStatus)
    ? stripeStatus
    : "suspended";

  // Fetch existing record to detect tier changes.
  const { data: existingSub } = await supabase
    .from("subscriptions")
    .select("id, tier, agent_type, status")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  const tierChanged = existingSub && existingSub.tier !== newTier;
  const previousTier = existingSub?.tier ?? null;

  const { error: subErr } = await supabase
    .from("subscriptions")
    .update({
      status: newStatus,
      tier: newTier,
      agent_type: newAgentType,
      days_overdue: newStatus === "active" ? 0 : undefined,
      current_period_start: new Date(
        subscription.current_period_start * 1000,
      ).toISOString(),
      current_period_end: new Date(
        subscription.current_period_end * 1000,
      ).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (subErr) console.error("[subscriptions] update failed:", subErr);

  // Restart deployments when a paused or degraded subscription becomes active
  // again (e.g. Stripe pause-collection resumed, or payment retried
  // successfully and Stripe fires subscription.updated before invoice.payment_succeeded).
  const wasInactive = existingSub &&
    ["paused", "past_due", "suspended"].includes(existingSub.status);
  if (existingSub && wasInactive && newStatus === "active") {
    await setDeploymentStatus(existingSub.id, ["paused", "stopped"], "running");
    await logDunningEvent(
      stripeCustomerId,
      stripeSubscriptionId,
      "subscription_reactivated",
      { previous_status: existingSub.status, trigger: "subscription_updated" },
      existingSub.id,
    );
    console.log(
      `[customer.subscription.updated] Reactivated deployments for ${stripeSubscriptionId} ` +
        `(was ${existingSub.status})`,
    );
  }

  if (existingSub && tierChanged) {
    const { error: deployErr } = await supabase
      .from("agent_deployments")
      .update({
        config: {
          tier: newTier,
          agent_type: newAgentType,
          upgraded_at: new Date().toISOString(),
          previous_tier: previousTier,
        },
      })
      .eq("subscription_id", existingSub.id);
    if (deployErr)
      console.error("[agent_deployments] config update failed:", deployErr);

    await logDunningEvent(
      stripeCustomerId,
      stripeSubscriptionId,
      "tier_changed",
      {
        previous_tier: previousTier,
        new_tier: newTier,
        agent_type: newAgentType,
      },
      existingSub.id,
    );
    console.log(
      `[customer.subscription.updated] Tier change ${previousTier} -> ${newTier} ` +
        `for ${stripeSubscriptionId}`,
    );
  } else {
    await logDunningEvent(
      stripeCustomerId,
      stripeSubscriptionId,
      "subscription_updated",
      {
        status: newStatus,
        tier: newTier,
        cancel_at_period_end: subscription.cancel_at_period_end,
      },
      existingSub?.id ?? null,
    );
  }
}

/**
 * customer.subscription.deleted
 * Subscription has been canceled (either immediately or at period end).
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer as Stripe.Customer)?.id ?? "";
  const stripeSubscriptionId = subscription.id;

  const existing = await findSubscriptionRow(stripeSubscriptionId);

  const { error: subErr } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (subErr) console.error("[subscriptions] cancel update failed:", subErr);

  if (existing) {
    await setDeploymentStatus(
      existing.id,
      ["provisioning", "running", "paused"],
      "stopped",
    );
    // Deactivate license keys so the deployment denies on next check.
    const { error: lkErr } = await supabase
      .from("license_keys")
      .update({ is_active: false })
      .eq("subscription_id", existing.id);
    if (lkErr) console.error("[license_keys] deactivate failed:", lkErr);
  }

  await logDunningEvent(
    stripeCustomerId,
    stripeSubscriptionId,
    "subscription_canceled",
    {
      canceled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : new Date().toISOString(),
      cancel_reason: subscription.cancellation_details?.reason ?? "unknown",
    },
    existing?.id ?? null,
  );

  console.log(
    `[customer.subscription.deleted] Canceled subscription ${stripeSubscriptionId}`,
  );
}

/**
 * customer.subscription.paused
 * Subscription has been paused (Stripe pause collection feature).
 */
async function handleSubscriptionPaused(
  subscription: Stripe.Subscription,
): Promise<void> {
  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer as Stripe.Customer)?.id ?? "";
  const stripeSubscriptionId = subscription.id;

  const existing = await findSubscriptionRow(stripeSubscriptionId);

  const { error: subErr } = await supabase
    .from("subscriptions")
    .update({ status: "paused" })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (subErr) console.error("[subscriptions] pause update failed:", subErr);

  if (existing) {
    await setDeploymentStatus(existing.id, ["running"], "paused");
  }

  await logDunningEvent(
    stripeCustomerId,
    stripeSubscriptionId,
    "subscription_paused",
    { paused_at: new Date().toISOString() },
    existing?.id ?? null,
  );

  console.log(
    `[customer.subscription.paused] Paused subscription ${stripeSubscriptionId}`,
  );
}

// ---------------------------------------------------------------------------
// Main HTTP Handler
// ---------------------------------------------------------------------------
serve(async (req: Request): Promise<Response> => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response(
      JSON.stringify({ error: "Missing stripe-signature header" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  let event: Stripe.Event;
  const body = await req.text();

  // ------------------------------------------------------------------
  // Verify webhook signature
  // ------------------------------------------------------------------
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[stripe-webhook] Signature verification failed: ${message}`);
    return new Response(
      JSON.stringify({
        error: `Webhook signature verification failed: ${message}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[stripe-webhook] Received event: ${event.type} (${event.id})`);

  // ------------------------------------------------------------------
  // Route event to handler
  // ------------------------------------------------------------------
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;

      case "customer.subscription.paused":
        await handleSubscriptionPaused(
          event.data.object as Stripe.Subscription,
        );
        break;

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true, type: event.type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[stripe-webhook] Error handling ${event.type}: ${message}`);

    // Return 200 to prevent Stripe from retrying on application errors.
    // The error is logged; retrying the same payload would produce the same failure.
    return new Response(
      JSON.stringify({
        received: true,
        type: event.type,
        processing_error: message,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
