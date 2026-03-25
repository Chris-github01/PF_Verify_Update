import type {
  RiskTier,
  RiskScoringResult,
  RiskPolicyConfig,
  RoutingRecommendation,
  TierPolicyAction,
  HandlingRecommendation,
} from './riskTypes';

export const DEFAULT_CONSERVATIVE_POLICY: RiskPolicyConfig = {
  low:      { action: 'normal_live_path',           log: true,  shadowCompare: false, reviewRequired: false },
  medium:   { action: 'normal_live_path',           log: true,  shadowCompare: false, reviewRequired: false },
  high:     { action: 'shadow_compare_recommended', log: true,  shadowCompare: false, reviewRequired: false },
  critical: { action: 'manual_review_recommended',  log: true,  shadowCompare: false, reviewRequired: false },
  autoShadowRouteEnabled: false,
  autoReviewQueueEnabled: false,
  orgWatchlistEnabled: false,
  version: '1.0.0',
};

export const AGGRESSIVE_BETA_POLICY: RiskPolicyConfig = {
  low:      { action: 'normal_live_path',           log: true,  shadowCompare: false, reviewRequired: false },
  medium:   { action: 'shadow_compare_recommended', log: true,  shadowCompare: true,  reviewRequired: false },
  high:     { action: 'shadow_only_recommended',    log: true,  shadowCompare: true,  reviewRequired: false },
  critical: { action: 'manual_review_recommended',  log: true,  shadowCompare: true,  reviewRequired: true  },
  autoShadowRouteEnabled: true,
  autoReviewQueueEnabled: false,
  orgWatchlistEnabled: true,
  version: '1.0.0',
};

export function applyRiskPolicy(
  scoringResult: RiskScoringResult,
  policy: RiskPolicyConfig
): {
  tierAction: TierPolicyAction;
  effectiveRouting: RoutingRecommendation;
  shadowShouldRun: boolean;
  reviewFlagged: boolean;
  blocked: boolean;
  policyVersion: string;
} {
  const tierAction = policy[scoringResult.riskTier];

  const effectiveRouting: RoutingRecommendation = tierAction.action;
  const shadowShouldRun = policy.autoShadowRouteEnabled && tierAction.shadowCompare;
  const reviewFlagged = tierAction.reviewRequired;
  const blocked = false;

  return {
    tierAction,
    effectiveRouting,
    shadowShouldRun,
    reviewFlagged,
    blocked,
    policyVersion: policy.version,
  };
}

export function buildHandlingRecommendation(
  scoringResult: RiskScoringResult,
  policy: RiskPolicyConfig
): HandlingRecommendation {
  const { effectiveRouting, reviewFlagged } = applyRiskPolicy(scoringResult, policy);

  const reasoning: string[] = [scoringResult.explanation];
  const alternatives: RoutingRecommendation[] = [];

  if (scoringResult.riskTier === 'critical') {
    reasoning.push('Critical risk level — admin review recommended before relying on parsed output.');
    alternatives.push('shadow_compare_recommended');
  } else if (scoringResult.riskTier === 'high') {
    reasoning.push('High risk level — run shadow comparison to verify output.');
    alternatives.push('manual_review_recommended');
  } else if (scoringResult.riskTier === 'medium') {
    reasoning.push('Medium risk — monitor output and compare if discrepancies found.');
    alternatives.push('shadow_compare_recommended');
  }

  if (reviewFlagged) {
    reasoning.push('Policy requires review for this risk tier.');
  }

  const urgency = scoringResult.riskTier === 'critical' ? 'high'
    : scoringResult.riskTier === 'high' ? 'medium'
    : scoringResult.riskTier === 'medium' ? 'low'
    : 'none';

  return {
    primary: effectiveRouting,
    alternatives,
    reasoning,
    urgency,
  };
}

export function validatePolicyConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const requiredTiers: RiskTier[] = ['low', 'medium', 'high', 'critical'];
  const validActions: RoutingRecommendation[] = [
    'normal_live_path',
    'shadow_compare_recommended',
    'shadow_only_recommended',
    'manual_review_recommended',
    'org_watchlist_recommended',
  ];

  for (const tier of requiredTiers) {
    const tierConfig = config[tier] as Record<string, unknown> | undefined;
    if (!tierConfig) {
      errors.push(`Missing tier config for: ${tier}`);
      continue;
    }
    if (!validActions.includes(tierConfig.action as RoutingRecommendation)) {
      errors.push(`Invalid action for tier ${tier}: ${tierConfig.action}`);
    }
    if (typeof tierConfig.log !== 'boolean') {
      errors.push(`log must be boolean for tier ${tier}`);
    }
    if (typeof tierConfig.shadowCompare !== 'boolean') {
      errors.push(`shadowCompare must be boolean for tier ${tier}`);
    }
    if (typeof tierConfig.reviewRequired !== 'boolean') {
      errors.push(`reviewRequired must be boolean for tier ${tier}`);
    }
  }

  if (typeof config.autoShadowRouteEnabled !== 'boolean') {
    errors.push('autoShadowRouteEnabled must be boolean');
  }
  if (typeof config.autoReviewQueueEnabled !== 'boolean') {
    errors.push('autoReviewQueueEnabled must be boolean');
  }

  return { valid: errors.length === 0, errors };
}
