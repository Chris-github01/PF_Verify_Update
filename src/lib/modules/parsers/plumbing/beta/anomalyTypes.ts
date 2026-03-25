export type AnomalyType =
  | 'parsed_total_exceeds_document_total'
  | 'large_live_shadow_total_delta'
  | 'likely_duplicate_total_included'
  | 'no_document_total_detected'
  | 'too_many_rows_excluded'
  | 'too_few_rows_excluded_when_total_phrase_present'
  | 'low_confidence_summary_exclusion'
  | 'classification_instability'
  | 'parser_execution_failure'
  | 'repeated_org_failures'
  | 'run_on_known_risky_pattern'
  | 'critical_total_delta'
  | 'shadow_total_zero'
  | 'live_shadow_item_count_divergence';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';
export type AnomalyResolutionStatus = 'open' | 'acknowledged' | 'resolved' | 'ignored';

export interface DetectedAnomaly {
  anomaly_type: AnomalyType;
  severity: AnomalySeverity;
  anomaly_score: number;
  title: string;
  description: string;
  evidence_json: Record<string, unknown>;
}

export interface AnomalyEventRecord {
  id: string;
  module_key: string;
  run_id?: string;
  beta_event_id?: string;
  org_id?: string;
  source_type?: string;
  source_id?: string;
  anomaly_type: AnomalyType;
  severity: AnomalySeverity;
  anomaly_score: number;
  title: string;
  description?: string;
  evidence_json: Record<string, unknown>;
  resolution_status: AnomalyResolutionStatus;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolution_notes?: string;
  created_at: string;
}

export interface BetaEventRecord {
  id: string;
  module_key: string;
  run_id?: string;
  org_id?: string;
  user_id?: string;
  source_type?: string;
  source_id?: string;
  parser_mode_used: 'live' | 'shadow';
  rollout_context?: 'internal_beta' | 'org_beta' | 'percentage_beta';
  live_version?: string;
  shadow_version?: string;
  run_status: 'completed' | 'failed' | 'partial';
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface BetaDailyMetrics {
  id: string;
  module_key: string;
  metric_date: string;
  rollout_context?: string;
  org_id?: string;
  total_runs: number;
  failed_runs: number;
  anomaly_count: number;
  critical_anomaly_count: number;
  avg_total_delta?: number;
  avg_document_delta?: number;
  avg_confidence?: number;
  shadow_better_count: number;
  live_better_count: number;
  inconclusive_count: number;
  created_at: string;
  updated_at: string;
}
