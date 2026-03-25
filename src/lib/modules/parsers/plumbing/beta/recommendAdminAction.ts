import type { BetaHealthSummary } from './buildBetaHealthSummary';
import { getConfig } from './anomalyConfig';

export type AdminActionRecommendation =
  | 'continue_internal_beta'
  | 'continue_limited_org_beta'
  | 'pause_org_beta_for_review'
  | 'rollback_beta_to_live'
  | 'refresh_regression_suite'
  | 'review_discrepancy_cases'
  | 'expand_beta_cautiously'
  | 'insufficient_data';

export interface RecommendationResult {
  recommendation: AdminActionRecommendation;
  healthScore: number;
  healthStatus: 'healthy' | 'watch' | 'at_risk' | 'critical';
  confidence: 'high' | 'medium' | 'low';
  topReasons: string[];
  secondaryActions: AdminActionRecommendation[];
}

const MIN_SAMPLE_RUNS = 5;

export function recommendAdminAction(
  summary: BetaHealthSummary,
  regressionSuiteAgeMs?: number,
  hasApproval?: boolean
): RecommendationResult {
  const cfg = getConfig();
  const reasons: string[] = [];
  let score = 100;

  if (summary.totalRuns < MIN_SAMPLE_RUNS) {
    return {
      recommendation: 'insufficient_data',
      healthScore: 50,
      healthStatus: 'watch',
      confidence: 'low',
      topReasons: [`Only ${summary.totalRuns} beta runs recorded — need at least ${MIN_SAMPLE_RUNS} to recommend`],
      secondaryActions: [],
    };
  }

  if (!hasApproval) {
    score -= 20;
    reasons.push('No explicit approval record exists for this rollout');
  }

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (regressionSuiteAgeMs != null && regressionSuiteAgeMs > sevenDaysMs) {
    score -= 15;
    reasons.push('Regression suite is more than 7 days old');
  }

  if (summary.criticalAnomalyCount > 0) {
    const critPenalty = Math.min(40, summary.criticalAnomalyCount * 15);
    score -= critPenalty;
    reasons.push(`${summary.criticalAnomalyCount} critical anomaly event(s) detected`);
  }

  if (summary.unresolvedCriticalCount > 0) {
    score -= 15;
    reasons.push(`${summary.unresolvedCriticalCount} unresolved critical anomaly(s) require review`);
  }

  if (summary.failureRate > 0.2) {
    score -= 20;
    reasons.push(`High failure rate: ${(summary.failureRate * 100).toFixed(0)}%`);
  } else if (summary.failureRate > 0.05) {
    score -= 10;
    reasons.push(`Elevated failure rate: ${(summary.failureRate * 100).toFixed(0)}%`);
  }

  if (summary.anomalyRate > cfg.dailyAnomalyRateCritical) {
    score -= 20;
    reasons.push(`Anomaly rate critical: ${(summary.anomalyRate * 100).toFixed(0)}%`);
  } else if (summary.anomalyRate > cfg.dailyAnomalyRateWarning) {
    score -= 10;
    reasons.push(`Elevated anomaly rate: ${(summary.anomalyRate * 100).toFixed(0)}%`);
  }

  const highRiskOrgs = summary.orgRisk.filter((o) => o.healthStatus === 'critical' || o.healthStatus === 'at_risk');
  if (highRiskOrgs.length > 0) {
    score -= Math.min(15, highRiskOrgs.length * 8);
    reasons.push(`${highRiskOrgs.length} organisation(s) showing elevated risk`);
  }

  if (summary.trendDirection === 'improving' && summary.totalRuns >= 10) {
    score = Math.min(100, score + 10);
    reasons.push('Anomaly trend is improving over the period');
  } else if (summary.trendDirection === 'degrading') {
    score -= 10;
    reasons.push('Anomaly trend is worsening over the period');
  }

  const finalScore = Math.max(0, Math.min(100, score));
  let healthStatus: RecommendationResult['healthStatus'];
  if (finalScore >= 80) healthStatus = 'healthy';
  else if (finalScore >= 60) healthStatus = 'watch';
  else if (finalScore >= 35) healthStatus = 'at_risk';
  else healthStatus = 'critical';

  let recommendation: AdminActionRecommendation;
  const secondary: AdminActionRecommendation[] = [];

  if (healthStatus === 'critical' || summary.criticalAnomalyCount >= 2) {
    recommendation = 'rollback_beta_to_live';
    secondary.push('review_discrepancy_cases', 'refresh_regression_suite');
  } else if (highRiskOrgs.length > 0 && healthStatus === 'at_risk') {
    recommendation = 'pause_org_beta_for_review';
    secondary.push('review_discrepancy_cases');
  } else if (healthStatus === 'at_risk') {
    recommendation = 'review_discrepancy_cases';
    secondary.push('refresh_regression_suite');
  } else if (healthStatus === 'watch') {
    recommendation = 'continue_internal_beta';
    secondary.push('review_discrepancy_cases');
  } else if (summary.totalRuns >= 20 && healthStatus === 'healthy') {
    recommendation = 'expand_beta_cautiously';
    secondary.push('continue_limited_org_beta');
  } else {
    recommendation = 'continue_limited_org_beta';
  }

  const regressionStale = regressionSuiteAgeMs != null && regressionSuiteAgeMs > sevenDaysMs;
  if (regressionStale && !secondary.includes('refresh_regression_suite')) {
    secondary.push('refresh_regression_suite');
  }

  const confidence: RecommendationResult['confidence'] =
    summary.totalRuns >= 20 ? 'high' : summary.totalRuns >= 10 ? 'medium' : 'low';

  return {
    recommendation,
    healthScore: finalScore,
    healthStatus,
    confidence,
    topReasons: reasons.slice(0, 4),
    secondaryActions: secondary,
  };
}

export function getRecommendationLabel(rec: AdminActionRecommendation): string {
  const map: Record<AdminActionRecommendation, string> = {
    continue_internal_beta: 'Continue Internal Beta',
    continue_limited_org_beta: 'Continue Limited Org Beta',
    pause_org_beta_for_review: 'Pause Org Beta — Review Required',
    rollback_beta_to_live: 'Rollback Beta to Live',
    refresh_regression_suite: 'Refresh Regression Suite',
    review_discrepancy_cases: 'Review Discrepancy Cases',
    expand_beta_cautiously: 'Expand Beta Cautiously',
    insufficient_data: 'Insufficient Data',
  };
  return map[rec] ?? rec;
}
