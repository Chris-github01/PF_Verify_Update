import { ArrowRight, Shield, FlaskConical, Eye, Tag } from 'lucide-react';
import type { HandlingPathResult } from '../../../lib/modules/parsers/plumbing/predictive/recommendHandlingPath';
import type { RiskScoringResult } from '../../../lib/modules/parsers/plumbing/predictive/riskTypes';

interface PlumbingHandlingRecommendationPanelProps {
  handlingPath: HandlingPathResult;
  scoringResult: RiskScoringResult;
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  proceed_normally: Shield,
  run_shadow_compare: FlaskConical,
  review_discrepancy_after_parse: Eye,
  assign_org_watchlist: Tag,
  block_expansion_for_org: Shield,
  refresh_regression_coverage: FlaskConical,
};

const ACTION_LABELS: Record<string, string> = {
  proceed_normally: 'Proceed normally',
  run_shadow_compare: 'Run shadow compare',
  review_discrepancy_after_parse: 'Review after parse',
  assign_org_watchlist: 'Add org to watchlist',
  block_expansion_for_org: 'Block expansion',
  refresh_regression_coverage: 'Refresh regression coverage',
};

const CONFIDENCE_COLORS = {
  high:   'text-teal-300 bg-teal-500/10 border-teal-500/30',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  low:    'text-gray-400 bg-gray-800 border-gray-700',
};

const URGENCY_COLORS = {
  high:   'border-red-500/30 bg-red-500/5',
  medium: 'border-orange-500/30 bg-orange-500/5',
  low:    'border-amber-500/30 bg-amber-500/5',
  none:   'border-gray-800 bg-gray-900',
};

export default function PlumbingHandlingRecommendationPanel({
  handlingPath,
  scoringResult,
}: PlumbingHandlingRecommendationPanelProps) {
  const PrimaryIcon = ACTION_ICONS[handlingPath.primaryAction] ?? Shield;
  const urgencyBorder = URGENCY_COLORS[handlingPath.recommendation.urgency];

  return (
    <div className={`border rounded-xl overflow-hidden ${urgencyBorder}`}>
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Handling Recommendation</h2>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE_COLORS[handlingPath.confidenceLevel]}`}>
            {handlingPath.confidenceLevel} confidence
          </span>
          <span className="text-[10px] text-gray-500">Score: {scoringResult.riskScore.toFixed(0)}/100</span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
          <PrimaryIcon className="w-5 h-5 text-white shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-white">
              {ACTION_LABELS[handlingPath.primaryAction]}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">Primary recommended action (advisory)</div>
          </div>
          {handlingPath.secondaryActions.length > 0 && (
            <ArrowRight className="w-4 h-4 text-gray-600" />
          )}
        </div>

        {handlingPath.secondaryActions.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-500 mb-1.5">Secondary actions</div>
            <div className="flex flex-wrap gap-2">
              {handlingPath.secondaryActions.map((action) => {
                const Icon = ACTION_ICONS[action] ?? Shield;
                return (
                  <div key={action} className="flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300">
                    <Icon className="w-3 h-3" />
                    {ACTION_LABELS[action]}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] text-gray-500 mb-1.5">Justification</div>
          <ul className="space-y-1">
            {handlingPath.justification.map((j, i) => (
              <li key={i} className="text-xs text-gray-400 leading-relaxed flex items-start gap-1.5">
                <span className="text-gray-700 shrink-0 mt-0.5">·</span>
                {j}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
