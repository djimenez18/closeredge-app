-- CloserEdge AI Hive Mind Schema
-- Supabase Migration 002
-- Cross-agent knowledge sharing and activity tracking

CREATE TABLE public.hive_mind (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id),
  agent_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  artifacts JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hivemind_agent ON public.hive_mind(agent_id);
CREATE INDEX idx_hivemind_customer ON public.hive_mind(customer_id);
CREATE INDEX idx_hivemind_created ON public.hive_mind(created_at DESC);

ALTER TABLE public.hive_mind ENABLE ROW LEVEL SECURITY;

-- Users can only see their own hive mind entries
CREATE POLICY hivemind_own ON public.hive_mind
  FOR ALL
  USING (customer_id = auth.uid());

-- Service role has unrestricted access (for backend agent processes)
CREATE POLICY service_all_hivemind ON public.hive_mind
  FOR ALL
  TO service_role
  USING (true);
