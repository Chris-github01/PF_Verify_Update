import type { ModuleHealthScore } from '../../lib/intelligence/moduleHealth';
import { TRADE_MODULES, TRADE_COLORS } from '../../lib/modules/tradeRegistry';

interface ModuleComparisonChartProps {
  scores: ModuleHealthScore[];
}

const METRICS: { key: keyof ModuleHealthScore; label: string; color: string }[] = [
  { key: 'regression_pass_rate', label: 'Regression',  color: 'bg-teal-600' },
  { key: 'accuracy_score',       label: 'Accuracy',    color: 'bg-cyan-600' },
  { key: 'predictive_accuracy',  label: 'Predictive',  color: 'bg-amber-600' },
  { key: 'optimization_score',   label: 'Optimization',color: 'bg-blue-600' },
];

export default function ModuleComparisonChart({ scores }: ModuleComparisonChartProps) {
  const active = scores.filter((s) => s.overall_health_score > 0);

  if (active.length === 0) {
    return <div className="text-center py-6 text-sm text-gray-600">No active module data to compare.</div>;
  }

  return (
    <div className="space-y-5">
      {active.map((score) => {
        const mod = TRADE_MODULES[score.module_key];
        const tradeColor = mod ? TRADE_COLORS[mod.trade_category] : 'text-gray-400';

        return (
          <div key={score.module_key} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${tradeColor}`}>{mod?.module_name ?? score.module_key}</span>
              <span className={`text-sm font-bold tabular-nums ${score.overall_health_score >= 70 ? 'text-teal-300' : score.overall_health_score >= 45 ? 'text-amber-300' : 'text-red-400'}`}>
                {score.overall_health_score}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {METRICS.map(({ key, label, color }) => {
                const val = score[key] as number;
                return (
                  <div key={key} className="space-y-1">
                    <div className="text-[9px] text-gray-600 truncate">{label}</div>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${val > 0 ? color : 'bg-gray-800'}`} style={{ width: `${Math.min(val, 100)}%` }} />
                    </div>
                    <div className="text-[9px] text-gray-500 tabular-nums">{val > 0 ? `${val.toFixed(0)}%` : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
