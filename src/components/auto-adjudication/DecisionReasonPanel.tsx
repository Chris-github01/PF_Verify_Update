import { CheckCircle2, AlertTriangle, XCircle, MessageSquare } from 'lucide-react';
import type { AutoAdjudicationResult } from '../../lib/auto-adjudication/autoAdjudicationTypes';

interface Props {
  result: AutoAdjudicationResult;
}

function ReasonSection({
  icon: Icon,
  label,
  reasons,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  reasons: string[];
  color: string;
}) {
  if (reasons.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</h4>
      <ul className="space-y-1.5">
        {reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
            <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${color}`} />
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DecisionReasonPanel({ result }: Props) {
  const hasReasons =
    result.recommendation_reasons.length > 0 ||
    result.warning_reasons.length > 0 ||
    result.block_reasons.length > 0 ||
    result.manual_review_reasons.length > 0;

  if (!hasReasons) return null;

  const whyNotCheapest = result.narratives.why_not_cheapest_summary;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5 space-y-5">
      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-blue-400" />
        Decision Reasoning
      </h3>

      <ReasonSection
        icon={CheckCircle2}
        label="Recommendation Basis"
        reasons={result.recommendation_reasons}
        color="text-emerald-400"
      />

      <ReasonSection
        icon={AlertTriangle}
        label="Active Warnings"
        reasons={result.warning_reasons}
        color="text-amber-400"
      />

      <ReasonSection
        icon={AlertTriangle}
        label="Manual Review Required"
        reasons={result.manual_review_reasons}
        color="text-orange-400"
      />

      <ReasonSection
        icon={XCircle}
        label="Recommendation Blocked"
        reasons={result.block_reasons}
        color="text-red-400"
      />

      {whyNotCheapest && (
        <div className="p-3 rounded-lg bg-blue-500/8 border border-blue-500/20 space-y-1">
          <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Why Not the Cheapest?</h4>
          <p className="text-sm text-slate-300 leading-relaxed">{whyNotCheapest}</p>
        </div>
      )}
    </div>
  );
}
