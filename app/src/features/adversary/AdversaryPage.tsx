import React, { useCallback, useRef, useState } from 'react';

import { AdversaryResults } from './AdversaryResults';
import {
  type AdversaryReport,
  analyzeDocument,
  type DocumentType,
  runStressTest,
} from './adversaryService';

// ── Types ────────────────────────────────────────────────────────────

type Mode = 'document_review' | 'moot_court' | 'brief_stress_test';

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'witness_statement', label: 'Witness Statement' },
  { value: 'skeleton_argument', label: 'Skeleton Argument' },
  { value: 'motion', label: 'Motion' },
  { value: 'brief', label: 'Brief' },
  { value: 'contract', label: 'Contract' },
  { value: 'submission', label: 'Submission' },
];

// ── Mode cards ──────────────────────────────────────────────────────

function ModeCard({
  title,
  description,
  icon,
  active,
  disabled,
  disabledReason,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-start gap-3 p-5 rounded-xl border text-left transition-all
        ${
          active
            ? 'bg-coral-600/10 border-coral-600/40 ring-1 ring-coral-600/20'
            : disabled
              ? 'bg-neutral-900/30 border-neutral-800/50 opacity-60 cursor-not-allowed'
              : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/80'
        }`}>
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          active
            ? 'bg-coral-600/20 text-coral-400'
            : disabled
              ? 'bg-neutral-800/50 text-neutral-600'
              : 'bg-neutral-800 text-neutral-400'
        }`}>
        {icon}
      </div>
      <div>
        <h3 className={`text-sm font-semibold ${active ? 'text-coral-300' : 'text-neutral-200'}`}>
          {title}
        </h3>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{description}</p>
      </div>
      {disabled && disabledReason && (
        <span className="absolute top-3 right-3 text-[10px] font-medium text-neutral-600 bg-neutral-800 px-2 py-0.5 rounded-full">
          {disabledReason}
        </span>
      )}
    </button>
  );
}

// ── File drop zone ──────────────────────────────────────────────────

