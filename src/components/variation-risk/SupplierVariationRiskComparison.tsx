import React from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { SupplierVariationRiskResult, VariationRiskLevel } from '../../lib/variation-risk/variationRiskTypes';

interface Props {
  results: SupplierVariationRiskResult[];
  cheapestSubmittedId: string;
  cheapestRiskAdjustedId: string;
}

const RISK_BADGE: Record<VariationRiskLevel, string> = {
  low: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  moderate: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  high: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  critical: 'bg-red-500/20 text-red-300 border border-red-500/30',
};

function fmt(v: number) { return `$${Math.round(v).toLocaleString()}`; }
function fmtPct(v: number) { return `${(v * 100).toFixed(1)}%`; }

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-slate-300 text-xs font-bold">
      {rank}
    </span>
  );
}

function RankShift({ submitted, adjusted }: { submitted: number; adjusted: number }) {
  if (submitted === adjusted) {
    return <Minus size={14} className="text-slate-500" />;
  }
  if (adjusted < submitted) {
    return (
      <span className="flex items-center gap-0.5 text-emerald-400 text-xs font-semibold">
        <ArrowUp size={12} /> {submitted - adjusted}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-red-400 text-xs font-semibold">
      <ArrowDown size={12} /> {adjusted - submitted}
    </span>
  );
}

export default function SupplierVariationRiskComparison({ results, cheapestSubmittedId, cheapestRiskAdjustedId }: Props) {
  const sorted = [...results].sort((a, b) => a.risk_adjusted_tender_value - b.risk_adjusted_tender_value);

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-200">Supplier Variation Risk Comparison</div>
      <div className="text-xs text-slate-400 mb-1">Sorted by risk-adjusted value (lowest first)</div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-700/60">
              <th className="text-left text-xs font-semibold text-slate-400 pb-2 pr-4">Supplier</th>
              <th className="text-right text-xs font-semibold text-slate-400 pb-2 pr-4">Submitted</th>
              <th className="text-right text-xs font-semibold text-slate-400 pb-2 pr-4">Exposure</th>
              <th className="text-right text-xs font-semibold text-slate-400 pb-2 pr-4">Risk-Adjusted</th>
              <th className="text-center text-xs font-semibold text-slate-400 pb-2 pr-4">Risk Level</th>
              <th className="text-center text-xs font-semibold text-slate-400 pb-2 pr-2">Rank Shift</th>
              <th className="text-right text-xs font-semibold text-slate-400 pb-2">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {sorted.map((s) => {
              const isCheapestSubmitted = s.supplier_id === cheapestSubmittedId;
              const isCheapestAdjusted = s.supplier_id === cheapestRiskAdjustedId;
              const shiftValue = s.risk_adjusted_tender_value - s.submitted_total;

              return (
                <tr key={s.supplier_id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <RankBadge rank={s.risk_adjusted_rank} />
                      <div>
                        <div className="text-white font-medium text-sm">{s.supplier_name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {isCheapestSubmitted && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                              Lowest Price
                            </span>
                          )}
                          {isCheapestAdjusted && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Best Adjusted
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right text-slate-300 font-mono text-sm">
                    {fmt(s.submitted_total)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <div className="text-amber-400 font-semibold font-mono text-sm">
                      +{fmtPct(s.predicted_variation_exposure_percent)}
                    </div>
                    <div className="text-slate-500 text-xs font-mono">+{fmt(shiftValue)}</div>
                  </td>
                  <td className="py-3 pr-4 text-right font-bold text-white font-mono text-sm">
                    {fmt(s.risk_adjusted_tender_value)}
                  </td>
                  <td className="py-3 pr-4 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RISK_BADGE[s.variation_risk_level]}`}>
                      {s.variation_risk_level.charAt(0).toUpperCase() + s.variation_risk_level.slice(1)}
                    </span>
                  </td>
                  <td className="py-3 pr-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs text-slate-500">#{s.submitted_rank}</span>
                      <RankShift submitted={s.submitted_rank} adjusted={s.risk_adjusted_rank} />
                      <span className="text-xs text-slate-400">#{s.risk_adjusted_rank}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-semibold ${
                        s.confidence_score >= 0.70 ? 'text-emerald-400' :
                        s.confidence_score >= 0.45 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {Math.round(s.confidence_score * 100)}%
                      </span>
                      <div className="w-16 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            s.confidence_score >= 0.70 ? 'bg-emerald-500' :
                            s.confidence_score >= 0.45 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${s.confidence_score * 100}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
