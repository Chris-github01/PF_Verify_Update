import { useEffect, useState } from 'react';
import {
  ArrowLeft, Play, RotateCcw, ArrowUpCircle, Zap, GitBranch,
  CheckCircle, Flag, Calendar, Activity, Loader2, X, Database, FileText
} from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowRunHistoryTable from '../../components/shadow/ShadowRunHistoryTable';
import ModuleVersionBadge from '../../components/shadow/ModuleVersionBadge';
import {
  getModuleWithVersion,
  updateModuleVersion,
  promoteModule,
  rollbackModule,
  setKillSwitch,
} from '../../lib/shadow/moduleRegistry';
import { getShadowRuns } from '../../lib/shadow/shadowRunner';
import { resolveFlag } from '../../lib/shadow/featureFlags';
import { dbGetModuleRolloutEvents } from '../../lib/db/rolloutEvents';
import { dbGetAllFlags } from '../../lib/db/featureFlags';
import { dbGetRegressionSuites } from '../../lib/db/regressionSuites';
import { executeModuleRun } from '../../lib/modules/execution/moduleExecutor';
import { listRecentPlumbingQuotes } from '../../lib/modules/parsers/plumbing/loadSource';
import type {
  ModuleRegistryRecord,
  ModuleVersionRecord,
  ShadowRunRecord,
  RolloutEventRecord,
  FeatureFlagRecord,
  RegressionSuiteRecord,
} from '../../types/shadow';

interface RecentQuote {
  id: string;
  supplier_name: string | null;
  total_amount: number | null;
  status: string;
  project_id: string;
  created_at: string;
}

