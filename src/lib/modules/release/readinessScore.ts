import type { ChecklistEvalResult } from './checklistEvaluator';

export type ReadinessLevel = 'not_ready' | 'nearly_ready' | 'ready';

export interface ReadinessScoreResult {
  score: number;
  level: ReadinessLevel;
  topReasons: string[];
  breakdown: ReadinessBreakdownItem[];
}

export interface ReadinessBreakdownItem {
  category: string;
  label: string;
  points: number;
  maxPoints: number;
  notes?: string;
}

export interface ReadinessInput {
  checklistResult: ChecklistEvalResult;
  betaTotalRuns: number;
  betaDurationDays: number;
  betaFailureRate: number;
  anomalyRateLast7Days: number;
  criticalAnomaliesTotal: number;
  regressionPassRate?: number;
  regressionSuiteAgeMs?: number;
  healthScore?: number;
  approvalExists: boolean;
}

export function computeReadinessScore(input: ReadinessInput): ReadinessScoreResult {
  const breakdown: ReadinessBreakdownItem[] = [];
  const reasons: string[] = [];
  let total = 0;

  function add(item: ReadinessBreakdownItem) {
    breakdown.push(item);
    total += item.points;
  }

  const checklistPoints = Math.round(
    (input.checklistResult.passCount / Math.max(input.checklistResult.totalRequired, 1)) * 30
  );
  add({
    category: 'Checklist',
    label: `Release checklist (${input.checklistResult.passCount}/${input.checklistResult.totalRequired} items)`,
    points: checklistPoints,
    maxPoints: 30,
    notes: input.checklistResult.status === 'ready' ? 'All required items passed' : `${input.checklistResult.blockedReasons.length} item(s) blocking`,
  });
  if (input.checklistResult.status !== 'ready') {
    reasons.push(`Checklist not complete: ${input.checklistResult.passCount}/${input.checklistResult.totalRequired} items passed`);
  }

  const regressionAge = input.regressionSuiteAgeMs ?? Infinity;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const regressionPoints = regressionAge < sevenDays
    ? (input.regressionPassRate != null ? Math.round(input.regressionPassRate * 20) : 10)
    : 0;
  add({
    category: 'Regression',
    label: `Regression suite (${regressionAge < sevenDays ? 'fresh' : 'stale'}, pass rate: ${((input.regressionPassRate ?? 0) * 100).toFixed(0)}%)`,
    points: regressionPoints,
    maxPoints: 20,
    notes: regressionAge > sevenDays ? 'Regression suite is stale (>7 days)' : undefined,
  });
  if (regressionAge > sevenDays) reasons.push('Regression suite is stale');

  let anomalyPoints = 20;
  if (input.criticalAnomaliesTotal > 0) {
    anomalyPoints -= Math.min(20, input.criticalAnomaliesTotal * 8);
    reasons.push(`${input.criticalAnomaliesTotal} critical anomaly events recorded`);
  }
  if (input.anomalyRateLast7Days > 0.2) {
    anomalyPoints -= 8;
    reasons.push(`High anomaly rate: ${(input.anomalyRateLast7Days * 100).toFixed(0)}%`);
  }
  anomalyPoints = Math.max(0, anomalyPoints);
  add({
    category: 'Anomaly Health',
    label: `Anomaly record (critical: ${input.criticalAnomaliesTotal}, rate: ${(input.anomalyRateLast7Days * 100).toFixed(0)}%)`,
    points: anomalyPoints,
    maxPoints: 20,
    notes: input.criticalAnomaliesTotal > 0 ? 'Critical anomalies lower readiness' : undefined,
  });

  const minRuns = 20;
  const stabilityDaysRequired = 3;
  let betaPoints = 0;
  if (input.betaTotalRuns >= minRuns) betaPoints += 10;
  else reasons.push(`Insufficient beta runs (${input.betaTotalRuns}/${minRuns})`);
  if (input.betaDurationDays >= stabilityDaysRequired) betaPoints += 5;
  if (input.betaFailureRate < 0.05) betaPoints += 5;
  else if (input.betaFailureRate > 0.1) reasons.push(`Beta failure rate elevated: ${(input.betaFailureRate * 100).toFixed(0)}%`);
  add({
    category: 'Beta Coverage',
    label: `Beta coverage (${input.betaTotalRuns} runs, ${input.betaDurationDays}d, ${(input.betaFailureRate * 100).toFixed(0)}% failure rate)`,
    points: betaPoints,
    maxPoints: 20,
    notes: input.betaTotalRuns < minRuns ? `Need ${minRuns - input.betaTotalRuns} more runs` : undefined,
  });

  let approvalPoints = 0;
  if (input.approvalExists) approvalPoints = 10;
  else reasons.push('No approval record found');
  add({
    category: 'Approval',
    label: input.approvalExists ? 'Approval record exists' : 'No approval record',
    points: approvalPoints,
    maxPoints: 10,
  });

  const finalScore = Math.max(0, Math.min(100, total));

  let level: ReadinessLevel;
  if (finalScore >= 85 && input.checklistResult.status === 'ready') level = 'ready';
  else if (finalScore >= 60) level = 'nearly_ready';
  else level = 'not_ready';

  return {
    score: finalScore,
    level,
    topReasons: reasons.slice(0, 5),
    breakdown,
  };
}

export function getReadinessLabel(level: ReadinessLevel): string {
  const map: Record<ReadinessLevel, string> = {
    not_ready: 'Not Ready',
    nearly_ready: 'Nearly Ready',
    ready: 'Ready for Promotion',
  };
  return map[level];
}
