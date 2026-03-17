import { useState, useEffect } from 'react';
import { Save, Loader2, Plus, Trash2, Settings } from 'lucide-react';
import { usePlantSettings, usePlantCategories } from '../../lib/plantHire/usePlantHire';
import { useOrganisation } from '../../lib/organisationContext';
import { supabase } from '../../lib/supabase';

export default function PlantSettings() {
  const { currentOrganisation } = useOrganisation();
  const { settings, loading, saveSettings } = usePlantSettings();
  const { categories, refresh: refreshCategories } = usePlantCategories();
  const [form, setForm] = useState({ claim_period_end_day: 25, default_currency: 'NZD', require_delivery_event_for_on_hire: true, require_collection_event_for_off_hire: true });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        claim_period_end_day: settings.claim_period_end_day,
        default_currency: settings.default_currency,
        require_delivery_event_for_on_hire: settings.require_delivery_event_for_on_hire,
        require_collection_event_for_off_hire: settings.require_collection_event_for_off_hire,
      });
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await saveSettings(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addCategory = async () => {
    if (!newCatName.trim() || !currentOrganisation?.id) return;
    setAddingCat(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('vs_plant_categories').insert({
      organisation_id: currentOrganisation.id,
      name: newCatName.trim(),
      created_by: user?.id,
    });
    setNewCatName('');
    setAddingCat(false);
    refreshCategories();
  };

  const deleteCategory = async (id: string) => {
    await supabase.from('vs_plant_categories').update({ active: false }).eq('id', id);
    refreshCategories();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="text-slate-500 animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Claim Period Settings */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700/50">
          <Settings size={15} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">Claim Period Settings</span>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Claim Period End Day</label>
              <input
                type="number"
                min={1}
                max={31}
                value={form.claim_period_end_day}
                onChange={e => setForm(f => ({ ...f, claim_period_end_day: parseInt(e.target.value) || 25 }))}
                className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
              />
              <p className="text-xs text-slate-500 mt-1">
                e.g. 25 = periods run 26th to 25th of each month
              </p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Default Currency</label>
              <select
                value={form.default_currency}
                onChange={e => setForm(f => ({ ...f, default_currency: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="NZD">NZD</option>
                <option value="AUD">AUD</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Charge Event Rules</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.require_delivery_event_for_on_hire}
                onChange={e => setForm(f => ({ ...f, require_delivery_event_for_on_hire: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500"
              />
              <div>
                <p className="text-sm text-slate-300">Require delivery event for on-hire charge</p>
                <p className="text-xs text-slate-500">On-hire fixed charge only created when delivery is recorded</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.require_collection_event_for_off_hire}
                onChange={e => setForm(f => ({ ...f, require_collection_event_for_off_hire: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500"
              />
              <div>
                <p className="text-sm text-slate-300">Require collection event for off-hire charge</p>
                <p className="text-xs text-slate-500">Off-hire fixed charge only created when collection is recorded</p>
              </div>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>

      {/* Plant Categories */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <span className="text-sm font-semibold text-white">Plant Categories</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              placeholder="Category name..."
              className="flex-1 bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            <button
              onClick={addCategory}
              disabled={addingCat || !newCatName.trim()}
              className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {addingCat ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Add
            </button>
          </div>
          {categories.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No categories yet</p>
          ) : (
            <div className="space-y-1">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/30">
                  <span className="text-sm text-slate-200">{cat.name}</span>
                  <button onClick={() => deleteCategory(cat.id)} className="p-1 text-slate-500 hover:text-red-400 transition-colors rounded">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
