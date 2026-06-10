import { supabase } from '@/lib/supabase';
import { parseJsonFromLLM } from './memoryIngest';
import type { ConsolidationLLMResult, MemoryRow } from './memoryTypes';

// ── Consolidation prompt ─────────────────────────────────────────

const CONSOLIDATION_PROMPT = `You are a memory consolidation agent. You find patterns and connections across a user's recent memories.

Given these unconsolidated memories:
{MEMORIES}

Your job:
1. Find cross-cutting patterns, themes, or connections between memories
2. Create a synthesized summary that captures the overall picture
3. Identify one key insight that emerges from these memories together
4. Map connections between specific memories (use their IDs)
5. Check for CONTRADICTIONS: if any memory updates, corrects, or supersedes an earlier one, flag it. IMPORTANT: Compare the created_at timestamps to determine which is newer. The memory with the LATER timestamp is authoritative (it's the correction). Set stale_id to the OLDER memory's ID and supersedes_id to the NEWER memory's ID.

Return JSON:
{
  "summary": "A synthesized view across all source memories",
  "insight": "One key pattern or insight that emerges",
  "connections": [
    {"from_id": N, "to_id": M, "relationship": "description of how they relate"}
  ],
  "contradictions": [
    {"stale_id": N, "supersedes_id": M, "reason": "why the newer one replaces the older"}
  ]
}

If memories are unrelated, still summarize but note they cover different topics. Connections and contradictions arrays can be empty if none exist.`;

// ── Guard against overlapping runs ───────────────────────────────

const consolidatingAgents = new Set<string>();

// ── Helpers ──────────────────────────────────────────────────────

function safeJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ── Main consolidation function ──────────────────────────────────

/**
 * Find patterns across recent memories for an agent and create
 * synthesis records. Ported from ClaudeClaw's `runConsolidation`.
 *
 * Safe to call frequently:
 * - No-op if fewer than 2 unconsolidated memories exist
 * - No-op if already running for this agent
 * - Atomically marks source memories as consolidated
 *
 * @param agentId - The agent to consolidate memories for
 * @param llmCall - LLM function for pattern detection (injected for testability)
 * @param maxMemories - Max unconsolidated memories to process per run (default 20)
 */
