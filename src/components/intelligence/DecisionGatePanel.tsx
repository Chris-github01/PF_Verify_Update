import type { DecisionGateResult, GateReason } from '../../lib/intelligence/types';
import GateStatusBadge from './GateStatusBadge';

interface Props {
  result: DecisionGateResult;
}

const DIMENSION_LABELS: Record<string, string> = {
  scope_coverage: 'Core Scope Coverage',
  exclusions: 'Exclusion Density',
  risk_scope: 'Risk Scope Items',
  confidence: 'Classification Confidence',
  behaviour_risk: 'Historical Behaviour Risk',
  document_truth: 'Document Validation',
  quantity_intelligence: 'Quantity Comparability',
};

function GateReasonRow({ reason }: { reason: GateReason }) {
  const statusColors = {
    pass: 'text-emerald-400',
    warn: 'text-amber-400',
    fail: 'text-red-400',
    pending: 'text-slate-400',
  };
  const dotColors = {
    pass: 'bg-emerald-400',
    warn: 'bg-amber-400',
    fail: 'bg-red-400',
    pending: 'bg-slate-400',
  };

  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-slate-700/40 last:border-0">
      <div className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[reason.status]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-xs font-medium text-slate-300">
            {DIMENSION_LABELS[reason.dimension] ?? reason.dimension}
          </span>
          <span className={`text-xs font-semibold uppercase tracking-wide ${statusColors[reason.status]}`}>
            {reason.status}
          </span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{reason.message}</p>
      </div>
    </div>
  );
}

export default function DecisionGatePanel({ result }: Props) {
  const headerStyles = {
    pass: { bg: 'bg-emerald-500/10 border-emerald-500/20', icon: '✓', iconColor: 'text-emerald-400' },
    warn: { bg: 'bg-amber-500/10 border-amber-500/20', icon: '!', iconColor: 'text-amber-400' },
    fail: { bg: 'bg-red-500/10 border-red-500/20', icon: '✕', iconColor: 'text-red-400' },
    pending: { bg: 'bg-slate-600/10 border-slate-600/20', icon: '?', iconColor: 'text-slate-400' },
  };
  const headerStyle = headerStyles[result.gateStatus];

  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-3 p-3 rounded-xl border ${headerStyle.bg}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-base ${headerStyle.iconColor}`}
          style={{ background: 'rgba(0,0,0,0.2)' }}>
          {headerStyle.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <GateStatusBadge status={result.gateStatus} />
            {result.canBeBestTenderer && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium">
                Eligible: Best Tenderer
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{result.gateSummary}</p>
        </div>
      </div>

      {!result.canBeRecommended && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-500/20">
          <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <p className="text-xs text-red-400 font-medium">
            This supplier cannot be recommended without a documented override.
          </p>
        </div>
      )}

      {!result.canBeBestTenderer && result.canBeRecommended && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-500/20">
          <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-xs text-amber-400 font-medium">
            Conditional recommendation only. Resolve warnings before awarding as Best Tenderer.
          </p>
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Gate Dimensions</h4>
        <div>
          {result.gateReasons.map((reason, i) => (
            <GateReasonRow key={i} reason={reason} />
          ))}
        </div>
      </div>
    </div>
  );
}
