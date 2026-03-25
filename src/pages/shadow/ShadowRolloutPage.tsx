import { useEffect, useState } from 'react';
import { Zap, GitBranch, Users, Globe, ChevronRight, Clock, ArrowRight } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ModuleVersionBadge from '../../components/shadow/ModuleVersionBadge';
import { getAllModules, updateModuleVersion } from '../../lib/shadow/moduleRegistry';
import { dbGetRecentRolloutEvents } from '../../lib/db/rolloutEvents';
import type { ModuleRegistryRecord, ModuleVersionRecord, RolloutStatus, RolloutEventRecord } from '../../types/shadow';

interface Row extends ModuleRegistryRecord { version?: ModuleVersionRecord }

const ROLLOUT_GROUPS: { status: RolloutStatus; label: string; icon: React.ElementType; color: string }[] = [
  { status: 'internal_beta',   label: 'Internal Beta',    icon: GitBranch, color: 'text-cyan-400' },
  { status: 'org_beta',        label: 'Org Beta',         icon: Users,     color: 'text-teal-400' },
  { status: 'partial_rollout', label: 'Partial Rollout',  icon: Zap,       color: 'text-amber-400' },
  { status: 'global_live',     label: 'Global Live',      icon: Globe,     color: 'text-green-400' },
  { status: 'rolled_back',     label: 'Rolled Back',      icon: GitBranch, color: 'text-red-400' },
];

const EVENT_COLORS: Record<string, string> = {
  kill_switch_enabled: 'text-red-400',
  kill_switch_disabled: 'text-green-400',
  global_promoted: 'text-green-300',
  rollback_triggered: 'text-orange-400',
  shadow_only: 'text-cyan-400',
  internal_beta: 'text-cyan-400',
  org_beta: 'text-teal-400',
  partial_rollout: 'text-amber-400',
  global_live: 'text-green-400',
  rolled_back: 'text-red-400',
};

export default function ShadowRolloutPage() {
  const [modules, setModules] = useState<Row[]>([]);
  const [recentEvents, setRecentEvents] = useState<RolloutEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getAllModules(),
      dbGetRecentRolloutEvents(30),
    ]).then(([mods, events]) => {
      setModules(mods);
      setRecentEvents(events);
      setLoading(false);
    });
  }, []);

  async function updateStatus(moduleKey: string, rollout_status: RolloutStatus) {
    setUpdating(moduleKey);
    await updateModuleVersion(moduleKey, { rollout_status });
    const [updated, events] = await Promise.all([
      getAllModules() as Promise<Row[]>,
      dbGetRecentRolloutEvents(30),
    ]);
    setModules(updated);
    setRecentEvents(events);
    setUpdating(null);
  }

  if (loading) return (
    <ShadowLayout>
      <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>
    </ShadowLayout>
  );

  return (
    <ShadowLayout>
      <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h1 className="text-xl font-bold text-white">Rollout Manager</h1>
                <p className="text-gray-400 text-sm mt-0.5">Control the rollout state for each module</p>
              </div>

              {ROLLOUT_GROUPS.map(({ status, label, icon: Icon, color }) => {
                const group = modules.filter((m) => m.version?.rollout_status === status);
                return (
                  <section key={status}>
                    <div className={`flex items-center gap-2 mb-3 ${color}`}>
                      <Icon className="w-4 h-4" />
                      <h2 className="text-sm font-semibold">{label}</h2>
                      <span className="text-xs text-gray-600 ml-1">({group.length})</span>
                    </div>
                    {group.length === 0 ? (
                      <div className="text-xs text-gray-700 pl-6 pb-2">No modules in this state</div>
                    ) : (
                      <div className="space-y-2">
                        {group.map((m) => (
                          <ModuleRolloutRow key={m.module_key} module={m} updating={updating} onUpdate={updateStatus} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}

              <section>
                <div className="flex items-center gap-2 mb-3 text-gray-500">
                  <GitBranch className="w-4 h-4" />
                  <h2 className="text-sm font-semibold">Live Only (no rollout)</h2>
                  <span className="text-xs text-gray-600 ml-1">
                    ({modules.filter((m) => !m.version || m.version.rollout_status === 'live_only').length})
                  </span>
                </div>
                <div className="space-y-2">
                  {modules.filter((m) => !m.version || m.version.rollout_status === 'live_only').map((m) => (
                    <ModuleRolloutRow key={m.module_key} module={m} updating={updating} onUpdate={updateStatus} />
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <h2 className="text-sm font-semibold text-white">Recent Events</h2>
                </div>

                {recentEvents.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-gray-600">No rollout events yet</div>
                ) : (
                  <div className="divide-y divide-gray-800/60">
                    {recentEvents.map((ev) => (
                      <div key={ev.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className={`text-xs font-mono font-medium ${EVENT_COLORS[ev.event_type] ?? 'text-gray-300'}`}>
                              {ev.event_type}
                            </div>
                            <div className="text-xs text-gray-600 font-mono mt-0.5">{ev.module_key}</div>
                          </div>
                          <div className="text-[10px] text-gray-700 whitespace-nowrap shrink-0 mt-0.5">
                            {new Date(ev.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        {ev.previous_state_json && ev.new_state_json && (
                          <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-600">
                            <span className="font-mono">{JSON.stringify(ev.previous_state_json).slice(0, 20)}</span>
                            <ArrowRight className="w-3 h-3 shrink-0" />
                            <span className="font-mono">{JSON.stringify(ev.new_state_json).slice(0, 20)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 mb-3">Status Summary</h3>
                <div className="space-y-2">
                  {[...ROLLOUT_GROUPS, { status: 'live_only' as RolloutStatus, label: 'Live Only', icon: Globe, color: 'text-gray-400' }].map(({ status, label, color }) => {
                    const count = status === 'live_only'
                      ? modules.filter((m) => !m.version || m.version.rollout_status === 'live_only').length
                      : modules.filter((m) => m.version?.rollout_status === status).length;
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <span className={`text-xs ${color}`}>{label}</span>
                        <span className="text-xs font-mono text-gray-500">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
      </div>
    </ShadowLayout>
  );
}

function ModuleRolloutRow({ module, updating, onUpdate }: {
  module: Row;
  updating: string | null;
  onUpdate: (key: string, status: RolloutStatus) => void;
}) {
  return (
    <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 gap-4 flex-wrap">
      <div className="flex items-center gap-4">
        <div>
          <div className="text-sm font-medium text-white">{module.module_name}</div>
          <div className="text-xs text-gray-600 font-mono">{module.module_key}</div>
        </div>
        {module.version && <ModuleVersionBadge status={module.version.rollout_status} />}
      </div>
      <div className="flex items-center gap-2">
        <select
          disabled={updating === module.module_key}
          value={module.version?.rollout_status ?? 'live_only'}
          onChange={(e) => onUpdate(module.module_key, e.target.value as RolloutStatus)}
          className="text-xs bg-gray-800 border border-gray-700 text-white px-3 py-1.5 rounded-lg focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
        >
          <option value="live_only">Live Only</option>
          <option value="shadow_only">Shadow Only</option>
          <option value="internal_beta">Internal Beta</option>
          <option value="org_beta">Org Beta</option>
          <option value="partial_rollout">Partial Rollout</option>
          <option value="global_live">Global Live</option>
          <option value="rolled_back">Rolled Back</option>
        </select>
        <a href={`/shadow/modules/${module.module_key}`} className="text-amber-400 hover:text-amber-300">
          <ChevronRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
