import type {
  CdeSupplierProfile,
  CdeBehaviourAnalysis,
  CdeVariationExposure,
  CdeCostProjection,
  CdeRankedSupplier,
  CdeWeights,
  RiskTier,
  GatingResult,
  GatingThresholds,
} from './types';
import { DEFAULT_CDE_WEIGHTS, DEFAULT_GATING_THRESHOLDS } from './types';

const RISK_TIER_PENALTY: Record<RiskTier, number> = {
  low: 1.0,
  medium: 0.85,
  high: 0.65,
  critical: 0.40,
};

function normaliseCost(projectedTotal: number, allProjected: number[]): number {
  const min = Math.min(...allProjected);
  const max = Math.max(...allProjected);
  if (max === min) return 1.0;
  return 1 - (projectedTotal - min) / (max - min);
}

function normaliseBehaviour(behaviourClass: string): number {
  const scores: Record<string, number> = {
    compliant: 1.0,
    standard: 0.75,
    opportunistic: 0.50,
    unreliable: 0.30,
    adversarial: 0.10,
  };
  return scores[behaviourClass] ?? 0.5;
}

function normaliseScope(scopeCoveragePct: number): number {
  return Math.min(1, Math.max(0, scopeCoveragePct / 100));
}

function normaliseVariation(exposurePct: number, allExposurePcts: number[]): number {
  const max = Math.max(...allExposurePcts, 1);
  return 1 - Math.min(1, exposurePct / max);
}

function normaliseProgramme(riskScore: number): number {
  return 1 - Math.min(1, Math.max(0, riskScore));
}

export function rankSuppliers(
  profiles: CdeSupplierProfile[],
  behaviours: CdeBehaviourAnalysis[],
  exposures: CdeVariationExposure[],
  projections: CdeCostProjection[],
  weights: CdeWeights = DEFAULT_CDE_WEIGHTS
): CdeRankedSupplier[] {
  const behaviourMap = new Map(behaviours.map((b) => [b.supplierName, b]));
  const exposureMap = new Map(exposures.map((e) => [e.supplierName, e]));
  const projectionMap = new Map(projections.map((p) => [p.supplierName, p]));

  const allProjected = profiles.map(
    (p) => projectionMap.get(p.supplierName)?.projectedTotal ?? p.quotedTotal
  );
  const allExposurePcts = profiles.map(
    (p) => exposureMap.get(p.supplierName)?.exposurePct ?? 0
  );

  const scored = profiles.map((profile) => {
    const behaviour = behaviourMap.get(profile.supplierName);
    const exposure = exposureMap.get(profile.supplierName);
    const projection = projectionMap.get(profile.supplierName);

    const projectedTotal = projection?.projectedTotal ?? profile.quotedTotal;
    const riskTier = behaviour?.riskTier ?? 'medium';
    const behaviourClass = behaviour?.behaviourClass ?? 'standard';
    const exposurePct = exposure?.exposurePct ?? 0;

    const costScore = normaliseCost(projectedTotal, allProjected);
    const behaviourScore = normaliseBehaviour(behaviourClass);
    const scopeScore = normaliseScope(profile.scopeCoveragePct);
    const variationScore = normaliseVariation(exposurePct, allExposurePcts);
    const programmeScore = normaliseProgramme(profile.programmeRiskScore);

    const rawComposite =
      costScore * weights.cost +
      behaviourScore * weights.behaviour +
      scopeScore * weights.scope +
      variationScore * weights.variation +
      programmeScore * weights.programme;

    const compositeScore = rawComposite * RISK_TIER_PENALTY[riskTier];

    return {
      supplierName: profile.supplierName,
      compositeScore: Math.round(compositeScore * 1000) / 1000,
      quotedTotal: profile.quotedTotal,
      projectedTotal,
      riskTier,
      behaviourClass,
      variationExposure: exposure?.exposureAmount ?? 0,
      scopeCoverage: profile.scopeCoveragePct,
      scoreBreakdown: {
        cost: Math.round(costScore * 100) / 100,
        behaviour: Math.round(behaviourScore * 100) / 100,
        scope: Math.round(scopeScore * 100) / 100,
        variation: Math.round(variationScore * 100) / 100,
        programme: Math.round(programmeScore * 100) / 100,
      },
    };
  });

  scored.sort((a, b) => b.compositeScore - a.compositeScore);
  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * Evaluate gating conditions for the top-ranked supplier.
 *
 * Gates:
 *   1. Scope coverage score >= minScopeCoverageScore
 *   2. Variation resistance score >= minVariationResistanceScore
 *   3. Overall confidence >= minConfidence
 *   4. Narrow margin check: top-2 composite gap <= narrowMarginPoints
 *
 * If all gates pass and margin is wide enough → 'recommended'
 * If gates pass but margin is narrow → 'narrow_margin'
 * If any gate fails but a leader exists → 'provisional'
 * If no suppliers or critical failures → 'no_recommendation'
 */
export function evaluateGating(
  ranked: CdeRankedSupplier[],
  overallConfidence: number,
  thresholds: GatingThresholds = DEFAULT_GATING_THRESHOLDS
): GatingResult {
  if (ranked.length === 0) {
    return {
      passed: false,
      failedGates: ['No suppliers available for evaluation'],
      scopeCoverageScore: 0,
      variationResistanceScore: 0,
      confidence: 0,
      isNarrowMargin: false,
    };
  }

  const top = ranked[0];
  const runnerUp = ranked[1];

  const scopeCoverageScore = top.scoreBreakdown.scope;
  const variationResistanceScore = top.scoreBreakdown.variation;
  const confidence = overallConfidence;

  const narrowMarginGap =
    runnerUp != null ? top.compositeScore - runnerUp.compositeScore : 1;
  const isNarrowMargin = narrowMarginGap <= thresholds.narrowMarginPoints;

  const failedGates: string[] = [];

  if (scopeCoverageScore < thresholds.minScopeCoverageScore) {
    failedGates.push(
      `Scope coverage score ${(scopeCoverageScore * 100).toFixed(0)}/100 is below minimum threshold of ${(thresholds.minScopeCoverageScore * 100).toFixed(0)}/100`
    );
  }

  if (variationResistanceScore < thresholds.minVariationResistanceScore) {
    failedGates.push(
      `Variation resistance score ${(variationResistanceScore * 100).toFixed(0)}/100 is below minimum threshold of ${(thresholds.minVariationResistanceScore * 100).toFixed(0)}/100`
    );
  }

  if (confidence < thresholds.minConfidence) {
    failedGates.push(
      `Overall confidence ${(confidence * 100).toFixed(0)}% is below minimum threshold of ${(thresholds.minConfidence * 100).toFixed(0)}%`
    );
  }

  if (top.riskTier === 'critical') {
    failedGates.push('Top-ranked supplier has a critical risk tier — manual review required');
  }

  const passed = failedGates.length === 0;

  return {
    passed,
    failedGates,
    scopeCoverageScore,
    variationResistanceScore,
    confidence,
    isNarrowMargin,
  };
}
