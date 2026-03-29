export type RiskDriverCategory =
  | 'scope_omission_risk'
  | 'exclusion_density_risk'
  | 'qualification_risk'
  | 'behaviour_pattern_risk'
  | 'quantity_comparability_risk'
  | 'validation_integrity_risk'
  | 'uncertainty_risk';

export type RiskSeverity = 'minimal' | 'low' | 'moderate' | 'high' | 'critical';

export type VariationRiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export type DataQuality = 'sufficient' | 'partial' | 'insufficient';

export interface RiskDriver {
  category: RiskDriverCategory;
  score: number;
  weight: number;
  weighted_contribution: number;
  reason: string;
  severity: RiskSeverity;
  confidence_contribution: number;
}

export interface ExposureRange {
  conservative_exposure_percent: number;
  expected_exposure_percent: number;
  elevated_exposure_percent: number;
}

export interface SupplierVariationRiskResult {
  supplier_id: string;
  supplier_name: string;
  submitted_total: number;
  normalised_total: number | null;
  variation_risk_score: number;
  variation_risk_level: VariationRiskLevel;
  predicted_variation_exposure_percent: number;
  predicted_variation_exposure_value: number;
  risk_adjusted_tender_value: number;
  exposure_range: ExposureRange;
  confidence_score: number;
  data_quality: DataQuality;
  main_risk_drivers: RiskDriver[];
  risk_summary: string;
  driver_summary: string;
  exposure_summary: string;
  adjusted_position_summary: string;
  submitted_rank: number;
  risk_adjusted_rank: number;
  rank_changed: boolean;
}

export interface VariationRiskComparisonResult {
  cheapest_submitted_supplier_id: string;
  cheapest_submitted_supplier_name: string;
  cheapest_risk_adjusted_supplier_id: string;
  cheapest_risk_adjusted_supplier_name: string;
  lowest_variation_risk_supplier_id: string;
  lowest_variation_risk_supplier_name: string;
  largest_predicted_exposure_supplier_id: string;
  largest_predicted_exposure_supplier_name: string;
  biggest_cost_shift_supplier_id: string;
  biggest_cost_shift_supplier_name: string;
  biggest_cost_shift_value: number;
  recommendation_changed_after_risk_adjustment: boolean;
  original_cheapest_still_cheapest: boolean;
  comparison_summary: string;
  executive_variation_risk_summary: string;
  risk_adjusted_comparison_summary: string;
  recommendation_impact_summary: string;
  why_cheapest_may_not_be_cheapest_summary: string | null;
}

export interface VariationRiskRunResult {
  project_id: string;
  trade: string;
  supplier_results: SupplierVariationRiskResult[];
  comparison: VariationRiskComparisonResult;
  overall_data_quality: DataQuality;
  config_version: string;
  generated_at: string;
  run_by_user_id?: string;
}

export interface VariationRiskInputData {
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
  likely_variation_exposure_score: number;
  behaviour_risk_rating: 'green' | 'amber' | 'red';
  behaviour_confidence: number;
  gate_status: 'pass' | 'warn' | 'fail' | 'pending';
  document_truth_valid: boolean | null;
  quantity_comparability_valid: boolean | null;
}

export interface VariationRiskRunOptions {
  project_id: string;
  trade: string;
  suppliers: VariationRiskInputData[];
  run_by_user_id?: string;
}
