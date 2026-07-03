-- War Room: multi-agent meeting sessions
-- Ported from ClaudeClaw warroom-text-orchestrator

-- ── Meetings table ───────────────────────────────────────────────────

CREATE TABLE public.warroom_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  mode TEXT NOT NULL DEFAULT 'text' CHECK (mode IN ('text', 'voice')),
  pinned_agent TEXT,
  active_agents JSONB NOT NULL DEFAULT '[]',
  entry_count INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.warroom_meetings IS 'War Room meeting sessions where users converse with multiple AI agents simultaneously.';
COMMENT ON COLUMN public.warroom_meetings.pinned_agent IS 'Agent ID that receives all un-addressed messages. NULL = router decides.';
COMMENT ON COLUMN public.warroom_meetings.active_agents IS 'JSON array of agent IDs currently participating in this meeting.';

CREATE INDEX idx_warroom_meetings_customer ON public.warroom_meetings (customer_id);
CREATE INDEX idx_warroom_meetings_active ON public.warroom_meetings (customer_id, ended_at)
  WHERE ended_at IS NULL;

-- ── Transcript table ─────────────────────────────────────────────────

CREATE TABLE public.warroom_transcript (
  id BIGSERIAL PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.warroom_meetings(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL,
  agent_id TEXT,
  text TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.warroom_transcript IS 'Immutable log of every message exchanged in a War Room meeting.';
COMMENT ON COLUMN public.warroom_transcript.speaker IS 'user | system | agent ID';
COMMENT ON COLUMN public.warroom_transcript.agent_id IS 'Normalized agent ID when speaker is an agent. NULL for user/system rows.';
COMMENT ON COLUMN public.warroom_transcript.tool_calls IS 'JSON array of tool calls made during this agent turn, if any.';

CREATE INDEX idx_warroom_transcript_meeting ON public.warroom_transcript (meeting_id, created_at);
CREATE INDEX idx_warroom_transcript_agent ON public.warroom_transcript (meeting_id, agent_id)
  WHERE agent_id IS NOT NULL;

-- ── Row Level Security ───────────────────────────────────────────────

ALTER TABLE public.warroom_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warroom_transcript ENABLE ROW LEVEL SECURITY;

-- Users can only see their own meetings
CREATE POLICY warroom_meetings_select ON public.warroom_meetings
  FOR SELECT USING (
    customer_id = auth.uid()
  );

CREATE POLICY warroom_meetings_insert ON public.warroom_meetings
  FOR INSERT WITH CHECK (
    customer_id = auth.uid()
  );

CREATE POLICY warroom_meetings_update ON public.warroom_meetings
  FOR UPDATE USING (
    customer_id = auth.uid()
  );

-- Users can only see transcripts from their own meetings
CREATE POLICY warroom_transcript_select ON public.warroom_transcript
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.warroom_meetings m
      WHERE m.id = warroom_transcript.meeting_id
        AND m.customer_id = auth.uid()
    )
  );

CREATE POLICY warroom_transcript_insert ON public.warroom_transcript
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.warroom_meetings m
      WHERE m.id = warroom_transcript.meeting_id
        AND m.customer_id = auth.uid()
    )
  );

-- Service role: full access for backend operations
CREATE POLICY warroom_meetings_service ON public.warroom_meetings
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY warroom_transcript_service ON public.warroom_transcript
  FOR ALL USING (true) WITH CHECK (true);

-- ── Increment entry count trigger ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.warroom_increment_entry_count()
  RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.warroom_meetings
    SET entry_count = entry_count + 1
    WHERE id = NEW.meeting_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_warroom_entry_count
  AFTER INSERT ON public.warroom_transcript
  FOR EACH ROW
  EXECUTE FUNCTION public.warroom_increment_entry_count();
