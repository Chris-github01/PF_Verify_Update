export type LearningType = 'regression_failure' | 'beta_anomaly';
export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'testing' | 'tested' | 'adopted';
export type SuggestionType =
  | 'add_summary_phrase'
  | 'remove_summary_phrase'
  | 'adjust_threshold'
  | 'adjust_weighting'
  | 'add_exclusion_rule'
  | 'adjust_window';

export interface PatternSignature {
  keywords: string[];
  regexPatterns?: string[];
  amountOnly?: boolean;
  missingQty?: boolean;
  missingUnit?: boolean;
  position?: 'last_row' | 'near_end' | 'any';
  highValue?: boolean;
  shortDescription?: boolean;
  lumpSumPattern?: boolean;
  signalKeys?: string[];
}

export interface LearningEventRecord {
  id: string;
  module_key: string;
  source_type: 'regression_failure' | 'beta_anomaly' | 'manual';
  source_id: string;
  run_id?: string;
  learning_type: LearningType;
  pattern_key: string;
  pattern_signature_json: PatternSignature;
  context_json: Record<string, unknown>;
  cluster_id?: string;
  created_at: string;
}

export interface PatternClusterRecord {
  id: string;
  module_key: string;
  pattern_key: string;
  pattern_label: string;
  pattern_signature_json: PatternSignature;
  example_rows_json: Array<Record<string, unknown>>;
  occurrence_count: number;
  failure_count: number;
  last_seen_at: string;
  severity_distribution_json: { critical: number; warning: number; info: number };
  linked_suggestion_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ProposedRule {
  type: SuggestionType;
  field?: string;
  addPhrases?: string[];
  removePhrases?: string[];
  adjustField?: string;
  oldValue?: number | string;
  newValue?: number | string;
  reason?: string;
}

export interface ExpectedImpact {
  fixesPatternCount: number;
  affectsRegressionCases: number;
  estimatedFailureReduction: number;
  estimatedFalsePositiveRisk: number;
  description: string;
}

export interface RuleSuggestionRecord {
  id: string;
  module_key: string;
  suggestion_type: SuggestionType;
  pattern_key: string;
  cluster_id?: string;
  description: string;
  proposed_rule_json: ProposedRule;
  expected_impact_json: ExpectedImpact;
  confidence_score: number;
  status: SuggestionStatus;
  reviewed_at?: string;
  reviewed_by?: string;
  review_notes?: string;
  tested_rule_version_id?: string;
  created_at: string;
}

export interface RuleVersionRecord {
  id: string;
  module_key: string;
  version: string;
  label: string;
  rules_json: Record<string, unknown>;
  parent_version_id?: string;
  source_suggestion_ids: string[];
  regression_run_id?: string;
  regression_pass_rate?: number;
  is_active_shadow: boolean;
  notes?: string;
  created_at: string;
  created_by?: string;
}
