import type { CaseOrigin, ReviewPriority, PriorityResult } from './reviewTypes';
import type { RiskTier } from '../predictive/riskTypes';

interface PriorityInput {
  caseOrigin: CaseOrigin;
  riskTier?: RiskTier;
  anomalySeverity?: 'low' | 'medium' | 'high' | 'critical';
  isRegressionMustPass?: boolean;
  orgRecentFailureCount?: number;
  affectsBetaOrRelease?: boolean;
  riskScore?: number;
}

const SLA_HOURS: Record<ReviewPriority, number> = {
  critical: 4,
  high:     8,
  medium:   48,
  low:      120,
};

function computeScore(input: PriorityInput): number {
  let score = 0;

  // Origin base score
  if (input.caseOrigin === 'regression') score += 40;
  else if (input.caseOrigin === 'anomaly') score += 30;
  else if (input.caseOrigin === 'predictive') score += 15;
  else score += 5;

  // Risk tier
  if (input.riskTier === 'critical') score += 35;
  else if (input.riskTier === 'high') score += 25;
  else if (input.riskTier === 'medium') score += 10;

  // Anomaly severity
  if (input.anomalySeverity === 'critical') score += 30;
  else if (input.anomalySeverity === 'high') score += 20;
  else if (input.anomalySeverity === 'medium') score += 10;

  // Must-pass regression failure is always elevated
  if (input.isRegressionMustPass) score += 40;

  // Beta/release impact
  if (input.affectsBetaOrRelease) score += 20;

  // Org with repeated failures
  if ((input.orgRecentFailureCount ?? 0) >= 3) score += 15;
  else if ((input.orgRecentFailureCount ?? 0) >= 1) score += 7;

  return score;
}

function derivePriority(score: number): ReviewPriority {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

function buildExplanation(input: PriorityInput, priority: ReviewPriority): string {
  const parts: string[] = [];
  if (input.isRegressionMustPass) parts.push('must-pass regression failure');
  if (input.riskTier === 'critical' || input.riskTier === 'high') parts.push(`${input.riskTier} risk tier`);
  if (input.anomalySeverity === 'critical' || input.anomalySeverity === 'high') parts.push(`${input.anomalySeverity} anomaly severity`);
  if (input.affectsBetaOrRelease) parts.push('affects beta/release state');
  if ((input.orgRecentFailureCount ?? 0) >= 3) parts.push(`org has ${input.orgRecentFailureCount} recent failures`);
  if (parts.length === 0) parts.push(`${input.caseOrigin} origin`);
  return `${priority.charAt(0).toUpperCase() + priority.slice(1)} priority — ${parts.join(', ')}.`;
}

export function calculateReviewPriority(input: PriorityInput): PriorityResult {
  const score = computeScore(input);
  const priority = derivePriority(score);
  return {
    priority,
    explanation: buildExplanation(input, priority),
    suggestedSlaDurationHours: SLA_HOURS[priority],
  };
}
