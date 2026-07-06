/**
 * AgentHealth -- agent monitoring page.
 *
 * Lists all deployed agents with:
 *   - Health status indicator
 *   - Last health check timestamp
 *   - Deployment mode (shared / dedicated)
 *   - Memory usage / conversation count (from config JSONB)
 *   - Quick actions: restart, pause, view logs
 */
import { useEffect, useState } from 'react';

import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeploymentRow {
  id: string;
  subscription_id: string;
  agent_type: string;
  deployment_mode: string;
  deployment_status: string;
  railway_service_id: string | null;
  last_health_check: string | null;
  paused_at: string | null;
  config: Record<string, unknown>;
  customer_name: string;
}

const AGENT_LABELS: Record<string, string> = {
  eden: 'Eden',
  crest: 'Crest',
  forge: 'Forge',
  haven: 'Haven',
  lexis: 'Lexis',
  nora: 'Nora',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentHealth() {
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Fetch deployments
        const { data: deps, error: depErr } = await supabase
          .from('agent_deployments')
          .select(
            'id, subscription_id, agent_type, deployment_mode, deployment_status, railway_service_id, last_health_check, paused_at, config'
          )
          .order('agent_type', { ascending: true });

        if (depErr) throw depErr;

        // Fetch subscription -> customer mapping for display names
        const subIds = [...new Set((deps ?? []).map(d => d.subscription_id))];
        let customerMap = new Map<string, string>();

        if (subIds.length > 0) {
          const { data: subs } = await supabase
            .from('subscriptions')
            .select('id, customer_id')
            .in('id', subIds);

          const customerIds = [...new Set((subs ?? []).map(s => s.customer_id))];
          if (customerIds.length > 0) {
            const { data: customers } = await supabase
              .from('customers')
              .select('id, business_name')
              .in('id', customerIds);

            const custLookup = new Map((customers ?? []).map(c => [c.id, c.business_name]));
            customerMap = new Map(
              (subs ?? []).map(s => [s.id, custLookup.get(s.customer_id) ?? 'Unknown'])
            );
          }
        }

        if (cancelled) return;

        setDeployments(
          (deps ?? []).map(d => ({
            ...d,
            config: (d.config as Record<string, unknown>) ?? {},
            customer_name: customerMap.get(d.subscription_id) ?? 'Unknown',
          }))
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load deployments');
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

  // ---- Actions ----

  async function updateDeployment(id: string, newStatus: string) {
    setActionLoading(id);
    try {
      const updates: Record<string, unknown> = { deployment_status: newStatus };
      if (newStatus === 'paused') updates.paused_at = new Date().toISOString();
      if (newStatus === 'running') updates.paused_at = null;

      const { error: err } = await supabase.from('agent_deployments').update(updates).eq('id', id);

      if (err) throw err;

      setDeployments(prev =>
        prev.map(d =>
          d.id === id
            ? {
                ...d,
                deployment_status: newStatus,
                paused_at: newStatus === 'paused' ? new Date().toISOString() : null,
              }
            : d
        )
      );
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  }

  // ---- Stats ----
  const statusCounts = deployments.reduce(
    (acc, d) => {
      acc[d.deployment_status] = (acc[d.deployment_status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

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
        <h1 className="text-2xl font-bold text-neutral-900">Agent Health</h1>
        <p className="text-sm text-neutral-500 mt-1">{deployments.length} deployed agents</p>
      </div>

      {/* Status summary */}
      <div className="flex flex-wrap gap-3">
        <StatusPill label="Running" count={statusCounts['running'] ?? 0} color="green" />
        <StatusPill label="Provisioning" count={statusCounts['provisioning'] ?? 0} color="blue" />
        <StatusPill label="Paused" count={statusCounts['paused'] ?? 0} color="amber" />
        <StatusPill label="Stopped" count={statusCounts['stopped'] ?? 0} color="gray" />
        <StatusPill label="Failed" count={statusCounts['failed'] ?? 0} color="red" />
      </div>

      {/* Agent cards */}
      {deployments.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <p className="text-sm text-neutral-400">No deployed agents</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {deployments.map(d => (
            <AgentCard
              key={d.id}
              deployment={d}
              actionLoading={actionLoading === d.id}
              onPause={() => updateDeployment(d.id, 'paused')}
              onResume={() => updateDeployment(d.id, 'running')}
              onRestart={() => {
                // Restart = set to provisioning, then running
                void updateDeployment(d.id, 'provisioning').then(() => {
                  setTimeout(() => {
                    void updateDeployment(d.id, 'running');
                  }, 1500);
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusPill({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: 'green' | 'blue' | 'amber' | 'gray' | 'red';
}) {
  const styles = {
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    gray: 'bg-neutral-100 text-neutral-500 border-neutral-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${styles[color]}`}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          color === 'green'
            ? 'bg-green-500'
            : color === 'blue'
              ? 'bg-blue-500'
              : color === 'amber'
                ? 'bg-amber-500'
                : color === 'red'
                  ? 'bg-red-500'
                  : 'bg-neutral-400'
        }`}
      />
      {label}: {count}
    </span>
  );
}

function AgentCard({
  deployment,
  actionLoading,
  onPause,
  onResume,
  onRestart,
}: {
  deployment: DeploymentRow;
  actionLoading: boolean;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
}) {
  const d = deployment;
  const isHealthy = d.deployment_status === 'running';
  const isPaused = d.deployment_status === 'paused';
  const isFailed = d.deployment_status === 'failed';
  const isStopped = d.deployment_status === 'stopped';

  // Parse config for optional stats
  const conversationCount =
    typeof d.config.conversation_count === 'number' ? d.config.conversation_count : null;
  const memoryUsageMb =
    typeof d.config.memory_usage_mb === 'number' ? d.config.memory_usage_mb : null;

  // Health check staleness
  const lastCheck = d.last_health_check ? new Date(d.last_health_check) : null;
  // eslint-disable-next-line react-hooks/purity -- intentional render-time clock read for a relative "staleness" display
  const nowMs = Date.now();
  const minutesSinceCheck = lastCheck ? Math.floor((nowMs - lastCheck.getTime()) / 60000) : null;
  const checkStale = minutesSinceCheck !== null && minutesSinceCheck > 10;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* Status dot */}
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              isHealthy
                ? 'bg-green-500'
                : isPaused
                  ? 'bg-amber-500'
                  : isFailed
                    ? 'bg-red-500 animate-pulse'
                    : 'bg-neutral-400'
            }`}
          />
          <div>
            <p className="text-sm font-semibold text-neutral-800">
              {AGENT_LABELS[d.agent_type] ?? d.agent_type}
            </p>
            <p className="text-[10px] text-neutral-400 truncate max-w-[140px]">{d.customer_name}</p>
          </div>
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
            isHealthy
              ? 'bg-green-50 text-green-700'
              : isPaused
                ? 'bg-amber-50 text-amber-700'
                : isFailed
                  ? 'bg-red-50 text-red-700'
                  : 'bg-neutral-100 text-neutral-500'
          }`}>
          {d.deployment_status}
        </span>
      </div>

      {/* Info grid */}
      <div className="space-y-2 mb-4 flex-1">
        <InfoRow label="Mode" value={<span className="capitalize">{d.deployment_mode}</span>} />
        <InfoRow
          label="Last Health Check"
          value={
            lastCheck ? (
              <span className={checkStale ? 'text-amber-600' : 'text-neutral-700'}>
                {minutesSinceCheck === 0 ? 'just now' : `${minutesSinceCheck}m ago`}
                {checkStale && ' (stale)'}
              </span>
            ) : (
              <span className="text-neutral-400">Never</span>
            )
          }
        />
        {conversationCount !== null && (
          <InfoRow label="Conversations" value={conversationCount.toLocaleString()} />
        )}
        {memoryUsageMb !== null && (
          <InfoRow label="Memory" value={`${memoryUsageMb.toFixed(0)} MB`} />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-neutral-100">
        {isHealthy && (
          <SmallButton label="Pause" variant="amber" loading={actionLoading} onClick={onPause} />
        )}
        {(isPaused || isStopped) && (
          <SmallButton label="Resume" variant="green" loading={actionLoading} onClick={onResume} />
        )}
        {!isStopped && (
          <SmallButton label="Restart" variant="blue" loading={actionLoading} onClick={onRestart} />
        )}
        {d.railway_service_id && (
          <a
            href={`https://railway.app/project/${d.railway_service_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-purple-600 hover:underline ml-auto">
            View Logs
          </a>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-700 font-medium">{value}</span>
    </div>
  );
}

function SmallButton({
  label,
  variant,
  loading,
  onClick,
}: {
  label: string;
  variant: 'green' | 'amber' | 'blue';
  loading: boolean;
  onClick: () => void;
}) {
  const styles = {
    green: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200',
    amber: 'bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-50 ${styles[variant]}`}>
      {loading ? '...' : label}
    </button>
  );
}
