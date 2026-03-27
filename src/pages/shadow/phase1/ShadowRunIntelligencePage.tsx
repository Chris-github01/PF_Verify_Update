import { useEffect, useState } from 'react';
import { ArrowLeft, Activity, ShieldAlert, FileSearch, RefreshCw, CreditCard as Edit3, Fingerprint, List, TrendingUp, DollarSign, Shield } from 'lucide-react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import ShadowDiffSummary from '../../../components/shadow/ShadowDiffSummary';
import RunDiagnosticsPanel from '../../../components/shadow/phase1/RunDiagnosticsPanel';
import RunFailuresPanel from '../../../components/shadow/phase1/RunFailuresPanel';
import RunDocumentTruthPanel from '../../../components/shadow/phase1/RunDocumentTruthPanel';
import RunAdjudicationPanel from '../../../components/shadow/phase2/RunAdjudicationPanel';
import SupplierFingerprintPanel from '../../../components/shadow/phase2/SupplierFingerprintPanel';
import ScopeIntelligencePanel from '../../../components/shadow/phase3/ScopeIntelligencePanel';
import RateIntelligencePanel from '../../../components/shadow/phase3/RateIntelligencePanel';
import RevenueLeakagePanel from '../../../components/shadow/phase3/RevenueLeakagePanel';
import CommercialRiskPanel from '../../../components/shadow/phase3/CommercialRiskPanel';
import { dbGetShadowRun, dbGetShadowRunResults } from '../../../lib/db/shadowRuns';
import type { ShadowRunRecord, ShadowRunResultRecord, ModuleDiff } from '../../../types/shadow';

function getRunIdFromPath(): string | undefined {
  const m = window.location.pathname.match(/^\/shadow\/runs\/([^/]+)\/intelligence$/);
  return m ? m[1] : undefined;
}

type Tab =
  | 'overview'
  | 'diagnostics'
  | 'failures'
  | 'document_truth'
  | 'adjudication'
  | 'fingerprint'
  | 'scope'
  | 'rates'
  | 'leakage'
  | 'risk';

const TABS: { id: Tab; label: string; icon: React.ReactNode; phase?: number }[] = [
  { id: 'overview', label: 'Overview', icon: <RefreshCw className="w-3.5 h-3.5" /> },
  { id: 'diagnostics', label: 'Diagnostics', icon: <Activity className="w-3.5 h-3.5" />, phase: 1 },
  { id: 'failures', label: 'Failures', icon: <ShieldAlert className="w-3.5 h-3.5" />, phase: 1 },
  { id: 'document_truth', label: 'Document Truth', icon: <FileSearch className="w-3.5 h-3.5" />, phase: 1 },
  { id: 'adjudication', label: 'Adjudication', icon: <Edit3 className="w-3.5 h-3.5" />, phase: 2 },
  { id: 'fingerprint', label: 'Fingerprint', icon: <Fingerprint className="w-3.5 h-3.5" />, phase: 2 },
  { id: 'scope', label: 'Scope', icon: <List className="w-3.5 h-3.5" />, phase: 3 },
  { id: 'rates', label: 'Rates', icon: <TrendingUp className="w-3.5 h-3.5" />, phase: 3 },
  { id: 'leakage', label: 'Leakage', icon: <DollarSign className="w-3.5 h-3.5" />, phase: 3 },
  { id: 'risk', label: 'Risk Profile', icon: <Shield className="w-3.5 h-3.5" />, phase: 3 },
];

function statusColor(s: string): string {
  if (s === 'completed') return 'text-teal-400';
  if (s === 'failed') return 'text-red-400';
  if (s === 'running') return 'text-amber-400';
  return 'text-gray-400';
}

