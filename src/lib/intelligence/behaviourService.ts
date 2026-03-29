import { supabase } from '../supabase';
import type {
  BehaviourProfile,
  BehaviourEvent,
  TenderSnapshot,
  SupplierScopeSummary,
  DecisionGateResult,
} from './types';
import {
  BEHAVIOUR_RISK_THRESHOLDS,
} from './scopeIntelligenceConfig';

function computeBehaviourRiskRating(
  avgCoreCoverage: number,
  avgExcludedCount: number,
  totalTenders: number,
): 'green' | 'amber' | 'red' | 'unknown' {
  if (totalTenders < 1) return 'unknown';
  if (
    avgCoreCoverage >= BEHAVIOUR_RISK_THRESHOLDS.GREEN_MIN_CORE_COVERAGE &&
    avgExcludedCount <= BEHAVIOUR_RISK_THRESHOLDS.GREEN_MAX_EXCLUSIONS
  ) return 'green';
  if (avgCoreCoverage <= BEHAVIOUR_RISK_THRESHOLDS.RED_MAX_CORE_COVERAGE ||
    avgExcludedCount >= BEHAVIOUR_RISK_THRESHOLDS.RED_MIN_EXCLUSIONS
  ) return 'red';
  return 'amber';
}

function computeTrend(
  snapshots: Array<{ coreScopeCoveragePct: number }>,
): 'improving' | 'stable' | 'deteriorating' | 'unknown' {
  if (snapshots.length < BEHAVIOUR_RISK_THRESHOLDS.MIN_TENDERS_FOR_TREND) return 'unknown';
  const half = Math.floor(snapshots.length / 2);
  const older = snapshots.slice(0, half);
  const newer = snapshots.slice(half);
  const oldAvg = older.reduce((s, x) => s + x.coreScopeCoveragePct, 0) / older.length;
  const newAvg = newer.reduce((s, x) => s + x.coreScopeCoveragePct, 0) / newer.length;
  const delta = newAvg - oldAvg;
  if (delta >= 5) return 'improving';
  if (delta <= -5) return 'deteriorating';
  return 'stable';
}

function buildTrendSummary(
  trend: string,
  avgCoreCoverage: number,
  totalTenders: number,
  supplierName: string,
): string {
  if (totalTenders === 0) return 'Insufficient historical data to build behaviour profile.';
  if (totalTenders < BEHAVIOUR_RISK_THRESHOLDS.MIN_TENDERS_FOR_TREND) {
    return `Limited history (${totalTenders} tender${totalTenders !== 1 ? 's' : ''}). Insufficient data for reliable trend analysis.`;
  }
  const coverageDesc =
    avgCoreCoverage >= 85 ? 'strong' :
    avgCoreCoverage >= 70 ? 'adequate' :
    avgCoreCoverage >= 55 ? 'below average' : 'poor';

  const trendText =
    trend === 'improving' ? 'Behaviour trend is improving.' :
    trend === 'deteriorating' ? 'Behaviour trend is deteriorating.' :
    'Behaviour is stable across recent tenders.';

  return `${supplierName} shows ${coverageDesc} average core scope coverage (${avgCoreCoverage.toFixed(0)}%) across ${totalTenders} tender(s). ${trendText}`;
}

function buildProfileSummaryText(profile: BehaviourProfile): string {
  const { totalTendersSeen, behaviourRiskRating, avgCoreScopeCoveragePct, avgVariationExposureScore, trendDirection } = profile;
  if (totalTendersSeen === 0) return 'No historical tender data available.';

  const ratingDesc = {
    green: 'Low commercial risk profile.',
    amber: 'Moderate commercial risk — some historical concerns noted.',
    red: 'Elevated commercial risk — repeated scope or exclusion issues observed.',
    unknown: 'Risk rating cannot be determined — insufficient history.',
  }[behaviourRiskRating];

  const trendDesc = trendDirection === 'improving' ? 'Performance trend is positive.' :
    trendDirection === 'deteriorating' ? 'Performance trend is declining.' : '';

  return `${ratingDesc} Average core scope coverage: ${avgCoreScopeCoveragePct.toFixed(0)}%. Variation exposure score: ${avgVariationExposureScore.toFixed(0)}/100. ${trendDesc}`.trim();
}

