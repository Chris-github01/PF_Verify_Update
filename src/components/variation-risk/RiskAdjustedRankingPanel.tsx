import React from 'react';
import { ArrowRight, MoveUp, MoveDown, Equal } from 'lucide-react';
import type { SupplierVariationRiskResult } from '../../lib/variation-risk/variationRiskTypes';

interface Props {
  results: SupplierVariationRiskResult[];
}

function fmt(v: number) { return `$${Math.round(v).toLocaleString()}`; }

function RankShiftIndicator({ submitted, adjusted }: { submitted: number; adjusted: number }) {
  if (submitted === adjusted) {
    return (
      <div className="flex items-center gap-1 text-slate-500 text-xs">
        <Equal size={12} />
        <span>No change</span>
      </div>
    );
  }
  if (adjusted < submitted) {
    return (
      <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
        <MoveUp size={12} />
        <span>Up {submitted - adjusted} position{submitted - adjusted > 1 ? 's' : ''}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-red-400 text-xs font-semibold">
      <MoveDown size={12} />
      <span>Down {adjusted - submitted} position{adjusted - submitted > 1 ? 's' : ''}</span>
    </div>
  );
}

export default function RiskAdjustedRankingPanel({ results }: Props) {
  const submittedOrder = [...results].sort((a, b) => a.submitted_total - b.submitted_total);
  const adjustedOrder = [...results].sort((a, b) => a.risk_adjusted_tender_value - b.risk_adjusted_tender_value);
  const anyChange = results.some((r) => r.rank_changed);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">Submitted vs Risk-Adjusted Ranking</div>
        {anyChange ? (
          <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
            Position changes detected
          </span>
        ) : (
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-700/60 text-slate-400 border border-slate-600/40">
            No position changes
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-400 mb-2 text-center">Submitted Price Order</div>
          <div className="space-y-1.5">
            {submittedOrder.map((s, i) => (
              <div key={s.supplier_id} className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-3 py-2.5 border border-slate-700/40">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-white truncate">{s.supplier_name}</div>
                  <div className="text-xs text-slate-500 font-mono">{fmt(s.submitted_total)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-400 mb-2 text-center">Risk-Adjusted Order</div>
          <div className="space-y-1.5">
            {adjustedOrder.map((s, i) => {
              const isChanged = s.rank_changed;
              return (
                <div
                  key={s.supplier_id}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2.5 border ${
                    isChanged
                      ? 'bg-amber-500/5 border-amber-500/30'
                      : 'bg-slate-800/40 border-slate-700/40'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                    isChanged ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-white truncate">{s.supplier_name}</div>
                    <div className="text-xs text-slate-500 font-mono">{fmt(s.risk_adjusted_tender_value)}</div>
                  </div>
                  <RankShiftIndicator submitted={s.submitted_rank} adjusted={s.risk_adjusted_rank} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {anyChange && (
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/5 rounded-lg p-3 border border-amber-500/20">
          <ArrowRight size={13} className="mt-0.5 shrink-0" />
          <span>
            Supplier ranking differs after variation risk adjustment. Review risk-adjusted positions before finalising recommendation.
          </span>
        </div>
      )}
    </div>
  );
}
