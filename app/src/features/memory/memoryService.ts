import { supabase } from '@/lib/supabase';

import type {
  ConsolidationRow,
  Memory,
  MemoryFilter,
  MemoryResult,
  MemoryRow,
  MemorySource,
  MemoryStats,
} from './memoryTypes';

// ── Helpers ──────────────────────────────────────────────────────

/** Parse JSONB fields that may arrive as string or object. */
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

/** Convert a raw Supabase row into a typed Memory. */
function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    customer_id: row.customer_id,
    agent_id: row.agent_id,
    chat_id: row.chat_id,
    source: row.source as MemorySource,
    raw_text: row.raw_text,
    summary: row.summary,
    entities: safeJsonArray(row.entities),
    topics: safeJsonArray(row.topics),
    importance: row.importance,
    salience: row.salience,
    created_at: row.created_at,
    accessed_at: row.accessed_at,
  };
}

// ── Layer 1: Semantic / full-text search ─────────────────────────

/**
 * Keyword search across summary, raw_text, and entities.
 * Uses Supabase `textSearch` when a tsvector index is available,
 * with ilike fallback for broader matching.
 */
async function searchSemanticLayer(
  query: string,
  agentId?: string,
  limit = 5
): Promise<MemoryResult[]> {
  // Try full-text search first (uses the GIN index on memory_fts)
  let ftsQuery = supabase
    .from('memories')
    .select('*')
    .textSearch('memory_fts', query, { type: 'websearch', config: 'english' })
    .order('importance', { ascending: false })
    .limit(limit);

  if (agentId) ftsQuery = ftsQuery.eq('agent_id', agentId);

  const { data: ftsData, error: ftsError } = await ftsQuery;

  if (!ftsError && ftsData && ftsData.length > 0) {
    return (ftsData as MemoryRow[]).map((row, i) => ({
      memory: rowToMemory(row),
      score: 1.0 - i * 0.1, // rank-order score
      layer: 'semantic_search' as const,
    }));
  }

  // Fallback: ilike on summary (works without tsvector)
  let fallback = supabase
    .from('memories')
    .select('*')
    .ilike('summary', `%${query}%`)
    .order('importance', { ascending: false })
    .limit(limit);

  if (agentId) fallback = fallback.eq('agent_id', agentId);

  const { data, error } = await fallback;
  if (error) {
    console.error('[memory] semantic search error:', error.message);
    return [];
  }

  return ((data ?? []) as MemoryRow[]).map((row, i) => ({
    memory: rowToMemory(row),
    score: 0.8 - i * 0.1,
    layer: 'semantic_search' as const,
  }));
}

// ── Layer 2: Recent high-importance memories ─────────────────────

/**
 * Memories with importance >= 0.5, ordered by last access time.
 * These are the "always-relevant" memories that stay fresh.
 */
async function recentHighImportanceLayer(agentId?: string, limit = 5): Promise<MemoryResult[]> {
  let query = supabase
    .from('memories')
    .select('*')
    .gte('importance', 0.5)
    .order('accessed_at', { ascending: false })
    .limit(limit);

  if (agentId) query = query.eq('agent_id', agentId);

  const { data, error } = await query;
  if (error) {
    console.error('[memory] recent high-importance error:', error.message);
    return [];
  }

  return ((data ?? []) as MemoryRow[]).map((row, i) => ({
    memory: rowToMemory(row),
    score: 0.9 - i * 0.08,
    layer: 'recent_high_importance' as const,
  }));
}

// ── Layer 3: Consolidation insights ──────────────────────────────

/**
 * LLM-extracted insights that synthesize patterns across memories.
 */
