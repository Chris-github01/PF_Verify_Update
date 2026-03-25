import { useEffect, useState, useCallback } from 'react';
import { ScrollText, Search, Filter, RefreshCw, X } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import { dbGetAuditLog } from '../../lib/db/auditLogs';
import type { AdminAuditLogRecord } from '../../types/shadow';

const ACTION_OPTIONS = [
  '', 'create_feature_flag', 'update_feature_flag', 'enable_feature_flag', 'disable_feature_flag',
  'update_module_version', 'promote_module', 'rollback_module',
  'kill_switch_enable', 'kill_switch_disable', 'update_rollout_status',
];

const ENTITY_OPTIONS = [
  '', 'feature_flags', 'module_versions', 'shadow_runs', 'module_registry', 'rollout_events',
];

export default function ShadowAuditLogPage() {
  const [entries, setEntries] = useState<AdminAuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [moduleKey, setModuleKey] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dbGetAuditLog({
        moduleKey: moduleKey || undefined,
        action: action || undefined,
        entityType: entityType || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 300,
      });
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [moduleKey, action, entityType, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.action.toLowerCase().includes(s) ||
      (e.module_key ?? '').toLowerCase().includes(s) ||
      (e.entity_type ?? '').toLowerCase().includes(s) ||
      (e.entity_id ?? '').toLowerCase().includes(s)
    );
  });

  function clearFilters() {
    setModuleKey('');
    setAction('');
    setEntityType('');
    setFromDate('');
    setToDate('');
  }

  const hasActiveFilters = moduleKey || action || entityType || fromDate || toDate;

  const actionColor = (a: string) => {
    if (a.includes('kill_switch')) return 'text-red-400';
    if (a.includes('disable') || a.includes('rollback')) return 'text-orange-400';
    if (a.includes('enable') || a.includes('promote')) return 'text-green-400';
    if (a.includes('create')) return 'text-cyan-400';
    if (a.includes('update')) return 'text-amber-300';
    return 'text-gray-300';
  };

  return (
    <ShadowLayout>
      <div className="max-w-6xl mx-auto space-y-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white">Audit Log</h1>
              <p className="text-gray-400 text-sm mt-0.5">All admin actions — append only, never editable</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border transition-colors ${
                  filtersOpen || hasActiveFilters
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {hasActiveFilters && <span className="bg-amber-500 text-gray-950 text-[10px] font-bold px-1 rounded">ON</span>}
              </button>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Quick search..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          </div>

          {filtersOpen && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Module Key</label>
                <input
                  value={moduleKey}
                  onChange={(e) => setModuleKey(e.target.value)}
                  placeholder="e.g. plumbing_parser"
                  className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Action</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                >
                  {ACTION_OPTIONS.map((a) => (
                    <option key={a} value={a}>{a || 'All actions'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Entity Type</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                >
                  {ENTITY_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t || 'All types'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="flex items-end">
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-800 rounded-lg transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          {loading ? (
            <div className="text-center py-16 text-gray-500 text-sm">Loading audit log...</div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-500">{filtered.length} entries</span>
                <ScrollText className="w-4 h-4 text-gray-700" />
              </div>
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm flex flex-col items-center gap-3">
                  <ScrollText className="w-8 h-8 text-gray-700" />
                  No actions match your filters
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/60">
                      {['Time', 'Action', 'Entity', 'Module', 'Changes'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {filtered.map((entry) => (
                      <>
                        <tr
                          key={entry.id}
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                          className="hover:bg-gray-800/30 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(entry.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-mono text-xs ${actionColor(entry.action)}`}>{entry.action}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {entry.entity_type ? (
                              <span>{entry.entity_type}{entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ''}</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">
                            {entry.module_key ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">
                            {entry.after_json ? JSON.stringify(entry.after_json).slice(0, 60) : ''}
                          </td>
                        </tr>
                        {expanded === entry.id && (
                          <tr key={`${entry.id}-expanded`} className="bg-gray-950/60">
                            <td colSpan={5} className="px-4 py-4">
                              <div className="grid sm:grid-cols-2 gap-4">
                                {entry.before_json && (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1 font-medium">Before</div>
                                    <pre className="text-xs text-red-300 bg-red-950/20 border border-red-900/30 rounded-lg p-3 overflow-auto max-h-40">
                                      {JSON.stringify(entry.before_json, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {entry.after_json && (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1 font-medium">After</div>
                                    <pre className="text-xs text-green-300 bg-green-950/20 border border-green-900/30 rounded-lg p-3 overflow-auto max-h-40">
                                      {JSON.stringify(entry.after_json, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                              {entry.actor_user_id && (
                                <div className="mt-2 text-xs text-gray-600">
                                  Actor: <span className="font-mono text-gray-500">{entry.actor_user_id}</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
      </div>
    </ShadowLayout>
  );
}
