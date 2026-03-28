export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export type BehaviourClass =
  | 'compliant'
  | 'standard'
  | 'opportunistic'
  | 'adversarial'
  | 'unreliable';

export type DecisionBasis = 'weighted_score' | 'lowest_projected_cost' | 'lowest_risk';

/**
 * The authoritative recommendation status. Only CDE may emit these values.
 * - recommended:       All gating conditions passed, clear composite leader.
 * - narrow_margin:     Leader identified but top-2 composite scores within NARROW_MARGIN_THRESHOLD.
 * - provisional:       Leader identified but one or more gating conditions not fully met.
 * - no_recommendation: Insufficient data or critical gates failed; no supplier recommended.
 */
export type RecommendationStatus =
  | 'recommended'
  | 'narrow_margin'
  | 'provisional'
  | 'no_recommendation';

export interface GatingThresholds {
  minScopeCoverageScore: number;
  minVariationResistanceScore: number;
  minConfidence: number;
  narrowMarginPoints: number;
}

export const DEFAULT_GATING_THRESHOLDS: GatingThresholds = {
  minScopeCoverageScore: 0.55,
  minVariationResistanceScore: 0.45,
  minConfidence: 0.50,
  narrowMarginPoints: 0.03,
};

export interface GatingResult {
  passed: boolean;
  failedGates: string[];
  scopeCoverageScore: number;
  variationResistanceScore: number;
  confidence: number;
  isNarrowMargin: boolean;
}

export interface CdeSupplierProfile {
  id?: string;
  projectId: string;
  supplierName: string;
  quoteId?: string;
  quotedTotal: number;
  itemCount: number;
  scopeCoveragePct: number;
  historicalVariationRate: number;
  lateDeliveryCount: number;
  rfiResponseScore: number;
  programmeRiskScore: number;
}

export interface CdeBehaviourAnalysis {
  id?: string;
  projectId: string;
  supplierName: string;
  riskTier: RiskTier;
  behaviourClass: BehaviourClass;
  confidenceScore: number;
  flags: string[];
  notes: string;
}

export interface CdeVariationExposure {
  id?: string;
  projectId: string;
  supplierName: string;
  exposureAmount: number;
  exposurePct: number;
  likelihoodScore: number;
  categoryBreakdown: Record<string, number>;
}

export interface CdeCostProjection {
  id?: string;
  projectId: string;
  supplierName: string;
  quotedTotal: number;
  projectedTotal: number;
  contingencyApplied: number;
  riskPremium: number;
  confidenceBandLow: number;
  confidenceBandHigh: number;
  projectionBasis: string;
}

export interface CdeRankedSupplier {
  rank: number;
  supplierName: string;
  compositeScore: number;
  quotedTotal: number;
  projectedTotal: number;
  riskTier: RiskTier;
  behaviourClass: BehaviourClass;
  variationExposure: number;
  scopeCoverage: number;
  scoreBreakdown: {
    cost: number;
    behaviour: number;
    scope: number;
    variation: number;
    programme: number;
  };
}

export interface CdeDecisionState {
  projectId: string;
  runId: string;
  suppliers: CdeRankedSupplier[];
  recommendedSupplier: string | null;
  runnerUpSupplier: string | null;
  recommendationStatus: RecommendationStatus;
  decisionBasis: DecisionBasis;
  overallConfidence: number;
  justification: string;
  gating: GatingResult;
  generatedAt: string;
}

export interface CdeWeights {
  cost: number;
  behaviour: number;
  scope: number;
  variation: number;
  programme: number;
}

export const DEFAULT_CDE_WEIGHTS: CdeWeights = {
  cost: 0.35,
  behaviour: 0.25,
  scope: 0.20,
  variation: 0.12,
  programme: 0.08,
};
