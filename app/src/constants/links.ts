/**
 * Single source of truth for every external CloserEdge marketing URL the
 * desktop app links to, plus the in-app billing route and the Stripe
 * customer-portal config.
 *
 * Policy (#billing-links):
 * - Usage / billing / subscription info → navigate IN-APP to
 *   `SUBSCRIPTION_ROUTE` (react-router), never an external URL.
 * - Stripe customer-portal CTAs → `getStripePortalUrl()`; hide/disable the
 *   button when it returns null (env unset or still the test placeholder).
 * - Marketing pages (pricing, community, legal) keep the closeredge.ai
 *   domain, but only through `MARKETING_URLS` so they're swappable in one
 *   place. Upgrade CTAs go through `openPricingPage()`, which falls back to
 *   the in-app subscription page in dev builds where the marketing site
 *   may not exist yet.
 */
import { openUrl } from '../utils/openUrl';

export const MARKETING_URLS = {
  pricing: 'https://closeredge.ai/pricing',
  community: 'https://closeredge.ai/community',
  privacyPolicy: 'https://closeredge.ai/legal/privacy-policy',
  termsOfUse: 'https://closeredge.ai/legal/terms-of-use',
} as const;

/** In-app react-router route for the subscription / billing / usage page. */
export const SUBSCRIPTION_ROUTE = '/subscription';

/** Stripe's test-mode placeholder — never a real customer portal. */
const STRIPE_PORTAL_PLACEHOLDER = 'https://billing.stripe.com/p/login/test';

/** Tooltip shown on disabled Stripe-portal buttons when the URL is unset. */
export const PORTAL_UNCONFIGURED_HINT =
  'Billing portal is not configured yet. Please contact support to update your payment details.';

/**
 * The configured Stripe customer-portal URL, or `null` when the env var is
 * unset, blank, or still the test placeholder. Callers must hide or disable
 * portal CTAs (with an explanatory tooltip) when this returns null.
 */
export function getStripePortalUrl(): string | null {
  const url = (import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL as string | undefined)?.trim();
  if (!url || url === STRIPE_PORTAL_PLACEHOLDER) return null;
  return url;
}

/**
 * Open the pricing / upgrade page. In production this launches the
 * marketing site in the system browser; in dev it routes to the in-app
 * subscription page instead (hash assignment works with HashRouter from
 * any context, even outside the <Router> tree).
 */
export function openPricingPage(): void {
  if (import.meta.env.DEV) {
    window.location.hash = SUBSCRIPTION_ROUTE;
    return;
  }
  void openUrl(MARKETING_URLS.pricing).catch(() => {});
}
