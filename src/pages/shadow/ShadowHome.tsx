import { useEffect, useState } from 'react';
import {
  Shield, Layers, Activity, GitBranch, Zap,
  AlertTriangle, CheckCircle, Clock, ArrowRight
} from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import { getAllModules } from '../../lib/shadow/moduleRegistry';
import { getShadowRuns } from '../../lib/shadow/shadowRunner';
import { getAuditLog } from '../../lib/shadow/auditLogger';
import { resolveFlag } from '../../lib/shadow/featureFlags';
import type { ModuleRegistryRecord, ModuleVersionRecord, ShadowRunRecord } from '../../types/shadow';

interface ModuleRow extends ModuleRegistryRecord { version?: ModuleVersionRecord; killActive?: boolean }

export default function ShadowHome() {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [recentRuns, setRecentRuns] = useState<ShadowRunRecord[]>([]);
  const [auditLog, setAuditLog] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [allMods, runs, audit] = await Promise.all([
        getAllModules(),
        getShadowRuns(undefined, 10),
        getAuditLog({ limit: 10 }),
      ]);

      const modsWithKill = await Promise.all(allMods.map(async (m) => {
        const { enabled } = await resolveFlag(`kill_switch.${m.module_key}`);
        return { ...m, killActive: enabled };
      }));

      setModules(modsWithKill);
      setRecentRuns(runs);
      setAuditLog(audit);
      setLoading(false);
    })();
  }, []);

  const withShadow = modules.filter((m) => m.version?.shadow_version);
  const inBeta = modules.filter((m) =>
    m.version?.rollout_status === 'internal_beta' || m.version?.rollout_status === 'org_beta'
  );
  const killSwitchCount = modules.filter((m) => m.killActive).length;
  const failedRuns = recentRuns.filter((r) => r.status === 'failed');

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Shadow Admin</h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Private control plane for module testing, versioning, and safe rollout
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard icon={Layers}       label="Total Modules"     value={String(modules.length)}        color="blue" />
            <StatCard icon={GitBranch}    label="Shadow Versions"   value={String(withShadow.length)}     color="amber" />
            <StatCard icon={Activity}     label="In Beta"           value={String(inBeta.length)}         color="green" />
            <StatCard icon={Zap}          label="Kill Switches On"  value={String(killSwitchCount)}       color={killSwitchCount > 0 ? 'red' : 'gray'} />
          </div>

          {/* Kill switch alerts */}
          {killSwitchCount > 0 && (
            <div className="bg-red-950/50 border border-red-800 rounded-xl p-4 flex items-start gap-3">
              <Zap className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-red-300 mb-1">
                  {killSwitchCount} module kill switch{killSwitchCount > 1 ? 'es' : ''} active
                </div>
                <p className="text-xs text-red-400/80">
                  Affected modules are forced to live version. No shadow routing.
                </p>
                <a href="/shadow/admin/kill-switch" className="text-xs text-red-300 hover:text-red-200 mt-2 inline-flex items-center gap-1">
                  Manage kill switches <ArrowRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Failed runs */}
          {failedRuns.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-800 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-amber-300 mb-1">
                  {failedRuns.length} recent shadow run{failedRuns.length > 1 ? 's' : ''} failed
                </div>
                <p className="text-xs text-amber-400/80">Review run history for error details.</p>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Modules overview */}
            <section className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Module Overview</h2>
                <a href="/shadow/modules" className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </a>
              </div>
              <div className="divide-y divide-gray-800/60">
                {loading ? (
                  <div className="px-5 py-8 text-center text-gray-500 text-sm">Loading...</div>
                ) : modules.slice(0, 6).map((m) => (
                  <a key={m.module_key} href={`/shadow/modules/${m.module_key}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/50 transition-colors"
                  >
                    <div>
                      <div className="text-sm text-white">{m.module_name}</div>
                      <div className="text-xs text-gray-500 font-mono">{m.module_key}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.killActive && <Zap className="w-3.5 h-3.5 text-red-400" />}
                      {m.version?.shadow_version && (
                        <span className="text-xs bg-blue-950 text-blue-400 border border-blue-800 px-2 py-0.5 rounded-full">
                          shadow: {m.version.shadow_version}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 font-mono">{m.version?.live_version ?? 'v1'}</span>
                    </div>
                  </a>
                ))}
              </div>
            </section>

            {/* Recent runs */}
            <section className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-white">Recent Shadow Runs</h2>
              </div>
              <div className="divide-y divide-gray-800/60">
                {loading ? (
                  <div className="px-5 py-8 text-center text-gray-500 text-sm">Loading...</div>
                ) : recentRuns.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-500 text-sm">No runs yet</div>
                ) : recentRuns.map((run) => (
                  <div key={run.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <div className="text-xs text-gray-300 font-mono">{run.module_key}</div>
                      <div className="text-xs text-gray-500">{run.run_mode}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {run.status === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                      {run.status === 'failed' && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                      {run.status === 'running' && <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />}
                      <span className={`text-xs font-medium ${
                        run.status === 'completed' ? 'text-green-400' :
                        run.status === 'failed' ? 'text-red-400' : 'text-gray-400'
                      }`}>{run.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Phase 14 — Multi-Trade Intelligence Platform entry point */}
          <section className="bg-teal-900/10 border border-teal-700/30 rounded-xl p-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-teal-400" />
                  Multi-Trade Intelligence Platform
                </h2>
                <p className="text-[10px] text-gray-500 mt-1">
                  Cross-trade learning, module health, pattern detection, and global optimization across all trade parsers.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <a href="/shadow/intelligence/dashboard" className="text-xs font-semibold px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white transition-colors">
                  Open platform dashboard →
                </a>
                <a href="/shadow/modules/plumbing_parser/optimization" className="text-xs px-3 py-2 rounded-lg border border-teal-700/40 text-teal-300 hover:bg-teal-900/30 transition-colors">
                  Optimization engine →
                </a>
              </div>
            </div>
          </section>

          {/* Recent audit log */}
          <section className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Recent Admin Actions</h2>
              <a href="/shadow/admin/audit-log" className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                Full log <ArrowRight className="w-3 h-3" />
              </a>
            </div>
            <div className="divide-y divide-gray-800/60">
              {auditLog.length === 0 ? (
                <div className="px-5 py-6 text-center text-gray-500 text-sm">No actions logged yet</div>
              ) : auditLog.slice(0, 5).map((entry: Record<string, unknown>) => (
                <div key={String(entry.id)} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <span className="text-xs font-mono text-amber-400">{String(entry.action)}</span>
                    {entry.module_key && (
                      <span className="text-xs text-gray-500 ml-2">on {String(entry.module_key)}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">
                    {new Date(String(entry.created_at)).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string;
  color: 'blue' | 'amber' | 'green' | 'red' | 'gray';
}) {
  const colors = {
    blue:  'bg-blue-950/60 border-blue-800/60 text-blue-400',
    amber: 'bg-amber-950/60 border-amber-800/60 text-amber-400',
    green: 'bg-green-950/60 border-green-800/60 text-green-400',
    red:   'bg-red-950/60 border-red-800/60 text-red-400',
    gray:  'bg-gray-900 border-gray-800 text-gray-500',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <Icon className="w-5 h-5 mb-2 opacity-80" />
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs opacity-70 mt-0.5">{label}</div>
    </div>
  );
}
