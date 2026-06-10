import { useCallback, useState } from 'react';

import type { AdversaryReport, Finding, Severity } from './adversaryService';
import { exportReport, getCounterArgument } from './adversaryService';

// ── Severity colours (crimson palette) ──────────────────────────────

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; bg: string; text: string; ring: string; dot: string }
> = {
  critical: {
    label: 'Critical',
    bg: 'bg-red-600/15',
    text: 'text-red-400',
    ring: 'ring-red-600/30',
    dot: 'bg-red-500',
  },
  high: {
    label: 'High',
    bg: 'bg-orange-600/15',
    text: 'text-orange-400',
    ring: 'ring-orange-600/30',
    dot: 'bg-orange-500',
  },
  medium: {
    label: 'Medium',
    bg: 'bg-yellow-600/15',
    text: 'text-yellow-400',
    ring: 'ring-yellow-600/30',
    dot: 'bg-yellow-500',
  },
  low: {
    label: 'Low',
    bg: 'bg-emerald-600/15',
    text: 'text-emerald-400',
    ring: 'ring-emerald-600/30',
    dot: 'bg-emerald-500',
  },
};

// ── Severity badge ──────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: Severity }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Vulnerability gauge ─────────────────────────────────────────────

function VulnerabilityGauge({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));

  const gaugeColor =
    clampedScore >= 75
      ? 'text-red-500'
      : clampedScore >= 50
        ? 'text-orange-500'
        : clampedScore >= 25
          ? 'text-yellow-500'
          : 'text-emerald-500';

  const barColor =
    clampedScore >= 75
      ? 'bg-red-600'
      : clampedScore >= 50
        ? 'bg-orange-600'
        : clampedScore >= 25
          ? 'bg-yellow-600'
          : 'bg-emerald-600';

  const label =
    clampedScore >= 75
      ? 'Highly Exposed'
      : clampedScore >= 50
        ? 'Significant Vulnerabilities'
        : clampedScore >= 25
          ? 'Moderate Exposure'
          : 'Well Defended';

  return (
    <div className="flex flex-col items-center gap-2 p-6 rounded-xl bg-zinc-900 border border-zinc-800">
      <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
        Vulnerability Score
      </span>
      <span className={`text-5xl font-bold tabular-nums ${gaugeColor}`}>{clampedScore}</span>
      <div className="w-full max-w-xs h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
      <span className={`text-sm font-medium ${gaugeColor}`}>{label}</span>
    </div>
  );
}

// ── Severity breakdown cards ────────────────────────────────────────

