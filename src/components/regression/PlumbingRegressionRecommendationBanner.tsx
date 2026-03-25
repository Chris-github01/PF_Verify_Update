import { CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { SuiteRecommendation } from '../../lib/modules/parsers/plumbing/regression/types';

interface Props {
  recommendation: SuiteRecommendation;
  reasons: string[];
}

const CONFIG: Record<SuiteRecommendation, {
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  label: string;
  description: string;
}> = {
  ready_for_internal_beta: {
    icon: CheckCircle,
    color: 'text-green-400',
    bg: 'bg-green-950/30',
    border: 'border-green-800',
    label: 'Ready for Internal Beta',
    description: 'All gating criteria passed. Shadow plumbing parser is safe for internal beta rollout.',
  },
  needs_more_work: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-950/30',
    border: 'border-amber-800',
    label: 'Needs More Work',
    description: 'Failure rates exceed acceptable thresholds. Review failed cases before considering beta.',
  },
  blocked_by_critical_failures: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-950/30',
    border: 'border-red-800',
    label: 'Blocked by Critical Failures',
    description: 'Critical or must-pass failures detected. Do not promote until resolved.',
  },
};

export default function PlumbingRegressionRecommendationBanner({ recommendation, reasons }: Props) {
  const [expanded, setExpanded] = useState(false);
  const cfg = CONFIG[recommendation];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border ${cfg.bg} ${cfg.border} overflow-hidden`}>
      <div className="px-5 py-4 flex items-start gap-4">
        <Icon className={`w-6 h-6 ${cfg.color} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className={`text-base font-bold ${cfg.color}`}>{cfg.label}</div>
          <p className="text-sm text-gray-300 mt-0.5">{cfg.description}</p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors mt-0.5"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {expanded && reasons.length > 0 && (
        <div className="px-5 pb-4 border-t border-white/5 pt-3 space-y-1">
          {reasons.map((r, i) => (
            <div key={i} className="text-xs text-gray-400 flex items-start gap-2">
              <span className="text-gray-600 shrink-0">•</span>
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
