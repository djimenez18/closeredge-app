import { useCallback, useEffect, useRef, useState } from 'react';

import { AGENT_COLORS, AgentRoster, CLOSEREDGE_AGENTS } from './AgentRoster';
import { WarRoomChat } from './WarRoomChat';
import { getOrchestrator, type TranscriptEntry, type WarRoomEvent } from './warRoomOrchestrator';
import type { RosterAgent } from './warRoomRouter';

// ── Agent display names ──────────────────────────────────────────────

const AGENT_NAMES: Record<string, string> = {
  eden: 'Eden',
  crest: 'Crest',
  forge: 'Forge',
  haven: 'Haven',
  lexis: 'Lexis',
  nora: 'Nora',
};

// ── Page component ───────────────────────────────────────────────────

export function WarRoomPage() {
  // State
  const [agents, setAgents] = useState<RosterAgent[]>(CLOSEREDGE_AGENTS.map(a => ({ ...a })));
  const [meetingActive, setMeetingActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<
    Map<string, { agentId: string; text: string; role: string }>
  >(new Map());
  const [speakingAgentId, setSpeakingAgentId] = useState<string | null>(null);
  const [pinnedAgentId, setPinnedAgentId] = useState<string | null>(null);

  const orchestratorRef = useRef(getOrchestrator());

  // ── Orchestrator event handler ───────────────────────────────────

  useEffect(() => {
    const orchestrator = orchestratorRef.current;

    const unsubscribe = orchestrator.on((event: WarRoomEvent) => {
      switch (event.type) {
        case 'turn_start':
          setIsProcessing(true);
          break;

        case 'agent_typing':
          if (event.agentId) {
            setSpeakingAgentId(event.agentId);
          }
          break;

        case 'agent_chunk':
          if (event.agentId && event.delta) {
            setStreamingMessages(prev => {
              const next = new Map(prev);
              const existing = next.get(event.agentId!);
              next.set(event.agentId!, {
                agentId: event.agentId!,
                text: (existing?.text ?? '') + event.delta!,
                role: event.role ?? 'primary',
              });
              return next;
            });
          }
          break;

        case 'agent_done':
          if (event.agentId) {
            // Remove from streaming, add to transcript
            setStreamingMessages(prev => {
              const next = new Map(prev);
              next.delete(event.agentId!);
              return next;
            });
            // Refresh transcript from orchestrator
            setTranscript(orchestrator.getTranscript());
            setSpeakingAgentId(null);
          }
          break;

        case 'turn_complete':
          setIsProcessing(false);
          setSpeakingAgentId(null);
          setStreamingMessages(new Map());
          setTranscript(orchestrator.getTranscript());
          break;

        case 'turn_aborted':
          setIsProcessing(false);
          setSpeakingAgentId(null);
          setStreamingMessages(new Map());
          break;

        case 'system_note':
          if (event.text) {
            setTranscript(orchestrator.getTranscript());
          }
          break;

        case 'error':
          setIsProcessing(false);
          setSpeakingAgentId(null);
          console.error('[warroom] Error:', event.error);
          break;
      }
    });

    return unsubscribe;
  }, []);

  // ── Meeting controls ─────────────────────────────────────────────

  const handleStartMeeting = useCallback(async () => {
    try {
      const customerId = crypto.randomUUID();
      await orchestratorRef.current.startMeeting(customerId, agents);
      setMeetingActive(true);
      setTranscript(orchestratorRef.current.getTranscript());
    } catch (err) {
      console.error('[warroom] Failed to start meeting:', err);
    }
  }, [agents]);

  const handleEndMeeting = useCallback(async () => {
    try {
      await orchestratorRef.current.endMeeting();
      setMeetingActive(false);
      setTranscript(orchestratorRef.current.getTranscript());
    } catch (err) {
      console.error('[warroom] Failed to end meeting:', err);
    }
  }, []);

  // ── Message sending ──────────────────────────────────────────────

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!meetingActive || isProcessing) return;
      await orchestratorRef.current.handleUserMessage(text, agents);
    },
    [meetingActive, isProcessing, agents]
  );

  const handleCancelTurn = useCallback(() => {
    orchestratorRef.current.cancelCurrentTurn();
  }, []);

  // ── Agent management ─────────────────────────────────────────────

  const handleToggleAgent = useCallback(
    (agentId: string, enabled: boolean) => {
      setAgents(prev => prev.map(a => (a.id === agentId ? { ...a, enabled } : a)));
      if (meetingActive) {
        const activeIds = agents
          .map(a => (a.id === agentId ? { ...a, enabled } : a))
          .filter(a => a.enabled)
          .map(a => a.id);
        orchestratorRef.current.updateActiveAgents(activeIds);
      }
    },
    [agents, meetingActive]
  );

  const handleSelectAll = useCallback(() => {
    setAgents(prev => prev.map(a => ({ ...a, enabled: true })));
    if (meetingActive) {
      orchestratorRef.current.updateActiveAgents(agents.map(a => a.id));
    }
  }, [agents, meetingActive]);

  const handleDeselectAll = useCallback(() => {
    setAgents(prev => prev.map(a => ({ ...a, enabled: false })));
    if (meetingActive) {
      orchestratorRef.current.updateActiveAgents([]);
    }
  }, [meetingActive]);

  const handleReorderAgents = useCallback((reordered: RosterAgent[]) => {
    setAgents(reordered);
  }, []);

  const handlePinAgent = useCallback(
    (agentId: string | null) => {
      setPinnedAgentId(agentId);
      if (meetingActive) {
        orchestratorRef.current.pinAgent(agentId);
      }
    },
    [meetingActive]
  );

  // ── Derived state ────────────────────────────────────────────────

  const enabledAgentIds = agents.filter(a => a.enabled).map(a => a.id);
  const enabledCount = enabledAgentIds.length;

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* War Room icon */}
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <svg
              className="w-4.5 h-4.5 text-indigo-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-100">War Room</h1>
            <p className="text-xs text-zinc-500">Multi-agent strategy session</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Meeting status */}
          {meetingActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600/10 border border-emerald-600/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">Live</span>
              <span className="text-xs text-zinc-500">
                {enabledCount} agent{enabledCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Meeting control button */}
          {!meetingActive ? (
            <button
              onClick={handleStartMeeting}
              disabled={enabledCount === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500
                disabled:bg-zinc-800 disabled:text-zinc-600
                text-sm font-medium text-white transition-colors">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                />
              </svg>
              Start Meeting
            </button>
          ) : (
            <button
              onClick={handleEndMeeting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30
                text-sm font-medium text-red-400 transition-colors border border-red-600/30">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              End Meeting
            </button>
          )}
        </div>
      </header>

      {/* Main content: chat + roster */}
      <div className="flex flex-1 min-h-0">
        {/* Chat panel (left 60%) */}
        <div className="flex-[3] min-w-0">
          {meetingActive || transcript.length > 0 ? (
            <WarRoomChat
              transcript={transcript}
              streamingMessages={streamingMessages}
              onSendMessage={handleSendMessage}
              onCancelTurn={handleCancelTurn}
              meetingActive={meetingActive}
              isProcessing={isProcessing}
              enabledAgentIds={enabledAgentIds}
              agentNames={AGENT_NAMES}
            />
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-zinc-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-zinc-300 mb-2">Ready to convene</h2>
              <p className="text-sm text-zinc-500 max-w-md mb-6 leading-relaxed">
                Select the agents you want in the room, then start a meeting. Use @mentions to
                direct questions to specific agents, or let the router decide who should respond.
              </p>

              {/* Agent preview chips */}
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                {agents
                  .filter(a => a.enabled)
                  .map(a => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${AGENT_COLORS[a.id]}15`,
                        color: AGENT_COLORS[a.id],
                        border: `1px solid ${AGENT_COLORS[a.id]}30`,
                      }}>
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: AGENT_COLORS[a.id] }}
                      />
                      {a.name}
                    </span>
                  ))}
              </div>

              <button
                onClick={handleStartMeeting}
                disabled={enabledCount === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500
                  disabled:bg-zinc-800 disabled:text-zinc-600
                  text-sm font-medium text-white transition-colors">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                  />
                </svg>
                Start Meeting
              </button>
            </div>
          )}
        </div>

        {/* Agent roster sidebar (right 40%) */}
        <div className="flex-[2] min-w-[280px] max-w-[400px]">
          <AgentRoster
            agents={agents}
            onToggleAgent={handleToggleAgent}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onReorder={handleReorderAgents}
            speakingAgentId={speakingAgentId}
            pinnedAgentId={pinnedAgentId}
            onPinAgent={handlePinAgent}
            meetingActive={meetingActive}
          />
        </div>
      </div>
    </div>
  );
}
