import type { BetaDailyMetrics, AnomalyEventRecord } from './anomalyTypes';

export interface OrgRiskEntry {
  orgId: string;
  totalRuns: number;
  failedRuns: number;
  anomalyCount: number;
  criticalCount: number;
  avgDelta?: number;
  lastAnomalyAt?: string;
  healthStatus: 'healthy' | 'watch' | 'at_risk' | 'critical';
}

export interface BetaHealthSummary {
  totalRuns: number;
  failedRuns: number;
  failureRate: number;
  anomalyCount: number;
  criticalAnomalyCount: number;
  anomalyRate: number;
  avgTotalDelta: number;
  avgConfidence: number;
  shadowBetterCount: number;
  liveBetterCount: number;
  inconclusiveCount: number;
  unresolvedCriticalCount: number;
  orgRisk: OrgRiskEntry[];
  trendDirection: 'improving' | 'stable' | 'degrading' | 'insufficient_data';
  periodDays: number;
}

export function buildBetaHealthSummary(
  metrics: BetaDailyMetrics[],
  anomalies: AnomalyEventRecord[],
  periodDays: number
): BetaHealthSummary {
  if (metrics.length === 0) {
    return {
      totalRuns: 0, failedRuns: 0, failureRate: 0,
      anomalyCount: 0, criticalAnomalyCount: 0, anomalyRate: 0,
      avgTotalDelta: 0, avgConfidence: 0,
      shadowBetterCount: 0, liveBetterCount: 0, inconclusiveCount: 0,
      unresolvedCriticalCount: 0, orgRisk: [],
      trendDirection: 'insufficient_data', periodDays,
    };
  }

  const totalRuns = metrics.reduce((s, m) => s + m.total_runs, 0);
  const failedRuns = metrics.reduce((s, m) => s + m.failed_runs, 0);
  const anomalyCount = metrics.reduce((s, m) => s + m.anomaly_count, 0);
  const criticalAnomalyCount = metrics.reduce((s, m) => s + m.critical_anomaly_count, 0);
  const shadowBetterCount = metrics.reduce((s, m) => s + m.shadow_better_count, 0);
  const liveBetterCount = metrics.reduce((s, m) => s + m.live_better_count, 0);
  const inconclusiveCount = metrics.reduce((s, m) => s + m.inconclusive_count, 0);

  const deltaSamples = metrics.filter((m) => m.avg_total_delta != null);
  const avgTotalDelta = deltaSamples.length > 0
    ? deltaSamples.reduce((s, m) => s + (m.avg_total_delta ?? 0), 0) / deltaSamples.length
    : 0;

  const confSamples = metrics.filter((m) => m.avg_confidence != null);
  const avgConfidence = confSamples.length > 0
    ? confSamples.reduce((s, m) => s + (m.avg_confidence ?? 0), 0) / confSamples.length
    : 0;

  const unresolvedCriticalCount = anomalies.filter(
    (a) => a.severity === 'critical' && a.resolution_status === 'open'
  ).length;

  const orgMap = new Map<string, OrgRiskEntry>();
  for (const m of metrics) {
    if (!m.org_id) continue;
    const existing = orgMap.get(m.org_id);
    if (!existing) {
      orgMap.set(m.org_id, {
        orgId: m.org_id,
        totalRuns: m.total_runs,
        failedRuns: m.failed_runs,
        anomalyCount: m.anomaly_count,
        criticalCount: m.critical_anomaly_count,
        avgDelta: m.avg_total_delta ?? undefined,
        lastAnomalyAt: m.anomaly_count > 0 ? m.metric_date : undefined,
        healthStatus: 'healthy',
      });
    } else {
      existing.totalRuns += m.total_runs;
      existing.failedRuns += m.failed_runs;
      existing.anomalyCount += m.anomaly_count;
      existing.criticalCount += m.critical_anomaly_count;
    }
  }

  for (const entry of orgMap.values()) {
    const aRate = entry.totalRuns > 0 ? entry.anomalyCount / entry.totalRuns : 0;
    if (entry.criticalCount >= 2) entry.healthStatus = 'critical';
    else if (entry.criticalCount >= 1 || aRate >= 0.5) entry.healthStatus = 'at_risk';
    else if (aRate >= 0.2 || entry.failedRuns > 0) entry.healthStatus = 'watch';
    else entry.healthStatus = 'healthy';
  }

  const trendDirection = computeTrend(metrics);

  return {
    totalRuns,
    failedRuns,
    failureRate: totalRuns > 0 ? failedRuns / totalRuns : 0,
    anomalyCount,
    criticalAnomalyCount,
    anomalyRate: totalRuns > 0 ? anomalyCount / totalRuns : 0,
    avgTotalDelta,
    avgConfidence,
    shadowBetterCount,
    liveBetterCount,
    inconclusiveCount,
    unresolvedCriticalCount,
    orgRisk: Array.from(orgMap.values()).sort((a, b) => b.criticalCount - a.criticalCount),
    trendDirection,
    periodDays,
  };
}

function computeTrend(metrics: BetaDailyMetrics[]): BetaHealthSummary['trendDirection'] {
  if (metrics.length < 4) return 'insufficient_data';
  const sorted = [...metrics].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  const mid = Math.floor(sorted.length / 2);
  const first = sorted.slice(0, mid);
  const second = sorted.slice(mid);

  const firstRate = sumRuns(first) > 0 ? sumAnomalies(first) / sumRuns(first) : 0;
  const secondRate = sumRuns(second) > 0 ? sumAnomalies(second) / sumRuns(second) : 0;

  if (secondRate < firstRate * 0.8) return 'improving';
  if (secondRate > firstRate * 1.2) return 'degrading';
  return 'stable';
}

function sumRuns(m: BetaDailyMetrics[]) { return m.reduce((s, r) => s + r.total_runs, 0); }
function sumAnomalies(m: BetaDailyMetrics[]) { return m.reduce((s, r) => s + r.anomaly_count, 0); }
