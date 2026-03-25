import type { RiskScoringResult, HandlingRecommendation, RoutingRecommendation } from './riskTypes';
import type { PatternMatchResult } from './matchKnownPatterns';

export type HandlingAction =
  | 'proceed_normally'
  | 'run_shadow_compare'
  | 'review_discrepancy_after_parse'
  | 'assign_org_watchlist'
  | 'block_expansion_for_org'
  | 'refresh_regression_coverage';

export interface HandlingPathResult {
  primaryAction: HandlingAction;
  secondaryActions: HandlingAction[];
  recommendation: HandlingRecommendation;
  justification: string[];
  confidenceLevel: 'high' | 'medium' | 'low';
  riskScore: number;
}

const ROUTING_TO_ACTION: Record<RoutingRecommendation, HandlingAction> = {
  normal_live_path:           'proceed_normally',
  shadow_compare_recommended: 'run_shadow_compare',
  shadow_only_recommended:    'run_shadow_compare',
  manual_review_recommended:  'review_discrepancy_after_parse',
  org_watchlist_recommended:  'assign_org_watchlist',
};

export function recommendHandlingPath(
  scoringResult: RiskScoringResult,
  patternMatches: PatternMatchResult[],
  opts: {
    orgHasRecentFailures?: boolean;
    orgFailureCount?: number;
    isInternalContext?: boolean;
  } = {}
): HandlingPathResult {
  const primaryAction = ROUTING_TO_ACTION[scoringResult.routingRecommendation];
  const secondaryActions: HandlingAction[] = [];
  const justification: string[] = [scoringResult.explanation];

  if (patternMatches.length > 0) {
    const bestMatch = patternMatches[0];
    justification.push(
      `Matched known failure pattern "${bestMatch.patternLabel}" (${bestMatch.occurrenceCount} occurrences, ${bestMatch.failureCount} failures).`
    );
    if (primaryAction === 'proceed_normally') {
      secondaryActions.push('review_discrepancy_after_parse');
    }
  }

  if (opts.orgHasRecentFailures && (opts.orgFailureCount ?? 0) >= 3) {
    secondaryActions.push('assign_org_watchlist');
    justification.push(`Organisation has ${opts.orgFailureCount} recent parsing failures.`);
  }

  if (scoringResult.riskTier === 'critical') {
    if (!secondaryActions.includes('refresh_regression_coverage')) {
      secondaryActions.push('refresh_regression_coverage');
    }
    justification.push('Critical risk tier — consider adding this document as a regression test case.');
  }

  if (opts.isInternalContext && scoringResult.riskTier !== 'low') {
    if (!secondaryActions.includes('run_shadow_compare') && primaryAction !== 'run_shadow_compare') {
      secondaryActions.push('run_shadow_compare');
    }
  }

  let confidenceLevel: 'high' | 'medium' | 'low';
  if (patternMatches.length > 0 && scoringResult.riskScore > 50) {
    confidenceLevel = 'high';
  } else if (scoringResult.riskFactors.length >= 3) {
    confidenceLevel = 'medium';
  } else {
    confidenceLevel = 'low';
  }

  const recommendation: HandlingRecommendation = {
    primary: scoringResult.routingRecommendation,
    alternatives: secondaryActions.map((a) => {
      const reverseMap: Record<HandlingAction, RoutingRecommendation> = {
        proceed_normally:              'normal_live_path',
        run_shadow_compare:            'shadow_compare_recommended',
        review_discrepancy_after_parse:'manual_review_recommended',
        assign_org_watchlist:          'org_watchlist_recommended',
        block_expansion_for_org:       'org_watchlist_recommended',
        refresh_regression_coverage:   'shadow_compare_recommended',
      };
      return reverseMap[a];
    }),
    reasoning: justification,
    urgency: scoringResult.riskTier === 'critical' ? 'high'
      : scoringResult.riskTier === 'high' ? 'medium'
      : scoringResult.riskTier === 'medium' ? 'low'
      : 'none',
  };

  return {
    primaryAction,
    secondaryActions,
    recommendation,
    justification,
    confidenceLevel,
    riskScore: scoringResult.riskScore,
  };
}
