import { useEffect, useState } from 'react';
import { Plus, Flag, ToggleLeft, ToggleRight, Pencil, X, Save } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import { dbGetAllFlags, dbUpsertFlag, dbToggleFlag } from '../../lib/db/featureFlags';
import type { FeatureFlagRecord } from '../../types/shadow';

const ENV_OPTIONS = ['production', 'staging', 'development'] as const;
const TARGET_OPTIONS = ['global', 'org', 'user', 'role', 'percentage'] as const;

interface EditState {
  flag_key: string;
  module_key: string;
  target_type: string;
  target_id: string;
  environment: string;
  enabled: boolean;
  priority: number;
  config_json_str: string;
}

const defaultEdit = (): EditState => ({
  flag_key: '',
  module_key: '',
  target_type: 'global',
  target_id: '',
  environment: 'production',
  enabled: false,
  priority: 100,
  config_json_str: '{}',
});

export default function ShadowFeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlagRecord[]>([]);
  const [filter, setFilter] = useState('');
  const [envFilter, setEnvFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState>(defaultEdit());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await dbGetAllFlags();
      setFlags(data);
    } catch (e) {
      setError('Failed to load feature flags.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setForm(defaultEdit());
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(flag: FeatureFlagRecord) {
    setForm({
      flag_key: flag.flag_key,
      module_key: flag.module_key ?? '',
      target_type: flag.target_type,
      target_id: flag.target_id ?? '',
      environment: flag.environment,
      enabled: flag.enabled,
      priority: flag.priority,
      config_json_str: JSON.stringify(flag.config_json, null, 2),
    });
    setEditingId(flag.id);
    setFormError(null);
    setShowForm(true);
  }

  async function handleToggle(flag: FeatureFlagRecord) {
    try {
      await dbToggleFlag(flag.id, !flag.enabled);
      setFlags((prev) => prev.map((f) => f.id === flag.id ? { ...f, enabled: !f.enabled } : f));
    } catch (e) {
      console.error('Toggle failed:', e);
    }
  }

  async function handleSave() {
    if (!form.flag_key.trim()) { setFormError('Flag key is required'); return; }
    let configJson: Record<string, unknown> = {};
    try {
      configJson = JSON.parse(form.config_json_str || '{}');
    } catch {
      setFormError('Config JSON is not valid JSON');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await dbUpsertFlag({
        flag_key: form.flag_key.trim(),
        module_key: form.module_key.trim() || undefined,
        target_type: form.target_type,
        target_id: form.target_id.trim() || undefined,
        environment: form.environment as FeatureFlagRecord['environment'],
        enabled: form.enabled,
        priority: form.priority,
        config_json: configJson,
      } as FeatureFlagRecord, editingId ?? undefined);
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (e) {
      setFormError('Failed to save flag. Check console for details.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const filtered = flags.filter((f) => {
    const matchText = !filter ||
      f.flag_key.toLowerCase().includes(filter.toLowerCase()) ||
      (f.module_key ?? '').toLowerCase().includes(filter.toLowerCase());
    const matchEnv = !envFilter || f.environment === envFilter;
    const matchTarget = !targetFilter || f.target_type === targetFilter;
    return matchText && matchEnv && matchTarget;
  });

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white">Feature Flags</h1>
              <p className="text-gray-400 text-sm mt-0.5">Control module routing and rollout targeting</p>
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-2 text-sm bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-4 py-2 rounded-lg transition-colors font-medium"
            >
              <Plus className="w-4 h-4" /> New Flag
            </button>
          </div>

          <div className="flex gap-3 flex-wrap">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by flag key or module..."
              className="flex-1 min-w-[200px] px-4 py-2.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
            />
            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
            >
              <option value="">All Environments</option>
              {ENV_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
            >
              <option value="">All Target Types</option>
              {TARGET_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {showForm && (
            <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <Flag className="w-4 h-4" />
                  {editingId ? 'Edit Feature Flag' : 'New Feature Flag'}
                </h3>
                <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Flag Key *</label>
                  <input
                    value={form.flag_key}
                    onChange={(e) => setForm({ ...form, flag_key: e.target.value })}
                    placeholder="e.g. shadow.plumbing_parser.enabled"
                    disabled={!!editingId}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Module Key</label>
                  <input
                    value={form.module_key}
                    onChange={(e) => setForm({ ...form, module_key: e.target.value })}
                    placeholder="e.g. plumbing_parser"
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Target Type</label>
                  <select
                    value={form.target_type}
                    onChange={(e) => setForm({ ...form, target_type: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                  >
                    {TARGET_OPTIONS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Target ID</label>
                  <input
                    value={form.target_id}
                    onChange={(e) => setForm({ ...form, target_id: e.target.value })}
                    placeholder="UUID or role name"
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Environment</label>
                  <select
                    value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                  >
                    {ENV_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Priority</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 100 })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Config JSON</label>
                  <textarea
                    value={form.config_json_str}
                    onChange={(e) => setForm({ ...form, config_json_str: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white font-mono placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-300">Enabled immediately</span>
                  </label>
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">{formError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  disabled={saving}
                  onClick={handleSave}
                  className="flex items-center gap-2 text-sm bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-600 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Flag'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-gray-500 text-sm">Loading flags...</div>
          ) : error ? (
            <div className="text-center py-12 text-red-400 text-sm">{error}</div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm flex flex-col items-center gap-3">
                  <Flag className="w-8 h-8 text-gray-700" />
                  {flags.length === 0 ? 'No flags yet. Create one above.' : 'No flags match your filters.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 bg-gray-900/60">
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Flag Key</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Module</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Env</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {filtered.map((flag) => (
                        <tr key={flag.id} className="hover:bg-gray-800/30 transition-colors">
                          <td className="px-5 py-3">
                            <span className="font-mono text-xs text-amber-300">{flag.flag_key}</span>
                            {flag.config_json && Object.keys(flag.config_json).length > 0 && (
                              <div className="text-xs text-gray-600 mt-0.5 font-mono truncate max-w-xs">
                                {JSON.stringify(flag.config_json).slice(0, 50)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 font-mono">{flag.module_key ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full border border-gray-700">
                              {flag.target_type}
                              {flag.target_id ? `: ${String(flag.target_id).slice(0, 8)}` : ''}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{flag.environment}</td>
                          <td className="px-4 py-3 text-xs text-gray-600 tabular-nums">{flag.priority}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => handleToggle(flag)} className="inline-flex items-center gap-1 transition-colors">
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
                            <button
                              onClick={() => openEdit(flag)}
                              className="text-gray-600 hover:text-amber-400 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}
