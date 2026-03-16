import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import {
  Users, Package, Truck, MapPin, FolderOpen, FileText, Navigation,
  ChevronRight, LogOut, X, Plus, Trash2, Pencil, Search,
  Check, ArrowLeft, MapPin as PinIcon, Shield
} from 'lucide-react';

type AdminScreen = 'settings' | 'users' | 'materials' | 'suppliers' | 'locations' | 'projects' | 'reports' | 'nearest-van' | 'data-projects' | 'data-suppliers' | 'data-materials';

interface VsUserProfile {
  id: string;
  organisation_id: string;
  role: string;
  van_plate: string | null;
  last_lat: number | null;
  last_lon: number | null;
  last_location_at: string | null;
}

interface VsSupplier {
  id: string;
  organisation_id: string;
  name: string;
  emails: string[];
  phone: string | null;
  address: string | null;
  active: boolean;
}

interface VsMaterial {
  id: string;
  organisation_id: string;
  name: string;
  type: string | null;
  unit: string;
  unit_value: number | null;
  price: number | null;
  sku: string | null;
  supplier_id: string | null;
  active: boolean;
}

interface VsLocation {
  id: string;
  organisation_id: string;
  name: string;
  type: 'storeroom' | 'van' | 'site';
  address: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
}

interface VsProject {
  id: string;
  organisation_id: string;
  name: string;
  project_number: string | null;
  client_name: string | null;
  address: string | null;
  active: boolean;
}

interface UserRow {
  id: string;
  email: string;
  role: string;
  van_plate: string | null;
  created_at: string;
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />;
}

function SubScreenHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return (
    <div className="flex-none flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/80">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-white font-semibold text-base">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = 'text', required }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-slate-400 text-xs font-medium mb-1.5">{label}{required && ' *'}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500"
      />
    </div>
  );
}

function Msg({ msg }: { msg: { type: 'ok' | 'err'; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`mx-5 mt-4 px-4 py-3 rounded-lg text-sm border ${
      msg.type === 'ok'
        ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700/40'
        : 'bg-red-900/30 text-red-300 border-red-700/40'
    }`}>
      {msg.text}
    </div>
  );
}

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-base">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SheetActions({ onCancel, onSave, saving, saveLabel = 'Save' }: {
  onCancel: () => void; onSave: () => void; saving: boolean; saveLabel?: string;
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button onClick={onCancel}
        className="flex-1 border border-slate-600 rounded-lg py-3 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors">
        Cancel
      </button>
      <button onClick={onSave} disabled={saving}
        className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg py-3 text-white text-sm font-semibold transition-colors">
        {saving ? 'Saving...' : saveLabel}
      </button>
    </div>
  );
}

