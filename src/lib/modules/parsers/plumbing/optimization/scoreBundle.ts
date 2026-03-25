import type { OptimizationRun, ComponentScores } from './optimizationTypes';

const WEIGHTS = {
  regressionImprovement: 0.40,
  anomalyReduction:      0.25,
  financialImpact:       0.20,
  predictiveImprovement: 0.10,
  riskPenalty:           0.05,
};

const MAX_FINANCIAL_DELTA = 50000;

function regressionScore(before: number, after: number): number {
  if (after < before) return 0;
  const improvement = after - before;
  return Math.min(100, 50 + improvement * 5);
}

function anomalyScore(before: number, after: number): number {
  if (after > before) return 0;
  const reduction = before - after;
  return Math.min(100, reduction * 10);
}

function financialScore(delta: number): number {
  if (delta <= 0) return 0;
  return Math.min(100, (delta / MAX_FINANCIAL_DELTA) * 100);
}

function predictiveScore(delta: number): number {
  if (delta <= 0) return 0;
  return Math.min(100, delta * 5);
}

function riskPenaltyScore(run: OptimizationRun): number {
  let penalty = 0;
  if (run.safety_guard_triggered) penalty += 50;
  penalty += run.failures_introduced * 5;
  return Math.max(0, 100 - penalty);
}

export function scoreBundle(run: OptimizationRun): { overallScore: number; components: ComponentScores } {
  const components: ComponentScores = {
    regressionImprovement: regressionScore(run.regression_pass_rate_before, run.regression_pass_rate_after),
    anomalyReduction:      anomalyScore(run.anomaly_rate_before, run.anomaly_rate_after),
    financialImpact:       financialScore(run.financial_impact_delta),
    predictiveImprovement: predictiveScore(run.predictive_accuracy_delta),
    riskPenalty:           riskPenaltyScore(run),
  };

  const overallScore = Math.round(
    components.regressionImprovement * WEIGHTS.regressionImprovement +
    components.anomalyReduction      * WEIGHTS.anomalyReduction +
    components.financialImpact       * WEIGHTS.financialImpact +
    components.predictiveImprovement * WEIGHTS.predictiveImprovement +
    components.riskPenalty           * WEIGHTS.riskPenalty
  );

  return { overallScore: Math.min(100, Math.max(0, overallScore)), components };
}

export function deriveRecommendationLevel(score: number, safetyGuardTriggered: boolean): 'strong' | 'moderate' | 'experimental' {
  if (safetyGuardTriggered) return 'experimental';
  if (score >= 70) return 'strong';
  if (score >= 45) return 'moderate';
  return 'experimental';
}

export function deriveRiskLevel(run: OptimizationRun): 'low' | 'medium' | 'high' {
  if (run.safety_guard_triggered || run.failures_introduced > 3) return 'high';
  if (run.failures_introduced > 0) return 'medium';
  return 'low';
}
