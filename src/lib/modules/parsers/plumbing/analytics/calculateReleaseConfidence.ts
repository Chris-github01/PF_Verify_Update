import type { ReleaseConfidenceResult, ReleaseVerdict } from './analyticsTypes';

interface ReleaseConfidenceInput {
  regressionPassRate: number;
  anomalyRate: number;
  reviewFailureRate: number;
  predictiveAccuracy: number;
}

const SIGNAL_WEIGHTS = {
  regressionPassRate: 0.40,
  anomalyRate:        0.25,
  reviewFailureRate:  0.20,
  predictiveAccuracy: 0.15,
};

const THRESHOLDS = {
  ready:   95,
  caution: 85,
};

function anomalyRateScore(rate: number): number {
  if (rate <= 2) return 100;
  if (rate <= 5) return 85;
  if (rate <= 10) return 65;
  if (rate <= 20) return 40;
  return 15;
}

function reviewFailureRateScore(rate: number): number {
  if (rate === 0) return 100;
  if (rate <= 5) return 90;
  if (rate <= 10) return 75;
  if (rate <= 20) return 55;
  return 25;
}

function signalStatus(value: number, threshold: number): 'pass' | 'warn' | 'fail' {
  if (value >= threshold) return 'pass';
  if (value >= threshold * 0.90) return 'warn';
  return 'fail';
}

export function calculateReleaseConfidence(input: ReleaseConfidenceInput): ReleaseConfidenceResult {
  const regressionScore = input.regressionPassRate;
  const anomalyScore = anomalyRateScore(input.anomalyRate);
  const reviewScore = reviewFailureRateScore(input.reviewFailureRate);
  const predictiveScore = input.predictiveAccuracy;

  const confidenceScore = Math.round(
    regressionScore * SIGNAL_WEIGHTS.regressionPassRate +
    anomalyScore    * SIGNAL_WEIGHTS.anomalyRate +
    reviewScore     * SIGNAL_WEIGHTS.reviewFailureRate +
    predictiveScore * SIGNAL_WEIGHTS.predictiveAccuracy
  );

  const releaseReady = confidenceScore >= THRESHOLDS.ready;
  const verdict: ReleaseVerdict = confidenceScore >= THRESHOLDS.ready
    ? 'READY'
    : confidenceScore >= THRESHOLDS.caution
    ? 'CAUTION'
    : 'BLOCKED';

  const recommendation = verdict === 'READY'
    ? 'All signals exceed release thresholds. Parser is ready for production promotion.'
    : verdict === 'CAUTION'
    ? 'Most signals are within acceptable range. Controlled release with monitoring is recommended.'
    : 'One or more signals are below the minimum threshold. Do not promote until resolved.';

  const breakdown = [
    {
      signal: 'Regression pass rate',
      value: input.regressionPassRate,
      weight: SIGNAL_WEIGHTS.regressionPassRate,
      contribution: Math.round(regressionScore * SIGNAL_WEIGHTS.regressionPassRate),
      status: signalStatus(regressionScore, 95),
    },
    {
      signal: 'Anomaly rate (inverted)',
      value: input.anomalyRate,
      weight: SIGNAL_WEIGHTS.anomalyRate,
      contribution: Math.round(anomalyScore * SIGNAL_WEIGHTS.anomalyRate),
      status: signalStatus(anomalyScore, 85),
    },
    {
      signal: 'Review failure rate (inverted)',
      value: input.reviewFailureRate,
      weight: SIGNAL_WEIGHTS.reviewFailureRate,
      contribution: Math.round(reviewScore * SIGNAL_WEIGHTS.reviewFailureRate),
      status: signalStatus(reviewScore, 85),
    },
    {
      signal: 'Predictive accuracy',
      value: input.predictiveAccuracy,
      weight: SIGNAL_WEIGHTS.predictiveAccuracy,
      contribution: Math.round(predictiveScore * SIGNAL_WEIGHTS.predictiveAccuracy),
      status: signalStatus(predictiveScore, 80),
    },
  ] as ReleaseConfidenceResult['breakdown'];

  return {
    confidenceScore,
    releaseReady,
    verdict,
    signals: {
      regressionPassRate: input.regressionPassRate,
      anomalyRate: input.anomalyRate,
      reviewFailureRate: input.reviewFailureRate,
      predictiveAccuracy: input.predictiveAccuracy,
    },
    breakdown,
    recommendation,
  };
}