function ManageUsers({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [confirmUser, setConfirmUser] = useState<UserRow | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_users_with_emails', { p_organisation_id: orgId });
    if (!error && data) setUsers(data as UserRow[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => !search || u.email.toLowerCase().includes(search.toLowerCase()));

  const toggleRole = async (user: UserRow) => {
    setSaving(true);
    setMsg(null);
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const { data: { user: me } } = await supabase.auth.getUser();
    const { error } = await supabase.rpc('set_user_role', {
      p_target_user_id: user.id,
      p_organisation_id: orgId,
      p_role: newRole,
      p_requesting_user_id: me?.id,
    });
    if (error) {
      setMsg({ type: 'err', text: error.message });
    } else {
      setMsg({ type: 'ok', text: `${user.email} is now ${newRole === 'admin' ? 'Administrator' : 'Standard User'}.` });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    }
    setSaving(false);
    setConfirmUser(null);
  };

  return (
    <div className="flex flex-col h-full">
      <SubScreenHeader title="Manage Users & Roles" onBack={onBack} />
      <div className="p-5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by email..."
            className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500" />
        </div>
      </div>
      <Msg msg={msg} />
      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 space-y-2">
          {filtered.map(user => (
            <div key={user.id} className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3.5">
              <div>
                <p className="text-white text-sm font-medium">{user.email}</p>
                {user.van_plate && <p className="text-slate-400 text-xs mt-0.5">{user.van_plate}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  user.role === 'admin' ? 'bg-sky-900/50 text-sky-300 border border-sky-700/40' : 'bg-slate-700 text-slate-400'
                }`}>{user.role === 'admin' ? 'ADMIN' : 'USER'}</span>
                <button
                  onClick={() => setConfirmUser(user)}
                  disabled={saving}
                  className="text-xs text-sky-400 hover:text-sky-300 font-medium border border-sky-700/50 rounded-lg px-2.5 py-1 hover:bg-sky-900/20 transition-colors">
                  {user.role === 'admin' ? 'Make User' : 'Make Admin'}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-slate-500 text-sm py-12">No users found</p>
          )}
        </div>
      )}

      {confirmUser && (
        <BottomSheet title="Confirm Role Change" onClose={() => setConfirmUser(null)}>
          <p className="text-slate-300 text-sm">
            Change <strong className="text-white">{confirmUser.email}</strong> to{' '}
            <strong className="text-white">{confirmUser.role === 'admin' ? 'Standard User' : 'Administrator'}</strong>?
          </p>
          <SheetActions onCancel={() => setConfirmUser(null)} onSave={() => toggleRole(confirmUser)} saving={saving} saveLabel="Confirm" />
        </BottomSheet>
      )}
    </div>
  );
}

function ManageMaterials({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [tab, setTab] = useState<'materials' | 'suppliers'>('materials');
  const [materials, setMaterials] = useState<VsMaterial[]>([]);
  const [suppliers, setSuppliers] = useState<VsSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<VsMaterial | null>(null);
  const [form, setForm] = useState({ name: '', type: '', unit: 'ea', unit_value: '', price: '', supplier_id: '' });
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [supplierName, setSupplierName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: mats }, { data: sups }] = await Promise.all([
      supabase.from('vs_materials').select('*').eq('organisation_id', orgId).eq('active', true).order('name'),
      supabase.from('vs_suppliers').select('*').eq('organisation_id', orgId).eq('active', true).order('name'),
    ]);
    setMaterials(mats || []);
    setSuppliers(sups || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const saveMaterial = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setMsg(null);
    const payload = {
      organisation_id: orgId,
      name: form.name.trim(),
      type: form.type || null,
      unit: form.unit || 'ea',
      unit_value: form.unit_value ? parseFloat(form.unit_value) : null,
      price: form.price ? parseFloat(form.price) : null,
      supplier_id: form.supplier_id || null,
    };
    let error;
    if (editItem) {
      ({ error } = await supabase.from('vs_materials').update(payload).eq('id', editItem.id));
    } else {
      const sku = `SKU-${Date.now().toString(36).toUpperCase()}`;
      ({ error } = await supabase.from('vs_materials').insert({ ...payload, sku }));
    }
    if (error) setMsg({ type: 'err', text: error.message });
    else {
      setMsg({ type: 'ok', text: editItem ? 'Material updated.' : 'Material added.' });
      setShowAdd(false); setEditItem(null);
      setForm({ name: '', type: '', unit: 'ea', unit_value: '', price: '', supplier_id: '' });
      await load();
    }
    setSaving(false);
  };

  const deleteMaterial = async (id: string) => {
    await supabase.from('vs_materials').update({ active: false }).eq('id', id);
    await load();
  };

  const addSupplier = async () => {
    if (!supplierName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('vs_suppliers').insert({ organisation_id: orgId, name: supplierName.trim() });
    if (error) setMsg({ type: 'err', text: error.message });
    else { setShowAddSupplier(false); setSupplierName(''); await load(); }
    setSaving(false);
  };

  const deleteSupplier = async (sup: VsSupplier) => {
    const linked = materials.filter(m => m.supplier_id === sup.id).length;
    if (linked > 0) { setMsg({ type: 'err', text: `Cannot delete: ${linked} material(s) linked.` }); return; }
    await supabase.from('vs_suppliers').update({ active: false }).eq('id', sup.id);
    await load();
  };

  const filtered = materials.filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <SubScreenHeader title="Manage Materials" onBack={onBack} />
      <div className="flex border-b border-slate-800">
        {(['materials', 'suppliers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-sky-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
            }`}>
            {t}
          </button>
        ))}
      </div>
      <Msg msg={msg} />

      {tab === 'materials' && (
        <>
          <div className="p-5 flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-3 text-slate-500" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search materials..."
                className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500" />
            </div>
            <button onClick={() => { setEditItem(null); setForm({ name: '', type: '', unit: 'ea', unit_value: '', price: '', supplier_id: '' }); setShowAdd(true); }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg font-medium transition-colors">
              <Plus size={15} /> Add
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          ) : (
            <div className="flex-1 overflow-y-auto px-5 space-y-2">
              {filtered.map(m => {
                const sup = suppliers.find(s => s.id === m.supplier_id);
                return (
                  <div key={m.id} className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{m.name}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{[m.type, m.unit, sup?.name].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-2">
                      {m.price != null && <span className="text-emerald-400 text-sm font-medium">${m.price.toFixed(2)}</span>}
                      <button onClick={() => { setEditItem(m); setForm({ name: m.name, type: m.type || '', unit: m.unit, unit_value: m.unit_value?.toString() || '', price: m.price?.toString() || '', supplier_id: m.supplier_id || '' }); setShowAdd(true); }}
                        className="p-1.5 text-slate-500 hover:text-sky-400 transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => deleteMaterial(m.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="text-center text-slate-500 text-sm py-12">No materials found</p>}
            </div>
          )}
        </>
      )}

      {tab === 'suppliers' && (
        <>
          <div className="p-5 flex justify-end">
            <button onClick={() => { setShowAddSupplier(true); setSupplierName(''); }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm rounded-lg font-medium transition-colors">
              <Plus size={15} /> Add Supplier
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          ) : (
            <div className="flex-1 overflow-y-auto px-5 space-y-2">
              {suppliers.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3.5">
                  <p className="text-white text-sm font-medium">{s.name}</p>
                  <button onClick={() => deleteSupplier(s)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={15} /></button>
                </div>
              ))}
              {suppliers.length === 0 && <p className="text-center text-slate-500 text-sm py-12">No suppliers yet</p>}
            </div>
          )}
        </>
      )}

      {showAdd && (
        <BottomSheet title={editItem ? 'Edit Material' : 'Add Material'} onClose={() => { setShowAdd(false); setEditItem(null); }}>
          <InputField label="Name" required value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Material name" />
          <InputField label="Type" value={form.type} onChange={v => setForm(p => ({ ...p, type: v }))} placeholder="e.g. Pipe, Fitting" />
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Unit" value={form.unit} onChange={v => setForm(p => ({ ...p, unit: v }))} placeholder="ea" />
            <InputField label="Price ($)" value={form.price} onChange={v => setForm(p => ({ ...p, price: v }))} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5">Supplier</label>
            <select value={form.supplier_id} onChange={e => setForm(prev => ({ ...prev, supplier_id: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500">
              <option value="">None</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <SheetActions onCancel={() => { setShowAdd(false); setEditItem(null); }} onSave={saveMaterial} saving={saving} saveLabel={editItem ? 'Update' : 'Add'} />
        </BottomSheet>
      )}

      {showAddSupplier && (
        <BottomSheet title="Add Supplier" onClose={() => setShowAddSupplier(false)}>
          <InputField label="Supplier Name" required value={supplierName} onChange={setSupplierName} placeholder="e.g. Plumbing Supplies Ltd" />
          <SheetActions onCancel={() => setShowAddSupplier(false)} onSave={addSupplier} saving={saving} />
        </BottomSheet>
      )}
    </div>
  );
}

function ManageSuppliers({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [suppliers, setSuppliers] = useState<VsSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSup, setEditSup] = useState<VsSupplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '', emailInput: '' });
  const [emails, setEmails] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('vs_suppliers').select('*').eq('organisation_id', orgId).eq('active', true).order('name');
    setSuppliers(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditSup(null); setForm({ name: '', phone: '', address: '', emailInput: '' }); setEmails([]); setShowForm(true); };
  const openEdit = (s: VsSupplier) => { setEditSup(s); setForm({ name: s.name, phone: s.phone || '', address: s.address || '', emailInput: '' }); setEmails(s.emails || []); setShowForm(true); };

  const addEmail = () => {
    const e = form.emailInput.trim();
    if (e && !emails.includes(e)) setEmails(prev => [...prev, e]);
    setForm(prev => ({ ...prev, emailInput: '' }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name.trim(), phone: form.phone || null, address: form.address || null, emails };
    let error;
    if (editSup) {
      ({ error } = await supabase.from('vs_suppliers').update(payload).eq('id', editSup.id));
    } else {
      ({ error } = await supabase.from('vs_suppliers').insert({ ...payload, organisation_id: orgId }));
    }
    if (error) setMsg({ type: 'err', text: error.message });
    else { setShowForm(false); setMsg({ type: 'ok', text: 'Supplier saved.' }); await load(); }
    setSaving(false);
  };

  const deactivate = async (id: string) => {
    await supabase.from('vs_suppliers').update({ active: false }).eq('id', id);
    await load();
  };

  return (
    <div className="flex flex-col h-full">
      <SubScreenHeader title="Manage Suppliers" onBack={onBack}
        action={
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg font-medium transition-colors">
            <Plus size={13} /> Add
          </button>
        }
      />
      <Msg msg={msg} />
      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-2 mt-1">
          {suppliers.map(s => (
            <div key={s.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm">{s.name}</p>
                  {s.emails.length > 0 && <p className="text-slate-400 text-xs mt-0.5">{s.emails.join(', ')}</p>}
                  {s.phone && <p className="text-slate-400 text-xs">{s.phone}</p>}
                  {s.address && <p className="text-slate-500 text-xs">{s.address}</p>}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => openEdit(s)} className="p-1.5 text-slate-500 hover:text-sky-400 transition-colors"><Pencil size={14} /></button>
                  <button onClick={() => deactivate(s.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
          {suppliers.length === 0 && <p className="text-center text-slate-500 text-sm py-12">No suppliers yet</p>}
        </div>
      )}

      {showForm && (
        <BottomSheet title={editSup ? 'Edit Supplier' : 'Add Supplier'} onClose={() => setShowForm(false)}>
          <InputField label="Name" required value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Supplier name" />
          <InputField label="Phone" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} placeholder="+64 9 000 0000" />
          <InputField label="Address" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="123 Main St, Auckland" />
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5">Email Addresses</label>
            <div className="flex gap-2">
              <input value={form.emailInput} onChange={e => setForm(p => ({ ...p, emailInput: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addEmail()}
                placeholder="Add email..."
                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500" />
              <button onClick={addEmail} className="px-3 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors"><Plus size={15} /></button>
            </div>
            {emails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {emails.map(e => (
                  <span key={e} className="flex items-center gap-1 bg-sky-900/40 text-sky-300 border border-sky-700/40 rounded-full px-3 py-1 text-xs">
                    {e}
                    <button onClick={() => setEmails(prev => prev.filter(x => x !== e))} className="hover:text-white transition-colors"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <SheetActions onCancel={() => setShowForm(false)} onSave={save} saving={saving} />
        </BottomSheet>
      )}
    </div>
  );
}

function ManageLocations({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [locations, setLocations] = useState<VsLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VsLocation | null>(null);
  const [editAddress, setEditAddress] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', type: 'storeroom' as VsLocation['type'], address: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('vs_locations').select('*').eq('organisation_id', orgId).eq('active', true).order('name');
    setLocations(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const updateAddress = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase.from('vs_locations').update({ address: addressInput }).eq('id', selected.id);
    if (error) setMsg({ type: 'err', text: error.message });
    else {
      setMsg({ type: 'ok', text: 'Address updated.' });
      setSelected(prev => prev ? { ...prev, address: addressInput } : null);
      setLocations(prev => prev.map(l => l.id === selected.id ? { ...l, address: addressInput } : l));
      setEditAddress(false);
    }
    setSaving(false);
  };

  const autoDetect = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const nearest = locations
        .filter(l => l.lat != null && l.lng != null)
        .sort((a, b) => Math.hypot(a.lat! - lat, a.lng! - lng) - Math.hypot(b.lat! - lat, b.lng! - lng))[0];
      if (nearest) setSelected(nearest);
    });
  };

  const addLocation = async () => {
    if (!newLoc.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('vs_locations').insert({ ...newLoc, organisation_id: orgId });
    if (error) setMsg({ type: 'err', text: error.message });
    else { setShowAdd(false); setNewLoc({ name: '', type: 'storeroom', address: '' }); await load(); }
    setSaving(false);
  };

  const deactivate = async (id: string) => {
    await supabase.from('vs_locations').update({ active: false }).eq('id', id);
    if (selected?.id === id) setSelected(null);
    await load();
  };

  const typeColors: Record<string, string> = {
    storeroom: 'text-sky-400 bg-sky-900/30 border-sky-700/40',
    van: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40',
    site: 'text-amber-400 bg-amber-900/30 border-amber-700/40',
  };

  return (
    <div className="flex flex-col h-full">
      <SubScreenHeader title="Manage Locations" onBack={onBack}
        action={
          <div className="flex items-center gap-2">
            <button onClick={autoDetect} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg font-medium transition-colors">
              <Navigation size={12} /> Auto-detect
            </button>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg font-medium transition-colors">
              <Plus size={13} /> Add
            </button>
          </div>
        }
      />
      <Msg msg={msg} />
      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : !selected ? (
        <div className="flex-1 overflow-y-auto p-5 space-y-2 mt-1">
          {locations.map(loc => (
            <button key={loc.id} onClick={() => setSelected(loc)}
              className="w-full flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-4 hover:bg-slate-800 transition-colors text-left">
              <div>
                <p className="text-white font-medium text-sm">{loc.name}</p>
                <p className="text-slate-400 text-xs mt-0.5">{loc.address || 'No address set'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${typeColors[loc.type] || 'text-slate-400 bg-slate-700 border-slate-600'}`}>{loc.type}</span>
                <ChevronRight size={15} className="text-slate-500" />
              </div>
            </button>
          ))}
          {locations.length === 0 && <p className="text-center text-slate-500 text-sm py-12">No locations yet</p>}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sky-400 text-sm font-medium hover:text-sky-300 transition-colors">
            <ArrowLeft size={14} /> All Locations
          </button>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-base">{selected.name}</h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${typeColors[selected.type] || ''}`}>{selected.type}</span>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-1">Address</p>
              {editAddress ? (
                <div className="flex gap-2">
                  <input value={addressInput} onChange={e => setAddressInput(e.target.value)}
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
                  <button onClick={updateAddress} disabled={saving}
                    className="px-3 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-500 transition-colors"><Check size={15} /></button>
                  <button onClick={() => setEditAddress(false)}
                    className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-colors"><X size={15} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-slate-300 text-sm">{selected.address || 'No address set'}</p>
                  <button onClick={() => { setAddressInput(selected.address || ''); setEditAddress(true); }}
                    className="text-slate-500 hover:text-sky-400 transition-colors"><Pencil size={13} /></button>
                </div>
              )}
            </div>
            {selected.lat && <p className="text-slate-500 text-xs">Lat: {selected.lat.toFixed(6)}, Lng: {selected.lng?.toFixed(6)}</p>}
          </div>
          <button onClick={() => deactivate(selected.id)}
            className="w-full py-3 border border-red-700/40 text-red-400 rounded-xl text-sm font-medium hover:bg-red-900/10 transition-colors">
            Deactivate Location
          </button>
        </div>
      )}

      {showAdd && (
        <BottomSheet title="Add Location" onClose={() => setShowAdd(false)}>
          <InputField label="Name" required value={newLoc.name} onChange={v => setNewLoc(p => ({ ...p, name: v }))} placeholder="e.g. Main Storeroom" />
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5">Type</label>
            <select value={newLoc.type} onChange={e => setNewLoc(p => ({ ...p, type: e.target.value as VsLocation['type'] }))}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500">
              <option value="storeroom">Storeroom</option>
              <option value="van">Van</option>
              <option value="site">Site</option>
            </select>
          </div>
          <InputField label="Address" value={newLoc.address} onChange={v => setNewLoc(p => ({ ...p, address: v }))} placeholder="Optional" />
          <SheetActions onCancel={() => setShowAdd(false)} onSave={addLocation} saving={saving} saveLabel="Add" />
        </BottomSheet>
      )}
    </div>
  );
}

function ManageProjects({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [projects, setProjects] = useState<VsProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProj, setEditProj] = useState<VsProject | null>(null);
  const [form, setForm] = useState({ name: '', project_number: '', client_name: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('vs_projects').select('*').eq('organisation_id', orgId).eq('active', true).order('name');
    setProjects(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditProj(null); setForm({ name: '', project_number: '', client_name: '', address: '' }); setShowForm(true); };
  const openEdit = (p: VsProject) => { setEditProj(p); setForm({ name: p.name, project_number: p.project_number || '', client_name: p.client_name || '', address: p.address || '' }); setShowForm(true); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name.trim(), project_number: form.project_number || null, client_name: form.client_name || null, address: form.address || null };
    let error;
    if (editProj) {
      ({ error } = await supabase.from('vs_projects').update(payload).eq('id', editProj.id));
    } else {
      ({ error } = await supabase.from('vs_projects').insert({ ...payload, organisation_id: orgId }));
    }
    if (error) setMsg({ type: 'err', text: error.message });
    else { setShowForm(false); await load(); }
    setSaving(false);
  };

  const remove = async (id: string) => {
    await supabase.from('vs_projects').update({ active: false }).eq('id', id);
    await load();
  };

  return (
    <div className="flex flex-col h-full">
      <SubScreenHeader title="Manage Projects" onBack={onBack}
        action={
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg font-medium transition-colors">
            <Plus size={13} /> Add
          </button>
        }
      />
      <Msg msg={msg} />
      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 space-y-2 mt-1">
          {projects.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{p.name}</p>
                <p className="text-slate-400 text-xs mt-0.5">{[p.project_number, p.client_name].filter(Boolean).join(' · ')}</p>
                {p.address && <p className="text-slate-500 text-xs">{p.address}</p>}
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={() => openEdit(p)} className="p-1.5 text-slate-500 hover:text-sky-400 transition-colors"><Pencil size={14} /></button>
                <button onClick={() => remove(p.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {projects.length === 0 && <p className="text-center text-slate-500 text-sm py-12">No projects yet</p>}
        </div>
      )}

      {showForm && (
        <BottomSheet title={editProj ? 'Edit Project' : 'Add Project'} onClose={() => setShowForm(false)}>
          <InputField label="Project Name" required value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="e.g. 22 Queen St Fitout" />
          <InputField label="Project Number" value={form.project_number} onChange={v => setForm(p => ({ ...p, project_number: v }))} placeholder="e.g. PRJ-001" />
          <InputField label="Client Name" value={form.client_name} onChange={v => setForm(p => ({ ...p, client_name: v }))} placeholder="e.g. ABC Corp" />
          <InputField label="Address" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="Optional" />
          <SheetActions onCancel={() => setShowForm(false)} onSave={save} saving={saving} saveLabel={editProj ? 'Update' : 'Add'} />
        </BottomSheet>
      )}
    </div>
  );
}

function ViewReports({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [reportType, setReportType] = useState<'project' | 'location'>('project');
  const [projects, setProjects] = useState<VsProject[]>([]);
  const [locations, setLocations] = useState<VsLocation[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [dateRange, setDateRange] = useState<'all' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: l }] = await Promise.all([
        supabase.from('vs_projects').select('*').eq('organisation_id', orgId).eq('active', true).order('name'),
        supabase.from('vs_locations').select('*').eq('organisation_id', orgId).eq('active', true).order('name'),
      ]);
      setProjects(p || []);
      setLocations(l || []);
      setLoading(false);
    })();
  }, [orgId]);

  const generateReport = async () => {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 1200));
    setGenerating(false);
    alert('PDF report generation requires a PDF service integration. Data is ready — connect a PDF renderer to download.');
  };

  return (
    <div className="flex flex-col h-full">
      <SubScreenHeader title="View Reports" onBack={onBack} />
      <div className="flex border-b border-slate-800">
        {(['project', 'location'] as const).map(t => (
          <button key={t} onClick={() => setReportType(t)}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              reportType === t ? 'border-sky-500 text-white' : 'border-transparent text-slate-400 hover:text-white'
            }`}>
            {t === 'project' ? 'Project Movement' : 'Location Inventory'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {loading ? <div className="py-16 flex justify-center"><Spinner /></div> : (
          <>
            {reportType === 'project' ? (
              <>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1.5">Select Project</label>
                  <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500">
                    <option value="">Choose project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.project_number ? ` (${p.project_number})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1.5">Date Range</label>
                  <div className="flex gap-2">
                    {(['all', 'custom'] as const).map(d => (
                      <button key={d} onClick={() => setDateRange(d)}
                        className={`flex-1 py-2.5 text-sm rounded-lg font-medium border transition-colors ${
                          dateRange === d
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'
                        }`}>
                        {d === 'all' ? 'All Time' : 'Custom'}
                      </button>
                    ))}
                  </div>
                </div>
                {dateRange === 'custom' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 text-xs font-medium mb-1.5">Start Date</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500" />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-xs font-medium mb-1.5">End Date</label>
                      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500" />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-1.5">Select Location</label>
                <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500">
                  <option value="">Choose location...</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                </select>
              </div>
            )}

            <button
              onClick={generateReport}
              disabled={generating || (reportType === 'project' ? !selectedProject : !selectedLocation)}
              className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
              {generating ? <><Spinner /> Generating...</> : <><FileText size={16} /> Generate PDF Report</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FindNearestVan({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [address, setAddress] = useState('');
  const [locations, setLocations] = useState<VsLocation[]>([]);
  const [results, setResults] = useState<{ loc: VsLocation; distKm: number | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    (async () => {
      setFetching(true);
      const { data } = await supabase.from('vs_locations').select('*')
        .eq('organisation_id', orgId).eq('active', true).eq('type', 'van').order('name');
      setLocations(data || []);
      setFetching(false);
    })();
  }, [orgId]);

  const find = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setResults(locations.map(loc => ({ loc, distKm: null })));
    setLoading(false);
    alert('Distance calculation requires Google Maps API integration. Van list is shown — connect Google Maps Distance Matrix API to calculate driving distances.');
  };

  return (
    <div className="flex flex-col h-full">
      <SubScreenHeader title="Find Nearest Van / Storage" onBack={onBack} />

      <div className="p-5 space-y-4">
        <div>
          <label className="block text-slate-400 text-xs font-medium mb-1.5">Site Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)}
            placeholder="Enter project or site address..."
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500" />
        </div>
        <button onClick={find} disabled={loading || !address.trim() || fetching}
          className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
          {loading ? <Spinner /> : <><Navigation size={16} /> Find Nearest Van</>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 space-y-2">
        {results.map((r, i) => (
          <div key={r.loc.id} className={`rounded-xl border p-4 ${
            i === 0
              ? 'bg-emerald-900/20 border-emerald-700/40'
              : 'bg-slate-800/60 border-slate-700/50'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                {i === 0 && <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wide block mb-0.5">Nearest</span>}
                <p className={`font-semibold text-sm ${i === 0 ? 'text-emerald-300' : 'text-white'}`}>{r.loc.name}</p>
                {r.loc.address && <p className="text-slate-400 text-xs mt-0.5">{r.loc.address}</p>}
              </div>
              {r.distKm != null && (
                <p className={`font-bold ${i === 0 ? 'text-emerald-400' : 'text-slate-300'}`}>{r.distKm.toFixed(1)} km</p>
              )}
            </div>
          </div>
        ))}
        {fetching && <div className="flex items-center justify-center py-8"><Spinner /></div>}
        {!fetching && locations.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-8">No van locations configured</p>
        )}
      </div>
    </div>
  );
}

function DataSettingsCard({
  icon: Icon, label, color, bgColor, borderColor, orgId, table, onClick,
}: {
  icon: React.ElementType; label: string; color: string; bgColor: string; borderColor: string;
  orgId: string; table: string; onClick: () => void;
}) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!orgId) return;
    supabase.from(table as 'vs_projects').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).eq('active', true)
      .then(({ count: c }) => setCount(c ?? 0));
  }, [orgId, table]);

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${bgColor} ${borderColor} hover:opacity-90 transition-opacity text-center`}
    >
      <div className={`w-9 h-9 rounded-lg bg-slate-800/60 flex items-center justify-center`}>
        <Icon size={18} className={color} />
      </div>
      <span className="text-white text-xs font-semibold">{label}</span>
      <span className={`text-lg font-bold ${color}`}>
        {count === null ? '—' : count}
      </span>
    </button>
  );
}

function DataSettingsProjects({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [projects, setProjects] = useState<VsProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProj, setEditProj] = useState<VsProject | null>(null);
  const [form, setForm] = useState({ name: '', project_number: '', client_name: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('vs_projects').select('*').eq('organisation_id', orgId).eq('active', true).order('name');
    setProjects(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditProj(null); setForm({ name: '', project_number: '', client_name: '', address: '' }); setShowForm(true); };
  const openEdit = (p: VsProject) => { setEditProj(p); setForm({ name: p.name, project_number: p.project_number || '', client_name: p.client_name || '', address: p.address || '' }); setShowForm(true); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name.trim(), project_number: form.project_number || null, client_name: form.client_name || null, address: form.address || null };
    let error;
    if (editProj) {
      ({ error } = await supabase.from('vs_projects').update(payload).eq('id', editProj.id));
    } else {
      ({ error } = await supabase.from('vs_projects').insert({ ...payload, organisation_id: orgId }));
    }
    if (error) setMsg({ type: 'err', text: error.message });
    else { setMsg({ type: 'ok', text: editProj ? 'Project updated.' : 'Project added.' }); setShowForm(false); setEditProj(null); await load(); }
    setSaving(false);
  };

  const remove = async (id: string) => {
    await supabase.from('vs_projects').update({ active: false }).eq('id', id);
    await load();
  };

  const filtered = projects.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.project_number || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <SubScreenHeader
        title="Projects"
        onBack={onBack}
        action={
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg font-medium transition-colors">
            <Plus size={13} /> Add Project
          </button>
        }
      />
      <Msg msg={msg} />
      <div className="p-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects..."
            className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500" />
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-6">
          {filtered.map(p => (
            <div key={p.id} className="flex items-start justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{p.name}</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {p.project_number && (
                    <span className="inline-flex items-center text-xs bg-sky-900/30 text-sky-300 border border-sky-700/30 rounded-md px-2 py-0.5">{p.project_number}</span>
                  )}
                  {p.client_name && (
                    <span className="text-slate-400 text-xs">{p.client_name}</span>
                  )}
                </div>
                {p.address && <p className="text-slate-500 text-xs mt-1">{p.address}</p>}
              </div>
              <div className="flex items-center gap-1 ml-3 flex-none">
                <button onClick={() => openEdit(p)} className="p-1.5 text-slate-500 hover:text-sky-400 transition-colors rounded-md hover:bg-slate-700/50"><Pencil size={14} /></button>
                <button onClick={() => remove(p.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-md hover:bg-slate-700/50"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 gap-3">
              <FolderOpen size={32} className="text-slate-600" />
              <p className="text-slate-500 text-sm">{search ? 'No projects match your search' : 'No projects yet'}</p>
              {!search && <button onClick={openAdd} className="text-sky-400 text-sm font-medium hover:text-sky-300 transition-colors">Add your first project</button>}
            </div>
          )}
        </div>
      )}
      {showForm && (
        <BottomSheet title={editProj ? 'Edit Project' : 'Add Project'} onClose={() => { setShowForm(false); setEditProj(null); }}>
          <InputField label="Project Name" required value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="e.g. 22 Queen St Fitout" />
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Project Number" value={form.project_number} onChange={v => setForm(p => ({ ...p, project_number: v }))} placeholder="e.g. PRJ-001" />
            <InputField label="Client Name" value={form.client_name} onChange={v => setForm(p => ({ ...p, client_name: v }))} placeholder="e.g. ABC Corp" />
          </div>
          <InputField label="Address" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="Optional" />
          <SheetActions onCancel={() => { setShowForm(false); setEditProj(null); }} onSave={save} saving={saving} saveLabel={editProj ? 'Update' : 'Add'} />
        </BottomSheet>
      )}
    </div>
  );
}

function DataSettingsSuppliers({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [suppliers, setSuppliers] = useState<VsSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editSup, setEditSup] = useState<VsSupplier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '', emailInput: '' });
  const [emails, setEmails] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('vs_suppliers').select('*').eq('organisation_id', orgId).eq('active', true).order('name');
    setSuppliers(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditSup(null); setForm({ name: '', phone: '', address: '', emailInput: '' }); setEmails([]); setShowForm(true); };
  const openEdit = (s: VsSupplier) => { setEditSup(s); setForm({ name: s.name, phone: s.phone || '', address: s.address || '', emailInput: '' }); setEmails(s.emails || []); setShowForm(true); };

  const addEmail = () => {
    const e = form.emailInput.trim();
    if (e && !emails.includes(e)) setEmails(prev => [...prev, e]);
    setForm(prev => ({ ...prev, emailInput: '' }));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name.trim(), phone: form.phone || null, address: form.address || null, emails };
    let error;
    if (editSup) {
      ({ error } = await supabase.from('vs_suppliers').update(payload).eq('id', editSup.id));
    } else {
      ({ error } = await supabase.from('vs_suppliers').insert({ ...payload, organisation_id: orgId }));
    }
    if (error) setMsg({ type: 'err', text: error.message });
    else { setMsg({ type: 'ok', text: 'Supplier saved.' }); setShowForm(false); setEditSup(null); await load(); }
    setSaving(false);
  };

  const deactivate = async (id: string) => {
    await supabase.from('vs_suppliers').update({ active: false }).eq('id', id);
    await load();
  };

  const filtered = suppliers.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <SubScreenHeader
        title="Suppliers"
        onBack={onBack}
        action={
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg font-medium transition-colors">
            <Plus size={13} /> Add Supplier
          </button>
        }
      />
      <Msg msg={msg} />
      <div className="p-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers..."
            className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500" />
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-6">
          {filtered.map(s => (
            <div key={s.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm">{s.name}</p>
                  {s.emails.length > 0 && (
                    <p className="text-slate-400 text-xs mt-1 truncate">{s.emails.join(', ')}</p>
                  )}
                  <div className="flex gap-3 mt-1">
                    {s.phone && <span className="text-slate-500 text-xs">{s.phone}</span>}
                    {s.address && <span className="text-slate-500 text-xs truncate">{s.address}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3 flex-none">
                  <button onClick={() => openEdit(s)} className="p-1.5 text-slate-500 hover:text-sky-400 transition-colors rounded-md hover:bg-slate-700/50"><Pencil size={14} /></button>
                  <button onClick={() => deactivate(s.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-md hover:bg-slate-700/50"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 gap-3">
              <Truck size={32} className="text-slate-600" />
              <p className="text-slate-500 text-sm">{search ? 'No suppliers match your search' : 'No suppliers yet'}</p>
              {!search && <button onClick={openAdd} className="text-sky-400 text-sm font-medium hover:text-sky-300 transition-colors">Add your first supplier</button>}
            </div>
          )}
        </div>
      )}
      {showForm && (
        <BottomSheet title={editSup ? 'Edit Supplier' : 'Add Supplier'} onClose={() => { setShowForm(false); setEditSup(null); }}>
          <InputField label="Name" required value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Supplier name" />
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Phone" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} placeholder="+64 9 000 0000" />
            <InputField label="Address" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5">Email Addresses</label>
            <div className="flex gap-2">
              <input value={form.emailInput} onChange={e => setForm(p => ({ ...p, emailInput: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addEmail()} placeholder="Add email..."
                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500" />
              <button onClick={addEmail} className="px-3 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors"><Plus size={15} /></button>
            </div>
            {emails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {emails.map(e => (
                  <span key={e} className="flex items-center gap-1 bg-sky-900/40 text-sky-300 border border-sky-700/40 rounded-full px-3 py-1 text-xs">
                    {e}
                    <button onClick={() => setEmails(prev => prev.filter(x => x !== e))} className="hover:text-white transition-colors"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <SheetActions onCancel={() => { setShowForm(false); setEditSup(null); }} onSave={save} saving={saving} />
        </BottomSheet>
      )}
    </div>
  );
}

function DataSettingsMaterials({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [materials, setMaterials] = useState<VsMaterial[]>([]);
  const [suppliers, setSuppliers] = useState<VsSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<VsMaterial | null>(null);
  const [form, setForm] = useState({ name: '', type: '', unit: 'ea', price: '', supplier_id: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: mats }, { data: sups }] = await Promise.all([
      supabase.from('vs_materials').select('*').eq('organisation_id', orgId).eq('active', true).order('name'),
      supabase.from('vs_suppliers').select('*').eq('organisation_id', orgId).eq('active', true).order('name'),
    ]);
    setMaterials(mats || []);
    setSuppliers(sups || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditItem(null); setForm({ name: '', type: '', unit: 'ea', price: '', supplier_id: '' }); setShowForm(true); };
  const openEdit = (m: VsMaterial) => {
    setEditItem(m);
    setForm({ name: m.name, type: m.type || '', unit: m.unit, price: m.price?.toString() || '', supplier_id: m.supplier_id || '' });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      organisation_id: orgId,
      name: form.name.trim(),
      type: form.type || null,
      unit: form.unit || 'ea',
      price: form.price ? parseFloat(form.price) : null,
      supplier_id: form.supplier_id || null,
    };
    let error;
    if (editItem) {
      ({ error } = await supabase.from('vs_materials').update(payload).eq('id', editItem.id));
    } else {
      const sku = `SKU-${Date.now().toString(36).toUpperCase()}`;
      ({ error } = await supabase.from('vs_materials').insert({ ...payload, sku }));
    }
    if (error) setMsg({ type: 'err', text: error.message });
    else {
      setMsg({ type: 'ok', text: editItem ? 'Material updated.' : 'Material added.' });
      setShowForm(false); setEditItem(null);
      await load();
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    await supabase.from('vs_materials').update({ active: false }).eq('id', id);
    await load();
  };

  const filtered = materials.filter(m => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.sku || '').toLowerCase().includes(search.toLowerCase());
    const matchSupplier = !filterSupplier || m.supplier_id === filterSupplier;
    return matchSearch && matchSupplier;
  });

  return (
    <div className="flex flex-col h-full">
      <SubScreenHeader
        title="Materials"
        onBack={onBack}
        action={
          <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg font-medium transition-colors">
            <Plus size={13} /> Add Material
          </button>
        }
      />
      <Msg msg={msg} />
      <div className="p-4 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search materials..."
            className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500" />
        </div>
        {suppliers.length > 0 && (
          <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 text-sm focus:outline-none focus:border-sky-500">
            <option value="">All suppliers</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-6">
          {filtered.map(m => {
            const sup = suppliers.find(s => s.id === m.supplier_id);
            return (
              <div key={m.id} className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-sm font-medium truncate">{m.name}</p>
                    {m.sku && <span className="text-xs text-slate-500 font-mono">{m.sku}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {m.type && <span className="text-slate-500 text-xs">{m.type}</span>}
                    <span className="text-slate-600 text-xs">·</span>
                    <span className="text-slate-400 text-xs">{m.unit}</span>
                    {sup && (
                      <>
                        <span className="text-slate-600 text-xs">·</span>
                        <span className="text-amber-400/80 text-xs">{sup.name}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-none">
                  {m.price != null && (
                    <span className="text-emerald-400 text-sm font-semibold">${m.price.toFixed(2)}</span>
                  )}
                  <button onClick={() => openEdit(m)} className="p-1.5 text-slate-500 hover:text-sky-400 transition-colors rounded-md hover:bg-slate-700/50"><Pencil size={14} /></button>
                  <button onClick={() => remove(m.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-md hover:bg-slate-700/50"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-16 gap-3">
              <Package size={32} className="text-slate-600" />
              <p className="text-slate-500 text-sm">{search || filterSupplier ? 'No materials match your filter' : 'No materials yet'}</p>
              {!search && !filterSupplier && <button onClick={openAdd} className="text-sky-400 text-sm font-medium hover:text-sky-300 transition-colors">Add your first material</button>}
            </div>
          )}
        </div>
      )}
      {showForm && (
        <BottomSheet title={editItem ? 'Edit Material' : 'Add Material'} onClose={() => { setShowForm(false); setEditItem(null); }}>
          <InputField label="Name" required value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="Material name" />
          <InputField label="Type / Category" value={form.type} onChange={v => setForm(p => ({ ...p, type: v }))} placeholder="e.g. Pipe, Fitting, Valve" />
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Unit" value={form.unit} onChange={v => setForm(p => ({ ...p, unit: v }))} placeholder="ea" />
            <InputField label="Price ($)" value={form.price} onChange={v => setForm(p => ({ ...p, price: v }))} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5">Supplier</label>
            <select value={form.supplier_id} onChange={e => setForm(prev => ({ ...prev, supplier_id: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-sky-500">
              <option value="">None</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <SheetActions onCancel={() => { setShowForm(false); setEditItem(null); }} onSave={save} saving={saving} saveLabel={editItem ? 'Update' : 'Add'} />
        </BottomSheet>
      )}
    </div>
  );
}

export function VerifyStockSettings() {
  const { currentOrganisation } = useOrganisation();
  const [screen, setScreen] = useState<AdminScreen>('settings');
  const [profile, setProfile] = useState<VsUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const orgId = currentOrganisation?.id ?? '';

  useEffect(() => {
    const loadProfile = async () => {
      setProfileLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !orgId) { setProfileLoading(false); return; }

      const { data: existing } = await supabase
        .from('vs_user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (existing) {
        setProfile(existing as VsUserProfile);
      } else {
        const { data: inserted } = await supabase
          .from('vs_user_profiles')
          .upsert({ id: user.id, organisation_id: orgId, role: 'user' })
          .select()
          .maybeSingle();
        if (inserted) setProfile(inserted as VsUserProfile);
      }
      setProfileLoading(false);

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async pos => {
          const { latitude: lat, longitude: lon } = pos.coords;
          await supabase.from('vs_user_profiles').update({
            last_lat: lat, last_lon: lon,
            last_location_at: new Date().toISOString(),
          }).eq('id', user.id);
          setProfile(prev => prev ? { ...prev, last_lat: lat, last_lon: lon, last_location_at: new Date().toISOString() } : prev);
        }, undefined, { enableHighAccuracy: true, timeout: 5000 });
      }
    };
    loadProfile();
  }, [orgId]);

  const handleSignOut = async () => {
    const confirmed = window.confirm('Are you sure you want to sign out?');
    if (!confirmed) return;
    const { error } = await supabase.auth.signOut();
    if (error) setSignOutError(error.message);
    else window.location.href = '/';
  };

  const isAdmin = profile?.role === 'admin';

  if (screen === 'users') return <ManageUsers orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'materials') return <ManageMaterials orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'suppliers') return <ManageSuppliers orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'locations') return <ManageLocations orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'projects') return <ManageProjects orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'reports') return <ViewReports orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'nearest-van') return <FindNearestVan orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'data-projects') return <DataSettingsProjects orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'data-suppliers') return <DataSettingsSuppliers orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'data-materials') return <DataSettingsMaterials orgId={orgId} onBack={() => setScreen('settings')} />;

  const adminTools = [
    { icon: Users, label: 'Manage Users & Roles', screen: 'users' as AdminScreen, color: 'text-sky-400' },
    { icon: Package, label: 'Manage Materials', screen: 'materials' as AdminScreen, color: 'text-emerald-400' },
    { icon: Truck, label: 'Manage Suppliers', screen: 'suppliers' as AdminScreen, color: 'text-amber-400' },
    { icon: MapPin, label: 'Manage Locations', screen: 'locations' as AdminScreen, color: 'text-rose-400' },
    { icon: FolderOpen, label: 'Manage Projects', screen: 'projects' as AdminScreen, color: 'text-violet-400' },
    { icon: FileText, label: 'View Reports', screen: 'reports' as AdminScreen, color: 'text-teal-400' },
    { icon: Navigation, label: 'Find Nearest Van / Storage', screen: 'nearest-van' as AdminScreen, color: 'text-orange-400' },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Data Settings — always visible */}
      <div className="mt-5 mx-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Data Settings</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <DataSettingsCard
            icon={FolderOpen}
            label="Projects"
            color="text-sky-400"
            bgColor="bg-sky-900/20"
            borderColor="border-sky-700/30"
            orgId={orgId}
            table="vs_projects"
            onClick={() => setScreen('data-projects')}
          />
          <DataSettingsCard
            icon={Truck}
            label="Suppliers"
            color="text-amber-400"
            bgColor="bg-amber-900/20"
            borderColor="border-amber-700/30"
            orgId={orgId}
            table="vs_suppliers"
            onClick={() => setScreen('data-suppliers')}
          />
          <DataSettingsCard
            icon={Package}
            label="Materials"
            color="text-emerald-400"
            bgColor="bg-emerald-900/20"
            borderColor="border-emerald-700/30"
            orgId={orgId}
            table="vs_materials"
            onClick={() => setScreen('data-materials')}
          />
        </div>
      </div>

      {profile?.last_lat != null && (
        <div className="mx-5 mt-5 px-4 py-3 bg-slate-800/60 border border-slate-700/50 rounded-xl flex items-start gap-3">
          <PinIcon size={14} className="text-emerald-400 mt-0.5 flex-none" />
          <div>
            <p className="text-emerald-400 text-xs font-medium">Location detected</p>
            <p className="text-slate-400 text-xs mt-0.5">
              {profile.last_lat.toFixed(5)}, {profile.last_lon?.toFixed(5)}
              {profile.last_location_at && ` · ${new Date(profile.last_location_at).toLocaleTimeString()}`}
            </p>
          </div>
        </div>
      )}

      {(isAdmin || profileLoading) && (
        <div className="mt-5 mx-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={13} className="text-sky-400" />
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Admin Tools</span>
          </div>
          {profileLoading ? (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 flex items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
              {adminTools.map((tool, i) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.screen}
                    onClick={() => setScreen(tool.screen)}
                    className={`w-full flex items-center justify-between px-4 py-4 hover:bg-slate-700/50 transition-colors text-left ${
                      i < adminTools.length - 1 ? 'border-b border-slate-700/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-slate-700/60 flex items-center justify-center`}>
                        <Icon size={16} className={tool.color} />
                      </div>
                      <span className="text-white text-sm font-medium">{tool.label}</span>
                    </div>
                    <ChevronRight size={15} className="text-slate-500" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 mx-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Account</span>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-4">
          <p className="text-slate-400 text-xs mb-1">Role</p>
          <p className="text-white font-semibold text-sm">
            {profileLoading ? '—' : profile?.role === 'admin' ? 'Administrator' : 'Standard User'}
          </p>
        </div>
      </div>

      <div className="mt-5 mx-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wide">About</span>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="px-4 py-4 border-b border-slate-700/50">
            <p className="text-slate-400 text-xs mb-1">Version</p>
            <p className="text-white font-semibold text-sm">1.0.0</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-slate-400 text-xs mb-1">Application</p>
            <p className="text-white font-semibold text-sm">StockWize</p>
          </div>
        </div>
      </div>

      {signOutError && (
        <div className="mx-5 mt-4 px-4 py-3 rounded-lg text-sm bg-red-900/30 text-red-300 border border-red-700/40">
          {signOutError}
        </div>
      )}

      <div className="mt-6 mx-5 mb-8">
        <button
          onClick={handleSignOut}
          className="w-full py-4 rounded-xl bg-slate-800/60 border border-red-700/30 text-red-400 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-red-900/10 hover:border-red-600/40 transition-colors">
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
