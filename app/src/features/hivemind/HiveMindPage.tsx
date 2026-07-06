import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AGENT_META,
  type AgentStats,
  fetchHiveMindEntries,
  getAgentStats,
  type HiveMindEntry,
  searchHiveMind,
} from './hivemindService';
import { NeuralConstellation } from './NeuralConstellation';

// ── Helpers ─────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function formatAction(action: string): string {
  return action
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Agent Roster Strip ──────────────────────────────────────────────

function AgentRosterStrip({
  stats,
  activeFilter,
  onFilter,
}: {
  stats: AgentStats[];
  activeFilter: string;
  onFilter: (id: string) => void;
}) {
  const statsMap = useMemo(() => {
    const m: Record<string, AgentStats> = {};
    for (const s of stats) m[s.agent_id] = s;
    return m;
  }, [stats]);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {Object.entries(AGENT_META).map(([id, meta]) => {
        const s = statsMap[id];
        const isActive = activeFilter === id;
        const now = Date.now();
        const lastMs = s?.last_active ? now - new Date(s.last_active).getTime() : Infinity;
        const online = lastMs < 3600000;

        return (
          <button
            key={id}
            onClick={() => onFilter(isActive ? 'all' : id)}
            className={`ce-press-scale group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 shrink-0 ${
              isActive
                ? 'bg-[#7C3AED]/10 border-[#7C3AED]/30'
                : 'bg-white dark:bg-[#141418] border-gray-200 dark:border-[#25252f] hover:border-[#7C3AED]/20'
            }`}>
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0"
              style={{ backgroundColor: `${meta.color}18`, color: meta.color }}>
              {meta.name.charAt(0)}
            </div>
            <div className="text-left">
              <div className="text-xs font-semibold text-gray-900 dark:text-[#e8e8e8] leading-none">
                {meta.name}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    online ? 'bg-[#34C759]' : 'bg-[#888]/40'
                  }`}
                />
                <span className="text-[9px] font-mono text-gray-400 dark:text-[#888] uppercase tracking-wider">
                  {online ? 'Online' : 'Idle'}
                </span>
              </div>
            </div>
            {(s?.total_entries ?? 0) > 0 && (
              <span
                className="ml-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full tabular-nums"
                style={{ backgroundColor: `${meta.color}15`, color: meta.color }}>
                {s?.total_entries}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Activity Feed Table ─────────────────────────────────────────────

function ActivityFeedTable({
  entries,
  loading,
  hasMore,
  blurred,
  onLoadMore,
  onSelect,
}: {
  entries: HiveMindEntry[];
  loading: boolean;
  hasMore: boolean;
  blurred: boolean;
  onLoadMore: () => void;
  onSelect: (e: HiveMindEntry) => void;
}) {
  if (!loading && entries.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-8">
        <div className="w-16 h-16 rounded-2xl bg-[#7C3AED]/10 flex items-center justify-center mb-5">
          <svg
            className="w-8 h-8 text-[#7C3AED]/60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
            />
          </svg>
        </div>
        <p className="text-sm font-semibold text-gray-600 dark:text-[#e8e8e8]/80 text-center mb-2">
          The hive is quiet
        </p>
        <p className="text-xs text-gray-400 dark:text-[#888] text-center max-w-[260px] leading-relaxed">
          As your AI employees work -- sending emails, qualifying leads, drafting contracts -- their
          activity flows here in real time. The hive learns as the agents work.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Table header */}
      <div className="grid grid-cols-[100px_100px_140px_1fr] gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-[#25252f] bg-gray-50/50 dark:bg-[#141418]/50">
        <span className="text-[10px] font-mono font-medium text-gray-400 dark:text-[#888] uppercase tracking-widest">
          Time
        </span>
        <span className="text-[10px] font-mono font-medium text-gray-400 dark:text-[#888] uppercase tracking-widest">
          Agent
        </span>
        <span className="text-[10px] font-mono font-medium text-gray-400 dark:text-[#888] uppercase tracking-widest">
          Action
        </span>
        <span className="text-[10px] font-mono font-medium text-gray-400 dark:text-[#888] uppercase tracking-widest">
          Summary
        </span>
      </div>

      {/* Rows */}
      <div
        className={`flex-1 overflow-y-auto transition-all duration-300 ${
          blurred ? 'blur-sm select-none pointer-events-none' : ''
        }`}>
        {entries.map((entry, idx) => {
          const meta = AGENT_META[entry.agent_id];
          const agentName = meta?.name ?? entry.agent_id;
          const agentColor = meta?.color ?? '#888';

          return (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="w-full grid grid-cols-[100px_100px_140px_1fr] gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-[#25252f]/50 text-left hover:bg-gray-50 dark:hover:bg-[#1a1a22] transition-colors animate-fade-up"
              style={{ animationDelay: `${Math.min(idx, 15) * 30}ms`, animationFillMode: 'both' }}>
              {/* Time */}
              <span className="text-[11px] font-mono text-gray-400 dark:text-[#888] tabular-nums truncate">
                {formatRelativeTime(entry.created_at)}
              </span>

              {/* Agent */}
              <span className="text-xs font-semibold truncate" style={{ color: agentColor }}>
                {agentName}
              </span>

              {/* Action */}
              <span className="text-[11px] font-mono text-gray-500 dark:text-[#9ca3af] truncate">
                {formatAction(entry.action)}
              </span>

              {/* Summary */}
              <span className="text-xs text-gray-600 dark:text-[#e8e8e8]/70 truncate">
                {entry.summary}
              </span>
            </button>
          );
        })}

        {/* Load more */}
        {hasMore && (
          <div className="py-4 flex justify-center">
            <button
              onClick={onLoadMore}
              disabled={loading}
              className="ce-press-scale px-4 py-2 text-xs text-[#7C3AED] hover:text-[#A855F7] border border-[#7C3AED]/20 hover:border-[#7C3AED]/40 rounded-lg transition-all duration-200 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#7C3AED]/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0f0f12]">
              {loading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>

      {/* Loading skeleton rows */}
      {loading && entries.length === 0 && (
        <div className="space-y-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[100px_100px_140px_1fr] gap-3 px-4 py-3 border-b border-gray-100 dark:border-[#25252f]/50 animate-stagger-fade-up"
              style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'both' }}>
              <div className="ce-skeleton h-3 w-16" />
              <div className="ce-skeleton h-3 w-14" />
              <div className="ce-skeleton h-3 w-20" />
              <div className="ce-skeleton h-3 w-3/4" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────

export function HiveMindPage() {
  const [entries, setEntries] = useState<HiveMindEntry[]>([]);
  const [agentFilter, setAgentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [stats, setStats] = useState<AgentStats[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<HiveMindEntry | null>(null);
  const [privacyBlur, setPrivacyBlur] = useState(false);

  // ── Data loading ────────────────────────────────────────────────

  const loadEntries = useCallback(
    async (reset = false) => {
      setLoading(true);
      try {
        const offset = reset ? 0 : entries.length;
        const agentId = agentFilter === 'all' ? undefined : agentFilter;

        let data: HiveMindEntry[];
        if (searchQuery.trim()) {
          data = await searchHiveMind(searchQuery);
          setHasMore(false);
        } else {
          data = await fetchHiveMindEntries(agentId, 50, offset);
          setHasMore(data.length === 50);
        }

        if (reset) {
          setEntries(data);
        } else {
          setEntries(prev => [...prev, ...data]);
        }
      } catch (err) {
        console.error('[hivemind] load error:', err);
      } finally {
        setLoading(false);
      }
    },
    [agentFilter, searchQuery, entries.length]
  );

  useEffect(() => {
    loadEntries(true);
  }, [agentFilter]);

  useEffect(() => {
    getAgentStats().then(setStats).catch(console.error);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      loadEntries(true);
      return;
    }
    const timer = setTimeout(() => loadEntries(true), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Stats ───────────────────────────────────────────────────────

  const totalEntries = useMemo(() => stats.reduce((sum, s) => sum + s.total_entries, 0), [stats]);

  const activeAgents = useMemo(() => {
    const now = Date.now();
    return stats.filter(s => s.last_active && now - new Date(s.last_active).getTime() < 3600000)
      .length;
  }, [stats]);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0f0f12] text-gray-900 dark:text-[#e8e8e8]">
      {/* ── Header with subtle constellation bg ────────────────── */}
      <div
        className="relative shrink-0 overflow-hidden animate-fade-in"
        style={{ height: 120, animationDuration: '0.6s' }}>
        {/* Subtle constellation at low opacity */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f0f12] to-[#1a1a22] opacity-80 dark:opacity-100">
          <NeuralConstellation />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#0f0f12] via-white/60 dark:via-[#0f0f12]/60 to-transparent" />

        {/* Header content */}
        <div className="relative z-10 flex items-center justify-between h-full px-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#7C3AED]/20 backdrop-blur-sm flex items-center justify-center border border-[#7C3AED]/30">
              <svg
                className="w-4.5 h-4.5 text-[#7C3AED]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-display font-bold text-white dark:text-white tracking-tight">
                Hive Mind
              </h1>
              <p className="text-[11px] text-gray-400 dark:text-[#888]">
                Collective intelligence across your AI employees
              </p>
            </div>
          </div>

          {/* Right: stats bar + privacy toggle */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-4">
              <div className="text-right">
                <div className="text-lg font-display font-bold text-[#7C3AED] tabular-nums leading-none">
                  {totalEntries}
                </div>
                <div className="text-[9px] font-mono text-[#888] uppercase tracking-widest mt-0.5">
                  Operations
                </div>
              </div>
              <div className="w-px h-8 bg-[#25252f]" />
              <div className="text-right">
                <div className="text-lg font-display font-bold text-[#34C759] tabular-nums leading-none">
                  {activeAgents}
                </div>
                <div className="text-[9px] font-mono text-[#888] uppercase tracking-widest mt-0.5">
                  Active
                </div>
              </div>
              <div className="w-px h-8 bg-[#25252f]" />
              <div className="text-right">
                <div className="text-lg font-display font-bold text-[#5B9BF3] tabular-nums leading-none">
                  {stats.length}
                </div>
                <div className="text-[9px] font-mono text-[#888] uppercase tracking-widest mt-0.5">
                  Agents
                </div>
              </div>
            </div>

            {/* Privacy blur toggle */}
            <button
              onClick={() => setPrivacyBlur(!privacyBlur)}
              title={privacyBlur ? 'Show feed' : 'Hide feed (privacy)'}
              className="p-2 rounded-lg text-gray-400 dark:text-[#888] hover:text-gray-600 dark:hover:text-[#e8e8e8] hover:bg-white/10 transition-colors">
              {privacyBlur ? (
                <svg
                  className="w-4.5 h-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4.5 h-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Agent roster strip ─────────────────────────────────── */}
      <div
        className="shrink-0 px-6 py-3 border-b border-gray-200 dark:border-[#25252f] animate-stagger-fade-up"
        style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
        <AgentRosterStrip stats={stats} activeFilter={agentFilter} onFilter={setAgentFilter} />
      </div>

      {/* ── Search bar ─────────────────────────────────────────── */}
      <div className="shrink-0 px-6 py-3 border-b border-gray-200 dark:border-[#25252f]">
        <div className="relative max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-[#888]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search operations..."
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-gray-50 dark:bg-[#141418] border border-gray-200 dark:border-[#25252f] focus:border-[#7C3AED]/50 focus:ring-1 focus:ring-[#7C3AED]/20 focus:outline-none text-sm text-gray-900 dark:text-[#e8e8e8] placeholder:text-gray-400 dark:placeholder:text-[#888]/60 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 dark:text-[#888] hover:text-gray-600 dark:hover:text-[#e8e8e8] transition-colors">
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Main content: feed table + detail panel ────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Activity feed table */}
        <div className="flex-1 flex flex-col min-w-0">
          <ActivityFeedTable
            entries={entries}
            loading={loading}
            hasMore={hasMore}
            blurred={privacyBlur}
            onLoadMore={() => loadEntries(false)}
            onSelect={setSelectedEntry}
          />
        </div>

        {/* Detail panel */}
        <div className="w-[340px] shrink-0 flex flex-col border-l border-gray-200 dark:border-[#25252f] bg-gray-50 dark:bg-[#141418]">
          {selectedEntry ? (
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                      style={{
                        backgroundColor: `${AGENT_META[selectedEntry.agent_id]?.color ?? '#888'}18`,
                        color: AGENT_META[selectedEntry.agent_id]?.color ?? '#888',
                      }}>
                      {(AGENT_META[selectedEntry.agent_id]?.name ?? selectedEntry.agent_id)
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div
                        className="text-sm font-semibold"
                        style={{ color: AGENT_META[selectedEntry.agent_id]?.color }}>
                        {AGENT_META[selectedEntry.agent_id]?.name ?? selectedEntry.agent_id}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400 dark:text-[#888]">
                        {new Date(selectedEntry.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedEntry(null)}
                    className="p-1.5 rounded-lg text-gray-400 dark:text-[#888] hover:bg-gray-200 dark:hover:bg-[#25252f] transition-colors">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-white dark:bg-[#1a1a22] border border-gray-200 dark:border-[#25252f]">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-gray-400 dark:text-[#888] mb-1.5">
                      Action
                    </div>
                    <div className="text-xs text-gray-700 dark:text-[#e8e8e8] font-mono">
                      {formatAction(selectedEntry.action)}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-white dark:bg-[#1a1a22] border border-gray-200 dark:border-[#25252f]">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-gray-400 dark:text-[#888] mb-1.5">
                      Summary
                    </div>
                    <div className="text-xs text-gray-700 dark:text-[#e8e8e8]/80 leading-relaxed">
                      {selectedEntry.summary}
                    </div>
                  </div>

                  {selectedEntry.artifacts && (
                    <div className="p-3 rounded-lg bg-white dark:bg-[#1a1a22] border border-gray-200 dark:border-[#25252f]">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-gray-400 dark:text-[#888] mb-1.5">
                        Artifacts
                      </div>
                      <pre className="text-[11px] text-gray-600 dark:text-[#e8e8e8]/50 font-mono break-all whitespace-pre-wrap">
                        {JSON.stringify(selectedEntry.artifacts, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-white dark:bg-[#1a1a22] border border-gray-200 dark:border-[#25252f]">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-gray-400 dark:text-[#888] mb-1.5">
                      Session
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-[#9ca3af] font-mono truncate">
                      {selectedEntry.chat_id}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-8">
              <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-[#1a1a22] flex items-center justify-center mb-4">
                <svg
                  className="w-7 h-7 text-gray-300 dark:text-[#25252f]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-[#9ca3af] text-center">
                Select an operation
              </p>
              <p className="text-xs mt-1.5 text-gray-400 dark:text-[#888]/60 text-center">
                Click any row to inspect its full context
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
