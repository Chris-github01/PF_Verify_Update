import { AlertTriangle, CheckCircle, TrendingDown, BarChart2, DollarSign, Layers, Shield, Info } from 'lucide-react';
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

const SEVERITY_COLORS = {
  critical: 'border-red-500/40 bg-red-500/8',
  high: 'border-orange-500/40 bg-orange-500/8',
  medium: 'border-yellow-500/40 bg-yellow-500/8',
  low: 'border-emerald-500/40 bg-emerald-500/8',
  safe: 'border-emerald-500/40 bg-emerald-500/8',
};

const SEVERITY_TEXT = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-emerald-400',
  safe: 'text-emerald-400',
};

export default function NormalisationAuditCards({ summaries }: Props) {
  const totals = summaries.reduce(
    (acc, s) => ({
      rawLines: acc.rawLines + s.rawLineCount,
      normLines: acc.normLines + s.normalizedLineCount,
      rawQty: acc.rawQty + s.rawQuantityTotal,
      safeQty: acc.safeQty + s.safeQuantityTotal,
      qtyAtRisk: acc.qtyAtRisk + s.quantityAtRisk,
      rawVal: acc.rawVal + s.rawValueTotal,
      safeVal: acc.safeVal + s.safeValueTotal,
      valAtRisk: acc.valAtRisk + s.valueAtRisk,
      flags: acc.flags + s.duplicateFlagsCount + s.overlapFlagsCount,
    }),
    { rawLines: 0, normLines: 0, rawQty: 0, safeQty: 0, qtyAtRisk: 0, rawVal: 0, safeVal: 0, valAtRisk: 0, flags: 0 }
  );

  const cards = [
    {
      label: 'Raw Lines',
      value: totals.rawLines.toString(),
      sub: `${totals.normLines} normalised`,
      icon: Layers,
      color: 'text-slate-300',
      bg: 'bg-slate-700/40',
    },
    {
      label: 'Normalised Lines',
      value: totals.normLines.toString(),
      sub: `${totals.rawLines - totals.normLines} collapsed`,
      icon: BarChart2,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Raw Quantity',
      value: fmtQty(totals.rawQty),
      sub: 'units (reported)',
      icon: Info,
      color: 'text-slate-300',
      bg: 'bg-slate-700/40',
    },
    {
      label: 'Safe Quantity',
      value: fmtQty(totals.safeQty),
      sub: 'units (verified)',
      icon: Shield,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Qty At Risk',
      value: fmtQty(totals.qtyAtRisk),
      sub: 'potential double-count',
      icon: AlertTriangle,
      color: totals.qtyAtRisk > 0 ? 'text-orange-400' : 'text-slate-400',
      bg: totals.qtyAtRisk > 0 ? 'bg-orange-500/10' : 'bg-slate-700/40',
    },
    {
      label: 'Raw Value',
      value: fmtCurrency(totals.rawVal),
      sub: 'total reported',
      icon: DollarSign,
      color: 'text-slate-300',
      bg: 'bg-slate-700/40',
    },
    {
      label: 'Safe Value',
      value: fmtCurrency(totals.safeVal),
      sub: 'comparable base',
      icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Value At Risk',
      value: fmtCurrency(totals.valAtRisk),
      sub: `${totals.flags} flag(s) raised`,
      icon: TrendingDown,
      color: totals.valAtRisk > 0 ? 'text-red-400' : 'text-slate-400',
      bg: totals.valAtRisk > 0 ? 'bg-red-500/10' : 'bg-slate-700/40',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`rounded-xl border border-slate-700/60 p-4 ${card.bg}`}>
          <div className="flex items-center gap-2 mb-2">
            <card.icon className={`w-4 h-4 ${card.color}`} />
            <span className="text-xs text-slate-400 font-medium">{card.label}</span>
          </div>
          <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
          <div className="text-xs text-slate-500 mt-0.5">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}

export function CommercialVerdictBanner({ summaries }: Props) {
  if (summaries.length === 0) return null;

  const worst = summaries.reduce((a, b) => {
    const order = { critical: 4, high: 3, medium: 2, low: 1, safe: 0 };
    return (order[a.verdictSeverity] || 0) >= (order[b.verdictSeverity] || 0) ? a : b;
  });

  const colorClass = SEVERITY_COLORS[worst.verdictSeverity] || SEVERITY_COLORS.safe;
  const textClass = SEVERITY_TEXT[worst.verdictSeverity] || SEVERITY_TEXT.safe;
  const icon = worst.verdictSeverity === 'safe' || worst.verdictSeverity === 'low' ? CheckCircle : AlertTriangle;
  const IconComp = icon;

  return (
    <div className={`rounded-xl border p-4 ${colorClass}`}>
      <div className="flex items-start gap-3">
        <IconComp className={`w-5 h-5 mt-0.5 flex-shrink-0 ${textClass}`} />
        <div>
          <div className={`font-semibold text-sm mb-1 ${textClass}`}>
            Commercial Verdict — {worst.verdictSeverity.toUpperCase()}
          </div>
          <p className="text-slate-300 text-sm">{worst.commercialVerdict}</p>
          <p className="text-slate-500 text-xs mt-2 italic">
            Normalization reconstructs a safe comparable BOQ and does not modify supplier submissions.
          </p>
        </div>
      </div>
    </div>
  );
}
