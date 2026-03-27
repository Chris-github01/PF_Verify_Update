import { supabase } from '../../supabase';
import {
  computeVersionBenchmarkSummary,
  PROMOTION_THRESHOLD,
  REJECTION_THRESHOLD,
  CRITICAL_REGRESSION_LIMIT,
} from './benchmarkEvaluationEngine';
import { getShadowVersion, updateShadowVersionStatus } from './shadowVersioningService';

export type PromotionDecision = 'approve_candidate' | 'reject' | 'needs_review';

export interface PromotionDecisionRecord {
  id: string;
  version_id: string;
  module_key: string;
  decision: PromotionDecision;
  decision_score: number;
  risk_score: number;
  benchmark_score: number;
  financial_accuracy_score: number;
  failure_reduction_score: number;
  line_accuracy_score: number;
  consistency_score: number;
  regression_flags_json: RegressionFlag[];
  reasoning_text: string;
  run_count: number;
  baseline_version: string | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_override_decision: 'approve' | 'reject' | null;
}

export interface RegressionFlag {
  type: string;
  description: string;
  severity: 'critical' | 'high' | 'medium';
  value?: number;
}

// ---------------------------------------------------------------------------
// Core decision logic
// ---------------------------------------------------------------------------

function buildRegressionFlags(
  regressionCount: number,
  avgRisk: number,
  financialAccuracy: number,
  compositeScore: number,
): RegressionFlag[] {
  const flags: RegressionFlag[] = [];

  if (regressionCount > CRITICAL_REGRESSION_LIMIT) {
    flags.push({
      type: 'critical_failures_detected',
      description: `${regressionCount} critical failure(s) detected in benchmark runs`,
      severity: 'critical',
      value: regressionCount,
    });
  }

  if (avgRisk >= 70) {
    flags.push({
      type: 'elevated_risk_profile',
      description: `Average risk score ${avgRisk.toFixed(0)} is high — version may increase commercial risk exposure`,
      severity: avgRisk >= 85 ? 'critical' : 'high',
      value: avgRisk,
    });
  }

  if (financialAccuracy < 60) {
    flags.push({
      type: 'low_financial_accuracy',
      description: `Financial accuracy score ${financialAccuracy.toFixed(0)}% is below acceptable threshold (60%)`,
      severity: 'high',
      value: financialAccuracy,
    });
  }

  if (compositeScore < REJECTION_THRESHOLD) {
    flags.push({
      type: 'composite_score_too_low',
      description: `Composite benchmark score ${compositeScore.toFixed(0)} is below rejection threshold (${REJECTION_THRESHOLD})`,
      severity: 'critical',
      value: compositeScore,
    });
  }

  return flags;
}

function makeDecision(
  compositeScore: number,
  regressionFlags: RegressionFlag[],
  runCount: number,
): { decision: PromotionDecision; reasoning: string } {
  const criticalFlags = regressionFlags.filter((f) => f.severity === 'critical');

  if (runCount < 3) {
    return {
      decision: 'needs_review',
      reasoning: `Only ${runCount} benchmark run(s) completed — minimum 3 required for a reliable decision. Run more benchmarks before evaluation.`,
    };
  }

  if (criticalFlags.length > 0) {
    return {
      decision: 'reject',
      reasoning: `Rejected due to ${criticalFlags.length} critical regression flag(s): ${criticalFlags.map((f) => f.type).join(', ')}. Issues must be resolved before re-evaluation.`,
    };
  }

  if (compositeScore >= PROMOTION_THRESHOLD) {
    const highFlags = regressionFlags.filter((f) => f.severity === 'high');
    if (highFlags.length > 0) {
      return {
        decision: 'needs_review',
        reasoning: `Score ${compositeScore.toFixed(0)} exceeds promotion threshold but ${highFlags.length} high-severity flag(s) require human review before approval: ${highFlags.map((f) => f.type).join(', ')}.`,
      };
    }
    return {
      decision: 'approve_candidate',
      reasoning: `Composite score ${compositeScore.toFixed(0)} exceeds promotion threshold (${PROMOTION_THRESHOLD}). No critical regressions detected. Recommended for controlled rollout.`,
    };
  }

  if (compositeScore >= REJECTION_THRESHOLD) {
    return {
      decision: 'needs_review',
      reasoning: `Score ${compositeScore.toFixed(0)} is in the review range (${REJECTION_THRESHOLD}–${PROMOTION_THRESHOLD}). Improvements possible but not yet strong enough for automatic approval.`,
    };
  }

  return {
    decision: 'reject',
    reasoning: `Composite score ${compositeScore.toFixed(0)} is below rejection threshold (${REJECTION_THRESHOLD}). Version shows insufficient improvement over baseline.`,
  };
}

