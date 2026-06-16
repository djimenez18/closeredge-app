import { useState } from 'react';

import { ACTION_COLORS, AGENT_META, type HiveMindEntry } from './hivemindService';

// ── Helpers ───────────────────────────────────────────────────────

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

function formatActionLabel(action: string): string {
  return action
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Agent avatar ─────────────────────────────────────────────────

function AgentAvatar({ agentId, size = 28 }: { agentId: string; size?: number }) {
  const meta = AGENT_META[agentId];
  const color = meta?.color ?? '#9ca3af';
  const initial = (meta?.name ?? agentId).charAt(0).toUpperCase();

  return (
    <div
      className="flex items-center justify-center rounded-md shrink-0 font-bold"
      style={{
        width: size,
        height: size,
        backgroundColor: `${color}18`,
        color: color,
        fontSize: size * 0.4,
      }}>
      {initial}
    </div>
  );
}

// ── Action badge ─────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const color = ACTION_COLORS[action] ?? '#9ca3af';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
      style={{ backgroundColor: `${color}12`, color: color, border: `1px solid ${color}25` }}>
      {formatActionLabel(action)}
    </span>
  );
}

// ── Artifacts panel ──────────────────────────────────────────────

function ArtifactsPanel({ artifacts }: { artifacts: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(artifacts);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-[#7C3AED]/70 hover:text-[#7C3AED] transition-colors flex items-center gap-1">
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {entries.length} artifact{entries.length !== 1 ? 's' : ''}
      </button>
      {expanded && (
        <div className="mt-1.5 pl-3 border-l-2 border-[#25252f] dark:border-[#25252f] border-gray-200 space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="text-[11px]">
              <span className="text-gray-400 dark:text-[#9ca3af] font-mono">{key}:</span>{' '}
              <span className="text-gray-600 dark:text-[#e8e8e8]/60 font-mono break-all">
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Feed entry ───────────────────────────────────────────────────

function FeedEntry({
  entry,
  isHighlighted,
  onClick,
}: {
  entry: HiveMindEntry;
  isHighlighted: boolean;
  onClick?: () => void;
}) {
  const meta = AGENT_META[entry.agent_id];
  const agentName = meta?.name ?? entry.agent_id;
  const agentColor = meta?.color ?? '#9ca3af';

  return (
    <div
      onClick={onClick}
      className={`group relative flex gap-3 px-4 py-3 transition-all duration-150 cursor-pointer
        border-b border-gray-100 dark:border-[#25252f]/60
        ${
          isHighlighted
            ? 'bg-[#7C3AED]/5 dark:bg-[#7C3AED]/8'
            : 'hover:bg-gray-50 dark:hover:bg-[#1a1a22]'
        }`}>
      {/* Left: avatar + timeline */}
      <div className="flex flex-col items-center shrink-0">
        <AgentAvatar agentId={entry.agent_id} />
        <div className="flex-1 w-px bg-gradient-to-b from-gray-200 dark:from-[#25252f] to-transparent mt-2" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-1">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-semibold text-xs" style={{ color: agentColor }}>
            {agentName}
          </span>
          <ActionBadge action={entry.action} />
          <span className="ml-auto text-[10px] text-gray-400 dark:text-[#9ca3af] tabular-nums whitespace-nowrap">
            {formatRelativeTime(entry.created_at)}
          </span>
        </div>

        {/* Summary */}
        <p className="text-sm text-gray-600 dark:text-[#e8e8e8]/70 leading-relaxed">
          {entry.summary}
        </p>

        {/* Artifacts */}
        {entry.artifacts && typeof entry.artifacts === 'object' && (
          <ArtifactsPanel artifacts={entry.artifacts as Record<string, unknown>} />
        )}
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-[#9ca3af]">
      <svg
        className="w-12 h-12 mb-4 text-gray-200 dark:text-[#25252f]"
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
      <p className="text-sm font-medium">No activity yet</p>
      <p className="text-xs mt-1 text-gray-300 dark:text-[#9ca3af]/60">
        Agent operations will appear here in real time
      </p>
    </div>
  );
}

// ── Main Feed Component ──────────────────────────────────────────

interface HiveMindFeedProps {
  entries: HiveMindEntry[];
  highlightedEntryId?: number | null;
  onEntryClick?: (entry: HiveMindEntry) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  className?: string;
}

export function HiveMindFeed({
  entries,
  highlightedEntryId,
  onEntryClick,
  onLoadMore,
  hasMore = false,
  loading = false,
  className = '',
}: HiveMindFeedProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      {/* Feed header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#25252f]">
        <div className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]" />
        </div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-[#9ca3af] uppercase tracking-wider">
          Operations Feed
        </h3>
        <span className="text-[10px] text-gray-400 dark:text-[#9ca3af]/60 tabular-nums ml-auto">
          {entries.length} entries
        </span>
      </div>

      {/* Feed entries */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 && !loading ? (
          <EmptyFeed />
        ) : (
          <>
            {entries.map(entry => (
              <FeedEntry
                key={entry.id}
                entry={entry}
                isHighlighted={entry.id === highlightedEntryId}
                onClick={onEntryClick ? () => onEntryClick(entry) : undefined}
              />
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="py-4 flex justify-center">
                <button
                  onClick={onLoadMore}
                  disabled={loading}
                  className="px-4 py-2 text-xs text-[#7C3AED] hover:text-[#A855F7] border border-[#7C3AED]/20 hover:border-[#7C3AED]/40 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#1a1a22]">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24">
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
                      Loading...
                    </span>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
