import { CheckCircle2, AlertTriangle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { SupplierScoreBreakdown } from '../../lib/auto-adjudication/autoAdjudicationTypes';

interface Props {
  rankings: SupplierScoreBreakdown[];
  recommendedSupplierId: string | null;
  cheapestSupplierId: string;
}

function GateBadge({ status }: { status: string }) {
  if (status === 'pass') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
      <CheckCircle2 className="w-3 h-3" /> PASS
    </span>
  );
  if (status === 'warn') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
      <AlertTriangle className="w-3 h-3" /> WARN
    </span>
  );
  if (status === 'fail') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
      <XCircle className="w-3 h-3" /> FAIL
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/25">
      <Clock className="w-3 h-3" /> PENDING
    </span>
  );
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
        <span>{label}</span>
        <span>{pct}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n === null) return '—';
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}

export default function SupplierRankingTable({ rankings, recommendedSupplierId, cheapestSupplierId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {rankings.map(supplier => {
        const isRecommended = supplier.supplier_id === recommendedSupplierId;
        const isCheapest = supplier.supplier_id === cheapestSupplierId;
        const isExpanded = expandedId === supplier.supplier_id;

        return (
          <div
            key={supplier.supplier_id}
            className={`rounded-xl border transition-colors ${
              isRecommended
                ? 'border-emerald-500/40 bg-emerald-500/5'
                : supplier.recommendation_eligible
                ? 'border-slate-700/60 bg-slate-800/20'
                : 'border-slate-700/30 bg-slate-800/10 opacity-75'
            }`}
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : supplier.supplier_id)}
              className="w-full text-left"
            >
              <div className="flex items-center gap-4 p-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  supplier.rank_position === 1 ? 'bg-emerald-500/20 text-emerald-400' :
                  supplier.rank_position === 2 ? 'bg-blue-500/20 text-blue-400' :
                  'bg-slate-700/60 text-slate-400'
                }`}>
                  {supplier.rank_position}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">{supplier.supplier_name}</span>
                    {isRecommended && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
                        RECOMMENDED
                      </span>
                    )}
                    {isCheapest && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 whitespace-nowrap">
                        LOWEST PRICE
                      </span>
                    )}
                    {!supplier.recommendation_eligible && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-500 border border-slate-600/40">
                        NOT ELIGIBLE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{supplier.ranking_summary}</p>
                </div>

                <div className="hidden md:flex items-center gap-6 flex-shrink-0 text-right">
                  <div>
                    <p className="text-xs text-slate-500">Submitted</p>
                    <p className="text-sm font-semibold text-slate-200">{fmt(supplier.submitted_total)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Score</p>
                    <p className="text-sm font-bold text-white">{(supplier.overall_score * 100).toFixed(1)}</p>
                  </div>
                  <GateBadge status={supplier.gate_status} />
                </div>

                <div className="text-slate-500 flex-shrink-0">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-slate-700/40 pt-3 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <ScoreBar value={supplier.price_position_score} label="Price Position" />
                  <ScoreBar value={supplier.scope_strength_score} label="Scope Strength" />
                  <ScoreBar value={supplier.validation_integrity_score} label="Validation" />
                  <ScoreBar value={supplier.behaviour_trust_score} label="Behaviour Trust" />
                  <ScoreBar value={supplier.variation_risk_score} label="Variation Risk" />
                </div>

                {supplier.ranking_reasons.length > 0 && (
                  <div className="space-y-1">
                    {supplier.ranking_reasons.map((r, i) => (
                      <p key={i} className="text-xs text-emerald-400 flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 flex-shrink-0 mt-0.5" /> {r}
                      </p>
                    ))}
                  </div>
                )}

                {supplier.ranking_warnings.length > 0 && (
                  <div className="space-y-1">
                    {supplier.ranking_warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-400 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> {w}
                      </p>
                    ))}
                  </div>
                )}

                {supplier.normalised_total !== null && (
                  <p className="text-xs text-slate-400">
                    Normalised total: <span className="text-slate-200 font-medium">{fmt(supplier.normalised_total)}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
