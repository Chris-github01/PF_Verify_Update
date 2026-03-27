import { useEffect, useState } from 'react';
import { Play, RefreshCw, ChevronDown, AlertTriangle, CheckCircle, XCircle, Database } from 'lucide-react';
import { fetchPlumbingQuotes, runShadowComparison, type QuoteOption } from '../../lib/shadow/runShadowComparison';
import type { RunMode } from '../../types/shadow';

interface NewRunPanelProps {
  moduleKey: string;
  onRunComplete: (runId: string) => void;
}

type PanelStatus = 'idle' | 'loading_quotes' | 'ready' | 'running' | 'success' | 'error';

const MODE_OPTIONS: { value: RunMode; label: string; description: string }[] = [
  {
    value: 'live_vs_shadow',
    label: 'Live vs Shadow',
    description: 'Run both parsers and compare their outputs side-by-side',
  },
  {
    value: 'shadow_only',
    label: 'Shadow Only',
    description: 'Run the shadow parser only — no diff generated',
  },
];

function formatCurrency(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

export default function NewRunPanel({ moduleKey, onRunComplete }: NewRunPanelProps) {
  const [status, setStatus] = useState<PanelStatus>('idle');
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
  const [mode, setMode] = useState<RunMode>('live_vs_shadow');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && quotes.length === 0) {
      loadQuotes();
    }
  }, [expanded]);

  async function loadQuotes() {
    setStatus('loading_quotes');
    setErrorMsg(null);
    try {
      const data = await fetchPlumbingQuotes(60);
      setQuotes(data);
      setStatus('ready');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to load quotes');
      setStatus('error');
    }
  }

  async function handleRun() {
    if (!selectedQuoteId) return;
    setStatus('running');
    setErrorMsg(null);
    setLastRunId(null);

    const selectedQuote = quotes.find((q) => q.id === selectedQuoteId);
    console.log('[shadow] Triggering run:', { moduleKey, quoteId: selectedQuoteId, mode, quote: selectedQuote?.supplierName });

    try {
      const result = await runShadowComparison({ moduleKey, quoteId: selectedQuoteId, mode });

      if (result.status === 'completed') {
        setStatus('success');
        setLastRunId(result.runId);
        onRunComplete(result.runId);
      } else {
        setErrorMsg(result.error ?? 'Run failed');
        setStatus('error');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unexpected error');
      setStatus('error');
    }
  }

  const isRunning = status === 'running';
  const selectedQuote = quotes.find((q) => q.id === selectedQuoteId);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Run New Comparison</span>
          <span className="text-xs text-gray-500 font-mono">{moduleKey}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-gray-800 px-4 py-4 space-y-4">

          {/* Quote selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">Select Quote</label>
            {status === 'loading_quotes' ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Loading quotes...
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedQuoteId}
                  onChange={(e) => setSelectedQuoteId(e.target.value)}
                  disabled={isRunning}
                  className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 disabled:opacity-50 pr-8"
                >
                  <option value="">-- Select a parsed plumbing quote --</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.supplierName ?? 'Unknown supplier'} · {formatCurrency(q.totalPrice)} · {q.itemCount} items
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              </div>
            )}
            {quotes.length === 0 && status === 'ready' && (
              <p className="text-xs text-amber-400/80 flex items-start gap-1.5 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                No successfully parsed plumbing quotes found. Import and parse a plumbing quote first.
              </p>
            )}
            {selectedQuote && (
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                <Database className="w-3 h-3 shrink-0" />
                <span className="font-mono">{selectedQuote.id.slice(0, 8)}…</span>
                <span>{selectedQuote.itemCount} line items</span>
                <span>{formatCurrency(selectedQuote.totalPrice)}</span>
              </div>
            )}
          </div>

          {/* Mode selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">Comparison Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  disabled={isRunning}
                  className={`text-left p-3 rounded-lg border transition-all text-xs disabled:opacity-50 ${
                    mode === opt.value
                      ? 'border-blue-500/50 bg-blue-950/30 text-blue-300'
                      : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                  }`}
                >
                  <div className="font-semibold mb-0.5">{opt.label}</div>
                  <div className="text-[11px] opacity-70 leading-snug">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Status / error feedback */}
          {status === 'success' && lastRunId && (
            <div className="flex items-center gap-2 bg-green-950/40 border border-green-800 rounded-lg px-3 py-2 text-xs text-green-300">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Run completed — <span className="font-mono">{lastRunId.slice(0, 8)}</span> — scroll down to view results</span>
              {mode === 'live_vs_shadow' && (
                <a
                  href={`/shadow/plumbing/compare/${lastRunId}`}
                  className="ml-auto text-blue-400 hover:text-blue-300 underline whitespace-nowrap"
                >
                  View Diff
                </a>
              )}
            </div>
          )}

          {(status === 'error' || errorMsg) && (
            <div className="flex items-start gap-2 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-xs text-red-300">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {errorMsg ?? 'An error occurred'}
            </div>
          )}

          {/* Run button */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleRun}
              disabled={!selectedQuoteId || isRunning || status === 'loading_quotes'}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Comparison
                </>
              )}
            </button>
            <p className="text-[11px] text-gray-600 leading-snug">
              Runs locally in browser — no live parsing pipeline is affected.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
