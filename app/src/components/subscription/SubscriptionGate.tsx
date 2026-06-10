import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

import { useSubscription } from '../../hooks/useSubscription';
import type { AccessLevel } from '../../hooks/useSubscription';
import { supabaseConfigured } from '../../lib/supabase';
import { openUrl } from '../../utils/openUrl';
import PaymentBanner from './PaymentBanner';

/**
 * Client-side gating is UX, not enforcement — the Rust core enforces
 * subscription state server-side (src/subscription/middleware.rs). The gate
 * activates whenever Supabase is configured; `VITE_SUBSCRIPTION_GATING=off`
 * is the dev escape hatch for working against a configured project without
 * a subscription row.
 */
const GATING_ACTIVE = supabaseConfigured && import.meta.env.VITE_SUBSCRIPTION_GATING !== 'off';

// ---------------------------------------------------------------------------
// Read-only context — children can check whether the app is in read-only mode.
// ---------------------------------------------------------------------------

const ReadOnlyContext = createContext(false);

/** Returns `true` when the subscription is in read-only dunning phase. */
export const useIsReadOnly = () => useContext(ReadOnlyContext);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SubscriptionGateProps {
  children: ReactNode;
  /** URL for the Stripe Customer Portal (update payment / manage billing). */
  stripeCustomerPortalUrl: string;
  /** Optional pricing / onboarding page URL shown when there is no subscription. */
  pricingUrl?: string;
}

// ---------------------------------------------------------------------------
// Sub-screens
// ---------------------------------------------------------------------------

/** Rendered by the gate below when subscription state requires it. */
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 dark:border-neutral-700 border-t-[#7C3AED]" />
        <p className="text-sm text-stone-500 dark:text-neutral-400">
          Checking subscription&hellip;
        </p>
      </div>
    </div>
  );
}

/** Rendered by the gate below when subscription state requires it. */
export function SuspendedScreen({ portalUrl }: { portalUrl: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-neutral-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center shadow-lg">
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20">
          <svg
            className="h-7 w-7 text-red-600 dark:text-red-400"
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
        </div>
        <h2 className="text-xl font-semibold text-stone-900 dark:text-neutral-100">
          Payment Required
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-neutral-400">
          Your subscription has been suspended due to an outstanding payment. Update your payment
          method to restore access.
        </p>
        <button
          type="button"
          onClick={() => void openUrl(portalUrl)}
          className="mt-6 w-full rounded-lg bg-[#7C3AED] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#6D28D9] transition-colors">
          Update Payment
        </button>
      </div>
    </div>
  );
}

/** Rendered by the gate below when subscription state requires it. */
export function CanceledScreen({ portalUrl }: { portalUrl: string }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-neutral-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center shadow-lg">
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 dark:bg-neutral-800">
          <svg
            className="h-7 w-7 text-stone-500 dark:text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-stone-900 dark:text-neutral-100">
          Subscription Canceled
        </h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-neutral-400">
          Your subscription has been canceled. Resubscribe to regain access to your AI employees.
        </p>
        <button
          type="button"
          onClick={() => void openUrl(portalUrl)}
          className="mt-6 w-full rounded-lg bg-[#7C3AED] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#6D28D9] transition-colors">
          Resubscribe
        </button>
      </div>
    </div>
  );
}

/** Rendered by the gate below when subscription state requires it. */
export function NoSubscriptionScreen({ pricingUrl }: { pricingUrl?: string }) {
  const targetUrl = pricingUrl ?? 'https://closeredge.ai/pricing';
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-neutral-950 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center shadow-lg">
        {/* Logo / brand mark */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7C3AED]/10">
          <svg
            className="h-8 w-8 text-[#7C3AED]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-stone-900 dark:text-neutral-100">
          Welcome to CloserEdge AI
        </h2>
        <p className="mt-3 text-sm text-stone-600 dark:text-neutral-400 leading-relaxed">
          Choose a plan and get your AI employee up and running in minutes. Every plan includes
          onboarding, training, and 24/7 autonomous operation.
        </p>
        <button
          type="button"
          onClick={() => void openUrl(targetUrl)}
          className="mt-6 w-full rounded-lg bg-[#7C3AED] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#6D28D9] transition-colors">
          View Plans &amp; Pricing
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

export default function SubscriptionGate({
  children,
  stripeCustomerPortalUrl,
  pricingUrl,
}: SubscriptionGateProps) {
  const { subscription, accessLevel, isLoading } = useSubscription();

  // Don't block on the in-flight check — render children until the
  // subscription resolves so a slow Supabase query never freezes launch.
  // The backend gate refuses real actions in the meantime, so this is
  // cosmetic-only optimism.
  if (GATING_ACTIVE && !isLoading) {
    // Terminal states — full-screen blocks.
    if (accessLevel === 'none') {
      if (subscription?.status === 'canceled') {
        return <CanceledScreen portalUrl={stripeCustomerPortalUrl} />;
      }
      return <NoSubscriptionScreen pricingUrl={pricingUrl} />;
    }
    if (accessLevel === 'suspended') {
      return <SuspendedScreen portalUrl={stripeCustomerPortalUrl} />;
    }
  }

  // Grace or read-only — show banner + children.
  const isReadOnly = GATING_ACTIVE && accessLevel === 'read_only';

  return (
    <ReadOnlyContext.Provider value={isReadOnly}>
      {GATING_ACTIVE &&
        (accessLevel === 'grace' || accessLevel === 'read_only') &&
        subscription && (
          <PaymentBanner
            accessLevel={accessLevel as Exclude<AccessLevel, 'full' | 'suspended' | 'none'>}
            daysPastDue={subscription.daysPastDue}
            stripeCustomerPortalUrl={stripeCustomerPortalUrl}
          />
        )}
      {children}
    </ReadOnlyContext.Provider>
  );
}
