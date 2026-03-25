import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import ShadowModuleCard from '../../components/shadow/ShadowModuleCard';
import { getAllModules, promoteModule, rollbackModule, setKillSwitch } from '../../lib/shadow/moduleRegistry';
import { resolveFlag } from '../../lib/shadow/featureFlags';
import type { ModuleRegistryRecord, ModuleVersionRecord } from '../../types/shadow';

interface Row extends ModuleRegistryRecord { version?: ModuleVersionRecord; killActive: boolean }

export default function ShadowModulesPage() {
  const [modules, setModules] = useState<Row[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const all = await getAllModules();
    const rows = await Promise.all(all.map(async (m) => {
      const { enabled } = await resolveFlag(`kill_switch.${m.module_key}`);
      return { ...m, killActive: enabled } as Row;
    }));
    setModules(rows);
    setLoading(false);
  }

  async function handleKillSwitch(moduleKey: string, active: boolean) {
    await setKillSwitch(moduleKey, active);
    load();
  }

  async function handlePromote(moduleKey: string) {
    if (!confirm(`Promote candidate version for ${moduleKey} to global live?`)) return;
    await promoteModule(moduleKey);
    load();
  }

  async function handleRollback(moduleKey: string) {
    if (!confirm(`Roll back ${moduleKey} to previous live version?`)) return;
    await rollbackModule(moduleKey);
    load();
  }

  const filtered = modules.filter((m) =>
    !filter ||
    m.module_name.toLowerCase().includes(filter.toLowerCase()) ||
    m.module_key.toLowerCase().includes(filter.toLowerCase()) ||
    m.module_type.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white">Module Control Center</h1>
              <p className="text-gray-400 text-sm mt-0.5">Manage all shadow-capable modules</p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter modules..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-500 text-sm">Loading modules...</div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((m) => (
                <ShadowModuleCard
                  key={m.module_key}
                  module={m}
                  version={m.version}
                  killSwitchActive={m.killActive}
                  onKillSwitch={handleKillSwitch}
                  onPromote={handlePromote}
                  onRollback={handleRollback}
                />
              ))}
              {filtered.length === 0 && (
                <div className="col-span-3 text-center py-12 text-gray-500 text-sm">
                  No modules match your filter.
                </div>
              )}
            </div>
          )}
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}
