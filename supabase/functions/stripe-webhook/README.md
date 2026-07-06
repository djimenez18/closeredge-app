# stripe-webhook Edge Function

Supabase Edge Function that handles Stripe webhook events for the CloserEdge AI subscription lifecycle, including provisioning, payments, dunning, and cancellation.

## Handled Events

| Event | Action |
|---|---|
| `checkout.session.completed` | Create customer, subscription, agent deployment, license key |
| `invoice.payment_succeeded` | Reactivate subscription, restart paused agents |
| `invoice.payment_failed` | Dunning flow: grace -> read-only -> suspended -> export reminder |
| `customer.subscription.updated` | Tier upgrades/downgrades, config adjustments |
| `customer.subscription.deleted` | Cancel subscription, stop all agents |
| `customer.subscription.paused` | Pause subscription and agents |

## Dunning Timeline

```
Day 0-7    Full access (grace period). Stripe Smart Retries active.
Day 7-14   Read-only. Agents stop taking new actions, finish in-progress work.
Day 14+    Suspended. Billing page only. Cloud agents stopped.
Day 90     Data export reminder logged.
```

## Environment Variables

Set these as Supabase Edge Function secrets:

```bash
# Stripe API secret key (sk_live_... or sk_test_...)
supabase secrets set STRIPE_SECRET_KEY=sk_test_...

# Stripe webhook signing secret (whsec_...)
# Get this from the Stripe Dashboard -> Developers -> Webhooks -> Signing secret
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

# Supabase project URL and service role key (auto-set by Supabase runtime,
# but can be overridden for local dev)
supabase secrets set SUPABASE_URL=https://<project-ref>.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

> **Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available in the Supabase Edge Function runtime. You only need to set them manually for local development.

## Deployment

```bash
supabase functions deploy stripe-webhook
```

After deploying, register the webhook URL in Stripe:

1. Go to Stripe Dashboard -> Developers -> Webhooks
2. Add endpoint: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
3. Select these events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
4. Copy the signing secret and set it as `STRIPE_WEBHOOK_SECRET`.

## Local Development

Start the Supabase local dev stack:

```bash
supabase start
supabase functions serve stripe-webhook --env-file ./supabase/.env.local
```

In a separate terminal, forward Stripe events to the local function:

```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```

The `stripe listen` command will print a webhook signing secret (`whsec_...`). Use that value for `STRIPE_WEBHOOK_SECRET` in your `.env.local`.

### Trigger test events

```bash
# Simulate a successful checkout
stripe trigger checkout.session.completed

# Simulate a failed payment
stripe trigger invoice.payment_failed

# Simulate a subscription upgrade
stripe trigger customer.subscription.updated
```

## Database Tables

This function writes to:

- **customers** -- Customer records keyed by `stripe_customer_id`
- **subscriptions** -- Subscription state, tier, license key
- **agent_deployments** -- Running/paused/stopped agent deployment state
- **dunning_events** -- Audit log of every webhook-driven state change

See `supabase/migrations/` for the table schemas.

## Error Handling

- Signature verification failures return **400** so Stripe retries.
- Application-level errors return **200** to prevent infinite retries on unrecoverable failures. Errors are logged to the function runtime console.
- All state mutations are logged to `dunning_events` for audit and debugging.
