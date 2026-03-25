import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Activity } from 'lucide-react';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import PlumbingBetaWarningsBanner from '../../components/plumbing/beta/PlumbingBetaWarningsBanner';
import PlumbingBetaHealthCard, { TrendIcon } from '../../components/plumbing/beta/PlumbingBetaHealthCard';
import PlumbingBetaMetricsGrid from '../../components/plumbing/beta/PlumbingBetaMetricsGrid';
import PlumbingAnomalyTable from '../../components/plumbing/beta/PlumbingAnomalyTable';
import PlumbingAnomalyDetail from '../../components/plumbing/beta/PlumbingAnomalyDetail';
import PlumbingOrgRiskTable from '../../components/plumbing/beta/PlumbingOrgRiskTable';
import PlumbingRecommendedActionPanel from '../../components/plumbing/beta/PlumbingRecommendedActionPanel';
import PlumbingBetaRunsTable from '../../components/plumbing/beta/PlumbingBetaRunsTable';
import {
  dbGetDailyMetrics,
  dbGetAnomalies,
  dbGetAnomaly,
  dbGetBetaEvents,
  dbRecomputeDailyMetrics,
} from '../../lib/db/plumbingBetaDb';
import { dbGetPlumbingRolloutState } from '../../lib/db/plumbingRolloutDb';
import { dbGetRecentPlumbingRuns } from '../../lib/db/plumbingRegressionDb';
import { buildBetaHealthSummary } from '../../lib/modules/parsers/plumbing/beta/buildBetaHealthSummary';
import { recommendAdminAction } from '../../lib/modules/parsers/plumbing/beta/recommendAdminAction';
import type { AnomalyEventRecord, BetaEventRecord } from '../../lib/modules/parsers/plumbing/beta/anomalyTypes';
import type { RecommendationResult } from '../../lib/modules/parsers/plumbing/beta/recommendAdminAction';
import type { BetaHealthSummary } from '../../lib/modules/parsers/plumbing/beta/buildBetaHealthSummary';
import type { PlumbingRolloutState } from '../../types/shadow';

const PAGE_SIZE = 20;

type PeriodDays = 7 | 14 | 30;

const PERIOD_OPTIONS: { label: string; days: PeriodDays }[] = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
];

interface AnomalyFilters {
  severity: string;
  anomalyType: string;
  resolutionStatus: string;
  periodDays: number;
}

