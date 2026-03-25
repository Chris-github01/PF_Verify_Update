export type ImpactType =
  | 'duplicate_total_prevented'
  | 'incorrect_total_detected'
  | 'classification_error_prevented'
  | 'manual_review_correction'
  | 'high_risk_flagged_pre_parse';

export type MetricPeriod = 'daily' | 'weekly' | 'monthly' | 'rolling_30';

export interface ImpactEvent {
  id: string;
  module_key: string;
  source_type: string;
  source_id: string;
  org_id?: string;
  run_id?: string;
  anomaly_id?: string;
  review_case_id?: string;
  impact_type: ImpactType;
  impact_value_json: Record<string, unknown>;
  estimated_financial_value: number | null;
  confidence_score: number;
  created_at: string;
}

export interface FinancialImpactResult {
  rawDifference: number;
  confidenceWeight: number;
  estimatedImpact: number;
  explanation: string;
  impactType: ImpactType;
}

export interface CommercialMetric {
  id: string;
  module_key: string;
  org_id?: string;
  metric_type: string;
  metric_value: number;
  metric_unit: string;
  metric_context_json: Record<string, unknown>;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface ReleaseConfidenceRecord {
  id: string;
  module_key: string;
  version: string;
  regression_pass_rate: number;
  anomaly_rate: number;
  review_failure_rate: number;
  predictive_accuracy: number;
  confidence_score: number;
  release_ready: boolean;
  signal_details_json: Record<string, unknown>;
  created_at: string;
}

export type ReleaseVerdict = 'READY' | 'CAUTION' | 'BLOCKED';

export interface ReleaseConfidenceResult {
  confidenceScore: number;
  releaseReady: boolean;
  verdict: ReleaseVerdict;
  signals: {
    regressionPassRate: number;
    anomalyRate: number;
    reviewFailureRate: number;
    predictiveAccuracy: number;
  };
  breakdown: Array<{ signal: string; value: number; weight: number; contribution: number; status: 'pass' | 'warn' | 'fail' }>;
  recommendation: string;
}

export interface AggregatedMetrics {
  period: MetricPeriod;
  periodStart: Date;
  periodEnd: Date;
  totalFinancialRiskPrevented: number;
  averageRiskPerQuote: number;
  anomalyRate: number;
  duplicateTotalRate: number;
  classificationErrorRate: number;
  reviewCorrectionRate: number;
  highRiskDetectionRate: number;
  totalImpactEvents: number;
  totalQuotesProcessed: number;
  impactByType: Record<ImpactType, { count: number; totalValue: number }>;
}

export interface OrgRiskProfile {
  orgId: string;
  totalQuotes: number;
  totalRiskPrevented: number;
  anomalyRate: number;
  avgRiskScore: number;
  reviewFrequency: number;
  commonIssues: string[];
  riskTier: 'low' | 'medium' | 'high' | 'critical';
  lastActivity: string;
}

export interface ReviewEfficiencyMetrics {
  avgTurnaroundHours: number | null;
  slaComplianceRate: number;
  backlogSize: number;
  decisionDistribution: Record<string, number>;
  correctionEffectivenessRate: number;
  overdueRate: number;
}

export interface PredictivePerformanceMetrics {
  precision: number;
  recallEstimate: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  highRiskToActualCorrelation: number;
  totalPredictions: number;
  confirmedHighRisk: number;
}

export interface ExecutiveSummary {
  totalFinancialRiskPrevented: number;
  totalImpactEvents: number;
  highestSingleRiskEvent: number;
  currentConfidenceScore: number;
  releaseVerdict: ReleaseVerdict;
  activeOrgsAtRisk: number;
  anomalyRateTrend: 'improving' | 'stable' | 'worsening';
  reviewBacklog: number;
  periodLabel: string;
}
