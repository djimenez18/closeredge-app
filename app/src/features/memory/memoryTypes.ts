// ── Memory system types ──────────────────────────────────────────
// Ported from ClaudeClaw 3-layer retrieval architecture, adapted
// for Supabase/CloserEdge multi-agent environment.

/** Source of the memory entry. */
export type MemorySource = 'conversation' | 'observation' | 'obsidian' | 'integration' | 'manual';

/** A single memory record as stored in Supabase. */
export interface Memory {
  id: number;
  customer_id: string;
  agent_id: string;
  chat_id: string | null;
  source: MemorySource;
  raw_text: string | null;
  summary: string;
  entities: string[];
  topics: string[];
  importance: number;
  salience: number;
  created_at: string;
  accessed_at: string;
}

/** A consolidation — LLM-synthesised insight across related memories. */
export interface Consolidation {
  id: number;
  customer_id: string;
  agent_id: string;
  source_ids: number[];
  summary: string;
  insight: string | null;
  created_at: string;
}

/** A scored memory returned by the retrieval layers. */
export interface MemoryResult {
  memory: Memory;
  /** Composite relevance score (higher = more relevant). */
  score: number;
  /** Which retrieval layer surfaced this result. */
  layer:
    | 'semantic_search'
    | 'recent_high_importance'
    | 'consolidation'
    | 'cross_agent'
    | 'conversation_recall';
}

/** Filters for the searchMemories API. */
export interface MemoryFilter {
  agentId?: string;
  source?: MemorySource;
  dateRange?: { from: string; to: string };
  minImportance?: number;
  query?: string;
}

/** Raw DB row shape before client-side parsing. */
export interface MemoryRow {
  id: number;
  customer_id: string;
  agent_id: string;
  chat_id: string | null;
  source: string;
  raw_text: string | null;
  summary: string;
  entities: unknown; // JSONB comes as parsed object or string
  topics: unknown;
  importance: number;
  salience: number;
  created_at: string;
  accessed_at: string;
}

/** Raw DB row for consolidations. */
export interface ConsolidationRow {
  id: number;
  customer_id: string;
  agent_id: string;
  source_ids: unknown;
  summary: string;
  insight: string | null;
  created_at: string;
}

/** Result shape for entity extraction LLM calls. */
export interface ExtractionResult {
  skip?: boolean;
  summary: string;
  entities: string[];
  topics: string[];
  importance: number;
}

/** Result shape for consolidation LLM calls. */
export interface ConsolidationLLMResult {
  summary: string;
  insight: string;
  connections: { from_id: number; to_id: number; relationship: string }[];
  contradictions?: { stale_id: number; supersedes_id: number; reason: string }[];
}

/** Stats summary for the Memory Explorer UI. */
export interface MemoryStats {
  totalMemories: number;
  byAgent: { agent_id: string; count: number }[];
  topEntities: { entity: string; count: number }[];
  avgImportance: number;
}
