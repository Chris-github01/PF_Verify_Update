import { useState, useEffect, useCallback } from 'react';
import {
  Layers, Play, History, ChevronDown, RefreshCw, AlertTriangle,
  CheckCircle2, BarChart2, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  runQuantityIntelligence,
  getPreviousRuns,
  loadSavedRun,
} from '../lib/quantity-intelligence/quantityIntelligenceOrchestrator';
import type { QuantityIntelligenceResult } from '../lib/quantity-intelligence/quantityScoring';
import type { MatchedLineGroup } from '../lib/quantity-intelligence/lineMatcher';
import type { ReferenceQuantityResult } from '../lib/quantity-intelligence/referenceQuantityEngine';
import type { ScoredSupplier } from '../lib/quantity-intelligence/quantityScoring';
import QuantityVarianceCards from '../components/quantity-intelligence/QuantityVarianceCards';
import QuantityComparisonTable from '../components/quantity-intelligence/QuantityComparisonTable';
import SupplierAdjustmentSummary from '../components/quantity-intelligence/SupplierAdjustmentSummary';
import QuantityExplainabilityDrawer from '../components/quantity-intelligence/QuantityExplainabilityDrawer';

interface Props {
  projectId: string;
}

interface QuoteOption {
  id: string;
  supplier_name: string;
  total_amount: number | null;
  created_at: string;
}

interface SavedRun {
  id: string;
  comparison_name: string;
  created_at: string;
  module_key: string;
}