function getModuleKeyFromPath(): string | undefined {
  const m = window.location.pathname.match(/^\/shadow\/modules\/([^/?#]+)\/?$/);
  return m ? m[1] : undefined;
}

const EVENT_COLORS: Record<string, string> = {
  global_promoted: 'text-green-400',
  rollback_triggered: 'text-red-400',
  kill_switch_enabled: 'text-red-400',
  kill_switch_disabled: 'text-green-400',
  shadow_enabled: 'text-blue-400',
  beta_enabled: 'text-cyan-400',
  org_rollout_enabled: 'text-teal-400',
};

export default function ShadowModuleDetail() {
  const moduleKey = getModuleKeyFromPath();
  const [module, setModule] = useState<ModuleRegistryRecord | null>(null);
  const [version, setVersion] = useState<ModuleVersionRecord | null>(null);
  const [runs, setRuns] = useState<ShadowRunRecord[]>([]);
  const [rolloutEvents, setRolloutEvents] = useState<RolloutEventRecord[]>([]);
  const [moduleFlags, setModuleFlags] = useState<FeatureFlagRecord[]>([]);
  const [regressionSuites, setRegressionSuites] = useState<RegressionSuiteRecord[]>([]);
  const [killActive, setKillActive] = useState(false);
  const [shadowVersionInput, setShadowVersionInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showRunModal, setShowRunModal] = useState(false);
  const [runMode, setRunMode] = useState<'live_vs_shadow' | 'shadow_only'>('live_vs_shadow');
  const [sourceType, setSourceType] = useState<'quote' | 'parsing_job'>('quote');
  const [sourceId, setSourceId] = useState('');
  const [recentQuotes, setRecentQuotes] = useState<RecentQuote[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleKey) return;
    load();
  }, [moduleKey]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [
        { module: mod, version: ver },
        runList,
        kill,
        events,
        allFlags,
        suites,
      ] = await Promise.all([
        getModuleWithVersion(moduleKey!),
        getShadowRuns(moduleKey, 30),
        resolveFlag(`kill_switch.${moduleKey}`),
        dbGetModuleRolloutEvents(moduleKey!, 20),
        dbGetAllFlags({ moduleKey }),
        dbGetRegressionSuites(moduleKey),
      ]);
      setModule(mod);
      setVersion(ver);
      setRuns(runList);
      setKillActive(kill.enabled);
      setRolloutEvents(events);
      setModuleFlags(allFlags);
      setRegressionSuites(suites);
      setShadowVersionInput(ver?.shadow_version ?? '');
    } catch (e) {
      console.error(e);
      setError('Failed to load module data.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetShadowVersion() {
    if (!moduleKey) return;
    setSaving(true);
    await updateModuleVersion(moduleKey, { shadow_version: shadowVersionInput || undefined });
    await load();
    setSaving(false);
  }

  async function handlePromote() {
    if (!moduleKey) return;
    if (!confirm('Promote candidate version to global live?')) return;
    await promoteModule(moduleKey);
    load();
  }

  async function handleRollback() {
    if (!moduleKey) return;
    if (!confirm(`Roll back to ${version?.rollback_version}?`)) return;
    await rollbackModule(moduleKey);
    load();
  }

  async function handleKillSwitch() {
    if (!moduleKey) return;
    await setKillSwitch(moduleKey, !killActive);
    load();
  }

  async function openRunModal() {
    setShowRunModal(true);
    setRunError(null);
    setSourceId('');
    if (moduleKey === 'plumbing_parser') {
      setLoadingQuotes(true);
      try {
        const quotes = await listRecentPlumbingQuotes(25);
        setRecentQuotes(quotes);
      } catch {
        setRecentQuotes([]);
      } finally {
        setLoadingQuotes(false);
      }
    }
  }

  async function handleRunExecution() {
    if (!moduleKey || !sourceId.trim()) {
      setRunError('Please select or enter a source ID.');
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const result = await executeModuleRun({
        moduleKey,
        sourceType,
        sourceId: sourceId.trim(),
        runMode,
      });

      if (!result.success) {
        setRunError(result.error ?? 'Run failed — unknown error');
        return;
      }

      setShowRunModal(false);
      await load();

      if (runMode === 'live_vs_shadow' && result.runId) {
        window.location.href = `/shadow/plumbing/compare/${result.runId}`;
      }
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  }

  if (loading) return (
    <ShadowLayout>
      <div className="text-center py-20 text-gray-500 text-sm">Loading module...</div>
    </ShadowLayout>
  );

  if (error || !module) return (
    <ShadowLayout>
      <div className="text-center py-20 text-red-400 text-sm">{error ?? 'Module not found'}</div>
    </ShadowLayout>
  );

  return (
    <ShadowLayout>
      <div className="max-w-5xl mx-auto space-y-6">
          <a href="/shadow/modules" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> All Modules
          </a>

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white">{module.module_name}</h1>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className="text-sm font-mono text-gray-500">{module.module_key}</span>
                <span className="text-xs text-gray-600 capitalize">{module.module_type}</span>
                {version && <ModuleVersionBadge status={version.rollout_status} size="md" />}
                {killActive && (
                  <span className="flex items-center gap-1 text-xs bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full font-medium">
                    <Zap className="w-3 h-3" /> Kill Switch Active
                  </span>
                )}
              </div>
              {module.description && (
                <p className="text-sm text-gray-400 mt-2 max-w-xl">{module.description}</p>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              {module.is_shadow_enabled && (
                <button
                  onClick={openRunModal}
                  className="flex items-center gap-1.5 text-sm bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-4 py-2 rounded-lg transition-colors font-medium"
                >
                  <Play className="w-4 h-4" /> Run Shadow
                </button>
              )}
              <button
                onClick={handleKillSwitch}
                className={`flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border font-medium transition-colors ${
                  killActive
                    ? 'bg-green-600/20 text-green-300 border-green-700 hover:bg-green-600/30'
                    : 'bg-red-600/20 text-red-300 border-red-700 hover:bg-red-600/30'
                }`}
              >
                <Zap className="w-4 h-4" />
                {killActive ? 'Disable Kill Switch' : 'Kill Switch'}
              </button>
            </div>
          </div>

          {/* Version cards */}
          <div className="grid sm:grid-cols-4 gap-4">
            {[
              { label: 'Live Version',     value: version?.live_version ?? 'v1',                color: 'green' },
              { label: 'Shadow Version',   value: version?.shadow_version ?? '—',               color: 'blue' },
              { label: 'Candidate',        value: version?.promoted_candidate_version ?? '—',   color: 'amber' },
              { label: 'Rollback Version', value: version?.rollback_version ?? '—',             color: 'gray' },
            ].map((v) => (
              <div key={v.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-1">{v.label}</div>
                <div className={`text-lg font-bold font-mono ${
                  v.value === '—' ? 'text-gray-600' :
                  v.color === 'green' ? 'text-green-400' :
                  v.color === 'blue' ? 'text-blue-400' :
                  v.color === 'amber' ? 'text-amber-400' : 'text-gray-400'
                }`}>{v.value}</div>
              </div>
            ))}
          </div>

          {/* Set shadow version */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Set Shadow Version</h2>
            </div>
            <div className="flex gap-3">
              <input
                value={shadowVersionInput}
                onChange={(e) => setShadowVersionInput(e.target.value)}
                placeholder="e.g. v2-shadow, v2-beta..."
                className="flex-1 px-4 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
              <button
                disabled={saving}
                onClick={handleSetShadowVersion}
                className="px-4 py-2 text-sm bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Promotion controls */}
          {(version?.promoted_candidate_version || version?.rollback_version) && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">Promotion Controls</h2>
              <div className="flex gap-3 flex-wrap">
                {version?.promoted_candidate_version && (
                  <button
                    onClick={handlePromote}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-700 rounded-lg font-medium transition-colors"
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    Promote {version.promoted_candidate_version} to Global Live
                  </button>
                )}
                {version?.rollback_version && (
                  <button
                    onClick={handleRollback}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-700 rounded-lg font-medium transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Rollback to {version.rollback_version}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Readiness checklist */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Promotion Readiness</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                { label: 'Shadow version set',           ok: !!version?.shadow_version },
                { label: 'Kill switch disabled',         ok: !killActive },
                { label: 'Rollback version available',   ok: !!version?.rollback_version },
                { label: 'Module shadow-enabled',        ok: !!module.is_shadow_enabled },
                { label: 'Recent completed shadow runs', ok: runs.filter((r) => r.status === 'completed').length > 0 },
                { label: 'No recent failures',           ok: runs.filter((r) => r.status === 'failed').length === 0 },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <CheckCircle className={`w-4 h-4 flex-shrink-0 ${item.ok ? 'text-green-400' : 'text-gray-700'}`} />
                  <span className={`text-sm ${item.ok ? 'text-gray-200' : 'text-gray-600'}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Active flags for this module */}
          {moduleFlags.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">Active Flags</h2>
                <span className="text-xs text-gray-600">({moduleFlags.length})</span>
              </div>
              <div className="divide-y divide-gray-800/60">
                {moduleFlags.map((flag) => (
                  <div key={flag.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                    <div>
                      <span className="font-mono text-xs text-amber-300">{flag.flag_key}</span>
                      <span className="text-xs text-gray-600 ml-2">{flag.target_type} · {flag.environment}</span>
                    </div>
                    <span className={`text-xs font-medium ${flag.enabled ? 'text-green-400' : 'text-gray-600'}`}>
                      {flag.enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                ))}
              </div>
              <a href="/shadow/admin/flags" className="text-xs text-amber-400 hover:text-amber-300">
                Manage all flags →
              </a>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Rollout event history */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-white">Rollout History</h2>
              </div>
              {rolloutEvents.length === 0 ? (
                <p className="text-xs text-gray-600 py-4 text-center">No rollout events yet</p>
              ) : (
                <div className="space-y-2">
                  {rolloutEvents.slice(0, 8).map((ev) => (
                    <div key={ev.id} className="flex items-start justify-between gap-3">
                      <span className={`text-xs font-mono font-medium ${EVENT_COLORS[ev.event_type] ?? 'text-gray-400'}`}>
                        {ev.event_type}
                      </span>
                      <span className="text-xs text-gray-600 whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Regression suites */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-gray-400" />
                  <h2 className="text-sm font-semibold text-white">Regression Suites</h2>
                </div>
                {moduleKey === 'plumbing_parser' && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <a
                      href="/shadow/modules/plumbing_parser/optimization"
                      className="text-xs text-teal-300 hover:text-teal-200 transition-colors font-semibold border border-teal-700/40 px-2 py-0.5 rounded-md"
                    >
                      Optimization engine →
                    </a>
                    <a
                      href="/shadow/modules/plumbing_parser/executive"
                      className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                    >
                      Executive intelligence →
                    </a>
                    <a
                      href="/shadow/modules/plumbing_parser/review"
                      className="text-xs text-teal-400 hover:text-teal-300 transition-colors font-medium"
                    >
                      Review operations →
                    </a>
                    <a
                      href="/shadow/modules/plumbing_parser/predictive"
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
                    >
                      Predictive intelligence →
                    </a>
                    <a
                      href="/shadow/modules/plumbing_parser/learning"
                      className="text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium"
                    >
                      Learning system →
                    </a>
                    <a
                      href="/shadow/modules/plumbing_parser/release"
                      className="text-xs text-teal-400 hover:text-teal-300 transition-colors font-medium"
                    >
                      Release system →
                    </a>
                    <a
                      href="/shadow/modules/plumbing_parser/beta"
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      Beta intelligence →
                    </a>
                    <a
                      href="/shadow/modules/plumbing_parser/rollout"
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Rollout controls →
                    </a>
                    <a
                      href="/shadow/modules/plumbing_parser/regression"
                      className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      Regression suites →
                    </a>
                  </div>
                )}
              </div>
              {regressionSuites.length === 0 ? (
                <p className="text-xs text-gray-600 py-4 text-center">No regression suites defined</p>
              ) : (
                <div className="space-y-2">
                  {regressionSuites.map((suite) => (
                    <a
                      key={suite.id}
                      href={moduleKey === 'plumbing_parser' ? `/shadow/modules/plumbing_parser/regression/${suite.id}` : '#'}
                      className="flex items-start justify-between gap-3 hover:bg-gray-800/30 rounded-lg px-2 py-1 -mx-2 transition-colors"
                    >
                      <div>
                        <div className="text-sm text-white">{suite.suite_name}</div>
                        {suite.description && (
                          <div className="text-xs text-gray-600">{suite.description}</div>
                        )}
                      </div>
                      <span className="text-xs text-gray-600 whitespace-nowrap">
                        {new Date(suite.created_at).toLocaleDateString()}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Run history */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Run History</h2>
              {runs.length > 0 && (
                <a href={`/shadow/modules/${moduleKey}/runs`} className="text-xs text-amber-400 hover:text-amber-300">
                  View all runs →
                </a>
              )}
            </div>
            <ShadowRunHistoryTable runs={runs} />
          </div>
      </div>

      {showRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h2 className="text-base font-semibold text-white">Run Shadow Execution</h2>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">{moduleKey}</p>
              </div>
              <button
                onClick={() => setShowRunModal(false)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Run Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['live_vs_shadow', 'shadow_only'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setRunMode(mode)}
                      className={`px-3 py-2.5 text-xs rounded-lg border font-medium transition-colors text-left ${
                        runMode === mode
                          ? 'bg-blue-500/15 border-blue-500/50 text-blue-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="font-semibold mb-0.5">
                        {mode === 'live_vs_shadow' ? 'Live vs Shadow' : 'Shadow Only'}
                      </div>
                      <div className="text-gray-500 font-normal">
                        {mode === 'live_vs_shadow' ? 'Runs both — compares results' : 'Shadow parser only'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">Source Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['quote', 'parsing_job'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => { setSourceType(type); setSourceId(''); }}
                      className={`flex items-center gap-2 px-3 py-2.5 text-xs rounded-lg border font-medium transition-colors ${
                        sourceType === type
                          ? 'bg-blue-500/15 border-blue-500/50 text-blue-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {type === 'quote' ? <Database className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                      {type === 'quote' ? 'Quote' : 'Parsing Job'}
                    </button>
                  ))}
                </div>
              </div>

              {sourceType === 'quote' && moduleKey === 'plumbing_parser' ? (
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-2 block">Select Quote</label>
                  {loadingQuotes ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500 py-3">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading recent quotes...
                    </div>
                  ) : recentQuotes.length === 0 ? (
                    <div className="text-xs text-gray-500 py-3">No plumbing quotes found</div>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {recentQuotes.map((q) => (
                        <button
                          key={q.id}
                          onClick={() => setSourceId(q.id)}
                          className={`w-full text-left px-3 py-2 text-xs rounded-lg border transition-colors ${
                            sourceId === q.id
                              ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                              : 'bg-gray-800 border-gray-700/50 text-gray-300 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">{q.supplier_name ?? 'Unnamed supplier'}</span>
                            {q.total_amount != null && (
                              <span className="text-gray-500 whitespace-nowrap">
                                ${q.total_amount.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="text-gray-600 font-mono mt-0.5">{q.id.slice(0, 16)}...</div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-2">
                    <input
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                      placeholder="Or paste quote ID directly..."
                      className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-gray-400 mb-2 block">
                    {sourceType === 'quote' ? 'Quote ID' : 'Parsing Job ID'}
                  </label>
                  <input
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    placeholder={sourceType === 'quote' ? 'Enter quote UUID...' : 'Enter parsing job UUID...'}
                    className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              )}

              {runError && (
                <div className="bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-xs text-red-300">
                  {runError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between gap-3">
              <p className="text-[10px] text-gray-600">Writes only to shadow tables. No customer data affected.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRunModal(false)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRunExecution}
                  disabled={running || !sourceId.trim()}
                  className="flex items-center gap-2 px-5 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
                >
                  {running ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      Execute Run
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ShadowLayout>
  );
}
