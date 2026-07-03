-- CloserEdge AI — license validation RPC + webhook schema alignment
-- Supabase Migration 005
--
-- 1. Adds the columns the Stripe webhook actually writes (schema drift fix:
--    the webhook was writing days_overdue/stripe_customer_id on subscriptions
--    and `status` on agent_deployments, none of which existed in 001).
-- 2. Adds `check_license`, the SECURITY DEFINER function the Railway core
--    calls (with the anon key) to validate its deployment license. The anon
--    role gets EXECUTE on this function only — it cannot read the tables.
-- 3. Adds a usage_reports table so deployments can periodically report
--    local usage counters for admin visibility.

-- --- 1. Schema alignment ----------------------------------------------------

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS days_overdue INTEGER NOT NULL DEFAULT 0;

-- The webhook recorded dunning events keyed by Stripe ids before resolving
-- internal ids; allow both shapes.
ALTER TABLE public.dunning_events
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

ALTER TABLE public.dunning_events
  ALTER COLUMN subscription_id DROP NOT NULL;

-- Loosen the event-type CHECK to cover the events the webhook emits today.
ALTER TABLE public.dunning_events DROP CONSTRAINT IF EXISTS dunning_events_event_type_check;
ALTER TABLE public.dunning_events ADD CONSTRAINT dunning_events_event_type_check CHECK (
  event_type IN (
    'payment_failed', 'retry_scheduled', 'retry_succeeded', 'retry_failed',
    'email_sent', 'sms_sent', 'call_made',
    'grace_period_started', 'degraded_to_readonly', 'suspended', 'reactivated',
    'data_export_reminder', 'data_deletion_scheduled',
    'subscription_created', 'payment_succeeded', 'subscription_updated',
    'subscription_canceled', 'subscription_paused', 'subscription_reactivated',
    'subscription_suspended', 'deployment_paused_dunning', 'tier_changed'
  )
);

-- --- 2. License validation function -----------------------------------------

-- Called by each Railway-deployed core every ~5 minutes (cache TTL) using
-- the anon key. Returns one row; `found = false` when the hash matches no
-- active license. Also stamps license_keys.last_validated for fleet
-- monitoring.
CREATE OR REPLACE FUNCTION public.check_license(license_key_hash TEXT)
RETURNS JSONB AS $$
DECLARE
  lk RECORD;
  sub RECORD;
  overdue INTEGER;
BEGIN
  SELECT * INTO lk
  FROM public.license_keys
  WHERE key_hash = license_key_hash AND is_active = TRUE
  LIMIT 1;

  IF lk IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO sub FROM public.subscriptions WHERE id = lk.subscription_id;

  IF sub IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  UPDATE public.license_keys SET last_validated = NOW() WHERE id = lk.id;

  -- Days overdue derived from the billing period end; the webhook-written
  -- days_overdue column is a floor (covers clock skew between systems).
  overdue := GREATEST(
    COALESCE(sub.days_overdue, 0),
    COALESCE(EXTRACT(DAY FROM NOW() - sub.current_period_end)::INTEGER, 0)
  );
  IF sub.status NOT IN ('past_due', 'suspended') THEN
    overdue := 0;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'subscription_id', sub.id,
    'customer_id', sub.customer_id,
    'agent_type', sub.agent_type,
    'tier', sub.tier,
    'status', sub.status,
    'current_period_end', sub.current_period_end,
    'cancel_at_period_end', COALESCE(sub.cancel_at_period_end, false),
    'days_overdue', overdue
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The anon role may execute the check, nothing else.
REVOKE ALL ON FUNCTION public.check_license(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_license(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_license(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_license(TEXT) TO service_role;

-- --- 3. Usage reporting ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.usage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  license_key_hash TEXT NOT NULL,
  period_key TEXT NOT NULL,          -- e.g. 'day:2026-06-09', 'week:2026-W24'
  requests INTEGER NOT NULL DEFAULT 0,
  tokens_in BIGINT NOT NULL DEFAULT 0,
  tokens_out BIGINT NOT NULL DEFAULT 0,
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(license_key_hash, period_key)
);

ALTER TABLE public.usage_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_reports_own ON public.usage_reports FOR SELECT USING (
  subscription_id IN (SELECT id FROM public.subscriptions WHERE customer_id = auth.uid())
);
CREATE POLICY service_all_usage_reports ON public.usage_reports FOR ALL TO service_role USING (true);

-- Deployments report usage through a definer function (anon-executable,
-- but only able to upsert rows for a license hash that actually exists).
CREATE OR REPLACE FUNCTION public.report_usage(
  license_key_hash TEXT,
  period_key TEXT,
  requests INTEGER,
  tokens_in BIGINT,
  tokens_out BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
  lk RECORD;
BEGIN
  SELECT * INTO lk FROM public.license_keys
  WHERE key_hash = report_usage.license_key_hash AND is_active = TRUE
  LIMIT 1;

  IF lk IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.usage_reports (subscription_id, license_key_hash, period_key, requests, tokens_in, tokens_out, reported_at)
  VALUES (lk.subscription_id, report_usage.license_key_hash, report_usage.period_key, report_usage.requests, report_usage.tokens_in, report_usage.tokens_out, NOW())
  ON CONFLICT (license_key_hash, period_key) DO UPDATE SET
    requests = EXCLUDED.requests,
    tokens_in = EXCLUDED.tokens_in,
    tokens_out = EXCLUDED.tokens_out,
    reported_at = NOW();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.report_usage(TEXT, TEXT, INTEGER, BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_usage(TEXT, TEXT, INTEGER, BIGINT, BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION public.report_usage(TEXT, TEXT, INTEGER, BIGINT, BIGINT) TO service_role;
