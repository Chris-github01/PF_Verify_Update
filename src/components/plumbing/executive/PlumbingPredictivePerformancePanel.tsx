import { Brain, Target, AlertOctagon, CheckCircle2 } from 'lucide-react';
import type { PredictivePerformanceMetrics } from '../../../lib/modules/parsers/plumbing/analytics/analyticsTypes';

interface PlumbingPredictivePerformancePanelProps {
  metrics: PredictivePerformanceMetrics;
}

function scoreColor(v: number, invert = false): string {
  const good = invert ? v <= 10 : v >= 80;
  const warn = invert ? v <= 20 : v >= 60;
  if (good) return 'text-teal-300';
  if (warn) return 'text-amber-300';
  return 'text-red-400';
}

function gauge(v: number, invert = false): string {
  const pct = invert ? Math.max(0, 100 - v) : v;
  return `${pct}%`;
}

export default function PlumbingPredictivePerformancePanel({ metrics }: PlumbingPredictivePerformancePanelProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Brain className="w-4 h-4 text-cyan-400" />
          Predictive Intelligence Performance
        </h2>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Derived from {metrics.totalPredictions} reviewed prediction outcomes
        </p>
      </div>

      <div className="p-5 space-y-4">
        {metrics.totalPredictions === 0 ? (
          <div className="text-center text-sm text-gray-600 py-4">
            Predictive performance metrics appear once review decisions include prediction outcomes.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <PerfCard icon={Target} label="Precision" value={`${metrics.precision.toFixed(1)}%`} sub="Correct predictions" color={scoreColor(metrics.precision)} gauge={gauge(metrics.precision)} />
              <PerfCard icon={Brain} label="Recall estimate" value={`${metrics.recallEstimate.toFixed(1)}%`} sub="Coverage of actual risks" color={scoreColor(metrics.recallEstimate)} gauge={gauge(metrics.recallEstimate)} />
              <PerfCard icon={AlertOctagon} label="False positive rate" value={`${metrics.falsePositiveRate.toFixed(1)}%`} sub="Over-sensitive alerts" color={scoreColor(metrics.falsePositiveRate, true)} gauge={gauge(metrics.falsePositiveRate, true)} />
              <PerfCard icon={AlertOctagon} label="False negative rate" value={`${metrics.falseNegativeRate.toFixed(1)}%`} sub="Missed risks" color={scoreColor(metrics.falseNegativeRate, true)} gauge={gauge(metrics.falseNegativeRate, true)} />
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-gray-500">High-risk to actual issue correlation</div>
                  <div className="text-xs text-gray-300 mt-0.5">
                    {metrics.confirmedHighRisk} of {metrics.totalPredictions} high-risk flags confirmed as real issues
                  </div>
                </div>
                <div className={`text-2xl font-bold ${scoreColor(metrics.highRiskToActualCorrelation)}`}>
                  {metrics.highRiskToActualCorrelation.toFixed(1)}%
                </div>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full mt-3 overflow-hidden">
                <div className="h-full rounded-full bg-cyan-600 transition-all"
                  style={{ width: `${metrics.highRiskToActualCorrelation}%` }} />
              </div>
            </div>

            <div className="text-[10px] text-gray-600">
              <CheckCircle2 className="inline w-3 h-3 mr-1" />
              Metrics sourced from reviewer decisions on predictions. More reviews improve calibration accuracy.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PerfCard({ icon: Icon, label, value, sub, color, gauge }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub: string; color: string; gauge: string;
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-gray-500" />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="h-1 bg-gray-700 rounded-full mt-2 mb-1 overflow-hidden">
        <div className={`h-full rounded-full ${color.replace('text-', 'bg-').replace('-300', '-600').replace('-400', '-600')}`} style={{ width: gauge }} />
      </div>
      <div className="text-[10px] text-gray-600">{sub}</div>
    </div>
  );
}
