import { Rocket, GitBranch, Download, ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react';
import type { BundleWithRun } from '../../../lib/modules/parsers/plumbing/optimization/optimizationTypes';
import { exportBundleAsJSON } from '../../../lib/db/optimizationDb';

interface PlumbingDeploymentRecommendationPanelProps {
  topBundles: BundleWithRun[];
  onPromoteToShadow: (bundleId: string, rankingId: string) => void;
  onMarkAsReleaseCandidate: (bundleId: string, rankingId: string) => void;
  promotingId?: string;
}

function nzd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

export default function PlumbingDeploymentRecommendationPanel({
  topBundles,
  onPromoteToShadow,
  onMarkAsReleaseCandidate,
  promotingId,
}: PlumbingDeploymentRecommendationPanelProps) {
  const strongBundles = topBundles.filter((b) => b.ranking?.recommendation_level === 'strong' && b.run && !b.run.safety_guard_triggered);

  if (strongBundles.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-2">
        <Rocket className="w-8 h-8 text-gray-700 mx-auto" />
        <p className="text-sm text-gray-500">No strong deployment candidates yet.</p>
        <p className="text-xs text-gray-600">
          Run simulations on pending bundles. Bundles scoring 70+ with no safety issues will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Rocket className="w-4 h-4 text-teal-400" />
        <h2 className="text-sm font-semibold text-white">Deployment Recommendations</h2>
        <span className="text-[10px] text-teal-400 bg-teal-900/30 border border-teal-700/30 px-2 py-0.5 rounded-full">
          {strongBundles.length} ready
        </span>
      </div>

      {strongBundles.map(({ bundle, run, ranking }) => {
        if (!run || !ranking) return null;
        const regDelta = run.regression_pass_rate_after - run.regression_pass_rate_before;
        const anomalyDelta = run.anomaly_rate_after - run.anomaly_rate_before;

        return (
          <div key={bundle.id} className="bg-teal-900/10 border border-teal-700/30 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-teal-800/30 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{bundle.bundle_name}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {bundle.candidate_ids.length} candidates · {bundle.combined_rule_changes_json.changes.length} rule changes · Score: {ranking.rank_score.toFixed(0)}/100
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-[10px] text-teal-400 font-medium">Safety cleared</span>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Expected improvements */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ImprovementStat
                  label="Regression improvement"
                  value={regDelta >= 0 ? `+${regDelta.toFixed(1)}%` : `${regDelta.toFixed(1)}%`}
                  positive={regDelta >= 0}
                />
                <ImprovementStat
                  label="Anomaly rate change"
                  value={anomalyDelta <= 0 ? `${anomalyDelta.toFixed(1)}%` : `+${anomalyDelta.toFixed(1)}%`}
                  positive={anomalyDelta <= 0}
                />
                <ImprovementStat
                  label="Additional risk prevented"
                  value={run.financial_impact_delta > 0 ? `+${nzd(run.financial_impact_delta)}` : '—'}
                  positive={run.financial_impact_delta > 0}
                />
                <ImprovementStat
                  label="Regressions introduced"
                  value={run.failures_introduced === 0 ? 'None' : `${run.failures_introduced}`}
                  positive={run.failures_introduced === 0}
                />
              </div>

              {/* Risk note */}
              {ranking.risk_level !== 'low' && (
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Risk level: {ranking.risk_level} — additional shadow testing recommended before release promotion.
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => onPromoteToShadow(bundle.id, ranking.id)}
                  disabled={promotingId === bundle.id || ranking.promoted_to_shadow}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 transition-colors"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  {ranking.promoted_to_shadow ? 'Promoted to Shadow' : promotingId === bundle.id ? 'Promoting...' : 'Send to Shadow Testing'}
                </button>
                <button
                  onClick={() => onMarkAsReleaseCandidate(bundle.id, ranking.id)}
                  disabled={!ranking.promoted_to_shadow || ranking.promoted_to_release}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-teal-700/50 text-teal-300 hover:bg-teal-900/30 disabled:opacity-40 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {ranking.promoted_to_release ? 'Release Candidate' : 'Mark as Release Candidate'}
                </button>
                <button
                  onClick={() => {
                    const json = exportBundleAsJSON(bundle);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `bundle_${bundle.id.slice(0, 8)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-2 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export JSON
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ImprovementStat({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${positive ? 'text-teal-300' : 'text-red-400'}`}>{value}</div>
    </div>
  );
}
