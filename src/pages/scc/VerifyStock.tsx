import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { VerifyStockSettings } from './VerifyStockSettings';
import { Package, Bell, ClipboardCheck, Plus, AlertTriangle, CheckCircle, XCircle, TrendingUp, Search, X, ChevronDown, RefreshCw, BarChart3, History, ChevronRight, ArrowLeft, CreditCard as Edit3, DollarSign, Layers, Activity, ShoppingCart, ClipboardList, ArrowLeftRight, Minus, Settings as SettingsIcon } from 'lucide-react';
import { useOrganisation } from '../../lib/organisationContext';
import {
  useStockItems,
  useStockItem,
  useStockAlerts,
  useVerifications,
  useAdjustments,
  useVerifyStockSummary,
  useCategoryReports,
  createStockItem,
  updateStockItem,
  recordVerification,
  recordAdjustment,
} from '../../lib/verifystock/useVerifyStock';
import type { StockItemWithLevel, StockAdjustment } from '../../types/verifystock.types';

type View = 'dashboard' | 'catalogue' | 'verify' | 'alerts' | 'reports' | 'item-detail' | 'settings';
type ReportTab = 'overview' | 'inventory' | 'activity';

const STATUS_CONFIG = {
  ok:   { label: 'OK',        color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-500/30', icon: CheckCircle   },
  low:  { label: 'Low Stock', color: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-500/30',   icon: AlertTriangle },
  out:  { label: 'Out',       color: 'text-red-400',     bg: 'bg-red-400/10',     border: 'border-red-500/30',     icon: XCircle       },
  over: { label: 'Overstock', color: 'text-sky-400',     bg: 'bg-sky-400/10',     border: 'border-sky-500/30',     icon: TrendingUp    },
};

const ADJ_COLORS: Record<StockAdjustment['adjustment_type'], string> = {
  ADD: 'text-emerald-400',
  REMOVE: 'text-red-400',
  ADJUST: 'text-sky-400',
  TRANSFER_IN: 'text-teal-400',
  TRANSFER_OUT: 'text-orange-400',
};

function fmt(n: number) {
  return n.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string; color: string; icon?: React.ElementType;
}) {
  return (
    <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-start justify-between">
        <p className="text-slate-400 text-xs uppercase tracking-wide">{label}</p>
        {Icon && <Icon size={14} className={`${color} opacity-60`} />}
      </div>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function AddItemModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { currentOrganisation } = useOrganisation();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', sku: '', category: '', unit: 'ea', min_quantity: 1, max_quantity: '',
    location: '', supplier_name: '', unit_cost: '', notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganisation?.id) return;
    setSaving(true);
    setFormError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await createStockItem(currentOrganisation.id, user?.id ?? '', {
      name: form.name, sku: form.sku || null, category: form.category || null,
      unit: form.unit, min_quantity: Number(form.min_quantity),
      max_quantity: form.max_quantity ? Number(form.max_quantity) : null,
      location: form.location || null, supplier_name: form.supplier_name || null,
      unit_cost: form.unit_cost ? Number(form.unit_cost) : null, notes: form.notes || null,
    });
    setSaving(false);
    if (error) { setFormError(error); return; }
    onSaved(); onClose();
  };

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold text-base">Add Stock Item</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-slate-300 text-sm mb-1 block">Item Name *</label>
              <input required value={form.name} onChange={f('name')} className="input-field" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">SKU</label>
              <input value={form.sku} onChange={f('sku')} className="input-field" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Category</label>
              <input value={form.category} onChange={f('category')} placeholder="e.g. Pipes, Fittings" className="input-field" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Unit *</label>
              <input required value={form.unit} onChange={f('unit')} placeholder="ea, m, m2, kg" className="input-field" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Unit Cost ($)</label>
              <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={f('unit_cost')} className="input-field" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Min Qty *</label>
              <input required type="number" min="0" value={form.min_quantity}
                onChange={e => setForm(p => ({ ...p, min_quantity: Number(e.target.value) }))} className="input-field" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Max Qty</label>
              <input type="number" min="0" value={form.max_quantity} onChange={f('max_quantity')} className="input-field" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Storage Location</label>
              <input value={form.location} onChange={f('location')} placeholder="e.g. Storeroom A" className="input-field" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Supplier</label>
              <input value={form.supplier_name} onChange={f('supplier_name')} className="input-field" />
            </div>
            <div className="col-span-2">
              <label className="text-slate-300 text-sm mb-1 block">Notes</label>
              <textarea rows={2} value={form.notes} onChange={f('notes')}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500 resize-none" />
            </div>
          </div>
          {formError && <p className="text-red-400 text-sm">{formError}</p>}
          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VerifyModal({ item, onClose, onSaved }: { item: StockItemWithLevel; onClose: () => void; onSaved: () => void }) {
  const { currentOrganisation } = useOrganisation();
  const [qty, setQty] = useState(item.stock_level?.quantity_on_hand ?? 0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prev = item.stock_level?.quantity_on_hand ?? 0;
  const diff = qty - prev;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganisation?.id) return;
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await recordVerification(currentOrganisation.id, user?.id ?? '', item.id, qty, prev, notes || null);
    setSaving(false);
    if (err) { setError(err); return; }
    onSaved(); onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold text-base">Verify Stock Count</h2>
            <p className="text-slate-400 text-xs mt-0.5">{item.name}{item.sku ? ` · ${item.sku}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-xs mb-1">System Qty</p>
              <p className="text-white font-bold text-2xl">{prev}<span className="text-slate-500 text-sm ml-1">{item.unit}</span></p>
            </div>
            <div className={`rounded-xl p-3 text-center border ${diff === 0 ? 'bg-slate-800 border-transparent' : diff > 0 ? 'bg-emerald-900/30 border-emerald-600/30' : 'bg-red-900/30 border-red-600/30'}`}>
              <p className="text-slate-400 text-xs mb-1">Discrepancy</p>
              <p className={`font-bold text-2xl ${diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {diff > 0 ? '+' : ''}{diff}<span className="text-slate-500 text-sm ml-1">{item.unit}</span>
              </p>
            </div>
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Physical Count *</label>
            <input required type="number" min="0" value={qty} onChange={e => setQty(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-3 text-white text-xl font-bold text-center focus:outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional..."
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500 resize-none" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? 'Confirming...' : 'Confirm Count'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdjustModal({ item, onClose, onSaved, defaultType = 'ADD' }: { item: StockItemWithLevel; onClose: () => void; onSaved: () => void; defaultType?: StockAdjustment['adjustment_type'] }) {
  const { currentOrganisation } = useOrganisation();
  const [type, setType] = useState<StockAdjustment['adjustment_type']>(defaultType);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganisation?.id) return;
    setSaving(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const currentQty = item.stock_level?.quantity_on_hand ?? 0;
    const { error: err } = await recordAdjustment(
      currentOrganisation.id, user?.id ?? '', item.id, type, qty, currentQty, reason || null, reference || null
    );
    setSaving(false);
    if (err) { setError(err); return; }
    onSaved(); onClose();
  };

  const typeOptions: { value: StockAdjustment['adjustment_type']; label: string; hint: string }[] = [
    { value: 'ADD', label: 'Add Stock', hint: 'Increase quantity on hand' },
    { value: 'REMOVE', label: 'Remove Stock', hint: 'Decrease quantity (allocated to job)' },
    { value: 'ADJUST', label: 'Set Quantity', hint: 'Override to specific quantity' },
    { value: 'TRANSFER_IN', label: 'Transfer In', hint: 'Received from another location' },
    { value: 'TRANSFER_OUT', label: 'Transfer Out', hint: 'Sent to another location' },
  ];

  const current = item.stock_level?.quantity_on_hand ?? 0;
  let preview = current;
  if (type === 'ADD' || type === 'TRANSFER_IN') preview = current + qty;
  else if (type === 'REMOVE' || type === 'TRANSFER_OUT') preview = Math.max(0, current - qty);
  else preview = qty;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold text-base">Adjust Stock</h2>
            <p className="text-slate-400 text-xs mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-xs mb-1">Current</p>
              <p className="text-white font-bold text-xl">{current} <span className="text-slate-500 text-sm">{item.unit}</span></p>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 text-center border border-sky-500/20">
              <p className="text-slate-400 text-xs mb-1">After</p>
              <p className={`font-bold text-xl ${preview < current ? 'text-red-400' : preview > current ? 'text-emerald-400' : 'text-white'}`}>
                {preview} <span className="text-slate-500 text-sm">{item.unit}</span>
              </p>
            </div>
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Adjustment Type</label>
            <div className="relative">
              <select value={type} onChange={e => setType(e.target.value as StockAdjustment['adjustment_type'])}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500 appearance-none pr-8">
                {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
            </div>
            <p className="text-slate-500 text-xs mt-1">{typeOptions.find(o => o.value === type)?.hint}</p>
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">{type === 'ADJUST' ? 'New Quantity' : 'Quantity'} *</label>
            <input required type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:outline-none focus:border-sky-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Reason</label>
              <input value={reason} onChange={e => setReason(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Reference</label>
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="PO, job ref..." className="input-field" />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ItemDetailView({
  itemId,
  onBack,
  onRefreshAll,
}: {
  itemId: string;
  onBack: () => void;
  onRefreshAll: () => void;
}) {
  const { item, loading, refresh: refreshItem } = useStockItem(itemId);
  const { verifications } = useVerifications(itemId);
  const { adjustments } = useAdjustments(itemId);
  const [detailTab, setDetailTab] = useState<'overview' | 'adjustments' | 'verifications'>('overview');
  const [verifyItem, setVerifyItem] = useState<StockItemWithLevel | null>(null);
  const [adjustItem, setAdjustItem] = useState<StockItemWithLevel | null>(null);

  const onSaved = useCallback(() => { refreshItem(); onRefreshAll(); }, [refreshItem, onRefreshAll]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!item) return <p className="text-slate-400 text-sm p-6">Item not found</p>;

  const cfg = STATUS_CONFIG[item.status];
  const qty = item.stock_level?.quantity_on_hand ?? 0;
  const value = qty * (item.unit_cost ?? 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none px-6 py-4 border-b border-slate-800">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors mb-3">
          <ArrowLeft size={14} /> Back to Catalogue
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-white font-bold text-lg">{item.name}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {item.sku && <span className="text-slate-400 text-xs bg-slate-800 px-2 py-0.5 rounded">{item.sku}</span>}
              {item.category && <span className="text-slate-400 text-xs">{item.category}</span>}
              {item.location && <span className="text-slate-400 text-xs">· {item.location}</span>}
            </div>
          </div>
          <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
            <cfg.icon size={11} />{cfg.label}
          </span>
        </div>
        <div className="flex gap-3 mt-3">
          <button onClick={() => setVerifyItem(item)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg font-medium transition-colors">
            <ClipboardCheck size={13} /> Verify Count
          </button>
          <button onClick={() => setAdjustItem(item)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg font-medium transition-colors">
            <Edit3 size={13} /> Adjust Stock
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
            <p className="text-slate-400 text-xs mb-1">On Hand</p>
            <p className="text-white font-bold text-xl">{qty} <span className="text-slate-500 text-sm">{item.unit}</span></p>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
            <p className="text-slate-400 text-xs mb-1">Min / Max</p>
            <p className="text-white font-semibold text-sm">{item.min_quantity} / {item.max_quantity ?? '—'}</p>
          </div>
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
            <p className="text-slate-400 text-xs mb-1">Value</p>
            <p className="text-emerald-400 font-bold text-sm">${fmt(value)}</p>
          </div>
        </div>

        {(item.supplier_name || item.unit_cost) && (
          <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/40 grid grid-cols-2 gap-3 text-sm">
            {item.supplier_name && (
              <div><p className="text-slate-500 text-xs mb-0.5">Supplier</p><p className="text-slate-300">{item.supplier_name}</p></div>
            )}
            {item.unit_cost && (
              <div><p className="text-slate-500 text-xs mb-0.5">Unit Cost</p><p className="text-slate-300">${item.unit_cost}</p></div>
            )}
          </div>
        )}

        {item.notes && (
          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
            <p className="text-slate-500 text-xs mb-1">Notes</p>
            <p className="text-slate-300 text-sm">{item.notes}</p>
          </div>
        )}

        <div className="flex gap-1 border-b border-slate-800 pb-0">
          {(['overview', 'adjustments', 'verifications'] as const).map(t => (
            <button key={t} onClick={() => setDetailTab(t)}
              className={`px-3 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
                detailTab === t ? 'border-sky-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {detailTab === 'overview' && (
          <div className="space-y-2">
            <p className="text-slate-400 text-xs">Last verified: {item.stock_level?.last_verified_at ? new Date(item.stock_level.last_verified_at).toLocaleString() : 'Never'}</p>
            {adjustments.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2 text-sm">
                <div>
                  <span className={`font-medium text-xs ${ADJ_COLORS[a.adjustment_type]}`}>{a.adjustment_type.replace('_', ' ')}</span>
                  {a.reason && <span className="text-slate-500 text-xs ml-2">{a.reason}</span>}
                </div>
                <div className="text-right">
                  <p className={`font-semibold text-sm ${ADJ_COLORS[a.adjustment_type]}`}>{a.adjustment_type === 'REMOVE' || a.adjustment_type === 'TRANSFER_OUT' ? '-' : '+'}{a.quantity}</p>
                  <p className="text-slate-500 text-xs">{new Date(a.adjusted_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {detailTab === 'adjustments' && (
          <div className="space-y-2">
            {adjustments.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">No adjustments yet</p>
            ) : adjustments.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2.5">
                <div>
                  <span className={`font-medium text-xs ${ADJ_COLORS[a.adjustment_type]}`}>{a.adjustment_type.replace('_', ' ')}</span>
                  {a.reason && <p className="text-slate-400 text-xs mt-0.5">{a.reason}</p>}
                  {a.reference && <p className="text-slate-500 text-xs">Ref: {a.reference}</p>}
                </div>
                <div className="text-right">
                  <p className={`font-bold ${ADJ_COLORS[a.adjustment_type]}`}>
                    {a.adjustment_type === 'REMOVE' || a.adjustment_type === 'TRANSFER_OUT' ? '-' : '+'}{a.quantity} {item.unit}
                  </p>
                  <p className="text-slate-500 text-xs">{new Date(a.adjusted_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {detailTab === 'verifications' && (
          <div className="space-y-2">
            {verifications.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-8">No verifications yet</p>
            ) : verifications.map(v => (
              <div key={v.id} className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-white text-sm font-medium">{v.verified_quantity} {item.unit} counted</p>
                  {v.notes && <p className="text-slate-400 text-xs mt-0.5 italic">{v.notes}</p>}
                </div>
                <div className="text-right">
                  {v.discrepancy !== 0 ? (
                    <p className={`font-semibold text-sm ${v.discrepancy > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {v.discrepancy > 0 ? '+' : ''}{v.discrepancy}
                    </p>
                  ) : <p className="text-slate-500 text-sm">No diff</p>}
                  <p className="text-slate-500 text-xs">{new Date(v.verified_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {verifyItem && <VerifyModal item={verifyItem} onClose={() => setVerifyItem(null)} onSaved={onSaved} />}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSaved={onSaved} />}
    </div>
  );
}

export default function VerifyStock() {
  const [view, setView] = useState<View>('dashboard');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [reportTab, setReportTab] = useState<ReportTab>('overview');
  const [showAddItem, setShowAddItem] = useState(false);
  const [verifyItem, setVerifyItem] = useState<StockItemWithLevel | null>(null);
  const [adjustItem, setAdjustItem] = useState<StockItemWithLevel | null>(null);
  const [adjustDefaultType, setAdjustDefaultType] = useState<StockAdjustment['adjustment_type']>('ADD');
  const [quickAction, setQuickAction] = useState<{ mode: StockAdjustment['adjustment_type']; search: string } | null>(null);

  const { items, loading: itemsLoading, refresh: refreshItems } = useStockItems();
  const { alerts, loading: alertsLoading, markRead, markAllRead, refresh: refreshAlerts } = useStockAlerts();
  const { verifications, loading: histLoading } = useVerifications();
  const { adjustments: allAdjustments } = useAdjustments();
  const summary = useVerifyStockSummary(items, alerts.length);
  const categoryReports = useCategoryReports(items);

  const onSaved = useCallback(() => { refreshItems(); refreshAlerts(); }, [refreshItems, refreshAlerts]);

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[];

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.sku || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || i.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const navItems: { id: View; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Layers },
    { id: 'catalogue', label: 'Catalogue', icon: Package },
    { id: 'verify', label: 'Verify', icon: ClipboardCheck },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: alerts.length },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const openItemDetail = (id: string) => { setSelectedItemId(id); setView('item-detail'); };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white">
      <style>{`.input-field { width: 100%; background: #1e293b; border: 1px solid #475569; border-radius: 0.5rem; padding: 0.5rem 0.75rem; color: white; font-size: 0.875rem; outline: none; } .input-field:focus { border-color: #0ea5e9; }`}</style>

      {/* Header */}
      <div className="flex-none border-b border-slate-800 bg-slate-900/50">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(view === 'item-detail' || view === 'settings') && (
              <button onClick={() => { setView(view === 'settings' ? 'dashboard' : 'catalogue'); setSelectedItemId(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <ArrowLeft size={16} />
              </button>
            )}
            <div>
              <h1 className="text-lg font-bold text-white">
                {view === 'settings' ? 'Settings' : 'Verify Stock'}
              </h1>
              {view !== 'settings' && <p className="text-slate-500 text-xs">Material tracking & reconciliation</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSaved} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              <RefreshCw size={15} />
            </button>
            {view !== 'item-detail' && view !== 'settings' && (
              <button onClick={() => setShowAddItem(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg font-medium transition-colors">
                <Plus size={15} /> Add Item
              </button>
            )}
          </div>
        </div>

        {view !== 'item-detail' && view !== 'settings' && (
          <div className="flex gap-0.5 px-6 pb-0">
            {navItems.map(n => {
              const Icon = n.icon;
              return (
                <button key={n.id} onClick={() => setView(n.id)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                    view === n.id
                      ? 'border-sky-500 text-white bg-sky-500/5'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}>
                  <Icon size={13} />{n.label}
                  {n.badge ? (
                    <span className="ml-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center px-1">
                      {n.badge > 9 ? '9+' : n.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* ── DASHBOARD ── */}
        {view === 'dashboard' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard label="Total SKUs" value={summary.total_items} color="text-white" icon={Package} />
              <StatCard label="Healthy" value={items.filter(i => i.status === 'ok').length} color="text-emerald-400" icon={CheckCircle} />
              <StatCard label="Low Stock" value={summary.low_stock_count} sub="Below minimum" color="text-amber-400" icon={AlertTriangle} />
              <StatCard label="Out of Stock" value={summary.out_of_stock_count} sub="Needs restocking" color="text-red-400" icon={XCircle} />
              <StatCard label="Overstock" value={summary.overstock_count} color="text-sky-400" icon={TrendingUp} />
              <StatCard label="Portfolio Value" value={`$${Math.round(summary.total_portfolio_value).toLocaleString()}`} color="text-emerald-300" icon={DollarSign} />
            </div>

            <div>
              <h3 className="text-white font-semibold text-sm mb-3">Quick Actions</h3>
              <div className="flex flex-col gap-2">
                <button onClick={() => setView('catalogue')}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-lg transition-colors">
                  <ShoppingCart size={16} /> Create Order
                </button>
                <button onClick={() => setView('catalogue')}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-lg transition-colors">
                  <ClipboardList size={16} /> Outstanding Orders
                </button>
                <button onClick={() => setView('catalogue')}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-lg transition-colors">
                  <Search size={16} /> Find Stock
                </button>
                <button onClick={() => setQuickAction({ mode: 'ADD', search: '' })}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg transition-colors">
                  <Plus size={16} /> Add Stock
                </button>
                <button onClick={() => setQuickAction({ mode: 'REMOVE', search: '' })}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-lg transition-colors">
                  <Minus size={16} /> Remove Stock
                </button>
                <button onClick={() => setQuickAction({ mode: 'TRANSFER_OUT', search: '' })}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-lg transition-colors">
                  <ArrowLeftRight size={16} /> Transfer Stock
                </button>
              </div>
            </div>

            {(summary.out_of_stock_count > 0 || summary.low_stock_count > 0) && (
              <div className="bg-amber-900/15 border border-amber-700/30 rounded-xl p-5">
                <h3 className="text-amber-300 font-semibold text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle size={15} /> Items Requiring Attention ({summary.out_of_stock_count + summary.low_stock_count})
                </h3>
                <div className="space-y-2">
                  {items.filter(i => i.status === 'out' || i.status === 'low').map(item => {
                    const cfg = STATUS_CONFIG[item.status];
                    return (
                      <div key={item.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <button onClick={() => openItemDetail(item.id)} className="text-white font-medium text-sm hover:text-sky-400 transition-colors text-left">
                            {item.name}
                          </button>
                          {item.location && <span className="text-slate-500 text-xs hidden sm:block">{item.location}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 text-xs">{item.stock_level?.quantity_on_hand ?? 0} / {item.min_quantity} {item.unit}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>{cfg.label}</span>
                          <button onClick={() => setVerifyItem(item)} className="text-sky-400 hover:text-sky-300 text-xs transition-colors">Verify</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {alerts.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <Bell size={14} className="text-amber-400" /> Alerts ({alerts.length})
                  </h3>
                  <button onClick={markAllRead} className="text-slate-400 hover:text-white text-xs transition-colors">Mark all read</button>
                </div>
                <div className="space-y-2">
                  {alerts.slice(0, 4).map(a => (
                    <div key={a.id} className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-amber-400 text-xs font-medium">{a.alert_type.replace(/_/g, ' ')}</span>
                        <p className="text-slate-300 text-sm">{a.message}</p>
                      </div>
                      <button onClick={() => markRead(a.id)} className="text-slate-600 hover:text-slate-400 flex-none mt-0.5"><X size={12} /></button>
                    </div>
                  ))}
                  {alerts.length > 4 && (
                    <button onClick={() => setView('alerts')} className="text-sky-400 hover:text-sky-300 text-xs transition-colors">
                      View all {alerts.length} alerts →
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
              <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Activity size={14} className="text-sky-400" /> Recent Activity</h3>
              {allAdjustments.length === 0 && verifications.length === 0 ? (
                <p className="text-slate-500 text-sm">No activity yet</p>
              ) : (
                <div className="space-y-2">
                  {[...allAdjustments.slice(0, 3).map(a => ({ type: 'adj' as const, date: a.adjusted_at, data: a })),
                    ...verifications.slice(0, 3).map(v => ({ type: 'ver' as const, date: v.verified_at, data: v }))]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 5)
                    .map((entry, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <div className={`w-1.5 h-1.5 rounded-full flex-none ${entry.type === 'adj' ? 'bg-sky-400' : 'bg-emerald-400'}`} />
                        <p className="text-slate-300 flex-1">
                          {entry.type === 'adj'
                            ? `${(entry.data as typeof allAdjustments[0]).adjustment_type.replace('_', ' ')} · ${(entry.data as typeof allAdjustments[0]).stock_item?.name ?? 'item'}`
                            : `Verified · ${(entry.data as typeof verifications[0]).stock_item?.name ?? 'item'}`
                          }
                        </p>
                        <p className="text-slate-500 text-xs">{new Date(entry.date).toLocaleDateString()}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CATALOGUE ── */}
        {view === 'catalogue' && (
          <div className="p-6 space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or SKU..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500" />
              </div>
              {categories.length > 0 && (
                <div className="relative">
                  <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500 appearance-none pr-8 min-w-[140px]">
                    <option value="">All categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                </div>
              )}
            </div>

            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
              {itemsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                  <Package size={36} className="mx-auto mb-3 text-slate-600" />
                  <p className="text-slate-400 text-sm">{search || categoryFilter ? 'No items match your filters' : 'No stock items yet'}</p>
                  {!search && !categoryFilter && (
                    <button onClick={() => setShowAddItem(true)} className="mt-2 text-sky-400 hover:text-sky-300 text-sm transition-colors">
                      Add your first item
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="px-4 py-2.5 border-b border-slate-700/50 grid grid-cols-12 gap-2 text-slate-400 text-xs uppercase tracking-wide font-medium">
                    <div className="col-span-4">Item</div>
                    <div className="col-span-2">Category</div>
                    <div className="col-span-2">Location</div>
                    <div className="col-span-1 text-right">Qty</div>
                    <div className="col-span-1">Status</div>
                    <div className="col-span-2 text-right">Value</div>
                  </div>
                  {filtered.map(item => {
                    const cfg = STATUS_CONFIG[item.status];
                    const qty = item.stock_level?.quantity_on_hand ?? 0;
                    return (
                      <button key={item.id} onClick={() => openItemDetail(item.id)}
                        className="w-full grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors text-left items-center last:border-0">
                        <div className="col-span-4">
                          <p className="text-white text-sm font-medium truncate">{item.name}</p>
                          {item.sku && <p className="text-slate-500 text-xs">{item.sku}</p>}
                        </div>
                        <div className="col-span-2 text-slate-400 text-sm truncate">{item.category || '—'}</div>
                        <div className="col-span-2 text-slate-400 text-sm truncate">{item.location || '—'}</div>
                        <div className="col-span-1 text-right">
                          <span className="text-white font-semibold text-sm">{qty}</span>
                          <span className="text-slate-500 text-xs ml-1">{item.unit}</span>
                        </div>
                        <div className="col-span-1">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>{cfg.label}</span>
                        </div>
                        <div className="col-span-2 text-right flex items-center justify-end gap-1">
                          <span className="text-slate-400 text-sm">{item.unit_cost ? `$${fmt(qty * item.unit_cost)}` : '—'}</span>
                          <ChevronRight size={13} className="text-slate-600" />
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── VERIFY ── */}
        {view === 'verify' && (
          <div className="p-6 space-y-3">
            <p className="text-slate-400 text-sm">Walk through each item and enter the physical count. Discrepancies are calculated automatically.</p>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-3 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            {itemsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <ClipboardCheck size={36} className="mx-auto mb-3 text-slate-600" />
                <p className="text-slate-400 text-sm">No items to verify</p>
              </div>
            ) : (
              filtered.map(item => {
                const cfg = STATUS_CONFIG[item.status];
                const lastV = item.stock_level?.last_verified_at;
                return (
                  <button key={item.id} onClick={() => setVerifyItem(item)}
                    className="w-full flex items-center justify-between bg-slate-800/50 hover:bg-slate-800 border border-slate-700/40 rounded-xl px-4 py-3.5 transition-colors text-left">
                    <div>
                      <p className="text-white font-medium text-sm">{item.name}</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {item.location || 'No location'}{item.sku ? ` · ${item.sku}` : ''}
                        {lastV ? ` · Last: ${new Date(lastV).toLocaleDateString()}` : ' · Never verified'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-white font-semibold">{item.stock_level?.quantity_on_hand ?? 0} <span className="text-slate-400 text-xs">{item.unit}</span></p>
                        <p className="text-slate-500 text-xs">min: {item.min_quantity}</p>
                      </div>
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
                        <cfg.icon size={9} />{cfg.label}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* ── REPORTS ── */}
        {view === 'reports' && (
          <div className="p-6 space-y-5">
            <div className="flex gap-1 border-b border-slate-800 pb-0">
              {(['overview', 'inventory', 'activity'] as ReportTab[]).map(t => (
                <button key={t} onClick={() => setReportTab(t)}
                  className={`px-4 py-2.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
                    reportTab === t ? 'border-sky-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
                  }`}>
                  {t}
                </button>
              ))}
            </div>

            {reportTab === 'overview' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total SKUs" value={summary.total_items} color="text-white" icon={Package} />
                  <StatCard label="Portfolio Value" value={`$${Math.round(summary.total_portfolio_value).toLocaleString()}`} color="text-emerald-300" icon={DollarSign} />
                  <StatCard label="Low Stock" value={summary.low_stock_count} color="text-amber-400" icon={AlertTriangle} />
                  <StatCard label="Out of Stock" value={summary.out_of_stock_count} color="text-red-400" icon={XCircle} />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-3">Value by Category</h3>
                  <div className="space-y-2">
                    {categoryReports.length === 0 ? (
                      <p className="text-slate-500 text-sm">No data</p>
                    ) : categoryReports.map(cr => {
                      const pct = summary.total_portfolio_value > 0 ? (cr.total_value / summary.total_portfolio_value) * 100 : 0;
                      return (
                        <div key={cr.category} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-white font-medium text-sm">{cr.category}</span>
                            <span className="text-emerald-400 font-semibold text-sm">${fmt(cr.total_value)}</span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-1.5 mb-1.5">
                            <div className="bg-sky-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span>{cr.item_count} items</span>
                            {cr.low_count > 0 && <span className="text-amber-400">{cr.low_count} low</span>}
                            {cr.out_count > 0 && <span className="text-red-400">{cr.out_count} out</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {reportTab === 'inventory' && (
              <div className="space-y-5">
                {summary.out_of_stock_count > 0 && (
                  <div>
                    <h3 className="text-red-400 font-semibold text-sm mb-2 flex items-center gap-2">
                      <XCircle size={14} /> Out of Stock ({summary.out_of_stock_count})
                    </h3>
                    <div className="space-y-1.5">
                      {items.filter(i => i.status === 'out').map(item => (
                        <button key={item.id} onClick={() => openItemDetail(item.id)}
                          className="w-full flex items-center justify-between bg-red-900/10 border border-red-700/20 rounded-lg px-3 py-2.5 hover:bg-red-900/20 transition-colors text-left">
                          <div>
                            <p className="text-white text-sm font-medium">{item.name}</p>
                            <p className="text-slate-500 text-xs">{item.supplier_name || 'No supplier'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-xs">0 / {item.min_quantity} min</span>
                            <ChevronRight size={13} className="text-slate-500" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {summary.low_stock_count > 0 && (
                  <div>
                    <h3 className="text-amber-400 font-semibold text-sm mb-2 flex items-center gap-2">
                      <AlertTriangle size={14} /> Low Stock ({summary.low_stock_count})
                    </h3>
                    <div className="space-y-1.5">
                      {items.filter(i => i.status === 'low').map(item => {
                        const qty = item.stock_level?.quantity_on_hand ?? 0;
                        const pct = (qty / item.min_quantity) * 100;
                        return (
                          <button key={item.id} onClick={() => openItemDetail(item.id)}
                            className="w-full bg-amber-900/10 border border-amber-700/20 rounded-lg px-3 py-2.5 hover:bg-amber-900/20 transition-colors text-left">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-white text-sm font-medium">{item.name}</p>
                              <span className="text-amber-400 text-xs font-semibold">{qty} / {item.min_quantity} min</span>
                            </div>
                            <div className="w-full bg-slate-700 rounded-full h-1">
                              <div className="bg-amber-500 h-1 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {summary.overstock_count > 0 && (
                  <div>
                    <h3 className="text-sky-400 font-semibold text-sm mb-2 flex items-center gap-2">
                      <TrendingUp size={14} /> Overstock ({summary.overstock_count})
                    </h3>
                    <div className="space-y-1.5">
                      {items.filter(i => i.status === 'over').map(item => (
                        <button key={item.id} onClick={() => openItemDetail(item.id)}
                          className="w-full flex items-center justify-between bg-sky-900/10 border border-sky-700/20 rounded-lg px-3 py-2.5 hover:bg-sky-900/20 transition-colors text-left">
                          <p className="text-white text-sm font-medium">{item.name}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-sky-400 text-xs">{item.stock_level?.quantity_on_hand} / {item.max_quantity} max</span>
                            <ChevronRight size={13} className="text-slate-500" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {summary.out_of_stock_count === 0 && summary.low_stock_count === 0 && summary.overstock_count === 0 && (
                  <div className="text-center py-16">
                    <CheckCircle size={36} className="mx-auto mb-3 text-emerald-500" />
                    <p className="text-emerald-400 font-semibold text-sm">All stock levels healthy</p>
                  </div>
                )}
              </div>
            )}

            {reportTab === 'activity' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-white font-semibold text-sm mb-3">Recent Verifications</h3>
                  {histLoading ? <p className="text-slate-500 text-sm">Loading...</p> :
                    verifications.length === 0 ? <p className="text-slate-500 text-sm">No verifications yet</p> :
                    <div className="space-y-2">
                      {verifications.slice(0, 10).map(v => (
                        <div key={v.id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/30 rounded-lg px-3 py-2.5">
                          <div>
                            <p className="text-white text-sm font-medium">{(v.stock_item as { name?: string })?.name ?? 'Unknown'}</p>
                            <p className="text-slate-500 text-xs">{new Date(v.verified_at).toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-white font-semibold text-sm">{v.verified_quantity}</p>
                            {v.discrepancy !== 0 && (
                              <p className={`text-xs font-medium ${v.discrepancy > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {v.discrepancy > 0 ? '+' : ''}{v.discrepancy}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-3">Recent Adjustments</h3>
                  {allAdjustments.length === 0 ? <p className="text-slate-500 text-sm">No adjustments yet</p> :
                    <div className="space-y-2">
                      {allAdjustments.slice(0, 10).map(a => (
                        <div key={a.id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/30 rounded-lg px-3 py-2.5">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${ADJ_COLORS[a.adjustment_type]}`}>{a.adjustment_type.replace(/_/g, ' ')}</span>
                              <span className="text-slate-300 text-sm">{(a.stock_item as { name?: string })?.name ?? 'Unknown'}</span>
                            </div>
                            {a.reason && <p className="text-slate-500 text-xs mt-0.5">{a.reason}</p>}
                          </div>
                          <div className="text-right">
                            <p className={`font-bold text-sm ${ADJ_COLORS[a.adjustment_type]}`}>
                              {a.adjustment_type === 'REMOVE' || a.adjustment_type === 'TRANSFER_OUT' ? '-' : '+'}{a.quantity}
                            </p>
                            <p className="text-slate-500 text-xs">{new Date(a.adjusted_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ALERTS ── */}
        {view === 'alerts' && (
          <div className="p-6 space-y-3">
            {alertsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle size={36} className="mx-auto mb-3 text-emerald-500" />
                <p className="text-emerald-400 font-semibold text-sm">No unread alerts</p>
                <p className="text-slate-500 text-xs mt-1">All caught up</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-slate-400 text-sm">{alerts.length} unread alert{alerts.length !== 1 ? 's' : ''}</p>
                  <button onClick={markAllRead} className="text-sm text-slate-400 hover:text-white transition-colors">Mark all read</button>
                </div>
                {alerts.map(a => {
                  const alertColors: Record<string, string> = {
                    LOW_STOCK: 'border-amber-500/30 bg-amber-900/10',
                    OUT_OF_STOCK: 'border-red-500/30 bg-red-900/10',
                    OVERSTOCK: 'border-sky-500/30 bg-sky-900/10',
                    DISCREPANCY: 'border-orange-500/30 bg-orange-900/10',
                    CUSTOM: 'border-slate-500/30 bg-slate-800/30',
                  };
                  const typeColors: Record<string, string> = {
                    LOW_STOCK: 'text-amber-400', OUT_OF_STOCK: 'text-red-400',
                    OVERSTOCK: 'text-sky-400', DISCREPANCY: 'text-orange-400', CUSTOM: 'text-slate-400',
                  };
                  return (
                    <div key={a.id} className={`flex items-start justify-between gap-3 border rounded-xl px-4 py-3.5 ${alertColors[a.alert_type] || 'border-slate-700/50 bg-slate-800/30'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-semibold ${typeColors[a.alert_type] || 'text-slate-400'}`}>
                            {a.alert_type.replace(/_/g, ' ')}
                          </span>
                          {(a.stock_item as { name?: string })?.name && (
                            <span className="text-slate-500 text-xs">· {(a.stock_item as { name?: string }).name}</span>
                          )}
                        </div>
                        <p className="text-white text-sm">{a.message}</p>
                        <p className="text-slate-500 text-xs mt-1">{new Date(a.created_at).toLocaleString()}</p>
                      </div>
                      <button onClick={() => markRead(a.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors flex-none">
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── ITEM DETAIL ── */}
        {view === 'item-detail' && selectedItemId && (
          <ItemDetailView
            itemId={selectedItemId}
            onBack={() => { setView('catalogue'); setSelectedItemId(null); }}
            onRefreshAll={onSaved}
          />
        )}

        {/* ── SETTINGS ── */}
        {view === 'settings' && <VerifyStockSettings />}
      </div>

      {/* Global modals */}
      {showAddItem && <AddItemModal onClose={() => setShowAddItem(false)} onSaved={onSaved} />}
      {verifyItem && <VerifyModal item={verifyItem} onClose={() => setVerifyItem(null)} onSaved={onSaved} />}
      {adjustItem && <AdjustModal item={adjustItem} defaultType={adjustDefaultType} onClose={() => { setAdjustItem(null); setAdjustDefaultType('ADD'); }} onSaved={onSaved} />}

      {quickAction && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <h2 className="text-white font-semibold text-base">
                  {quickAction.mode === 'ADD' ? 'Add Stock' : quickAction.mode === 'REMOVE' ? 'Remove Stock' : 'Transfer Stock'}
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">Select an item to continue</p>
              </div>
              <button onClick={() => setQuickAction(null)} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-3 text-slate-500" />
                <input
                  autoFocus
                  value={quickAction.search}
                  onChange={e => setQuickAction(prev => prev ? { ...prev, search: e.target.value } : null)}
                  placeholder="Search items..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500"
                />
              </div>
              {items
                .filter(i => !quickAction.search || i.name.toLowerCase().includes(quickAction.search.toLowerCase()))
                .map(item => {
                  const cfg = STATUS_CONFIG[item.status];
                  return (
                    <button key={item.id} onClick={() => { setAdjustDefaultType(quickAction.mode); setAdjustItem(item); setQuickAction(null); }}
                      className="w-full flex items-center justify-between bg-slate-800/50 hover:bg-slate-800 border border-slate-700/40 rounded-xl px-4 py-3 transition-colors text-left">
                      <div>
                        <p className="text-white font-medium text-sm">{item.name}</p>
                        {item.location && <p className="text-slate-500 text-xs">{item.location}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-sm">{item.stock_level?.quantity_on_hand ?? 0} <span className="text-slate-500 text-xs">{item.unit}</span></span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>{cfg.label}</span>
                      </div>
                    </button>
                  );
                })
              }
              {items.filter(i => !quickAction.search || i.name.toLowerCase().includes(quickAction.search.toLowerCase())).length === 0 && (
                <p className="text-slate-500 text-sm text-center py-6">No items found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
