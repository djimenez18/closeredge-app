/**
 * ClientDetail -- single client detail view.
 *
 * Route: /admin/clients/:clientId
 *
 * Shows business info, subscription details, add-ons, agent deployment status,
 * dunning history, and admin actions (pause/resume/change tier/cancel).
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Customer {
  id: string;
  business_name: string;
  business_type: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  stripe_customer_id: string | null;
  created_at: string;
}

interface Subscription {
  id: string;
  agent_type: string;
  tier: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
  created_at: string;
}

interface AddOn {
  id: string;
  addon_type: string;
  active: boolean;
}

interface Deployment {
  id: string;
  agent_type: string;
  deployment_mode: string;
  deployment_status: string;
  railway_service_id: string | null;
  last_health_check: string | null;
  paused_at: string | null;
}

interface DunningEvent {
  id: string;
  event_type: string;
  created_at: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_LABELS: Record<string, string> = {
  eden: 'Eden',
  crest: 'Crest',
  forge: 'Forge',
  haven: 'Haven',
  lexis: 'Lexis',
  nora: 'Nora',
};

const PRICING: Record<string, Record<string, number>> = {
  eden: { foundation: 300, pro: 500, elite: 750 },
  crest: { foundation: 500, pro: 800, elite: 1200 },
  lexis: { foundation: 500, pro: 800, elite: 1200 },
  haven: { foundation: 500, pro: 750, elite: 1000 },
  forge: { foundation: 300, pro: 500, elite: 700 },
  nora: { foundation: 250, pro: 400, elite: 600 },
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  residential_real_estate: 'Residential Real Estate',
  commercial_real_estate: 'Commercial Real Estate',
  legal: 'Legal',
  healthcare: 'Healthcare',
  home_services: 'Home Services',
  property_management: 'Property Management',
};

const ADDON_LABELS: Record<string, string> = {
  voice: 'Call Your Agent (Voice)',
  mentor: 'Mentor Layer',
  mls_data: 'MLS Data Connection',
  social_autopilot: 'Social Media Autopilot',
  seasonal_campaigns: 'Seasonal Campaigns',
  review_automation: 'Review Automation',
  investor_reporting: 'Investor Reporting',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [dunningEvents, setDunningEvents] = useState<DunningEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    async function load() {
      try {
        // Customer
        const { data: cust, error: custErr } = await supabase
          .from('customers')
          .select('*')
          .eq('id', clientId)
          .single();
        if (custErr) throw custErr;

        // Subscription (most recent)
        const { data: subs, error: subsErr } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('customer_id', clientId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (subsErr) throw subsErr;

        const sub = subs?.[0] ?? null;

        // Add-ons (if subscription exists)
        let addOnsData: AddOn[] = [];
        if (sub) {
          const { data: ao, error: aoErr } = await supabase
            .from('subscription_addons')
            .select('id, addon_type, active')
            .eq('subscription_id', sub.id);
          if (aoErr) throw aoErr;
          addOnsData = ao ?? [];
        }

        // Deployment (if subscription exists)
        let deploy: Deployment | null = null;
        if (sub) {
          const { data: dep, error: depErr } = await supabase
            .from('agent_deployments')
            .select('*')
            .eq('subscription_id', sub.id)
            .limit(1)
            .maybeSingle();
          if (depErr) throw depErr;
          deploy = dep;
        }

        // Dunning events (if subscription exists)
        let events: DunningEvent[] = [];
        if (sub) {
          const { data: ev, error: evErr } = await supabase
            .from('dunning_events')
            .select('id, event_type, created_at, details')
            .eq('subscription_id', sub.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (evErr) throw evErr;
          events = (ev as DunningEvent[]) ?? [];
        }

        if (cancelled) return;

        setCustomer(cust);
        setSubscription(sub);
        setAddOns(addOnsData);
        setDeployment(deploy);
        setDunningEvents(events);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load client');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // ----- Actions -----

  async function updateSubscriptionStatus(newStatus: string) {
    if (!subscription) return;
    setActionLoading(true);
    try {
      const updateFields: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'suspended') updateFields.suspended_at = new Date().toISOString();
      if (newStatus === 'active') updateFields.suspended_at = null;

      const { error: err } = await supabase
        .from('subscriptions')
        .update(updateFields)
        .eq('id', subscription.id);

      if (err) throw err;

      // Also update deployment status
      if (deployment) {
        const depStatus =
          newStatus === 'active' ? 'running' : newStatus === 'paused' ? 'paused' : 'stopped';
        await supabase
          .from('agent_deployments')
          .update({
            deployment_status: depStatus,
            paused_at: newStatus === 'paused' ? new Date().toISOString() : null,
          })
          .eq('id', deployment.id);
      }

      setSubscription(prev => (prev ? { ...prev, status: newStatus } : null));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function changeTier(newTier: string) {
    if (!subscription) return;
    setActionLoading(true);
    try {
      const { error: err } = await supabase
        .from('subscriptions')
        .update({ tier: newTier })
        .eq('id', subscription.id);

      if (err) throw err;
      setSubscription(prev => (prev ? { ...prev, tier: newTier } : null));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Tier change failed');
    } finally {
      setActionLoading(false);
    }
  }

  // ----- Render -----

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700 font-medium">{error ?? 'Client not found'}</p>
        <Link
          to="/admin/clients"
          className="mt-3 text-xs text-red-600 underline hover:no-underline">
          Back to Clients
        </Link>
      </div>
    );
  }

  const mrr =
    subscription && (subscription.status === 'active' || subscription.status === 'trialing')
      ? (PRICING[subscription.agent_type]?.[subscription.tier] ?? 0)
      : 0;

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Link to="/admin/clients" className="hover:text-purple-600 transition-colors">
          Clients
        </Link>
        <span>/</span>
        <span className="text-neutral-800 font-medium">{customer.business_name}</span>
      </div>

      {/* ---- Business Info ---- */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{customer.business_name}</h1>
            <p className="text-sm text-neutral-500 mt-1">
              {BUSINESS_TYPE_LABELS[customer.business_type] ?? customer.business_type}
            </p>
          </div>
          {subscription && <StatusBadge status={subscription.status} large />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <InfoField label="Contact Name" value={customer.contact_name} />
          <InfoField label="Email" value={customer.contact_email} />
          <InfoField label="Phone" value={customer.contact_phone ?? '--'} />
          <InfoField
            label="Customer Since"
            value={new Date(customer.created_at).toLocaleDateString()}
          />
          <InfoField label="MRR" value={mrr > 0 ? `$${mrr}/mo` : '--'} />
          {customer.stripe_customer_id && (
            <InfoField
              label="Stripe"
              value={
                <a
                  href={`https://dashboard.stripe.com/customers/${customer.stripe_customer_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:underline text-xs">
                  View in Stripe
                </a>
              }
            />
          )}
        </div>
      </div>

      {/* ---- Subscription Details ---- */}
      {subscription ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h2 className="text-sm font-semibold text-neutral-800 mb-4">Subscription</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InfoField
              label="Agent"
              value={AGENT_LABELS[subscription.agent_type] ?? subscription.agent_type}
            />
            <InfoField
              label="Tier"
              value={<span className="capitalize">{subscription.tier}</span>}
            />
            <InfoField label="Status" value={<StatusBadge status={subscription.status} />} />
            <InfoField
              label="Current Period"
              value={
                subscription.current_period_start && subscription.current_period_end
                  ? `${new Date(subscription.current_period_start).toLocaleDateString()} - ${new Date(subscription.current_period_end).toLocaleDateString()}`
                  : '--'
              }
            />
            <InfoField
              label="Cancel at Period End"
              value={subscription.cancel_at_period_end ? 'Yes' : 'No'}
            />
            {subscription.stripe_subscription_id && (
              <InfoField
                label="Stripe Sub"
                value={
                  <a
                    href={`https://dashboard.stripe.com/subscriptions/${subscription.stripe_subscription_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:underline text-xs">
                    View Subscription
                  </a>
                }
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-neutral-100">
            {subscription.status === 'active' && (
              <ActionButton
                label="Pause Agent"
                variant="amber"
                loading={actionLoading}
                onClick={() => updateSubscriptionStatus('paused')}
              />
            )}
            {(subscription.status === 'paused' || subscription.status === 'suspended') && (
              <ActionButton
                label="Resume Agent"
                variant="green"
                loading={actionLoading}
                onClick={() => updateSubscriptionStatus('active')}
              />
            )}
            {subscription.status !== 'canceled' && (
              <>
                {/* Tier change */}
                <select
                  value={subscription.tier}
                  onChange={e => changeTier(e.target.value)}
                  disabled={actionLoading}
                  className="text-xs border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/30">
                  <option value="foundation">Foundation</option>
                  <option value="pro">Pro</option>
                  <option value="elite">Elite</option>
                </select>
                <ActionButton
                  label="Cancel Subscription"
                  variant="red"
                  loading={actionLoading}
                  onClick={() => {
                    if (window.confirm('Cancel this subscription? This will stop billing.')) {
                      void updateSubscriptionStatus('canceled');
                    }
                  }}
                />
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 p-6 text-center">
          <p className="text-sm text-neutral-400">No active subscription</p>
        </div>
      )}

      {/* ---- Add-ons ---- */}
      {addOns.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h2 className="text-sm font-semibold text-neutral-800 mb-4">Active Add-ons</h2>
          <div className="space-y-2">
            {addOns.map(a => (
              <div
                key={a.id}
                className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0">
                <span className="text-sm text-neutral-700">
                  {ADDON_LABELS[a.addon_type] ?? a.addon_type}
                </span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    a.active
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-neutral-100 text-neutral-500 border border-neutral-200'
                  }`}>
                  {a.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Deployment Status ---- */}
      {deployment && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h2 className="text-sm font-semibold text-neutral-800 mb-4">Agent Deployment</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InfoField
              label="Status"
              value={<DeploymentBadge status={deployment.deployment_status} />}
            />
            <InfoField
              label="Mode"
              value={<span className="capitalize">{deployment.deployment_mode}</span>}
            />
            <InfoField
              label="Last Health Check"
              value={
                deployment.last_health_check
                  ? new Date(deployment.last_health_check).toLocaleString()
                  : 'Never'
              }
            />
            {deployment.railway_service_id && (
              <InfoField
                label="Railway"
                value={
                  <a
                    href={`https://railway.app/project/${deployment.railway_service_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:underline text-xs">
                    View Service
                  </a>
                }
              />
            )}
            {deployment.paused_at && (
              <InfoField
                label="Paused At"
                value={new Date(deployment.paused_at).toLocaleString()}
              />
            )}
          </div>
        </div>
      )}

      {/* ---- Dunning History ---- */}
      {dunningEvents.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h2 className="text-sm font-semibold text-neutral-800 mb-4">
            Dunning History ({dunningEvents.length} events)
          </h2>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-neutral-200" />
            <div className="space-y-4 ml-8">
              {dunningEvents.map(ev => (
                <div key={ev.id} className="relative">
                  {/* Dot */}
                  <div
                    className={`absolute -left-[26px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${eventDotColor(
                      ev.event_type
                    )}`}
                  />
                  <div>
                    <p className="text-sm text-neutral-700 font-medium">
                      {eventLabel(ev.event_type)}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {new Date(ev.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components & helpers
// ---------------------------------------------------------------------------

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-0.5">{label}</p>
      <div className="text-sm text-neutral-800">{value}</div>
    </div>
  );
}

function StatusBadge({ status, large = false }: { status: string; large?: boolean }) {
  const styles: Record<string, string> = {
    active: 'bg-green-50 text-green-700 border-green-200',
    trialing: 'bg-green-50 text-green-700 border-green-200',
    past_due: 'bg-amber-50 text-amber-700 border-amber-200',
    suspended: 'bg-red-50 text-red-700 border-red-200',
    canceled: 'bg-neutral-100 text-neutral-500 border-neutral-200',
    paused: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  };

  return (
    <span
      className={`inline-block rounded-full border font-medium capitalize ${
        large ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'
      } ${styles[status] ?? styles.canceled}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function DeploymentBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    running: 'bg-green-50 text-green-700',
    provisioning: 'bg-blue-50 text-blue-700',
    paused: 'bg-amber-50 text-amber-700',
    stopped: 'bg-neutral-100 text-neutral-500',
    failed: 'bg-red-50 text-red-700',
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${styles[status] ?? styles.stopped}`}>
      {status}
    </span>
  );
}

function ActionButton({
  label,
  variant,
  loading,
  onClick,
}: {
  label: string;
  variant: 'green' | 'amber' | 'red';
  loading: boolean;
  onClick: () => void;
}) {
  const colors = {
    green: 'bg-green-600 hover:bg-green-700 text-white',
    amber: 'bg-amber-500 hover:bg-amber-600 text-white',
    red: 'bg-red-600 hover:bg-red-700 text-white',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${colors[variant]}`}>
      {loading ? 'Processing...' : label}
    </button>
  );
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    payment_failed: 'Payment Failed',
    retry_scheduled: 'Retry Scheduled',
    retry_succeeded: 'Retry Succeeded',
    retry_failed: 'Retry Failed',
    email_sent: 'Dunning Email Sent',
    sms_sent: 'Dunning SMS Sent',
    call_made: 'Dunning Call Made',
    grace_period_started: 'Grace Period Started',
    degraded_to_readonly: 'Degraded to Read-Only',
    suspended: 'Account Suspended',
    reactivated: 'Account Reactivated',
    data_export_reminder: 'Data Export Reminder Sent',
    data_deletion_scheduled: 'Data Deletion Scheduled',
  };
  return labels[type] ?? type.replace(/_/g, ' ');
}

function eventDotColor(type: string): string {
  if (['retry_succeeded', 'reactivated'].includes(type)) return 'bg-green-500';
  if (['payment_failed', 'retry_failed', 'suspended', 'data_deletion_scheduled'].includes(type))
    return 'bg-red-500';
  if (['grace_period_started', 'degraded_to_readonly'].includes(type)) return 'bg-amber-500';
  return 'bg-neutral-400';
}