export async function persistBehaviourEvents(events: BehaviourEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const rows = events.map((e) => ({
      organisation_id: e.organisationId,
      project_id: e.projectId,
      supplier_name: e.supplierName,
      trade_type: e.tradeType,
      event_type: e.eventType,
      event_subtype: e.eventSubtype ?? null,
      event_payload: e.eventPayload,
      severity: e.severity,
    }));
    const { error } = await supabase.from('ci_supplier_behaviour_events').insert(rows);
    if (error) console.warn('[BehaviourService] Event insert failed:', error.message);
  } catch (err) {
    console.warn('[BehaviourService] persistBehaviourEvents error:', err);
  }
}

export async function persistTenderSnapshot(snapshot: TenderSnapshot): Promise<void> {
  try {
    const { error } = await supabase.from('ci_supplier_tender_snapshots').insert({
      organisation_id: snapshot.organisationId,
      project_id: snapshot.projectId,
      quote_id: snapshot.quoteId,
      supplier_name: snapshot.supplierName,
      trade_type: snapshot.tradeType,
      submitted_total: snapshot.submittedTotal,
      normalised_total: snapshot.normalisedTotal,
      core_scope_coverage_pct: snapshot.coreScopeCoveragePct,
      secondary_scope_coverage_pct: snapshot.secondaryScopeCoveragePct,
      excluded_scope_count: snapshot.excludedScopeCount,
      risk_scope_count: snapshot.riskScopeCount,
      unknown_scope_count: snapshot.unknownScopeCount,
      scope_confidence_score: snapshot.scopeConfidenceScore,
      likely_variation_exposure_score: snapshot.likelyVariationExposureScore,
      decision_gate_status: snapshot.decisionGateStatus,
      gate_reasons: snapshot.gateReasons,
      was_recommended: snapshot.wasRecommended,
      was_lowest_price: snapshot.wasLowestPrice,
    });
    if (error) console.warn('[BehaviourService] Snapshot insert failed:', error.message);
  } catch (err) {
    console.warn('[BehaviourService] persistTenderSnapshot error:', err);
  }
}

