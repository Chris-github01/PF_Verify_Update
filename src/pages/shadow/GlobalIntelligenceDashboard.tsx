import { useState, useEffect, useCallback } from 'react';
import { Globe, RefreshCw, TrendingUp, TrendingDown, Minus, Shield, Cpu, GitMerge, Zap } from 'lucide-react';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ModuleHealthCard from '../../components/shadow/ModuleHealthCard';
import ModuleComparisonChart from '../../components/shadow/ModuleComparisonChart';
import CrossTradePatternPanel from '../../components/shadow/CrossTradePatternPanel';
import TradeModuleRegistryView from '../../components/shadow/TradeModuleRegistryView';
import ModuleOnboardingWizard from '../../components/shadow/ModuleOnboardingWizard';
import {
  dbGetLatestHealthScores,
  dbSaveHealthScore,
  buildDefaultHealthScore,
  computePlatformHealthSummary,
} from '../../lib/intelligence/moduleHealth';
import {
  dbGetCrossTradePatterns,
  dbUpdateSuggestionStatus,
  KNOWN_CROSS_TRADE_PATTERNS,
  dbCreateCrossTradePattern,
} from '../../lib/intelligence/learning/crossTradePatterns';
import { getRecentEvents } from '../../lib/intelligence/eventBus';
import { getGlobalOptimizationStats } from '../../lib/intelligence/globalOptimization';
import { TRADE_MODULES } from '../../lib/modules/tradeRegistry';
import type { ModuleHealthScore, PlatformHealthSummary } from '../../lib/intelligence/moduleHealth';
import type { CrossTradePattern } from '../../lib/intelligence/learning/crossTradePatterns';
import type { IntelligenceEvent } from '../../lib/intelligence/eventBus';

type Tab = 'platform' | 'modules' | 'cross-trade' | 'registry' | 'onboarding';

const TREND_CONFIG = {
  improving: { icon: TrendingUp,   color: 'text-teal-400',  label: 'Improving' },
  stable:    { icon: Minus,        color: 'text-gray-400',  label: 'Stable' },
  degrading: { icon: TrendingDown, color: 'text-red-400',   label: 'Degrading' },
};

