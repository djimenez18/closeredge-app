import { supabase } from '@/lib/supabase';

import { storeMemory } from './memoryService';
import type { ExtractionResult } from './memoryTypes';

// ── Configuration ────────────────────────────────────────────────

/** Minimum message length to consider for extraction. */
const MIN_MESSAGE_LENGTH = 15;

/** Minimum importance score to persist a memory (filters noise). */
const IMPORTANCE_THRESHOLD = 0.5;

/**
 * Cosine similarity between two equal-length number arrays.
 * Used for duplicate detection when embeddings are available.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Extraction prompt ────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a memory extraction agent. Given a conversation exchange between a user and their AI assistant, decide if it contains information worth remembering LONG-TERM (weeks/months from now).

The bar is HIGH. Most exchanges should be skipped. Only extract if a future conversation would go noticeably worse without this memory.

SKIP (return {"skip": true}) if:
- The message is just an acknowledgment (ok, yes, no, got it, thanks, send it, do it)
- It's a command with no lasting context
- It's ephemeral task execution (send this email, check my calendar, read this message)
- The content is only relevant to this exact moment or this session
- It's a greeting or small talk with no substance
- It's a one-off action request like "shorten that", "generate 3 ideas", "look up X"
- It's a correction of a typo or minor instruction adjustment
- It's asking for information or a status check
- The assistant is SUMMARIZING what it just did
- It's form-filling or draft iteration that won't matter once the form is submitted

EXTRACT only if the exchange reveals:
- User preferences or habits that apply GOING FORWARD
- Decisions or policies (how to handle X from now on)
- Important relationships: WHO someone is and HOW the user relates to them
- Corrections to the assistant's behavior (feedback on approach)
- Business rules or workflows that are STANDING RULES
- Recurring patterns or routines
- Technical preferences or architectural decisions

If extracting, return JSON:
{
  "skip": false,
  "summary": "1-2 sentence summary focused on the LASTING FACT, not the conversation.",
  "entities": ["entity1", "entity2"],
  "topics": ["topic1", "topic2"],
  "importance": 0.0-1.0
}

Importance guide:
- 0.8-1.0: Core identity, strong preferences, critical business rules, relationship dynamics
- 0.5-0.7: Useful context, standing project decisions, moderate preferences, workflow patterns
- 0.3-0.4: Borderline. If in doubt, skip.

User message: {USER_MESSAGE}
Assistant response: {ASSISTANT_RESPONSE}`;

// ── Entity extraction ────────────────────────────────────────────

/**
 * Extract entities from text using an LLM call.
 *
 * @param text - The text to extract entities from
 * @param llmCall - Function that sends a prompt to an LLM and returns the response
 * @returns Array of entity strings (people, places, projects, dates)
 */