export default function ShadowRunIntelligencePage() {
  const runId = getRunIdFromPath();
  const [tab, setTab] = useState<Tab>('overview');
  const [run, setRun] = useState<ShadowRunRecord | null>(null);
  const [results, setResults] = useState<ShadowRunResultRecord[]>([]);
  const [diff, setDiff] = useState<ModuleDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    load(runId);
  }, [runId]);

  async function load(id: string) {
    setLoading(true);
    setError(null);
    try {
      const [runData, runResults] = await Promise.all([
        dbGetShadowRun(id),
        dbGetShadowRunResults(id),
      ]);
      setRun(runData);
      setResults(runResults);
      const diffResult = runResults.find((r) => r.result_type === 'diff');
      if (diffResult) setDiff(diffResult.output_json as unknown as ModuleDiff);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load run');
    } finally {
      setLoading(false);
    }
  }

  const backPath = run ? `/shadow/modules/${run.module_key}/runs` : '/shadow/modules';

  if (!runId) {
    return (
      <ShadowLayout>
        <div className="text-red-400 text-sm py-8 text-center">No run ID in URL.</div>
      </ShadowLayout>
    );
  }

  return (
    <ShadowLayout>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <a href={backPath} className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </a>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Run Intelligence</h1>
            {run && <p className="text-gray-500 text-sm font-mono">{run.module_key} · {runId?.slice(0, 8)}</p>}
          </div>
          {run && (
            <div className={`text-sm font-semibold ${statusColor(run.status)}`}>
              {run.status}
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-500 text-sm">Loading run data...</div>
        )}
        {error && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {!loading && run && (
          <>
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 flex-wrap">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                    tab === t.id
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            <div>
              {tab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-4 gap-3">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="text-xs text-gray-500 mb-1">Status</div>
                      <div className={`text-sm font-semibold ${statusColor(run.status)}`}>{run.status}</div>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="text-xs text-gray-500 mb-1">Mode</div>
                      <div className="text-sm text-white">{run.run_mode}</div>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="text-xs text-gray-500 mb-1">Source</div>
                      <div className="text-sm text-white truncate">{run.source_label ?? run.source_id.slice(0, 12)}</div>
                    </div>
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="text-xs text-gray-500 mb-1">Results</div>
                      <div className="text-sm text-white">{results.length} records</div>
                    </div>
                  </div>

                  {run.started_at && (
                    <div className="flex items-center gap-6 text-xs text-gray-600">
                      <span>Started: {new Date(run.started_at).toLocaleString()}</span>
                      {run.completed_at && (
                        <span>Completed: {new Date(run.completed_at).toLocaleString()}</span>
                      )}
                    </div>
                  )}

                  {diff && (
                    <div>
                      <div className="text-xs font-medium text-gray-400 mb-2">Comparison Diff</div>
                      <ShadowDiffSummary diff={diff} />
                    </div>
                  )}

                  {run.error_message && (
                    <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3">
                      <div className="text-xs font-medium text-red-400 mb-1">Error</div>
                      <div className="text-xs text-red-300">{run.error_message}</div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 flex-wrap">
                    <button onClick={() => setTab('diagnostics')} className="text-xs text-amber-400 hover:text-amber-300 underline">
                      Diagnostics
                    </button>
                    <span className="text-gray-700">·</span>
                    <button onClick={() => setTab('failures')} className="text-xs text-amber-400 hover:text-amber-300 underline">
                      Failures
                    </button>
                    <span className="text-gray-700">·</span>
                    <button onClick={() => setTab('document_truth')} className="text-xs text-amber-400 hover:text-amber-300 underline">
                      Document Truth
                    </button>
                    <span className="text-gray-700">·</span>
                    <button onClick={() => setTab('adjudication')} className="text-xs text-amber-400 hover:text-amber-300 underline">
                      Adjudication
                    </button>
                    <span className="text-gray-700">·</span>
                    <button onClick={() => setTab('fingerprint')} className="text-xs text-amber-400 hover:text-amber-300 underline">
                      Fingerprint
                    </button>
                    <span className="text-gray-700">·</span>
                    <button onClick={() => setTab('scope')} className="text-xs text-teal-400 hover:text-teal-300 underline">
                      Scope Intel
                    </button>
                    <span className="text-gray-700">·</span>
                    <button onClick={() => setTab('rates')} className="text-xs text-teal-400 hover:text-teal-300 underline">
                      Rates Intel
                    </button>
                    <span className="text-gray-700">·</span>
                    <button onClick={() => setTab('leakage')} className="text-xs text-teal-400 hover:text-teal-300 underline">
                      Leakage
                    </button>
                    <span className="text-gray-700">·</span>
                    <button onClick={() => setTab('risk')} className="text-xs text-teal-400 hover:text-teal-300 underline">
                      Risk Profile
                    </button>
                  </div>
                </div>
              )}

              {tab === 'diagnostics' && runId && (
                <RunDiagnosticsPanel runId={runId} />
              )}

              {tab === 'failures' && runId && (
                <RunFailuresPanel runId={runId} />
              )}

              {tab === 'document_truth' && runId && (
                <RunDocumentTruthPanel runId={runId} />
              )}

              {tab === 'adjudication' && runId && run && (
                <RunAdjudicationPanel runId={runId} moduleKey={run.module_key} />
              )}

              {tab === 'fingerprint' && runId && (
                <SupplierFingerprintPanel runId={runId} />
              )}

              {tab === 'scope' && runId && (
                <ScopeIntelligencePanel runId={runId} />
              )}

              {tab === 'rates' && runId && (
                <RateIntelligencePanel runId={runId} />
              )}

              {tab === 'leakage' && runId && (
                <RevenueLeakagePanel runId={runId} />
              )}

              {tab === 'risk' && runId && (
                <CommercialRiskPanel runId={runId} />
              )}
            </div>
          </>
        )}
      </div>
    </ShadowLayout>
  );
}
