import { useCallback } from 'react';

import type { Subscription, SubscriptionTier } from '../../hooks/useSubscription';
import { PORTAL_UNCONFIGURED_HINT } from '../../constants/links';
import { openUrl } from '../../utils/openUrl';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SubscriptionStatusProps {
  subscription: Subscription;
  /** Null when the Stripe portal is not configured — CTAs disable with a tooltip. */
  stripeCustomerPortalUrl: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<SubscriptionTier, string> = {
  foundation: 'Foundation',
  pro: 'Pro',
  elite: 'Elite',
};

const AGENT_LABELS: Record<string, string> = {
  eden: 'Eden',
  crest: 'Crest',
  forge: 'Forge',
  haven: 'Haven',
  lexis: 'Lexis',
  nora: 'Nora',
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  trialing: { label: 'Trial', className: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  past_due: { label: 'Past Due', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  canceled: { label: 'Canceled', className: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
  unpaid: { label: 'Unpaid', className: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
  incomplete: { label: 'Incomplete', className: 'bg-stone-100 text-stone-600 dark:bg-neutral-700 dark:text-neutral-300' },
  incomplete_expired: { label: 'Expired', className: 'bg-stone-100 text-stone-600 dark:bg-neutral-700 dark:text-neutral-300' },
  paused: { label: 'Paused', className: 'bg-stone-100 text-stone-600 dark:bg-neutral-700 dark:text-neutral-300' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SubscriptionStatus({
  subscription,
  stripeCustomerPortalUrl,
}: SubscriptionStatusProps) {
  const portalConfigured = stripeCustomerPortalUrl !== null;

  const handleManageBilling = useCallback(() => {
    if (stripeCustomerPortalUrl) void openUrl(stripeCustomerPortalUrl);
  }, [stripeCustomerPortalUrl]);

  const handleUpgrade = useCallback(() => {
    // Upgrade directs to the same portal — Stripe handles plan changes.
    if (stripeCustomerPortalUrl) void openUrl(stripeCustomerPortalUrl);
  }, [stripeCustomerPortalUrl]);

  const badge = STATUS_BADGES[subscription.status] ?? {
    label: subscription.status,
    className: 'bg-stone-100 text-stone-600 dark:bg-neutral-700 dark:text-neutral-300',
  };

  const showUpgrade =
    subscription.tier === 'foundation' || subscription.tier === 'pro';

  const activeAddOns = subscription.addOns.filter(a => a.active);

  return (
    <div className="ce-hover-lift rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5">
      <h3 className="text-base font-semibold text-stone-900 dark:text-neutral-100">
        Subscription
      </h3>

      <div className="mt-4 space-y-3">
        {/* Plan */}
        <Row label="Plan">
          <span className="font-medium text-stone-900 dark:text-neutral-100">
            {AGENT_LABELS[subscription.agentType] ?? subscription.agentType}{' '}
            {TIER_LABELS[subscription.tier]}
          </span>
        </Row>

        {/* Status */}
        <Row label="Status">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
            {badge.label}
          </span>
          {subscription.cancelAtPeriodEnd && (
            <span className="ml-2 text-[11px] text-stone-500 dark:text-neutral-400">
              Cancels at period end
            </span>
          )}
        </Row>

        {/* Period */}
        <Row label="Current Period">
          <span className="text-stone-700 dark:text-neutral-300">
            {formatDate(subscription.currentPeriodStart)} &ndash;{' '}
            {formatDate(subscription.currentPeriodEnd)}
          </span>
        </Row>

        {/* Add-ons */}
        {activeAddOns.length > 0 && (
          <Row label="Add-ons">
            <div className="flex flex-wrap gap-1.5">
              {activeAddOns.map(addon => (
                <span
                  key={addon.id}
                  className="inline-block rounded-full bg-[#7C3AED]/10 px-2 py-0.5 text-[11px] font-medium text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-purple-300">
                  {addon.name}
                </span>
              ))}
            </div>
          </Row>
        )}
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={!portalConfigured}
          title={portalConfigured ? undefined : PORTAL_UNCONFIGURED_HINT}
          onClick={handleManageBilling}
          className="ce-press-scale rounded-lg border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2 text-sm font-medium text-stone-700 dark:text-neutral-200 hover:bg-stone-50 dark:hover:bg-neutral-800/60 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900">
          Manage Billing
        </button>
        {showUpgrade && (
          <button
            type="button"
            disabled={!portalConfigured}
            title={portalConfigured ? undefined : PORTAL_UNCONFIGURED_HINT}
            onClick={handleUpgrade}
            className="ce-press-scale rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-medium text-white hover:bg-[#6D28D9] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#7C3AED] focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900">
            Upgrade
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helper component
// ---------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-stone-500 dark:text-neutral-400 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <div className="text-sm text-right">{children}</div>
    </div>
  );
}
