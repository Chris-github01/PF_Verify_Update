import type { RiskProfileRecord } from '../../../lib/modules/parsers/plumbing/predictive/riskTypes';
import type { RiskFactorKey } from '../../../lib/modules/parsers/plumbing/predictive/riskTypes';

interface PlumbingRiskFactorFrequencyPanelProps {
  profiles: RiskProfileRecord[];
}

interface FactorFreq {
  key: RiskFactorKey;
  count: number;
  avgScore: number;
  avgWeight: number;
  anomalyCorrelation: number;
}

export default function PlumbingRiskFactorFrequencyPanel({ profiles }: PlumbingRiskFactorFrequencyPanelProps) {
  const freqMap = new Map<RiskFactorKey, { count: number; totalScore: number; totalWeight: number; anomalyCount: number }>();

  for (const profile of profiles) {
    const isAnomaly = profile.actual_outcome === 'anomaly' || profile.actual_outcome === 'failure';
    for (const factor of profile.risk_factors_json ?? []) {
      const key = factor.key as RiskFactorKey;
      const existing = freqMap.get(key) ?? { count: 0, totalScore: 0, totalWeight: 0, anomalyCount: 0 };
      freqMap.set(key, {
        count: existing.count + 1,
        totalScore: existing.totalScore + factor.score,
        totalWeight: existing.totalWeight + factor.weight,
        anomalyCount: existing.anomalyCount + (isAnomaly ? 1 : 0),
      });
    }
  }

  const factors: FactorFreq[] = Array.from(freqMap.entries())
    .map(([key, val]) => ({
      key,
      count: val.count,
      avgScore: Math.round(val.totalScore / val.count),
      avgWeight: Math.round((val.totalWeight / val.count) * 10) / 10,
      anomalyCorrelation: val.count > 0 ? val.anomalyCount / val.count : 0,
    }))
    .sort((a, b) => b.count - a.count);

  if (factors.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No risk factor data yet.
      </div>
    );
  }

  const maxCount = factors[0]?.count ?? 1;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Risk Factor Frequency</h2>
        <p className="text-[10px] text-gray-500 mt-0.5">Most common risk signals across all assessed quotes</p>
      </div>
      <div className="divide-y divide-gray-800">
        {factors.slice(0, 15).map((f) => (
          <div key={f.key} className="px-5 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white capitalize">{f.key.replace(/_/g, ' ')}</div>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orange-600"
                    style={{ width: `${(f.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-500 tabular-nums shrink-0">{f.count}×</span>
              </div>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <div className="text-[10px] text-gray-500">Avg score: <span className="text-white font-medium">{f.avgScore}</span></div>
              {f.anomalyCorrelation > 0 && (
                <div className={`text-[10px] font-semibold ${f.anomalyCorrelation > 0.5 ? 'text-red-400' : 'text-amber-400'}`}>
                  {(f.anomalyCorrelation * 100).toFixed(0)}% anomaly correlation
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
