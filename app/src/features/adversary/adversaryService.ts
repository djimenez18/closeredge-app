/**
 * Adversary Agent — Service layer.
 *
 * Handles document analysis, stress testing, and counter-argument
 * generation. Communicates with the LLM through the app's existing
 * agent infrastructure (core RPC → backend → model).
 */
import { supabase } from '@/lib/supabase';

import {
  ADVERSARY_SYSTEM_PROMPT,
  CROSS_EXAMINATION_PROMPT,
  DOCUMENT_ATTACK_VECTORS,
  JUDGE_PERSPECTIVE_PROMPT,
} from './adversaryPrompts';

// ── Types ────────────────────────────────────────────────────────────

export type DocumentType =
  | 'witness_statement'
  | 'skeleton_argument'
  | 'motion'
  | 'brief'
  | 'contract'
  | 'submission';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Finding {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  section: string;
  suggestedCounterArgument: string;
  evidenceNeeded: string;
  sourceQuote?: string;
}

export interface AdversaryReport {
  id: string;
  createdAt: string;
  documentType: DocumentType;
  mode: 'document_review' | 'brief_stress_test';
  vulnerabilityScore: number; // 0–100
  executiveSummary: string;
  findings: Finding[];
  severityCounts: Record<Severity, number>;
  sections: {
    weakestArguments: string;
    evidentialGaps: string;
    precedentChallenges: string;
    logicalFallacies: string;
    proceduralIssues: string;
    opposingStrategy: string;
    recommendedStrengthening: string;
  };
}

export interface StressTestInput {
  briefText: string;
  position: string;
}

// ── Service ─────────────────────────────────────────────────────────

/**
 * Analyze a legal document from the adversary's perspective.
 *
 * Sends the document text plus the adversary system prompt and the
 * document-type-specific attack vectors to the LLM. Returns a
 * structured {@link AdversaryReport}.
 */
export async function analyzeDocument(
  file: File,
  documentType: DocumentType
): Promise<AdversaryReport> {
  const text = await file.text();

  const attackVector = DOCUMENT_ATTACK_VECTORS[documentType] ?? DOCUMENT_ATTACK_VECTORS.brief;

  const userPrompt = `## Document Type\n${documentType.replace(/_/g, ' ')}\n\n## Attack Focus\n${attackVector}\n\n## Document\n\n${text}`;

  const { data, error } = await supabase.functions.invoke('adversary-analyze', {
    body: {
      systemPrompt: ADVERSARY_SYSTEM_PROMPT,
      userPrompt,
      documentType,
      mode: 'document_review',
    },
  });

  if (error) {
    throw new Error(`Adversary analysis failed: ${error.message}`);
  }

  return normalizeReport(data, documentType, 'document_review');
}

/**
 * Run a comprehensive stress test on a legal brief.
 *
 * Combines the adversary system prompt, the judge-perspective prompt,
 * and the cross-examination prompt to attack the brief from three
 * angles simultaneously.
 */
export async function runStressTest(input: StressTestInput): Promise<AdversaryReport> {
  const combinedSystemPrompt = [
    ADVERSARY_SYSTEM_PROMPT,
    '',
    '--- JUDGE PERSPECTIVE ---',
    JUDGE_PERSPECTIVE_PROMPT,
    '',
    '--- CROSS-EXAMINATION ---',
    CROSS_EXAMINATION_PROMPT,
  ].join('\n');

  const userPrompt = `## Your Position\n${input.position}\n\n## Brief\n\n${input.briefText}`;

  const { data, error } = await supabase.functions.invoke('adversary-analyze', {
    body: {
      systemPrompt: combinedSystemPrompt,
      userPrompt,
      documentType: 'brief',
      mode: 'brief_stress_test',
    },
  });

  if (error) {
    throw new Error(`Stress test failed: ${error.message}`);
  }

  return normalizeReport(data, 'brief', 'brief_stress_test');
}

/**
 * Generate a counter-argument or strengthening recommendation for a
 * single finding.
 */
export async function getCounterArgument(finding: Finding): Promise<string> {
  const userPrompt = [
    `The opposing counsel identified the following vulnerability in our argument:`,
    '',
    `**${finding.title}** (${finding.severity})`,
    finding.description,
    '',
    finding.sourceQuote ? `> "${finding.sourceQuote}"` : '',
    '',
    `Draft a concise, legally precise counter-argument or strengthening recommendation that addresses this vulnerability. Include suggested authority if applicable.`,
  ].join('\n');

  const { data, error } = await supabase.functions.invoke('adversary-analyze', {
    body: {
      systemPrompt:
        'You are a senior litigation attorney. Your task is to shore up the weakness identified by opposing counsel. Be specific, cite applicable authority, and provide actionable language your team can drop into the brief.',
      userPrompt,
      documentType: null,
      mode: 'counter_argument',
    },
  });

  if (error) {
    throw new Error(`Counter-argument generation failed: ${error.message}`);
  }

  return (data as { counterArgument: string }).counterArgument ?? String(data);
}

