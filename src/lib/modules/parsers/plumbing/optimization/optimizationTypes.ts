export type CandidateSource = 'learning' | 'review' | 'predictive' | 'manual';
export type CandidateStatus = 'pending' | 'bundled' | 'rejected' | 'superseded';
export type BundleSize = 'small' | 'medium' | 'strategic';
export type BundleStatus = 'pending' | 'testing' | 'passed' | 'failed' | 'promoted' | 'archived';
export type RecommendationLevel = 'strong' | 'moderate' | 'experimental';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface RuleChange {
  ruleKey: string;
  changeType: 'add' | 'modify' | 'remove' | 'threshold_adjust' | 'pattern_add';
  currentValue?: unknown;
  proposedValue?: unknown;
  description: string;
  rationale: string;
  affectedFields?: string[];
}

export interface OptimizationCandidate {
  id: string;
  module_key: string;
  source: CandidateSource;
  description: string;
  rule_changes_json: { changes: RuleChange[]; metadata: Record<string, unknown> };
  originating_pattern_keys: string[];
  confidence_score: number;
  status: CandidateStatus;
  rejection_reason?: string;
  created_at: string;
}

export interface OptimizationBundle {
  id: string;
  module_key: string;
  bundle_name: string;
  bundle_size: BundleSize;
  candidate_ids: string[];
  combined_rule_changes_json: { changes: RuleChange[]; candidateCount: number; mergedAt: string };
  conflict_detected: boolean;
  conflict_notes?: string;
  status: BundleStatus;
  created_by?: string;
  created_at: string;
}

export interface OptimizationRun {
  id: string;
  module_key: string;
  bundle_id: string;
  regression_pass_rate_before: number;
  regression_pass_rate_after: number;
  anomaly_rate_before: number;
  anomaly_rate_after: number;
  financial_impact_delta: number;
  predictive_accuracy_delta: number;
  overall_score: number;
  failures_introduced: number;
  improvements_gained: number;
  safety_guard_triggered: boolean;
  safety_guard_reason?: string;
  simulation_details_json: Record<string, unknown>;
  created_at: string;
}

export interface OptimizationRanking {
  id: string;
  module_key: string;
  bundle_id: string;
  run_id?: string;
  rank_score: number;
  rank_position: number;
  recommendation_level: RecommendationLevel;
  risk_level: RiskLevel;
  component_scores_json: ComponentScores;
  promoted_to_shadow: boolean;
  promoted_to_release: boolean;
  created_at: string;
}

export interface ComponentScores {
  regressionImprovement: number;
  anomalyReduction: number;
  financialImpact: number;
  predictiveImprovement: number;
  riskPenalty: number;
}

export interface ImpactSimulation {
  accuracyDelta: number;
  anomalyRateDelta: number;
  estimatedAdditionalFinancialImpact: number;
  predictivePrecisionDelta: number;
  regressionRisk: number;
  explanation: string;
}

export interface BundleWithRun {
  bundle: OptimizationBundle;
  run?: OptimizationRun;
  ranking?: OptimizationRanking;
  candidates: OptimizationCandidate[];
}

export interface SafetyCheckResult {
  passed: boolean;
  reason?: string;
  regressionPassRateDrop?: number;
}
