import { useEffect, useState } from 'react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import ModuleVersionBadge from '../../components/shadow/ModuleVersionBadge';
import { getAllModules } from '../../lib/shadow/moduleRegistry';
import type { ModuleRegistryRecord, ModuleVersionRecord } from '../../types/shadow';
import { ChevronRight } from 'lucide-react';

interface Row extends ModuleRegistryRecord { version?: ModuleVersionRecord }

export default function ShadowVersionsPage() {
  const [modules, setModules] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllModules().then((d) => { setModules(d); setLoading(false); });
  }, []);

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-xl font-bold text-white">Module Versions</h1>
            <p className="text-gray-400 text-sm mt-0.5">Live, shadow, candidate and rollback versions for all modules</p>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/60">
                    {['Module', 'Type', 'Live', 'Shadow', 'Candidate', 'Rollback', 'Status', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {modules.map((m) => (
                    <tr key={m.module_key} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-white">{m.module_name}</div>
                        <div className="text-xs text-gray-600 font-mono">{m.module_key}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 capitalize">{m.module_type}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-green-400">{m.version?.live_version ?? 'v1'}</td>
                      <td className="px-4 py-3 font-mono text-sm text-blue-400">{m.version?.shadow_version ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-sm text-amber-400">{m.version?.promoted_candidate_version ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-500">{m.version?.rollback_version ?? '—'}</td>
                      <td className="px-4 py-3">
                        {m.version && <ModuleVersionBadge status={m.version.rollout_status} />}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a href={`/shadow/modules/${m.module_key}`} className="text-amber-400 hover:text-amber-300 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}
