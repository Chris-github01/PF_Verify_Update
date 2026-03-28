import { Building2, TrendingDown, CheckCircle, AlertTriangle } from 'lucide-react';
import type { NormalizationAuditSummary } from '../../types/boqNormalisation.types';

interface Props {
  summaries: NormalizationAuditSummary[];
}

function fmtCurrency(v: number) {
  return '$' + v.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtQty(v: number) {
  return v.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

const VERDICT_STYLE: Record<string, { border: string; text: string; badge: string }> = {
  critical: { border: 'border-red-500/40', text: 'text-red-400', badge: 'bg-red-500/15 text-red-400' },
  high: { border: 'border-orange-500/40', text: 'text-orange-400', badge: 'bg-orange-500/15 text-orange-400' },
  medium: { border: 'border-yellow-500/40', text: 'text-yellow-400', badge: 'bg-yellow-500/15 text-yellow-400' },
  low: { border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400' },
  safe: { border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400' },
};

export default function SupplierSummaryPanel({ summaries }: Props) {
  if (summaries.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-blue-400" />
        Supplier Commercial Summaries
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {summaries.map(s => {
          const style = VERDICT_STYLE[s.verdictSeverity] || VERDICT_STYLE.safe;
          const icon = s.verdictSeverity === 'safe' || s.verdictSeverity === 'low' ? CheckCircle : AlertTriangle;
          const IconComp = icon;
          const discountPct = s.rawValueTotal > 0 ? ((s.rawValueTotal - s.safeValueTotal) / s.rawValueTotal) * 100 : 0;

          return (
            <div key={s.supplierId} className={`rounded-xl border ${style.border} bg-slate-800/30 p-4`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-slate-100 text-sm">{s.supplierName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.trade} · {s.rawLineCount} raw lines → {s.normalizedLineCount} normalised</div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
                  {s.verdictSeverity.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: 'Raw Total', value: fmtCurrency(s.rawValueTotal), sub: fmtQty(s.rawQuantityTotal) + ' qty', color: 'text-slate-300' },
                  { label: 'Safe Total', value: fmtCurrency(s.safeValueTotal), sub: fmtQty(s.safeQuantityTotal) + ' qty', color: 'text-emerald-400' },
                  { label: 'At Risk', value: fmtCurrency(s.valueAtRisk), sub: discountPct.toFixed(1) + '%', color: s.valueAtRisk > 0 ? 'text-red-400' : 'text-slate-400' },
                ].map(item => (
                  <div key={item.label} className="bg-slate-900/40 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500 mb-0.5">{item.label}</div>
                    <div className={`text-sm font-bold ${item.color}`}>{item.value}</div>
                    <div className="text-[10px] text-slate-500">{item.sub}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {[
                  { label: 'Provisional', value: fmtCurrency(s.provisionalValueTotal), qty: fmtQty(s.provisionalQuantityTotal), color: 'text-yellow-400' },
                  { label: 'Optional', value: fmtCurrency(s.optionalValueTotal), qty: fmtQty(s.optionalQuantityTotal), color: 'text-slate-400' },
                  { label: 'Dependency', value: fmtCurrency(s.dependencyValueTotal), qty: fmtQty(s.dependencyQuantityTotal), color: 'text-cyan-400' },
                  { label: 'Verified', value: fmtCurrency(s.verifiedValueTotal), qty: fmtQty(s.verifiedQuantityTotal), color: 'text-emerald-400' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between text-xs px-2 py-1 bg-slate-900/40 rounded-md">
                    <span className="text-slate-500">{item.label}</span>
                    <div className="text-right">
                      <span className={`font-medium ${item.color}`}>{item.value}</span>
                      <span className="text-slate-500 ml-1">({item.qty})</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 bg-slate-900/40 rounded-lg px-3 py-2">
                <IconComp className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${style.text}`} />
                <p className="text-xs text-slate-300">{s.commercialVerdict}</p>
              </div>

              {(s.duplicateFlagsCount > 0 || s.systemConflictCount > 0 || s.summaryLinesExcluded > 0) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {s.duplicateFlagsCount > 0 && (
                    <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 rounded px-1.5 py-0.5">
                      {s.duplicateFlagsCount} dup flag(s)
                    </span>
                  )}
                  {s.overlapFlagsCount > 0 && (
                    <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded px-1.5 py-0.5">
                      {s.overlapFlagsCount} overlap(s)
                    </span>
                  )}
                  {s.systemConflictCount > 0 && (
                    <span className="text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded px-1.5 py-0.5">
                      {s.systemConflictCount} system conflict(s)
                    </span>
                  )}
                  {s.summaryLinesExcluded > 0 && (
                    <span className="text-[10px] bg-slate-600/40 text-slate-400 border border-slate-600/30 rounded px-1.5 py-0.5">
                      {s.summaryLinesExcluded} summary line(s) excluded
                    </span>
                  )}
                  {s.provisionalCount > 0 && (
                    <span className="text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded px-1.5 py-0.5">
                      {s.provisionalCount} provisional item(s)
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
        <p className="text-xs text-slate-400 italic">
          <span className="text-slate-300 font-medium">Advisory notice: </span>
          Normalization reconstructs a safe comparable BOQ and does not modify supplier submissions. All raw quote data is preserved unchanged. These outputs are advisory-only and must be reviewed by a qualified QS before informing any commercial decision.
        </p>
      </div>
    </div>
  );
}
