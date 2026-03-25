import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import type { RecommendationResult } from '../../../lib/modules/parsers/plumbing/beta/recommendAdminAction';
import { getRecommendationLabel } from '../../../lib/modules/parsers/plumbing/beta/recommendAdminAction';

interface PlumbingBetaHealthCardProps {
  result: RecommendationResult;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; ring: string }> = {
  healthy: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-300', ring: 'bg-teal-500' },
  watch: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', ring: 'bg-amber-500' },
  at_risk: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-300', ring: 'bg-orange-400' },
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', ring: 'bg-red-500' },
};

const ACTION_COLORS: Record<string, string> = {
  rollback_beta_to_live: 'text-red-300 bg-red-500/15 border-red-500/30',
  pause_org_beta_for_review: 'text-orange-300 bg-orange-500/15 border-orange-500/30',
  review_discrepancy_cases: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
  expand_beta_cautiously: 'text-teal-300 bg-teal-500/15 border-teal-500/30',
  continue_internal_beta: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
  continue_limited_org_beta: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
  refresh_regression_suite: 'text-gray-300 bg-gray-700 border-gray-600',
  insufficient_data: 'text-gray-400 bg-gray-800 border-gray-700',
};

export default function PlumbingBetaHealthCard({ result }: PlumbingBetaHealthCardProps) {
  const c = STATUS_COLORS[result.healthStatus] ?? STATUS_COLORS.watch;

  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-6`}>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wider">Beta Health Score</div>
          <div className="flex items-end gap-3">
            <span className={`text-5xl font-bold ${c.text}`}>{result.healthScore}</span>
            <span className="text-gray-500 text-lg mb-1">/100</span>
          </div>
        </div>
        <div className="text-right">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${c.bg} ${c.border} ${c.text}`}>
            <span className={`w-2 h-2 rounded-full ${c.ring}`} />
            {result.healthStatus.replace('_', ' ').toUpperCase()}
          </div>
          <div className="text-xs text-gray-600 mt-1.5 text-right">
            Confidence: <span className="text-gray-400">{result.confidence}</span>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-2">Recommended Action</div>
        <div className={`inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border ${ACTION_COLORS[result.recommendation] ?? ACTION_COLORS.insufficient_data}`}>
          <Activity className="w-4 h-4" />
          {getRecommendationLabel(result.recommendation)}
        </div>
      </div>

      {result.topReasons.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 mb-2">Contributing factors</div>
          <ul className="space-y-1">
            {result.topReasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                <span className="text-gray-600 mt-0.5 shrink-0">—</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.secondaryActions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <div className="text-xs text-gray-500 mb-2">Also consider</div>
          <div className="flex flex-wrap gap-2">
            {result.secondaryActions.map((a) => (
              <span key={a} className="text-[10px] text-gray-400 bg-gray-800 border border-gray-700 px-2 py-1 rounded-md">
                {getRecommendationLabel(a)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TrendIcon({ direction }: { direction: string }) {
  if (direction === 'improving') return <TrendingUp className="w-4 h-4 text-teal-400" />;
  if (direction === 'degrading') return <TrendingDown className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-gray-500" />;
}
