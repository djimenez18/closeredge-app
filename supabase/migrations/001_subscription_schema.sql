-- CloserEdge AI Subscription System
-- Supabase Migration 001

-- Customers table (extends Supabase auth.users)
CREATE TABLE public.customers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  business_name TEXT NOT NULL,
  business_type TEXT CHECK (business_type IN ('residential_real_estate', 'commercial_real_estate', 'legal', 'healthcare', 'home_services', 'property_management')),
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table (source of truth synced from Stripe)
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  agent_type TEXT NOT NULL CHECK (agent_type IN ('eden', 'crest', 'lexis', 'haven', 'forge', 'nora')),
  tier TEXT NOT NULL CHECK (tier IN ('foundation', 'pro', 'elite')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled', 'paused')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  setup_fee_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active add-ons per subscription
CREATE TABLE public.subscription_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  addon_type TEXT NOT NULL CHECK (addon_type IN ('voice', 'mentor', 'mls_data', 'social_autopilot', 'seasonal_campaigns', 'review_automation', 'investor_reporting')),
  stripe_subscription_item_id TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subscription_id, addon_type)
);

-- Agent deployments (tracks Railway instances)
CREATE TABLE public.agent_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  deployment_mode TEXT NOT NULL DEFAULT 'shared' CHECK (deployment_mode IN ('shared', 'dedicated')),
  railway_service_id TEXT,
  deployment_status TEXT NOT NULL DEFAULT 'provisioning' CHECK (deployment_status IN ('provisioning', 'running', 'paused', 'stopped', 'failed')),
  core_rpc_url TEXT,
  core_token_hash TEXT,
  config JSONB DEFAULT '{}',
  last_health_check TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dunning events (tracks payment failure handling)
CREATE TABLE public.dunning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'payment_failed', 'retry_scheduled', 'retry_succeeded', 'retry_failed',
    'email_sent', 'sms_sent', 'call_made',
    'grace_period_started', 'degraded_to_readonly', 'suspended', 'reactivated',
    'data_export_reminder', 'data_deletion_scheduled'
  )),
  stripe_invoice_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- License keys (for desktop app authentication)
CREATE TABLE public.license_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  last_validated TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nora unit tracking (property management has per-unit overage)
CREATE TABLE public.nora_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  unit_count INTEGER NOT NULL DEFAULT 0,
  tier_cap INTEGER NOT NULL, -- 20 for foundation, 50 for pro, 100 for elite
  overage_rate_cents INTEGER DEFAULT 200, -- $2/unit/mo
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_subscriptions_customer ON public.subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_stripe ON public.subscriptions(stripe_subscription_id);
CREATE INDEX idx_deployments_subscription ON public.agent_deployments(subscription_id);
CREATE INDEX idx_dunning_subscription ON public.dunning_events(subscription_id);
CREATE INDEX idx_dunning_created ON public.dunning_events(created_at);

-- Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dunning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nora_units ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Customers can only see their own data
CREATE POLICY customers_own ON public.customers FOR ALL USING (id = auth.uid());
CREATE POLICY subscriptions_own ON public.subscriptions FOR ALL USING (customer_id = auth.uid());
CREATE POLICY addons_own ON public.subscription_addons FOR ALL USING (
  subscription_id IN (SELECT id FROM public.subscriptions WHERE customer_id = auth.uid())
);
CREATE POLICY deployments_own ON public.agent_deployments FOR ALL USING (
  subscription_id IN (SELECT id FROM public.subscriptions WHERE customer_id = auth.uid())
);
CREATE POLICY dunning_own ON public.dunning_events FOR SELECT USING (
  subscription_id IN (SELECT id FROM public.subscriptions WHERE customer_id = auth.uid())
);
CREATE POLICY license_own ON public.license_keys FOR ALL USING (
  subscription_id IN (SELECT id FROM public.subscriptions WHERE customer_id = auth.uid())
);
CREATE POLICY nora_units_own ON public.nora_units FOR ALL USING (
  subscription_id IN (SELECT id FROM public.subscriptions WHERE customer_id = auth.uid())
);

-- Service role policies (for webhooks and backend)
CREATE POLICY service_all_customers ON public.customers FOR ALL TO service_role USING (true);
CREATE POLICY service_all_subscriptions ON public.subscriptions FOR ALL TO service_role USING (true);
CREATE POLICY service_all_addons ON public.subscription_addons FOR ALL TO service_role USING (true);
CREATE POLICY service_all_deployments ON public.agent_deployments FOR ALL TO service_role USING (true);
CREATE POLICY service_all_dunning ON public.dunning_events FOR ALL TO service_role USING (true);
CREATE POLICY service_all_licenses ON public.license_keys FOR ALL TO service_role USING (true);
CREATE POLICY service_all_nora ON public.nora_units FOR ALL TO service_role USING (true);

-- Function to check subscription access level
CREATE OR REPLACE FUNCTION public.check_access_level(sub_id UUID)
RETURNS TEXT AS $$
DECLARE
  sub RECORD;
  days_overdue INTEGER;
BEGIN
  SELECT * INTO sub FROM public.subscriptions WHERE id = sub_id;

  IF sub IS NULL THEN RETURN 'denied'; END IF;
  IF sub.status = 'active' OR sub.status = 'trialing' THEN RETURN 'full'; END IF;
  IF sub.status = 'canceled' THEN RETURN 'denied'; END IF;
  IF sub.status = 'suspended' THEN RETURN 'billing_only'; END IF;

  IF sub.status = 'past_due' THEN
    days_overdue := EXTRACT(DAY FROM NOW() - sub.current_period_end);
    IF days_overdue <= 7 THEN RETURN 'full'; END IF;        -- Grace period
    IF days_overdue <= 14 THEN RETURN 'read_only'; END IF;  -- Degraded
    RETURN 'billing_only';                                    -- Suspended
  END IF;

  RETURN 'denied';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER deployments_updated_at BEFORE UPDATE ON public.agent_deployments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
