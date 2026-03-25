export type CaseOrigin = 'predictive' | 'anomaly' | 'regression' | 'manual';
export type CaseStatus =
  | 'new'
  | 'queued'
  | 'assigned'
  | 'in_review'
  | 'awaiting_approval'
  | 'completed'
  | 'dismissed';
export type ReviewPriority = 'low' | 'medium' | 'high' | 'critical';
export type DecisionType =
  | 'confirm_shadow_better'
  | 'confirm_live_better'
  | 'needs_rule_change'
  | 'needs_manual_correction_pattern'
  | 'false_positive_alert'
  | 'false_negative_alert'
  | 'escalate'
  | 'dismiss';
export type SlaEventType = 'created' | 'assigned' | 'reassigned' | 'overdue' | 'completed';
export type FeedbackType =
  | 'rule_training'
  | 'pattern_training'
  | 'regression_case_candidate'
  | 'routing_policy_candidate';

export interface ReviewCase {
  id: string;
  module_key: string;
  source_type: string;
  source_id: string;
  org_id?: string;
  run_id?: string;
  anomaly_id?: string;
  regression_case_result_id?: string;
  risk_profile_id?: string;
  case_origin: CaseOrigin;
  case_status: CaseStatus;
  priority: ReviewPriority;
  priority_explanation: string;
  sla_due_at?: string;
  context_summary: string;
  context_json: Record<string, unknown>;
  release_impact_note?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface ReviewAssignment {
  id: string;
  review_case_id: string;
  assigned_to: string;
  assigned_by: string;
  assigned_at: string;
  unassigned_at?: string;
  active: boolean;
  notes: string;
}

export interface ReviewDecision {
  id: string;
  review_case_id: string;
  decided_by: string;
  decision_type: DecisionType;
  decision_summary: string;
  decision_details_json: Record<string, unknown>;
  correction_payload_json?: CorrectionPayload;
  confidence_score?: number;
  created_at: string;
}

export interface CorrectionPayload {
  targetRowPhrase?: string;
  targetRowIndex?: number;
  targetClassification?: string;
  correctAction?: 'exclude' | 'reclassify' | 'flag_for_review' | 'create_rule' | 'create_regression';
  rationale?: string;
  ruleCandidate?: {
    phrase: string;
    matchType: 'exact' | 'contains' | 'regex';
    targetField: string;
    targetValue: string;
  };
  notes?: string;
}

export interface ReviewComment {
  id: string;
  review_case_id: string;
  author_id: string;
  comment_text: string;
  created_at: string;
}

export interface ReviewSlaEvent {
  id: string;
  review_case_id: string;
  event_type: SlaEventType;
  event_time: string;
  metadata_json: Record<string, unknown>;
}

export interface ReviewFeedback {
  id: string;
  review_case_id: string;
  module_key: string;
  feedback_type: FeedbackType;
  payload_json: Record<string, unknown>;
  applied: boolean;
  applied_at?: string;
  created_at: string;
  created_by?: string;
}

export interface PriorityResult {
  priority: ReviewPriority;
  explanation: string;
  suggestedSlaDurationHours: number;
}

export interface ReviewMetrics {
  totalCases: number;
  openCases: number;
  overdueCases: number;
  completedCases: number;
  dismissedCases: number;
  criticalCases: number;
  avgResolutionHours: number | null;
  decisionDistribution: Record<DecisionType, number>;
  feedbackGenerated: number;
  regressionCandidates: number;
  casesByOrigin: Record<CaseOrigin, number>;
  casesByPriority: Record<ReviewPriority, number>;
}
