import React, { useMemo } from 'react';

import { AGENT_META, type AgentStats } from './hivemindService';

// ── Agent archetype descriptions ─────────────────────────────────────

const AGENT_DESCRIPTIONS: Record<string, string> = {
  eden: 'Residential real estate executive',
  crest: 'Commercial real estate executive',
  lexis: 'Legal compliance and contracts',
  haven: 'Healthcare and wellness analysis',
  forge: 'Services coordination and ops',
  nora: 'Property management and spatial',
};

// ── SVG icons per archetype ──────────────────────────────────────────

function AgentSvgIcon({ agentId, size = 20 }: { agentId: string; size?: number }) {
  const iconPaths: Record<string, React.ReactNode> = {
    eden: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
      />
    ),
    crest: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
      />
    ),
    lexis: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z"
      />
    ),
    haven: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
      />
    ),
    forge: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.42 15.17l-5.27-3.03a1.125 1.125 0 01-.156-1.862l7.5-6.25a1.125 1.125 0 011.762.49l1.588 5.556M11.42 15.17l4.655 2.774a1.125 1.125 0 001.395-.26l3.28-4.379a1.125 1.125 0 00-.476-1.756l-5.269-2.026M11.42 15.17l-1.17 4.088a1.125 1.125 0 01-1.597.684l-3.75-2.25a1.125 1.125 0 01-.156-1.862l5.673-4.66"
      />
    ),
    nora: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
      />
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="shrink-0">
      {iconPaths[agentId] ?? iconPaths.eden}
    </svg>
  );
}

// ── Status indicator ─────────────────────────────────────────────────

function StatusDot({ lastActive }: { lastActive: string | null }) {
  if (!lastActive) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-[#9ca3af]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#9ca3af]/40" />
        Idle
      </span>
    );
  }
  const elapsed = Date.now() - new Date(lastActive).getTime();
  const isActive = elapsed < 3600000; // 1 hour
  const isRecent = elapsed < 86400000; // 24 hours

  if (isActive) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-[#10b981]">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#10b981]" />
        </span>
        Active
      </span>
    );
  }
  if (isRecent) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] text-[#fbbf24]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" />
        Recent
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-[#9ca3af]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#9ca3af]/40" />
      Idle
    </span>
  );
}

// ── Agent Card ───────────────────────────────────────────────────────

interface AgentCardProps {
  agentId: string;
  stats: AgentStats | undefined;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function AgentCard({ agentId, stats, isSelected, onSelect }: AgentCardProps) {
  const meta = AGENT_META[agentId];
  if (!meta) return null;

  const totalEntries = stats?.total_entries ?? 0;
  const topAction = stats?.top_actions[0];

  return (
    <button
      onClick={() => onSelect(agentId)}
      className={`group relative flex flex-col gap-2 p-3 rounded-lg border transition-all duration-200 text-left w-full min-w-[140px]
        ${
          isSelected
            ? 'bg-[#7C3AED]/10 border-[#7C3AED]/40 dark:bg-[#7C3AED]/10 dark:border-[#7C3AED]/40'
            : 'bg-white/50 border-gray-200 hover:border-gray-300 dark:bg-[#1a1a22] dark:border-[#25252f] dark:hover:border-[#7C3AED]/30'
        }`}>
      {/* Header row */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          style={{
            backgroundColor: isSelected ? `${meta.color}20` : `${meta.color}10`,
            color: meta.color,
          }}>
          <AgentSvgIcon agentId={agentId} size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-900 dark:text-[#e8e8e8] truncate">
            {meta.name}
          </div>
          <StatusDot lastActive={stats?.last_active ?? null} />
        </div>
      </div>

      {/* Description */}
      <p className="text-[10px] text-gray-500 dark:text-[#9ca3af] leading-tight">
        {AGENT_DESCRIPTIONS[agentId] ?? 'AI agent'}
      </p>

      {/* Stats row */}
      <div className="flex items-center justify-between mt-auto pt-1 border-t border-gray-100 dark:border-[#25252f]">
        <span className="text-[10px] text-gray-400 dark:text-[#9ca3af] tabular-nums">
          {totalEntries > 0 ? `${totalEntries} entries` : 'No activity'}
        </span>
        {topAction && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${meta.color}15`, color: meta.color }}>
            {topAction.action.split('_').join(' ')}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Agent Cards Grid ─────────────────────────────────────────────────

interface AgentCardsProps {
  stats: AgentStats[];
  selectedAgent: string;
  onSelectAgent: (id: string) => void;
}

export function AgentCards({ stats, selectedAgent, onSelectAgent }: AgentCardsProps) {
  const statsMap = useMemo(() => {
    const map: Record<string, AgentStats> = {};
    for (const s of stats) map[s.agent_id] = s;
    return map;
  }, [stats]);

  const agents = Object.keys(AGENT_META);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {agents.map(id => (
        <AgentCard
          key={id}
          agentId={id}
          stats={statsMap[id]}
          isSelected={selectedAgent === id}
          onSelect={agent => onSelectAgent(selectedAgent === agent ? 'all' : agent)}
        />
      ))}
    </div>
  );
}
