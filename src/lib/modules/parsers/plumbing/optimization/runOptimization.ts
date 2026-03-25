import type { OptimizationBundle, OptimizationRun, ImpactSimulation, SafetyCheckResult } from './optimizationTypes';
import { simulateImpact } from './simulateImpact';
import { validateMergedChanges } from './mergeRules';

const SAFETY_THRESHOLDS = {
  minRegressionPassRate: 80,
  maxRegressionDrop: 5,
  maxFailuresIntroduced: 5,
};

function safetyCheck(params: {
  regressionPassRateBefore: number;
  regressionPassRateAfter: number;
  failuresIntroduced: number;
}): SafetyCheckResult {
  if (params.regressionPassRateAfter < SAFETY_THRESHOLDS.minRegressionPassRate) {
    return {
      passed: false,
      reason: `Regression pass rate would drop to ${params.regressionPassRateAfter.toFixed(1)}% — below minimum ${SAFETY_THRESHOLDS.minRegressionPassRate}%`,
      regressionPassRateDrop: params.regressionPassRateBefore - params.regressionPassRateAfter,
    };
  }
  const drop = params.regressionPassRateBefore - params.regressionPassRateAfter;
  if (drop > SAFETY_THRESHOLDS.maxRegressionDrop) {
    return {
      passed: false,
      reason: `Regression pass rate would drop by ${drop.toFixed(1)}% — exceeds maximum allowed ${SAFETY_THRESHOLDS.maxRegressionDrop}%`,
      regressionPassRateDrop: drop,
    };
  }
  if (params.failuresIntroduced > SAFETY_THRESHOLDS.maxFailuresIntroduced) {
    return {
      passed: false,
      reason: `Bundle would introduce ${params.failuresIntroduced} regression failures — exceeds maximum ${SAFETY_THRESHOLDS.maxFailuresIntroduced}`,
    };
  }
  return { passed: true };
}

export function runOptimizationSimulation(
  bundle: OptimizationBundle,
  baseline: { regressionPassRate: number; anomalyRate: number; predictiveAccuracy: number }
): Omit<OptimizationRun, 'id' | 'created_at'> {
  // Validate merged changes before running
  const validation = validateMergedChanges(bundle.combined_rule_changes_json.changes);
  if (!validation.valid) {
    return {
      module_key: 'plumbing_parser',
      bundle_id: bundle.id,
      regression_pass_rate_before: baseline.regressionPassRate,
      regression_pass_rate_after: baseline.regressionPassRate,
      anomaly_rate_before: baseline.anomalyRate,
      anomaly_rate_after: baseline.anomalyRate,
      financial_impact_delta: 0,
      predictive_accuracy_delta: 0,
      overall_score: 0,
      failures_introduced: 0,
      improvements_gained: 0,
      safety_guard_triggered: true,
      safety_guard_reason: `Validation failed: ${validation.errors.join('; ')}`,
      simulation_details_json: { validationErrors: validation.errors },
    };
  }

  // Simulate the impact of applying the bundle (isolation — never touches live parser)
  const impact: ImpactSimulation = simulateImpact(bundle);

  const regressionPassRateAfter = Math.min(100, Math.max(0, baseline.regressionPassRate + impact.accuracyDelta * 0.5));
  const anomalyRateAfter = Math.max(0, baseline.anomalyRate + impact.anomalyRateDelta);
  const failuresIntroduced = Math.max(0, Math.round(impact.regressionRisk / 10));
  const improvementsGained = Math.round((impact.accuracyDelta + Math.abs(impact.anomalyRateDelta)) * 2);

  const safety = safetyCheck({
    regressionPassRateBefore: baseline.regressionPassRate,
    regressionPassRateAfter,
    failuresIntroduced,
  });

  return {
    module_key: 'plumbing_parser',
    bundle_id: bundle.id,
    regression_pass_rate_before: baseline.regressionPassRate,
    regression_pass_rate_after: regressionPassRateAfter,
    anomaly_rate_before: baseline.anomalyRate,
    anomaly_rate_after: anomalyRateAfter,
    financial_impact_delta: impact.estimatedAdditionalFinancialImpact,
    predictive_accuracy_delta: impact.predictivePrecisionDelta,
    overall_score: 0,
    failures_introduced: failuresIntroduced,
    improvements_gained: improvementsGained,
    safety_guard_triggered: !safety.passed,
    safety_guard_reason: safety.reason,
    simulation_details_json: {
      impact,
      validation: { valid: true },
      safety,
      baseline,
    },
  };
}