/**
 * Format the report for export (PDF / printable HTML).
 */
export function exportReport(report: AdversaryReport): string {
  const severityLabel = (s: Severity) =>
    ({ critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' })[s];

  const lines: string[] = [
    `ADVERSARY REPORT`,
    `Generated: ${new Date(report.createdAt).toLocaleString()}`,
    `Document Type: ${report.documentType.replace(/_/g, ' ')}`,
    `Vulnerability Score: ${report.vulnerabilityScore}/100`,
    '',
    `═══ EXECUTIVE SUMMARY ═══`,
    report.executiveSummary,
    '',
    `═══ SEVERITY BREAKDOWN ═══`,
    `  Critical: ${report.severityCounts.critical}`,
    `  High:     ${report.severityCounts.high}`,
    `  Medium:   ${report.severityCounts.medium}`,
    `  Low:      ${report.severityCounts.low}`,
    '',
  ];

  // Section content
  const sectionEntries: [string, string][] = [
    ['WEAKEST ARGUMENTS', report.sections.weakestArguments],
    ['EVIDENTIAL GAPS', report.sections.evidentialGaps],
    ['PRECEDENT CHALLENGES', report.sections.precedentChallenges],
    ['LOGICAL FALLACIES', report.sections.logicalFallacies],
    ['PROCEDURAL ISSUES', report.sections.proceduralIssues],
    ['OPPOSING STRATEGY', report.sections.opposingStrategy],
    ['RECOMMENDED STRENGTHENING', report.sections.recommendedStrengthening],
  ];

  for (const [header, body] of sectionEntries) {
    lines.push(`═══ ${header} ═══`);
    lines.push(body || '(none identified)');
    lines.push('');
  }

  // Individual findings
  lines.push(`═══ DETAILED FINDINGS (${report.findings.length}) ═══`);
  for (const f of report.findings) {
    lines.push(`[${severityLabel(f.severity)}] ${f.title}`);
    lines.push(`  ${f.description}`);
    if (f.suggestedCounterArgument) {
      lines.push(`  Counter: ${f.suggestedCounterArgument}`);
    }
    if (f.evidenceNeeded) {
      lines.push(`  Evidence needed: ${f.evidenceNeeded}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Normalize raw API response into the canonical report shape. */
function normalizeReport(
  raw: unknown,
  documentType: DocumentType,
  mode: 'document_review' | 'brief_stress_test'
): AdversaryReport {
  const data = raw as Record<string, unknown>;

  const findings: Finding[] = Array.isArray(data.findings)
    ? (data.findings as Record<string, unknown>[]).map((f, i) => ({
        id: (f.id as string) ?? `f_${i}`,
        title: (f.title as string) ?? 'Untitled finding',
        description: (f.description as string) ?? '',
        severity: validateSeverity(f.severity),
        section: (f.section as string) ?? 'general',
        suggestedCounterArgument: (f.suggestedCounterArgument as string) ?? '',
        evidenceNeeded: (f.evidenceNeeded as string) ?? '',
        sourceQuote: (f.sourceQuote as string) ?? undefined,
      }))
    : [];

  const severityCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    severityCounts[f.severity]++;
  }

  return {
    id: (data.id as string) ?? `rpt_${Date.now().toString(36)}`,
    createdAt: (data.createdAt as string) ?? new Date().toISOString(),
    documentType,
    mode,
    vulnerabilityScore:
      typeof data.vulnerabilityScore === 'number'
        ? data.vulnerabilityScore
        : computeVulnerabilityScore(severityCounts),
    executiveSummary: (data.executiveSummary as string) ?? '',
    findings,
    severityCounts,
    sections: {
      weakestArguments: getSectionText(data, 'weakestArguments'),
      evidentialGaps: getSectionText(data, 'evidentialGaps'),
      precedentChallenges: getSectionText(data, 'precedentChallenges'),
      logicalFallacies: getSectionText(data, 'logicalFallacies'),
      proceduralIssues: getSectionText(data, 'proceduralIssues'),
      opposingStrategy: getSectionText(data, 'opposingStrategy'),
      recommendedStrengthening: getSectionText(data, 'recommendedStrengthening'),
    },
  };
}

function validateSeverity(val: unknown): Severity {
  const s = String(val).toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low') {
    return s;
  }
  return 'medium';
}

function getSectionText(data: Record<string, unknown>, key: string): string {
  const sections = data.sections as Record<string, unknown> | undefined;
  if (sections && typeof sections[key] === 'string') {
    return sections[key] as string;
  }
  if (typeof data[key] === 'string') {
    return data[key] as string;
  }
  return '';
}

function computeVulnerabilityScore(counts: Record<Severity, number>): number {
  // Weighted score: critical=25, high=15, medium=8, low=3
  const raw = counts.critical * 25 + counts.high * 15 + counts.medium * 8 + counts.low * 3;
  return Math.min(100, raw);
}
