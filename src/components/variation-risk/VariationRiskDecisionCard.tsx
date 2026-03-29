import React from 'react';
import { TrendingUp, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import type { SupplierVariationRiskResult, VariationRiskLevel } from '../../lib/variation-risk/variationRiskTypes';

interface Props {
  result: SupplierVariationRiskResult;
}

const RISK_CONFIG: Record<VariationRiskLevel, {
  bg: string;
  border: string;
  badge: string;
  text: string;
  icon: React.ElementType;
  label: string;
}> = {
  low: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    text: 'text-emerald-400',
    icon: CheckCircle,
    label: 'Low Risk',
  },
  moderate: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    text: 'text-amber-400',
    icon: AlertTriangle,
    label: 'Moderate Risk',
  },
  high: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
    text: 'text-orange-400',
    icon: TrendingUp,
    label: 'High Risk',
  },
  critical: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    badge: 'bg-red-500/20 text-red-300 border border-red-500/30',
    text: 'text-red-400',
    icon: XCircle,
    label: 'Critical Risk',
  },
};

function formatPercent(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function formatCurrency(v: number) {
  return `$${Math.round(v).toLocaleString()}`;
}

function ConfidenceBar({ score, quality }: { score: number; quality: string }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 70 ? 'bg-emerald-500' :
    pct >= 45 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Prediction confidence</span>
        <span className={`font-semibold ${pct >= 70 ? 'text-emerald-400' : pct >= 45 ? 'text-amber-400' : 'text-red-400'}`}>
          {pct}%
          <span className="ml-1 font-normal text-slate-500">({quality})</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function VariationRiskDecisionCard({ result }: Props) {
  const cfg = RISK_CONFIG[result.variation_risk_level];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={18} className={cfg.text} />
          <span className="text-sm font-semibold text-white">{result.supplier_name}</span>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/60 rounded-lg p-3 space-y-0.5">
          <div className="text-xs text-slate-400">Submitted total</div>
          <div className="text-base font-bold text-white">{formatCurrency(result.submitted_total)}</div>
        </div>
        <div className={`rounded-lg p-3 space-y-0.5 bg-slate-800/60`}>
          <div className="text-xs text-slate-400">Predicted uplift</div>
          <div className={`text-base font-bold ${cfg.text}`}>
            +{formatPercent(result.predicted_variation_exposure_percent)}
            <span className="ml-1 text-sm font-normal text-slate-400">
              ({formatCurrency(result.predicted_variation_exposure_value)})
            </span>
          </div>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3 space-y-0.5 col-span-2">
          <div className="text-xs text-slate-400">Risk-adjusted tender value</div>
          <div className="text-lg font-bold text-white">
            {formatCurrency(result.risk_adjusted_tender_value)}
          </div>
          <div className="text-xs text-slate-500">
            Range: {formatPercent(result.exposure_range.conservative_exposure_percent)} – {formatPercent(result.exposure_range.elevated_exposure_percent)} uplift
          </div>
        </div>
      </div>

      <ConfidenceBar score={result.confidence_score} quality={result.data_quality} />

      {result.data_quality !== 'sufficient' && (
        <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-800/40 rounded-lg p-2.5">
          <Info size={13} className="mt-0.5 shrink-0 text-slate-500" />
          <span>
            {result.data_quality === 'partial'
              ? 'Partial data — some inputs unavailable. Treat as indicative.'
              : 'Insufficient data — prediction confidence is low. Use with caution.'}
          </span>
        </div>
      )}
    </div>
  );
}
