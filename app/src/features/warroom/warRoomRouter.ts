/**
 * War Room message router.
 *
 * Ported from ClaudeClaw warroom-text-router.ts. Classifies incoming
 * user messages to determine which agent(s) should respond.
 *
 * In production this would call a fast/cheap model (Haiku tier) for
 * classification. The current implementation uses keyword heuristics
 * as a local fallback, with the LLM classifier as the primary path
 * when an API endpoint is available.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface RosterAgent {
  id: string;
  name: string;
  description: string;
  industry: string;
  enabled: boolean;
}

export interface RouterContext {
  userText: string;
  roster: RosterAgent[];
  recentTurns: Array<{ speaker: string; text: string }>;
  pinnedAgent: string | null;
}

export interface RouterDecision {
  primary: string | null;
  interveners: string[];
  reason: string;
  /** True if the router call failed and fell back to deterministic defaults. */
  routerDegraded: boolean;
}

export interface InterventionDecision {
  speak: boolean;
  reply: string;
}

// ── Agent expertise keywords ─────────────────────────────────────────
// Used for local heuristic routing when no LLM classifier is available.

const AGENT_KEYWORDS: Record<string, string[]> = {
  eden: [
    'residential', 'home buyer', 'home seller', 'listing', 'open house',
    'showing', 'mortgage', 'pre-approval', 'mls', 'buyer', 'seller',
    'house', 'condo', 'townhome', 'neighborhood', 'school district',
  ],
  crest: [
    'commercial', 'office space', 'retail', 'warehouse', 'industrial',
    'cap rate', 'noi', 'triple net', 'lease', 'tenant', 'vacancy',
    'investment property', 'commercial real estate', 'cre',
  ],
  forge: [
    'contractor', 'renovation', 'repair', 'hvac', 'plumbing',
    'electrical', 'roofing', 'estimate', 'bid', 'job', 'service call',
    'maintenance', 'home services', 'inspection',
  ],
  haven: [
    'medical', 'dental', 'patient', 'appointment', 'clinic', 'doctor',
    'practice', 'insurance', 'hipaa', 'health', 'treatment', 'referral',
    'scheduling', 'intake form',
  ],
  lexis: [
    'legal', 'law', 'attorney', 'lawyer', 'case', 'client intake',
    'consultation', 'contract', 'liability', 'compliance', 'court',
    'filing', 'retainer', 'deposition',
  ],
  nora: [
    'property management', 'landlord', 'tenant', 'rent', 'lease',
    'maintenance request', 'eviction', 'property manager', 'unit',
    'building', 'hoa', 'amenities', 'move-in', 'move-out',
  ],
};

// ── Greeting / acknowledgment detection ──────────────────────────────

const GREETING_RE =
  /^\s*(?:hi|hey|hello|yo|sup|howdy|good morning|good afternoon|good evening)[!.\s]*$/i;

const ACK_RE =
  /^\s*(?:thanks?|thank you|thx|ty|ok(?:ay)?|got it|cool|nice|great|awesome|sounds? good|nvm|never mind|lol|haha)[!.\s]*$/i;

export function isGreeting(text: string): boolean {
  return GREETING_RE.test(text);
}

export function isAcknowledgment(text: string): boolean {
  return ACK_RE.test(text);
}

// ── @mention extraction ──────────────────────────────────────────────

/**
 * Extract all @mentioned agent IDs from a message, in order of appearance.
 * Deduplicated. Only returns IDs that exist in the roster.
 */
