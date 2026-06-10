/**
 * War Room tool policy.
 *
 * Ported from ClaudeClaw warroom-tool-policy.ts. Controls which tools
 * each agent is allowed to use during a War Room session.
 *
 * Default-deny for side-effect tools. Read-only tools are always allowed.
 * Per-agent overrides let operators grant specific write capabilities.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface WarRoomToolPolicy {
  /** Tool names the agent is allowed to invoke. */
  allowedTools: string[];
  /** Tool names explicitly denied (defense-in-depth). */
  disallowedTools: string[];
  /** MCP server names this agent can access. Empty = no MCPs. */
  allowedMcpServers: string[];
}

export interface ToolAuditEntry {
  timestamp: number;
  agentId: string;
  meetingId: string;
  tool: string;
  allowed: boolean;
  reason: string;
}

// ── Constants ────────────────────────────────────────────────────────

/** Read-only tools that are always safe in a War Room context. */
const SAFE_READONLY_TOOLS = [
  'search',
  'read_file',
  'web_search',
  'web_fetch',
  'list_files',
  'get_context',
] as const;

/** Side-effect tools that are denied by default. */
const SIDE_EFFECT_TOOLS = [
  'write_file',
  'execute_command',
  'send_email',
  'send_message',
  'create_event',
  'delete_file',
  'modify_database',
  'deploy',
] as const;

/**
 * Per-agent default tool allowlists. These are starting points --
 * operators can override via agent configuration.
 *
 * Maps CloserEdge agent IDs to the extra tools they're allowed beyond
 * the read-only baseline.
 */
const DEFAULT_AGENT_ALLOWLISTS: Record<string, string[]> = {
  // Eden: residential real estate. Mostly advisory in war room.
  eden: [],
  // Crest: commercial real estate. Read-only by default.
  crest: [],
  // Forge: home services. May need to look up scheduling.
  forge: ['get_context'],
  // Haven: medical/dental. Strictly read-only for compliance.
  haven: [],
  // Lexis: legal. Read-only -- never auto-execute legal actions.
  lexis: [],
  // Nora: property management. May need scheduling access.
  nora: ['get_context'],
};

// ── Audit log ────────────────────────────────────────────────────────

const _auditLog: ToolAuditEntry[] = [];
const AUDIT_LOG_MAX = 500;

/** Record a tool call for auditing. */
export function logToolCall(
  agentId: string,
  meetingId: string,
  tool: string,
  allowed: boolean,
  reason: string,
): void {
  _auditLog.push({
    timestamp: Date.now(),
    agentId,
    meetingId,
    tool,
    allowed,
    reason,
  });
  // Ring buffer -- evict oldest when full.
  if (_auditLog.length > AUDIT_LOG_MAX) {
    _auditLog.splice(0, _auditLog.length - AUDIT_LOG_MAX);
  }
}

/** Get recent audit entries. Newest first. */
export function getAuditLog(limit = 50): ToolAuditEntry[] {
  return _auditLog.slice(-limit).reverse();
}

/** Clear the audit log (for testing). */
export function clearAuditLog(): void {
  _auditLog.length = 0;
}

// ── Policy builder ───────────────────────────────────────────────────

/**
 * Build the tool policy for an agent in the War Room.
 *
 * @param agentId - The agent's identifier (e.g. 'eden', 'crest')
 * @param agentToolOverrides - Optional per-agent tool allowlist from config
 */
export function buildToolPolicy(
  agentId: string,
  agentToolOverrides?: string[],
): WarRoomToolPolicy {
  const overrides =
    agentToolOverrides && agentToolOverrides.length > 0
      ? agentToolOverrides
      : null;

  const extra = overrides ?? DEFAULT_AGENT_ALLOWLISTS[agentId] ?? [];
  const allowed = Array.from(
    new Set([...SAFE_READONLY_TOOLS, ...extra]),
  );

  // Deny every side-effect tool the agent didn't explicitly opt into.
  const disallowed = SIDE_EFFECT_TOOLS.filter(
    (t) => !allowed.includes(t),
  );

  // MCP servers default to none. Opt in via 'mcp:<server>' entries.
  const allowedMcpServers = (overrides ?? [])
    .filter((t) => t.startsWith('mcp:'))
    .map((t) => t.slice('mcp:'.length));

  return {
    allowedTools: allowed,
    disallowedTools: disallowed,
    allowedMcpServers,
  };
}

/**
 * Check whether a specific tool call is allowed under the given policy.
 * Logs the decision to the audit trail.
 */
export function isToolAllowed(
  policy: WarRoomToolPolicy,
  tool: string,
  agentId: string,
  meetingId: string,
): boolean {
  // Explicitly denied = always blocked.
  if (policy.disallowedTools.includes(tool)) {
    logToolCall(agentId, meetingId, tool, false, 'explicitly denied');
    return false;
  }

  // Explicitly allowed = pass.
  if (policy.allowedTools.includes(tool)) {
    logToolCall(agentId, meetingId, tool, true, 'in allowlist');
    return true;
  }

  // Default-deny anything not in the allowlist.
  logToolCall(agentId, meetingId, tool, false, 'not in allowlist (default-deny)');
  return false;
}
