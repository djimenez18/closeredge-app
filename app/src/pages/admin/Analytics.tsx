/**
 * Analytics -- admin analytics dashboard.
 *
 * Charts:
 *   - MRR over time (line)
 *   - Clients by agent type (bar)
 *   - Clients by tier (donut)
 *   - Churn rate
 *   - Revenue by agent type (stacked bar)
 *   - Top add-ons by adoption (horizontal bar)
 *   - Dunning funnel (funnel chart)
 *
 * Uses the SimpleChart SVG components -- no external charting library.
 */

import { useEffect, useMemo, useState } from 'react';

import { supabase } from '../../lib/supabase';
import {
  BarChart,
  DonutChart,
  FunnelChart,
  HorizontalBarChart,
  LineChart,
  StackedBarChart,
  type DataPoint,
  type FunnelStep,
  type StackedBarGroup,
} from './charts/SimpleChart';

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

const PRICING: Record<string, Record<string, number>> = {
  eden: { foundation: 300, pro: 500, elite: 750 },
  crest: { foundation: 500, pro: 800, elite: 1200 },
  lexis: { foundation: 500, pro: 800, elite: 1200 },
  haven: { foundation: 500, pro: 750, elite: 1000 },
  forge: { foundation: 300, pro: 500, elite: 700 },
  nora: { foundation: 250, pro: 400, elite: 600 },
};

const AGENT_LABELS: Record<string, string> = {
  eden: 'Eden',
  crest: 'Crest',
  forge: 'Forge',
  haven: 'Haven',
  lexis: 'Lexis',
  nora: 'Nora',
};

const AGENT_COLORS: Record<string, string> = {
  eden: '#7C3AED',
  crest: '#2563EB',
  forge: '#F59E0B',
  haven: '#10B981',
  lexis: '#EC4899',
  nora: '#14B8A6',
};

const TIER_COLORS: Record<string, string> = {
  foundation: '#7C3AED',
  pro: '#2563EB',
  elite: '#F59E0B',
};

