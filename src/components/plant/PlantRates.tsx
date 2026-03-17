import { useState } from 'react';
import { CreditCard as Edit2, DollarSign, X, Loader2 } from 'lucide-react';
import { usePlantAssets, usePlantRateCard, upsertRateCard, formatCurrency } from '../../lib/plantHire/usePlantHire';
import { useOrganisation } from '../../lib/organisationContext';
import { supabase } from '../../lib/supabase';

interface RateFormData {
  on_hire_fixed: string; off_hire_fixed: string;
  hourly_rate: string; daily_rate: string;
  weekly_rate: string; monthly_rate: string;
  effective_from: string; currency: string;
}

const EMPTY_RATE: RateFormData = {
  on_hire_fixed: '', off_hire_fixed: '',
  hourly_rate: '', daily_rate: '',
  weekly_rate: '', monthly_rate: '',
  effective_from: '', currency: 'NZD',
};

function AssetRateRow({ assetId, assetCode, assetName, onEdit }: {
  assetId: string; assetCode: string; assetName: string; onEdit: (id: string) => void;
}) {
  const { rateCard } = usePlantRateCard(assetId);
  return (
    <tr className="hover:bg-slate-700/20 transition-colors border-b border-slate-700/30 last:border-0">
      <td className="px-4 py-3 text-slate-300 font-mono text-xs">{assetCode}</td>
      <td className="px-4 py-3 text-white font-medium">{assetName}</td>
      <td className="px-4 py-3 text-slate-400">{rateCard ? formatCurrency(rateCard.on_hire_fixed, rateCard.currency) : '—'}</td>
      <td className="px-4 py-3 text-slate-400">{rateCard ? formatCurrency(rateCard.off_hire_fixed, rateCard.currency) : '—'}</td>
      <td className="px-4 py-3 text-slate-400">{rateCard ? formatCurrency(rateCard.daily_rate, rateCard.currency) : '—'}</td>
      <td className="px-4 py-3 text-slate-400">{rateCard ? formatCurrency(rateCard.weekly_rate, rateCard.currency) : '—'}</td>
      <td className="px-4 py-3 text-slate-400">{rateCard ? formatCurrency(rateCard.monthly_rate, rateCard.currency) : '—'}</td>
      <td className="px-4 py-3">
        <button onClick={() => onEdit(assetId)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-600/40 rounded transition-colors">
          <Edit2 size={13} />
        </button>
      </td>
    </tr>
  );
}

function RateModal({ assetId, assetName, onClose, onSaved }: {
  assetId: string; assetName: string; onClose: () => void; onSaved: () => void;
}) {
  const { currentOrganisation } = useOrganisation();
  const { rateCard } = usePlantRateCard(assetId);
  const [form, setForm] = useState<RateFormData>({
    on_hire_fixed: rateCard?.on_hire_fixed?.toString() || '',
    off_hire_fixed: rateCard?.off_hire_fixed?.toString() || '',
    hourly_rate: rateCard?.hourly_rate?.toString() || '',
    daily_rate: rateCard?.daily_rate?.toString() || '',
    weekly_rate: rateCard?.weekly_rate?.toString() || '',
    monthly_rate: rateCard?.monthly_rate?.toString() || '',
    effective_from: rateCard?.effective_from || '',
    currency: rateCard?.currency || 'NZD',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = (v: string) => v.trim() === '' ? null : parseFloat(v);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganisation?.id) return;
    setSaving(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await upsertRateCard(currentOrganisation.id, user?.id || '', assetId, {
      on_hire_fixed: n(form.on_hire_fixed) ?? undefined,
      off_hire_fixed: n(form.off_hire_fixed) ?? undefined,
      hourly_rate: n(form.hourly_rate) ?? undefined,
      daily_rate: n(form.daily_rate) ?? undefined,
      weekly_rate: n(form.weekly_rate) ?? undefined,
      monthly_rate: n(form.monthly_rate) ?? undefined,
      effective_from: form.effective_from || null,
      currency: form.currency,
    });
    setSaving(false);
    if (err) { setError(err); return; }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div>
            <h2 className="text-lg font-bold text-white">Rate Card</h2>
            <p className="text-xs text-slate-400 mt-0.5">{assetName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <RateField label="On-Hire Fixed ($)" value={form.on_hire_fixed} onChange={v => setForm(f => ({ ...f, on_hire_fixed: v }))} />
            <RateField label="Off-Hire Fixed ($)" value={form.off_hire_fixed} onChange={v => setForm(f => ({ ...f, off_hire_fixed: v }))} />
          </div>

          <div className="border-t border-slate-700/50 pt-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Time-Based Rates</p>
            <div className="grid grid-cols-2 gap-4">
              <RateField label="Hourly Rate ($/hr)" value={form.hourly_rate} onChange={v => setForm(f => ({ ...f, hourly_rate: v }))} />
              <RateField label="Daily Rate ($/day)" value={form.daily_rate} onChange={v => setForm(f => ({ ...f, daily_rate: v }))} />
              <RateField label="Weekly Rate ($/week)" value={form.weekly_rate} onChange={v => setForm(f => ({ ...f, weekly_rate: v }))} />
              <RateField label="Monthly Rate ($/month)" value={form.monthly_rate} onChange={v => setForm(f => ({ ...f, monthly_rate: v }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <RateField label="Effective From" value={form.effective_from} onChange={v => setForm(f => ({ ...f, effective_from: v }))} type="date" />
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Currency</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-500/50">
                <option value="NZD">NZD</option>
                <option value="AUD">AUD</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700/50 text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save Rates
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RateField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder="—"
        className="w-full bg-slate-800 border border-slate-700/50 text-slate-200 text-sm rounded-lg px-3 py-2 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50" />
    </div>
  );
}

export default function PlantRates() {
  const { assets, loading, refresh } = usePlantAssets();
  const [editAssetId, setEditAssetId] = useState<string | null>(null);
  const editAsset = assets.find(a => a.id === editAssetId);

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 h-32 animate-pulse" />
      ) : assets.length === 0 ? (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-12 text-center">
          <DollarSign size={36} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No assets registered yet. Add plant assets first.</p>
        </div>
      ) : (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Code', 'Asset', 'On-Hire Fixed', 'Off-Hire Fixed', 'Daily Rate', 'Weekly Rate', 'Monthly Rate', ''].map(h => (
                  <th key={h} className="text-left text-xs text-slate-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map(a => (
                <AssetRateRow key={a.id} assetId={a.id} assetCode={a.asset_code} assetName={a.asset_name} onEdit={setEditAssetId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editAsset && (
        <RateModal
          assetId={editAsset.id}
          assetName={editAsset.asset_name}
          onClose={() => setEditAssetId(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
