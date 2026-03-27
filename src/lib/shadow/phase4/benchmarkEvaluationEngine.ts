import { supabase } from '../../supabase';
import {
  getShadowVersion,
  getVersionRuns,
  updateVersionRunResults,
  refreshVersionBenchmarkScore,
} from './shadowVersioningService';

export interface BenchmarkRunResult {
  versionId: string;
  runId: string;
  passRate: number;
  financialAccuracyScore: number;
  lineAccuracyScore: number;
  failureSeverityScore: number;
  regressionCount: number;
  improvementCount: number;
}

export interface BenchmarkVersionSummary {
  versionId: string;
  versionName: string;
  moduleKey: string;
  runCount: number;
  avgPassRate: number;
  avgFinancialAccuracy: number;
  avgLineAccuracy: number;
  avgFailureSeverity: number;
  compositeScore: number;
  regressionCount: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Scoring constants
// ---------------------------------------------------------------------------
const WEIGHTS = {
  financial: 0.40,
  failureReduction: 0.30,
  lineAccuracy: 0.20,
  consistency: 0.10,
};

const PROMOTION_THRESHOLD = 70;
const REJECTION_THRESHOLD = 40;
const CRITICAL_REGRESSION_LIMIT = 0;

// ---------------------------------------------------------------------------
// Evaluate a single run against a baseline version for the same module.
// The comparison uses shadow_run_diagnostics confidence_score as a proxy
// for quality since full benchmark datasets may not be available on all runs.
// ---------------------------------------------------------------------------
export async function evaluateRunForVersion(
  runId: string,
  versionId: string,
): Promise<BenchmarkRunResult> {
  const { data: diagnostics } = await supabase
    .from('shadow_run_diagnostics')
    .select('confidence_score, live_total, shadow_total, total_diff_percent')
    .eq('run_id', runId)
    .maybeSingle();

  const { data: failures } = await supabase
    .from('shadow_run_failures')
    .select('severity')
    .eq('run_id', runId);

  const { data: riskProfile } = await supabase
    .from('commercial_risk_profiles')
    .select('total_risk_score')
    .eq('run_id', runId)
    .maybeSingle();

  const confidenceScore = diagnostics?.confidence_score ?? 50;
  const totalDiffPct = Math.abs(diagnostics?.total_diff_percent ?? 0);
  const criticalFailures = (failures ?? []).filter((f) => f.severity === 'critical').length;
  const highFailures = (failures ?? []).filter((f) => f.severity === 'high').length;
  const riskScore = riskProfile?.total_risk_score ?? 50;

  // Financial accuracy: 100 when total diff = 0%, degrades with mismatch
  const financialAccuracyScore = Math.max(0, Math.round(100 - totalDiffPct * 3));

  // Line accuracy: use confidence score as proxy
  const lineAccuracyScore = Math.min(100, Math.round(confidenceScore));

  // Pass rate: proportion of non-critical failures
  const totalFailures = (failures ?? []).length;
  const passRate = totalFailures === 0
    ? 100
    : Math.round(Math.max(0, 100 - (criticalFailures * 20) - (highFailures * 8)));

  // Failure severity: weighted failure penalty
  const failureSeverityScore = Math.round(
    (criticalFailures * 40 + highFailures * 20 + Math.max(0, totalFailures - criticalFailures - highFailures) * 5)
  );

  // Count regressions (critical failures + high risk score)
  const regressionCount = criticalFailures + (riskScore >= 80 ? 1 : 0);
  const improvementCount = Math.max(0, Math.round((confidenceScore - 50) / 10));

  const result: BenchmarkRunResult = {
    versionId,
    runId,
    passRate,
    financialAccuracyScore,
    lineAccuracyScore,
    failureSeverityScore,
    regressionCount,
    improvementCount,
  };

  await updateVersionRunResults(runId, versionId, {
    passRate,
    financialAccuracyScore,
    lineAccuracyScore,
    failureSeverityScore,
    summary: { criticalFailures, highFailures, totalFailures, riskScore, confidenceScore },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Aggregate all benchmark runs for a version into a summary
// ---------------------------------------------------------------------------
export async function computeVersionBenchmarkSummary(
  versionId: string,
): Promise<BenchmarkVersionSummary | null> {
  const version = await getShadowVersion(versionId);
  if (!version) return null;

  const runs = await getVersionRuns(versionId);
  if (runs.length === 0) {
    return {
      versionId,
      versionName: version.version_name,
      moduleKey: version.module_key,
      runCount: 0,
      avgPassRate: 0,
      avgFinancialAccuracy: 0,
      avgLineAccuracy: 0,
      avgFailureSeverity: 0,
      compositeScore: 0,
      regressionCount: 0,
      status: version.status,
    };
  }

  const withScores = runs.filter((r) => r.financial_accuracy_score !== null);
  const avgPassRate = runs.reduce((s, r) => s + (r.pass_rate ?? 0), 0) / runs.length;
  const avgFinancialAccuracy = withScores.length > 0
    ? withScores.reduce((s, r) => s + (r.financial_accuracy_score ?? 0), 0) / withScores.length
    : 0;
  const avgLineAccuracy = withScores.length > 0
    ? withScores.reduce((s, r) => s + (r.line_accuracy_score ?? 0), 0) / withScores.length
    : 0;
  const avgFailureSeverity = runs.reduce((s, r) => s + (r.failure_severity_score ?? 0), 0) / runs.length;

  const compositeScore = Math.round(
    avgFinancialAccuracy * WEIGHTS.financial +
    avgPassRate * WEIGHTS.failureReduction +
    avgLineAccuracy * WEIGHTS.lineAccuracy +
    Math.max(0, 100 - avgFailureSeverity) * WEIGHTS.consistency,
  );

  const regressionCount = runs.reduce((sum, r) => {
    const summary = r.result_summary_json as { criticalFailures?: number } | null;
    return sum + (summary?.criticalFailures ?? 0);
  }, 0);

  await refreshVersionBenchmarkScore(versionId);

  return {
    versionId,
    versionName: version.version_name,
    moduleKey: version.module_key,
    runCount: runs.length,
    avgPassRate,
    avgFinancialAccuracy,
    avgLineAccuracy,
    avgFailureSeverity,
    compositeScore,
    regressionCount,
    status: version.status,
  };
}

// ---------------------------------------------------------------------------
// Compare two versions side-by-side
// ---------------------------------------------------------------------------
export async function compareVersions(
  versionIdA: string,
  versionIdB: string,
): Promise<{
  a: BenchmarkVersionSummary | null;
  b: BenchmarkVersionSummary | null;
  winner: 'a' | 'b' | 'tie' | 'insufficient_data';
  financialDelta: number;
  regressionDelta: number;
  recommendation: string;
}> {
  const [a, b] = await Promise.all([
    computeVersionBenchmarkSummary(versionIdA),
    computeVersionBenchmarkSummary(versionIdB),
  ]);

  if (!a || !b || a.runCount === 0 || b.runCount === 0) {
    return {
      a, b,
      winner: 'insufficient_data',
      financialDelta: 0,
      regressionDelta: 0,
      recommendation: 'Insufficient benchmark data to compare. Run more benchmarks.',
    };
  }

  const financialDelta = a.avgFinancialAccuracy - b.avgFinancialAccuracy;
  const regressionDelta = a.regressionCount - b.regressionCount;
  const scoreDelta = a.compositeScore - b.compositeScore;

  const winner = Math.abs(scoreDelta) < 3 ? 'tie' : scoreDelta > 0 ? 'a' : 'b';
  const recommendation = winner === 'tie'
    ? 'Both versions perform similarly. Choose based on risk profile.'
    : winner === 'a'
      ? `Version ${a.versionName} outperforms ${b.versionName} by ${scoreDelta.toFixed(0)} composite points.`
      : `Version ${b.versionName} outperforms ${a.versionName} by ${Math.abs(scoreDelta).toFixed(0)} composite points.`;

  return { a, b, winner, financialDelta, regressionDelta, recommendation };
}

// ---------------------------------------------------------------------------
// Scoring thresholds export for use in decision engine
// ---------------------------------------------------------------------------
export { PROMOTION_THRESHOLD, REJECTION_THRESHOLD, CRITICAL_REGRESSION_LIMIT };
