import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Package,
  Bell,
  ClipboardCheck,
  Plus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Search,
  X,
  ChevronDown,
  RefreshCw,
  Edit2,
  History,
} from 'lucide-react';
import { useOrganisation } from '../../lib/organisationContext';
import {
  useStockItems,
  useStockAlerts,
  useVerifications,
  createStockItem,
  updateStockItem,
  recordVerification,
  recordAdjustment,
} from '../../lib/verifystock/useVerifyStock';
import type { StockItemWithLevel, StockAdjustment } from '../../types/verifystock.types';

type View = 'dashboard' | 'items' | 'verify' | 'alerts' | 'history';

const STATUS_CONFIG = {
  ok:   { label: 'OK',        color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: CheckCircle   },
  low:  { label: 'Low Stock', color: 'text-amber-400',   bg: 'bg-amber-400/10',   icon: AlertTriangle },
  out:  { label: 'Out',       color: 'text-red-400',     bg: 'bg-red-400/10',     icon: XCircle       },
  over: { label: 'Overstock', color: 'text-sky-400',     bg: 'bg-sky-400/10',     icon: TrendingUp    },
};

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
      <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function AddItemModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentOrganisation } = useOrganisation();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', sku: '', category: '', unit: 'ea', min_quantity: 1, max_quantity: '', location: '',
    supplier_name: '', unit_cost: '', notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganisation?.id) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await createStockItem(currentOrganisation.id, user?.id ?? '', {
      name: form.name,
      sku: form.sku || null,
      category: form.category || null,
      unit: form.unit,
      min_quantity: Number(form.min_quantity),
      max_quantity: form.max_quantity ? Number(form.max_quantity) : null,
      location: form.location || null,
      supplier_name: form.supplier_name || null,
      unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (!error) { onSaved(); onClose(); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold">Add Stock Item</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-slate-300 text-sm mb-1 block">Item Name *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">SKU</label>
              <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Category</label>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Unit *</label>
              <input required value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="ea, m, m2, kg..."
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Min Qty *</label>
              <input required type="number" min="0" value={form.min_quantity} onChange={e => setForm(f => ({ ...f, min_quantity: Number(e.target.value) }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Max Qty</label>
              <input type="number" min="0" value={form.max_quantity} onChange={e => setForm(f => ({ ...f, max_quantity: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Location</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Unit Cost ($)</label>
              <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Supplier</label>
              <input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div className="col-span-2">
              <label className="text-slate-300 text-sm mb-1 block">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500 resize-none" />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
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

function VerifyModal({
  item,
  onClose,
  onSaved,
}: {
  item: StockItemWithLevel;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentOrganisation } = useOrganisation();
  const [qty, setQty] = useState(item.stock_level?.quantity_on_hand ?? 0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganisation?.id) return;
    setSaving(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const prev = item.stock_level?.quantity_on_hand ?? 0;
    const { error: err } = await recordVerification(currentOrganisation.id, user?.id ?? '', item.id, qty, prev, notes || null);
    setSaving(false);
    if (err) { setError(err); return; }
    onSaved();
    onClose();
  };

  const prev = item.stock_level?.quantity_on_hand ?? 0;
  const diff = qty - prev;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold">Verify Stock — {item.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex gap-4 text-sm">
            <div className="bg-slate-800 rounded-lg px-4 py-3 flex-1 text-center">
              <p className="text-slate-400 text-xs mb-1">Current</p>
              <p className="text-white font-bold text-xl">{prev} <span className="text-slate-400 text-sm">{item.unit}</span></p>
            </div>
            <div className={`rounded-lg px-4 py-3 flex-1 text-center ${diff === 0 ? 'bg-slate-800' : diff > 0 ? 'bg-emerald-900/30 border border-emerald-700/40' : 'bg-red-900/30 border border-red-700/40'}`}>
              <p className="text-slate-400 text-xs mb-1">Difference</p>
              <p className={`font-bold text-xl ${diff === 0 ? 'text-white' : diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {diff > 0 ? '+' : ''}{diff} <span className="text-slate-400 text-sm">{item.unit}</span>
              </p>
            </div>
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Verified Count *</label>
            <input required type="number" min="0" value={qty} onChange={e => setQty(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional verification notes..."
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500 resize-none" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm Verification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdjustModal({
  item,
  onClose,
  onSaved,
}: {
  item: StockItemWithLevel;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentOrganisation } = useOrganisation();
  const [type, setType] = useState<StockAdjustment['adjustment_type']>('ADD');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrganisation?.id) return;
    setSaving(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const currentQty = item.stock_level?.quantity_on_hand ?? 0;
    const { error: err } = await recordAdjustment(
      currentOrganisation.id, user?.id ?? '', item.id, type, qty, currentQty, reason || null, reference || null
    );
    setSaving(false);
    if (err) { setError(err); return; }
    onSaved();
    onClose();
  };

  const typeOptions: { value: StockAdjustment['adjustment_type']; label: string }[] = [
    { value: 'ADD', label: 'Add Stock' },
    { value: 'REMOVE', label: 'Remove Stock' },
    { value: 'ADJUST', label: 'Set Quantity' },
    { value: 'TRANSFER_IN', label: 'Transfer In' },
    { value: 'TRANSFER_OUT', label: 'Transfer Out' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold">Adjust Stock — {item.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-slate-800 rounded-lg px-4 py-3 text-center">
            <p className="text-slate-400 text-xs mb-1">Current Stock</p>
            <p className="text-white font-bold text-xl">{item.stock_level?.quantity_on_hand ?? 0} <span className="text-slate-400 text-sm">{item.unit}</span></p>
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
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">{type === 'ADJUST' ? 'New Quantity' : 'Quantity'} *</label>
            <input required type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-lg font-semibold focus:outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Reason</label>
            <input value={reason} onChange={e => setReason(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Reference</label>
            <input value={reference} onChange={e => setReference(e.target.value)}
              placeholder="PO number, job ref..."
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Apply Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StockItemRow({
  item,
  onVerify,
  onAdjust,
}: {
  item: StockItemWithLevel;
  onVerify: (item: StockItemWithLevel) => void;
  onAdjust: (item: StockItemWithLevel) => void;
}) {
  const cfg = STATUS_CONFIG[item.status];
  const Icon = cfg.icon;
  const qty = item.stock_level?.quantity_on_hand ?? 0;
  const lastVerified = item.stock_level?.last_verified_at
    ? new Date(item.stock_level.last_verified_at).toLocaleDateString()
    : 'Never';

  return (
    <tr className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-3">
        <p className="text-white font-medium text-sm">{item.name}</p>
        {item.sku && <p className="text-slate-500 text-xs">{item.sku}</p>}
      </td>
      <td className="px-4 py-3 text-slate-400 text-sm">{item.category || '—'}</td>
      <td className="px-4 py-3 text-slate-400 text-sm">{item.location || '—'}</td>
      <td className="px-4 py-3 text-right">
        <span className="text-white font-semibold">{qty}</span>
        <span className="text-slate-500 text-xs ml-1">{item.unit}</span>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
          <Icon size={10} />
          {cfg.label}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-500 text-xs">{lastVerified}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => onVerify(item)}
            className="p-1.5 rounded-lg bg-sky-900/30 hover:bg-sky-800/50 text-sky-400 transition-colors" title="Verify count">
            <ClipboardCheck size={14} />
          </button>
          <button onClick={() => onAdjust(item)}
            className="p-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 transition-colors" title="Adjust stock">
            <Edit2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function VerifyStock() {
  const [view, setView] = useState<View>('dashboard');
  const [search, setSearch] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);
  const [verifyItem, setVerifyItem] = useState<StockItemWithLevel | null>(null);
  const [adjustItem, setAdjustItem] = useState<StockItemWithLevel | null>(null);

  const { items, loading: itemsLoading, refresh: refreshItems } = useStockItems();
  const { alerts, loading: alertsLoading, markRead, markAllRead, refresh: refreshAlerts } = useStockAlerts();
  const { verifications, loading: histLoading } = useVerifications();

  const onSaved = useCallback(() => { refreshItems(); refreshAlerts(); }, [refreshItems, refreshAlerts]);

  const filtered = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.sku || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.category || '').toLowerCase().includes(search.toLowerCase())
  );

  const lowCount = items.filter(i => i.status === 'low').length;
  const outCount = items.filter(i => i.status === 'out').length;
  const okCount = items.filter(i => i.status === 'ok').length;
  const overCount = items.filter(i => i.status === 'over').length;

  const navItems: { id: View; label: string; icon: typeof Package; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Package },
    { id: 'items', label: 'Stock Items', icon: Package },
    { id: 'verify', label: 'Quick Verify', icon: ClipboardCheck },
    { id: 'alerts', label: 'Alerts', icon: Bell, badge: alerts.length },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white">
      {/* Header */}
      <div className="flex-none px-6 py-5 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Verify Stock</h1>
            <p className="text-slate-400 text-sm mt-0.5">Track, verify and manage on-site materials</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onSaved} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              <RefreshCw size={16} />
            </button>
            <button onClick={() => setShowAddItem(true)}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg font-medium transition-colors">
              <Plus size={16} /> Add Item
            </button>
          </div>
        </div>

        {/* Nav tabs */}
        <div className="flex gap-1 mt-4">
          {navItems.map(n => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors relative ${
                  view === n.id ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon size={14} />
                {n.label}
                {n.badge ? (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                    {n.badge > 9 ? '9+' : n.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* DASHBOARD VIEW */}
        {view === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Items" value={items.length} color="text-white" />
              <StatCard label="OK" value={okCount} sub="Within target range" color="text-emerald-400" />
              <StatCard label="Low Stock" value={lowCount} sub="Below minimum" color="text-amber-400" />
              <StatCard label="Out of Stock" value={outCount} sub="Needs restocking" color="text-red-400" />
            </div>

            {(lowCount > 0 || outCount > 0) && (
              <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4">
                <p className="text-amber-300 font-semibold text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle size={16} /> Items Requiring Attention
                </p>
                <div className="space-y-2">
                  {items.filter(i => i.status === 'out' || i.status === 'low').map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-white text-sm">{item.name}</p>
                        <p className="text-slate-400 text-xs">{item.stock_level?.quantity_on_hand ?? 0} / {item.min_quantity} {item.unit} min</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CONFIG[item.status].color} ${STATUS_CONFIG[item.status].bg}`}>
                          {STATUS_CONFIG[item.status].label}
                        </span>
                        <button onClick={() => { setVerifyItem(item); }}
                          className="text-xs text-sky-400 hover:text-sky-300 transition-colors">
                          Verify
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {alerts.length > 0 && (
              <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white font-semibold text-sm flex items-center gap-2"><Bell size={16} /> Unread Alerts ({alerts.length})</p>
                  <button onClick={markAllRead} className="text-xs text-slate-400 hover:text-white transition-colors">Mark all read</button>
                </div>
                <div className="space-y-2">
                  {alerts.slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-start justify-between gap-3 text-sm">
                      <p className="text-slate-300">{a.message}</p>
                      <button onClick={() => markRead(a.id)} className="text-slate-500 hover:text-slate-300 flex-none">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {overCount > 0 && (
              <div className="bg-sky-900/20 border border-sky-700/40 rounded-xl p-3">
                <p className="text-sky-300 text-sm flex items-center gap-2">
                  <TrendingUp size={14} /> {overCount} item{overCount > 1 ? 's' : ''} overstocked
                </p>
              </div>
            )}
          </div>
        )}

        {/* ITEMS VIEW */}
        {view === 'items' && (
          <div className="space-y-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, SKU, or category..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
              {itemsLoading ? (
                <div className="text-center text-slate-400 py-12 text-sm">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-slate-400 py-12">
                  <Package size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{search ? 'No items match your search' : 'No stock items yet'}</p>
                  {!search && (
                    <button onClick={() => setShowAddItem(true)} className="mt-3 text-sky-400 hover:text-sky-300 text-sm transition-colors">
                      Add your first item
                    </button>
                  )}
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-900/50">
                      <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium">Item</th>
                      <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium">Category</th>
                      <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium">Location</th>
                      <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium">On Hand</th>
                      <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium">Status</th>
                      <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium">Last Verified</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(item => (
                      <StockItemRow key={item.id} item={item} onVerify={setVerifyItem} onAdjust={setAdjustItem} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* QUICK VERIFY VIEW */}
        {view === 'verify' && (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm mb-4">Select an item to perform a quick stock count verification.</p>
            {itemsLoading ? (
              <div className="text-center text-slate-400 py-12 text-sm">Loading...</div>
            ) : items.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <ClipboardCheck size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No stock items to verify</p>
              </div>
            ) : (
              items.map(item => {
                const cfg = STATUS_CONFIG[item.status];
                const Icon = cfg.icon;
                return (
                  <button key={item.id} onClick={() => setVerifyItem(item)}
                    className="w-full flex items-center justify-between bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 transition-colors text-left">
                    <div>
                      <p className="text-white font-medium text-sm">{item.name}</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {item.location || 'No location'} {item.sku ? `· ${item.sku}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-white font-semibold">{item.stock_level?.quantity_on_hand ?? 0} <span className="text-slate-400 text-sm">{item.unit}</span></p>
                        <p className="text-slate-500 text-xs">min: {item.min_quantity}</p>
                      </div>
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
                        <Icon size={10} /> {cfg.label}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* ALERTS VIEW */}
        {view === 'alerts' && (
          <div className="space-y-3">
            {alertsLoading ? (
              <div className="text-center text-slate-400 py-12 text-sm">Loading...</div>
            ) : alerts.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <Bell size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No unread alerts</p>
              </div>
            ) : (
              <>
                <div className="flex justify-end">
                  <button onClick={markAllRead} className="text-sm text-slate-400 hover:text-white transition-colors">Mark all read</button>
                </div>
                {alerts.map(a => (
                  <div key={a.id} className="flex items-start justify-between gap-3 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-xs text-amber-400 font-medium mb-0.5">{a.alert_type.replace('_', ' ')}</p>
                      <p className="text-white text-sm">{a.message}</p>
                      <p className="text-slate-500 text-xs mt-1">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                    <button onClick={() => markRead(a.id)}
                      className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors flex-none">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && (
          <div className="space-y-2">
            {histLoading ? (
              <div className="text-center text-slate-400 py-12 text-sm">Loading...</div>
            ) : verifications.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <History size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No verification history</p>
              </div>
            ) : (
              verifications.map(v => (
                <div key={v.id} className="flex items-start justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-white text-sm font-medium">{(v.stock_item as { name?: string })?.name ?? 'Unknown Item'}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{new Date(v.verified_at).toLocaleString()}</p>
                    {v.notes && <p className="text-slate-400 text-xs mt-1 italic">{v.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">{v.verified_quantity}</p>
                    {v.discrepancy !== 0 && (
                      <p className={`text-xs font-medium ${v.discrepancy > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {v.discrepancy > 0 ? '+' : ''}{v.discrepancy} discrepancy
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddItem && <AddItemModal onClose={() => setShowAddItem(false)} onSaved={onSaved} />}
      {verifyItem && <VerifyModal item={verifyItem} onClose={() => setVerifyItem(null)} onSaved={onSaved} />}
      {adjustItem && <AdjustModal item={adjustItem} onClose={() => setAdjustItem(null)} onSaved={onSaved} />}
    </div>
  );
}
