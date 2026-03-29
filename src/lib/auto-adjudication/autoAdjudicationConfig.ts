export const AUTO_ADJUDICATION_CONFIG_VERSION = 'v1.0.0';

export const SCORE_WEIGHTS = {
  price_position: 0.20,
  scope_strength: 0.30,
  validation_integrity: 0.20,
  behaviour_trust: 0.15,
  variation_risk: 0.15,
} as const;

export const CONFIDENCE_THRESHOLDS = {
  min_for_auto_recommend: 0.72,
  min_for_recommend_with_warnings: 0.52,
  min_suppliers_for_auto: 2,
} as const;

export const HARD_STOP_THRESHOLDS = {
  min_core_scope_coverage: 0.45,
  max_excluded_scope_count: 12,
  max_risk_scope_count: 10,
  min_validation_integrity: 0.30,
  min_behaviour_trust: 0.20,
} as const;

export const CLOSE_CALL_THRESHOLDS = {
  overall_score_margin: 0.04,
  price_position_margin: 0.05,
  scope_strength_margin: 0.06,
} as const;

export const BEHAVIOUR_RISK_PENALTIES = {
  green: 1.0,
  amber: 0.82,
  red: 0.55,
} as const;

export const GATE_STATUS_ELIGIBILITY = {
  pass: { can_auto_recommend: true, can_recommend_with_warnings: true },
  warn: { can_auto_recommend: false, can_recommend_with_warnings: true },
  fail: { can_auto_recommend: false, can_recommend_with_warnings: false },
  pending: { can_auto_recommend: false, can_recommend_with_warnings: false },
} as const;

export const VARIATION_RISK_REFERENCE_MAX = 0.35;
export const SCOPE_COVERAGE_WARN_THRESHOLD = 0.70;
export const SCOPE_COVERAGE_FAIL_THRESHOLD = 0.55;