const ADDON_LABELS: Record<string, string> = {
  voice: 'Voice',
  mentor: 'Mentor',
  mls_data: 'MLS Data',
  social_autopilot: 'Social',
  seasonal_campaigns: 'Campaigns',
  review_automation: 'Reviews',
  investor_reporting: 'Investor',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubRow {
  id: string;
  agent_type: string;
  tier: string;
  status: string;
  created_at: string;
  canceled_at: string | null;
}

interface AddonRow {
  addon_type: string;
  active: boolean;
}

interface DunningRow {
  event_type: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Analytics() {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [dunning, setDunning] = useState<DunningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [subsRes, addonsRes, dunningRes] = await Promise.all([
          supabase
            .from('subscriptions')
            .select('id, agent_type, tier, status, created_at, canceled_at')
            .order('created_at', { ascending: true }),
          supabase.from('subscription_addons').select('addon_type, active'),
          supabase
            .from('dunning_events')
            .select('event_type, created_at')
            .order('created_at', { ascending: true }),
        ]);

        if (subsRes.error) throw subsRes.error;
        if (addonsRes.error) throw addonsRes.error;
        if (dunningRes.error) throw dunningRes.error;

        if (cancelled) return;

        setSubs(subsRes.data ?? []);
        setAddons(addonsRes.data ?? []);
        setDunning(dunningRes.data ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Derived data ----

  const activeSubs = useMemo(() => subs.filter(s => s.status === 'active' || s.status === 'trialing'), [subs]);

  // MRR over time (monthly buckets)
  const mrrOverTime: DataPoint[] = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const s of subs) {
      const d = new Date(s.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (s.status === 'active' || s.status === 'trialing') {
        const price = PRICING[s.agent_type]?.[s.tier] ?? 0;
        buckets.set(key, (buckets.get(key) ?? 0) + price);
      }
    }
    // Accumulate
    let cumulative = 0;
    const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return sorted.map(([month, val]) => {
      cumulative += val;
      return { label: month, value: cumulative };
    });
  }, [subs]);

  // Clients by agent type
  const clientsByAgent: DataPoint[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of activeSubs) {
      counts[s.agent_type] = (counts[s.agent_type] ?? 0) + 1;
    }
    return Object.keys(AGENT_LABELS).map(key => ({
      label: AGENT_LABELS[key],
      value: counts[key] ?? 0,
      color: AGENT_COLORS[key],
    }));
  }, [activeSubs]);

  // Clients by tier
  const clientsByTier: DataPoint[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of activeSubs) {
      counts[s.tier] = (counts[s.tier] ?? 0) + 1;
    }
    return ['foundation', 'pro', 'elite'].map(t => ({
      label: t.charAt(0).toUpperCase() + t.slice(1),
      value: counts[t] ?? 0,
      color: TIER_COLORS[t],
    }));
  }, [activeSubs]);

  // Churn rate (canceled this month / total at start of month)
  const churnRate = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const canceledThisMonth = subs.filter(
      s => s.status === 'canceled' && s.canceled_at && s.canceled_at.startsWith(thisMonth)
    ).length;
    const totalAtStart = subs.filter(s => {
      const created = new Date(s.created_at);
      return created < new Date(now.getFullYear(), now.getMonth(), 1);
    }).length;
    return totalAtStart > 0 ? ((canceledThisMonth / totalAtStart) * 100).toFixed(1) : '0.0';
  }, [subs]);

  // Revenue by agent type (stacked by tier)
  const revenueByAgent: StackedBarGroup[] = useMemo(() => {
    return Object.keys(AGENT_LABELS).map(agent => {
      const segments = ['foundation', 'pro', 'elite'].map(tier => {
        const count = activeSubs.filter(s => s.agent_type === agent && s.tier === tier).length;
        const price = PRICING[agent]?.[tier] ?? 0;
        return {
          label: tier,
          value: count * price,
          color: TIER_COLORS[tier],
        };
      });
      return { label: AGENT_LABELS[agent], segments };
    });
  }, [activeSubs]);

  // Top add-ons by adoption
  const addonAdoption: DataPoint[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of addons) {
      if (a.active) {
        counts[a.addon_type] = (counts[a.addon_type] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count], i) => ({
        label: ADDON_LABELS[type] ?? type,
        value: count,
        color: Object.values(AGENT_COLORS)[i % Object.values(AGENT_COLORS).length],
      }));
  }, [addons]);

  // Dunning funnel
  const dunningFunnel: FunnelStep[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of dunning) {
      counts[d.event_type] = (counts[d.event_type] ?? 0) + 1;
    }
    return [
      { label: 'Payment Failed', value: counts['payment_failed'] ?? 0, color: '#EF4444' },
      { label: 'Grace Period', value: counts['grace_period_started'] ?? 0, color: '#F59E0B' },
      { label: 'Degraded', value: counts['degraded_to_readonly'] ?? 0, color: '#F97316' },
      { label: 'Suspended', value: counts['suspended'] ?? 0, color: '#DC2626' },
      { label: 'Reactivated', value: counts['reactivated'] ?? 0, color: '#10B981' },
    ];
  }, [dunning]);

  // Current MRR
  const currentMrr = useMemo(() => {
    return activeSubs.reduce((sum, s) => sum + (PRICING[s.agent_type]?.[s.tier] ?? 0), 0);
  }, [activeSubs]);

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Analytics</h1>
        <p className="text-sm text-neutral-500 mt-1">Revenue, growth, and retention metrics</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Current MRR" value={`$${currentMrr.toLocaleString()}`} />
        <KpiCard label="Active Clients" value={activeSubs.length.toString()} />
        <KpiCard label="Total Subscriptions" value={subs.length.toString()} />
        <KpiCard label="Churn Rate (this month)" value={`${churnRate}%`} highlight={parseFloat(churnRate) > 5} />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MRR over time */}
        <ChartCard title="MRR Over Time" span="lg:col-span-2">
          {mrrOverTime.length > 0 ? (
            <LineChart data={mrrOverTime} height={220} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* Clients by agent type */}
        <ChartCard title="Clients by Agent Type">
          {clientsByAgent.some(d => d.value > 0) ? (
            <BarChart data={clientsByAgent} height={200} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* Clients by tier */}
        <ChartCard title="Clients by Tier">
          {clientsByTier.some(d => d.value > 0) ? (
            <DonutChart data={clientsByTier} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* Revenue by agent type */}
        <ChartCard title="Revenue by Agent Type (Stacked by Tier)">
          {revenueByAgent.some(g => g.segments.some(s => s.value > 0)) ? (
            <>
              <StackedBarChart data={revenueByAgent} height={200} />
              <div className="flex items-center gap-4 mt-3 text-[10px] text-neutral-500">
                {['foundation', 'pro', 'elite'].map(t => (
                  <span key={t} className="flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: TIER_COLORS[t] }}
                    />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* Top add-ons */}
        <ChartCard title="Top Add-ons by Adoption">
          {addonAdoption.length > 0 ? (
            <HorizontalBarChart data={addonAdoption} />
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        {/* Dunning funnel */}
        <ChartCard title="Dunning Funnel" span="lg:col-span-2">
          {dunningFunnel[0].value > 0 ? (
            <FunnelChart steps={dunningFunnel} />
          ) : (
            <EmptyChart message="No dunning events recorded" />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-red-600' : 'text-neutral-900'}`}>
        {value}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  children,
  span = '',
}: {
  title: string;
  children: React.ReactNode;
  span?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-neutral-200 p-6 ${span}`}>
      <h3 className="text-sm font-semibold text-neutral-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart({ message = 'No data yet' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm text-neutral-400">{message}</p>
    </div>
  );
}
