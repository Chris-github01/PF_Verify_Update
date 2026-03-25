import { useEffect, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import { getAuditLog } from '../../lib/shadow/auditLogger';

export default function ShadowAuditLogPage() {
  const [entries, setEntries] = useState<Record<string, unknown>[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuditLog({ limit: 200 }).then((d) => { setEntries(d); setLoading(false); });
  }, []);

  const filtered = entries.filter((e) =>
    !filter ||
    String(e.action).toLowerCase().includes(filter.toLowerCase()) ||
    String(e.module_key ?? '').toLowerCase().includes(filter.toLowerCase()) ||
    String(e.entity_type ?? '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white">Audit Log</h1>
              <p className="text-gray-400 text-sm mt-0.5">All admin actions — append only, never editable</p>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter actions..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-500 text-sm">Loading audit log...</div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm flex flex-col items-center gap-3">
                  <ScrollText className="w-8 h-8 text-gray-700" />
                  No actions logged yet
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/60">
                      {['Time', 'Action', 'Entity', 'Module', 'Details'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {filtered.map((entry) => (
                      <tr key={String(entry.id)} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(String(entry.created_at)).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-amber-300">{String(entry.action)}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {entry.entity_type ? (
                            <span>{String(entry.entity_type)}{entry.entity_id ? ` · ${String(entry.entity_id).slice(0, 8)}` : ''}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">{entry.module_key ? String(entry.module_key) : '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">
                          {entry.after_json ? JSON.stringify(entry.after_json).slice(0, 60) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}
