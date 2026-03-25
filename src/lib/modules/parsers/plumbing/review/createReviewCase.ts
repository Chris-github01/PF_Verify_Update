import type { CaseOrigin, ReviewPriority } from './reviewTypes';
import type { RiskTier } from '../predictive/riskTypes';
import { calculateReviewPriority } from './calculateReviewPriority';
import { calculateSlaDueAt } from './calculateSlaDueAt';

export interface CreateReviewCaseInput {
  sourceType: string;
  sourceId: string;
  orgId?: string;
  runId?: string;
  anomalyId?: string;
  regressionCaseResultId?: string;
  riskProfileId?: string;
  caseOrigin: CaseOrigin;
  riskTier?: RiskTier;
  anomalySeverity?: 'low' | 'medium' | 'high' | 'critical';
  isRegressionMustPass?: boolean;
  orgRecentFailureCount?: number;
  affectsBetaOrRelease?: boolean;
  riskScore?: number;
  contextSummary?: string;
  contextData?: Record<string, unknown>;
  releaseImpactNote?: string;
}

export interface ReviewCasePayload {
  module_key: string;
  source_type: string;
  source_id: string;
  org_id: string | null;
  run_id: string | null;
  anomaly_id: string | null;
  regression_case_result_id: string | null;
  risk_profile_id: string | null;
  case_origin: CaseOrigin;
  case_status: 'new';
  priority: ReviewPriority;
  priority_explanation: string;
  sla_due_at: string;
  context_summary: string;
  context_json: Record<string, unknown>;
  release_impact_note: string | null;
}

export function buildReviewCasePayload(input: CreateReviewCaseInput): ReviewCasePayload {
  const { priority, explanation, suggestedSlaDurationHours } = calculateReviewPriority({
    caseOrigin: input.caseOrigin,
    riskTier: input.riskTier,
    anomalySeverity: input.anomalySeverity,
    isRegressionMustPass: input.isRegressionMustPass,
    orgRecentFailureCount: input.orgRecentFailureCount,
    affectsBetaOrRelease: input.affectsBetaOrRelease,
    riskScore: input.riskScore,
  });

  const slaDueAt = calculateSlaDueAt(priority);

  const contextSummary = input.contextSummary
    ?? buildDefaultSummary(input.caseOrigin, input.sourceId, priority);

  return {
    module_key: 'plumbing_parser',
    source_type: input.sourceType,
    source_id: input.sourceId,
    org_id: input.orgId ?? null,
    run_id: input.runId ?? null,
    anomaly_id: input.anomalyId ?? null,
    regression_case_result_id: input.regressionCaseResultId ?? null,
    risk_profile_id: input.riskProfileId ?? null,
    case_origin: input.caseOrigin,
    case_status: 'new',
    priority,
    priority_explanation: explanation,
    sla_due_at: slaDueAt.toISOString(),
    context_summary: contextSummary,
    context_json: {
      ...(input.contextData ?? {}),
      riskTier: input.riskTier,
      riskScore: input.riskScore,
      anomalySeverity: input.anomalySeverity,
      isRegressionMustPass: input.isRegressionMustPass,
      suggestedSlaDurationHours,
    },
    release_impact_note: input.releaseImpactNote ?? null,
  };
}

function buildDefaultSummary(origin: CaseOrigin, sourceId: string, priority: ReviewPriority): string {
  const originLabel = {
    predictive: 'Predictive risk event',
    anomaly:    'Anomaly detected',
    regression: 'Regression failure',
    manual:     'Manually created',
  }[origin];
  return `${originLabel} for source ${sourceId.slice(0, 12)} — ${priority} priority.`;
}

export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  new:               ['queued', 'dismissed'],
  queued:            ['assigned', 'dismissed'],
  assigned:          ['in_review', 'queued', 'dismissed'],
  in_review:         ['awaiting_approval', 'assigned', 'dismissed'],
  awaiting_approval: ['completed', 'in_review', 'dismissed'],
  completed:         [],
  dismissed:         [],
};

export function canTransition(from: string, to: string): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
