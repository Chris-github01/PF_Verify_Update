import { useState, useEffect } from 'react';
import { Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import { getAllModules } from '../../lib/shadow/moduleRegistry';
import { setKillSwitch } from '../../lib/shadow/moduleRegistry';
import { resolveFlag } from '../../lib/shadow/featureFlags';
import type { ModuleRegistryRecord } from '../../types/shadow';

interface ModuleKillState {
  module: ModuleRegistryRecord;
  killActive: boolean;
}

export default function KillSwitchPanel() {
  const [modules, setModules] = useState<ModuleKillState[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const all = await getAllModules();
    const states = await Promise.all(all.map(async (m) => {
      const { enabled } = await resolveFlag(`kill_switch.${m.module_key}`);
      return { module: m, killActive: enabled };
    }));
    setModules(states);
    setLoading(false);
  }

  async function handleToggle(moduleKey: string, activate: boolean) {
    if (activate && confirming !== moduleKey) {
      setConfirming(moduleKey);
      return;
    }
    setConfirming(null);
    setSaving(moduleKey);
    await setKillSwitch(moduleKey, activate);
    await load();
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500 text-sm">Loading module states...</div>
    );
  }

  const active = modules.filter((m) => m.killActive);
  const inactive = modules.filter((m) => !m.killActive);

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-red-300">
              {active.length} Kill Switch{active.length > 1 ? 'es' : ''} Active
            </span>
          </div>
          <p className="text-xs text-red-400/80">
            All listed modules are forced to their live versions. Shadow and beta routing is disabled.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {modules.map(({ module, killActive }) => (
          <div
            key={module.module_key}
            className={`flex items-center justify-between px-5 py-4 rounded-xl border transition-all ${
              killActive
                ? 'bg-red-950/30 border-red-800'
                : 'bg-gray-900 border-gray-800'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${killActive ? 'bg-red-500 animate-pulse' : 'bg-gray-700'}`} />
              <div>
                <div className="text-sm font-medium text-white">{module.module_name}</div>
                <div className="text-xs text-gray-500 font-mono">{module.module_key}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {killActive ? (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <Zap className="w-3.5 h-3.5" />
                  <span className="font-medium">KILLED</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-green-400">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="font-medium">Normal</span>
                </div>
              )}

              {confirming === module.module_key ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Confirm?
                  </span>
                  <button
                    onClick={() => handleToggle(module.module_key, true)}
                    className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    Yes, Kill
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  disabled={saving === module.module_key}
                  onClick={() => handleToggle(module.module_key, !killActive)}
                  className={`
                    text-xs px-4 py-1.5 rounded-lg border font-medium transition-colors
                    ${killActive
                      ? 'bg-green-600/20 hover:bg-green-600/30 text-green-300 border-green-700'
                      : 'bg-red-600/20 hover:bg-red-600/30 text-red-300 border-red-700'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {saving === module.module_key ? 'Saving...' : killActive ? 'Disable Kill Switch' : 'Activate Kill Switch'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