export async function upsertBehaviourProfile(
  organisationId: string,
  supplierName: string,
  tradeType: string,
): Promise<void> {
  try {
    const { data: snapshots, error: snapError } = await supabase
      .from('ci_supplier_tender_snapshots')
      .select('core_scope_coverage_pct, secondary_scope_coverage_pct, excluded_scope_count, risk_scope_count, unknown_scope_count, likely_variation_exposure_score, decision_gate_status, created_at')
      .eq('organisation_id', organisationId)
      .eq('supplier_name', supplierName)
      .eq('trade_type', tradeType)
      .order('created_at', { ascending: true });

    if (snapError || !snapshots || snapshots.length === 0) return;

    const n = snapshots.length;
    const avgCore = snapshots.reduce((s, x) => s + (x.core_scope_coverage_pct ?? 0), 0) / n;
    const avgSecondary = snapshots.reduce((s, x) => s + (x.secondary_scope_coverage_pct ?? 0), 0) / n;
    const avgExcluded = snapshots.reduce((s, x) => s + (x.excluded_scope_count ?? 0), 0) / n;
    const avgRisk = snapshots.reduce((s, x) => s + (x.risk_scope_count ?? 0), 0) / n;
    const avgUnknown = snapshots.reduce((s, x) => s + (x.unknown_scope_count ?? 0), 0) / n;
    const avgVariation = snapshots.reduce((s, x) => s + (x.likely_variation_exposure_score ?? 0), 0) / n;
    const redFlagCount = snapshots.filter((x) => x.decision_gate_status === 'fail').length;
    const lastTenderAt = snapshots[snapshots.length - 1].created_at;

    const riskRating = computeBehaviourRiskRating(avgCore, avgExcluded, n);
    const trend = computeTrend(snapshots.map((s) => ({ coreScopeCoveragePct: s.core_scope_coverage_pct ?? 0 })));
    const confidenceScore = Math.min((n / 10) * 100, 100);

    const trendSummary = buildTrendSummary(trend, avgCore, n, supplierName);

    const profileData = {
      organisation_id: organisationId,
      supplier_name: supplierName,
      trade_type: tradeType,
      total_tenders_seen: n,
      avg_core_scope_coverage_pct: avgCore,
      avg_secondary_scope_coverage_pct: avgSecondary,
      avg_excluded_scope_count: avgExcluded,
      avg_risk_scope_count: avgRisk,
      avg_unknown_scope_count: avgUnknown,
      avg_variation_exposure_score: avgVariation,
      historical_red_flag_count: redFlagCount,
      behaviour_risk_rating: riskRating,
      confidence_score: confidenceScore,
      trend_direction: trend,
      trend_summary: trendSummary,
      last_tender_at: lastTenderAt,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('ci_supplier_behaviour_profiles')
      .upsert(profileData, {
        onConflict: 'organisation_id,supplier_name,trade_type',
      });

    if (error) console.warn('[BehaviourService] Profile upsert failed:', error.message);
  } catch (err) {
    console.warn('[BehaviourService] upsertBehaviourProfile error:', err);
  }
}

export async function fetchBehaviourProfile(
  organisationId: string,
  supplierName: string,
  tradeType: string,
): Promise<BehaviourProfile | null> {
  try {
    const { data, error } = await supabase
      .from('ci_supplier_behaviour_profiles')
      .select('*')
      .eq('organisation_id', organisationId)
      .eq('supplier_name', supplierName)
      .eq('trade_type', tradeType)
      .maybeSingle();

    if (error || !data) return null;

    const profile: BehaviourProfile = {
      id: data.id,
      organisationId: data.organisation_id,
      supplierName: data.supplier_name,
      tradeType: data.trade_type,
      totalTendersSeen: data.total_tenders_seen,
      totalWins: data.total_wins ?? 0,
      avgCoreScopeCoveragePct: data.avg_core_scope_coverage_pct,
      avgSecondaryScopeCoveragePct: data.avg_secondary_scope_coverage_pct,
      avgExcludedScopeCount: data.avg_excluded_scope_count,
      avgRiskScopeCount: data.avg_risk_scope_count,
      avgUnknownScopeCount: data.avg_unknown_scope_count,
      avgVariationExposureScore: data.avg_variation_exposure_score,
      historicalRedFlagCount: data.historical_red_flag_count,
      behaviourRiskRating: data.behaviour_risk_rating,
      confidenceScore: data.confidence_score,
      trendDirection: data.trend_direction,
      trendSummary: data.trend_summary,
      lastTenderAt: data.last_tender_at,
    };

    profile.profileSummaryText = buildProfileSummaryText(profile);
    return profile;
  } catch (err) {
    console.warn('[BehaviourService] fetchBehaviourProfile error:', err);
    return null;
  }
}

export async function fetchRecentBehaviourEvents(
  organisationId: string,
  supplierName: string,
  tradeType: string,
  limit = 5,
): Promise<BehaviourEvent[]> {
  try {
    const { data, error } = await supabase
      .from('ci_supplier_behaviour_events')
      .select('*')
      .eq('organisation_id', organisationId)
      .eq('supplier_name', supplierName)
      .eq('trade_type', tradeType)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row) => ({
      organisationId: row.organisation_id,
      projectId: row.project_id,
      supplierName: row.supplier_name,
      tradeType: row.trade_type,
      eventType: row.event_type,
      eventSubtype: row.event_subtype,
      eventPayload: row.event_payload ?? {},
      severity: row.severity,
    }));
  } catch (err) {
    console.warn('[BehaviourService] fetchRecentBehaviourEvents error:', err);
    return [];
  }
}

export function deriveBehaviourEvents(
  scopeSummary: SupplierScopeSummary,
  gateResult: DecisionGateResult,
  organisationId: string,
  tradeType: string,
): BehaviourEvent[] {
  const events: BehaviourEvent[] = [];
  const base = {
    organisationId,
    projectId: scopeSummary.projectId,
    supplierName: scopeSummary.supplierName,
    tradeType,
  };

  if (scopeSummary.coreScope.coveragePct < 65) {
    events.push({
      ...base,
      eventType: 'low_core_scope_coverage',
      eventPayload: { coveragePct: scopeSummary.coreScope.coveragePct },
      severity: 'critical',
    });
  }

  if (scopeSummary.excludedScopeCount >= 5) {
    events.push({
      ...base,
      eventType: 'high_exclusion_density',
      eventPayload: { count: scopeSummary.excludedScopeCount },
      severity: 'warning',
    });
  }

  if (scopeSummary.riskScopeCount >= 4) {
    events.push({
      ...base,
      eventType: 'high_risk_scope_density',
      eventPayload: { count: scopeSummary.riskScopeCount },
      severity: 'warning',
    });
  }

  if (gateResult.gateStatus === 'fail') {
    events.push({
      ...base,
      eventType: 'failed_decision_gate',
      eventPayload: { gateStatus: gateResult.gateStatus, reasons: gateResult.gateReasons.map((r) => r.message) },
      severity: 'critical',
    });
  }

  return events;
}