async function consolidationLayer(
  query: string,
  agentId?: string,
  limit = 3
): Promise<MemoryResult[]> {
  let q = supabase
    .from('consolidations')
    .select('*')
    .ilike('summary', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (agentId) q = q.eq('agent_id', agentId);

  const { data, error } = await q;
  if (error) {
    console.error('[memory] consolidation search error:', error.message);
    return [];
  }

  // If keyword search found nothing, fall back to most recent consolidations
  let rows = (data ?? []) as ConsolidationRow[];
  if (rows.length === 0) {
    let recent = supabase
      .from('consolidations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (agentId) recent = recent.eq('agent_id', agentId);

    const { data: recentData } = await recent;
    rows = (recentData ?? []) as ConsolidationRow[];
  }

  // Map consolidations into MemoryResult format with a synthetic Memory
  return rows.map((c, i) => ({
    memory: {
      id: c.id,
      customer_id: c.customer_id,
      agent_id: c.agent_id,
      chat_id: null,
      source: 'observation' as MemorySource,
      raw_text: null,
      summary: c.summary,
      entities: [],
      topics: [],
      importance: 1.0, // consolidations are always high-value
      salience: 1.0,
      created_at: c.created_at,
      accessed_at: c.created_at,
    },
    score: 0.85 - i * 0.1,
    layer: 'consolidation' as const,
  }));
}

// ── Layer 4: Cross-agent activity (Hive Mind) ────────────────────

/**
 * Recent activity from OTHER agents via the hive_mind table.
 * Excluded for war-room isolation scenarios.
 */
async function crossAgentLayer(currentAgentId: string, limit = 5): Promise<MemoryResult[]> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('hive_mind')
    .select('*')
    .neq('agent_id', currentAgentId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[memory] cross-agent error:', error.message);
    return [];
  }

  return (
    (data ?? []) as Array<{
      id: number;
      customer_id: string;
      agent_id: string;
      chat_id: string;
      action: string;
      summary: string;
      created_at: string;
    }>
  ).map((entry, i) => ({
    memory: {
      id: entry.id,
      customer_id: entry.customer_id,
      agent_id: entry.agent_id,
      chat_id: entry.chat_id,
      source: 'observation' as MemorySource,
      raw_text: null,
      summary: `[${entry.agent_id}] ${entry.action}: ${entry.summary}`,
      entities: [],
      topics: [entry.action],
      importance: 0.6,
      salience: 0.8,
      created_at: entry.created_at,
      accessed_at: entry.created_at,
    },
    score: 0.7 - i * 0.08,
    layer: 'cross_agent' as const,
  }));
}

// ── Layer 5: Direct conversation recall ──────────────────────────

/**
 * When the user asks about past conversations ("do you remember...",
 * "last time we talked about..."), search memories with temporal decay.
 * More recent memories score higher.
 */
async function conversationRecallLayer(
  query: string,
  agentId?: string,
  limit = 5
): Promise<MemoryResult[]> {
  // Only activate if the query contains recall-like keywords
  const recallPattern =
    /\bremember\b|\brecall\b|\byesterday\b|\blast time\b|\bwe talked\b|\bwe discussed\b|\bwhat do you know\b|\bdo you know\b|\bwhat did we\b|\bpreviously\b|\bearlier\b|\blast week\b|\bfew days\b/i;

  if (!recallPattern.test(query)) return [];

  let q = supabase
    .from('memories')
    .select('*')
    .eq('source', 'conversation')
    .order('created_at', { ascending: false })
    .limit(limit * 2); // fetch extra, we'll score and trim

  if (agentId) q = q.eq('agent_id', agentId);

  const { data, error } = await q;
  if (error) {
    console.error('[memory] conversation recall error:', error.message);
    return [];
  }

  const now = Date.now();
  return ((data ?? []) as MemoryRow[])
    .map(row => {
      const mem = rowToMemory(row);
      const ageMs = now - new Date(mem.created_at).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      // Exponential temporal decay: halves every 7 days
      const decayFactor = Math.pow(0.5, ageDays / 7);
      return {
        memory: mem,
        score: mem.importance * decayFactor,
        layer: 'conversation_recall' as const,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Public API ───────────────────────────────────────────────────

export interface RecallOptions {
  /** Include consolidation insights (Layer 3). Default true. */
  includeConsolidations?: boolean;
  /** Include cross-agent hive mind activity (Layer 4). Default true. */
  includeTeamActivity?: boolean;
  /** Include conversation recall with temporal decay (Layer 5). Default true. */
  includeRecallHistory?: boolean;
}

/**
 * 5-layer memory retrieval system.
 *
 * Merges and deduplicates results across:
 *   1. Semantic / full-text search
 *   2. Recent high-importance memories
 *   3. Consolidation insights
 *   4. Cross-agent activity (Hive Mind)
 *   5. Conversation recall with temporal decay
 *
 * @param query   - The user's message or search query
 * @param agentId - The calling agent's ID (for cross-agent filtering)
 * @param limit   - Max total results to return
 * @param opts    - Layer toggles
 */
export async function recallMemories(
  query: string,
  agentId: string,
  limit = 15,
  opts: RecallOptions = {}
): Promise<MemoryResult[]> {
  const {
    includeConsolidations = true,
    includeTeamActivity = true,
    includeRecallHistory = true,
  } = opts;

  // Run all layers in parallel
  const layerPromises: Promise<MemoryResult[]>[] = [
    searchSemanticLayer(query, agentId, 5),
    recentHighImportanceLayer(agentId, 5),
  ];

  if (includeConsolidations) {
    layerPromises.push(consolidationLayer(query, agentId, 3));
  }
  if (includeTeamActivity) {
    layerPromises.push(crossAgentLayer(agentId, 5));
  }
  if (includeRecallHistory) {
    layerPromises.push(conversationRecallLayer(query, agentId, 5));
  }

  const layerResults = await Promise.all(layerPromises);

  // Merge and deduplicate by memory ID (keep highest score)
  const seen = new Map<number, MemoryResult>();
  for (const results of layerResults) {
    for (const result of results) {
      const existing = seen.get(result.memory.id);
      if (!existing || result.score > existing.score) {
        seen.set(result.memory.id, result);
      }
    }
  }

  // Sort by score descending, trim to limit
  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Store a new memory in Supabase.
 */
export async function storeMemory(
  text: string,
  summary: string,
  source: MemorySource,
  agentId: string,
  chatId: string | null,
  entities: string[] = [],
  topics: string[] = [],
  importance = 0.5
): Promise<number | null> {
  const { data, error } = await supabase
    .from('memories')
    .insert({
      agent_id: agentId,
      chat_id: chatId,
      source,
      raw_text: text,
      summary,
      entities,
      topics,
      importance: Math.max(0, Math.min(1, importance)),
      salience: 1.0,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[memory] store error:', error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Soft-delete a memory by marking salience to 0 (or hard delete).
 */
export async function forgetMemory(memoryId: number): Promise<boolean> {
  const { error } = await supabase.from('memories').delete().eq('id', memoryId);

  if (error) {
    console.error('[memory] forget error:', error.message);
    return false;
  }
  return true;
}

/**
 * Search memories with arbitrary filters.
 * Used by the Memory Explorer UI.
 */
export async function searchMemories(
  query: string,
  filters: MemoryFilter = {},
  limit = 50,
  offset = 0
): Promise<Memory[]> {
  let q = supabase
    .from('memories')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (query) {
    q = q.ilike('summary', `%${query}%`);
  }
  if (filters.agentId) {
    q = q.eq('agent_id', filters.agentId);
  }
  if (filters.source) {
    q = q.eq('source', filters.source);
  }
  if (filters.minImportance !== undefined) {
    q = q.gte('importance', filters.minImportance);
  }
  if (filters.dateRange?.from) {
    q = q.gte('created_at', filters.dateRange.from);
  }
  if (filters.dateRange?.to) {
    q = q.lte('created_at', filters.dateRange.to);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[memory] search error:', error.message);
    return [];
  }

  return ((data ?? []) as MemoryRow[]).map(rowToMemory);
}

/**
 * Touch a memory's accessed_at timestamp (boost for relevance feedback).
 */
export async function touchMemory(memoryId: number): Promise<void> {
  await supabase
    .from('memories')
    .update({ accessed_at: new Date().toISOString() })
    .eq('id', memoryId);
}

/**
 * Batch-update salience for relevance feedback.
 * Useful IDs get a small salience boost; irrelevant ones decay.
 */
export async function batchUpdateRelevance(
  surfacedIds: number[],
  usefulIds: Set<number>
): Promise<void> {
  const boostIds = surfacedIds.filter(id => usefulIds.has(id));
  const decayIds = surfacedIds.filter(id => !usefulIds.has(id));

  // Boost useful memories
  if (boostIds.length > 0) {
    for (const id of boostIds) {
      await supabase.rpc('boost_memory_salience', { memory_id: id, amount: 0.05 });
    }
  }

  // Decay irrelevant ones
  if (decayIds.length > 0) {
    for (const id of decayIds) {
      await supabase.rpc('decay_memory_salience', { memory_id: id, amount: 0.02 });
    }
  }
}

/**
 * Compute aggregate stats for the Memory Explorer.
 */
export async function getMemoryStats(): Promise<MemoryStats> {
  const { data: allMemories, error } = await supabase
    .from('memories')
    .select('agent_id, importance, entities');

  if (error || !allMemories) {
    return { totalMemories: 0, byAgent: [], topEntities: [], avgImportance: 0 };
  }

  const rows = allMemories as Array<{ agent_id: string; importance: number; entities: unknown }>;

  // Count by agent
  const agentCounts = new Map<string, number>();
  const entityCounts = new Map<string, number>();
  let importanceSum = 0;

  for (const row of rows) {
    agentCounts.set(row.agent_id, (agentCounts.get(row.agent_id) ?? 0) + 1);
    importanceSum += row.importance;

    const entities = safeJsonArray(row.entities);
    for (const entity of entities) {
      entityCounts.set(entity, (entityCounts.get(entity) ?? 0) + 1);
    }
  }

  const byAgent = Array.from(agentCounts.entries())
    .map(([agent_id, count]) => ({ agent_id, count }))
    .sort((a, b) => b.count - a.count);

  const topEntities = Array.from(entityCounts.entries())
    .map(([entity, count]) => ({ entity, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    totalMemories: rows.length,
    byAgent,
    topEntities,
    avgImportance: rows.length > 0 ? importanceSum / rows.length : 0,
  };
}

/**
 * Fetch all consolidations for an agent.
 */
export async function fetchConsolidations(
  agentId?: string,
  limit = 50
): Promise<
  Array<{
    id: number;
    agent_id: string;
    source_ids: number[];
    summary: string;
    insight: string | null;
    created_at: string;
  }>
> {
  let q = supabase
    .from('consolidations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (agentId) q = q.eq('agent_id', agentId);

  const { data, error } = await q;
  if (error) {
    console.error('[memory] fetch consolidations error:', error.message);
    return [];
  }

  return ((data ?? []) as ConsolidationRow[]).map(row => ({
    id: row.id,
    agent_id: row.agent_id,
    source_ids: safeJsonArray(row.source_ids).map(Number),
    summary: row.summary,
    insight: row.insight,
    created_at: row.created_at,
  }));
}
