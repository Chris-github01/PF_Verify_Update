import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Rocket, AlertTriangle } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import PlumbingReadinessScoreCard from '../../components/shadow/release/PlumbingReadinessScoreCard';
import PlumbingReleaseChecklist from '../../components/shadow/release/PlumbingReleaseChecklist';
import PlumbingExpansionControls from '../../components/shadow/release/PlumbingExpansionControls';
import PlumbingPromotionPanel from '../../components/shadow/release/PlumbingPromotionPanel';
import PlumbingRollbackPanel from '../../components/shadow/release/PlumbingRollbackPanel';
import PlumbingReleaseTimeline from '../../components/shadow/release/PlumbingReleaseTimeline';
import PlumbingBetaWarningsBanner from '../../components/plumbing/beta/PlumbingBetaWarningsBanner';
import { dbGetPlumbingRolloutState } from '../../lib/db/plumbingRolloutDb';
import { dbGetDailyMetrics, dbGetAnomalies } from '../../lib/db/plumbingBetaDb';
import { dbGetVersionHistory, dbSaveChecklistEvaluation, dbGetOrCreateChecklist } from '../../lib/db/releaseDb';
import { buildBetaHealthSummary } from '../../lib/modules/parsers/plumbing/beta/buildBetaHealthSummary';
import { recommendAdminAction } from '../../lib/modules/parsers/plumbing/beta/recommendAdminAction';
import { evaluateChecklist } from '../../lib/modules/release/checklistEvaluator';
import { computeReadinessScore } from '../../lib/modules/release/readinessScore';
import { getRolloutStatusLabel, getRolloutStatusColor } from '../../lib/db/plumbingRolloutDb';
import type { PlumbingRolloutState, ModuleVersionHistoryRecord } from '../../types/shadow';
import type { ChecklistEvalResult } from '../../lib/modules/release/checklistEvaluator';
import type { ReadinessScoreResult } from '../../lib/modules/release/readinessScore';
import { dbGetRecentPlumbingRuns } from '../../lib/db/plumbingRegressionDb';

const PHASE_ORDER = [
  'idle', 'shadow_testing', 'regression_passed', 'approved_for_beta',
  'beta_internal', 'beta_limited', 'beta_expanded',
  'release_candidate', 'production_live',
];

