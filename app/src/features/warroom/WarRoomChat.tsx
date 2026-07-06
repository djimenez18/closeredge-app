import React, { useEffect, useMemo, useRef, useState } from 'react';

import { AGENT_COLORS, AGENT_INITIALS } from './AgentRoster';
import type { TranscriptEntry } from './warRoomOrchestrator';

// ── Types ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  speaker: string;
  agentId: string | null;
  text: string;
  timestamp: string;
  type: 'user' | 'agent' | 'system';
  isStreaming?: boolean;
}

interface WarRoomChatProps {
  transcript: TranscriptEntry[];
  streamingMessages: Map<string, { agentId: string; text: string; role: string }>;
  onSendMessage: (text: string) => void;
  onCancelTurn: () => void;
  meetingActive: boolean;
  isProcessing: boolean;
  enabledAgentIds: string[];
  agentNames: Record<string, string>;
}

// ── @mention highlighting ────────────────────────────────────────────

function highlightMentions(text: string, agentNames: Record<string, string>): React.ReactNode {
  const mentionRegex = /(?:^|(?<=[\s,([{:;]))@([a-z][a-z0-9_-]{0,29})\b/gi;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    const agentId = match[1].toLowerCase();
    const color = AGENT_COLORS[agentId];

    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }

    if (color) {
      parts.push(
        <span
          key={`mention-${match.index}`}
          className="font-semibold px-0.5 rounded"
          style={{ color, backgroundColor: `${color}15` }}>
          @{agentNames[agentId] ?? agentId}
        </span>
      );
    } else {
      parts.push(match[0]);
    }

    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

// ── Autocomplete component ───────────────────────────────────────────

interface MentionAutocompleteProps {
  query: string;
  agents: Array<{ id: string; name: string }>;
  onSelect: (agentId: string) => void;
  position: { top: number; left: number };
}

function MentionAutocomplete({ query, agents, onSelect, position }: MentionAutocompleteProps) {
  const filtered = agents.filter(
    a => a.id.includes(query.toLowerCase()) || a.name.toLowerCase().includes(query.toLowerCase())
  );

  if (filtered.length === 0) return null;

  return (
    <div
      className="absolute z-50 w-56 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden"
      style={{ bottom: position.top, left: position.left }}>
      {filtered.map(agent => (
        <button
          key={agent.id}
          onClick={() => onSelect(agent.id)}
          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-neutral-700 transition-colors text-left">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: AGENT_COLORS[agent.id] ?? '#6B7280' }}>
            {AGENT_INITIALS[agent.id] ?? agent.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-neutral-200 truncate">{agent.name}</p>
            <p className="text-[11px] text-neutral-500">@{agent.id}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Message group helpers ────────────────────────────────────────────

interface MessageGroup {
  speaker: string;
  agentId: string | null;
  type: 'user' | 'agent' | 'system';
  messages: ChatMessage[];
}

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last.speaker === msg.speaker && last.type === msg.type) {
      last.messages.push(msg);
    } else {
      groups.push({ speaker: msg.speaker, agentId: msg.agentId, type: msg.type, messages: [msg] });
    }
  }

  return groups;
}

// ── Main chat component ──────────────────────────────────────────────

export function WarRoomChat({
  transcript,
  streamingMessages,
  onSendMessage,
  onCancelTurn,
  meetingActive,
  isProcessing,
  enabledAgentIds,
  agentNames,
}: WarRoomChatProps) {
  const [input, setInput] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // ── Build message list ───────────────────────────────────────────

  const messages = useMemo<ChatMessage[]>(() => {
    const msgs: ChatMessage[] = transcript.map(t => ({
      id: String(t.id),
      speaker: t.speaker,
      agentId: t.agentId,
      text: t.text,
      timestamp: t.createdAt,
      type: t.speaker === 'user' ? 'user' : t.speaker === 'system' ? 'system' : 'agent',
    }));

    // Append streaming messages
    for (const [key, stream] of streamingMessages) {
      msgs.push({
        id: `streaming-${key}`,
        speaker: stream.agentId,
        agentId: stream.agentId,
        text: stream.text,
        timestamp: new Date().toISOString(),
        type: 'agent',
        isStreaming: true,
      });
    }

    return msgs;
  }, [transcript, streamingMessages]);

  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  // ── Auto-scroll ──────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingMessages.size]);

  // ── Input handling ───────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Check for @mention trigger
    const cursorPos = e.target.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@([a-z0-9_-]*)$/i);

    if (mentionMatch) {
      setShowAutocomplete(true);
      setMentionQuery(mentionMatch[1]);
    } else {
      setShowAutocomplete(false);
      setMentionQuery('');
    }
  };

  const handleMentionSelect = (agentId: string) => {
    const cursorPos = inputRef.current?.selectionStart ?? input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const mentionStart = textBeforeCursor.lastIndexOf('@');

    if (mentionStart !== -1) {
      const before = input.slice(0, mentionStart);
      const after = input.slice(cursorPos);
      setInput(`${before}@${agentId} ${after}`);
    }

    setShowAutocomplete(false);
    setMentionQuery('');
    inputRef.current?.focus();
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !meetingActive || isProcessing) return;
    onSendMessage(trimmed);
    setInput('');
    setShowAutocomplete(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setShowAutocomplete(false);
    }
  };

  // ── Agent list for autocomplete ──────────────────────────────────

  const autocompleteAgents = enabledAgentIds.map(id => ({ id, name: agentNames[id] ?? id }));

  // ── Format timestamp ─────────────────────────────────────────────

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Messages area */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messageGroups.map((group, gi) => {
          // System messages
          if (group.type === 'system') {
            return (
              <div key={`group-${gi}`} className="flex justify-center py-2">
                {group.messages.map(msg => (
                  <div
                    key={msg.id}
                    className="text-xs text-neutral-500 bg-neutral-900/50 px-3 py-1.5 rounded-full">
                    {msg.text}
                  </div>
                ))}
              </div>
            );
          }

          // User messages (right-aligned)
          if (group.type === 'user') {
            return (
              <div key={`group-${gi}`} className="flex flex-col items-end gap-0.5 py-1.5">
                {group.messages.map((msg, mi) => (
                  <div key={msg.id} className="max-w-[75%]">
                    {mi === 0 && (
                      <div className="flex items-center justify-end gap-1.5 mb-1">
                        <span className="text-[11px] text-neutral-500">
                          {formatTime(msg.timestamp)}
                        </span>
                        <span className="text-xs font-medium text-neutral-300">You</span>
                      </div>
                    )}
                    <div className="bg-brand-500 text-white px-3.5 py-2 rounded-2xl rounded-br-md text-sm leading-relaxed whitespace-pre-wrap">
                      {highlightMentions(msg.text, agentNames)}
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          // Agent messages (left-aligned)
          const color = AGENT_COLORS[group.speaker] ?? '#6B7280';
          const initials =
            AGENT_INITIALS[group.speaker] ??
            (agentNames[group.speaker] ?? group.speaker).slice(0, 2).toUpperCase();
          const displayName = agentNames[group.speaker] ?? group.speaker;

          return (
            <div key={`group-${gi}`} className="flex gap-2.5 py-1.5">
              {/* Avatar */}
              <div
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white mt-5"
                style={{ backgroundColor: color }}>
                {initials}
              </div>

              {/* Messages */}
              <div className="flex-1 min-w-0 max-w-[75%]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold" style={{ color }}>
                    {displayName}
                  </span>
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: `${color}20`, color }}>
                    {group.messages[0]?.agentId?.toUpperCase()}
                  </span>
                  <span className="text-[11px] text-neutral-600">
                    {formatTime(group.messages[0]?.timestamp ?? '')}
                  </span>
                </div>

                {group.messages.map(msg => (
                  <div key={msg.id} className="mb-1">
                    <div
                      className={`
                        bg-neutral-800/80 text-neutral-200 px-3.5 py-2 rounded-2xl rounded-bl-md
                        text-sm leading-relaxed whitespace-pre-wrap
                        ${msg.isStreaming ? 'border border-neutral-700' : ''}
                      `}>
                      {highlightMentions(msg.text, agentNames)}
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-4 ml-0.5 bg-neutral-400 animate-pulse rounded-sm" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-800 px-4 py-3 bg-neutral-900/50">
        {/* Processing indicator */}
        {isProcessing && (
          <div className="flex items-center gap-2 mb-2">
            <div className="flex gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-neutral-500">Agents are responding...</span>
            <button
              onClick={onCancelTurn}
              className="text-xs text-coral-400 hover:text-coral-300 ml-auto">
              Cancel
            </button>
          </div>
        )}

        <div className="relative">
          {/* Autocomplete dropdown */}
          {showAutocomplete && (
            <MentionAutocomplete
              query={mentionQuery}
              agents={autocompleteAgents}
              onSelect={handleMentionSelect}
              position={{ top: 8, left: 12 }}
            />
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  meetingActive
                    ? 'Type a message... (@ to mention an agent)'
                    : 'Start a meeting to begin chatting'
                }
                disabled={!meetingActive}
                rows={1}
                className="w-full bg-neutral-800 text-neutral-200 px-4 py-2.5 rounded-xl resize-none outline-none
                  placeholder:text-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed
                  focus:ring-1 focus:ring-brand-500/50 text-sm leading-relaxed
                  max-h-32 overflow-y-auto"
                style={{ height: 'auto', minHeight: '40px' }}
                onInput={e => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                }}
              />
            </div>

            <button
              onClick={handleSend}
              disabled={!meetingActive || !input.trim() || isProcessing}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-500 hover:bg-brand-600
                disabled:bg-neutral-800 disabled:text-neutral-600
                text-white flex items-center justify-center transition-colors">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
