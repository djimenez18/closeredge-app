import { useCallback, useState } from 'react';

import { PORTAL_UNCONFIGURED_HINT } from '../../constants/links';
import type { AccessLevel } from '../../hooks/useSubscription';
import { openUrl } from '../../utils/openUrl';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PaymentBannerProps {
  accessLevel: AccessLevel;
  daysPastDue: number;
  /** Null when the Stripe portal is not configured — CTA disables with a tooltip. */
  stripeCustomerPortalUrl: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Days allowed in each dunning phase before the next degradation. */
const GRACE_DAYS = 7;
const READ_ONLY_DAYS = 14;

const DISMISSED_KEY = 'closeredge:payment-banner-dismissed';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PaymentBanner({
  accessLevel,
  daysPastDue,
  stripeCustomerPortalUrl,
}: PaymentBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      // sessionStorage clears on app relaunch so the banner re-appears next launch.
      sessionStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Storage may be unavailable — dismiss in memory only.
    }
  }, []);

  const handleUpdatePayment = useCallback(() => {
    if (stripeCustomerPortalUrl) void openUrl(stripeCustomerPortalUrl);
  }, [stripeCustomerPortalUrl]);

  // Only show for grace or read_only access levels.
  if (accessLevel !== 'grace' && accessLevel !== 'read_only') return null;
  if (dismissed) return null;

  const isGrace = accessLevel === 'grace';
  const daysRemaining = isGrace
    ? Math.max(0, GRACE_DAYS - daysPastDue)
    : Math.max(0, READ_ONLY_DAYS - daysPastDue);

  const bgClass = isGrace
    ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-700'
    : 'bg-orange-50 dark:bg-orange-500/15 border-orange-300 dark:border-orange-700';

  const textClass = isGrace
    ? 'text-amber-800 dark:text-amber-200'
    : 'text-orange-800 dark:text-orange-200';

  const subTextClass = isGrace
    ? 'text-amber-600 dark:text-amber-300'
    : 'text-orange-600 dark:text-orange-300';

  const ctaClass = isGrace
    ? 'bg-amber-500 hover:bg-amber-600 text-white'
    : 'bg-orange-500 hover:bg-orange-600 text-white';

  const headline = isGrace
    ? 'Payment overdue — update now'
    : 'Features limited — update payment to restore';

  return (
    <div
      className={`relative flex items-center justify-between gap-3 border-b px-4 py-2.5 ${bgClass}`}
      role="alert">
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Warning icon */}
        <svg
          className={`w-4 h-4 flex-shrink-0 ${subTextClass}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="min-w-0">
          <p className={`text-xs font-semibold ${textClass}`}>{headline}</p>
          <p className={`text-[11px] ${subTextClass}`}>
            {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining before{' '}
            {isGrace ? 'features are limited' : 'account is suspended'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          disabled={!stripeCustomerPortalUrl}
          title={stripeCustomerPortalUrl ? undefined : PORTAL_UNCONFIGURED_HINT}
          onClick={handleUpdatePayment}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${ctaClass}`}>
          Update Payment
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded text-stone-400 dark:text-neutral-500 hover:text-stone-600 dark:hover:text-neutral-300 transition-colors"
          aria-label="Dismiss">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