export async function extractEntities(
  text: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<string[]> {
  const prompt = `Extract all named entities from this text. Return a JSON array of strings. Include people, organizations, places, projects, products, and dates.

Text: ${text.slice(0, 2000)}

Return ONLY a JSON array, e.g.: ["John Smith", "Acme Corp", "Project Alpha"]`;

  try {
    const raw = await llmCall(prompt);
    const parsed = parseJsonFromLLM<string[]>(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Score the importance of a piece of text (0.0 to 1.0).
 *
 * @param text - The text to score
 * @param context - Additional context (e.g., conversation history)
 * @param llmCall - Function that sends a prompt to an LLM and returns the response
 */
export async function scoreImportance(
  text: string,
  context: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<number> {
  const prompt = `Rate the long-term importance of this information on a scale of 0.0 to 1.0.
Consider: Will this information be needed in future conversations weeks or months from now?

Context: ${context.slice(0, 500)}
Text: ${text.slice(0, 1000)}

Return ONLY a number between 0.0 and 1.0.`;

  try {
    const raw = await llmCall(prompt);
    const score = parseFloat(raw.trim());
    if (isNaN(score)) return 0.5;
    return Math.max(0, Math.min(1, score));
  } catch {
    return 0.5;
  }
}

// ── Full ingestion pipeline ──────────────────────────────────────

/**
 * Ingest a conversation turn: extract structured memory if warranted.
 *
 * Ported from ClaudeClaw's `ingestConversationTurn`. This is designed
 * to run fire-and-forget after the assistant responds.
 *
 * @param userMessage - What the user said
 * @param assistantResponse - What the assistant replied
 * @param agentId - Which agent is processing this
 * @param chatId - The conversation/chat ID
 * @param llmCall - LLM function for extraction (injected for testability)
 * @returns true if a memory was saved, false if skipped
 */
export async function ingestConversationTurn(
  userMessage: string,
  assistantResponse: string,
  agentId: string,
  chatId: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<boolean> {
  // Hard filter: skip very short messages and commands
  if (userMessage.length <= MIN_MESSAGE_LENGTH || userMessage.startsWith('/')) {
    return false;
  }

  try {
    const prompt = EXTRACTION_PROMPT.replace('{USER_MESSAGE}', userMessage.slice(0, 2000)).replace(
      '{ASSISTANT_RESPONSE}',
      assistantResponse.slice(0, 2000)
    );

    const raw = await llmCall(prompt);
    const result = parseJsonFromLLM<ExtractionResult & { skip?: boolean }>(raw);

    if (!result || result.skip) return false;

    // Validate required fields
    if (!result.summary || typeof result.importance !== 'number') {
      console.warn('[memory-ingest] extraction missing required fields');
      return false;
    }

    // Hard filter: only save memories with meaningful importance
    if (result.importance < IMPORTANCE_THRESHOLD) return false;

    const importance = Math.max(0, Math.min(1, result.importance));

    // Duplicate detection via summary similarity (lightweight, no embeddings needed)
    const isDuplicate = await checkDuplicate(result.summary, agentId);
    if (isDuplicate) {
      console.debug('[memory-ingest] skipping duplicate memory');
      return false;
    }

    const memoryId = await storeMemory(
      userMessage,
      result.summary,
      'conversation',
      agentId,
      chatId,
      result.entities ?? [],
      result.topics ?? [],
      importance
    );

    if (memoryId) {
      console.info(
        `[memory-ingest] saved memory #${memoryId} (importance=${importance.toFixed(2)}, topics=${(result.topics ?? []).join(',')})`
      );
      return true;
    }

    return false;
  } catch (err) {
    console.error('[memory-ingest] ingestion failed:', err);
    return false;
  }
}

/**
 * Ingest multiple conversation turns at once (batch mode).
 * Useful at end of conversation or on a quiet-period trigger.
 *
 * @param turns - Array of { user, assistant } message pairs
 * @param agentId - Which agent processed these
 * @param chatId - The conversation/chat ID
 * @param llmCall - LLM function for extraction
 * @returns Number of memories saved
 */
export async function ingestConversation(
  turns: Array<{ user: string; assistant: string }>,
  agentId: string,
  chatId: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<number> {
  let saved = 0;
  for (const turn of turns) {
    const wasSaved = await ingestConversationTurn(
      turn.user,
      turn.assistant,
      agentId,
      chatId,
      llmCall
    );
    if (wasSaved) saved++;
  }
  return saved;
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Parse JSON from an LLM response, handling markdown code fences
 * and other formatting artifacts.
 */
function parseJsonFromLLM<T>(raw: string): T | null {
  // Strip markdown code fences
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract JSON object from mixed text
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch {
        return null;
      }
    }
    // Try to extract JSON array
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Check if a very similar memory already exists (lightweight duplicate detection).
 * Uses substring matching on summaries rather than embeddings.
 */
async function checkDuplicate(summary: string, agentId: string): Promise<boolean> {
  // Fetch recent memories and check for near-duplicate summaries
  const { data } = await supabase
    .from('memories')
    .select('summary')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!data || data.length === 0) return false;

  const normalised = summary.toLowerCase().trim();
  for (const row of data as Array<{ summary: string }>) {
    const existing = row.summary.toLowerCase().trim();
    // Exact or near-exact match
    if (existing === normalised) return true;
    // Jaccard similarity on word sets (cheap approximation)
    const wordsA = new Set(normalised.split(/\s+/));
    const wordsB = new Set(existing.split(/\s+/));
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    const jaccard = union.size > 0 ? intersection.size / union.size : 0;
    if (jaccard > 0.85) return true;
  }

  return false;
}

export { parseJsonFromLLM, cosineSimilarity };
