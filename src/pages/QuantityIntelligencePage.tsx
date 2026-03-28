import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  Layers, Play, History, ChevronDown, RefreshCw, AlertTriangle,
  CheckCircle2, BarChart2, X, Download, Shield, TrendingDown,
  TrendingUp, DollarSign, Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTrade } from '../lib/tradeContext';
import {
  runQuantityIntelligence,
  getPreviousRuns,
  loadSavedRun,
} from '../lib/quantity-intelligence/quantityIntelligenceOrchestrator';
import { exportQuantityIntelligenceExcel } from '../lib/quantity-intelligence/quantityExcelExport';
import type { QuantityIntelligenceResult } from '../lib/quantity-intelligence/quantityScoring';
import type { MatchedLineGroup } from '../lib/quantity-intelligence/lineMatcher';
import type { ReferenceQuantityResult } from '../lib/quantity-intelligence/referenceQuantityEngine';
import type { ScoredSupplier } from '../lib/quantity-intelligence/quantityScoring';
import QuantityVarianceCards from '../components/quantity-intelligence/QuantityVarianceCards';
import QuantityComparisonTable from '../components/quantity-intelligence/QuantityComparisonTable';
import SupplierAdjustmentSummary from '../components/quantity-intelligence/SupplierAdjustmentSummary';
import QuantityExplainabilityDrawer from '../components/quantity-intelligence/QuantityExplainabilityDrawer';
import WorkflowNav from '../components/WorkflowNav';

interface Props {
  projectId: string;
  onNavigateNext?: () => void;
}

interface QuoteOption {
  id: string;
  supplier_name: string;
  total_amount: number | null;
  created_at: string;
  trade: string | null;
  item_count: number;
}

interface SavedRun {
  id: string;
  comparison_name: string;
  created_at: string;
  module_key: string;
}

const TRADE_MODULE_MAP: Record<string, string[]> = {
  passive_fire: ['passive_fire', 'passive fire', 'passive_fire_parser'],
  plumbing: ['plumbing', 'plumbing_parser'],
  electrical: ['electrical', 'electrical_parser'],
  hvac: ['hvac', 'hvac_parser'],
  active_fire: ['active_fire', 'active fire', 'active_fire_parser'],
};

function matchesTrade(quoteTrade: string | null, currentTrade: string): boolean {
  if (!quoteTrade) return false;
  const aliases = TRADE_MODULE_MAP[currentTrade] ?? [currentTrade];
  return aliases.some((alias) => quoteTrade.toLowerCase().includes(alias.replace(/_/g, ' ').toLowerCase()) ||
    quoteTrade.toLowerCase() === alias.toLowerCase());
}

function tradeLabel(trade: string): string {
  const labels: Record<string, string> = {
    passive_fire: 'Passive Fire',
    plumbing: 'Plumbing',
    electrical: 'Electrical',
    hvac: 'HVAC',
    active_fire: 'Active Fire',
  };
  return labels[trade] ?? trade;
}

