export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export type BehaviourClass =
  | 'compliant'
  | 'standard'
  | 'opportunistic'
  | 'adversarial'
  | 'unreliable';

export type DecisionBasis = 'weighted_score' | 'lowest_projected_cost' | 'lowest_risk';

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
  decisionBasis: DecisionBasis;
  overallConfidence: number;
  justification: string;
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
