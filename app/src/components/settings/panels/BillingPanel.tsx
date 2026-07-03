/**
 * Settings → Billing & Usage.
 *
 * Billing used to redirect to an external web dashboard
 * (closeredge.ai/dashboard), which no longer exists. Billing, usage, and
 * the Stripe portal now live on the in-app subscription page, so this
 * panel is a pure redirect kept only because `/settings/billing` is a
 * stable deep-link target (openhuman-link pills, useSettingsNavigation).
 */
import { Navigate } from 'react-router-dom';

import { SUBSCRIPTION_ROUTE } from '../../../constants/links';

const BillingPanel = () => <Navigate to={SUBSCRIPTION_ROUTE} replace />;

export default BillingPanel;
