/**
 * Legacy re-exports — the canonical marketing URL table lives in
 * src/constants/links.ts (MARKETING_URLS). The old BILLING_DASHBOARD_URL
 * ('https://closeredge.ai/dashboard') was a dead page; billing/usage CTAs
 * now navigate in-app to SUBSCRIPTION_ROUTE instead.
 */
import { MARKETING_URLS } from '../constants/links';

export const COMMUNITY_URL = MARKETING_URLS.community;
export const PRIVACY_POLICY_URL = MARKETING_URLS.privacyPolicy;
export const TERMS_OF_USE_URL = MARKETING_URLS.termsOfUse;
