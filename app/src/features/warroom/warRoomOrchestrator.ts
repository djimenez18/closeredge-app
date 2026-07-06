/**
 * War Room orchestrator.
 *
 * Ported from ClaudeClaw warroom-text-orchestrator.ts. Manages multi-agent
 * meeting sessions: routing user messages to agents, handling @mentions,
 * limiting responders per turn, and maintaining conversation transcripts.
 *
 * This is the client-side orchestration layer. It manages meeting state,
 * routes messages through the router, and coordinates agent responses
 * via the Supabase backend or local API.
 */
import { supabase } from '@/lib/supabase';

import {
  extractMentions,
  interventionGate,
  isAcknowledgment,
  type RosterAgent,
  routeMessage,
  type RouterContext,
} from './warRoomRouter';
import { buildToolPolicy } from './warRoomToolPolicy';

// ── Types ────────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  customerId: string;
  startedAt: string;
  endedAt: string | null;
  mode: 'text' | 'voice';
  pinnedAgent: string | null;
  activeAgents: string[];
  entryCount: number;
}

export interface TranscriptEntry {
  id: number;
  meetingId: string;
  speaker: string;
  agentId: string | null;
  text: string;
  toolCalls: unknown[] | null;
  createdAt: string;
}

export type WarRoomEventType =
  | 'turn_start'
  | 'agent_typing'
  | 'agent_chunk'
  | 'agent_done'
  | 'turn_complete'
  | 'turn_aborted'
  | 'system_note'
  | 'error';

export interface WarRoomEvent {
  type: WarRoomEventType;
  turnId: string;
  agentId?: string;
  text?: string;
  delta?: string;
  role?: 'primary' | 'intervener';
  error?: string;
}

export type WarRoomEventHandler = (event: WarRoomEvent) => void;

// ── Constants ────────────────────────────────────────────────────────

/** Max interveners per turn (in addition to the primary). */
const MAX_INTERVENERS = 2;

// ── Orchestrator class ───────────────────────────────────────────────

export class WarRoomOrchestrator {
  private meeting: Meeting | null = null;
  private transcript: TranscriptEntry[] = [];
  private listeners: Set<WarRoomEventHandler> = new Set();
  private activeTurnId: string | null = null;
  private cancelFlag = { cancelled: false };

  // ── Meeting lifecycle ────────────────────────────────────────────

  /** Start a new War Room meeting. */
  async startMeeting(customerId: string, agents: RosterAgent[]): Promise<Meeting> {
    const activeAgentIds = agents.filter(a => a.enabled).map(a => a.id);

    const { data, error } = await supabase
      .from('warroom_meetings')
      .insert({ customer_id: customerId, mode: 'text', active_agents: activeAgentIds })
      .select()
      .single();

    if (error) throw new Error(`Failed to start meeting: ${error.message}`);

    this.meeting = {
      id: data.id,
      customerId: data.customer_id,
      startedAt: data.started_at,
      endedAt: null,
      mode: data.mode,
      pinnedAgent: data.pinned_agent,
      activeAgents: data.active_agents,
      entryCount: 0,
    };

    this.transcript = [];
    this.cancelFlag = { cancelled: false };

    this.emit({
      type: 'system_note',
      turnId: 'system',
      text: `Meeting started with ${activeAgentIds.length} agent${activeAgentIds.length !== 1 ? 's' : ''}.`,
    });

    return this.meeting;
  }

  /** End the current meeting. */
  async endMeeting(): Promise<void> {
    if (!this.meeting) return;

    // Cancel any in-flight turn
    this.cancelFlag.cancelled = true;

    const { error } = await supabase
      .from('warroom_meetings')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', this.meeting.id);

    if (error) {
      console.error('[warroom] Failed to end meeting:', error);
    }

    this.emit({ type: 'system_note', turnId: 'system', text: 'Meeting ended.' });

    this.meeting = null;
    this.activeTurnId = null;
  }