export default function PlumbingBetaDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<PeriodDays>(14);
  const [rolloutState, setRolloutState] = useState<PlumbingRolloutState | null>(null);
  const [summary, setSummary] = useState<BetaHealthSummary | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [recentRuns, setRecentRuns] = useState<BetaEventRecord[]>([]);
  const [anomalyFilters, setAnomalyFilters] = useState<AnomalyFilters>({
    severity: '',
    anomalyType: '',
    resolutionStatus: 'open',
    periodDays: 14,
  });
  const [anomalies, setAnomalies] = useState<AnomalyEventRecord[]>([]);
  const [anomalyTotal, setAnomalyTotal] = useState(0);
  const [anomalyPage, setAnomalyPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailAnomaly, setDetailAnomaly] = useState<AnomalyEventRecord | null>(null);

  const loadCore = useCallback(async (p: PeriodDays) => {
    const [metrics, allAnomalies, rollout, regressionRuns, events] = await Promise.all([
      dbGetDailyMetrics({ periodDays: p }),
      dbGetAnomalies({ limit: 200, periodDays: p }),
      dbGetPlumbingRolloutState(),
      dbGetRecentPlumbingRuns(5).catch(() => []),
      dbGetBetaEvents({ limit: 30, periodDays: p }),
    ]);

    const s = buildBetaHealthSummary(metrics, allAnomalies.data, p);
    setSummary(s);
    setRolloutState(rollout);
    setRecentRuns(events as BetaEventRecord[]);

    const latestRun = regressionRuns[0];
    const regressionAgeMs = latestRun?.created_at
      ? Date.now() - new Date(latestRun.created_at).getTime()
      : undefined;

    setRecommendation(recommendAdminAction(s, regressionAgeMs, !!rollout.latestApproval));
  }, []);

  const loadAnomalies = useCallback(async (filters: AnomalyFilters, page: number) => {
    const { data, count } = await dbGetAnomalies({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      severity: filters.severity || undefined,
      anomalyType: filters.anomalyType || undefined,
      resolutionStatus: filters.resolutionStatus || undefined,
      periodDays: filters.periodDays,
    });
    setAnomalies(data);
    setAnomalyTotal(count);
  }, []);

  const reload = useCallback(async (p: PeriodDays, filters: AnomalyFilters, page: number) => {
    await Promise.all([loadCore(p), loadAnomalies(filters, page)]);
  }, [loadCore, loadAnomalies]);

  useEffect(() => {
    reload(period, anomalyFilters, anomalyPage).finally(() => setLoading(false));
  }, [reload, period, anomalyFilters, anomalyPage]);

  useEffect(() => {
    if (detailId) {
      dbGetAnomaly(detailId).then(setDetailAnomaly);
    } else {
      setDetailAnomaly(null);
    }
  }, [detailId]);

  async function handleRefresh() {
    setRefreshing(true);
    await dbRecomputeDailyMetrics();
    await reload(period, anomalyFilters, anomalyPage);
    setRefreshing(false);
  }

  function handleFilterChange(key: string, value: string | number) {
    const next = { ...anomalyFilters, [key]: value };
    setAnomalyFilters(next);
    setAnomalyPage(0);
  }

  if (loading) {
    return (
      <ShadowGuard>
        <ShadowLayout>
          <div className="text-center py-16 text-gray-500 text-sm">Loading beta intelligence...</div>
        </ShadowLayout>
      </ShadowGuard>
    );
  }

  const flags = rolloutState?.flags;
  const rolloutStatus = rolloutState?.moduleVersion?.rollout_status ?? 'live_only';
  const betaActive = flags?.betaEnabled ?? false;
  const killActive = flags?.killSwitch ?? false;
  const hasApproval = !!rolloutState?.latestApproval;
  const healthStatus = recommendation?.healthStatus ?? 'watch';
  const anomalyRateRising = summary?.trendDirection === 'degrading';

  const latestRegressionRunDate = undefined as Date | undefined;
  const regressionStale = latestRegressionRunDate
    ? Date.now() - latestRegressionRunDate.getTime() > 7 * 24 * 60 * 60 * 1000
    : false;

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white">Plumbing Parser — Beta Intelligence</h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Live monitoring and anomaly intelligence for <code className="text-cyan-400 text-xs">plumbing_parser</code> beta traffic.
                Admin-only. No customer data is modified.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-gray-900 border border-gray-800 rounded-lg p-1 gap-1">
                {PERIOD_OPTIONS.map(({ label, days }) => (
                  <button
                    key={days}
                    onClick={() => setPeriod(days)}
                    className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                      period === days
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-white border border-gray-700 bg-gray-900 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
              killActive
                ? 'text-red-300 border-red-500/40 bg-red-500/10'
                : betaActive
                  ? 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10'
                  : 'text-gray-400 border-gray-700 bg-gray-800'
            }`}>
              {killActive ? 'KILL SWITCH ACTIVE' : betaActive ? `BETA ACTIVE — ${rolloutStatus}` : 'BETA INACTIVE'}
            </span>
            <span className="text-xs text-gray-600 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" />
              {summary?.totalRuns ?? 0} runs in period
            </span>
            {summary && (
              <span className="text-xs text-gray-600 flex items-center gap-1">
                <TrendIcon direction={summary.trendDirection} />
                {summary.trendDirection.replace('_', ' ')}
              </span>
            )}
            <a
              href="/shadow/modules/plumbing_parser/rollout"
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors ml-auto"
            >
              Rollout controls →
            </a>
          </div>

          {/* Warnings */}
          <PlumbingBetaWarningsBanner
            killSwitchActive={killActive}
            regressionStale={regressionStale}
            hasApproval={hasApproval}
            unresolvedCriticalCount={summary?.unresolvedCriticalCount ?? 0}
            healthStatus={healthStatus}
            anomalyRateRising={anomalyRateRising}
          />

          {summary && recommendation ? (
            <>
              {/* Top row: health card + recommendation */}
              <div className="grid lg:grid-cols-2 gap-5">
                <PlumbingBetaHealthCard result={recommendation} />
                <PlumbingRecommendedActionPanel result={recommendation} />
              </div>

              {/* Metrics grid */}
              <PlumbingBetaMetricsGrid summary={summary} />

              {/* Anomaly table */}
              <PlumbingAnomalyTable
                anomalies={anomalies}
                total={anomalyTotal}
                page={anomalyPage}
                pageSize={PAGE_SIZE}
                onPageChange={setAnomalyPage}
                onDetailOpen={setDetailId}
                onRefresh={() => reload(period, anomalyFilters, anomalyPage)}
                filters={anomalyFilters}
                onFilterChange={handleFilterChange}
              />

              {/* Org risk */}
              {summary.orgRisk.length > 0 && (
                <PlumbingOrgRiskTable orgs={summary.orgRisk} />
              )}

              {/* Recent runs */}
              <PlumbingBetaRunsTable events={recentRuns} />
            </>
          ) : (
            <EmptyState betaActive={betaActive} />
          )}

          {/* Anomaly detail modal */}
          {detailAnomaly && (
            <PlumbingAnomalyDetail
              anomaly={detailAnomaly}
              onClose={() => setDetailId(null)}
              onRefresh={() => reload(period, anomalyFilters, anomalyPage)}
            />
          )}
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}

function EmptyState({ betaActive }: { betaActive: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
      <Activity className="w-10 h-10 text-gray-700 mx-auto mb-4" />
      <h2 className="text-base font-semibold text-white mb-2">No beta data yet</h2>
      {betaActive ? (
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Beta is active but no telemetry has been recorded yet. Run the shadow parser for a plumbing document to generate data.
        </p>
      ) : (
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          Beta is not currently enabled. Enable internal beta from the{' '}
          <a href="/shadow/modules/plumbing_parser/rollout" className="text-cyan-400 hover:underline">rollout controls</a>{' '}
          page to start capturing live beta data.
        </p>
      )}
    </div>
  );
}
