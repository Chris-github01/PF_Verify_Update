export interface AnomalyThresholds {
  largeTotalDeltaPercent: number;
  criticalTotalDeltaPercent: number;
  largeTotalDeltaAbsolute: number;
  criticalTotalDeltaAbsolute: number;
  tooManyRowsExcludedPercent: number;
  tooFewRowsExcludedPercent: number;
  lowConfidenceThreshold: number;
  classificationInstabilityPercent: number;
  repeatedOrgFailureCount: number;
  itemCountDivergencePercent: number;
  dailyAnomalyRateWarning: number;
  dailyAnomalyRateCritical: number;
  dailyCriticalAnomalyCount: number;
  perOrgCriticalCountAlert: number;
}

export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
  largeTotalDeltaPercent: 5,
  criticalTotalDeltaPercent: 15,
  largeTotalDeltaAbsolute: 5000,
  criticalTotalDeltaAbsolute: 25000,
  tooManyRowsExcludedPercent: 40,
  tooFewRowsExcludedPercent: 2,
  lowConfidenceThreshold: 0.5,
  classificationInstabilityPercent: 30,
  repeatedOrgFailureCount: 3,
  itemCountDivergencePercent: 25,
  dailyAnomalyRateWarning: 0.2,
  dailyAnomalyRateCritical: 0.5,
  dailyCriticalAnomalyCount: 2,
  perOrgCriticalCountAlert: 2,
};

export const ANOMALY_SEVERITY_SCORES: Record<string, number> = {
  parsed_total_exceeds_document_total: 85,
  critical_total_delta: 90,
  large_live_shadow_total_delta: 65,
  likely_duplicate_total_included: 80,
  no_document_total_detected: 30,
  too_many_rows_excluded: 55,
  too_few_rows_excluded_when_total_phrase_present: 50,
  low_confidence_summary_exclusion: 45,
  classification_instability: 60,
  parser_execution_failure: 95,
  repeated_org_failures: 75,
  run_on_known_risky_pattern: 55,
  shadow_total_zero: 70,
  live_shadow_item_count_divergence: 50,
};

export function getConfig(): AnomalyThresholds {
  return { ...DEFAULT_ANOMALY_THRESHOLDS };
}
