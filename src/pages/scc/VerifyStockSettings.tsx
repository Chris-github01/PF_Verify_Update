import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import {
  Users, Package, Truck, MapPin, FolderOpen, FileText, Navigation,
  ChevronRight, LogOut, X, Plus, Trash2, Pencil, Search, Upload,
  Check, AlertTriangle, ArrowLeft, ToggleLeft, ToggleRight
} from 'lucide-react';

type AdminScreen = 'settings' | 'users' | 'materials' | 'suppliers' | 'locations' | 'projects' | 'reports' | 'nearest-van';

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

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
    </div>
  );
}

function SettingsRow({
  icon: Icon,
  label,
  onPress,
  iconColor = 'text-sky-500',
}: {
  icon: React.ElementType;
  label: string;
  onPress: () => void;
  iconColor?: string;
}) {
  return (
    <button
      onClick={onPress}
      className="w-full flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors text-left"
    >
      <div className="flex items-center gap-3">
        <Icon size={20} className={iconColor} />
        <span className="text-gray-900 text-sm font-medium">{label}</span>
      </div>
      <ChevronRight size={16} className="text-gray-400" />
    </button>
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

  const filtered = users.filter(u =>
    !search || u.email.toLowerCase().includes(search.toLowerCase())
  );

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
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-sky-500 px-4 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-white"><ArrowLeft size={20} /></button>
        <h2 className="text-white font-semibold text-base">Manage Users & Roles</h2>
      </div>
      <div className="p-4">
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-3 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full border border-gray-200 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
        </div>
        {msg && (
          <div className={`mb-3 px-4 py-3 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {msg.text}
          </div>
        )}
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map(user => (
            <div key={user.id} className="flex items-center justify-between bg-white border-b border-gray-100 px-4 py-3.5">
              <div>
                <p className="text-gray-900 text-sm font-medium">{user.email}</p>
                {user.van_plate && <p className="text-gray-400 text-xs">{user.van_plate}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  user.role === 'admin' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'
                }`}>{user.role === 'admin' ? 'ADMIN' : 'USER'}</span>
                <button
                  onClick={() => setConfirmUser(user)}
                  disabled={saving}
                  className="text-xs text-sky-600 hover:text-sky-800 font-medium border border-sky-200 rounded px-2.5 py-1 hover:bg-sky-50 transition-colors">
                  {user.role === 'admin' ? 'Make User' : 'Make Admin'}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-12">No users found</p>
          )}
        </div>
      )}

      {confirmUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-gray-900 font-semibold text-base">Confirm Role Change</h3>
            <p className="text-gray-600 text-sm">
              Change <strong>{confirmUser.email}</strong> to{' '}
              <strong>{confirmUser.role === 'admin' ? 'Standard User' : 'Administrator'}</strong>?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmUser(null)}
                className="flex-1 border border-gray-200 rounded-lg py-3 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => toggleRole(confirmUser)} disabled={saving}
                className="flex-1 bg-sky-500 hover:bg-sky-600 rounded-lg py-3 text-white text-sm font-semibold transition-colors">
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
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
    else { setMsg({ type: 'ok', text: editItem ? 'Material updated.' : 'Material added.' }); setShowAdd(false); setEditItem(null); setForm({ name: '', type: '', unit: 'ea', unit_value: '', price: '', supplier_id: '' }); await load(); }
    setSaving(false);
  };

  const deleteMaterial = async (id: string) => {
    const { error } = await supabase.from('vs_materials').update({ active: false }).eq('id', id);
    if (error) setMsg({ type: 'err', text: error.message });
    else await load();
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
    if (linked > 0) { setMsg({ type: 'err', text: `Cannot delete: ${linked} material(s) linked to this supplier.` }); return; }
    await supabase.from('vs_suppliers').update({ active: false }).eq('id', sup.id);
    await load();
  };

  const filtered = materials.filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-sky-500 px-4 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-white"><ArrowLeft size={20} /></button>
        <h2 className="text-white font-semibold text-base">Manage Materials</h2>
      </div>
      <div className="flex border-b border-gray-200 bg-white">
        {(['materials', 'suppliers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${tab === t ? 'text-sky-600 border-b-2 border-sky-500' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`mx-4 mt-3 px-4 py-3 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {tab === 'materials' && (
        <>
          <div className="p-4 flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-3 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search materials..."
                className="w-full border border-gray-200 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
            </div>
            <button onClick={() => { setEditItem(null); setForm({ name: '', type: '', unit: 'ea', unit_value: '', price: '', supplier_id: '' }); setShowAdd(true); }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-lg font-medium transition-colors">
              <Plus size={15} /> Add
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {filtered.map(m => {
                const sup = suppliers.find(s => s.id === m.supplier_id);
                return (
                  <div key={m.id} className="flex items-center justify-between bg-white border-b border-gray-100 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 text-sm font-medium truncate">{m.name}</p>
                      <p className="text-gray-400 text-xs">{[m.type, m.unit, sup?.name].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-2">
                      {m.price != null && <span className="text-gray-600 text-sm font-medium">${m.price.toFixed(2)}</span>}
                      <button onClick={() => { setEditItem(m); setForm({ name: m.name, type: m.type || '', unit: m.unit, unit_value: m.unit_value?.toString() || '', price: m.price?.toString() || '', supplier_id: m.supplier_id || '' }); setShowAdd(true); }}
                        className="p-1.5 text-gray-400 hover:text-sky-600 transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => deleteMaterial(m.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-12">No materials found</p>}
            </div>
          )}
        </>
      )}

      {tab === 'suppliers' && (
        <>
          <div className="p-4 flex justify-end">
            <button onClick={() => { setShowAddSupplier(true); setSupplierName(''); }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-lg font-medium transition-colors">
              <Plus size={15} /> Add Supplier
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {suppliers.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-white border-b border-gray-100 px-4 py-3.5">
                  <p className="text-gray-900 text-sm font-medium">{s.name}</p>
                  <button onClick={() => deleteSupplier(s)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                </div>
              ))}
              {suppliers.length === 0 && <p className="text-center text-gray-400 text-sm py-12">No suppliers yet</p>}
            </div>
          )}
        </>
      )}

      {(showAdd) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-900 font-semibold text-base">{editItem ? 'Edit Material' : 'Add Material'}</h3>
              <button onClick={() => { setShowAdd(false); setEditItem(null); }}><X size={18} className="text-gray-400" /></button>
            </div>
            {[
              { key: 'name', label: 'Name *', placeholder: 'Material name' },
              { key: 'type', label: 'Type', placeholder: 'e.g. Pipe, Fitting' },
              { key: 'unit', label: 'Unit', placeholder: 'ea' },
              { key: 'unit_value', label: 'Unit Value', placeholder: '0.00' },
              { key: 'price', label: 'Price ($)', placeholder: '0.00' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input value={(form as Record<string, string>)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
              <select value={form.supplier_id} onChange={e => setForm(prev => ({ ...prev, supplier_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400">
                <option value="">None</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowAdd(false); setEditItem(null); }}
                className="flex-1 border border-gray-200 rounded-lg py-3 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={saveMaterial} disabled={saving}
                className="flex-1 bg-sky-500 hover:bg-sky-600 rounded-lg py-3 text-white text-sm font-semibold transition-colors">
                {saving ? 'Saving...' : editItem ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddSupplier && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-900 font-semibold text-base">Add Supplier</h3>
              <button onClick={() => setShowAddSupplier(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Name *</label>
              <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="e.g. Plumbing Supplies Ltd"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddSupplier(false)}
                className="flex-1 border border-gray-200 rounded-lg py-3 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={addSupplier} disabled={saving}
                className="flex-1 bg-sky-500 hover:bg-sky-600 rounded-lg py-3 text-white text-sm font-semibold transition-colors">
                {saving ? 'Saving...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
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

  const openAdd = () => {
    setEditSup(null);
    setForm({ name: '', phone: '', address: '', emailInput: '' });
    setEmails([]);
    setShowForm(true);
  };

  const openEdit = (s: VsSupplier) => {
    setEditSup(s);
    setForm({ name: s.name, phone: s.phone || '', address: s.address || '', emailInput: '' });
    setEmails(s.emails || []);
    setShowForm(true);
  };

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
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-sky-500 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-white"><ArrowLeft size={20} /></button>
          <h2 className="text-white font-semibold text-base">Manage Suppliers</h2>
        </div>
        <button onClick={openAdd} className="bg-white/20 hover:bg-white/30 text-white rounded-lg px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors">
          <Plus size={14} /> Add
        </button>
      </div>

      {msg && (
        <div className={`mx-4 mt-3 px-4 py-3 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : (
        <div className="flex-1 overflow-y-auto mt-3">
          {suppliers.map(s => (
            <div key={s.id} className="bg-white border-b border-gray-100 px-4 py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-medium text-sm">{s.name}</p>
                  {s.emails.length > 0 && <p className="text-gray-500 text-xs mt-0.5">{s.emails.join(', ')}</p>}
                  {s.phone && <p className="text-gray-500 text-xs">{s.phone}</p>}
                  {s.address && <p className="text-gray-500 text-xs">{s.address}</p>}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-sky-600 transition-colors"><Pencil size={15} /></button>
                  <button onClick={() => deactivate(s.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          ))}
          {suppliers.length === 0 && <p className="text-center text-gray-400 text-sm py-12">No suppliers yet</p>}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-900 font-semibold text-base">{editSup ? 'Edit Supplier' : 'Add Supplier'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            {[
              { key: 'name', label: 'Name *', placeholder: 'Supplier name' },
              { key: 'phone', label: 'Phone', placeholder: '+64 9 000 0000' },
              { key: 'address', label: 'Address', placeholder: '123 Main St, Auckland' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input value={(form as Record<string, string>)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email Addresses</label>
              <div className="flex gap-2">
                <input value={form.emailInput} onChange={e => setForm(prev => ({ ...prev, emailInput: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addEmail()}
                  placeholder="Add email..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
                <button onClick={addEmail} className="px-3 py-2.5 bg-sky-500 text-white rounded-lg text-sm"><Plus size={15} /></button>
              </div>
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {emails.map(e => (
                    <span key={e} className="flex items-center gap-1 bg-sky-100 text-sky-700 rounded-full px-3 py-1 text-xs">
                      {e}
                      <button onClick={() => setEmails(prev => prev.filter(x => x !== e))}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 rounded-lg py-3 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-sky-500 hover:bg-sky-600 rounded-lg py-3 text-white text-sm font-semibold transition-colors">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
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

  const autoDetect = async () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const nearest = locations
        .filter(l => l.lat != null && l.lng != null)
        .sort((a, b) => {
          const da = Math.hypot((a.lat! - lat), (a.lng! - lng));
          const db = Math.hypot((b.lat! - lat), (b.lng! - lng));
          return da - db;
        })[0];
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

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-sky-500 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-white"><ArrowLeft size={20} /></button>
          <h2 className="text-white font-semibold text-base">Manage Locations</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={autoDetect} className="bg-white/20 hover:bg-white/30 text-white rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors">
            <Navigation size={13} /> Auto-detect
          </button>
          <button onClick={() => setShowAdd(true)} className="bg-white/20 hover:bg-white/30 text-white rounded-lg px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {msg && (
        <div className={`mx-4 mt-3 px-4 py-3 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : !selected ? (
        <div className="flex-1 overflow-y-auto mt-3">
          {locations.map(loc => (
            <button key={loc.id} onClick={() => setSelected(loc)}
              className="w-full flex items-center justify-between bg-white border-b border-gray-100 px-4 py-4 hover:bg-gray-50 transition-colors text-left">
              <div>
                <p className="text-gray-900 font-medium text-sm">{loc.name}</p>
                <p className="text-gray-400 text-xs capitalize">{loc.type}{loc.address ? ` · ${loc.address}` : ''}</p>
              </div>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
          ))}
          {locations.length === 0 && <p className="text-center text-gray-400 text-sm py-12">No locations yet</p>}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sky-500 text-sm font-medium">
            <ArrowLeft size={15} /> All Locations
          </button>
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-900 font-semibold">{selected.name}</h3>
              <span className="text-xs capitalize bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{selected.type}</span>
            </div>
            <div className="flex items-start justify-between">
              {editAddress ? (
                <div className="flex-1 flex gap-2">
                  <input value={addressInput} onChange={e => setAddressInput(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" />
                  <button onClick={updateAddress} disabled={saving}
                    className="px-3 py-2 bg-sky-500 text-white rounded-lg text-sm"><Check size={15} /></button>
                  <button onClick={() => setEditAddress(false)}
                    className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm"><X size={15} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-gray-600 text-sm">{selected.address || 'No address set'}</p>
                  <button onClick={() => { setAddressInput(selected.address || ''); setEditAddress(true); }}
                    className="text-gray-400 hover:text-sky-600 transition-colors"><Pencil size={14} /></button>
                </div>
              )}
            </div>
            {selected.lat && <p className="text-gray-400 text-xs">Lat: {selected.lat.toFixed(6)}, Lng: {selected.lng?.toFixed(6)}</p>}
          </div>
          <button onClick={() => deactivate(selected.id)}
            className="w-full py-3 border border-red-200 text-red-500 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
            Deactivate Location
          </button>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-900 font-semibold text-base">Add Location</h3>
              <button onClick={() => setShowAdd(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={newLoc.name} onChange={e => setNewLoc(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Main Storeroom"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={newLoc.type} onChange={e => setNewLoc(p => ({ ...p, type: e.target.value as VsLocation['type'] }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400">
                <option value="storeroom">Storeroom</option>
                <option value="van">Van</option>
                <option value="site">Site</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
              <input value={newLoc.address} onChange={e => setNewLoc(p => ({ ...p, address: e.target.value }))} placeholder="Optional"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 border border-gray-200 rounded-lg py-3 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={addLocation} disabled={saving}
                className="flex-1 bg-sky-500 hover:bg-sky-600 rounded-lg py-3 text-white text-sm font-semibold transition-colors">
                {saving ? 'Saving...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
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
    const { error } = await supabase.from('vs_projects').update({ active: false }).eq('id', id);
    if (error) setMsg({ type: 'err', text: error.message });
    else await load();
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-sky-500 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-white"><ArrowLeft size={20} /></button>
          <h2 className="text-white font-semibold text-base">Manage Projects</h2>
        </div>
        <button onClick={openAdd} className="bg-white/20 hover:bg-white/30 text-white rounded-lg px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 transition-colors">
          <Plus size={14} /> Add
        </button>
      </div>

      {msg && (
        <div className={`mx-4 mt-3 px-4 py-3 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Spinner /></div>
      ) : (
        <div className="flex-1 overflow-y-auto mt-3">
          {projects.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-white border-b border-gray-100 px-4 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium text-sm">{p.name}</p>
                <p className="text-gray-400 text-xs">{[p.project_number, p.client_name].filter(Boolean).join(' · ')}</p>
                {p.address && <p className="text-gray-400 text-xs">{p.address}</p>}
              </div>
              <div className="flex items-center gap-2 ml-2">
                <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-sky-600 transition-colors"><Pencil size={14} /></button>
                <button onClick={() => remove(p.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {projects.length === 0 && <p className="text-center text-gray-400 text-sm py-12">No projects yet</p>}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-900 font-semibold text-base">{editProj ? 'Edit Project' : 'Add Project'}</h3>
              <button onClick={() => setShowForm(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            {[
              { key: 'name', label: 'Project Name *', placeholder: 'e.g. 22 Queen St Fitout' },
              { key: 'project_number', label: 'Project Number', placeholder: 'e.g. PRJ-001' },
              { key: 'client_name', label: 'Client Name', placeholder: 'e.g. ABC Corp' },
              { key: 'address', label: 'Address', placeholder: 'Optional' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input value={(form as Record<string, string>)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 rounded-lg py-3 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving}
                className="flex-1 bg-sky-500 hover:bg-sky-600 rounded-lg py-3 text-white text-sm font-semibold transition-colors">
                {saving ? 'Saving...' : editProj ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
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
    alert('PDF report generation requires a PDF service integration. Reports data is ready — connect a PDF renderer to download.');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-sky-500 px-4 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-white"><ArrowLeft size={20} /></button>
        <h2 className="text-white font-semibold text-base">View Reports</h2>
      </div>

      <div className="flex border-b border-gray-200 bg-white">
        {(['project', 'location'] as const).map(t => (
          <button key={t} onClick={() => setReportType(t)}
            className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${reportType === t ? 'text-sky-600 border-b-2 border-sky-500' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'project' ? 'Project Movement' : 'Location Inventory'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? <div className="py-16 flex justify-center"><Spinner /></div> : (
          <>
            {reportType === 'project' ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Select Project</label>
                  <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400">
                    <option value="">Choose project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.project_number ? ` (${p.project_number})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date Range</label>
                  <div className="flex gap-2">
                    {(['all', 'custom'] as const).map(d => (
                      <button key={d} onClick={() => setDateRange(d)}
                        className={`flex-1 py-2.5 text-sm rounded-lg font-medium border transition-colors ${dateRange === d ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        {d === 'all' ? 'All Time' : 'Custom'}
                      </button>
                    ))}
                  </div>
                </div>
                {dateRange === 'custom' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                      <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                      <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Select Location</label>
                <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400">
                  <option value="">Choose location...</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
                </select>
              </div>
            )}

            <button
              onClick={generateReport}
              disabled={generating || (reportType === 'project' ? !selectedProject : !selectedLocation)}
              className="w-full py-3.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
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
  const [results, setResults] = useState<{ loc: VsLocation; distKm: number | null; label: string }[]>([]);
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
    const sorted = locations.map(loc => ({
      loc,
      distKm: null as number | null,
      label: loc.name,
    }));
    setResults(sorted);
    setLoading(false);
    alert('Distance calculation requires Google Maps API integration. Van list is shown — connect Google Maps Distance Matrix API to calculate driving distances.');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-sky-500 px-4 py-4 flex items-center gap-3">
        <button onClick={onBack} className="text-white"><ArrowLeft size={20} /></button>
        <h2 className="text-white font-semibold text-base">Find Nearest Van</h2>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Site Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)}
            placeholder="Enter project or site address..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400" />
        </div>
        <button onClick={find} disabled={loading || !address.trim() || fetching}
          className="w-full py-3.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors">
          {loading ? <Spinner /> : <><Navigation size={16} /> Find Nearest Van</>}
        </button>
      </div>

      {results.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 space-y-2">
          {results.map((r, i) => (
            <div key={r.loc.id} className={`rounded-xl border p-4 ${i === 0 ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  {i === 0 && <span className="text-green-600 text-xs font-semibold uppercase tracking-wide">Nearest</span>}
                  <p className={`font-semibold text-sm ${i === 0 ? 'text-green-800' : 'text-gray-800'}`}>{r.loc.name}</p>
                  {r.loc.address && <p className="text-gray-500 text-xs">{r.loc.address}</p>}
                </div>
                {r.distKm != null && (
                  <div className="text-right">
                    <p className={`font-bold ${i === 0 ? 'text-green-700' : 'text-gray-700'}`}>{r.distKm.toFixed(1)} km</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {fetching && (
        <div className="flex items-center justify-center py-8"><Spinner /></div>
      )}
      {!fetching && locations.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">No van locations configured</p>
      )}
    </div>
  );
}

export function VerifyStockSettings() {
  const { currentOrganisation } = useOrganisation();
  const [screen, setScreen] = useState<AdminScreen>('settings');
  const [profile, setProfile] = useState<VsUserProfile | null>(null);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const orgId = currentOrganisation?.id ?? '';

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !orgId) return;

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

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async pos => {
          const { latitude: lat, longitude: lon } = pos.coords;
          await supabase.from('vs_user_profiles').update({
            last_lat: lat,
            last_lon: lon,
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
    if (error) {
      setSignOutError(error.message);
    } else {
      window.location.href = '/';
    }
  };

  const isAdmin = profile?.role === 'admin';

  if (screen === 'users') return <ManageUsers orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'materials') return <ManageMaterials orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'suppliers') return <ManageSuppliers orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'locations') return <ManageLocations orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'projects') return <ManageProjects orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'reports') return <ViewReports orgId={orgId} onBack={() => setScreen('settings')} />;
  if (screen === 'nearest-van') return <FindNearestVan orgId={orgId} onBack={() => setScreen('settings')} />;

  return (
    <div className="flex flex-col h-full bg-gray-100">
      <div className="bg-gradient-to-r from-sky-500 to-sky-600 px-4 pt-6 pb-5">
        <h1 className="text-white font-bold text-2xl">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {profile?.last_lat != null && (
          <div className="px-4 pt-3 pb-2">
            <p className="text-gray-500 text-xs">Lat: {profile.last_lat.toFixed(6)}, Lon: {profile.last_lon?.toFixed(6)}</p>
            {profile.last_location_at && (
              <p className="text-gray-400 text-xs">Updated: {new Date(profile.last_location_at).toLocaleString()}</p>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="mt-3">
            <SectionHeader title="ADMIN TOOLS" />
            <SettingsRow icon={Users} label="Manage Users & Roles" onPress={() => setScreen('users')} />
            <SettingsRow icon={Package} label="Manage Materials" onPress={() => setScreen('materials')} />
            <SettingsRow icon={Truck} label="Manage Suppliers" onPress={() => setScreen('suppliers')} />
            <SettingsRow icon={MapPin} label="Manage Locations" onPress={() => setScreen('locations')} />
            <SettingsRow icon={FolderOpen} label="Manage Projects" onPress={() => setScreen('projects')} />
            <SettingsRow icon={FileText} label="View Reports" onPress={() => setScreen('reports')} />
            <SettingsRow icon={Navigation} label="Find Nearest Van" onPress={() => setScreen('nearest-van')} />
          </div>
        )}

        <div className="mt-3">
          <SectionHeader title="ACCOUNT" />
          <div className="bg-white px-4 py-4 border-b border-gray-100">
            <p className="text-gray-500 text-xs mb-0.5">Role</p>
            <p className="text-gray-900 font-semibold text-sm">
              {profile?.role === 'admin' ? 'Administrator' : 'Standard User'}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <SectionHeader title="ABOUT" />
          <div className="bg-white px-4 py-4 border-b border-gray-100">
            <p className="text-gray-500 text-xs mb-0.5">Version</p>
            <p className="text-gray-900 font-semibold text-sm">1.0.0</p>
          </div>
          <div className="bg-white px-4 py-4 border-b border-gray-100">
            <p className="text-gray-500 text-xs mb-0.5">Application</p>
            <p className="text-gray-900 font-semibold text-sm">StockWize</p>
          </div>
        </div>

        {signOutError && (
          <div className="mx-4 mt-3 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
            {signOutError}
          </div>
        )}

        <div className="mt-6 mx-4 mb-8">
          <button
            onClick={handleSignOut}
            className="w-full py-4 rounded-2xl bg-white border border-gray-200 text-red-500 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-red-50 transition-colors shadow-sm">
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
