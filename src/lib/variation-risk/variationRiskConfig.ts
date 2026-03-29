export const VARIATION_RISK_CONFIG_VERSION = 'v1.0.0';

export const RISK_DRIVER_WEIGHTS = {
  scope_omission_risk: 0.28,
  exclusion_density_risk: 0.20,
  qualification_risk: 0.15,
  behaviour_pattern_risk: 0.18,
  quantity_comparability_risk: 0.10,
  validation_integrity_risk: 0.05,
  uncertainty_risk: 0.04,
} as const;

export const RISK_SCORE_THRESHOLDS = {
  low_max: 30,
  moderate_max: 55,
  high_max: 75,
} as const;

export const EXPOSURE_BANDS = {
  low: { min: 0, max: 0.04, label: 'Low' },
  moderate: { min: 0.04, max: 0.10, label: 'Moderate' },
  high: { min: 0.10, max: 0.20, label: 'High' },
  critical: { min: 0.20, max: 0.40, label: 'Critical' },
} as const;

export const EXPOSURE_DRIVER_COEFFICIENTS = {
  scope_omission_base: 0.08,
  exclusion_per_item: 0.008,
  risk_scope_per_item: 0.006,
  unknown_scope_per_item: 0.003,
  behaviour_amber_uplift: 0.025,
  behaviour_red_uplift: 0.06,
  low_quantity_comparability_uplift: 0.02,
  invalid_document_truth_uplift: 0.015,
  max_exposure_cap: 0.40,
} as const;

export const CONFIDENCE_REDUCTIONS = {
  missing_quantity_comparability: 0.12,
  invalid_document_truth: 0.10,
  behaviour_sparse_history: 0.08,
  high_unknown_scope: 0.07,
  low_scope_confidence: 0.10,
  gate_fail: 0.05,
  gate_warn: 0.02,
} as const;

export const SCOPE_THRESHOLDS = {
  core_coverage_strong: 0.85,
  core_coverage_moderate: 0.70,
  core_coverage_weak: 0.55,
  core_coverage_critical: 0.40,
  exclusion_density_high: 8,
  exclusion_density_moderate: 4,
  risk_scope_high: 6,
  risk_scope_moderate: 3,
  unknown_scope_high: 10,
  unknown_scope_moderate: 5,
} as const;

export const BEHAVIOUR_RISK_EXPOSURE_MULTIPLIERS = {
  green: 1.0,
  amber: 1.30,
  red: 1.70,
} as const;

export const EXPOSURE_BASE_VALUE: 'submitted' | 'normalised' = 'normalised';

export const RANGE_MODEL_CONFIG = {
  conservative_reduction: 0.60,
  elevated_uplift: 1.50,
} as const;

export const COMPARISON_THRESHOLDS = {
  material_exposure_difference: 0.05,
  significant_rank_shift_points: 0.08,
} as const;

export const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  minimal: 'Minimal',
};

export const RISK_LEVEL_LABELS = {
  low: 'Low Risk',
  moderate: 'Moderate Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
} as const;
