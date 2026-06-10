import React, { useCallback, useRef, useState } from 'react';
import type { RosterAgent } from './warRoomRouter';

// ── Agent metadata ───────────────────────────────────────────────────

export const CLOSEREDGE_AGENTS: RosterAgent[] = [
  {
    id: 'eden',
    name: 'Eden',
    description: 'Residential real estate specialist. Buyer/seller representation, market analysis, and property valuation.',
    industry: 'Residential Real Estate',
    enabled: true,
  },
  {
    id: 'crest',
    name: 'Crest',
    description: 'Commercial real estate analyst. Cap rates, NOI, tenant mix, and investment property evaluation.',
    industry: 'Commercial Real Estate',
    enabled: true,
  },
  {
    id: 'forge',
    name: 'Forge',
    description: 'Home services contractor coordinator. Estimates, scheduling, and job management.',
    industry: 'Home Services',
    enabled: true,
  },
  {
    id: 'haven',
    name: 'Haven',
    description: 'Medical and dental practice operations. Patient intake, scheduling, and compliance.',
    industry: 'Healthcare',
    enabled: true,
  },
  {
    id: 'lexis',
    name: 'Lexis',
    description: 'Legal practice management. Client intake, case evaluation, and compliance.',
    industry: 'Legal',
    enabled: true,
  },
  {
    id: 'nora',
    name: 'Nora',
    description: 'Property management and landlord operations. Tenant relations, leasing, and maintenance.',
    industry: 'Property Management',
    enabled: true,
  },
];

export const AGENT_COLORS: Record<string, string> = {
  eden:  '#7C3AED',
  crest: '#3B82F6',
  forge: '#EF4444',
  haven: '#10B981',
  lexis: '#F59E0B',
  nora:  '#A78BFA',
};

export const AGENT_INITIALS: Record<string, string> = {
  eden:  'ED',
  crest: 'CR',
  forge: 'FG',
  haven: 'HV',
  lexis: 'LX',
  nora:  'NR',
};

// ── Status type ──────────────────────────────────────────────────────

type AgentStatus = 'available' | 'busy' | 'offline';

// ── Props ────────────────────────────────────────────────────────────

interface AgentRosterProps {
  agents: RosterAgent[];
  onToggleAgent: (agentId: string, enabled: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onReorder: (agents: RosterAgent[]) => void;
  speakingAgentId: string | null;
  pinnedAgentId: string | null;
  onPinAgent: (agentId: string | null) => void;
  meetingActive: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export function AgentRoster({
  agents,
  onToggleAgent,
  onSelectAll,
  onDeselectAll,
  onReorder,
  speakingAgentId,
  pinnedAgentId,
  onPinAgent,
  meetingActive,
}: AgentRosterProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragRef = useRef<HTMLDivElement | null>(null);

  const enabledCount = agents.filter((a) => a.enabled).length;

  // ── Drag-to-reorder ──────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.DragEvent, idx: number) => {
      setDragIdx(idx);
      e.dataTransfer.effectAllowed = 'move';
      // Make the drag image semi-transparent
      if (e.currentTarget instanceof HTMLElement) {
        e.dataTransfer.setDragImage(e.currentTarget, 20, 20);
      }
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, idx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverIdx(idx);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIdx: number) => {
      e.preventDefault();
      if (dragIdx === null || dragIdx === dropIdx) {
        setDragIdx(null);
        setDragOverIdx(null);
        return;
      }
      const reordered = [...agents];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(dropIdx, 0, moved);
      onReorder(reordered);
      setDragIdx(null);
      setDragOverIdx(null);
    },
    [agents, dragIdx, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  // ── Agent status ─────────────────────────────────────────────────

  const getStatus = (agent: RosterAgent): AgentStatus => {
    if (!agent.enabled) return 'offline';
    if (speakingAgentId === agent.id) return 'busy';
    return 'available';
  };

  const statusDot = (status: AgentStatus) => {
    const colors: Record<AgentStatus, string> = {
      available: 'bg-emerald-400',
      busy: 'bg-amber-400 animate-pulse',
      offline: 'bg-zinc-500',
    };
    return colors[status];
  };

  const statusLabel = (status: AgentStatus) => {
    const labels: Record<AgentStatus, string> = {
      available: 'Available',
      busy: 'Speaking...',
      offline: 'Disabled',
    };
    return labels[status];
  };

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-zinc-900/50 border-l border-zinc-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Agent Roster
          </h3>
          <span className="text-xs text-zinc-500">
            {enabledCount}/{agents.length} active
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={onDeselectAll}
            className="text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto py-2">
        {agents.map((agent, idx) => {
          const status = getStatus(agent);
          const color = AGENT_COLORS[agent.id] ?? '#6B7280';
          const initials = AGENT_INITIALS[agent.id] ?? agent.name.slice(0, 2).toUpperCase();
          const isPinned = pinnedAgentId === agent.id;
          const isDragging = dragIdx === idx;
          const isDragOver = dragOverIdx === idx;

          return (
            <div
              key={agent.id}
              ref={isDragging ? dragRef : undefined}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              className={`
                mx-2 mb-1 px-3 py-2.5 rounded-lg cursor-grab active:cursor-grabbing
                transition-all duration-150
                ${isDragging ? 'opacity-40 scale-95' : 'opacity-100'}
                ${isDragOver ? 'ring-1 ring-indigo-500/50' : ''}
                ${agent.enabled ? 'bg-zinc-800/60 hover:bg-zinc-800' : 'bg-zinc-900/40'}
              `}
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div
                  className="relative flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: agent.enabled ? color : '#3F3F46' }}
                >
                  {initials}
                  {/* Status dot */}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${statusDot(status)}`}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-sm font-medium truncate ${
                        agent.enabled ? 'text-zinc-100' : 'text-zinc-500'
                      }`}
                    >
                      {agent.name}
                    </span>
                    {isPinned && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                        PINNED
                      </span>
                    )}
                    {speakingAgentId === agent.id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium animate-pulse">
                        SPEAKING
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 truncate">
                    {agent.industry}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Pin button */}
                  {meetingActive && agent.enabled && (
                    <button
                      onClick={() => onPinAgent(isPinned ? null : agent.id)}
                      title={isPinned ? 'Unpin agent' : 'Pin as default responder'}
                      className={`p-1 rounded transition-colors ${
                        isPinned
                          ? 'text-indigo-400 hover:text-indigo-300'
                          : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3a1 1 0 001-1v-3h2v3a1 1 0 001 1h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                      </svg>
                    </button>
                  )}

                  {/* Toggle */}
                  <button
                    onClick={() => onToggleAgent(agent.id, !agent.enabled)}
                    className={`
                      relative w-8 h-[18px] rounded-full transition-colors
                      ${agent.enabled ? 'bg-emerald-600' : 'bg-zinc-700'}
                    `}
                    title={agent.enabled ? 'Disable agent' : 'Enable agent'}
                  >
                    <span
                      className={`
                        absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm
                        transition-transform
                        ${agent.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}
                      `}
                    />
                  </button>
                </div>
              </div>

              {/* Status line */}
              <div className="mt-1 ml-12 text-[11px] text-zinc-600">
                {statusLabel(status)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Drag hint */}
      <div className="px-4 py-2 border-t border-zinc-800">
        <p className="text-[11px] text-zinc-600 text-center">
          Drag to reorder priority
        </p>
      </div>
    </div>
  );
}