export default function PlumbingReleaseDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rolloutState, setRolloutState] = useState<PlumbingRolloutState | null>(null);
  const [checklistResult, setChecklistResult] = useState<ChecklistEvalResult | null>(null);
  const [readiness, setReadiness] = useState<ReadinessScoreResult | null>(null);
  const [history, setHistory] = useState<ModuleVersionHistoryRecord[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [unresolvedCriticalCount, setUnresolvedCriticalCount] = useState(0);
  const [healthScore, setHealthScore] = useState<number | undefined>(undefined);
  const [anomalyRateRising, setAnomalyRateRising] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'timeline'>('dashboard');

  const load = useCallback(async () => {
    const [rollout, metrics, anomaliesData, regressionRuns, hist] = await Promise.all([
      dbGetPlumbingRolloutState(),
      dbGetDailyMetrics({ periodDays: 7 }),
      dbGetAnomalies({ limit: 100, periodDays: 7 }),
      dbGetRecentPlumbingRuns(5).catch(() => []),
      dbGetVersionHistory(20),
    ]);

    setRolloutState(rollout);
    setHistory(hist);

    const summary = buildBetaHealthSummary(metrics, anomaliesData.data, 7);
    const latestRun = regressionRuns[0];
    const regressionAgeMs = latestRun?.created_at
      ? Date.now() - new Date(latestRun.created_at).getTime()
      : undefined;
    const rec = recommendAdminAction(summary, regressionAgeMs, !!rollout.latestApproval);
    setHealthScore(rec.healthScore);
    setAnomalyRateRising(summary.trendDirection === 'degrading');
    setUnresolvedCriticalCount(summary.unresolvedCriticalCount);

    const version = rollout.moduleVersion?.shadow_version ?? rollout.moduleVersion?.live_version ?? 'v-current';
    const regressionPassed = latestRun?.status === 'completed';
    const regressionFresh = regressionAgeMs != null && regressionAgeMs < 7 * 24 * 60 * 60 * 1000;

    const criticalLast7d = anomaliesData.data.filter((a) => a.severity === 'critical').length;
    const evalInput = {
      regressionSuiteRecentlyPassed: regressionPassed,
      regressionSuiteAgeMs: regressionAgeMs,
      criticalAnomaliesLast7Days: criticalLast7d,
      anomalyRateLast7Days: summary.anomalyRate,
      unresolvedCriticalCount: summary.unresolvedCriticalCount,
      betaTotalRuns: summary.totalRuns,
      betaMinRunsRequired: 20,
      approvalRecordExists: !!rollout.latestApproval,
      manualSignOffComplete: false,
      mustPassCasesValidated: regressionPassed,
      healthScore: rec.healthScore,
    };

    const evalResult = evaluateChecklist(evalInput);
    setChecklistResult(evalResult);

    await dbSaveChecklistEvaluation(version, evalResult).catch(() => {});

    const readScore = computeReadinessScore({
      checklistResult: evalResult,
      betaTotalRuns: summary.totalRuns,
      betaDurationDays: 7,
      betaFailureRate: summary.failureRate,
      anomalyRateLast7Days: summary.anomalyRate,
      criticalAnomaliesTotal: summary.criticalAnomalyCount,
      regressionPassRate: regressionPassed ? 1.0 : 0,
      regressionSuiteAgeMs: regressionAgeMs,
      healthScore: rec.healthScore,
      approvalExists: !!rollout.latestApproval,
    });
    setReadiness(readScore);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleReEvaluateChecklist() {
    setChecklistLoading(true);
    await load();
    setChecklistLoading(false);
  }

  if (loading) {
    return (
      <ShadowLayout>
        <div className="text-center py-16 text-sm text-gray-500">Loading release system...</div>
      </ShadowLayout>
    );
  }

  const rolloutStatus = rolloutState?.moduleVersion?.rollout_status ?? 'idle';
  const phaseIndex = PHASE_ORDER.indexOf(rolloutStatus);
  const flags = rolloutState?.flags;
  const killActive = flags?.killSwitch ?? false;
  const hasApproval = !!rolloutState?.latestApproval;

  return (
    <ShadowLayout>
      <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Rocket className="w-5 h-5 text-teal-400" />
                Release System — plumbing_parser
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Controlled expansion, promotion, and rollback. Admin-only.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 gap-1">
                {(['dashboard', 'timeline'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`text-xs px-3 py-1.5 rounded-md capitalize transition-colors ${activeTab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    {t}
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

          {/* Phase indicator */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Release Phase</div>
            <div className="flex items-center gap-1 flex-wrap">
              {PHASE_ORDER.map((phase, i) => {
                const active = i === phaseIndex;
                const past = i < phaseIndex;
                return (
                  <div key={phase} className="flex items-center gap-1">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${
                      active
                        ? `border-teal-500/40 bg-teal-500/15 ${getRolloutStatusColor(phase)}`
                        : past
                          ? 'border-gray-700 bg-gray-800 text-gray-400'
                          : 'border-gray-800 bg-gray-900/50 text-gray-600'
                    }`}>
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />}
                      {past && <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />}
                      {getRolloutStatusLabel(phase)}
                    </div>
                    {i < PHASE_ORDER.length - 1 && (
                      <div className={`w-4 h-px ${past || active ? 'bg-gray-600' : 'bg-gray-800'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Warnings */}
          <PlumbingBetaWarningsBanner
            killSwitchActive={killActive}
            regressionStale={false}
            hasApproval={hasApproval}
            unresolvedCriticalCount={unresolvedCriticalCount}
            healthStatus={healthScore != null && healthScore < 35 ? 'critical' : healthScore != null && healthScore < 60 ? 'at_risk' : 'healthy'}
            anomalyRateRising={anomalyRateRising}
          />

          {activeTab === 'timeline' ? (
            <PlumbingReleaseTimeline history={history} />
          ) : (
            <>
              {/* Top cards */}
              <div className="grid lg:grid-cols-2 gap-5">
                {readiness && <PlumbingReadinessScoreCard result={readiness} />}
                {rolloutState && (
                  <PlumbingRollbackPanel rolloutState={rolloutState} onRefresh={handleRefresh} />
                )}
              </div>

              {/* Checklist */}
              <PlumbingReleaseChecklist
                result={checklistResult}
                onRefresh={handleReEvaluateChecklist}
                loading={checklistLoading}
              />

              {/* Expansion + Promotion in grid */}
              <div className="grid lg:grid-cols-2 gap-5">
                {rolloutState && (
                  <div className="space-y-4">
                    <SectionHeader icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} title="Expansion Controls" />
                    <PlumbingExpansionControls
                      rolloutState={rolloutState}
                      healthScore={healthScore}
                      onRefresh={handleRefresh}
                    />
                  </div>
                )}
                {rolloutState && (
                  <div className="space-y-4">
                    <SectionHeader icon={<Rocket className="w-4 h-4 text-teal-400" />} title="Promotion" />
                    <PlumbingPromotionPanel
                      rolloutState={rolloutState}
                      checklistResult={checklistResult}
                      healthScore={healthScore}
                      unresolvedCriticalCount={unresolvedCriticalCount}
                      onRefresh={handleRefresh}
                    />
                  </div>
                )}
              </div>

              {/* Quick links */}
              <div className="flex items-center gap-4 text-xs pt-2 border-t border-gray-800">
                <a href="/shadow/modules/plumbing_parser/beta" className="text-cyan-400 hover:text-cyan-300 transition-colors">
                  Beta Intelligence →
                </a>
                <a href="/shadow/modules/plumbing_parser/rollout" className="text-gray-400 hover:text-white transition-colors">
                  Rollout Controls →
                </a>
                <a href="/shadow/modules/plumbing_parser/regression" className="text-gray-400 hover:text-white transition-colors">
                  Regression Suites →
                </a>
              </div>
            </>
          )}
      </div>
    </ShadowLayout>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-sm font-semibold text-white">{title}</h2>
    </div>
  );
}