function SeverityBreakdown({ counts }: { counts: Record<Severity, number> }) {
  const severities: Severity[] = ['critical', 'high', 'medium', 'low'];

  return (
    <div className="grid grid-cols-4 gap-3">
      {severities.map(s => {
        const cfg = SEVERITY_CONFIG[s];
        return (
          <div
            key={s}
            className={`flex flex-col items-center gap-1 p-3 rounded-lg ring-1 ${cfg.bg} ${cfg.ring}`}>
            <span className={`text-2xl font-bold tabular-nums ${cfg.text}`}>{counts[s]}</span>
            <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Expandable section ──────────────────────────────────────────────

function ExpandableSection({
  title,
  content,
  defaultOpen = false,
}: {
  title: string;
  content: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!content) return null;

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 hover:bg-zinc-900 transition-colors text-left">
        <span className="text-sm font-semibold text-zinc-200">{title}</span>
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-4 py-3 text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}

// ── Single finding card ─────────────────────────────────────────────

function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);
  const [strengthening, setStrengthening] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStrengthen = useCallback(async () => {
    if (strengthening) {
      setExpanded(!expanded);
      return;
    }
    setLoading(true);
    try {
      const result = await getCounterArgument(finding);
      setStrengthening(result);
      setExpanded(true);
    } catch (err) {
      console.error('[adversary] Failed to generate counter-argument:', err);
    } finally {
      setLoading(false);
    }
  }, [finding, strengthening, expanded]);

  return (
    <div className="border border-zinc-800 rounded-lg p-4 space-y-3 bg-zinc-900/30">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <SeverityBadge severity={finding.severity} />
            <span className="text-xs text-zinc-600">{finding.section}</span>
          </div>
          <h4 className="text-sm font-semibold text-zinc-200">{finding.title}</h4>
        </div>
        <button
          onClick={handleStrengthen}
          disabled={loading}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
            bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors
            disabled:opacity-50 disabled:cursor-wait">
          {loading ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
          )}
          Strengthen
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-400 leading-relaxed">{finding.description}</p>

      {/* Source quote */}
      {finding.sourceQuote && (
        <blockquote className="border-l-2 border-red-600/40 pl-3 text-xs text-zinc-500 italic">
          "{finding.sourceQuote}"
        </blockquote>
      )}

      {/* Suggested counter-argument */}
      {finding.suggestedCounterArgument && (
        <div className="bg-zinc-800/40 rounded-md p-3 space-y-1">
          <span className="text-xs font-semibold text-zinc-400">Suggested Counter-Argument</span>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {finding.suggestedCounterArgument}
          </p>
        </div>
      )}

      {/* Evidence needed */}
      {finding.evidenceNeeded && (
        <div className="flex items-start gap-2 text-xs text-zinc-500">
          <svg
            className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <span>
            <strong className="text-zinc-400">Evidence needed:</strong> {finding.evidenceNeeded}
          </span>
        </div>
      )}

      {/* AI-generated strengthening recommendation */}
      {expanded && strengthening && (
        <div className="bg-emerald-600/5 border border-emerald-600/20 rounded-md p-3 space-y-1">
          <span className="text-xs font-semibold text-emerald-400">
            Strengthening Recommendation
          </span>
          <p className="text-xs text-emerald-300/80 leading-relaxed whitespace-pre-wrap">
            {strengthening}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main results component ──────────────────────────────────────────

interface AdversaryResultsProps {
  report: AdversaryReport;
  onClose?: () => void;
}

export function AdversaryResults({ report, onClose }: AdversaryResultsProps) {
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // ── Export handler ─────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    const text = exportReport(report);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adversary-report-${report.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [report]);

  // ── Share handler ─────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    try {
      const text = exportReport(report);
      await navigator.clipboard.writeText(text);
      setShareStatus('Copied to clipboard');
      setTimeout(() => setShareStatus(null), 2000);
    } catch {
      setShareStatus('Failed to copy');
      setTimeout(() => setShareStatus(null), 2000);
    }
  }, [report]);

  // ── Section data ──────────────────────────────────────────────────

  const sectionEntries: [string, string][] = [
    ['Weakest Arguments', report.sections.weakestArguments],
    ['Evidential Gaps', report.sections.evidentialGaps],
    ['Precedent Challenges', report.sections.precedentChallenges],
    ['Logical Fallacies', report.sections.logicalFallacies],
    ['Procedural Issues', report.sections.proceduralIssues],
    ['Opposing Strategy', report.sections.opposingStrategy],
    ['Recommended Strengthening', report.sections.recommendedStrengthening],
  ];

  // Sort findings: critical first, then high, medium, low
  const sortedFindings = [...report.findings].sort((a, b) => {
    const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 transition-colors">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Adversary Report</h2>
            <p className="text-xs text-zinc-500">
              {report.documentType.replace(/_/g, ' ')} &middot;{' '}
              {new Date(report.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {shareStatus && <span className="text-xs text-zinc-400">{shareStatus}</span>}
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
              bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
              />
            </svg>
            Share
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
              bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 transition-colors">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            Export PDF
          </button>
        </div>
      </div>

      {/* Vulnerability gauge + severity breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VulnerabilityGauge score={report.vulnerabilityScore} />
        <div className="flex flex-col justify-center gap-4">
          <SeverityBreakdown counts={report.severityCounts} />
          <div className="text-xs text-zinc-500 text-center">
            {report.findings.length} finding
            {report.findings.length !== 1 ? 's' : ''} across{' '}
            {Object.values(report.severityCounts).filter(v => v > 0).length} severity level
            {Object.values(report.severityCounts).filter(v => v > 0).length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Executive summary */}
      {report.executiveSummary && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
              />
            </svg>
            Executive Summary
          </h3>
          <p className="text-sm text-zinc-400 leading-relaxed">{report.executiveSummary}</p>
        </div>
      )}

      {/* Expandable analysis sections */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">Analysis Sections</h3>
        {sectionEntries.map(([title, content]) => (
          <ExpandableSection
            key={title}
            title={title}
            content={content}
            defaultOpen={title === 'Weakest Arguments'}
          />
        ))}
      </div>

      {/* Detailed findings */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300">
          Detailed Findings ({sortedFindings.length})
        </h3>
        {sortedFindings.map(finding => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </div>
    </div>
  );
}