  /** Get the current meeting state. */
  getMeeting(): Meeting | null {
    return this.meeting;
  }

  /** Get the full transcript. */
  getTranscript(): TranscriptEntry[] {
    return [...this.transcript];
  }

  // ── Agent management ─────────────────────────────────────────────

  /** Pin an agent as the default responder. */
  async pinAgent(agentId: string | null): Promise<void> {
    if (!this.meeting) return;

    const { error } = await supabase
      .from('warroom_meetings')
      .update({ pinned_agent: agentId })
      .eq('id', this.meeting.id);

    if (error) {
      console.error('[warroom] Failed to pin agent:', error);
      return;
    }

    this.meeting.pinnedAgent = agentId;

    this.emit({
      type: 'system_note',
      turnId: 'system',
      text: agentId
        ? `Pinned @${agentId} as the default responder.`
        : 'Unpinned the default responder.',
    });
  }

  /** Update the active agents list. */
  async updateActiveAgents(agentIds: string[]): Promise<void> {
    if (!this.meeting) return;

    const { error } = await supabase
      .from('warroom_meetings')
      .update({ active_agents: agentIds })
      .eq('id', this.meeting.id);

    if (error) {
      console.error('[warroom] Failed to update agents:', error);
      return;
    }

    this.meeting.activeAgents = agentIds;
  }

  // ── Turn handling ────────────────────────────────────────────────

