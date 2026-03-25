import { useEffect, useState } from 'react';
import { Zap, GitBranch, Users, Globe, ChevronRight } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import ModuleVersionBadge from '../../components/shadow/ModuleVersionBadge';
import { getAllModules, updateModuleVersion } from '../../lib/shadow/moduleRegistry';
import type { ModuleRegistryRecord, ModuleVersionRecord, RolloutStatus } from '../../types/shadow';

interface Row extends ModuleRegistryRecord { version?: ModuleVersionRecord }

const ROLLOUT_GROUPS: { status: RolloutStatus; label: string; icon: React.ElementType; color: string }[] = [
  { status: 'internal_beta',   label: 'Internal Beta',    icon: GitBranch, color: 'text-cyan-400' },
  { status: 'org_beta',        label: 'Org Beta',         icon: Users,     color: 'text-teal-400' },
  { status: 'partial_rollout', label: 'Partial Rollout',  icon: Zap,       color: 'text-amber-400' },
  { status: 'global_live',     label: 'Global Live',      icon: Globe,     color: 'text-green-400' },
  { status: 'rolled_back',     label: 'Rolled Back',      icon: GitBranch, color: 'text-red-400' },
];

export default function ShadowRolloutPage() {
  const [modules, setModules] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    getAllModules().then((d) => { setModules(d); setLoading(false); });
  }, []);

  async function updateStatus(moduleKey: string, rollout_status: RolloutStatus) {
    setUpdating(moduleKey);
    await updateModuleVersion(moduleKey, { rollout_status });
    const updated = await getAllModules() as Row[];
    setModules(updated);
    setUpdating(null);
  }

  if (loading) return (
    <ShadowGuard><ShadowLayout>
      <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>
    </ShadowLayout></ShadowGuard>
  );

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-5xl mx-auto space-y-8">
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

          {/* Modules with no rollout change yet */}
          <section>
            <div className="flex items-center gap-2 mb-3 text-gray-500">
              <GitBranch className="w-4 h-4" />
              <h2 className="text-sm font-semibold">Live Only (no rollout)</h2>
            </div>
            <div className="space-y-2">
              {modules.filter((m) => !m.version || m.version.rollout_status === 'live_only').map((m) => (
                <ModuleRolloutRow key={m.module_key} module={m} updating={updating} onUpdate={updateStatus} />
              ))}
            </div>
          </section>
        </div>
      </ShadowLayout>
    </ShadowGuard>
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
