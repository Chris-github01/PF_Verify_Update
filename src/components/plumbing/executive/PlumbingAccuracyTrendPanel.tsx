import { BarChart2, Info } from 'lucide-react';
import type { AggregatedMetrics } from '../../../lib/modules/parsers/plumbing/analytics/analyticsTypes';

interface PlumbingAccuracyTrendPanelProps {
  metrics: AggregatedMetrics;
  releaseHistory: Array<{ confidence_score: number; regression_pass_rate: number; anomaly_rate: number; created_at: string }>;
}

function pct(v: number): string { return `${v.toFixed(1)}%`; }

function rateBar(v: number, invert = false, color = 'bg-teal-600'): React.ReactElement {
  const width = invert ? `${Math.max(0, 100 - v)}%` : `${Math.min(v, 100)}%`;
  return (
    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width }} />
    </div>
  );
}

export default function PlumbingAccuracyTrendPanel({ metrics, releaseHistory }: PlumbingAccuracyTrendPanelProps) {
  const latest = releaseHistory[0];
  const previous = releaseHistory[1];

  function delta(current: number, prev: number | undefined, invert = false): { value: number; label: string; positive: boolean } | null {
    if (prev == null) return null;
    const d = current - prev;
    const positive = invert ? d < 0 : d > 0;
    return { value: Math.abs(d), label: d > 0 ? `+${d.toFixed(1)}%` : `${d.toFixed(1)}%`, positive };
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-white">Parser Accuracy Trends</h2>
      </div>

      <div className="p-5 space-y-5">
        {/* Current-period rates */}
        <div className="space-y-3">
          <div className="text-[10px] text-gray-500 font-medium">Current period rates</div>
          {[
            { label: 'Anomaly rate',            value: metrics.anomalyRate,            color: 'bg-red-600',    invert: true },
            { label: 'Duplicate total rate',    value: metrics.duplicateTotalRate,     color: 'bg-orange-600', invert: true },
            { label: 'Classification error rate', value: metrics.classificationErrorRate, color: 'bg-amber-600', invert: true },
            { label: 'Review correction rate',  value: metrics.reviewCorrectionRate,   color: 'bg-cyan-600',   invert: false },
            { label: 'High-risk detection rate',value: metrics.highRiskDetectionRate,  color: 'bg-teal-600',   invert: false },
          ].map((row) => (
            <div key={row.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">{row.label}</span>
                <span className={`font-mono ${row.invert ? (row.value <= 2 ? 'text-teal-300' : row.value <= 8 ? 'text-amber-300' : 'text-red-300') : 'text-teal-300'}`}>
                  {pct(row.value)}
                </span>
              </div>
              {rateBar(row.value, false, row.color)}
            </div>
          ))}
        </div>

        {/* Release confidence history */}
        {releaseHistory.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-500 font-medium mb-2">Confidence over time</div>
            <div className="flex items-end gap-1 h-16">
              {releaseHistory.slice(0, 20).reverse().map((r, i) => {
                const h = (r.confidence_score / 100) * 100;
                const color = r.confidence_score >= 95 ? 'bg-teal-600' : r.confidence_score >= 85 ? 'bg-amber-600' : 'bg-red-600';
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm transition-all"
                    style={{ height: `${h}%` }}
                    title={`${r.confidence_score.toFixed(1)} — ${new Date(r.created_at).toLocaleDateString()}`}
                  >
                    <div className={`w-full h-full rounded-t-sm ${color}`} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-gray-600 mt-1">
              <span>{releaseHistory.length > 1 ? new Date(releaseHistory[releaseHistory.length - 1].created_at).toLocaleDateString() : 'Start'}</span>
              <span>Latest</span>
            </div>
          </div>
        )}

        {/* Comparison vs previous snapshot */}
        {latest && previous && (
          <div className="border-t border-gray-800 pt-4 space-y-2">
            <div className="text-[10px] text-gray-500 font-medium">vs previous snapshot</div>
            {[
              { label: 'Confidence score', current: latest.confidence_score, prev: previous.confidence_score },
              { label: 'Regression pass rate', current: latest.regression_pass_rate, prev: previous.regression_pass_rate },
              { label: 'Anomaly rate', current: latest.anomaly_rate, prev: previous.anomaly_rate, invert: true },
            ].map((row) => {
              const d = delta(row.current, row.prev, row.invert);
              return (
                <div key={row.label} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{row.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300">{row.current.toFixed(1)}</span>
                    {d && (
                      <span className={`text-[10px] font-medium ${d.positive ? 'text-teal-400' : 'text-red-400'}`}>
                        {d.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
          <Info className="w-3 h-3" />
          All rates computed from parser_impact_events. More processed quotes improve accuracy.
        </div>
      </div>
    </div>
  );
}
