import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────

export interface HiveMindEntry {
  id: number;
  customer_id: string;
  agent_id: string;
  chat_id: string;
  action: string;
  summary: string;
  artifacts: Record<string, unknown> | null;
  created_at: string;
}

export interface AgentStats {
  agent_id: string;
  total_entries: number;
  last_active: string | null;
  top_actions: { action: string; count: number }[];
}

// ── Agent metadata ─────────────────────────────────────────────────

export const AGENT_META: Record<
  string,
  { name: string; color: string; icon: string; lobe: string }
> = {
  eden:  { name: 'Eden',  color: '#7C3AED', icon: 'home',       lobe: 'frontal'  },
  crest: { name: 'Crest', color: '#60a5fa', icon: 'building-2', lobe: 'frontal'  },
  lexis: { name: 'Lexis', color: '#fbbf24', icon: 'scale',      lobe: 'temporal' },
  haven: { name: 'Haven', color: '#10b981', icon: 'heart-pulse', lobe: 'parietal' },
  forge: { name: 'Forge', color: '#ef4444', icon: 'hammer',     lobe: 'parietal' },
  nora:  { name: 'Nora',  color: '#A855F7', icon: 'map-pin',    lobe: 'occipital' },
};

export const ACTION_COLORS: Record<string, string> = {
  email_sent:             '#60a5fa', // blue
  research_completed:     '#10b981', // green
  lead_qualified:         '#7C3AED', // purple
  appointment_scheduled:  '#fbbf24', // amber
  document_drafted:       '#10b981', // green
  follow_up_sent:         '#A855F7', // light purple
  call_completed:         '#f87171', // pink
  contract_generated:     '#A855F7', // lavender
  property_analyzed:      '#60a5fa', // blue
  intake_completed:       '#10b981', // green
};

// ── Queries ────────────────────────────────────────────────────────

export async function fetchHiveMindEntries(
  agentId?: string,
  limit = 50,
  offset = 0,
): Promise<HiveMindEntry[]> {
  let query = supabase
    .from('hive_mind')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (agentId) {
    query = query.eq('agent_id', agentId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[hivemind] fetch error:', error.message);
    return [];
  }
  return (data ?? []) as HiveMindEntry[];
}

export async function logHiveMindEntry(
  agentId: string,
  chatId: string,
  action: string,
  summary: string,
  artifacts?: Record<string, unknown>,
): Promise<HiveMindEntry | null> {
  const { data, error } = await supabase
    .from('hive_mind')
    .insert({
      agent_id: agentId,
      chat_id: chatId,
      action,
      summary,
      artifacts: artifacts ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[hivemind] insert error:', error.message);
    return null;
  }
  return data as HiveMindEntry;
}

export async function getAgentStats(): Promise<AgentStats[]> {
  // Fetch all entries grouped by agent for stats computation
  const { data, error } = await supabase
    .from('hive_mind')
    .select('agent_id, action, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[hivemind] stats error:', error.message);
    return [];
  }

  const entries = (data ?? []) as { agent_id: string; action: string; created_at: string }[];
  const grouped = new Map<
    string,
    { total: number; lastActive: string | null; actionCounts: Map<string, number> }
  >();

  for (const entry of entries) {
    let group = grouped.get(entry.agent_id);
    if (!group) {
      group = { total: 0, lastActive: null, actionCounts: new Map() };
      grouped.set(entry.agent_id, group);
    }
    group.total++;
    if (!group.lastActive || entry.created_at > group.lastActive) {
      group.lastActive = entry.created_at;
    }
    group.actionCounts.set(
      entry.action,
      (group.actionCounts.get(entry.action) ?? 0) + 1,
    );
  }

  const stats: AgentStats[] = [];
  for (const [agentId, group] of grouped) {
    const topActions = Array.from(group.actionCounts.entries())
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    stats.push({
      agent_id: agentId,
      total_entries: group.total,
      last_active: group.lastActive,
      top_actions: topActions,
    });
  }

  return stats;
}

export async function searchHiveMind(query: string): Promise<HiveMindEntry[]> {
  // Supabase full-text search using ilike on summary (works without
  // configuring pg_trgm or tsvector). For production, a GIN index on
  // tsvector would be faster.
  const { data, error } = await supabase
    .from('hive_mind')
    .select('*')
    .ilike('summary', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[hivemind] search error:', error.message);
    return [];
  }
  return (data ?? []) as HiveMindEntry[];
}
