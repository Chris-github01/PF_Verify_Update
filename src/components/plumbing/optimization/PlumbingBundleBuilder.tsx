import { Package, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import type { OptimizationBundle, OptimizationRun, OptimizationRanking } from '../../../lib/modules/parsers/plumbing/optimization/optimizationTypes';

interface PlumbingBundleBuilderProps {
  bundles: Array<{ bundle: OptimizationBundle; run?: OptimizationRun; ranking?: OptimizationRanking }>;
  onRunBundle: (bundleId: string) => void;
  onSelectBundle: (bundleId: string) => void;
  runningId?: string;
}

const SIZE_COLORS = {
  small:     'text-gray-300 bg-gray-800 border-gray-700',
  medium:    'text-cyan-300 bg-cyan-900/20 border-cyan-700/30',
  strategic: 'text-amber-300 bg-amber-900/20 border-amber-700/30',
};

const STATUS_STYLE: Record<string, string> = {
  pending:  'text-gray-400',
  testing:  'text-cyan-400 animate-pulse',
  passed:   'text-teal-300',
  failed:   'text-red-400',
  promoted: 'text-amber-300',
  archived: 'text-gray-600',
};

function nzd(v: number): string {
  if (v >= 1000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v)}`;
}

export default function PlumbingBundleBuilder({ bundles, onRunBundle, onSelectBundle, runningId }: PlumbingBundleBuilderProps) {
  if (bundles.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-gray-600">
        No bundles yet. Generate candidates first, then click "Generate Bundles" to assemble them.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bundles.map(({ bundle, run, ranking }) => (
        <div key={bundle.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
          <div className="px-4 py-3 flex items-start gap-3">
            <Package className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-white truncate">{bundle.bundle_name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border capitalize ${SIZE_COLORS[bundle.bundle_size]}`}>
                  {bundle.bundle_size}
                </span>
                <span className={`text-[10px] font-medium ${STATUS_STYLE[bundle.status]}`}>
                  {bundle.status}
                </span>
              </div>

              <div className="flex items-center gap-4 mt-1 text-[10px] text-gray-500">
                <span>{bundle.candidate_ids.length} candidates</span>
                <span>{bundle.combined_rule_changes_json.changes.length} rule changes</span>
                {bundle.conflict_detected && (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Conflict detected
                  </span>
                )}
              </div>

              {bundle.conflict_notes && (
                <div className="mt-1 text-[10px] text-amber-400">{bundle.conflict_notes}</div>
              )}

              {/* Run results */}
              {run && (
                <div className="mt-2 flex items-center gap-4 text-[10px] flex-wrap">
                  <span className={`font-medium ${run.regression_pass_rate_after >= run.regression_pass_rate_before ? 'text-teal-400' : 'text-red-400'}`}>
                    Regression: {run.regression_pass_rate_before.toFixed(1)}% → {run.regression_pass_rate_after.toFixed(1)}%
                  </span>
                  <span className={run.anomaly_rate_after <= run.anomaly_rate_before ? 'text-teal-400' : 'text-orange-400'}>
                    Anomaly: {run.anomaly_rate_before.toFixed(1)}% → {run.anomaly_rate_after.toFixed(1)}%
                  </span>
                  {run.financial_impact_delta > 0 && (
                    <span className="text-teal-400">+{nzd(run.financial_impact_delta)} additional risk prevented</span>
                  )}
                  {run.safety_guard_triggered && (
                    <span className="text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Safety guard triggered
                    </span>
                  )}
                  {!run.safety_guard_triggered && run.failures_introduced === 0 && (
                    <span className="text-teal-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      No regressions
                    </span>
                  )}
                </div>
              )}

              {ranking && (
                <div className="mt-1 text-[10px] text-gray-500">
                  Rank #{ranking.rank_position} · Score: {ranking.rank_score.toFixed(0)}/100 ·
                  <span className={`ml-1 ${ranking.recommendation_level === 'strong' ? 'text-teal-400' : ranking.recommendation_level === 'moderate' ? 'text-amber-400' : 'text-gray-500'}`}>
                    {ranking.recommendation_level}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!run && bundle.status === 'pending' && (
                <button
                  onClick={() => onRunBundle(bundle.id)}
                  disabled={runningId === bundle.id}
                  className="text-[10px] font-medium px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 transition-colors"
                >
                  {runningId === bundle.id ? 'Running...' : 'Simulate'}
                </button>
              )}
              <button onClick={() => onSelectBundle(bundle.id)} className="text-gray-500 hover:text-white transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
