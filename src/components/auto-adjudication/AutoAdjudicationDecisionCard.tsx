import { ShieldCheck, ShieldAlert, AlertTriangle, XCircle, TrendingUp, Info } from 'lucide-react';
import type { AutoAdjudicationResult, FinalOutcome } from '../../lib/auto-adjudication/autoAdjudicationTypes';

interface Props {
  result: AutoAdjudicationResult;
}

function OutcomeConfig(outcome: FinalOutcome) {
  switch (outcome) {
    case 'auto_recommend':
      return {
        icon: ShieldCheck,
        label: 'Auto-Recommended',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        text: 'text-emerald-400',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      };
    case 'recommend_with_warnings':
      return {
        icon: ShieldAlert,
        label: 'Recommended — Warnings Active',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-400',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      };
    case 'manual_review_required':
      return {
        icon: AlertTriangle,
        label: 'Manual Review Required',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/30',
        text: 'text-orange-400',
        badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      };
    case 'blocked_no_safe_recommendation':
      return {
        icon: XCircle,
        label: 'Blocked — No Safe Recommendation',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-400',
        badge: 'bg-red-500/20 text-red-300 border-red-500/30',
      };
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 72 ? 'bg-emerald-500' :
    pct >= 52 ? 'bg-amber-500' :
    'bg-red-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Recommendation Confidence</span>
        <span className="font-semibold text-slate-200">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-700/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>Low</span>
        <span>52% warn threshold</span>
        <span>72% auto threshold</span>
        <span>High</span>
      </div>
    </div>
  );
}

export default function AutoAdjudicationDecisionCard({ result }: Props) {
  const cfg = OutcomeConfig(result.final_outcome);
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-5 space-y-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
            <Icon className={`w-5 h-5 ${cfg.text}`} />
          </div>
          <div>
            <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.text}`}>
              Auto-Adjudication
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">{cfg.label}</h3>
          </div>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.badge} whitespace-nowrap`}>
          {result.final_outcome.replace(/_/g, ' ').toUpperCase()}
        </span>
      </div>

      {result.recommended_supplier_name && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700/40">
          <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <div>
            <span className="text-xs text-slate-400">Best Tenderer</span>
            <p className="text-sm font-semibold text-white">{result.recommended_supplier_name}</p>
          </div>
        </div>
      )}

      <p className="text-sm text-slate-300 leading-relaxed">{result.recommendation_summary}</p>

      <ConfidenceBar value={result.recommendation_confidence_score} />

      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
        <Info className="w-3 h-3" />
        Config {result.config_version} · Generated {new Date(result.generated_at).toLocaleString()}
      </div>
    </div>
  );
}
