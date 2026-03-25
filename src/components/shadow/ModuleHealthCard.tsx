import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ModuleHealthScore } from '../../lib/intelligence/moduleHealth';
import { TRADE_MODULES, TRADE_COLORS } from '../../lib/modules/tradeRegistry';

interface ModuleHealthCardProps {
  score: ModuleHealthScore;
  onClick?: () => void;
}

const TREND_CONFIG = {
  improving: { icon: TrendingUp,   color: 'text-teal-400',  label: 'Improving' },
  stable:    { icon: Minus,        color: 'text-gray-400',  label: 'Stable' },
  degrading: { icon: TrendingDown, color: 'text-red-400',   label: 'Degrading' },
};

function MiniBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function ModuleHealthCard({ score, onClick }: ModuleHealthCardProps) {
  const trend = TREND_CONFIG[score.trend];
  const TrendIcon = trend.icon;
  const mod = TRADE_MODULES[score.module_key];
  const tradeColor = mod ? TRADE_COLORS[mod.trade_category] : 'text-gray-400';
  const healthColor = score.overall_health_score >= 70 ? 'text-teal-300' : score.overall_health_score >= 45 ? 'text-amber-300' : score.overall_health_score > 0 ? 'text-red-400' : 'text-gray-700';

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors space-y-3"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className={`text-xs font-semibold ${tradeColor}`}>{mod?.module_name ?? score.module_key}</div>
          <div className="text-[10px] text-gray-600 font-mono mt-0.5">{score.module_key}</div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-black tabular-nums ${healthColor}`}>
            {score.overall_health_score > 0 ? score.overall_health_score : '—'}
          </div>
          <div className={`text-[10px] flex items-center justify-end gap-1 ${trend.color}`}>
            <TrendIcon className="w-3 h-3" />
            {trend.label}
          </div>
        </div>
      </div>

      {score.overall_health_score > 0 && (
        <div className="space-y-2">
          <MetricRow label="Regression" value={score.regression_pass_rate} suffix="%" color="bg-teal-600" />
          <MetricRow label="Accuracy"   value={score.accuracy_score}       suffix="%" color="bg-cyan-600" />
          <MetricRow label="Predictive" value={score.predictive_accuracy}  suffix="%" color="bg-amber-600" />
        </div>
      )}

      {score.overall_health_score === 0 && (
        <div className="text-[10px] text-gray-600 text-center py-2">Intelligence layer not yet enabled</div>
      )}

      <div className="flex items-center justify-between text-[10px] text-gray-600 pt-1 border-t border-gray-800">
        <span>Anomaly rate: {score.anomaly_rate > 0 ? `${score.anomaly_rate.toFixed(1)}%` : '—'}</span>
        <span>Backlog: {score.review_backlog_count}</span>
      </div>
    </button>
  );
}

function MetricRow({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-gray-600">{label}</span>
        <span className="text-gray-400 tabular-nums">{value.toFixed(1)}{suffix}</span>
      </div>
      <MiniBar value={value} color={color} />
    </div>
  );
}
