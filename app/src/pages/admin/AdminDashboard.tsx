/**
 * AdminDashboard -- the main admin overview page.
 *
 * Shows at-a-glance:
 *   - Total active clients
 *   - Monthly recurring revenue (MRR)
 *   - Active agents count by product
 *   - Quick stats cards in a grid
 *   - Recent activity feed (dunning events, signups, tier changes)
 *   - Links to sub-pages
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Pricing lookup (monthly base price per agent + tier)
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Subscription {
  id: string;
  agent_type: string;
  tier: string;
  status: string;
  created_at: string;
}

interface DunningEvent {
  id: string;
  event_type: string;
  created_at: string;
  subscription_id: string;
  details: Record<string, unknown>;
}

interface DashboardStats {
  totalClients: number;
  activeSubscriptions: number;
  mrr: number;
  agentCounts: Record<string, number>;
  recentEvents: DunningEvent[];
  recentSignups: Subscription[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Fetch all subscriptions
        const { data: subs, error: subsErr } = await supabase
          .from('subscriptions')
          .select('id, agent_type, tier, status, created_at')
          .order('created_at', { ascending: false });

        if (subsErr) throw subsErr;

        // Fetch recent dunning events
        const { data: events, error: eventsErr } = await supabase
          .from('dunning_events')
          .select('id, event_type, created_at, subscription_id, details')
          .order('created_at', { ascending: false })
          .limit(20);

        if (eventsErr) throw eventsErr;

        // Fetch total customers count
        const { count: customerCount, error: custErr } = await supabase
          .from('customers')
          .select('id', { count: 'exact', head: true });

        if (custErr) throw custErr;

        if (cancelled) return;

        const activeSubs = (subs ?? []).filter(
          s => s.status === 'active' || s.status === 'trialing'
        );

        // Calculate MRR from active subs
        const mrr = activeSubs.reduce((sum, s) => {
          const price = PRICING[s.agent_type]?.[s.tier] ?? 0;
          return sum + price;
        }, 0);

        // Count agents by type
        const agentCounts: Record<string, number> = {};
        for (const s of activeSubs) {
          agentCounts[s.agent_type] = (agentCounts[s.agent_type] ?? 0) + 1;
        }

        // Recent signups (last 10)
        const recentSignups = (subs ?? []).slice(0, 10);

        setStats({
          totalClients: customerCount ?? 0,
          activeSubscriptions: activeSubs.length,
          mrr,
          agentCounts,
          recentEvents: (events as DunningEvent[]) ?? [],
          recentSignups,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
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
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 text-xs text-red-600 underline hover:no-underline">
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-8">
      {/* ---- Header ---- */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
        <p className="text-sm text-neutral-500 mt-1">CloserEdge AI admin overview</p>
      </div>

      {/* ---- Stats grid ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Clients"
          value={stats.totalClients.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          }
          linkTo="/admin/clients"
        />
        <StatCard
          label="MRR"
          value={`$${stats.mrr.toLocaleString()}`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          linkTo="/admin/analytics"
          accent
        />
        <StatCard
          label="Active Subscriptions"
          value={stats.activeSubscriptions.toString()}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
          linkTo="/admin/clients"
        />
        <StatCard
          label="Active Agents"
          value={Object.values(stats.agentCounts)
            .reduce((a, b) => a + b, 0)
            .toString()}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
          linkTo="/admin/agents"
        />
      </div>

      {/* ---- Agents by type ---- */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        <h2 className="text-sm font-semibold text-neutral-800 mb-4">Active Agents by Product</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.keys(AGENT_LABELS).map(key => (
            <div
              key={key}
              className="flex flex-col items-center p-3 rounded-lg bg-neutral-50 border border-neutral-100">
              <span className="text-2xl font-bold text-purple-700">
                {stats.agentCounts[key] ?? 0}
              </span>
              <span className="text-xs text-neutral-500 mt-1">{AGENT_LABELS[key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Two-column: recent activity + quick links ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-neutral-200 p-6">
          <h2 className="text-sm font-semibold text-neutral-800 mb-4">Recent Activity</h2>
          {stats.recentEvents.length === 0 && stats.recentSignups.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-6">No recent activity</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {stats.recentEvents.slice(0, 15).map(ev => (
                <ActivityItem
                  key={ev.id}
                  type={ev.event_type}
                  timestamp={ev.created_at}
                  subscriptionId={ev.subscription_id}
                />
              ))}
              {stats.recentSignups.slice(0, 5).map(sub => (
                <ActivityItem
                  key={`signup-${sub.id}`}
                  type="new_subscription"
                  timestamp={sub.created_at}
                  detail={`${AGENT_LABELS[sub.agent_type] ?? sub.agent_type} (${sub.tier})`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h2 className="text-sm font-semibold text-neutral-800 mb-4">Quick Links</h2>
          <div className="space-y-2">
            <QuickLink to="/admin/clients" label="Manage Clients" />
            <QuickLink to="/admin/analytics" label="View Analytics" />
            <QuickLink to="/admin/agents" label="Agent Health" />
            <QuickLink to="https://dashboard.stripe.com" label="Stripe Dashboard" external />
            <QuickLink to="https://railway.app/dashboard" label="Railway Dashboard" external />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  linkTo,
  accent = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  linkTo: string;
  accent?: boolean;
}) {
  return (
    <Link
      to={linkTo}
      className={`
        group block rounded-xl border p-5 transition-all hover:shadow-soft
        ${accent ? 'bg-purple-50 border-purple-200' : 'bg-white border-neutral-200'}
      `}>
      <div className="flex items-center justify-between mb-3">
        <span
          className={`p-2 rounded-lg ${accent ? 'bg-purple-100 text-purple-600' : 'bg-neutral-100 text-neutral-500'}`}>
          {icon}
        </span>
        <svg
          className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <p className={`text-2xl font-bold ${accent ? 'text-purple-700' : 'text-neutral-900'}`}>
        {value}
      </p>
      <p className="text-xs text-neutral-500 mt-1">{label}</p>
    </Link>
  );
}

function ActivityItem({
  type,
  timestamp,
  subscriptionId: _subscriptionId,
  detail,
}: {
  type: string;
  timestamp: string;
  subscriptionId?: string;
  detail?: string;
}) {
  const EVENT_LABELS: Record<string, { label: string; color: string }> = {
    payment_failed: { label: 'Payment failed', color: 'text-red-600 bg-red-50' },
    retry_succeeded: { label: 'Retry succeeded', color: 'text-green-600 bg-green-50' },
    retry_failed: { label: 'Retry failed', color: 'text-red-600 bg-red-50' },
    grace_period_started: { label: 'Grace period started', color: 'text-amber-600 bg-amber-50' },
    degraded_to_readonly: { label: 'Degraded to read-only', color: 'text-orange-600 bg-orange-50' },
    suspended: { label: 'Suspended', color: 'text-red-700 bg-red-50' },
    reactivated: { label: 'Reactivated', color: 'text-green-600 bg-green-50' },
    email_sent: { label: 'Email sent', color: 'text-blue-600 bg-blue-50' },
    new_subscription: { label: 'New subscription', color: 'text-purple-600 bg-purple-50' },
  };

  const info = EVENT_LABELS[type] ?? {
    label: type.replace(/_/g, ' '),
    color: 'text-neutral-600 bg-neutral-50',
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-neutral-50 last:border-0">
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${info.color}`}>
        {info.label}
      </span>
      {detail && <span className="text-xs text-neutral-600">{detail}</span>}
      <span className="text-[10px] text-neutral-400 ml-auto flex-shrink-0">
        {formatRelativeTime(timestamp)}
      </span>
    </div>
  );
}

function QuickLink({
  to,
  label,
  external = false,
}: {
  to: string;
  label: string;
  external?: boolean;
}) {
  if (external) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors">
        {label}
        <svg
          className="w-3.5 h-3.5 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>
    );
  }

  return (
    <Link
      to={to}
      className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors">
      {label}
      <svg
        className="w-3.5 h-3.5 text-neutral-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString();
}