export default function QuantityIntelligencePage({ projectId }: Props) {
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([]);
  const [result, setResult] = useState<QuantityIntelligenceResult | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [comparisonName, setComparisonName] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drawerGroup, setDrawerGroup] = useState<MatchedLineGroup | null>(null);
  const [drawerRef, setDrawerRef] = useState<ReferenceQuantityResult | null>(null);

  const loadQuotes = useCallback(async () => {
    setLoadingQuotes(true);
    const { data } = await supabase
      .from('quotes')
      .select('id, supplier_name, total_amount, created_at')
      .eq('project_id', projectId)
      .eq('is_latest', true)
      .order('supplier_name', { ascending: true });
    setQuotes(data ?? []);
    setLoadingQuotes(false);
  }, [projectId]);

  const loadHistory = useCallback(async () => {
    const runs = await getPreviousRuns(projectId);
    setSavedRuns(runs);
  }, [projectId]);

  useEffect(() => {
    loadQuotes();
    loadHistory();
  }, [loadQuotes, loadHistory]);

  function toggleQuote(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleRun() {
    if (selectedIds.length < 2) {
      setError('Select at least 2 supplier quotes to compare.');
      return;
    }
    setError(null);
    setRunning(true);
    setResult(null);
    setActiveRunId(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setRunning(false); return; }

    const name = comparisonName.trim() || `QI Run — ${new Date().toLocaleDateString()}`;

    const res = await runQuantityIntelligence({
      projectId,
      quoteIds: selectedIds,
      comparisonName: name,
      userId: session.user.id,
    });

    setResult(res);
    setRunning(false);
    await loadHistory();
  }

  async function handleLoadRun(runId: string, runName: string) {
    setLoadingRun(true);
    setResult(null);
    setActiveRunId(runId);
    setShowHistory(false);
    const res = await loadSavedRun(runId);
    if (res) {
      setResult({ ...res, comparisonName: runName });
    }
    setLoadingRun(false);
  }

  function handleOpenDrawer(group: MatchedLineGroup) {
    const ref = result?.referenceResults.get(group.normalizedKey) ?? null;
    setDrawerGroup(group);
    setDrawerRef(ref);
  }

  const suppliersForDrawer: ScoredSupplier[] = result?.suppliers ?? [];

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
              <Layers className="w-4.5 h-4.5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Quantity Intelligence</h1>
              <p className="text-xs text-gray-500">Advisory-only — does not modify any quote data</p>
            </div>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 rounded-lg transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            History
            {savedRuns.length > 0 && (
              <span className="ml-1 bg-gray-700 text-gray-300 rounded-full px-1.5 py-0.5 text-xs">{savedRuns.length}</span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showHistory && savedRuns.length > 0 && (
          <div className="mt-3 bg-gray-900 border border-gray-800 rounded-xl p-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Previous Runs</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {savedRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => handleLoadRun(run.id, run.comparison_name)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                    activeRunId === run.id
                      ? 'bg-teal-500/10 border border-teal-500/30 text-teal-300'
                      : 'hover:bg-gray-800 text-gray-300'
                  }`}
                >
                  <span className="font-medium truncate">{run.comparison_name}</span>
                  <span className="text-gray-600 flex-shrink-0 ml-2">{new Date(run.created_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!result && !running && !loadingRun && (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="text-sm font-semibold text-white mb-1">Run a New Comparison</div>
              <div className="text-xs text-gray-500 mb-4">Select 2 or more supplier quotes to analyse quantities side-by-side.</div>

              {error && (
                <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-1.5 block">Comparison name (optional)</label>
                <input
                  type="text"
                  value={comparisonName}
                  onChange={(e) => setComparisonName(e.target.value)}
                  placeholder={`QI Run — ${new Date().toLocaleDateString()}`}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-teal-500/50"
                />
              </div>

              {loadingQuotes ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Loading quotes...
                </div>
              ) : quotes.length === 0 ? (
                <div className="text-xs text-gray-600 py-4 text-center">
                  No parsed quotes found for this project. Import and parse quotes first.
                </div>
              ) : (
                <div className="space-y-2">
                  {quotes.map((q) => {
                    const selected = selectedIds.includes(q.id);
                    return (
                      <button
                        key={q.id}
                        onClick={() => toggleQuote(q.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                          selected
                            ? 'bg-teal-500/10 border-teal-500/40 ring-1 ring-teal-500/20'
                            : 'bg-gray-800/60 border-gray-700 hover:border-gray-600'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          selected ? 'bg-teal-500 border-teal-500' : 'border-gray-600'
                        }`}>
                          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{q.supplier_name}</div>
                          <div className="text-xs text-gray-500">
                            {q.total_amount !== null
                              ? `$${q.total_amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                              : 'No total'}
                            {' · '}
                            Added {new Date(q.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        {selected && (
                          <span className="text-xs text-teal-400 font-semibold flex-shrink-0">Selected</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  {selectedIds.length} of {quotes.length} quote{quotes.length !== 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={handleRun}
                  disabled={selectedIds.length < 2 || running}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run Analysis
                </button>
              </div>
            </div>

            {savedRuns.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-semibold text-white">Recent Comparisons</span>
                </div>
                <div className="space-y-1.5">
                  {savedRuns.slice(0, 5).map((run) => (
                    <button
                      key={run.id}
                      onClick={() => handleLoadRun(run.id, run.comparison_name)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-800/60 hover:bg-gray-800 rounded-lg text-left transition-colors group"
                    >
                      <BarChart2 className="w-3.5 h-3.5 text-gray-600 group-hover:text-teal-400 transition-colors flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-300 truncate">{run.comparison_name}</div>
                        <div className="text-xs text-gray-600">{run.module_key}</div>
                      </div>
                      <span className="text-xs text-gray-600 flex-shrink-0">{new Date(run.created_at).toLocaleDateString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(running || loadingRun) && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <RefreshCw className="w-8 h-8 text-teal-400 animate-spin" />
            <div className="text-sm text-gray-400">
              {running ? 'Matching line items and analysing quantities...' : 'Loading saved run...'}
            </div>
            <div className="text-xs text-gray-600">This may take a moment for large quote sets</div>
          </div>
        )}

        {result && !running && !loadingRun && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-bold text-white">{result.comparisonName}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {result.suppliers.length} supplier{result.suppliers.length !== 1 ? 's' : ''} · {result.totalMatchedLines} matched line{result.totalMatchedLines !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => {
                  setResult(null);
                  setActiveRunId(null);
                  setSelectedIds([]);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                New comparison
              </button>
            </div>

            <QuantityVarianceCards result={result} />

            <SupplierAdjustmentSummary suppliers={result.suppliers} />

            <QuantityComparisonTable
              groups={result.matchedGroups}
              referenceResults={result.referenceResults}
              suppliers={result.suppliers}
              onRowClick={handleOpenDrawer}
            />
          </div>
        )}
      </div>

      <QuantityExplainabilityDrawer
        group={drawerGroup}
        referenceResult={drawerRef}
        suppliers={suppliersForDrawer}
        onClose={() => setDrawerGroup(null)}
      />
    </div>
  );
}
