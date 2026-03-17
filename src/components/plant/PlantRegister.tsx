import { useState } from 'react';
import { Plus, CreditCard as Edit2, Power, Package, ChevronRight, X, Loader2 } from 'lucide-react';
import { usePlantAssets, usePlantCategories, createPlantAsset, updatePlantAsset } from '../../lib/plantHire/usePlantHire';
import { useOrganisation } from '../../lib/organisationContext';
import { supabase } from '../../lib/supabase';
import type { PlantAsset, PlantAssetStatus, HireUnit } from '../../types/plantHire.types';

const STATUS_BADGE: Record<PlantAssetStatus, { label: string; color: string }> = {
  AVAILABLE:      { label: 'Available',   color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  ON_HIRE:        { label: 'On Hire',     color: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  IN_MAINTENANCE: { label: 'Maintenance', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  INACTIVE:       { label: 'Inactive',    color: 'bg-slate-600/30 text-slate-400 border-slate-600/30' },
};

const HIRE_UNITS: HireUnit[] = ['HOUR', 'DAY', 'WEEK', 'MONTH'];

interface AssetFormData {
  asset_code: string; asset_name: string; category_id: string;
  description: string; make: string; model: string;
  serial_number: string; registration_number: string; size_capacity: string;
  default_hire_unit: HireUnit; purchase_date: string; notes: string;
  current_status: PlantAssetStatus;
  external_hire_supplier: string; rechargeable_to_client: boolean;
  internal_cost_centre: string; operator_required: boolean;
}

const EMPTY_FORM: AssetFormData = {
  asset_code: '', asset_name: '', category_id: '', description: '',
  make: '', model: '', serial_number: '', registration_number: '',
  size_capacity: '', default_hire_unit: 'DAY', purchase_date: '', notes: '',
  current_status: 'AVAILABLE',
  external_hire_supplier: '', rechargeable_to_client: false,
  internal_cost_centre: '', operator_required: false,
};

interface Props {
  onBookAsset?: (assetId: string) => void;
}

export default function PlantRegister({ onBookAsset }: Props) {
  const { currentOrganisation } = useOrganisation();
  const { assets, loading, refresh } = usePlantAssets(true);
  const { categories } = usePlantCategories();
  const [showModal, setShowModal] = useState(false);
  const [editAsset, setEditAsset] = useState<PlantAsset | null>(null);
  const [form, setForm] = useState<AssetFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const openAdd = () => { setEditAsset(null); setForm(EMPTY_FORM); setError(null); setShowModal(true); };
  const openEdit = (asset: PlantAsset) => {
    setEditAsset(asset);
    setForm({
      asset_code: asset.asset_code, asset_name: asset.asset_name,
      category_id: asset.category_id || '', description: asset.description || '',
      make: asset.make || '', model: asset.model || '',
      serial_number: asset.serial_number || '', registration_number: asset.registration_number || '',
      size_capacity: asset.size_capacity || '', default_hire_unit: asset.default_hire_unit,
      purchase_date: asset.purchase_date || '', notes: asset.notes || '',
      current_status: asset.current_status,
      external_hire_supplier: asset.external_hire_supplier || '',
      rechargeable_to_client: asset.rechargeable_to_client,
      internal_cost_centre: asset.internal_cost_centre || '',
      operator_required: asset.operator_required,
    });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganisation?.id) return;
    if (!form.asset_code.trim() || !form.asset_name.trim()) {
      setError('Asset code and name are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      ...form,
      category_id: form.category_id || null,
      purchase_date: form.purchase_date || null,
    };
    if (editAsset) {
      const { error: err } = await updatePlantAsset(editAsset.id, user?.id || '', payload);
      if (err) { setError(err); setSaving(false); return; }
    } else {
      const { error: err } = await createPlantAsset(currentOrganisation.id, user?.id || '', payload);
      if (err) { setError(err); setSaving(false); return; }
    }
    setSaving(false);
    setShowModal(false);
    refresh();
  };

  const toggleActive = async (asset: PlantAsset) => {
    const { data: { user } } = await supabase.auth.getUser();
    await updatePlantAsset(asset.id, user?.id || '', { active: !asset.active });
    refresh();
  };

  const filtered = assets.filter(a => {
    const matchSearch = !search || a.asset_name.toLowerCase().includes(search.toLowerCase()) || a.asset_code.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || a.current_status === filterStatus || (filterStatus === 'inactive' && !a.active);
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 w-full sm:w-auto">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search assets..."
            className="flex-1 bg-slate-800/80 border border-slate-700/50 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/50 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="all">All Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="ON_HIRE">On Hire</option>
            <option value="IN_MAINTENANCE">Maintenance</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-sm rounded-lg transition-colors shrink-0"
        >
          <Plus size={15} />
          Add Plant
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="text-slate-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-12 text-center">
          <Package size={36} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No plant assets found</p>
          <button onClick={openAdd} className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-sm font-semibold rounded-lg transition-colors">
            Add First Asset
          </button>
        </div>
      ) : (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Code', 'Name', 'Category', 'Make / Model', 'Status', 'Hire Unit', ''].map(h => (
                  <th key={h} className="text-left text-xs text-slate-400 uppercase tracking-wide px-4 py-3 first:pl-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map(asset => {
                const sb = STATUS_BADGE[asset.current_status];
                return (
                  <tr key={asset.id} className={`hover:bg-slate-700/20 transition-colors ${!asset.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{asset.asset_code}</td>
                    <td className="px-4 py-3 text-white font-medium">{asset.asset_name}</td>
                    <td className="px-4 py-3 text-slate-400">{(asset as any).category?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{[asset.make, asset.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${sb.color}`}>{sb.label}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{asset.default_hire_unit}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {onBookAsset && asset.current_status === 'AVAILABLE' && asset.active && (
                          <button
                            onClick={() => onBookAsset(asset.id)}
                            className="p-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 rounded transition-colors"
                            title="Book asset"
                          >
                            <ChevronRight size={14} />
                          </button>
                        )}
                        <button onClick={() => openEdit(asset)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-600/40 rounded transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => toggleActive(asset)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-600/40 rounded transition-colors" title={asset.active ? 'Deactivate' : 'Activate'}>
                          <Power size={14} className={asset.active ? 'text-emerald-400' : 'text-slate-600'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto py-8 px-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
              <h2 className="text-lg font-bold text-white">{editAsset ? 'Edit Asset' : 'Register Plant Asset'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2">{error}</div>}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Asset Code *" value={form.asset_code} onChange={v => setForm(f => ({ ...f, asset_code: v }))} placeholder="e.g. SL-001" />
                <Field label="Asset Name *" value={form.asset_name} onChange={v => setForm(f => ({ ...f, asset_name: v }))} placeholder="e.g. Scissor Lift 8m" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Category</label>
                  <select
                    value={form.category_id}
                    onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value="">No category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Default Hire Unit</label>
                  <select
                    value={form.default_hire_unit}
                    onChange={e => setForm(f => ({ ...f, default_hire_unit: e.target.value as HireUnit }))}
                    className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
                  >
                    {HIRE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Make" value={form.make} onChange={v => setForm(f => ({ ...f, make: v }))} placeholder="e.g. Genie" />
                <Field label="Model" value={form.model} onChange={v => setForm(f => ({ ...f, model: v }))} placeholder="e.g. GS-2632" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Serial Number" value={form.serial_number} onChange={v => setForm(f => ({ ...f, serial_number: v }))} />
                <Field label="Registration / Plate" value={form.registration_number} onChange={v => setForm(f => ({ ...f, registration_number: v }))} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Size / Capacity" value={form.size_capacity} onChange={v => setForm(f => ({ ...f, size_capacity: v }))} placeholder="e.g. 8m working height" />
                <Field label="Purchase Date" type="date" value={form.purchase_date} onChange={v => setForm(f => ({ ...f, purchase_date: v }))} />
              </div>

              {editAsset && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Status</label>
                  <select
                    value={form.current_status}
                    onChange={e => setForm(f => ({ ...f, current_status: e.target.value as PlantAssetStatus }))}
                    className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="ON_HIRE">On Hire</option>
                    <option value="IN_MAINTENANCE">In Maintenance</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
              )}

              <Field label="Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} />

              {/* Future-ready fields */}
              <div className="border-t border-slate-700/50 pt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Additional Fields</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="External Hire Supplier" value={form.external_hire_supplier} onChange={v => setForm(f => ({ ...f, external_hire_supplier: v }))} placeholder="If externally hired" />
                  <Field label="Internal Cost Centre" value={form.internal_cost_centre} onChange={v => setForm(f => ({ ...f, internal_cost_centre: v }))} />
                </div>
                <div className="flex gap-6 mt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.rechargeable_to_client} onChange={e => setForm(f => ({ ...f, rechargeable_to_client: e.target.checked }))} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500" />
                    <span className="text-sm text-slate-300">Rechargeable to client</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.operator_required} onChange={e => setForm(f => ({ ...f, operator_required: e.target.checked }))} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500" />
                    <span className="text-sm text-slate-300">Operator required</span>
                  </label>
                </div>
              </div>

              <Field label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 text-sm transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editAsset ? 'Update' : 'Register Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder = '', type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
      />
    </div>
  );
}