export default function QuantityIntelligencePage({ projectId, onNavigateNext }: Props) {
  const { currentTrade } = useTrade();

  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([]);
  const [result, setResult] = useState<QuantityIntelligenceResult | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [comparisonName, setComparisonName] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drawerGroup, setDrawerGroup] = useState<MatchedLineGroup | null>(null);
  const [drawerRef, setDrawerRef] = useState<ReferenceQuantityResult | null>(null);

  const loadQuotes = useCallback(async () => {
    setLoadingQuotes(true);
    setSelectedIds([]);

    const { data: quotesRaw } = await supabase
      .from('quotes')
      .select('id, supplier_name, total_amount, created_at, trade')
      .eq('project_id', projectId)
      .eq('is_latest', true)
      .order('supplier_name', { ascending: true });

    if (!quotesRaw || quotesRaw.length === 0) {
      setQuotes([]);
      setLoadingQuotes(false);
      return;
    }

    const tradeFiltered = quotesRaw.filter((q) => matchesTrade(q.trade, currentTrade));
    const quoteIds = tradeFiltered.map((q) => q.id);

    if (quoteIds.length === 0) {
      setQuotes([]);
      setLoadingQuotes(false);
      if (process.env.NODE_ENV === 'development') {
        console.debug('[QI] No quotes matched trade filter', { currentTrade, quotesRaw });
      }
      return;
    }

    const itemCounts = await Promise.all(
      quoteIds.map(async (id) => {
        const { count } = await supabase
          .from('quote_items')
          .select('id', { count: 'exact', head: true })
          .eq('quote_id', id)
          .eq('is_excluded', false);
        return { id, count: count ?? 0 };
      }),
    );

    const countMap = Object.fromEntries(itemCounts.map((c) => [c.id, c.count]));

    const parsed = tradeFiltered
      .map((q) => ({
        id: q.id,
        supplier_name: q.supplier_name ?? 'Unknown Supplier',
        total_amount: q.total_amount,
        created_at: q.created_at,
        trade: q.trade,
        item_count: countMap[q.id] ?? 0,
      }))
      .filter((q) => q.item_count > 0);

    if (process.env.NODE_ENV === 'development') {
      console.debug('[QI] Quote picker loaded', {
        currentTrade,
        totalQuotes: quotesRaw.length,
        tradeFiltered: tradeFiltered.length,
        parsedWithItems: parsed.length,
        quoteIds: parsed.map((q) => q.id),
      });
    }

    setQuotes(parsed);
    setLoadingQuotes(false);
  }, [projectId, currentTrade]);

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
    setError(null);

    if (selectedIds.length < 2) {
      setError('Select at least 2 parsed supplier quotes to compare.');
      return;
    }

    const selectedQuotes = quotes.filter((q) => selectedIds.includes(q.id));
    const emptyQuotes = selectedQuotes.filter((q) => q.item_count === 0);
    if (emptyQuotes.length > 0) {
      setError(`The following quotes have no parsed items: ${emptyQuotes.map((q) => q.supplier_name).join(', ')}`);
      return;
    }

    setRunning(true);
    setResult(null);
    setActiveRunId(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setRunning(false); return; }

    const name = comparisonName.trim() || `QI Run — ${new Date().toLocaleDateString()} (${tradeLabel(currentTrade)})`;

    if (process.env.NODE_ENV === 'development') {
      console.debug('[QI] Starting analysis', { name, selectedIds, trade: currentTrade });
    }

    try {
      const res = await runQuantityIntelligence({
        projectId,
        quoteIds: selectedIds,
        comparisonName: name,
        moduleKey: currentTrade,
        userId: session.user.id,
      });

      if (process.env.NODE_ENV === 'development') {
        console.debug('[QI] Analysis result', {
          matchedGroupsIsArray: Array.isArray(res?.matchedGroups),
          matchedGroupsLength: Array.isArray(res?.matchedGroups) ? res.matchedGroups.length : 'NOT ARRAY',
          suppliersLength: res?.suppliers?.length,
        });
      }

      if (!res) {
        setError('Analysis could not be completed. Ensure selected quotes have parsed line items.');
        setRunning(false);
        return;
      }

      const safeRes: QuantityIntelligenceResult = {
        ...res,
        matchedGroups: Array.isArray(res.matchedGroups) ? res.matchedGroups : [],
        suppliers: Array.isArray(res.suppliers) ? res.suppliers : [],
      };

      if (safeRes.matchedGroups.length === 0) {
        setError('No reliable quantity matches were found for the selected quotes. The descriptions may differ too significantly between suppliers to match automatically.');
        setResult(safeRes);
        setRunning(false);
        await loadHistory();
        return;
      }

      setResult(safeRes);

      const { data: existingSettings } = await supabase
        .from('project_settings')
        .select('settings')
        .eq('project_id', projectId)
        .maybeSingle();

      await supabase.from('project_settings').upsert({
        project_id: projectId,
        settings: {
          ...(existingSettings?.settings || {}),
          quantity_intelligence_completed: true,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id' });
    } catch (err) {
      console.error('[QI] Analysis failed', err);
      setError('An unexpected error occurred during analysis. Please try again.');
    }

    setRunning(false);
    await loadHistory();
  }

  async function handleLoadRun(runId: string, runName: string) {
    setLoadingRun(true);
    setResult(null);
    setError(null);
    setActiveRunId(runId);
    setShowHistory(false);

    try {
      const res = await loadSavedRun(runId);
      if (res) {
        const safeRes: QuantityIntelligenceResult = {
          ...res,
          comparisonName: runName,
          matchedGroups: Array.isArray(res.matchedGroups) ? res.matchedGroups : [],
          suppliers: Array.isArray(res.suppliers) ? res.suppliers : [],
        };
        setResult(safeRes);
      } else {
        setError('Could not load saved run. It may have been deleted.');
      }
    } catch (err) {
      console.error('[QI] Failed to load run', err);
      setError('An error occurred while loading the saved run.');
    }

    setLoadingRun(false);
  }

  function handleOpenDrawer(group: MatchedLineGroup) {
    const ref = result?.referenceResults instanceof Map
      ? result.referenceResults.get(group.normalizedKey) ?? null
      : null;
    setDrawerGroup(group);
    setDrawerRef(ref);
  }

  async function handleExport() {
    if (!result) return;
    setExporting(true);
    try {
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const safeName = result.comparisonName.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
      await exportQuantityIntelligenceExcel(result, `Quantity_Intelligence_${safeName}_${date}.xlsx`);
    } catch (err) {
      console.error('[QI] Export failed', err);
      setError('Export failed. Please try again.');
    }
    setExporting(false);
  }

  const safeSuppliers: ScoredSupplier[] = Array.isArray(result?.suppliers) ? result.suppliers : [];
  const safeGroups: MatchedLineGroup[] = Array.isArray(result?.matchedGroups) ? result.matchedGroups : [];
  const safeRefs: Map<string, ReferenceQuantityResult> = result?.referenceResults instanceof Map
    ? result.referenceResults
    : new Map();

  const rawCheapest = [...safeSuppliers].sort((a, b) => a.rawRank - b.rawRank)[0];
  const normCheapest = [...safeSuppliers].sort((a, b) => a.normalizedRank - b.normalizedRank)[0];
  const underallowedSuppliers = safeSuppliers.filter((s) => s.underallowanceFlag);
  const rankFlipped = rawCheapest && normCheapest && rawCheapest.supplierName !== normCheapest.supplierName;

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
              <Layers className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Quantity Intelligence</h1>
              <p className="text-xs text-gray-500">Advisory-only — does not modify any quote data</p>
            </div>
            <span className="ml-2 px-2 py-0.5 bg-teal-500/10 border border-teal-500/30 rounded-md text-xs text-teal-400 font-medium">
              {tradeLabel(currentTrade)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {result && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {exporting ? 'Exporting...' : 'Download Excel'}
              </button>
            )}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 rounded-lg transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              History
              {savedRuns.length > 0 && (
                <span className="ml-1 bg-gray-700 text-gray-300 rounded-full px-1.5 py-0.5 text-xs">
                  {savedRuns.length}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </button>
          </div>
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
                  <span className="text-gray-600 flex-shrink-0 ml-2">
                    {new Date(run.created_at).toLocaleDateString()}
                  </span>
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
              <div className="text-xs text-gray-500 mb-1">
                Select 2 or more parsed supplier quotes to analyse quantities side-by-side.
              </div>
              <div className="flex items-center gap-1.5 mb-4 text-xs text-gray-600">
                <Shield className="w-3 h-3 flex-shrink-0" />
                Only parsed quotes for the active trade ({tradeLabel(currentTrade)}) are shown.
              </div>

              {error && (
                <div className="flex items-start gap-2 mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-1.5 block">Comparison name (optional)</label>
                <input
                  type="text"
                  value={comparisonName}
                  onChange={(e) => setComparisonName(e.target.value)}
                  placeholder={`QI Run — ${new Date().toLocaleDateString()} (${tradeLabel(currentTrade)})`}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-teal-500/50"
                />
              </div>

              {loadingQuotes ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Loading quotes...
                </div>
              ) : quotes.length === 0 ? (
                <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 text-center">
                  <Info className="w-5 h-5 text-gray-600 mx-auto mb-2" />
                  <div className="text-xs text-gray-500 mb-1">No parsed quotes found for {tradeLabel(currentTrade)}.</div>
                  <div className="text-xs text-gray-600">Import and parse supplier quotes for this trade, then return here to run a comparison.</div>
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
                            {q.item_count} line item{q.item_count !== 1 ? 's' : ''} parsed
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
                        <div className="text-xs text-gray-600">{tradeLabel(run.module_key)}</div>
                      </div>
                      <span className="text-xs text-gray-600 flex-shrink-0">
                        {new Date(run.created_at).toLocaleDateString()}
                      </span>
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
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-bold text-white">{result.comparisonName}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {safeSuppliers.length} supplier{safeSuppliers.length !== 1 ? 's' : ''}
                  {' · '}
                  {safeGroups.length} matched line{safeGroups.length !== 1 ? 's' : ''}
                  {' · '}
                  {tradeLabel(currentTrade)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExport}
                  disabled={exporting || safeGroups.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {exporting ? 'Exporting...' : 'Download Excel'}
                </button>
                <button
                  onClick={() => {
                    setResult(null);
                    setActiveRunId(null);
                    setSelectedIds([]);
                    setError(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  New comparison
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {safeGroups.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                <Info className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                <div className="text-sm font-semibold text-white mb-1">No reliable quantity matches found</div>
                <div className="text-xs text-gray-500 max-w-md mx-auto">
                  The selected quotes did not produce any matched line items above the confidence threshold.
                  This typically occurs when supplier descriptions differ significantly or when quote items are sparse.
                </div>
              </div>
            ) : (
              <>
                {safeSuppliers.length >= 2 && (rawCheapest || normCheapest) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <CommercialCard
                      icon={<DollarSign className="w-4 h-4 text-green-400" />}
                      label="Raw Cheapest Quote"
                      value={rawCheapest?.supplierName ?? '—'}
                      sub={rawCheapest ? `$${rawCheapest.rawTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} submitted total` : ''}
                      color="green"
                    />
                    <CommercialCard
                      icon={<BarChart2 className="w-4 h-4 text-teal-400" />}
                      label="Lowest Qty-Normalised Total"
                      value={normCheapest?.supplierName ?? '—'}
                      sub={normCheapest ? `$${normCheapest.normalizedTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} on equal quantities` : ''}
                      color="teal"
                      highlight={rankFlipped ? 'Rank changes after normalisation' : undefined}
                    />
                    <CommercialCard
                      icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
                      label="Under-Allowance Risk"
                      value={underallowedSuppliers.length > 0 ? `${underallowedSuppliers.length} supplier${underallowedSuppliers.length !== 1 ? 's' : ''}` : 'None flagged'}
                      sub={underallowedSuppliers.length > 0 ? underallowedSuppliers.map((s) => s.supplierName).join(', ') : 'All suppliers within range'}
                      color={underallowedSuppliers.length > 0 ? 'red' : 'gray'}
                    />
                    <CommercialCard
                      icon={<TrendingUp className="w-4 h-4 text-amber-400" />}
                      label="Major Qty Variances"
                      value={result.linesWithMajorVariance.toString()}
                      sub={`${result.linesWithReviewFlag} further lines need review`}
                      color={result.linesWithMajorVariance > 0 ? 'amber' : 'gray'}
                    />
                  </div>
                )}

                {rankFlipped && rawCheapest && normCheapest && (
                  <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/8 border border-amber-500/25 rounded-xl">
                    <TrendingDown className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-amber-300 mb-0.5">Quantity normalisation changes cost ranking</div>
                      <div className="text-xs text-amber-400/80">
                        <strong>{rawCheapest.supplierName}</strong> has a lower submitted total, but
                        <strong> {normCheapest.supplierName}</strong> has a lower total on a fair equal-quantity basis.
                        This suggests quantity under-allowance may be distorting the raw cost comparison. Review line-level quantities before drawing conclusions.
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
                  <span className="text-xs text-gray-500">
                    Quantity Intelligence is advisory-only and does not determine the preferred tenderer. Final recommendations are issued by the Commercial Decision Engine.
                  </span>
                </div>

                <QuantityVarianceCards result={result} />

                <SupplierAdjustmentSummary suppliers={safeSuppliers} />

                <QuantityComparisonTable
                  matchedGroups={safeGroups}
                  referenceResults={safeRefs}
                  suppliers={safeSuppliers}
                  onSelectLine={handleOpenDrawer}
                />
              </>
            )}
          </div>
        )}
      </div>

      <QuantityExplainabilityDrawer
        group={drawerGroup}
        referenceResult={drawerRef}
        suppliers={safeSuppliers}
        onClose={() => setDrawerGroup(null)}
      />

      {onNavigateNext && (
        <WorkflowNav
          currentStep={4}
          totalSteps={7}
          nextLabel="Next: Scope Matrix"
          onNext={onNavigateNext}
        />
      )}
    </div>
  );
}

interface CommercialCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: 'green' | 'teal' | 'red' | 'amber' | 'gray';
  highlight?: string;
}

function CommercialCard({ icon, label, value, sub, color, highlight }: CommercialCardProps): ReactNode {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-500/8 border-green-500/20',
    teal: 'bg-teal-500/8 border-teal-500/20',
    red: 'bg-red-500/8 border-red-500/20',
    amber: 'bg-amber-500/8 border-amber-500/20',
    gray: 'bg-gray-800/60 border-gray-700',
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center gap-1.5 mb-2">{icon}<span className="text-xs text-gray-500">{label}</span></div>
      <div className="text-sm font-bold text-white truncate">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5 truncate">{sub}</div>}
      {highlight && (
        <div className="mt-1.5 text-xs font-medium text-amber-400">{highlight}</div>
      )}
    </div>
  );
}