export function extractMentions(
  text: string,
  roster: RosterAgent[],
): string[] {
  const re = /(?:^|[\s,(\[{:;])@([a-z][a-z0-9_-]{0,29})\b/gi;
  const rosterIds = new Set(roster.map((r) => r.id));
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const candidate = m[1].toLowerCase();
    if (!rosterIds.has(candidate)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

// ── Heuristic classifier ─────────────────────────────────────────────

/**
 * Score each agent's relevance to the user message using keyword matching.
 * Returns agents sorted by score descending.
 */
function scoreAgents(
  text: string,
  roster: RosterAgent[],
): Array<{ id: string; score: number }> {
  const lower = text.toLowerCase();
  return roster
    .filter((a) => a.enabled)
    .map((a) => {
      const keywords = AGENT_KEYWORDS[a.id] ?? [];
      const score = keywords.reduce((acc, kw) => {
        return acc + (lower.includes(kw) ? 1 : 0);
      }, 0);
      return { id: a.id, score };
    })
    .sort((a, b) => b.score - a.score);
}

// ── Router fallback ──────────────────────────────────────────────────

export function routerFallback(ctx: RouterContext): RouterDecision {
  const fallbackId =
    ctx.pinnedAgent ??
    ctx.roster.find((a) => a.enabled)?.id ??
    'eden';
  return {
    primary: fallbackId,
    interveners: [],
    reason: 'router unavailable -- fell back to primary-only',
    routerDegraded: true,
  };
}

// ── Main router ──────────────────────────────────────────────────────

/**
 * Route a user message to the appropriate agent(s).
 *
 * Priority order:
 *   1. Explicit @mentions
 *   2. Pinned agent
 *   3. Keyword heuristic classification
 *   4. Fallback to first enabled agent
 *
 * In a full deployment, step 3 would be replaced by a fast LLM classifier
 * call (Haiku tier) for better accuracy. The heuristic serves as a
 * working local fallback.
 */
export async function routeMessage(ctx: RouterContext): Promise<RouterDecision> {
  const { userText, roster, pinnedAgent } = ctx;
  const enabledRoster = roster.filter((a) => a.enabled);

  if (enabledRoster.length === 0) {
    return {
      primary: null,
      interveners: [],
      reason: 'no agents enabled',
      routerDegraded: true,
    };
  }

  // 1. Check for @mentions
  const mentions = extractMentions(userText, enabledRoster);
  if (mentions.length > 0) {
    const primary = mentions[0];
    const interveners = mentions.slice(1, 3).filter((id) => id !== primary);
    return {
      primary,
      interveners,
      reason:
        interveners.length > 0
          ? `explicit @${primary} + ${interveners.map((id) => `@${id}`).join(', ')}`
          : `explicit @${primary}`,
      routerDegraded: false,
    };
  }

  // 2. Social messages: greetings go to first agent, acks go silent
  if (isAcknowledgment(userText.trim())) {
    return {
      primary: null,
      interveners: [],
      reason: 'acknowledgment -- silent',
      routerDegraded: false,
    };
  }

  if (isGreeting(userText.trim())) {
    const firstAgent = enabledRoster[0].id;
    return {
      primary: firstAgent,
      interveners: [],
      reason: `greeting -> ${firstAgent}`,
      routerDegraded: false,
    };
  }

  // 3. Pinned agent takes all un-addressed messages
  if (pinnedAgent && enabledRoster.some((a) => a.id === pinnedAgent)) {
    return {
      primary: pinnedAgent,
      interveners: [],
      reason: `pinned ${pinnedAgent}`,
      routerDegraded: false,
    };
  }

  // 4. Keyword heuristic classification
  const scores = scoreAgents(userText, enabledRoster);
  const topScore = scores[0];

  if (topScore && topScore.score > 0) {
    // Primary = highest scorer
    const primary = topScore.id;

    // Interveners = agents with score > 0 that aren't the primary (max 2)
    const interveners = scores
      .filter((s) => s.id !== primary && s.score > 0)
      .slice(0, 2)
      .map((s) => s.id);

    return {
      primary,
      interveners,
      reason: `keyword match: ${primary} (score ${topScore.score})`,
      routerDegraded: false,
    };
  }

  // 5. No match -- fallback to first enabled agent
  return routerFallback(ctx);
}

// ── Intervention gate ────────────────────────────────────────────────

/**
 * Decide whether a candidate agent should chime in after the primary
 * has already responded. Uses keyword overlap as a heuristic.
 *
 * In a full deployment, this would be a fast LLM call that evaluates
 * whether the candidate has something distinct to add.
 */
export async function interventionGate(ctx: {
  userText: string;
  primaryAgentId: string;
  primaryReply: string;
  candidateAgentId: string;
  candidateAgentDescription: string;
}): Promise<InterventionDecision> {
  const keywords = AGENT_KEYWORDS[ctx.candidateAgentId] ?? [];
  const combined = `${ctx.userText} ${ctx.primaryReply}`.toLowerCase();

  const relevance = keywords.reduce((acc, kw) => {
    return acc + (combined.includes(kw) ? 1 : 0);
  }, 0);

  // Only chime in if there's meaningful keyword overlap
  if (relevance >= 2) {
    return {
      speak: true,
      reply: `As ${ctx.candidateAgentId}, I have relevant context on this topic.`,
    };
  }

  return { speak: false, reply: '' };
}
