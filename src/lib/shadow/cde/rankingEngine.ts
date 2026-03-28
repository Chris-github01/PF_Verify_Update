import type {
  CdeSupplierProfile,
  CdeBehaviourAnalysis,
  CdeVariationExposure,
  CdeCostProjection,
  CdeRankedSupplier,
  CdeWeights,
  RiskTier,
} from './types';
import { DEFAULT_CDE_WEIGHTS } from './types';

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

function normaliseVariation(
  exposurePct: number,
  allExposurePcts: number[]
): number {
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