export default function GlobalIntelligenceDashboard() {
  const [tab, setTab] = useState<Tab>('platform');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [healthScores, setHealthScores] = useState<ModuleHealthScore[]>([]);
  const [platformSummary, setPlatformSummary] = useState<PlatformHealthSummary | null>(null);
  const [patterns, setPatterns] = useState<CrossTradePattern[]>([]);
  const [recentEvents, setRecentEvents] = useState<IntelligenceEvent[]>([]);
  const [optStats, setOptStats] = useState<{ totalCandidates: number; totalBundles: number; totalRuns: number; avgScore: number; strongRecommendations: number } | null>(null);

  const load = useCallback(async () => {
    const [scores, rawPatterns, events, stats] = await Promise.all([
      dbGetLatestHealthScores(),
      dbGetCrossTradePatterns({ status: 'active' }),
      getRecentEvents({ limit: 20 }),
      getGlobalOptimizationStats(),
    ]);

    let finalScores = scores;
    if (scores.length === 0) {
      const defaults = await Promise.all(
        Object.keys(TRADE_MODULES).map(async (k) => {
          const s = buildDefaultHealthScore(k);
          return dbSaveHealthScore(s);
        })
      );
      finalScores = defaults;
    }

    let finalPatterns = rawPatterns;
    if (rawPatterns.length === 0) {
      finalPatterns = await Promise.all(
        KNOWN_CROSS_TRADE_PATTERNS.map((p) => dbCreateCrossTradePattern(p))
      );
    }

    const summary = await computePlatformHealthSummary(finalScores);

    setHealthScores(finalScores);
    setPlatformSummary(summary);
    setPatterns(finalPatterns);
    setRecentEvents(events);
    setOptStats(stats);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleDismissPattern(id: string) {
    await dbUpdateSuggestionStatus(id, 'rejected', 'Dismissed by admin');
    setPatterns((p) => p.filter((x) => x.id !== id));
  }

  if (loading) {
    return (
      <ShadowGuard>
        <ShadowLayout>
          <div className="text-center py-16 text-sm text-gray-500">Initialising intelligence platform...</div>
        </ShadowLayout>
      </ShadowGuard>
    );
  }

  const trend = platformSummary ? TREND_CONFIG[platformSummary.trend] : TREND_CONFIG.stable;
  const TrendIcon = trend.icon;

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-teal-400" />
                Multi-Trade Intelligence Platform
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Unified intelligence across all trade modules. Cross-trade insights, pattern detection, and platform health.
              </p>
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

          {/* Platform health summary */}
          {platformSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard
                label="Platform health"
                value={`${platformSummary.overallScore}/100`}
                sub={<span className={`flex items-center gap-1 text-[10px] ${trend.color}`}><TrendIcon className="w-3 h-3" />{trend.label}</span>}
                accent={platformSummary.overallScore >= 70 ? 'text-teal-300' : 'text-amber-300'}
              />
              <SummaryCard
                label="Active modules"
                value={`${platformSummary.activeModules}/${platformSummary.totalModules}`}
                sub={<span className="text-[10px] text-gray-600">intelligence enabled</span>}
                accent="text-white"
              />
              <SummaryCard
                label="Avg anomaly rate"
                value={`${platformSummary.avgAnomalyRate.toFixed(1)}%`}
                sub={<span className="text-[10px] text-gray-600">across active modules</span>}
                accent={platformSummary.avgAnomalyRate < 5 ? 'text-teal-300' : 'text-amber-300'}
              />
              <SummaryCard
                label="Avg regression"
                value={`${platformSummary.avgRegressionPassRate.toFixed(1)}%`}
                sub={<span className="text-[10px] text-gray-600">pass rate</span>}
                accent={platformSummary.avgRegressionPassRate >= 85 ? 'text-teal-300' : 'text-amber-300'}
              />
            </div>
          )}

          {/* Optimization stats quick row */}
          {optStats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { label: 'Opt. candidates', v: optStats.totalCandidates },
                { label: 'Bundles assembled', v: optStats.totalBundles },
                { label: 'Simulation runs', v: optStats.totalRuns },
                { label: 'Avg bundle score', v: `${optStats.avgScore}/100` },
                { label: 'Strong recs', v: optStats.strongRecommendations },
              ].map(({ label, v }) => (
                <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-center">
                  <div className="text-[10px] text-gray-600">{label}</div>
                  <div className="text-sm font-bold text-white mt-0.5">{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-1 overflow-x-auto">
            {([
              { key: 'platform'    as Tab, icon: Globe,     label: 'Platform' },
              { key: 'modules'     as Tab, icon: Shield,    label: 'Module health' },
              { key: 'cross-trade' as Tab, icon: GitMerge,  label: 'Cross-trade' },
              { key: 'registry'    as Tab, icon: Cpu,       label: 'Registry' },
              { key: 'onboarding'  as Tab, icon: Zap,       label: 'Onboarding' },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 whitespace-nowrap text-xs px-3 py-2 rounded-lg transition-colors ${
                  tab === key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Platform tab */}
          {tab === 'platform' && (
            <div className="space-y-5">
              {/* Recent events feed */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Intelligence event stream</h2>
                  <p className="text-[10px] text-gray-500 mt-0.5">Real-time events from all trade modules</p>
                </div>
                <div className="p-5">
                  {recentEvents.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-600">No intelligence events yet. Events appear as modules detect anomalies, complete reviews, and run optimizations.</div>
                  ) : (
                    <div className="space-y-2">
                      {recentEvents.slice(0, 10).map((ev) => (
                        <div key={ev.id} className="flex items-center gap-3 text-[10px] py-1.5 border-b border-gray-800/50 last:border-0">
                          <span className={`font-medium shrink-0 ${ev.severity === 'critical' ? 'text-red-400' : ev.severity === 'warning' ? 'text-amber-400' : 'text-gray-400'}`}>
                            {ev.event_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-gray-600 shrink-0">{ev.source_module}</span>
                          <span className="text-gray-700 truncate flex-1">{JSON.stringify(ev.payload_json).slice(0, 80)}</span>
                          <span className="text-gray-700 shrink-0">{ev.created_at ? new Date(ev.created_at).toLocaleTimeString() : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Modules tab */}
          {tab === 'modules' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {healthScores.map((s) => (
                  <ModuleHealthCard
                    key={s.id}
                    score={s}
                    onClick={() => window.location.href = `/shadow/intelligence/modules/${s.module_key}`}
                  />
                ))}
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Module comparison</h2>
                </div>
                <div className="p-5">
                  <ModuleComparisonChart scores={healthScores} />
                </div>
              </div>
            </div>
          )}

          {/* Cross-trade tab */}
          {tab === 'cross-trade' && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <h2 className="text-sm font-semibold text-white">Cross-trade patterns</h2>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Patterns detected as occurring across multiple trade parsers. Suggestion-only — no auto-propagation.
                  </p>
                </div>
                <div className="p-5">
                  <CrossTradePatternPanel patterns={patterns} onDismiss={handleDismissPattern} />
                </div>
              </div>
            </div>
          )}

          {/* Registry tab */}
          {tab === 'registry' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Trade module registry</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">Central source of truth for all registered trade modules and their capabilities</p>
              </div>
              <div className="p-5">
                <TradeModuleRegistryView />
              </div>
            </div>
          )}

          {/* Onboarding tab */}
          {tab === 'onboarding' && (
            <div className="space-y-4">
              <ModuleOnboardingWizard />
            </div>
          )}

          {/* Navigation links */}
          <div className="flex items-center gap-4 text-xs pt-2 border-t border-gray-800 flex-wrap">
            <a href="/shadow/modules/plumbing_parser/optimization" className="text-teal-400 hover:text-teal-300 transition-colors">Plumbing optimization engine →</a>
            <a href="/shadow/modules/plumbing_parser" className="text-cyan-400 hover:text-cyan-300 transition-colors">Plumbing module detail →</a>
            <a href="/shadow" className="text-gray-400 hover:text-white transition-colors">Shadow admin home →</a>
          </div>
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub: React.ReactNode; accent: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-xl font-black mt-0.5 ${accent}`}>{value}</div>
      <div className="mt-0.5">{sub}</div>
    </div>
  );
}
