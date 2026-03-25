export type RiskTier = 'low' | 'medium' | 'high' | 'critical';
export type RoutingRecommendation =
  | 'normal_live_path'
  | 'shadow_compare_recommended'
  | 'shadow_only_recommended'
  | 'manual_review_recommended'
  | 'org_watchlist_recommended';

export type RiskEventType = 'pre_parse' | 'post_parse' | 'route_decision';

export type RiskFactorKey =
  | 'final_total_phrase_present'
  | 'carried_forward_detected'
  | 'multiple_total_candidates'
  | 'amount_only_footer_rows'
  | 'high_value_outlier_rows'
  | 'low_structure_consistency'
  | 'repeated_known_bad_pattern'
  | 'org_has_recent_anomalies'
  | 'low_confidence_classification_expected'
  | 'historical_regression_match'
  | 'subtotal_phrase_detected'
  | 'high_missing_qty_ratio'
  | 'high_missing_unit_ratio'
  | 'keyword_complexity_high'
  | 'formatting_irregularity'
  | 'low_row_count'
  | 'high_row_count'
  | 'repeated_high_values'
  | 'gst_ambiguity_detected'
  | 'no_clear_line_items';

export interface RiskFactor {
  key: RiskFactorKey;
  weight: number;
  score: number;
  evidence: string;
  explanation: string;
}

export interface QuoteSignature {
  rowCount: number;
  amountOnlyRowCount: number;
  amountOnlyRatio: number;
  missingQtyCount: number;
  missingQtyRatio: number;
  missingUnitCount: number;
  missingUnitRatio: number;
  totalPhraseCount: number;
  subtotalPhraseCount: number;
  carriedForwardPhraseCount: number;
  highValueOutlierCount: number;
  repeatedHighValueCount: number;
  gstPhraseCount: number;
  endOfDocumentSummaryRatio: number;
  headerFooterDensity: number;
  keywordComplexityScore: number;
  formattingIrregularityScore: number;
  knownBadPatternMatches: string[];
  orgRecentAnomalyCount: number;
  priorHighRiskCount: number;
  rawTextSample?: string;
}

export interface RiskScoringResult {
  riskScore: number;
  riskTier: RiskTier;
  riskFactors: RiskFactor[];
  routingRecommendation: RoutingRecommendation;
  topFactorKeys: RiskFactorKey[];
  explanation: string;
}

export interface TierPolicyAction {
  action: RoutingRecommendation;
  log: boolean;
  shadowCompare: boolean;
  reviewRequired: boolean;
}

export interface RiskPolicyConfig {
  low: TierPolicyAction;
  medium: TierPolicyAction;
  high: TierPolicyAction;
  critical: TierPolicyAction;
  autoShadowRouteEnabled: boolean;
  autoReviewQueueEnabled: boolean;
  orgWatchlistEnabled: boolean;
  version: string;
}

export interface RiskProfileRecord {
  id: string;
  module_key: string;
  source_type: string;
  source_id: string;
  org_id?: string;
  quote_signature_json: QuoteSignature;
  risk_score: number;
  risk_tier: RiskTier;
  risk_factors_json: RiskFactor[];
  routing_recommendation: RoutingRecommendation;
  post_parse_enriched: boolean;
  post_parse_json: Record<string, unknown>;
  actual_outcome?: string;
  prediction_correct?: boolean;
  created_at: string;
  updated_at: string;
}

export interface RiskEventRecord {
  id: string;
  module_key: string;
  source_type: string;
  source_id: string;
  org_id?: string;
  run_id?: string;
  risk_score: number;
  risk_tier: RiskTier;
  event_type: RiskEventType;
  risk_factors_json: RiskFactor[];
  routing_decision_json: Record<string, unknown>;
  created_at: string;
}

export interface RiskPolicyRecord {
  id: string;
  module_key: string;
  policy_name: string;
  description: string;
  policy_json: RiskPolicyConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface HandlingRecommendation {
  primary: RoutingRecommendation;
  alternatives: RoutingRecommendation[];
  reasoning: string[];
  urgency: 'none' | 'low' | 'medium' | 'high';
}

export interface PredictionValidationMetrics {
  totalPredictions: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  criticalTierCorrelation: number;
  highTierCorrelation: number;
  anomaliesPrecededByHighRisk: number;
  anomaliesTotal: number;
  coverageRate: number;
}
