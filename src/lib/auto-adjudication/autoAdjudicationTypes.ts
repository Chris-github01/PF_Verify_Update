import type { AUTO_ADJUDICATION_CONFIG_VERSION } from './autoAdjudicationConfig';

export type FinalOutcome =
  | 'auto_recommend'
  | 'recommend_with_warnings'
  | 'manual_review_required'
  | 'blocked_no_safe_recommendation';

export type AdjudicationMode = 'auto' | 'manual_assist';

export type GateStatusValue = 'pass' | 'warn' | 'fail' | 'pending';

export interface SupplierInputData {
  supplier_id: string;
  supplier_name: string;
  submitted_total: number;
  normalised_total: number | null;
  core_scope_coverage_pct: number;
  secondary_scope_coverage_pct: number;
  excluded_scope_count: number;
  risk_scope_count: number;
  unknown_scope_count: number;
  scope_confidence_score: number;
  variation_exposure_score: number;
  behaviour_risk_rating: 'green' | 'amber' | 'red';
  behaviour_confidence: number;
  gate_status: GateStatusValue;
  document_truth_valid: boolean | null;
  quantity_comparability_valid: boolean | null;
}

export interface SupplierScoreBreakdown {
  supplier_id: string;
  supplier_name: string;
  submitted_total: number;
  normalised_total: number | null;
  gate_status: GateStatusValue;
  overall_score: number;
  price_position_score: number;
  scope_strength_score: number;
  validation_integrity_score: number;
  behaviour_trust_score: number;
  variation_risk_score: number;
  recommendation_eligible: boolean;
  rank_position: number;
  ranking_summary: string;
  ranking_reasons: string[];
  ranking_warnings: string[];
}

export interface AdjudicationNarratives {
  executive_summary: string;
  commercial_recommendation_summary: string;
  supplier_comparison_summary: string;
  why_not_cheapest_summary: string | null;
  why_recommended_summary: string;
  manual_review_summary: string | null;
}

export interface AutoAdjudicationResult {
  adjudication_mode: AdjudicationMode;
  final_outcome: FinalOutcome;
  recommended_supplier_id: string | null;
  recommended_supplier_name: string | null;
  cheapest_supplier_id: string;
  cheapest_supplier_name: string;
  adjusted_cheapest_supplier_id: string | null;
  strongest_scope_supplier_id: string | null;
  lowest_risk_supplier_id: string | null;
  recommendation_confidence_score: number;
  recommendation_summary: string;
  recommendation_reasons: string[];
  warning_reasons: string[];
  block_reasons: string[];
  manual_review_reasons: string[];
  supplier_rankings: SupplierScoreBreakdown[];
  narratives: AdjudicationNarratives;
  config_version: string;
  generated_at: string;
}

export interface AdjudicationRunOptions {
  project_id: string;
  trade: string;
  suppliers: SupplierInputData[];
  run_by_user_id?: string;
}

export interface HardStopEvaluation {
  triggered: boolean;
  reasons: string[];
  affected_suppliers: string[];
}

export interface CloseCallEvaluation {
  is_close_call: boolean;
  margin: number;
  reasons: string[];
}

export interface RawScores {
  price_position_score: number;
  scope_strength_score: number;
  validation_integrity_score: number;
  behaviour_trust_score: number;
  variation_risk_score: number;
  overall_score: number;
}