  /**
   * Handle a user message. This is the main entry point.
   *
   * Flow:
   *   1. Persist user message to transcript
   *   2. Route to primary agent (via @mention, pinned, or classifier)
   *   3. Run primary agent
   *   4. Optionally run up to 2 interveners
   *   5. Emit turn_complete
   */
  async handleUserMessage(userText: string, roster: RosterAgent[]): Promise<void> {
    if (!this.meeting) {
      this.emit({
        type: 'error',
        turnId: 'system',
        error: 'No active meeting. Start a meeting first.',
      });
      return;
    }

    if (this.meeting.endedAt) {
      this.emit({ type: 'error', turnId: 'system', error: 'Meeting has ended.' });
      return;
    }

    const trimmed = userText.trim();
    if (!trimmed) return;

    const turnId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.activeTurnId = turnId;
    this.cancelFlag = { cancelled: false };

    // Persist user message
    await this.addTranscriptEntry(trimmed, 'user', null);

    this.emit({ type: 'turn_start', turnId, text: trimmed });

    const enabledRoster = roster.filter(a => a.enabled);

    try {
      // Build router context
      const routerCtx: RouterContext = {
        userText: trimmed,
        roster: enabledRoster,
        recentTurns: this.transcript
          .slice(-6)
          .map(t => ({
            speaker: t.speaker,
            text: t.text.length > 300 ? t.text.slice(0, 300) + '...' : t.text,
          })),
        pinnedAgent: this.meeting.pinnedAgent,
      };

      // Route the message
      const decision = await routeMessage(routerCtx);

      if (decision.primary === null) {
        // Silent turn (ack/greeting with no owner)
        if (!isAcknowledgment(trimmed)) {
          this.emit({
            type: 'system_note',
            turnId,
            text: 'Not sure who should take this -- try @<agent> or add a specific detail.',
          });
        }
        this.emit({ type: 'turn_complete', turnId });
        return;
      }

      if (this.cancelFlag.cancelled) {
        this.emit({ type: 'turn_aborted', turnId });
        return;
      }

      // Run primary agent
      this.emit({ type: 'agent_typing', turnId, agentId: decision.primary, role: 'primary' });

      const primaryText = await this.runAgentTurn(
        decision.primary,
        trimmed,
        turnId,
        'primary',
        enabledRoster
      );

      // Run interveners
      if (decision.interveners.length > 0 && !this.cancelFlag.cancelled) {
        for (const candidateId of decision.interveners.slice(0, MAX_INTERVENERS)) {
          if (this.cancelFlag.cancelled) break;

          const candidate = enabledRoster.find(a => a.id === candidateId);
          if (!candidate) continue;

          // Check if explicit @mention (bypass gate)
          const mentions = extractMentions(trimmed, enabledRoster);
          const isExplicit = mentions.includes(candidateId);

          if (!isExplicit && primaryText) {
            // Run intervention gate
            const gate = await interventionGate({
              userText: trimmed,
              primaryAgentId: decision.primary,
              primaryReply: primaryText,
              candidateAgentId: candidateId,
              candidateAgentDescription: candidate.description,
            });

            if (!gate.speak) continue;
          } else if (!isExplicit && !primaryText) {
            // Skip gate-driven interveners when primary had no reply
            continue;
          }

          this.emit({ type: 'agent_typing', turnId, agentId: candidateId, role: 'intervener' });

          await this.runAgentTurn(candidateId, trimmed, turnId, 'intervener', enabledRoster);
        }
      }

      this.emit({ type: 'turn_complete', turnId });
    } catch (err) {
      console.error('[warroom] handleUserMessage error:', err);
      this.emit({ type: 'error', turnId, error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.activeTurnId = null;
    }
  }

  /** Cancel the current turn. */
  cancelCurrentTurn(): void {
    this.cancelFlag.cancelled = true;
    if (this.activeTurnId) {
      this.emit({ type: 'turn_aborted', turnId: this.activeTurnId });
    }
  }

  // ── Agent turn execution ─────────────────────────────────────────

  /**
   * Execute a single agent's turn. In a production deployment this would
   * call the backend API which runs the actual LLM. For now it simulates
   * a response using the agent's profile.
   */
  private async runAgentTurn(
    agentId: string,
    userText: string,
    turnId: string,
    role: 'primary' | 'intervener',
    roster: RosterAgent[]
  ): Promise<string> {
    const agent = roster.find(a => a.id === agentId);
    if (!agent) return '';

    buildToolPolicy(agentId);

    // Build meeting context for the agent
    const recentContext = this.transcript
      .slice(-8)
      .map(t => {
        const label = t.speaker === 'user' ? 'User' : t.speaker === agentId ? 'You' : t.speaker;
        const snippet = t.text.length > 400 ? t.text.slice(0, 400) + '...' : t.text;
        return `${label}: ${snippet}`;
      })
      .join('\n');

    // Simulate streaming response
    // In production: POST /api/warroom/turn with { agentId, userText, context }
    const simulatedResponse = this.generateAgentResponse(agent, userText, role, recentContext);

    // Stream the response in chunks
    const words = simulatedResponse.split(' ');
    let fullText = '';

    for (let i = 0; i < words.length; i++) {
      if (this.cancelFlag.cancelled) break;

      const chunk = (i === 0 ? '' : ' ') + words[i];
      fullText += chunk;

      this.emit({ type: 'agent_chunk', turnId, agentId, role, delta: chunk });

      // Simulate streaming delay
      await new Promise(r => setTimeout(r, 30 + Math.random() * 40));
    }

    if (!this.cancelFlag.cancelled && fullText) {
      // Persist to transcript
      await this.addTranscriptEntry(fullText, agentId, agentId);

      this.emit({ type: 'agent_done', turnId, agentId, role, text: fullText });
    }

    return fullText;
  }

  /**
   * Generate a placeholder agent response. This will be replaced by
   * actual LLM calls through the backend API in production.
   */
  private generateAgentResponse(
    agent: RosterAgent,
    _userText: string,
    _role: 'primary' | 'intervener',
    _context: string
  ): string {
    const responses: Record<string, string[]> = {
      eden: [
        `Looking at this from a residential perspective, I'd recommend focusing on comparable sales in the area first. The market conditions right now favor a strategic approach to pricing.`,
        `For residential clients, the key is understanding their timeline and motivation. Let me pull up the relevant market data for this conversation.`,
        `Based on what I'm seeing in the residential market, there are a few angles we should consider here.`,
      ],
      crest: [
        `From a commercial standpoint, we need to evaluate the cap rate and NOI projections before making any recommendations. The current market dynamics suggest caution.`,
        `For commercial properties, due diligence on tenant mix and lease terms is critical. I'd suggest we review the financials first.`,
        `The commercial real estate angle here involves careful analysis of operating expenses and potential vacancy rates.`,
      ],
      forge: [
        `From a contractor's perspective, we should look at the scope of work and timeline first. I can put together a preliminary estimate based on what we know.`,
        `For home services, the priority is understanding the urgency and scope. Let me outline what a typical job like this would involve.`,
        `Looking at this from the service delivery side, scheduling and resource allocation are going to be key factors here.`,
      ],
      haven: [
        `From a medical practice standpoint, patient intake and scheduling efficiency are critical. I'd recommend we review the current workflow first.`,
        `For healthcare operations, compliance and patient experience need to be balanced. Let me share some insights on best practices.`,
        `The medical practice perspective here involves careful consideration of both operational efficiency and patient care standards.`,
      ],
      lexis: [
        `From a legal perspective, we need to consider the liability implications and regulatory requirements before proceeding. Let me outline the key considerations.`,
        `For legal matters, due diligence is paramount. I'd recommend we review the relevant statutes and case law that apply here.`,
        `The legal angle involves careful analysis of contractual obligations and potential exposure. Here's what I'd focus on.`,
      ],
      nora: [
        `From a property management perspective, tenant relations and maintenance scheduling are the priorities here. Let me share my analysis.`,
        `For property management, we need to balance occupancy rates with maintenance costs. I'd suggest reviewing the current operational metrics.`,
        `Looking at this from the property management side, lease terms and tenant satisfaction are going to be critical factors.`,
      ],
    };

    const agentResponses = responses[agent.id] ?? [
      `I'll look into this and share my perspective shortly.`,
    ];

    const idx = Math.floor(Math.random() * agentResponses.length);
    return agentResponses[idx];
  }

  // ── Transcript persistence ───────────────────────────────────────

  private async addTranscriptEntry(
    text: string,
    speaker: string,
    agentId: string | null
  ): Promise<void> {
    if (!this.meeting) return;

    const entry: TranscriptEntry = {
      id: Date.now(),
      meetingId: this.meeting.id,
      speaker,
      agentId,
      text,
      toolCalls: null,
      createdAt: new Date().toISOString(),
    };

    this.transcript.push(entry);

    // Persist to Supabase
    const { error } = await supabase
      .from('warroom_transcript')
      .insert({ meeting_id: this.meeting.id, speaker, agent_id: agentId, text });

    if (error) {
      console.error('[warroom] Failed to persist transcript:', error);
    }
  }

  // ── Event system ─────────────────────────────────────────────────

  /** Subscribe to war room events. Returns an unsubscribe function. */
  on(handler: WarRoomEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private emit(event: WarRoomEvent): void {
    for (const handler of this.listeners) {
      try {
        handler(event);
      } catch (err) {
        console.error('[warroom] Event handler error:', err);
      }
    }
  }

  // ── History loading ──────────────────────────────────────────────

  /** Load transcript history for a meeting from Supabase. */
  async loadHistory(meetingId: string): Promise<TranscriptEntry[]> {
    const { data, error } = await supabase
      .from('warroom_transcript')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[warroom] Failed to load history:', error);
      return [];
    }

    this.transcript = (data ?? []).map(row => ({
      id: row.id,
      meetingId: row.meeting_id,
      speaker: row.speaker,
      agentId: row.agent_id,
      text: row.text,
      toolCalls: row.tool_calls,
      createdAt: row.created_at,
    }));

    return this.transcript;
  }
}

// ── Singleton instance ───────────────────────────────────────────────

let _orchestrator: WarRoomOrchestrator | null = null;

export function getOrchestrator(): WarRoomOrchestrator {
  if (!_orchestrator) {
    _orchestrator = new WarRoomOrchestrator();
  }
  return _orchestrator;
}
