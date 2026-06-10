/**
 * SubscriptionPage -- thin page wrapper around the SubscriptionStatus component.
 *
 * Fetches the user's subscription via useSubscription() and renders the
 * status card. Shows a loading spinner while data is in flight and a
 * placeholder when no subscription exists.
 */
import SubscriptionStatus from '../components/subscription/SubscriptionStatus';
import UsageMeter from '../components/subscription/UsageMeter';
import { useSubscription } from '../hooks/useSubscription';

const STRIPE_PORTAL_URL =
  import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL ?? 'https://billing.stripe.com/p/login/test';

export default function SubscriptionPage() {
  const { subscription, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-stone-500 dark:text-neutral-400">
            Loading subscription&hellip;
          </p>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-stone-500 dark:text-neutral-400">
          No active subscription found.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-xl font-bold text-stone-900 dark:text-neutral-100 mb-6">Subscription</h1>
      <SubscriptionStatus subscription={subscription} stripeCustomerPortalUrl={STRIPE_PORTAL_URL} />
      <UsageMeter />
    </div>
  );
}
