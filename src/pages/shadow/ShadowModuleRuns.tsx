import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowLeft, Filter, RefreshCw, X, CheckCircle, Database } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowRunHistoryTable from '../../components/shadow/ShadowRunHistoryTable';
import { dbGetShadowRuns, dbGetShadowRunResults } from '../../lib/db/shadowRuns';
import ShadowDiffSummary from '../../components/shadow/ShadowDiffSummary';
import type { ShadowRunRecord, ShadowRunResultRecord, ModuleDiff, RunStatus, RunMode } from '../../types/shadow';

function getModuleKeyFromPath(): string | undefined {
  const m = window.location.pathname.match(/^\/shadow\/modules\/([^/]+)\/runs$/);
  return m ? m[1] : undefined;
}

function getRunIdFromSearch(): string | undefined {
  return new URLSearchParams(window.location.search).get('run') ?? undefined;
}

const STATUS_OPTIONS: { value: RunStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const MODE_OPTIONS: { value: RunMode | ''; label: string }[] = [
  { value: '', label: 'All modes' },
  { value: 'shadow_only', label: 'Shadow Only' },
  { value: 'live_vs_shadow', label: 'Live vs Shadow' },
  { value: 'regression', label: 'Regression' },
];

export default function ShadowModuleRuns() {
  const moduleKey = getModuleKeyFromPath();
  const highlightRunId = getRunIdFromSearch();
  const [runs, setRuns] = useState<ShadowRunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<ShadowRunRecord | null>(null);
  const [runResults, setRunResults] = useState<ShadowRunResultRecord[]>([]);
  const [diff, setDiff] = useState<ModuleDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const autoSelectedRef = useRef(false);

  const [statusFilter, setStatusFilter] = useState<RunStatus | ''>('');
  const [modeFilter, setModeFilter] = useState<RunMode | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = useCallback(async () => {
    if (!moduleKey) return;
    setLoading(true);
    setError(null);
    try {
      const data = await dbGetShadowRuns({
        moduleKey,
        status: statusFilter || undefined,
        runMode: modeFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 100,
      });
      setRuns(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, [moduleKey, statusFilter, modeFilter, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (autoSelectedRef.current || !highlightRunId || loading || runs.length === 0) return;
    const target = runs.find((r) => r.id === highlightRunId);
    if (target) {
      autoSelectedRef.current = true;
      handleSelectRun(target).then(() => {
        setTimeout(() => {
          detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      });
    }
  }, [highlightRunId, loading, runs]);

  async function handleSelectRun(run: ShadowRunRecord) {
    setSelectedRun(run);
    setDiff(null);
    try {
      const results = await dbGetShadowRunResults(run.id);
      setRunResults(results);
      const diffResult = results.find((r) => r.result_type === 'diff');
      if (diffResult) setDiff(diffResult.output_json as unknown as ModuleDiff);
    } catch {
      setRunResults([]);
    }
  }

  function getPassthroughMetrics(results: ShadowRunResultRecord[]): {
    itemCount: number | null;
    parsedValue: number | null;
    resolvedVia: string | null;
    note: string | null;
  } | null {
    const liveResult = results.find((r) => r.result_type === 'live');
    if (!liveResult?.metrics_json) return null;
    const m = liveResult.metrics_json as Record<string, unknown>;
    if (!m.passthrough) return null;
    return {
      itemCount: typeof m.itemCount === 'number' ? m.itemCount : null,
      parsedValue: typeof m.parsedValue === 'number' ? m.parsedValue : null,
      resolvedVia: typeof m.resolvedVia === 'string' ? m.resolvedVia : null,
      note: typeof (liveResult.output_json as Record<string, unknown>)?.note === 'string'
        ? String((liveResult.output_json as Record<string, unknown>).note)
        : null,
    };
  }

  function clearFilters() {
    setStatusFilter('');
    setModeFilter('');
    setFromDate('');
    setToDate('');
  }

  const hasActiveFilters = statusFilter || modeFilter || fromDate || toDate;

  const statusColor = (s: string) => {
    if (s === 'completed') return 'text-green-400';
    if (s === 'failed') return 'text-red-400';
    if (s === 'running') return 'text-amber-400';
    if (s === 'cancelled') return 'text-gray-500';
    return 'text-gray-400';
  };

  return (
    <ShadowLayout>
      <div className="max-w-5xl mx-auto space-y-5">
          <div className="flex items-center gap-3">
            <a href={`/shadow/modules/${moduleKey}`} className="text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-white">Run History</h1>
              <p className="text-gray-500 text-sm font-mono">{moduleKey}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border transition-colors ${
                  filtersOpen || hasActiveFilters
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {hasActiveFilters && <span className="bg-amber-500 text-gray-950 text-[10px] font-bold px-1 rounded">ON</span>}
              </button>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {filtersOpen && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as RunStatus | '')}
                  className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Mode</label>
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value as RunMode | '')}
                  className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                >
                  {MODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              {hasActiveFilters && (
                <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-800 rounded-lg transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading...</div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">{runs.length} runs found</span>
              </div>

              <ShadowRunHistoryTable runs={runs} onSelect={handleSelectRun} />

              {selectedRun && (() => {
                const passthroughMetrics = getPassthroughMetrics(runResults);
                const isHighlighted = selectedRun.id === highlightRunId;
                return (
                <div
                  ref={detailRef}
                  className={`bg-gray-900 border rounded-xl p-5 space-y-4 transition-colors ${isHighlighted ? 'border-amber-500/40' : 'border-gray-800'}`}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">
                      Run Detail
                      {isHighlighted && (
                        <span className="ml-2 text-[10px] font-normal bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
                          latest run
                        </span>
                      )}
                    </h2>
                    <div className="flex items-center gap-2">
                      {selectedRun.module_key === 'plumbing_parser' && selectedRun.status === 'completed' && (
                        <a
                          href={`/shadow/plumbing/compare/${selectedRun.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:text-amber-300 rounded-lg transition-colors"
                        >
                          Discrepancy Review
                        </a>
                      )}
                      <span className="text-xs text-gray-500 font-mono">{selectedRun.id.slice(0, 8)}...</span>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-4 gap-3">
                    <div className="bg-gray-950 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">Status</div>
                      <div className={`text-sm font-medium ${statusColor(selectedRun.status)}`}>{selectedRun.status}</div>
                    </div>
                    <div className="bg-gray-950 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">Mode</div>
                      <div className="text-sm text-white">{selectedRun.run_mode}</div>
                    </div>
                    <div className="bg-gray-950 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">Source</div>
                      <div className="text-sm text-white truncate">{selectedRun.source_label ?? selectedRun.source_id.slice(0, 16)}</div>
                    </div>
                    <div className="bg-gray-950 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">Results</div>
                      <div className="text-sm text-white">{runResults.length} records</div>
                    </div>
                  </div>

                  {selectedRun.started_at && (
                    <div className="flex items-center gap-6 text-xs text-gray-600">
                      <span>Started: {new Date(selectedRun.started_at).toLocaleString()}</span>
                      {selectedRun.completed_at && (
                        <span>Completed: {new Date(selectedRun.completed_at).toLocaleString()}</span>
                      )}
                    </div>
                  )}

                  {diff && (
                    <>
                      <div className="text-xs font-medium text-gray-400 pt-2">Comparison Diff</div>
                      <ShadowDiffSummary diff={diff} />
                    </>
                  )}

                  {passthroughMetrics && selectedRun.status === 'completed' && (
                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                        <span className="text-sm font-medium text-green-300">Passthrough Snapshot Completed</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="text-xs text-gray-500 mb-1">Line Items</div>
                          <div className="text-lg font-bold text-white">{passthroughMetrics.itemCount ?? '—'}</div>
                        </div>
                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="text-xs text-gray-500 mb-1">Parsed Value</div>
                          <div className="text-sm font-semibold text-white">
                            {passthroughMetrics.parsedValue != null
                              ? new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(passthroughMetrics.parsedValue)
                              : '—'}
                          </div>
                        </div>
                        <div className="bg-gray-900 rounded-lg p-3">
                          <div className="text-xs text-gray-500 mb-1">Resolved Via</div>
                          <div className="text-xs font-mono text-amber-400">{passthroughMetrics.resolvedVia ?? '—'}</div>
                        </div>
                      </div>
                      {passthroughMetrics.note && (
                        <div className="flex items-start gap-2 text-xs text-gray-500">
                          <Database className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-600" />
                          <span>{passthroughMetrics.note}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!diff && !passthroughMetrics && runResults.filter((r) => r.result_type !== 'diff').length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-400 mb-2">Result Records</div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {runResults.filter((r) => r.result_type !== 'diff').map((r) => (
                          <div key={r.id} className="flex items-center justify-between bg-gray-950 rounded px-3 py-2 text-xs">
                            <span className="font-mono text-gray-400">{r.result_type}</span>
                            <span className="text-gray-600">{r.output_json ? JSON.stringify(r.output_json).slice(0, 60) : '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedRun.error_message && (
                    <div className="bg-red-950/40 border border-red-800 rounded-lg p-3">
                      <div className="text-xs text-red-400 font-medium mb-1">Error</div>
                      <div className="text-xs text-red-300">{selectedRun.error_message}</div>
                    </div>
                  )}
                </div>
                );
              })()}
            </div>
          )}
      </div>
    </ShadowLayout>
  );
}
