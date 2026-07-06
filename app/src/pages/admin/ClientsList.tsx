/**
 * ClientsList -- client management table.
 *
 * Lists all customers joined with their subscriptions.
 * Features: search, filter by agent type / tier / status, sortable columns.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientRow {
  id: string;
  business_name: string;
  contact_name: string;
  contact_email: string;
  business_type: string;
  agent_type: string | null;
  tier: string | null;
  status: string | null;
  mrr: number;
  last_active: string;
  subscription_id: string | null;
}

type SortField = 'business_name' | 'agent_type' | 'tier' | 'status' | 'mrr' | 'last_active';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Pricing lookup
// ---------------------------------------------------------------------------

const PRICING: Record<string, Record<string, number>> = {
  eden: { foundation: 300, pro: 500, elite: 750 },
  crest: { foundation: 500, pro: 800, elite: 1200 },
  lexis: { foundation: 500, pro: 800, elite: 1200 },
  haven: { foundation: 500, pro: 750, elite: 1000 },
  forge: { foundation: 300, pro: 500, elite: 700 },
  nora: { foundation: 250, pro: 400, elite: 600 },
};

const AGENT_OPTIONS = ['eden', 'crest', 'lexis', 'haven', 'forge', 'nora'];
const TIER_OPTIONS = ['foundation', 'pro', 'elite'];
const STATUS_OPTIONS = ['active', 'trialing', 'past_due', 'suspended', 'canceled', 'paused'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClientsList() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('business_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // ----- Fetch data -----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Fetch customers
        const { data: customers, error: custErr } = await supabase
          .from('customers')
          .select('id, business_name, contact_name, contact_email, business_type, updated_at');

        if (custErr) throw custErr;

        // Fetch subscriptions
        const { data: subs, error: subsErr } = await supabase
          .from('subscriptions')
          .select('id, customer_id, agent_type, tier, status, updated_at')
          .order('created_at', { ascending: false });

        if (subsErr) throw subsErr;

        if (cancelled) return;

        // Build a map: customer_id -> latest subscription
        const subMap = new Map<string, (typeof subs)[number]>();
        for (const s of subs ?? []) {
          if (!subMap.has(s.customer_id)) {
            subMap.set(s.customer_id, s);
          }
        }

        const rows: ClientRow[] = (customers ?? []).map(c => {
          const sub = subMap.get(c.id);
          const mrr =
            sub && (sub.status === 'active' || sub.status === 'trialing')
              ? (PRICING[sub.agent_type]?.[sub.tier] ?? 0)
              : 0;
          return {
            id: c.id,
            business_name: c.business_name,
            contact_name: c.contact_name,
            contact_email: c.contact_email,
            business_type: c.business_type,
            agent_type: sub?.agent_type ?? null,
            tier: sub?.tier ?? null,
            status: sub?.status ?? null,
            mrr,
            last_active: sub?.updated_at ?? c.updated_at,
            subscription_id: sub?.id ?? null,
          };
        });

        setClients(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load clients');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ----- Filter + sort -----
  const filtered = useMemo(() => {
    let result = clients;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        c =>
          c.business_name.toLowerCase().includes(q) ||
          c.contact_name.toLowerCase().includes(q) ||
          c.contact_email.toLowerCase().includes(q)
      );
    }
    if (filterAgent) result = result.filter(c => c.agent_type === filterAgent);
    if (filterTier) result = result.filter(c => c.tier === filterTier);
    if (filterStatus) result = result.filter(c => c.status === filterStatus);

    // Sort
    result = [...result].sort((a, b) => {
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [clients, search, filterAgent, filterTier, filterStatus, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
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

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700 font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Clients</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {clients.length} total &middot; {clients.filter(c => c.status === 'active').length} active
        </p>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400"
          />
        </div>

        <FilterSelect
          value={filterAgent}
          onChange={setFilterAgent}
          options={AGENT_OPTIONS}
          placeholder="All Agents"
          capitalize
        />
        <FilterSelect
          value={filterTier}
          onChange={setFilterTier}
          options={TIER_OPTIONS}
          placeholder="All Tiers"
          capitalize
        />
        <FilterSelect
          value={filterStatus}
          onChange={setFilterStatus}
          options={STATUS_OPTIONS}
          placeholder="All Statuses"
          capitalize
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left">
              <SortableHeader
                label="Business Name"
                field="business_name"
                current={sortField}
                dir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label="Agent"
                field="agent_type"
                current={sortField}
                dir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label="Tier"
                field="tier"
                current={sortField}
                dir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label="Status"
                field="status"
                current={sortField}
                dir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label="MRR"
                field="mrr"
                current={sortField}
                dir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label="Last Active"
                field="last_active"
                current={sortField}
                dir={sortDir}
                onClick={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-neutral-400 text-sm">
                  No clients match the current filters
                </td>
              </tr>
            ) : (
              filtered.map(c => (
                <tr
                  key={c.id}
                  className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/clients/${c.id}`}
                      className="font-medium text-neutral-800 hover:text-purple-600 transition-colors">
                      {c.business_name}
                    </Link>
                    <p className="text-xs text-neutral-400">{c.contact_email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="capitalize text-neutral-700">{c.agent_type ?? '--'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="capitalize text-neutral-700">{c.tier ?? '--'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-700 font-medium">
                    {c.mrr > 0 ? `$${c.mrr}` : '--'}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">
                    {c.last_active ? new Date(c.last_active).toLocaleDateString() : '--'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-neutral-400 text-xs">--</span>;

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
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[status] ?? styles.canceled}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function SortableHeader({
  label,
  field,
  current,
  dir,
  onClick,
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onClick: (f: SortField) => void;
}) {
  const isActive = field === current;
  return (
    <th className="px-4 py-3 text-xs font-semibold text-neutral-500 whitespace-nowrap">
      <button
        type="button"
        onClick={() => onClick(field)}
        className="flex items-center gap-1 hover:text-neutral-700 transition-colors">
        {label}
        {isActive && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={dir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
            />
          </svg>
        )}
      </button>
    </th>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  capitalize = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  capitalize?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400">
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o} value={o}>
          {capitalize ? o.charAt(0).toUpperCase() + o.slice(1) : o}
        </option>
      ))}
    </select>
  );
}
