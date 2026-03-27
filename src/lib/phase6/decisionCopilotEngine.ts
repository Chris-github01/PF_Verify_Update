import { supabase } from '../supabase';
import type { CommercialRiskLevel } from '../shadow/phase3/commercialRiskEngine';

export type CopilotEntityType = 'run' | 'candidate_improvement' | 'version';

export interface CopilotReasoning {
  what: string;
  why: string;
  next_step: string;
  data_points: string[];
}

export interface DecisionCopilotOutput {
  id: string;
  entity_type: CopilotEntityType;
  entity_id: string;
  summary_text: string;
  reasoning_json: CopilotReasoning;
  recommendation: string;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${value.toLocaleString()}`;
}

function riskLevelWord(level: CommercialRiskLevel): string {
  const map = { critical: 'critical', high: 'elevated', medium: 'moderate', low: 'low' };
  return map[level] ?? level;
}

async function generateRunCopilot(runId: string): Promise<Omit<DecisionCopilotOutput, 'id' | 'created_at' | 'updated_at'>> {
  const [riskResult, leakageResult, failuresResult] = await Promise.all([
    supabase
      .from('shadow_commercial_risk_profiles')
      .select('overall_score, risk_level, scope_score, rate_score, leakage_score')
      .eq('run_id', runId)
      .maybeSingle(),
    supabase
      .from('shadow_revenue_leakage_events')
      .select('leakage_type, estimated_value, confidence')
      .eq('run_id', runId)
      .order('estimated_value', { ascending: false })
      .limit(5),
    supabase
      .from('shadow_run_failures')
      .select('failure_code, severity')
      .eq('run_id', runId)
      .limit(5),
  ]);

  const risk = riskResult.data;
  const leakage = leakageResult.data ?? [];
  const failures = failuresResult.data ?? [];
  const level = (risk?.risk_level ?? 'low') as CommercialRiskLevel;
  const score = risk?.overall_score ?? 0;
  const totalLeakage = leakage.reduce((s, e) => s + (e.estimated_value ?? 0), 0);

  const dataPoints: string[] = [];
  if (score > 0) dataPoints.push(`Risk score: ${score}/100 (${level})`);
  if (totalLeakage > 0) dataPoints.push(`Estimated leakage: ${formatCurrency(totalLeakage)}`);
  if (leakage.length > 0) {
    const top = leakage[0];
    dataPoints.push(`Top leakage type: ${top.leakage_type?.replace(/_/g, ' ')} (${top.estimated_value ? formatCurrency(top.estimated_value) : 'unquantified'})`);
  }
  if (failures.length > 0) dataPoints.push(`Parser failures detected: ${failures.length}`);
  if ((risk?.scope_score ?? 0) > 50) dataPoints.push(`Scope risk score: ${risk?.scope_score}/100`);
  if ((risk?.rate_score ?? 0) > 50) dataPoints.push(`Rate risk score: ${risk?.rate_score}/100`);

  const riskWord = riskLevelWord(level);
  const leakageText = totalLeakage > 0 ? ` with ${formatCurrency(totalLeakage)} in estimated revenue leakage` : '';
  const failureText = failures.length > 0 ? ` and ${failures.length} parser failure${failures.length > 1 ? 's' : ''}` : '';

  const summaryText =
    level === 'low' && leakage.length === 0
      ? `This quote run shows a ${riskWord} commercial risk profile. No significant leakage events or parser issues were detected. Standard award procedures apply.`
      : `This quote run has a ${riskWord} commercial risk score of ${score}/100${leakageText}${failureText}. ` +
        (leakage.length > 0
          ? `The primary concern is ${leakage[0].leakage_type?.replace(/_/g, ' ')}. `
          : '') +
        (level === 'critical' || level === 'high'
          ? 'Senior review is recommended before proceeding.'
          : 'A standard review should capture these issues.');

  const what =
    level === 'low'
      ? 'No significant commercial risks detected in this quote run.'
      : `The run has a ${riskWord} risk level driven by ${leakage.length > 0 ? leakage.map((e) => e.leakage_type?.replace(/_/g, ' ')).join(', ') : 'parser flags'}.`;

  const why =
    totalLeakage > 0
      ? `Estimated revenue leakage of ${formatCurrency(totalLeakage)} represents potential scope or pricing gaps that could shift cost to the client if not clarified before award.`
      : level === 'low'
        ? 'No financial risk factors were identified. The quote appears to be commercially complete.'
        : 'The identified risk factors may indicate scope exclusions, rate anomalies, or document parsing ambiguity.';

  const nextStep =
    level === 'critical' ? 'Do not award. Request full clarification on all flagged items immediately.'
      : level === 'high' ? 'Escalate to senior commercial team for review before award decision.'
      : level === 'medium' ? 'Clarify flagged items with the subcontractor before awarding.'
      : 'Proceed with standard award process.';

  const recommendation =
    level === 'critical' ? 'Do not award — clarification required'
      : level === 'high' ? 'Senior review before award'
      : level === 'medium' ? 'Review before award'
      : 'Suitable for award';

  const confidence = score > 0 ? 0.85 : 0.60;

  return {
    entity_type: 'run',
    entity_id: runId,
    summary_text: summaryText,
    reasoning_json: { what, why, next_step: nextStep, data_points: dataPoints },
    recommendation,
    confidence_score: confidence,
  };
}

async function generateCandidateCopilot(candidateId: string): Promise<Omit<DecisionCopilotOutput, 'id' | 'created_at' | 'updated_at'>> {
  const { data: candidate } = await supabase
    .from('phase5_candidate_improvements')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();

  const { data: sim } = await supabase
    .from('phase5_simulations')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const improved = sim?.improved_count ?? 0;
  const regressed = sim?.regressed_count ?? 0;
  const financialDelta = sim?.financial_delta ?? 0;
  const passed = sim?.passed_threshold ?? false;
  const clusterType = candidate?.cluster_type ?? 'unknown';
  const benefitScore = candidate?.benefit_score ?? 0;
  const status = candidate?.status ?? 'pending';

  const dataPoints: string[] = [];
  dataPoints.push(`Cluster type: ${clusterType.replace(/_/g, ' ')}`);
  dataPoints.push(`Benefit score: ${benefitScore}/100`);
  if (sim) {
    dataPoints.push(`Simulation: ${improved} improved, ${regressed} regressed`);
    dataPoints.push(`Financial delta: ${financialDelta >= 0 ? '+' : ''}${formatCurrency(financialDelta)}`);
    dataPoints.push(`Threshold passed: ${passed ? 'Yes' : 'No'}`);
  } else {
    dataPoints.push('No simulation run yet');
  }

  const what = `This candidate improvement targets ${clusterType.replace(/_/g, ' ')} with a benefit score of ${benefitScore}/100. Current status: ${status}.`;

  const why = candidate?.why_it_helps
    ?? 'This improvement addresses a recurring pattern identified in the evidence aggregation phase. Fixing it is expected to reduce future parse failures and improve financial accuracy.';

  const nextStep = status === 'pending_simulation'
    ? 'Run a counterfactual simulation to estimate the impact of this change.'
    : status === 'accepted_for_test'
      ? 'Launch an autonomous test to create a shadow version and benchmark it.'
      : status === 'rejected'
        ? 'This candidate was rejected. Review simulation results before reconsidering.'
        : 'Review the simulation results and decide whether to accept for testing.';

  const recommendation = passed
    ? 'Accept for autonomous testing'
    : sim
      ? 'Review simulation — threshold not met'
      : 'Run simulation first';

  const summaryText = sim
    ? `This candidate targets ${clusterType.replace(/_/g, ' ')}. Simulation shows ${improved} improvements and ${regressed} regressions (net financial delta: ${financialDelta >= 0 ? '+' : ''}${formatCurrency(financialDelta)}). ${passed ? 'Threshold passed — ready for autonomous testing.' : 'Threshold not met — further review recommended.'}`
    : `This candidate targets ${clusterType.replace(/_/g, ' ')} with a benefit score of ${benefitScore}/100. No simulation has been run yet. Run a simulation to estimate the impact before proceeding.`;

  return {
    entity_type: 'candidate_improvement',
    entity_id: candidateId,
    summary_text: summaryText,
    reasoning_json: { what, why, next_step: nextStep, data_points: dataPoints },
    recommendation,
    confidence_score: sim ? 0.80 : 0.45,
  };
}

async function generateVersionCopilot(versionId: string): Promise<Omit<DecisionCopilotOutput, 'id' | 'created_at' | 'updated_at'>> {
  const { data: version } = await supabase
    .from('phase4_shadow_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();

  const { data: decision } = await supabase
    .from('phase4_promotion_decisions')
    .select('*')
    .eq('version_id', versionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const benchmarkScore = decision?.benchmark_score ?? version?.benchmark_score ?? null;
  const regressions = decision?.regression_flags_json?.length ?? 0;
  const decisionType = decision?.decision ?? 'pending';
  const versionName = version?.version_name ?? versionId.slice(0, 8);

  const dataPoints: string[] = [];
  dataPoints.push(`Version: ${versionName}`);
  if (benchmarkScore !== null) dataPoints.push(`Benchmark score: ${benchmarkScore}/100`);
  if (regressions > 0) dataPoints.push(`Regressions flagged: ${regressions}`);
  dataPoints.push(`Decision: ${decisionType}`);

  const scoreText = benchmarkScore !== null ? `${benchmarkScore}/100` : 'not yet scored';
  const what = `Version ${versionName} has a benchmark score of ${scoreText}. Decision status: ${decisionType}.`;

  const why =
    benchmarkScore === null
      ? 'This version has not been benchmarked yet. Score it against the benchmark suite to get a promotion recommendation.'
      : benchmarkScore >= 70
        ? 'Score meets the promotion threshold (≥70). This version is eligible for staged rollout to production.'
        : benchmarkScore >= 45
          ? 'Score is in the review range (45–69). Manual review is recommended before deciding on promotion.'
          : 'Score is below the rejection threshold (≤40). This version should be rejected or iterated on.';

  const nextStep =
    decisionType === 'promote' ? 'Create a rollout plan to advance this version to production.'
      : decisionType === 'reject' ? 'Review the regression flags and consider iterating on the underlying candidate.'
      : decisionType === 'review' ? 'Review benchmark breakdown and regression flags before making a promotion decision.'
      : 'Run benchmark evaluation to generate a promotion decision.';

  const recommendation =
    decisionType === 'promote' ? 'Create rollout plan'
      : decisionType === 'reject' ? 'Reject — iterate on candidate'
      : decisionType === 'review' ? 'Manual review required'
      : 'Run benchmark evaluation';

  const summaryText = benchmarkScore !== null
    ? `Version ${versionName} scored ${benchmarkScore}/100 on the benchmark suite with ${regressions} regression flag${regressions !== 1 ? 's' : ''}. ${why}`
    : `Version ${versionName} has not been benchmarked yet. ${nextStep}`;

  return {
    entity_type: 'version',
    entity_id: versionId,
    summary_text: summaryText,
    reasoning_json: { what, why, next_step: nextStep, data_points: dataPoints },
    recommendation,
    confidence_score: benchmarkScore !== null ? 0.85 : 0.40,
  };
}

export async function generateCopilotOutput(
  entityType: CopilotEntityType,
  entityId: string,
): Promise<DecisionCopilotOutput | null> {
  let payload: Omit<DecisionCopilotOutput, 'id' | 'created_at' | 'updated_at'>;

  if (entityType === 'run') {
    payload = await generateRunCopilot(entityId);
  } else if (entityType === 'candidate_improvement') {
    payload = await generateCandidateCopilot(entityId);
  } else {
    payload = await generateVersionCopilot(entityId);
  }

  const { data: existing } = await supabase
    .from('decision_copilot_outputs')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();

  if (existing?.id) {
    const { data } = await supabase
      .from('decision_copilot_outputs')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .maybeSingle();
    return data as DecisionCopilotOutput | null;
  }

  const { data } = await supabase
    .from('decision_copilot_outputs')
    .insert(payload)
    .select()
    .maybeSingle();
  return data as DecisionCopilotOutput | null;
}

export async function getCopilotOutput(
  entityType: CopilotEntityType,
  entityId: string,
): Promise<DecisionCopilotOutput | null> {
  const { data } = await supabase
    .from('decision_copilot_outputs')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();
  return data as DecisionCopilotOutput | null;
}

export async function getOrGenerateCopilotOutput(
  entityType: CopilotEntityType,
  entityId: string,
): Promise<DecisionCopilotOutput | null> {
  const existing = await getCopilotOutput(entityType, entityId);
  if (existing) return existing;
  return generateCopilotOutput(entityType, entityId);
}
