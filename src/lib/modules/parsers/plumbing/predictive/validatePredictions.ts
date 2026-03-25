import type { RiskProfileRecord, PredictionValidationMetrics } from './riskTypes';

const HIGH_RISK_TIERS = new Set(['high', 'critical']);

export function computeValidationMetrics(
  profiles: RiskProfileRecord[]
): PredictionValidationMetrics {
  const withOutcome = profiles.filter((p) => p.actual_outcome != null);

  if (withOutcome.length === 0) {
    return {
      totalPredictions: profiles.length,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      criticalTierCorrelation: 0,
      highTierCorrelation: 0,
      anomaliesPrecededByHighRisk: 0,
      anomaliesTotal: 0,
      coverageRate: 0,
    };
  }

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let trueNegatives = 0;
  let criticalWithAnomaly = 0;
  let criticalTotal = 0;
  let highWithAnomaly = 0;
  let highTotal = 0;
  let anomaliesTotal = 0;
  let anomaliesPrecededByHighRisk = 0;

  for (const p of withOutcome) {
    const predictedHigh = HIGH_RISK_TIERS.has(p.risk_tier);
    const actualProblem = p.actual_outcome === 'anomaly' || p.actual_outcome === 'failure' || p.actual_outcome === 'discrepancy';

    if (actualProblem) anomaliesTotal++;
    if (predictedHigh && actualProblem) {
      truePositives++;
      anomaliesPrecededByHighRisk++;
    }
    if (predictedHigh && !actualProblem) falsePositives++;
    if (!predictedHigh && actualProblem) falseNegatives++;
    if (!predictedHigh && !actualProblem) trueNegatives++;

    if (p.risk_tier === 'critical') {
      criticalTotal++;
      if (actualProblem) criticalWithAnomaly++;
    }
    if (p.risk_tier === 'high') {
      highTotal++;
      if (actualProblem) highWithAnomaly++;
    }
  }

  const precision = (truePositives + falsePositives) > 0
    ? truePositives / (truePositives + falsePositives)
    : 0;

  const recall = (truePositives + falseNegatives) > 0
    ? truePositives / (truePositives + falseNegatives)
    : 0;

  const f1Score = (precision + recall) > 0
    ? 2 * (precision * recall) / (precision + recall)
    : 0;

  const criticalTierCorrelation = criticalTotal > 0 ? criticalWithAnomaly / criticalTotal : 0;
  const highTierCorrelation = highTotal > 0 ? highWithAnomaly / highTotal : 0;
  const coverageRate = anomaliesTotal > 0 ? anomaliesPrecededByHighRisk / anomaliesTotal : 0;

  return {
    totalPredictions: profiles.length,
    truePositives,
    falsePositives,
    falseNegatives,
    trueNegatives,
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1Score: Math.round(f1Score * 1000) / 1000,
    criticalTierCorrelation: Math.round(criticalTierCorrelation * 1000) / 1000,
    highTierCorrelation: Math.round(highTierCorrelation * 1000) / 1000,
    anomaliesPrecededByHighRisk,
    anomaliesTotal,
    coverageRate: Math.round(coverageRate * 1000) / 1000,
  };
}

export function getValidationVerdict(metrics: PredictionValidationMetrics): {
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'no_data';
  message: string;
} {
  if (metrics.totalPredictions === 0 || metrics.anomaliesTotal === 0) {
    return { status: 'no_data', message: 'Insufficient outcome data to validate predictions.' };
  }

  if (metrics.precision >= 0.75 && metrics.recall >= 0.70) {
    return {
      status: 'excellent',
      message: `Excellent — ${(metrics.precision * 100).toFixed(0)}% precision, ${(metrics.recall * 100).toFixed(0)}% recall. Risk predictor is highly reliable.`,
    };
  }
  if (metrics.precision >= 0.60 && metrics.recall >= 0.55) {
    return {
      status: 'good',
      message: `Good — ${(metrics.precision * 100).toFixed(0)}% precision. Most high-risk predictions are valid.`,
    };
  }
  if (metrics.precision >= 0.40 || metrics.recall >= 0.40) {
    return {
      status: 'fair',
      message: 'Fair — consider tuning risk factor weights or thresholds to reduce false positives.',
    };
  }
  return {
    status: 'poor',
    message: 'Poor prediction quality. Review risk factor weights and signature extraction accuracy.',
  };
}
