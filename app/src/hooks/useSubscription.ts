import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Agent archetypes offered by CloserEdge AI. */
export type AgentType = 'eden' | 'crest' | 'forge' | 'haven' | 'lexis' | 'nora';

/** Subscription tier within an agent. */
export type SubscriptionTier = 'foundation' | 'pro' | 'elite';

/** Stripe subscription status values. */
export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'paused'
  | 'suspended';

/** Derived access level the app uses to gate features. */
export type AccessLevel = 'full' | 'grace' | 'read_only' | 'suspended' | 'none';

export interface SubscriptionAddOn {
  id: string;
  name: string;
  active: boolean;
}

export interface Subscription {
  id: string;
  agentType: AgentType;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  addOns: SubscriptionAddOn[];
  stripeCustomerId: string | null;
  /** Days past due — populated when status is 'past_due'. */
  daysPastDue: number;
}

export interface UseSubscriptionReturn {
  subscription: Subscription | null;
  tier: SubscriptionTier | null;
  status: SubscriptionStatus | null;
  accessLevel: AccessLevel;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _subCache: { data: Subscription; fetchedAt: number } | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map Stripe status + days past due to the app's access level. */
function deriveAccessLevel(sub: Subscription | null): AccessLevel {
  if (!sub) return 'none';

  switch (sub.status) {
    case 'active':
    case 'trialing':
      return 'full';
    case 'past_due': {
      // Grace: first 7 days past due. Read-only: 8-14 days. Suspended: 15+.
      if (sub.daysPastDue <= 7) return 'grace';
      if (sub.daysPastDue <= 14) return 'read_only';
      return 'suspended';
    }
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'none';
    case 'incomplete':
    case 'paused':
    case 'suspended':
      return 'suspended';
    default:
      return 'none';
  }
}

async function fetchSubscription(): Promise<Subscription | null> {
  if (_subCache && Date.now() - _subCache.fetchedAt < CACHE_TTL_MS) {
    return _subCache.data;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(
      '[useSubscription] Query error (may be expected if no subscription yet):',
      error.message
    );
    return null;
  }

  if (!data) return null;

  // Days past due is derived from the billing period end so dunning stages
  // advance on schedule even between Stripe webhook deliveries; the
  // webhook-written days_overdue column acts as a floor.
  const derivedDays =
    data.status === 'past_due' && data.current_period_end
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(data.current_period_end).getTime()) / 86_400_000)
        )
      : 0;

  const sub: Subscription = {
    id: data.id,
    agentType: data.agent_type,
    tier: data.tier,
    status: data.status,
    currentPeriodStart: data.current_period_start,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
    addOns: data.add_ons ?? [],
    stripeCustomerId: data.stripe_customer_id ?? null,
    daysPastDue: Math.max(derivedDays, data.days_overdue ?? 0),
  };

  _subCache = { data: sub, fetchedAt: Date.now() };
  return sub;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSubscription(): UseSubscriptionReturn {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    _subCache = null;
    setFetchCount(c => c + 1);
  }, []);

  // Fetch on mount and on manual refresh.
  useEffect(() => {
    mountedRef.current = true;
    setIsLoading(true);
    setError(null);

    fetchSubscription()
      .then(sub => {
        if (!mountedRef.current) return;
        setSubscription(sub);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load subscription');
      })
      .finally(() => {
        if (mountedRef.current) setIsLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [fetchCount]);

  // Refresh when the window regains focus (user returns to the app).
  useEffect(() => {
    const handleFocus = () => {
      refresh();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refresh]);

  return {
    subscription,
    tier: subscription?.tier ?? null,
    status: subscription?.status ?? null,
    accessLevel: deriveAccessLevel(subscription),
    isLoading,
    error,
    refresh,
  };
}
