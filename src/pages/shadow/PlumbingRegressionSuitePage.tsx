import { useEffect, useState } from 'react';
import { Plus, AlertTriangle, Star, Trash2, CreditCard as Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import PlumbingRegressionSuiteHeader from '../../components/regression/PlumbingRegressionSuiteHeader';
import PlumbingRegressionCaseEditor from '../../components/regression/PlumbingRegressionCaseEditor';
import {
  dbGetPlumbingSuite,
  dbGetPlumbingSuiteCases,
  dbGetPlumbingSuiteRuns,
  dbAddPlumbingSuiteCase,
  dbRemovePlumbingSuiteCase,
  dbUpdatePlumbingSuiteCase,
  dbCreateSuiteRun,
  dbExportSuite,
  dbImportSuite,
} from '../../lib/db/plumbingRegressionDb';
import { executeSuiteRun, parseCaseRecord } from '../../lib/modules/parsers/plumbing/regression/evaluateSuite';
import type {
  RegressionSuiteRecordExtended,
  RegressionSuiteCaseRecordExtended,
  RegressionSuiteRunRecordExtended,
  ExpectedOutcome,
} from '../../lib/modules/parsers/plumbing/regression/types';
import { PLUMBING_REGRESSION_CONFIG as CFG } from '../../lib/modules/parsers/plumbing/regression/regressionConfig';

function getSuiteId(): string | undefined {
  const m = window.location.pathname.match(/^\/shadow\/modules\/plumbing_parser\/regression\/([^/]+)$/);
  return m ? m[1] : undefined;
}

export default function PlumbingRegressionSuitePage() {
  const suiteId = getSuiteId();
  const [suite, setSuite] = useState<RegressionSuiteRecordExtended | null>(null);
  const [cases, setCases] = useState<RegressionSuiteCaseRecordExtended[]>([]);
  const [runs, setRuns] = useState<RegressionSuiteRunRecordExtended[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddCase, setShowAddCase] = useState(false);
  const [editingCase, setEditingCase] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<string | null>(null);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (suiteId) load(suiteId); }, [suiteId]);

  async function load(id: string) {
    setLoading(true);
    try {
      const [suiteData, casesData, runsData] = await Promise.all([
        dbGetPlumbingSuite(id),
        dbGetPlumbingSuiteCases(id),
        dbGetPlumbingSuiteRuns(id),
      ]);
      if (!suiteData) throw new Error('Suite not found');
      setSuite(suiteData);
      setCases(casesData);
      setRuns(runsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCase(values: {
    caseLabel: string; sourceType: string; sourceId: string;
    isMustPass: boolean; notes: string; expectedOutcome: ExpectedOutcome;
  }) {
    if (!suiteId) return;
    setSaving(true);
    try {
      await dbAddPlumbingSuiteCase(suiteId, values);
      setShowAddCase(false);
      await load(suiteId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add case');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCase(caseId: string, values: {
    caseLabel: string; isMustPass: boolean; notes: string; expectedOutcome: ExpectedOutcome;
  }) {
    setSaving(true);
    try {
      await dbUpdatePlumbingSuiteCase(caseId, {
        caseLabel: values.caseLabel,
        isMustPass: values.isMustPass,
        notes: values.notes,
        expectedOutcome: values.expectedOutcome,
      });
      setEditingCase(null);
      if (suiteId) await load(suiteId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update case');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCase(caseId: string) {
    if (!confirm('Remove this regression case?')) return;
    try {
      await dbRemovePlumbingSuiteCase(caseId);
      if (suiteId) await load(suiteId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove case');
    }
  }

  async function handleRunSuite() {
    if (!suiteId || cases.length === 0) return;
    if (cases.length > CFG.suiteSizeWarningThreshold) {
      if (!confirm(`This suite has ${cases.length} cases. Running may take a while. Continue?`)) return;
    }
    setRunning(true);
    setRunProgress('Creating suite run...');
    setError(null);
    try {
      const runId = await dbCreateSuiteRun(suiteId);
      setRunProgress('Executing cases...');

      const caseInputs = cases.map(parseCaseRecord);

      await executeSuiteRun({
        suiteId,
        suiteRunId: runId,
        cases: caseInputs,
        getRawRows: async (_sourceType: string, _sourceId: string) => {
          return { liveRows: [], shadowRows: [], documentTotal: null };
        },
      });

      setRunProgress(null);
      window.location.href = `/shadow/modules/plumbing_parser/regression/runs/${runId}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suite run failed');
      setRunProgress(null);
    } finally {
      setRunning(false);
    }
  }

  async function handleExport() {
    if (!suiteId) return;
    try {
      const payload = await dbExportSuite(suiteId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plumbing-regression-suite-${suiteId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const id = await dbImportSuite(payload);
        window.location.href = `/shadow/modules/plumbing_parser/regression/${id}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Import failed');
      }
    };
    input.click();
  }

  if (!suiteId) {
    return (
      <ShadowGuard>
        <ShadowLayout>
          <div className="text-center py-16 text-red-400 text-sm">Invalid URL</div>
        </ShadowLayout>
      </ShadowGuard>
    );
  }

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-5xl mx-auto space-y-6">
          {loading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading...</div>
          ) : !suite ? (
            <div className="text-center py-12 text-red-400 text-sm">Suite not found</div>
          ) : (
            <>
              <PlumbingRegressionSuiteHeader
                suite={suite}
                caseCount={cases.length}
                runCount={runs.length}
                onRunSuite={handleRunSuite}
                onExport={handleExport}
                onImport={handleImport}
                running={running}
              />

              {error && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{error}
                </div>
              )}

              {runProgress && (
                <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-3 text-sm text-amber-300">{runProgress}</div>
              )}

              {runs.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Recent Runs</h3>
                  <div className="space-y-2">
                    {runs.slice(0, 5).map((run) => (
                      <a
                        key={run.id}
                        href={`/shadow/modules/plumbing_parser/regression/runs/${run.id}`}
                        className="flex items-center justify-between px-3 py-2 bg-gray-800/40 hover:bg-gray-800 rounded-lg transition-colors text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`font-medium ${run.status === 'completed' ? 'text-green-400' : run.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                            {run.status.toUpperCase()}
                          </span>
                          <span className="text-gray-500 font-mono">{run.id.slice(0, 8)}...</span>
                          {run.recommendation && (
                            <span className={`text-[10px] font-bold uppercase ${
                              run.recommendation === 'ready_for_internal_beta' ? 'text-green-400' :
                              run.recommendation === 'blocked_by_critical_failures' ? 'text-red-400' : 'text-amber-400'
                            }`}>
                              {run.recommendation.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-gray-600">
                          <span>{run.cases_passed}/{run.cases_total} passed</span>
                          <span>{run.completed_at ? new Date(run.completed_at).toLocaleDateString() : '—'}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Cases ({cases.length})</h3>
                  <button
                    onClick={() => setShowAddCase((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:text-amber-300 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />Add Case
                  </button>
                </div>

                {showAddCase && (
                  <div className="bg-gray-900 border border-amber-800/40 rounded-xl p-5">
                    <h4 className="text-sm font-semibold text-white mb-4">Add Regression Case</h4>
                    <PlumbingRegressionCaseEditor
                      onSave={handleAddCase}
                      onCancel={() => setShowAddCase(false)}
                      saving={saving}
                    />
                  </div>
                )}

                {cases.length === 0 ? (
                  <div className="text-center py-10 text-gray-600 text-xs">
                    No cases yet. Add historical plumbing quote cases to begin regression testing.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cases.map((c) => {
                      const isEditing = editingCase === c.id;
                      const isExpanded = expandedCase === c.id;
                      const eo = (c.expected_json ?? {}) as ExpectedOutcome;
                      return (
                        <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {c.is_must_pass && <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-white font-medium truncate">{c.case_label ?? c.source_id}</div>
                                <div className="text-xs text-gray-600 font-mono truncate">{c.source_type}/{c.source_id.slice(0, 24)}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {eo.expectedParsedTotal != null && (
                                <span className="text-xs text-gray-500 font-mono">
                                  ${Number(eo.expectedParsedTotal).toLocaleString('en-NZ', { minimumFractionDigits: 0 })}
                                </span>
                              )}
                              <button onClick={() => setExpandedCase(isExpanded ? null : c.id)} className="text-gray-500 hover:text-gray-300">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <button onClick={() => setEditingCase(isEditing ? null : c.id)} className="text-gray-500 hover:text-amber-400 transition-colors">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleRemoveCase(c.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {isExpanded && !isEditing && (
                            <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-2">
                              {c.notes && <p className="text-xs text-gray-500">{c.notes}</p>}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                {eo.expectedParsedTotal != null && (
                                  <div className="bg-gray-800/50 rounded-lg p-2">
                                    <div className="text-gray-600">Expected Total</div>
                                    <div className="text-white font-mono">${Number(eo.expectedParsedTotal).toLocaleString()}</div>
                                  </div>
                                )}
                                {eo.expectedIncludedLineCount != null && (
                                  <div className="bg-gray-800/50 rounded-lg p-2">
                                    <div className="text-gray-600">Included Lines</div>
                                    <div className="text-white">{eo.expectedIncludedLineCount}</div>
                                  </div>
                                )}
                                {eo.expectedExcludedLineCount != null && (
                                  <div className="bg-gray-800/50 rounded-lg p-2">
                                    <div className="text-gray-600">Excluded Lines</div>
                                    <div className="text-white">{eo.expectedExcludedLineCount}</div>
                                  </div>
                                )}
                                {(eo.expectedExcludedSummaryPhrases?.length ?? 0) > 0 && (
                                  <div className="bg-gray-800/50 rounded-lg p-2">
                                    <div className="text-gray-600">Excluded Phrases</div>
                                    <div className="text-white">{eo.expectedExcludedSummaryPhrases?.length}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {isEditing && (
                            <div className="px-4 pb-4 border-t border-amber-800/30 pt-4">
                              <PlumbingRegressionCaseEditor
                                initialValues={{
                                  caseLabel: c.case_label ?? '',
                                  sourceType: c.source_type,
                                  sourceId: c.source_id,
                                  isMustPass: c.is_must_pass,
                                  notes: c.notes ?? '',
                                  expectedOutcome: eo,
                                }}
                                onSave={(vals) => handleUpdateCase(c.id, vals)}
                                onCancel={() => setEditingCase(null)}
                                saving={saving}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}
