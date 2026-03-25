import { supabase } from '../supabase';
import type { ImpactEvent, ImpactType, CommercialMetric, ReleaseConfidenceRecord, AggregatedMetrics, OrgRiskProfile, ReviewEfficiencyMetrics, PredictivePerformanceMetrics, ExecutiveSummary, MetricPeriod } from '../modules/parsers/plumbing/analytics/analyticsTypes';
import { aggregateImpactEvents, computeOrgRiskFromEvents, derivePeriodLabel, buildTrendData } from '../modules/parsers/plumbing/analytics/aggregateMetrics';
import { calculateReleaseConfidence } from '../modules/parsers/plumbing/analytics/calculateReleaseConfidence';
import { isOverdue } from '../modules/parsers/plumbing/review/calculateSlaDueAt';

// ─── Impact Events ────────────────────────────────────────────────────────────

export async function dbCreateImpactEvent(params: {
  sourceType: string;
  sourceId: string;
  orgId?: string;
  runId?: string;
  anomalyId?: string;
  reviewCaseId?: string;
  impactType: ImpactType;
  impactValueJson: Record<string, unknown>;
  estimatedFinancialValue?: number;
  confidenceScore?: number;
}): Promise<void> {
  await supabase.from('parser_impact_events').insert({
    module_key: 'plumbing_parser',
    source_type: params.sourceType,
    source_id: params.sourceId,
    org_id: params.orgId ?? null,
    run_id: params.runId ?? null,
    anomaly_id: params.anomalyId ?? null,
    review_case_id: params.reviewCaseId ?? null,
    impact_type: params.impactType,
    impact_value_json: params.impactValueJson,
    estimated_financial_value: params.estimatedFinancialValue ?? null,
    confidence_score: params.confidenceScore ?? 5.0,
  });
}

export async function dbGetImpactEvents(opts: {
  orgId?: string;
  impactType?: ImpactType;
  since?: Date;
  limit?: number;
} = {}): Promise<ImpactEvent[]> {
  let q = supabase
    .from('parser_impact_events')
    .select('*')
    .eq('module_key', 'plumbing_parser')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 500);

  if (opts.orgId) q = q.eq('org_id', opts.orgId);
  if (opts.impactType) q = q.eq('impact_type', opts.impactType);
  if (opts.since) q = q.gte('created_at', opts.since.toISOString());

  const { data } = await q;
  return (data ?? []) as ImpactEvent[];
}

// ─── Release Confidence ───────────────────────────────────────────────────────

