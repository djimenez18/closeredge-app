import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { AGENT_META } from '../hivemind/hivemindService';
import { fetchConsolidations, forgetMemory, getMemoryStats, searchMemories } from './memoryService';
import type { Memory, MemoryFilter, MemorySource, MemoryStats } from './memoryTypes';

// ── Helpers ──────────────────────────────────────────────────────

function formatRelativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(isoStr).toLocaleDateString();
}

function importanceColor(imp: number): string {
  if (imp >= 0.8) return '#EF4444'; // red — critical
  if (imp >= 0.6) return '#F59E0B'; // amber — important
  if (imp >= 0.4) return '#3B82F6'; // blue — moderate
  return '#6B7280'; // gray — low
}

function sourceLabel(source: MemorySource): string {
  const labels: Record<MemorySource, string> = {
    conversation: 'Chat',
    observation: 'Observed',
    obsidian: 'Obsidian',
    integration: 'Integration',
    manual: 'Manual',
  };
  return labels[source] ?? source;
}

// ── Agent filter chip ────────────────────────────────────────────

function AgentChip({
  agentId,
  active,
  onClick,
}: {
  agentId: string;
  active: boolean;
  onClick: () => void;
}) {
  const meta = AGENT_META[agentId];
  const color = meta?.color ?? '#888';
  const name = meta?.name ?? agentId;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        active ? 'ring-2 ring-offset-1 ring-offset-black/80' : 'opacity-50 hover:opacity-80'
      }`}
      style={{
        backgroundColor: active ? `${color}25` : `${color}10`,
        color,
        borderColor: color,
        outlineColor: color,
      }}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </button>
  );
}

// ── Importance bar ───────────────────────────────────────────────

function ImportanceBar({ value }: { value: number }) {
  const color = importanceColor(value);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden max-w-[80px]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-mono tabular-nums" style={{ color }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ── Entity tag ───────────────────────────────────────────────────

function EntityTag({ entity }: { entity: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/20">
      {entity}
    </span>
  );
}

// ── Source badge ──────────────────────────────────────────────────

function SourceBadge({ source }: { source: MemorySource }) {
  const colors: Record<MemorySource, string> = {
    conversation: '#3B82F6',
    observation: '#10B981',
    obsidian: '#8B5CF6',
    integration: '#F59E0B',
    manual: '#6B7280',
  };
  const color = colors[source] ?? '#6B7280';

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}>
      {sourceLabel(source)}
    </span>
  );
}

// ── Memory card ──────────────────────────────────────────────────

function MemoryCard({ memory, onForget }: { memory: Memory; onForget: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const meta = AGENT_META[memory.agent_id];
  const agentColor = meta?.color ?? '#888';
  const agentName = meta?.name ?? memory.agent_id;

  return (
    <div className="group border border-white/[0.06] rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-all">
      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: agentColor }}>
              {agentName}
            </span>
            <SourceBadge source={memory.source} />
            <ImportanceBar value={memory.importance} />
          </div>
          <span className="text-[10px] text-white/30 tabular-nums whitespace-nowrap shrink-0">
            {formatRelativeTime(memory.created_at)}
          </span>
        </div>

        {/* Summary */}
        <p className="text-sm text-white/75 leading-relaxed mb-2">{memory.summary}</p>

        {/* Entities */}
        {memory.entities.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {memory.entities.map(e => (
              <EntityTag key={e} entity={e} />
            ))}
          </div>
        )}

        {/* Topics */}
        {memory.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {memory.topics.map(t => (
              <span key={t} className="text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-2">
          {memory.raw_text && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-white/40 hover:text-white/60 transition-colors flex items-center gap-1">
              <svg
                className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Raw text
            </button>
          )}

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="ml-auto text-[10px] text-red-400/40 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
              Forget
            </button>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] text-red-400/70">Delete this memory?</span>
              <button
                onClick={() => {
                  onForget(memory.id);
                  setConfirming(false);
                }}
                className="text-[10px] text-red-400 font-semibold hover:text-red-300">
                Yes
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-[10px] text-white/40 hover:text-white/60">
                No
              </button>
            </div>
          )}
        </div>

        {/* Expanded raw text */}
        {expanded && memory.raw_text && (
          <div className="mt-3 p-3 rounded-lg bg-black/30 border border-white/5">
            <p className="text-xs text-white/50 font-mono leading-relaxed whitespace-pre-wrap">
              {memory.raw_text}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Consolidation card ───────────────────────────────────────────

function ConsolidationCard({
  consolidation,
}: {
  consolidation: {
    id: number;
    agent_id: string;
    source_ids: number[];
    summary: string;
    insight: string | null;
    created_at: string;
  };
}) {
  const meta = AGENT_META[consolidation.agent_id];
  const agentColor = meta?.color ?? '#888';
  const agentName = meta?.name ?? consolidation.agent_id;

  return (
    <div className="border border-amber-500/20 rounded-xl bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <svg
          className="w-4 h-4 text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <span className="text-xs font-semibold text-amber-400">Pattern Detected</span>
        <span className="text-xs" style={{ color: agentColor }}>
          {agentName}
        </span>
        <span className="ml-auto text-[10px] text-white/30 tabular-nums">
          {formatRelativeTime(consolidation.created_at)}
        </span>
      </div>

      <p className="text-sm text-white/70 leading-relaxed mb-2">{consolidation.summary}</p>

      {consolidation.insight && (
        <div className="flex items-start gap-2 mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/15">
          <span className="text-amber-400 text-xs font-semibold shrink-0 mt-0.5">Insight:</span>
          <p className="text-xs text-amber-200/80 leading-relaxed">{consolidation.insight}</p>
        </div>
      )}

      <div className="mt-2 text-[10px] text-white/30">
        Synthesized from {consolidation.source_ids.length} memories
      </div>
    </div>
  );
}

// ── Stats panel ──────────────────────────────────────────────────

function StatsPanel({ stats }: { stats: MemoryStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Total Memories</p>
        <p className="text-2xl font-bold text-white/90 tabular-nums">{stats.totalMemories}</p>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Avg Importance</p>
        <p
          className="text-2xl font-bold tabular-nums"
          style={{ color: importanceColor(stats.avgImportance) }}>
          {stats.avgImportance.toFixed(2)}
        </p>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Active Agents</p>
        <p className="text-2xl font-bold text-white/90 tabular-nums">{stats.byAgent.length}</p>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Top Entity</p>
        <p className="text-sm font-semibold text-purple-300 truncate">
          {stats.topEntities[0]?.entity ?? '--'}
        </p>
        <p className="text-[10px] text-white/30 tabular-nums">
          {stats.topEntities[0]?.count ?? 0} mentions
        </p>
      </div>
    </div>
  );
}

// ── Main Memory Explorer ─────────────────────────────────────────

export function MemoryExplorer() {
  // State
  const [memories, setMemories] = useState<Memory[]>([]);
  const [consolidations, setConsolidations] = useState<
    Array<{
      id: number;
      agent_id: string;
      source_ids: number[];
      summary: string;
      insight: string | null;
      created_at: string;
    }>
  >([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAgent, setActiveAgent] = useState<string | undefined>();
  const [activeSource, setActiveSource] = useState<MemorySource | undefined>();
  const [minImportance, setMinImportance] = useState<number>(0);
  const [tab, setTab] = useState<'memories' | 'patterns'>('memories');

  // Agents present in the data
  const availableAgents = useMemo(() => stats?.byAgent.map(a => a.agent_id) ?? [], [stats]);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const filters: MemoryFilter = {};
      if (activeAgent) filters.agentId = activeAgent;
      if (activeSource) filters.source = activeSource;
      if (minImportance > 0) filters.minImportance = minImportance;

      const [memResult, consResult, statsResult] = await Promise.all([
        searchMemories(searchQuery, filters),
        fetchConsolidations(activeAgent),
        getMemoryStats(),
      ]);

      setMemories(memResult);
      setConsolidations(consResult);
      setStats(statsResult);
    } catch (err) {
      console.error('[MemoryExplorer] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeAgent, activeSource, minImportance]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handlers
  const handleForget = useCallback(async (id: number) => {
    const ok = await forgetMemory(id);
    if (ok) {
      setMemories(prev => prev.filter(m => m.id !== id));
    }
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void loadData();
    },
    [loadData]
  );

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white/90">Memory Explorer</h1>
          <p className="text-sm text-white/40 mt-1">
            Browse, search, and manage long-term memories across all agents
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="px-3 py-1.5 text-xs text-purple-400/70 hover:text-purple-400 border border-purple-400/20 hover:border-purple-400/40 rounded-lg transition-all disabled:opacity-50">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Stats */}
      {stats && <StatsPanel stats={stats} />}

      {/* Search & Filters */}
      <div className="space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
            className="flex-1 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white/80 placeholder:text-white/30 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-300 text-sm font-medium hover:bg-purple-600/30 transition-colors">
            Search
          </button>
        </form>

        {/* Agent filters */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveAgent(undefined)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              !activeAgent
                ? 'bg-white/10 text-white/80'
                : 'bg-white/[0.03] text-white/40 hover:text-white/60'
            }`}>
            All Agents
          </button>
          {availableAgents.map(agentId => (
            <AgentChip
              key={agentId}
              agentId={agentId}
              active={activeAgent === agentId}
              onClick={() => setActiveAgent(activeAgent === agentId ? undefined : agentId)}
            />
          ))}
        </div>

        {/* Source and importance filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={activeSource ?? ''}
            onChange={e => setActiveSource((e.target.value as MemorySource) || undefined)}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white/60 focus:outline-none">
            <option value="">All Sources</option>
            <option value="conversation">Conversation</option>
            <option value="observation">Observation</option>
            <option value="obsidian">Obsidian</option>
            <option value="integration">Integration</option>
            <option value="manual">Manual</option>
          </select>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/40">Min importance:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={minImportance}
              onChange={e => setMinImportance(parseFloat(e.target.value))}
              className="w-24 accent-purple-500"
            />
            <span className="text-[10px] text-white/50 tabular-nums w-6">
              {minImportance.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-white/[0.06]">
        <button
          onClick={() => setTab('memories')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            tab === 'memories'
              ? 'text-purple-400 border-purple-400'
              : 'text-white/40 border-transparent hover:text-white/60'
          }`}>
          Memories ({memories.length})
        </button>
        <button
          onClick={() => setTab('patterns')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            tab === 'patterns'
              ? 'text-amber-400 border-amber-400'
              : 'text-white/40 border-transparent hover:text-white/60'
          }`}>
          Patterns ({consolidations.length})
        </button>
      </div>

      {/* Content */}
      {tab === 'memories' ? (
        <div className="space-y-3">
          {loading && memories.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-white/30">
              <svg className="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Loading memories...
            </div>
          ) : memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/30">
              <svg
                className="w-10 h-10 mb-3 text-white/10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              <p className="text-sm">No memories found</p>
              <p className="text-xs mt-1">Memories are created from agent conversations</p>
            </div>
          ) : (
            memories.map(memory => (
              <MemoryCard key={memory.id} memory={memory} onForget={handleForget} />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {consolidations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/30">
              <p className="text-sm">No patterns detected yet</p>
              <p className="text-xs mt-1">
                Patterns emerge as the system consolidates related memories
              </p>
            </div>
          ) : (
            consolidations.map(c => <ConsolidationCard key={c.id} consolidation={c} />)
          )}
        </div>
      )}
    </div>
  );
}
