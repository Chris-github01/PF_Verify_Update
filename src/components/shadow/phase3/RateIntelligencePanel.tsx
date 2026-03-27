import { useEffect, useState } from 'react';
import { getRateIntelligenceForRun } from '../../../lib/shadow/phase3/rateIntelligenceService';
import type { RateIntelligenceResult, ShadowRateIntelligence } from '../../../lib/shadow/phase3/rateIntelligenceService';

interface Props {
  runId: string;
}

function varianceColor(record: ShadowRateIntelligence): string {
  if (record.anomaly_flag) {
    return record.variance_type === 'significantly_under'
      ? 'text-red-400'
      : 'text-orange-400';
  }
  if (record.variance_type === 'under_priced') return 'text-amber-400';
  if (record.variance_type === 'over_priced') return 'text-sky-400';
  if (record.variance_type === 'no_benchmark') return 'text-gray-500';
  return 'text-teal-400';
}

function varianceBadge(record: ShadowRateIntelligence): string {
  switch (record.variance_type) {
    case 'significantly_under': return 'Sig. Under';
    case 'under_priced': return 'Under';
    case 'significantly_over': return 'Sig. Over';
    case 'over_priced': return 'Over';
    case 'within_range': return 'Normal';
    default: return 'No Benchmark';
  }
}

export default function RateIntelligencePanel({ runId }: Props) {
  const [data, setData] = useState<RateIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);

  useEffect(() => {
    getRateIntelligenceForRun(runId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Loading rate intelligence...</div>;
  if (error) return <div className="text-red-400 text-sm py-4">{error}</div>;
  if (!data || data.records.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-8 text-center">
        <div className="text-gray-500 text-sm">No rate intelligence data available for this run.</div>
        <div className="text-gray-600 text-xs mt-1">Rate intelligence requires items with priced rates.</div>
      </div>
    );
  }

  const displayRecords = showAnomaliesOnly
    ? data.records.filter((r) => r.anomaly_flag)
    : data.records;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-lg font-bold text-white">{data.records.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Priced Items</div>
        </div>
        <div className={`rounded-xl border p-4 ${data.anomalyCount > 0 ? 'bg-red-950/30 border-red-800' : 'bg-gray-900 border-gray-800'}`}>
          <div className={`text-lg font-bold ${data.anomalyCount > 0 ? 'text-red-400' : 'text-white'}`}>
            {data.anomalyCount}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Rate Anomalies</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-lg font-bold text-white">{data.underPricedCount + data.overPricedCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">Off-Benchmark Items</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Rates compared against historical benchmark pool
        </div>
        <button
          onClick={() => setShowAnomaliesOnly(!showAnomaliesOnly)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            showAnomaliesOnly
              ? 'bg-red-950/40 border-red-800 text-red-300'
              : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          {showAnomaliesOnly ? 'Show All' : 'Anomalies Only'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 pr-3 font-medium">Item</th>
              <th className="text-right py-2 pr-3 font-medium">Rate</th>
              <th className="text-right py-2 pr-3 font-medium">Benchmark</th>
              <th className="text-right py-2 pr-3 font-medium">Variance</th>
              <th className="text-center py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayRecords.slice(0, 150).map((r, i) => (
              <tr
                key={i}
                className={`border-b border-gray-800/50 ${r.anomaly_flag ? 'bg-red-950/10' : 'hover:bg-gray-900'}`}
              >
                <td className="py-1.5 pr-3 text-gray-300 max-w-xs truncate">
                  {r.item_description.slice(0, 80)}
                </td>
                <td className="py-1.5 pr-3 text-right text-gray-300">
                  {r.rate != null ? `$${r.rate.toFixed(2)}` : '—'}
                  {r.unit && <span className="text-gray-600 ml-0.5">/{r.unit}</span>}
                </td>
                <td className="py-1.5 pr-3 text-right text-gray-500">
                  {r.benchmark_rate != null ? `$${r.benchmark_rate.toFixed(2)}` : '—'}
                </td>
                <td className={`py-1.5 pr-3 text-right font-mono ${varianceColor(r)}`}>
                  {r.variance_percent != null
                    ? `${r.variance_percent > 0 ? '+' : ''}${r.variance_percent.toFixed(1)}%`
                    : '—'}
                </td>
                <td className="py-1.5 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs ${varianceColor(r)}`}>
                    {varianceBadge(r)}
                    {r.anomaly_flag && ' ⚠'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayRecords.length > 150 && (
          <div className="text-gray-600 text-xs text-center mt-2">
            Showing 150 of {displayRecords.length} items
          </div>
        )}
      </div>
    </div>
  );
}
