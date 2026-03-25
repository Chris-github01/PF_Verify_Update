import { useEffect, useState } from 'react';
import { Plus, Flag, ToggleLeft, ToggleRight, Pencil } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import { getAllFlags, upsertFlag } from '../../lib/shadow/featureFlags';
import type { FeatureFlagRecord } from '../../types/shadow';

export default function ShadowFeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlagRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newFlag, setNewFlag] = useState({ flag_key: '', module_key: '', target_type: 'global', enabled: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const data = await getAllFlags();
    setFlags(data);
    setLoading(false);
  }

  async function toggleFlag(flag: FeatureFlagRecord) {
    await upsertFlag({ ...flag, enabled: !flag.enabled });
    load();
  }

  async function saveNewFlag() {
    if (!newFlag.flag_key) return;
    setSaving(true);
    await upsertFlag({
      flag_key: newFlag.flag_key,
      module_key: newFlag.module_key || undefined,
      target_type: newFlag.target_type,
      enabled: newFlag.enabled,
      environment: 'production',
      config_json: {},
    } as FeatureFlagRecord);
    setNewFlag({ flag_key: '', module_key: '', target_type: 'global', enabled: false });
    setShowNew(false);
    setSaving(false);
    load();
  }

  const filtered = flags.filter((f) =>
    !filter ||
    f.flag_key.toLowerCase().includes(filter.toLowerCase()) ||
    (f.module_key ?? '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white">Feature Flags</h1>
              <p className="text-gray-400 text-sm mt-0.5">Control module routing and rollout targeting</p>
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 text-sm bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-4 py-2 rounded-lg transition-colors font-medium"
            >
              <Plus className="w-4 h-4" /> New Flag
            </button>
          </div>

          {/* Filter */}
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by flag key or module..."
            className="w-full px-4 py-2.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
          />

          {/* New flag form */}
          {showNew && (
            <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                <Flag className="w-4 h-4" /> New Feature Flag
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Flag Key *</label>
                  <input
                    value={newFlag.flag_key}
                    onChange={(e) => setNewFlag({ ...newFlag, flag_key: e.target.value })}
                    placeholder="e.g. shadow.plumbing_parser.enabled"
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Module Key</label>
                  <input
                    value={newFlag.module_key}
                    onChange={(e) => setNewFlag({ ...newFlag, module_key: e.target.value })}
                    placeholder="e.g. plumbing_parser"
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Target Type</label>
                  <select
                    value={newFlag.target_type}
                    onChange={(e) => setNewFlag({ ...newFlag, target_type: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="global">Global</option>
                    <option value="org">Org</option>
                    <option value="user">User</option>
                    <option value="role">Role</option>
                    <option value="percentage">Percentage</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFlag.enabled}
                      onChange={(e) => setNewFlag({ ...newFlag, enabled: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-300">Enabled</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  disabled={saving || !newFlag.flag_key}
                  onClick={saveNewFlag}
                  className="text-sm bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-600 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Create Flag'}
                </button>
                <button
                  onClick={() => setShowNew(false)}
                  className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Flags table */}
          {loading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading flags...</div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">No flags found. Create one above.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/60">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Flag Key</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Module</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Environment</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {filtered.map((flag) => (
                      <tr key={flag.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-amber-300">{flag.flag_key}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 font-mono">{flag.module_key ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full border border-gray-700">
                            {flag.target_type}
                            {flag.target_id ? `: ${flag.target_id.slice(0, 8)}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{flag.environment}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => toggleFlag(flag)} className="inline-flex items-center gap-1 transition-colors">
                            {flag.enabled ? (
                              <ToggleRight className="w-5 h-5 text-green-400" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-gray-600" />
                            )}
                            <span className={`text-xs font-medium ${flag.enabled ? 'text-green-400' : 'text-gray-600'}`}>
                              {flag.enabled ? 'ON' : 'OFF'}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button className="text-gray-600 hover:text-gray-300 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
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
