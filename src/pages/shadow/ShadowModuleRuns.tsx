import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import ShadowRunHistoryTable from '../../components/shadow/ShadowRunHistoryTable';
import { getShadowRuns, getShadowRunResults } from '../../lib/shadow/shadowRunner';
import ShadowDiffSummary from '../../components/shadow/ShadowDiffSummary';
import type { ShadowRunRecord, ModuleDiff } from '../../types/shadow';

function getModuleKeyFromPath(): string | undefined {
  const m = window.location.pathname.match(/^\/shadow\/modules\/([^/]+)\/runs$/);
  return m ? m[1] : undefined;
}

export default function ShadowModuleRuns() {
  const moduleKey = getModuleKeyFromPath();
  const [runs, setRuns] = useState<ShadowRunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<ShadowRunRecord | null>(null);
  const [diff, setDiff] = useState<ModuleDiff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduleKey) return;
    getShadowRuns(moduleKey, 50).then((r) => { setRuns(r); setLoading(false); });
  }, [moduleKey]);

  async function handleSelectRun(run: ShadowRunRecord) {
    setSelectedRun(run);
    const results = await getShadowRunResults(run.id);
    const diffResult = results.find((r: Record<string, unknown>) => r.result_type === 'diff');
    if (diffResult) setDiff(diffResult.output_json as unknown as ModuleDiff);
    else setDiff(null);
  }

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <a href={`/shadow/modules/${moduleKey}`} className="text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div>
              <h1 className="text-xl font-bold text-white">Run History</h1>
              <p className="text-gray-500 text-sm font-mono">{moduleKey}</p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading...</div>
          ) : (
            <div className="space-y-6">
              <ShadowRunHistoryTable runs={runs} onSelect={handleSelectRun} />

              {selectedRun && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">Run Detail</h2>
                    <span className="text-xs text-gray-500 font-mono">{selectedRun.id.slice(0, 8)}...</span>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="bg-gray-950 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">Mode</div>
                      <div className="text-sm text-white">{selectedRun.run_mode}</div>
                    </div>
                    <div className="bg-gray-950 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">Source</div>
                      <div className="text-sm text-white truncate">{selectedRun.source_label ?? selectedRun.source_id.slice(0, 16)}</div>
                    </div>
                    <div className="bg-gray-950 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1">Status</div>
                      <div className="text-sm text-white">{selectedRun.status}</div>
                    </div>
                  </div>

                  {diff && (
                    <>
                      <div className="text-xs font-medium text-gray-400 pt-2">Comparison Diff</div>
                      <ShadowDiffSummary diff={diff} />
                    </>
                  )}

                  {selectedRun.error_message && (
                    <div className="bg-red-950/40 border border-red-800 rounded-lg p-3">
                      <div className="text-xs text-red-400 font-medium mb-1">Error</div>
                      <div className="text-xs text-red-300">{selectedRun.error_message}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}
