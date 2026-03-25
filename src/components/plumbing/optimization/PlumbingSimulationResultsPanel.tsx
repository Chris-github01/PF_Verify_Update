import { ArrowUp, ArrowDown, Minus, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { OptimizationRun, OptimizationBundle } from '../../../lib/modules/parsers/plumbing/optimization/optimizationTypes';
import { scoreBundle } from '../../../lib/modules/parsers/plumbing/optimization/scoreBundle';

interface PlumbingSimulationResultsPanelProps {
  bundle: OptimizationBundle;
  run: OptimizationRun;
}

function nzd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

function DeltaBadge({ before, after, invert = false, suffix = '%' }: { before: number; after: number; invert?: boolean; suffix?: string }) {
  const diff = after - before;
  const improved = invert ? diff < 0 : diff > 0;
  const changed = Math.abs(diff) > 0.01;

  const icon = !changed ? <Minus className="w-3 h-3" /> : improved ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  const color = !changed ? 'text-gray-500' : improved ? 'text-teal-300' : 'text-red-400';

  return (
    <div className="flex items-center gap-1">
      <span className="text-sm font-mono text-gray-400">{before.toFixed(1)}{suffix}</span>
      <span className="text-gray-600 text-xs">→</span>
      <span className={`text-sm font-mono font-bold ${color}`}>{after.toFixed(1)}{suffix}</span>
      <span className={`text-[10px] flex items-center gap-0.5 ${color}`}>
        {icon}
        {changed ? `${Math.abs(diff).toFixed(1)}${suffix}` : 'no change'}
      </span>
    </div>
  );
}

export default function PlumbingSimulationResultsPanel({ bundle, run }: PlumbingSimulationResultsPanelProps) {
  const { overallScore, components } = scoreBundle(run);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Simulation Results</h2>
        <p className="text-[10px] text-gray-500 mt-0.5">{bundle.bundle_name}</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Safety guard */}
        {run.safety_guard_triggered && (
          <div className="flex items-start gap-3 px-4 py-3 bg-red-900/20 border border-red-700/40 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-red-300">Safety Guard Triggered</div>
              <div className="text-xs text-red-400 mt-0.5">{run.safety_guard_reason}</div>
              <div className="text-[10px] text-gray-500 mt-1">Bundle cannot be promoted until safety issue is resolved.</div>
            </div>
          </div>
        )}

        {!run.safety_guard_triggered && (
          <div className="flex items-center gap-2 text-xs text-teal-300">
            <ShieldCheck className="w-4 h-4" />
            All safety checks passed
          </div>
        )}

        {/* Before vs after */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricRow label="Regression pass rate" before={run.regression_pass_rate_before} after={run.regression_pass_rate_after} />
          <MetricRow label="Anomaly rate" before={run.anomaly_rate_before} after={run.anomaly_rate_after} invert />
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Additional financial risk prevented</div>
            <div className={`text-sm font-bold ${run.financial_impact_delta > 0 ? 'text-teal-300' : 'text-gray-500'}`}>
              {run.financial_impact_delta > 0 ? `+${nzd(run.financial_impact_delta)}` : 'No change'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-gray-500 mb-1">Predictive accuracy delta</div>
            <div className={`text-sm font-bold ${run.predictive_accuracy_delta > 0 ? 'text-teal-300' : run.predictive_accuracy_delta < 0 ? 'text-red-400' : 'text-gray-500'}`}>
              {run.predictive_accuracy_delta > 0 ? '+' : ''}{run.predictive_accuracy_delta.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-6 text-xs">
          <span className={`${run.failures_introduced > 0 ? 'text-red-400' : 'text-gray-500'}`}>
            Failures introduced: <strong>{run.failures_introduced}</strong>
          </span>
          <span className={`${run.improvements_gained > 0 ? 'text-teal-400' : 'text-gray-500'}`}>
            Improvements gained: <strong>{run.improvements_gained}</strong>
          </span>
        </div>

        {/* Score breakdown */}
        <div className="border-t border-gray-800 pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Overall bundle score</span>
            <span className={`text-2xl font-black tabular-nums ${overallScore >= 70 ? 'text-teal-300' : overallScore >= 45 ? 'text-amber-300' : 'text-red-400'}`}>
              {overallScore}/100
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${overallScore >= 70 ? 'bg-teal-600' : overallScore >= 45 ? 'bg-amber-600' : 'bg-red-600'}`}
              style={{ width: `${overallScore}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-1 pt-1">
            {Object.entries(components).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between text-[10px]">
                <span className="text-gray-600">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                <span className="text-gray-400 tabular-nums">{val.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, before, after, invert = false }: { label: string; before: number; after: number; invert?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <DeltaBadge before={before} after={after} invert={invert} />
    </div>
  );
}
