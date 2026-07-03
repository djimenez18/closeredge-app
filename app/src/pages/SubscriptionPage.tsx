/**
 * SubscriptionPage -- thin page wrapper around the SubscriptionStatus component.
 *
 * Fetches the user's subscription via useSubscription() and renders the
 * status card. Shows a loading spinner while data is in flight and a
 * placeholder when no subscription exists.
 */
import SubscriptionStatus from '../components/subscription/SubscriptionStatus';
import UsageMeter from '../components/subscription/UsageMeter';
import { getStripePortalUrl } from '../constants/links';
import { useSubscription } from '../hooks/useSubscription';

// Null when VITE_STRIPE_CUSTOMER_PORTAL_URL is unset or still the test
// placeholder — portal CTAs render disabled with a tooltip in that case.
const STRIPE_PORTAL_URL = getStripePortalUrl();

export default function SubscriptionPage() {
  const { subscription, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4 animate-fade-in">
        <div className="ce-skeleton h-7 w-32 mb-6" />
        <div className="rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
          <div className="ce-skeleton h-5 w-24" />
          <div className="ce-skeleton h-4 w-48" />
          <div className="ce-skeleton h-4 w-40" />
          <div className="ce-skeleton h-4 w-56" />
          <div className="flex gap-3 mt-4">
            <div className="ce-skeleton h-10 w-32 rounded-lg" />
            <div className="ce-skeleton h-10 w-24 rounded-lg" />
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 mt-6 space-y-3">
          <div className="ce-skeleton h-4 w-20" />
          <div className="ce-skeleton h-1.5 w-full rounded-full" />
          <div className="ce-skeleton h-4 w-36" />
          <div className="ce-skeleton h-1.5 w-full rounded-full" />
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mb-3">
            <svg
              className="w-6 h-6 text-brand-500/70 dark:text-brand-400/70"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-stone-600 dark:text-neutral-300">
            No active subscription found.
          </p>
          <p className="text-xs text-stone-400 dark:text-neutral-500 mt-1">
            Contact support if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1
        className="text-xl font-bold text-stone-900 dark:text-neutral-100 mb-6 animate-stagger-fade-up"
        style={{ animationDelay: '0ms', animationFillMode: 'both' }}>
        Subscription
      </h1>
      <div
        className="animate-stagger-fade-up"
        style={{ animationDelay: '80ms', animationFillMode: 'both' }}>
        <SubscriptionStatus
          subscription={subscription}
          stripeCustomerPortalUrl={STRIPE_PORTAL_URL}
        />
      </div>
      <div
        className="animate-stagger-fade-up"
        style={{ animationDelay: '160ms', animationFillMode: 'both' }}>
        <UsageMeter />
      </div>
    </div>
  );
}