// ---------------------------------------------------------------------------
// Generate a promotion decision for a version
// ---------------------------------------------------------------------------
export async function generatePromotionDecision(
  versionId: string,
  baselineVersion?: string,
): Promise<PromotionDecisionRecord> {
  const version = await getShadowVersion(versionId);
  if (!version) throw new Error(`[Phase4/Decisions] Version ${versionId} not found`);

  const summary = await computeVersionBenchmarkSummary(versionId);
  if (!summary) throw new Error(`[Phase4/Decisions] Could not compute benchmark summary for ${versionId}`);

  // Fetch average risk from commercial_risk_profiles for runs in this version
  const { data: versionRunLinks } = await supabase
    .from('shadow_version_runs')
    .select('run_id')
    .eq('version_id', versionId);

  const runIds = (versionRunLinks ?? []).map((r) => r.run_id as string);
  let avgRisk = 0;

  if (runIds.length > 0) {
    const { data: riskData } = await supabase
      .from('commercial_risk_profiles')
      .select('total_risk_score')
      .in('run_id', runIds);

    if (riskData && riskData.length > 0) {
      avgRisk = riskData.reduce((s, r) => s + (r.total_risk_score ?? 0), 0) / riskData.length;
    }
  }

  const riskScore = Math.round(avgRisk);
  const regressionFlags = buildRegressionFlags(
    summary.regressionCount,
    avgRisk,
    summary.avgFinancialAccuracy,
    summary.compositeScore,
  );

  const { decision, reasoning } = makeDecision(
    summary.compositeScore,
    regressionFlags,
    summary.runCount,
  );

  // Weighted decision score
  const decisionScore = Math.round(
    summary.avgFinancialAccuracy * 0.4 +
    summary.avgPassRate * 0.3 +
    summary.avgLineAccuracy * 0.2 +
    Math.max(0, 100 - avgRisk) * 0.1,
  );

  const { data, error } = await supabase
    .from('promotion_decisions')
    .insert({
      version_id: versionId,
      module_key: version.module_key,
      decision,
      decision_score: decisionScore,
      risk_score: riskScore,
      benchmark_score: summary.compositeScore,
      financial_accuracy_score: Math.round(summary.avgFinancialAccuracy),
      failure_reduction_score: Math.round(summary.avgPassRate),
      line_accuracy_score: Math.round(summary.avgLineAccuracy),
      consistency_score: Math.round(Math.max(0, 100 - summary.avgFailureSeverity)),
      regression_flags_json: regressionFlags,
      reasoning_text: reasoning,
      run_count: summary.runCount,
      baseline_version: baselineVersion ?? null,
    })
    .select('*')
    .single();

  if (error) throw new Error(`[Phase4/Decisions] insert failed: ${error.message}`);

  // Update version status to reflect evaluation
  const newStatus = decision === 'approve_candidate' ? 'approved'
    : decision === 'reject' ? 'rejected'
    : 'testing';

  await updateShadowVersionStatus(versionId, newStatus);

  console.log(
    `[Phase4/Decisions] version=${version.version_name} module=${version.module_key} ` +
    `decision=${decision} score=${decisionScore} flags=${regressionFlags.length}`,
  );

  return data as PromotionDecisionRecord;
}

// ---------------------------------------------------------------------------
// Read decisions
// ---------------------------------------------------------------------------

export async function getPromotionDecisions(
  moduleKey?: string,
): Promise<PromotionDecisionRecord[]> {
  let q = supabase
    .from('promotion_decisions')
    .select('*')
    .order('created_at', { ascending: false });

  if (moduleKey) q = q.eq('module_key', moduleKey);

  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as PromotionDecisionRecord[];
}

export async function getLatestDecisionForVersion(
  versionId: string,
): Promise<PromotionDecisionRecord | null> {
  const { data, error } = await supabase
    .from('promotion_decisions')
    .select('*')
    .eq('version_id', versionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as PromotionDecisionRecord | null;
}

// ---------------------------------------------------------------------------
// Admin override — human-in-the-loop approval or rejection
// ---------------------------------------------------------------------------
export async function applyAdminOverride(
  decisionId: string,
  override: 'approve' | 'reject',
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('promotion_decisions')
    .update({
      admin_override_decision: override,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', decisionId);

  if (error) throw new Error(`[Phase4/Decisions] applyAdminOverride failed: ${error.message}`);

  console.log(`[Phase4/Decisions] Admin override applied: decisionId=${decisionId} override=${override}`);
}
