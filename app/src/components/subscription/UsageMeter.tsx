/**
 * UsageMeter — plan-usage card for the Subscription page.
 *
 * Reads local metering from the core's `subscription.status` RPC (counters
 * recorded by the turn engine, limits from access_control.json) and renders
 * a progress bar per limit. Renders nothing when the core is unreachable or
 * reports no limits (gating disabled and no usage yet).
 */
import { useEffect, useState } from 'react';

import { callCoreRpc } from '../../services/coreRpcClient';

interface UsageSnapshot {
  requests_today: number;
  requests_this_week: number;
  tokens_this_week: number;
  tokens_this_month: number;
}

interface TierLimits {
  max_agent_requests_per_day: number;
  max_agent_requests_per_week: number;
  max_tokens_per_week: number;
  max_tokens_per_month: number;
}

interface SubscriptionStatusReport {
  gating_enabled: boolean;
  usage: UsageSnapshot;
  limits: TierLimits | null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface MeterRowProps {
  label: string;
  used: number;
  limit: number;
}

function MeterRow({ label, used, limit }: MeterRowProps) {
  const unlimited = limit < 0;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
  const nearLimit = !unlimited && pct >= 80;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-stone-600 dark:text-neutral-400">{label}</span>
        <span className="font-medium text-stone-800 dark:text-neutral-200">
          {formatCount(used)}
          {unlimited ? ' / unlimited' : ` / ${formatCount(limit)}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 w-full rounded-full bg-stone-100 dark:bg-neutral-800">
          <div
            className={`h-1.5 rounded-full transition-all ${
              nearLimit ? 'bg-amber-500' : 'bg-[#7C3AED]'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function UsageMeter() {
  const [report, setReport] = useState<SubscriptionStatusReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    callCoreRpc<SubscriptionStatusReport>({ method: 'subscription.status', params: {} })
      .then(r => {
        if (!cancelled) setReport(r);
      })
      .catch(() => {
        // Core unreachable (e.g. web build without a core) — hide the card.
        if (!cancelled) setReport(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!report?.limits) return null;

  const { usage, limits } = report;

  return (
    <div className="mt-6 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-sm font-semibold text-stone-900 dark:text-neutral-100 mb-4">
        Plan usage
      </h2>
      <div className="space-y-3">
        <MeterRow
          label="Agent requests today"
          used={usage.requests_today}
          limit={limits.max_agent_requests_per_day}
        />
        <MeterRow
          label="Agent requests this week"
          used={usage.requests_this_week}
          limit={limits.max_agent_requests_per_week}
        />
        <MeterRow
          label="Tokens this week"
          used={usage.tokens_this_week}
          limit={limits.max_tokens_per_week}
        />
        <MeterRow
          label="Tokens this month"
          used={usage.tokens_this_month}
          limit={limits.max_tokens_per_month}
        />
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-stone-400 dark:text-neutral-500">
        Daily limits reset at midnight UTC; weekly limits reset Monday. Need more headroom?{' '}
        <a
          href="https://closeredge.ai/pricing"
          target="_blank"
          rel="noreferrer"
          className="text-[#7C3AED] hover:underline">
          Upgrade your plan
        </a>
        .
      </p>
    </div>
  );
}