function FileDropZone({ file, onFile }: { file: File | null; onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) onFile(dropped);
    },
    [onFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) onFile(selected);
    },
    [onFile]
  );

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors
        ${
          dragging
            ? 'border-coral-500/60 bg-coral-600/5'
            : file
              ? 'border-neutral-700 bg-neutral-900/50'
              : 'border-neutral-700 bg-neutral-900/30 hover:border-neutral-600 hover:bg-neutral-900/50'
        }`}>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".txt,.pdf,.doc,.docx,.md,.rtf"
        onChange={handleChange}
      />

      {file ? (
        <>
          <div className="w-10 h-10 rounded-lg bg-coral-600/10 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-coral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-200">{file.name}</p>
            <p className="text-xs text-neutral-500">
              {(file.size / 1024).toFixed(1)} KB &middot; Click to replace
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-neutral-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-300">
              Drop a document here or click to upload
            </p>
            <p className="text-xs text-neutral-600 mt-1">TXT, PDF, DOC, DOCX, MD, RTF</p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page component ─────────────────────────────────────────────

export function AdversaryPage() {
  // State
  const [mode, setMode] = useState<Mode>('document_review');
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>('brief');
  const [briefText, setBriefText] = useState('');
  const [position, setPosition] = useState('');
  const [report, setReport] = useState<AdversaryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleAttackDocument = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeDocument(file, documentType);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [file, documentType]);

  const handleStressTest = useCallback(async () => {
    if (!briefText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await runStressTest({ briefText, position });
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stress test failed');
    } finally {
      setLoading(false);
    }
  }, [briefText, position]);

  const handleClearReport = useCallback(() => {
    setReport(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Adversary icon — crimson shield with sword */}
          <div className="w-8 h-8 rounded-lg bg-coral-600/20 flex items-center justify-center">
            <svg
              className="w-4.5 h-4.5 text-coral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <div>
            <h1 className="font-display text-base font-semibold text-neutral-100">
              Adversary Agent <span className="text-coral-400">&mdash; AI Opposing Counsel</span>
            </h1>
            <p className="text-xs text-neutral-500">
              Elite &middot; Lexis &middot; Stress-test your legal arguments
            </p>
          </div>
        </div>

        {/* Elite badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-coral-600/10 border border-coral-600/20">
          <svg className="w-3.5 h-3.5 text-coral-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span className="text-xs font-semibold text-coral-400">Elite</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
          {/* Show results if available */}
          {report ? (
            <AdversaryResults report={report} onClose={handleClearReport} />
          ) : (
            <>
              {/* Mode selection */}
              <div>
                <h2 className="text-sm font-semibold text-neutral-300 mb-3">Select Mode</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <ModeCard
                    title="Document Review"
                    description="Upload a legal document and the Adversary attacks it, finding every weakness."
                    icon={
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                        />
                      </svg>
                    }
                    active={mode === 'document_review'}
                    onClick={() => setMode('document_review')}
                  />
                  <ModeCard
                    title="Moot Court"
                    description="Real-time adversarial debate with voice-powered cross-examination."
                    icon={
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                        />
                      </svg>
                    }
                    active={mode === 'moot_court'}
                    disabled
                    disabledReason="Requires Pro/Elite Voice"
                    onClick={() => setMode('moot_court')}
                  />
                  <ModeCard
                    title="Brief Stress Test"
                    description="Comprehensive vulnerability report on a legal brief with all attack angles."
                    icon={
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"
                        />
                      </svg>
                    }
                    active={mode === 'brief_stress_test'}
                    onClick={() => setMode('brief_stress_test')}
                  />
                </div>
              </div>

              {/* Mode-specific content */}
              {mode === 'document_review' && (
                <div className="space-y-5">
                  <FileDropZone file={file} onFile={setFile} />

                  {/* Document type selector */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-2">
                      Document Type
                    </label>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                      {DOCUMENT_TYPES.map(dt => (
                        <button
                          key={dt.value}
                          onClick={() => setDocumentType(dt.value)}
                          className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors
                            ${
                              documentType === dt.value
                                ? 'bg-coral-600/20 text-coral-400 border border-coral-600/40'
                                : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:border-neutral-700'
                            }`}>
                          {dt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Attack button */}
                  <button
                    onClick={handleAttackDocument}
                    disabled={!file || loading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl
                      bg-coral-600 hover:bg-coral-500 disabled:bg-neutral-800 disabled:text-neutral-600
                      text-sm font-bold text-white transition-colors">
                    {loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286z"
                          />
                        </svg>
                        Attack This Document
                      </>
                    )}
                  </button>
                </div>
              )}

              {mode === 'moot_court' && (
                <div className="space-y-5">
                  {/* Moot Court preview / placeholder */}
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-8 text-center space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-neutral-800/50 flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-neutral-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-300">Moot Court Mode</h3>
                      <p className="text-sm text-neutral-500 mt-2 max-w-md mx-auto leading-relaxed">
                        Face the Adversary in a live voice-powered cross-examination. Present your
                        argument verbally and receive real-time pushback, leading questions, and
                        challenges to your reasoning.
                      </p>
                    </div>

                    <div className="bg-neutral-800/50 rounded-lg p-4 max-w-sm mx-auto space-y-3">
                      <p className="text-xs font-semibold text-neutral-400">
                        What the experience looks like:
                      </p>
                      <ul className="text-xs text-neutral-500 space-y-1.5 text-left">
                        <li className="flex items-start gap-2">
                          <span className="text-coral-500 mt-0.5">1.</span>
                          You state your argument aloud
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-coral-500 mt-0.5">2.</span>
                          The Adversary responds with challenging questions
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-coral-500 mt-0.5">3.</span>
                          Back-and-forth debate until weaknesses are exposed
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-coral-500 mt-0.5">4.</span>
                          Full transcript and findings generated after the session
                        </li>
                      </ul>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-xs text-neutral-600">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                        />
                      </svg>
                      Requires Pro or Elite tier with Voice enabled
                    </div>
                  </div>
                </div>
              )}

              {mode === 'brief_stress_test' && (
                <div className="space-y-5">
                  {/* Position input */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-2">
                      Your Position
                    </label>
                    <input
                      type="text"
                      value={position}
                      onChange={e => setPosition(e.target.value)}
                      placeholder="e.g. Defendant argues the contract is void for lack of consideration..."
                      className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-sm text-neutral-200
                        placeholder:text-neutral-600 focus:outline-none focus:border-coral-600/40 focus:ring-1 focus:ring-coral-600/20
                        transition-colors"
                    />
                  </div>

                  {/* Brief text area */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-2">
                      Brief / Legal Argument
                    </label>
                    <textarea
                      value={briefText}
                      onChange={e => setBriefText(e.target.value)}
                      placeholder="Paste your brief or legal argument here..."
                      rows={12}
                      className="w-full px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-800 text-sm text-neutral-200
                        placeholder:text-neutral-600 focus:outline-none focus:border-coral-600/40 focus:ring-1 focus:ring-coral-600/20
                        transition-colors resize-y"
                    />
                    <p className="text-xs text-neutral-600 mt-1">
                      {briefText.length > 0
                        ? `${briefText.split(/\s+/).filter(Boolean).length} words`
                        : 'Paste the full brief for comprehensive analysis'}
                    </p>
                  </div>

                  {/* Stress test button */}
                  <button
                    onClick={handleStressTest}
                    disabled={!briefText.trim() || loading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl
                      bg-coral-600 hover:bg-coral-500 disabled:bg-neutral-800 disabled:text-neutral-600
                      text-sm font-bold text-white transition-colors">
                    {loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                        Running Stress Test...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"
                          />
                        </svg>
                        Run Stress Test
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-coral-600/10 border border-coral-600/30">
                  <svg
                    className="w-5 h-5 text-coral-400 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-coral-400">Analysis Failed</p>
                    <p className="text-xs text-coral-400/70 mt-0.5">{error}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
