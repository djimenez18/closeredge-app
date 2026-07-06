-- CloserEdge AI Memory System Schema
-- Supabase Migration 004
-- Ported from ClaudeClaw 3-layer retrieval architecture
-- Supports: memories, consolidations, FTS, temporal decay, RLS

-- ── Memories table ───────────────────────────────────────────────

CREATE TABLE public.memories (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  chat_id TEXT,
  source TEXT DEFAULT 'conversation'
    CHECK (source IN ('conversation', 'observation', 'obsidian', 'integration', 'manual')),
  raw_text TEXT,
  summary TEXT NOT NULL,
  entities JSONB DEFAULT '[]',
  topics JSONB DEFAULT '[]',
  importance REAL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  salience REAL DEFAULT 1.0 CHECK (salience >= 0 AND salience <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Consolidations table ─────────────────────────────────────────

CREATE TABLE public.consolidations (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  source_ids JSONB DEFAULT '[]',
  summary TEXT NOT NULL,
  insight TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Performance indexes ──────────────────────────────────────────

-- Primary lookup paths
CREATE INDEX idx_memories_customer ON public.memories(customer_id);
CREATE INDEX idx_memories_agent ON public.memories(agent_id);
CREATE INDEX idx_memories_chat ON public.memories(chat_id) WHERE chat_id IS NOT NULL;
CREATE INDEX idx_memories_created ON public.memories(created_at DESC);
CREATE INDEX idx_memories_accessed ON public.memories(accessed_at DESC);
CREATE INDEX idx_memories_importance ON public.memories(importance DESC);
CREATE INDEX idx_memories_source ON public.memories(source);

-- Composite index for Layer 2 (recent high-importance retrieval)
CREATE INDEX idx_memories_high_importance_recent
  ON public.memories(agent_id, importance DESC, accessed_at DESC)
  WHERE importance >= 0.5;

-- Full-text search index (Layer 1: semantic search fallback)
-- Creates a generated tsvector column for GIN indexing
ALTER TABLE public.memories
  ADD COLUMN memory_fts TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(summary, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(raw_text, '')), 'B')
  ) STORED;

CREATE INDEX idx_memories_fts ON public.memories USING GIN (memory_fts);

-- Consolidation indexes
CREATE INDEX idx_consolidations_customer ON public.consolidations(customer_id);
CREATE INDEX idx_consolidations_agent ON public.consolidations(agent_id);
CREATE INDEX idx_consolidations_created ON public.consolidations(created_at DESC);

-- ── Row Level Security ───────────────────────────────────────────

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own memories
CREATE POLICY memories_own ON public.memories
  FOR ALL
  USING (customer_id = auth.uid());

CREATE POLICY consolidations_own ON public.consolidations
  FOR ALL
  USING (customer_id = auth.uid());

-- Service role has unrestricted access (for backend agent processes)
CREATE POLICY service_all_memories ON public.memories
  FOR ALL
  TO service_role
  USING (true);

CREATE POLICY service_all_consolidations ON public.consolidations
  FOR ALL
  TO service_role
  USING (true);

-- ── Helper functions ─────────────────────────────────────────────

-- Boost salience for a memory (relevance feedback: memory was useful)
CREATE OR REPLACE FUNCTION public.boost_memory_salience(
  memory_id BIGINT,
  amount REAL DEFAULT 0.05
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.memories
  SET
    salience = LEAST(1.0, salience + amount),
    accessed_at = NOW()
  WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decay salience for a memory (relevance feedback: memory was not useful)
CREATE OR REPLACE FUNCTION public.decay_memory_salience(
  memory_id BIGINT,
  amount REAL DEFAULT 0.02
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.memories
  SET salience = GREATEST(0.0, salience - amount)
  WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Daily decay sweep: reduce salience of old, unaccessed memories
CREATE OR REPLACE FUNCTION public.decay_stale_memories(
  age_days INTEGER DEFAULT 30,
  decay_factor REAL DEFAULT 0.95
)
RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.memories
  SET salience = salience * decay_factor
  WHERE accessed_at < NOW() - (age_days || ' days')::INTERVAL
    AND salience > 0.05;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Touch a memory's accessed_at (used during retrieval feedback)
CREATE OR REPLACE FUNCTION public.touch_memory(memory_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.memories
  SET accessed_at = NOW()
  WHERE id = memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Updated_at triggers ──────────────────────────────────────────
-- (Reuses handle_updated_at from migration 001)

-- Auto-set customer_id from auth context on insert (if not provided by service role)
CREATE OR REPLACE FUNCTION public.set_memory_customer_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN
    NEW.customer_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER memories_set_customer BEFORE INSERT ON public.memories
  FOR EACH ROW EXECUTE FUNCTION public.set_memory_customer_id();

CREATE TRIGGER consolidations_set_customer BEFORE INSERT ON public.consolidations
  FOR EACH ROW EXECUTE FUNCTION public.set_memory_customer_id();
