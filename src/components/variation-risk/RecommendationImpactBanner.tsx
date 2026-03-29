import React from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type { VariationRiskComparisonResult } from '../../lib/variation-risk/variationRiskTypes';

interface Props {
  comparison: VariationRiskComparisonResult;
}

export default function RecommendationImpactBanner({ comparison }: Props) {
  const {
    recommendation_changed_after_risk_adjustment,
    cheapest_submitted_supplier_name,
    cheapest_risk_adjusted_supplier_name,
    why_cheapest_may_not_be_cheapest_summary,
    recommendation_impact_summary,
  } = comparison;

  if (recommendation_changed_after_risk_adjustment) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <span className="text-sm font-bold text-amber-300">
            Variation Risk Changes Commercial Position
          </span>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">
          {recommendation_impact_summary}
        </p>

        {why_cheapest_may_not_be_cheapest_summary && (
          <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
            <div className="text-xs font-semibold text-slate-400 mb-1">Why cheapest may not be cheapest</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {why_cheapest_may_not_be_cheapest_summary}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-slate-400 border-t border-amber-500/20 pt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Lowest submitted:</span>
            <span className="text-white font-semibold">{cheapest_submitted_supplier_name}</span>
          </div>
          <span className="text-slate-600">→</span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Best adjusted:</span>
            <span className="text-emerald-300 font-semibold">{cheapest_risk_adjusted_supplier_name}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle size={15} className="text-emerald-400 shrink-0" />
        <span className="text-sm font-semibold text-emerald-300">
          Variation Risk Supports Current Position
        </span>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed">
        {recommendation_impact_summary}
      </p>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Info size={12} />
        <span>
          {cheapest_submitted_supplier_name} remains cheapest on both submitted and risk-adjusted basis.
        </span>
      </div>
    </div>
  );
}