export async function consolidateMemories(
  agentId: string,
  llmCall: (prompt: string) => Promise<string>,
  maxMemories = 20,
): Promise<{ consolidationId: number | null; sourceCount: number }> {
  // Guard against overlapping runs
  if (consolidatingAgents.has(agentId)) {
    console.debug(`[memory-consolidate] already running for ${agentId}, skipping`);
    return { consolidationId: null, sourceCount: 0 };
  }

  consolidatingAgents.add(agentId);
  try {
    // Fetch unconsolidated memories (those not yet part of any consolidation)
    const memories = await getUnconsolidatedMemories(agentId, maxMemories);

    if (memories.length < 2) {
      console.debug(
        `[memory-consolidate] only ${memories.length} memory/ies for ${agentId}, skipping`,
      );
      return { consolidationId: null, sourceCount: memories.length };
    }

    // Format memories for the LLM
    const memoriesJson = memories.map((m) => ({
      id: m.id,
      summary: m.summary,
      entities: safeJsonArray(m.entities),
      topics: safeJsonArray(m.topics),
      importance: m.importance,
      created_at: m.created_at,
    }));

    const prompt = CONSOLIDATION_PROMPT.replace(
      '{MEMORIES}',
      JSON.stringify(memoriesJson, null, 2),
    );

    const raw = await llmCall(prompt);
    const result = parseJsonFromLLM<ConsolidationLLMResult>(raw);

    if (!result || !result.summary || !result.insight) {
      console.warn('[memory-consolidate] LLM produced invalid result');
      return { consolidationId: null, sourceCount: memories.length };
    }

    const sourceIds = memories.map((m) => m.id);

    // Validate connections — only keep those referencing memories in this batch
    const validConnections = (result.connections ?? []).filter(
      (conn) =>
        conn.from_id &&
        conn.to_id &&
        sourceIds.includes(conn.from_id) &&
        sourceIds.includes(conn.to_id),
    );

    // Handle contradictions — correct direction using timestamps
    if (result.contradictions && result.contradictions.length > 0) {
      for (const contra of result.contradictions) {
        if (
          !sourceIds.includes(contra.stale_id) ||
          !sourceIds.includes(contra.supersedes_id)
        ) {
          continue;
        }

        const staleMem = memories.find((m) => m.id === contra.stale_id);
        const newMem = memories.find((m) => m.id === contra.supersedes_id);

        // Correct direction if LLM got timestamps wrong
        let staleId = contra.stale_id;
        if (
          staleMem &&
          newMem &&
          new Date(staleMem.created_at).getTime() >
            new Date(newMem.created_at).getTime()
        ) {
          staleId = contra.supersedes_id;
          console.warn(
            `[memory-consolidate] corrected contradiction direction: ${contra.stale_id} -> ${staleId}`,
          );
        }

        // Decay salience of the stale memory
        await supabase
          .from('memories')
          .update({ salience: 0.1, importance: 0.1 })
          .eq('id', staleId);

        console.info(
          `[memory-consolidate] superseded memory #${staleId}: ${contra.reason}`,
        );
      }
    }

    // Save the consolidation
    const { data: consolidation, error } = await supabase
      .from('consolidations')
      .insert({
        agent_id: agentId,
        source_ids: sourceIds,
        summary: result.summary,
        insight: result.insight,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[memory-consolidate] save error:', error.message);
      return { consolidationId: null, sourceCount: memories.length };
    }

    const consolidationId = consolidation?.id ?? null;

    console.info(
      `[memory-consolidate] created consolidation #${consolidationId} from ${sourceIds.length} memories (${validConnections.length} connections). Insight: ${result.insight.slice(0, 80)}`,
    );

    return { consolidationId, sourceCount: memories.length };
  } catch (err) {
    console.error('[memory-consolidate] failed:', err);
    return { consolidationId: null, sourceCount: 0 };
  } finally {
    consolidatingAgents.delete(agentId);
  }
}

// ── Unconsolidated memory retrieval ──────────────────────────────

/**
 * Get memories that haven't been included in any consolidation yet.
 * A memory is "unconsolidated" if its ID doesn't appear in any
 * consolidation's source_ids array.
 */
async function getUnconsolidatedMemories(
  agentId: string,
  limit: number,
): Promise<MemoryRow[]> {
  // First, get all source_ids from existing consolidations for this agent
  const { data: consolidations } = await supabase
    .from('consolidations')
    .select('source_ids')
    .eq('agent_id', agentId);

  const consolidatedIds = new Set<number>();
  if (consolidations) {
    for (const row of consolidations) {
      const ids = safeJsonArray(row.source_ids).map(Number);
      for (const id of ids) {
        if (!isNaN(id)) consolidatedIds.add(id);
      }
    }
  }

  // Fetch recent memories for this agent
  const { data: memories, error } = await supabase
    .from('memories')
    .select('*')
    .eq('agent_id', agentId)
    .gte('importance', 0.3) // only consolidate meaningful memories
    .order('created_at', { ascending: false })
    .limit(limit * 2); // fetch extra to filter

  if (error || !memories) {
    console.error('[memory-consolidate] fetch error:', error?.message);
    return [];
  }

  // Filter out already-consolidated memories
  return (memories as MemoryRow[])
    .filter((m) => !consolidatedIds.has(m.id))
    .slice(0, limit);
}

/**
 * Schedule periodic consolidation. Runs every `intervalMs` (default 30 min).
 * Returns a cleanup function to stop the interval.
 */
export function scheduleConsolidation(
  agentId: string,
  llmCall: (prompt: string) => Promise<string>,
  intervalMs = 30 * 60 * 1000,
): () => void {
  const handle = setInterval(() => {
    void consolidateMemories(agentId, llmCall).catch((err) => {
      console.error('[memory-consolidate] scheduled run failed:', err);
    });
  }, intervalMs);

  return () => clearInterval(handle);
}