export async function dbSaveReleaseConfidence(params: {
  version: string;
  regressionPassRate: number;
  anomalyRate: number;
  reviewFailureRate: number;
  predictiveAccuracy: number;
}): Promise<ReleaseConfidenceRecord> {
  const result = calculateReleaseConfidence(params);
  const { data, error } = await supabase
    .from('parser_release_confidence')
    .insert({
      module_key: 'plumbing_parser',
      version: params.version,
      regression_pass_rate: params.regressionPassRate,
      anomaly_rate: params.anomalyRate,
      review_failure_rate: params.reviewFailureRate,
      predictive_accuracy: params.predictiveAccuracy,
      confidence_score: result.confidenceScore,
      release_ready: result.releaseReady,
      signal_details_json: result.breakdown as unknown as Record<string, unknown>,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ReleaseConfidenceRecord;
}

export async function dbGetLatestReleaseConfidence(): Promise<ReleaseConfidenceRecord | null> {
  const { data } = await supabase
    .from('parser_release_confidence')
    .select('*')
    .eq('module_key', 'plumbing_parser')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as ReleaseConfidenceRecord | null;
}

export async function dbGetReleaseHistory(limit = 20): Promise<ReleaseConfidenceRecord[]> {
  const { data } = await supabase
    .from('parser_release_confidence')
    .select('*')
    .eq('module_key', 'plumbing_parser')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as ReleaseConfidenceRecord[];
}

// ─── Aggregated Metrics ───────────────────────────────────────────────────────

export async function dbGetAggregatedMetrics(period: MetricPeriod = 'rolling_30'): Promise<AggregatedMetrics> {
  const sinceMap: Record<MetricPeriod, number> = { daily: 1, weekly: 7, monthly: 30, rolling_30: 30 };
  const since = new Date();
  since.setDate(since.getDate() - sinceMap[period]);

  const [events, quotesRes] = await Promise.all([
    dbGetImpactEvents({ since, limit: 5000 }),
    supabase.from('parsing_jobs').select('id', { count: 'exact', head: true }).eq('module_key', 'plumbing_parser').gte('created_at', since.toISOString()),
  ]);

  const totalQuotes = quotesRes.count ?? events.length;
  return aggregateImpactEvents(events, period, totalQuotes);
}

// ─── Org Risk ─────────────────────────────────────────────────────────────────

function riskTier(totalRisk: number, eventCount: number): OrgRiskProfile['riskTier'] {
  if (totalRisk > 100000 || eventCount > 20) return 'critical';
  if (totalRisk > 25000 || eventCount > 10) return 'high';
  if (totalRisk > 5000 || eventCount > 3) return 'medium';
  return 'low';
}

export async function dbGetOrgRiskProfiles(): Promise<OrgRiskProfile[]> {
  const events = await dbGetImpactEvents({ limit: 5000 });
  const orgMap = computeOrgRiskFromEvents(events);

  return Array.from(orgMap.entries())
    .filter(([orgId]) => orgId !== '__unknown__')
    .map(([orgId, data]) => ({
      orgId,
      totalQuotes: 0,
      totalRiskPrevented: data.totalRisk,
      anomalyRate: 0,
      avgRiskScore: data.totalRisk / data.eventCount,
      reviewFrequency: data.eventCount,
      commonIssues: Array.from(data.types),
      riskTier: riskTier(data.totalRisk, data.eventCount),
      lastActivity: data.lastEvent,
    }))
    .sort((a, b) => b.totalRiskPrevented - a.totalRiskPrevented);
}

export async function dbGetOrgImpactEvents(orgId: string): Promise<ImpactEvent[]> {
  return dbGetImpactEvents({ orgId, limit: 200 });
}

// ─── Review Efficiency ────────────────────────────────────────────────────────

export async function dbGetReviewEfficiencyMetrics(): Promise<ReviewEfficiencyMetrics> {
  const [casesRes, decisionsRes] = await Promise.all([
    supabase.from('parser_review_cases').select('case_status, sla_due_at, created_at, updated_at').eq('module_key', 'plumbing_parser').limit(500),
    supabase.from('parser_review_decisions').select('decision_type').limit(500),
  ]);

  const cases = (casesRes.data ?? []) as Array<{ case_status: string; sla_due_at: string | null; created_at: string; updated_at: string }>;
  const decisions = (decisionsRes.data ?? []) as Array<{ decision_type: string }>;

  const openStatuses = ['new', 'queued', 'assigned', 'in_review', 'awaiting_approval'];
  const openCases = cases.filter((c) => openStatuses.includes(c.case_status));
  const completedCases = cases.filter((c) => c.case_status === 'completed');
  const overdueCases = openCases.filter((c) => isOverdue(c.sla_due_at));

  const avgTurnaround = completedCases.length > 0
    ? completedCases.reduce((sum, c) => sum + (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 3600000, 0) / completedCases.length
    : null;

  const slaCompliant = cases.filter((c) => c.case_status === 'completed' && !isOverdue(c.sla_due_at));
  const slaComplianceRate = cases.length > 0 ? (slaCompliant.length / cases.length) * 100 : 100;

  const decisionDist: Record<string, number> = {};
  for (const d of decisions) {
    decisionDist[d.decision_type] = (decisionDist[d.decision_type] ?? 0) + 1;
  }

  const correctionCount = (decisionDist['needs_rule_change'] ?? 0) + (decisionDist['needs_manual_correction_pattern'] ?? 0);
  const correctionEffectivenessRate = decisions.length > 0 ? (correctionCount / decisions.length) * 100 : 0;

  return {
    avgTurnaroundHours: avgTurnaround !== null ? Math.round(avgTurnaround * 10) / 10 : null,
    slaComplianceRate: Math.round(slaComplianceRate * 10) / 10,
    backlogSize: openCases.length,
    decisionDistribution: decisionDist,
    correctionEffectivenessRate: Math.round(correctionEffectivenessRate * 10) / 10,
    overdueRate: openCases.length > 0 ? Math.round((overdueCases.length / openCases.length) * 1000) / 10 : 0,
  };
}

// ─── Predictive Performance ───────────────────────────────────────────────────

export async function dbGetPredictivePerformanceMetrics(): Promise<PredictivePerformanceMetrics> {
  const decisionsRes = await supabase
    .from('parser_review_decisions')
    .select('decision_type')
    .in('decision_type', ['false_positive_alert', 'false_negative_alert', 'confirm_shadow_better', 'confirm_live_better'])
    .limit(500);

  const decisions = (decisionsRes.data ?? []) as Array<{ decision_type: string }>;
  const totalPredictions = decisions.length;

  const falsePositives = decisions.filter((d) => d.decision_type === 'false_positive_alert').length;
  const falseNegatives = decisions.filter((d) => d.decision_type === 'false_negative_alert').length;
  const confirmedRisk = decisions.filter((d) => d.decision_type === 'confirm_shadow_better').length;

  const correctDecisions = totalPredictions - falsePositives - falseNegatives;
  const precision = totalPredictions > 0 ? Math.round((correctDecisions / totalPredictions) * 1000) / 10 : 100;
  const falsePositiveRate = totalPredictions > 0 ? Math.round((falsePositives / totalPredictions) * 1000) / 10 : 0;
  const falseNegativeRate = totalPredictions > 0 ? Math.round((falseNegatives / totalPredictions) * 1000) / 10 : 0;

  return {
    precision,
    recallEstimate: Math.max(0, 100 - falseNegativeRate),
    falsePositiveRate,
    falseNegativeRate,
    highRiskToActualCorrelation: confirmedRisk > 0 && totalPredictions > 0 ? Math.round((confirmedRisk / totalPredictions) * 1000) / 10 : 0,
    totalPredictions,
    confirmedHighRisk: confirmedRisk,
  };
}

// ─── Trend Data ───────────────────────────────────────────────────────────────

export async function dbGetTrendData(days = 30): Promise<Array<{ date: string; value: number; count: number }>> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const events = await dbGetImpactEvents({ since, limit: 5000 });
  return buildTrendData(events, days);
}

// ─── Executive Summary ────────────────────────────────────────────────────────

export async function dbGetExecutiveSummary(period: MetricPeriod = 'rolling_30'): Promise<ExecutiveSummary> {
  const [metrics, releaseRecord, orgs, reviewEfficiency, events] = await Promise.all([
    dbGetAggregatedMetrics(period),
    dbGetLatestReleaseConfidence(),
    dbGetOrgRiskProfiles(),
    dbGetReviewEfficiencyMetrics(),
    dbGetImpactEvents({ limit: 5000 }),
  ]);

  const highestSingle = events.reduce((max, e) => Math.max(max, e.estimated_financial_value ?? 0), 0);
  const activeOrgsAtRisk = orgs.filter((o) => o.riskTier === 'high' || o.riskTier === 'critical').length;

  const confidenceScore = releaseRecord?.confidence_score ?? 0;
  const verdict = confidenceScore >= 95 ? 'READY' : confidenceScore >= 85 ? 'CAUTION' : 'BLOCKED';

  return {
    totalFinancialRiskPrevented: metrics.totalFinancialRiskPrevented,
    totalImpactEvents: metrics.totalImpactEvents,
    highestSingleRiskEvent: highestSingle,
    currentConfidenceScore: confidenceScore,
    releaseVerdict: verdict,
    activeOrgsAtRisk,
    anomalyRateTrend: 'stable',
    reviewBacklog: reviewEfficiency.backlogSize,
    periodLabel: derivePeriodLabel(period),
  };
}
