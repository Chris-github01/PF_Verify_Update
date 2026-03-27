import { useEffect, useState } from 'react';
import { Play, RefreshCw, ChevronDown, AlertTriangle, CheckCircle, XCircle, Database, Eye } from 'lucide-react';
import { fetchQuotesByTrade, runShadowComparison, type QuoteOption } from '../../lib/shadow/runShadowComparison';
import { TRADE_MODULES } from '../../lib/modules/tradeRegistry';
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
  if (n == null || n === 0) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

function getDatasetLabel(moduleKey: string): string {
  const mod = TRADE_MODULES[moduleKey];
  if (!mod) return 'Select dataset';
  const tradeName = mod.module_name.replace(' Parser', '').trim().toLowerCase();
  return `Select ${tradeName} dataset`;
}

function getTradeCategory(moduleKey: string): string {
  return TRADE_MODULES[moduleKey]?.trade_category ?? 'plumbing';
}

function getTradeName(moduleKey: string): string {
  const mod = TRADE_MODULES[moduleKey];
  if (!mod) return 'trade';
  return mod.module_name.replace(' Parser', '').trim().toLowerCase();
}

function getComparePath(moduleKey: string, runId: string): string {
  const trade = getTradeCategory(moduleKey).replace('_', '-');
  return `/shadow/${trade}/compare/${runId}`;
}

export default function NewRunPanel({ moduleKey, onRunComplete }: NewRunPanelProps) {
  const [status, setStatus] = useState<PanelStatus>('idle');
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
  const [mode, setMode] = useState<RunMode>('live_vs_shadow');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);

  const datasetLabel = getDatasetLabel(moduleKey);
  const tradeCategory = getTradeCategory(moduleKey);
  const tradeName = getTradeName(moduleKey);

  useEffect(() => {
    if (expanded) {
      loadQuotes();
    }
  }, [expanded, showIncomplete, moduleKey]);

  async function loadQuotes() {
    setStatus('loading_quotes');
    setErrorMsg(null);
    setSelectedQuoteId('');
    try {
      const data = await fetchQuotesByTrade(tradeCategory, 80, showIncomplete);
      setQuotes(data);
      setStatus('ready');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to load quotes');
      setStatus('error');
    }
  }

  async function handleRun() {
    if (!selectedQuoteId) return;

    const selectedQuote = quotes.find((q) => q.id === selectedQuoteId);
    if (selectedQuote && !selectedQuote.hasItems) return;

    setStatus('running');
    setErrorMsg(null);
    setLastRunId(null);

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
  const selectedHasNoItems = selectedQuote != null && !selectedQuote.hasItems;
  const dataQuotes = quotes.filter((q) => q.hasItems);
  const emptyQuotes = quotes.filter((q) => !q.hasItems);

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

          {/* Dataset selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-400">{datasetLabel}</label>
              <button
                onClick={() => setShowIncomplete((v) => !v)}
                className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  showIncomplete
                    ? 'border-amber-700 bg-amber-950/30 text-amber-400'
                    : 'border-gray-700 bg-gray-800 text-gray-500 hover:text-gray-400'
                }`}
              >
                <Eye className="w-3 h-3" />
                Show incomplete ({emptyQuotes.length})
              </button>
            </div>

            {status === 'loading_quotes' ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Loading datasets...
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedQuoteId}
                  onChange={(e) => setSelectedQuoteId(e.target.value)}
                  disabled={isRunning}
                  className="w-full appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 disabled:opacity-50 pr-8"
                >
                  <option value="">-- {datasetLabel} --</option>
                  {dataQuotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.supplierName ?? 'Unknown supplier'} · {formatCurrency(q.totalPrice)} · {q.itemCount} items
                    </option>
                  ))}
                  {showIncomplete && emptyQuotes.length > 0 && (
                    <>
                      <option disabled>── Incomplete (no items) ──</option>
                      {emptyQuotes.map((q) => (
                        <option key={q.id} value={q.id} disabled>
                          {q.supplierName ?? 'Unknown supplier'} · 0 items (not usable)
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              </div>
            )}

            {/* No data state */}
            {status === 'ready' && dataQuotes.length === 0 && (
              <p className="text-xs text-amber-400/80 flex items-start gap-1.5 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                No {tradeName} quotes with parsed items found. Import and parse a {tradeName} quote first.
              </p>
            )}

            {/* Selected quote info */}
            {selectedQuote && selectedQuote.hasItems && (
              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                <Database className="w-3 h-3 shrink-0" />
                <span className="font-mono">{selectedQuote.id.slice(0, 8)}…</span>
                <span className="text-green-400 font-medium">{selectedQuote.itemCount} line items</span>
                <span>{formatCurrency(selectedQuote.totalPrice)}</span>
              </div>
            )}

            {/* Data integrity warning */}
            {selectedHasNoItems && (
              <div className="flex items-start gap-2 bg-amber-950/40 border border-amber-800 rounded-lg px-3 py-2 text-xs text-amber-300 mt-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                This quote has no parsed items and cannot be used for comparison. Select a different dataset.
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

          {/* Status feedback */}
          {status === 'success' && lastRunId && (
            <div className="flex items-center gap-2 bg-green-950/40 border border-green-800 rounded-lg px-3 py-2 text-xs text-green-300">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Run completed — <span className="font-mono">{lastRunId.slice(0, 8)}</span> — scroll down to view results</span>
              {mode === 'live_vs_shadow' && (
                <a
                  href={getComparePath(moduleKey, lastRunId)}
                  className="ml-auto text-blue-400 hover:text-blue-300 underline whitespace-nowrap"
                >
                  View Diff
                </a>
              )}
            </div>
          )}

          {(status === 'error' || errorMsg) && status !== 'success' && (
            <div className="flex items-start gap-2 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-xs text-red-300">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {errorMsg ?? 'An error occurred'}
            </div>
          )}

          {/* Run button */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleRun}
              disabled={!selectedQuoteId || selectedHasNoItems || isRunning || status === 'loading_quotes'}
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
            {selectedQuote?.hasItems && (
              <p className="text-[11px] text-gray-600 leading-snug">
                {selectedQuote.itemCount} items · runs locally · no live pipeline affected
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
