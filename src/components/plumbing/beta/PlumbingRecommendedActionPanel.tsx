import { ArrowRight, RotateCcw, Pause, TrendingUp, RefreshCw, Search, Play } from 'lucide-react';
import type { RecommendationResult, AdminActionRecommendation } from '../../../lib/modules/parsers/plumbing/beta/recommendAdminAction';
import { getRecommendationLabel } from '../../../lib/modules/parsers/plumbing/beta/recommendAdminAction';

const ACTION_ICONS: Partial<Record<AdminActionRecommendation, React.ReactNode>> = {
  rollback_beta_to_live: <RotateCcw className="w-4 h-4" />,
  pause_org_beta_for_review: <Pause className="w-4 h-4" />,
  expand_beta_cautiously: <TrendingUp className="w-4 h-4" />,
  refresh_regression_suite: <RefreshCw className="w-4 h-4" />,
  review_discrepancy_cases: <Search className="w-4 h-4" />,
  continue_internal_beta: <Play className="w-4 h-4" />,
  continue_limited_org_beta: <Play className="w-4 h-4" />,
  insufficient_data: <Search className="w-4 h-4" />,
};

const ACTION_CONFIG: Record<string, { color: string; border: string; bg: string; cta?: string; href?: string }> = {
  rollback_beta_to_live: { color: 'text-red-300', border: 'border-red-500/40', bg: 'bg-red-500/10', cta: 'Go to rollout controls', href: '/shadow/modules/plumbing_parser/rollout' },
  pause_org_beta_for_review: { color: 'text-orange-300', border: 'border-orange-500/40', bg: 'bg-orange-500/10', cta: 'View org risk table' },
  review_discrepancy_cases: { color: 'text-amber-300', border: 'border-amber-500/40', bg: 'bg-amber-500/10', cta: 'View anomalies', href: '/shadow/modules/plumbing_parser/beta/anomalies' },
  expand_beta_cautiously: { color: 'text-teal-300', border: 'border-teal-500/40', bg: 'bg-teal-500/10', cta: 'Go to rollout controls', href: '/shadow/modules/plumbing_parser/rollout' },
  continue_internal_beta: { color: 'text-cyan-300', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
  continue_limited_org_beta: { color: 'text-cyan-300', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
  refresh_regression_suite: { color: 'text-gray-300', border: 'border-gray-600', bg: 'bg-gray-800', cta: 'Go to regression', href: '/shadow/modules/plumbing_parser/regression' },
  insufficient_data: { color: 'text-gray-400', border: 'border-gray-700', bg: 'bg-gray-900' },
};

interface PlumbingRecommendedActionPanelProps {
  result: RecommendationResult;
}

export default function PlumbingRecommendedActionPanel({ result }: PlumbingRecommendedActionPanelProps) {
  const cfg = ACTION_CONFIG[result.recommendation] ?? ACTION_CONFIG.insufficient_data;
  const icon = ACTION_ICONS[result.recommendation];

  return (
    <div className={`${cfg.bg} border ${cfg.border} rounded-xl p-5`}>
      <div className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wider">Recommended Admin Action</div>
      <div className={`flex items-center gap-3 mb-4 ${cfg.color}`}>
        {icon}
        <span className="text-sm font-semibold">{getRecommendationLabel(result.recommendation)}</span>
      </div>

      {result.topReasons.length > 0 && (
        <ul className="space-y-1 mb-4">
          {result.topReasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
              <span className="text-gray-600 mt-0.5 shrink-0">—</span>{r}
            </li>
          ))}
        </ul>
      )}

      {cfg.cta && cfg.href && (
        <a
          href={cfg.href}
          className={`inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg border transition-colors ${cfg.bg} ${cfg.border} ${cfg.color} hover:opacity-80`}
        >
          {cfg.cta}
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      )}

      {result.secondaryActions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <div className="text-xs text-gray-500 mb-2">Secondary actions to consider</div>
          <div className="flex flex-wrap gap-2">
            {result.secondaryActions.map((a) => {
              const sc = ACTION_CONFIG[a] ?? ACTION_CONFIG.insufficient_data;
              return (
                <span key={a} className={`text-[10px] font-medium px-2.5 py-1 rounded-md border ${sc.bg} ${sc.border} ${sc.color}`}>
                  {getRecommendationLabel(a)}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
