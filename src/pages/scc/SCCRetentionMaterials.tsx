import { useState, useEffect } from 'react';
import {
  RefreshCw, Plus, Package, Truck, DollarSign, Lock, CheckCircle,
  AlertCircle, ChevronRight, Calendar, FileText, Shield, TrendingDown
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import { useTrade } from '../../lib/tradeContext';

interface Contract {
  id: string;
  contract_name: string;
  contract_number: string;
  contract_value: number;
  retention_percentage: number;
  retention_limit_pct: number;
  payment_claim_prefix: string;
}

interface RetentionEntry {
  id: string;
  contract_id: string;
  event_type: string;
  gross_amount_this_period: number;
  retention_rate_pct: number;
  amount_held: number;
  amount_released: number;
  running_balance: number;
  release_date: string | null;
  notes: string | null;
  created_at: string;
}

interface OnSiteMaterial {
  id: string;
  description: string;
  material_reference: string | null;
  location_on_site: string | null;
  quantity: number | null;
  unit: string | null;
  unit_rate: number | null;
  claimed_amount: number;
  approved_amount: number | null;
  delivery_date: string | null;
  delivery_docket: string | null;
  status: string;
  notes: string | null;
}

interface OffSiteMaterial {
  id: string;
  description: string;
  material_reference: string | null;
  storage_location: string | null;
  is_bond_secured: boolean;
  quantity: number | null;
  unit: string | null;
  unit_rate: number | null;
  claimed_amount: number;
  approved_amount: number | null;
  fabrication_complete_date: string | null;
  inspection_date: string | null;
  inspector_name: string | null;
  status: string;
  notes: string | null;
}

const MATERIAL_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:      { label: 'Pending',      color: 'text-gray-300',   bg: 'bg-gray-500/20'   },
  submitted:    { label: 'Submitted',    color: 'text-blue-300',   bg: 'bg-blue-500/20'   },
  approved:     { label: 'Approved',     color: 'text-green-300',  bg: 'bg-green-500/20'  },
  rejected:     { label: 'Rejected',     color: 'text-red-300',    bg: 'bg-red-500/20'    },
  incorporated: { label: 'Incorporated', color: 'text-cyan-300',   bg: 'bg-cyan-500/20'   },
  delivered:    { label: 'Delivered',    color: 'text-cyan-300',   bg: 'bg-cyan-500/20'   },
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

type ActiveTab = 'retention' | 'on_site' | 'off_site';

export default function SCCRetentionMaterials() {
  const { currentOrganisation } = useOrganisation();
  const { currentTrade } = useTrade();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('retention');
  const [retention, setRetention] = useState<RetentionEntry[]>([]);
  const [onSite, setOnSite] = useState<OnSiteMaterial[]>([]);
  const [offSite, setOffSite] = useState<OffSiteMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddOnSite, setShowAddOnSite] = useState(false);
  const [showAddOffSite, setShowAddOffSite] = useState(false);
  const [onSiteForm, setOnSiteForm] = useState({ description: '', location_on_site: '', claimed_amount: '', delivery_docket: '', delivery_date: '' });
  const [offSiteForm, setOffSiteForm] = useState({ description: '', storage_location: '', claimed_amount: '', is_bond_secured: false, inspector_name: '', inspection_date: '' });

  useEffect(() => {
    if (currentOrganisation?.id) loadContracts();
  }, [currentOrganisation?.id, currentTrade]);

  const loadContracts = async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('scc_contracts')
      .select('id, contract_name, contract_number, contract_value, retention_percentage, retention_limit_pct, payment_claim_prefix')
      .eq('organisation_id', currentOrganisation.id)
      .eq('trade', currentTrade)
      .eq('snapshot_locked', true)
      .order('created_at', { ascending: false });
    setContracts(data || []);
    setLoading(false);
  };

  const loadContractData = async (contract: Contract) => {
    setSelectedContract(contract);
    const [retRes, onSiteRes, offSiteRes] = await Promise.all([
      supabase.from('scc_retention_ledger').select('*').eq('contract_id', contract.id).order('created_at', { ascending: true }),
      supabase.from('scc_on_site_materials').select('*').eq('contract_id', contract.id).order('created_at', { ascending: false }),
      supabase.from('scc_off_site_materials').select('*').eq('contract_id', contract.id).order('created_at', { ascending: false }),
    ]);
    setRetention(retRes.data || []);
    setOnSite(onSiteRes.data || []);
    setOffSite(offSiteRes.data || []);
  };

  const addOnSiteMaterial = async () => {
    if (!selectedContract || !currentOrganisation?.id) return;
    setSaving(true);
    const { data } = await supabase.from('scc_on_site_materials').insert({
      organisation_id: currentOrganisation.id,
      contract_id: selectedContract.id,
      description: onSiteForm.description,
      location_on_site: onSiteForm.location_on_site || null,
      claimed_amount: parseFloat(onSiteForm.claimed_amount) || 0,
      delivery_docket: onSiteForm.delivery_docket || null,
      delivery_date: onSiteForm.delivery_date || null,
      status: 'pending',
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    if (data) {
      setOnSite(prev => [data, ...prev]);
      setOnSiteForm({ description: '', location_on_site: '', claimed_amount: '', delivery_docket: '', delivery_date: '' });
      setShowAddOnSite(false);
    }
    setSaving(false);
  };

  const addOffSiteMaterial = async () => {
    if (!selectedContract || !currentOrganisation?.id) return;
    setSaving(true);
    const { data } = await supabase.from('scc_off_site_materials').insert({
      organisation_id: currentOrganisation.id,
      contract_id: selectedContract.id,
      description: offSiteForm.description,
      storage_location: offSiteForm.storage_location || null,
      claimed_amount: parseFloat(offSiteForm.claimed_amount) || 0,
      is_bond_secured: offSiteForm.is_bond_secured,
      inspector_name: offSiteForm.inspector_name || null,
      inspection_date: offSiteForm.inspection_date || null,
      status: 'pending',
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    if (data) {
      setOffSite(prev => [data, ...prev]);
      setOffSiteForm({ description: '', storage_location: '', claimed_amount: '', is_bond_secured: false, inspector_name: '', inspection_date: '' });
      setShowAddOffSite(false);
    }
    setSaving(false);
  };

  const updateMaterialStatus = async (table: string, id: string, status: string, items: OnSiteMaterial[] | OffSiteMaterial[], setter: React.Dispatch<React.SetStateAction<any[]>>) => {
    await supabase.from(table).update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setter((prev: (OnSiteMaterial | OffSiteMaterial)[]) => prev.map((i: OnSiteMaterial | OffSiteMaterial) => i.id === id ? { ...i, status } : i));
  };

  const totalRetentionHeld = retention.reduce((s, r) => s + (r.amount_held || 0), 0);
  const totalRetentionReleased = retention.reduce((s, r) => s + (r.amount_released || 0), 0);
  const retentionBalance = retention.length > 0 ? retention[retention.length - 1].running_balance : 0;
  const onSiteTotal = onSite.filter(m => m.status === 'approved').reduce((s, m) => s + (m.claimed_amount || 0), 0);
  const offSiteTotal = offSite.filter(m => m.status === 'approved').reduce((s, m) => s + (m.claimed_amount || 0), 0);

  if (!selectedContract) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white">Retention & Materials</h2>
          <p className="text-sm text-gray-400 mt-0.5">Step 4 — Track retention money, on-site and off-site materials</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-cyan-400" />
          </div>
        ) : contracts.length === 0 ? (
          <div className="border-2 border-dashed border-slate-700 rounded-2xl p-16 text-center">
            <Shield size={40} className="text-gray-600 mb-4 mx-auto" />
            <p className="text-white font-semibold">No active contracts</p>
            <p className="text-gray-400 text-sm mt-1">Lock a contract first to track retention and materials.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {contracts.map(contract => (
              <div
                key={contract.id}
                onClick={() => loadContractData(contract)}
                className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800/80 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                    <Shield size={18} className="text-yellow-400" />
                  </div>
                  <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">{contract.retention_percentage}% retention</span>
                </div>
                <h4 className="font-semibold text-white mb-0.5">{contract.contract_name}</h4>
                <p className="text-sm text-gray-400 mb-3">{contract.contract_number}</p>
                <div className="text-sm text-gray-400">
                  Max retention: {fmt(contract.contract_value * contract.retention_limit_pct / 100)}
                </div>
                <div className="flex items-center gap-1 mt-3 text-cyan-400 text-sm font-medium">
                  Open <ChevronRight size={14} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setSelectedContract(null)} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
          <ChevronRight size={16} className="rotate-180" /> Back
        </button>
        <span className="text-gray-600">/</span>
        <span className="text-white font-medium">{selectedContract.contract_name}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Retention Held',     value: fmt(totalRetentionHeld),     color: 'text-yellow-400', sub: 'cumulative' },
          { label: 'Retention Released', value: fmt(totalRetentionReleased),  color: 'text-green-400',  sub: 'to date' },
          { label: 'Retention Balance',  value: fmt(retentionBalance),        color: 'text-white',       sub: 'currently held' },
          { label: 'Materials Approved', value: fmt(onSiteTotal + offSiteTotal), color: 'text-cyan-400', sub: 'on+off site' },
        ].map(stat => (
          <div key={stat.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-1">
        {[
          { id: 'retention' as ActiveTab, label: 'Retention Ledger', icon: Shield },
          { id: 'on_site' as ActiveTab,   label: 'On-Site Materials', icon: Package },
          { id: 'off_site' as ActiveTab,  label: 'Off-Site Materials', icon: Truck },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-cyan-500 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            <tab.icon size={15} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Retention Ledger */}
      {activeTab === 'retention' && (
        <div className="space-y-4">
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 text-sm">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-gray-500 text-xs">Rate</p>
                <p className="text-white font-bold">{selectedContract.retention_percentage}%</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Cap</p>
                <p className="text-white font-bold">{selectedContract.retention_limit_pct}%</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Max Holdable</p>
                <p className="text-yellow-400 font-bold">{fmt(selectedContract.contract_value * selectedContract.retention_limit_pct / 100)}</p>
              </div>
            </div>
          </div>

          {retention.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-800/50 border border-slate-700/50 rounded-xl">
              <TrendingDown size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-400 font-medium">No retention entries yet</p>
              <p className="text-gray-500 text-sm mt-1">Retention is recorded automatically when claims are submitted.</p>
            </div>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Event</th>
                    <th className="text-right px-5 py-3 text-gray-400 font-medium">Gross Claim</th>
                    <th className="text-right px-5 py-3 text-gray-400 font-medium">Rate</th>
                    <th className="text-right px-5 py-3 text-gray-400 font-medium">Held</th>
                    <th className="text-right px-5 py-3 text-gray-400 font-medium">Released</th>
                    <th className="text-right px-5 py-3 text-gray-400 font-medium">Balance</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {retention.map(entry => (
                    <tr key={entry.id} className={`${entry.amount_released > 0 ? 'bg-green-500/5' : ''}`}>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          entry.event_type === 'hold' ? 'bg-yellow-500/20 text-yellow-300'
                          : entry.event_type.includes('release') ? 'bg-green-500/20 text-green-300'
                          : 'bg-gray-500/20 text-gray-300'
                        }`}>
                          {entry.event_type === 'hold' ? 'Hold'
                            : entry.event_type === 'practical_completion_release' ? 'PC Release'
                            : entry.event_type === 'final_completion_release' ? 'Final Release'
                            : 'Release'}
                        </span>
                        {entry.notes && <p className="text-gray-500 text-xs mt-0.5">{entry.notes}</p>}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-300">{fmt(entry.gross_amount_this_period)}</td>
                      <td className="px-5 py-3 text-right text-gray-400 text-xs">{entry.retention_rate_pct}%</td>
                      <td className="px-5 py-3 text-right text-yellow-400">{entry.amount_held > 0 ? fmt(entry.amount_held) : '—'}</td>
                      <td className="px-5 py-3 text-right text-green-400">{entry.amount_released > 0 ? fmt(entry.amount_released) : '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold text-white">{fmt(entry.running_balance)}</td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{fmtDate(entry.release_date)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-700/50 bg-slate-900/30">
                    <td colSpan={3} className="px-5 py-3 text-right text-gray-400 text-sm font-medium">Current Balance</td>
                    <td className="px-5 py-3 text-right text-yellow-400 font-bold">{fmt(totalRetentionHeld)}</td>
                    <td className="px-5 py-3 text-right text-green-400 font-bold">{fmt(totalRetentionReleased)}</td>
                    <td className="px-5 py-3 text-right font-bold text-white text-lg">{fmt(retentionBalance)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* On-Site Materials */}
      {activeTab === 'on_site' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">On-Site Materials</h3>
              <p className="text-xs text-gray-500 mt-0.5">Materials delivered to site but not yet incorporated into the works</p>
            </div>
            <button
              onClick={() => setShowAddOnSite(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus size={16} /> Add Material
            </button>
          </div>

          {showAddOnSite && (
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5 space-y-4">
              <h4 className="font-semibold text-white text-sm">Add On-Site Material Claim</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">Description *</label>
                  <input type="text" value={onSiteForm.description} onChange={e => setOnSiteForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Location on Site</label>
                  <input type="text" value={onSiteForm.location_on_site} onChange={e => setOnSiteForm(f => ({ ...f, location_on_site: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Claimed Amount (NZD)</label>
                  <input type="number" value={onSiteForm.claimed_amount} onChange={e => setOnSiteForm(f => ({ ...f, claimed_amount: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Delivery Docket</label>
                  <input type="text" value={onSiteForm.delivery_docket} onChange={e => setOnSiteForm(f => ({ ...f, delivery_docket: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Delivery Date</label>
                  <input type="date" value={onSiteForm.delivery_date} onChange={e => setOnSiteForm(f => ({ ...f, delivery_date: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAddOnSite(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">Cancel</button>
                <button onClick={addOnSiteMaterial} disabled={saving || !onSiteForm.description} className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {saving ? <RefreshCw size={16} className="animate-spin mx-auto" /> : 'Add Material'}
                </button>
              </div>
            </div>
          )}

          {onSite.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-800/50 border border-slate-700/50 rounded-xl">
              <Package size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-400 font-medium">No on-site materials yet</p>
              <p className="text-gray-500 text-sm mt-1">Add materials stored on site to include in your claims.</p>
            </div>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Description</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Location</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Docket</th>
                    <th className="text-right px-5 py-3 text-gray-400 font-medium">Claimed</th>
                    <th className="text-right px-5 py-3 text-gray-400 font-medium">Approved</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {onSite.map(mat => {
                    const cfg = MATERIAL_STATUS[mat.status] || MATERIAL_STATUS.pending;
                    return (
                      <tr key={mat.id} className="hover:bg-slate-700/20">
                        <td className="px-5 py-4">
                          <div className="text-white">{mat.description}</div>
                          <div className="text-gray-500 text-xs">{fmtDate(mat.delivery_date)}</div>
                        </td>
                        <td className="px-5 py-4 text-gray-400 text-sm">{mat.location_on_site || '—'}</td>
                        <td className="px-5 py-4 text-gray-400 text-xs">{mat.delivery_docket || '—'}</td>
                        <td className="px-5 py-4 text-right font-medium text-white">{fmt(mat.claimed_amount)}</td>
                        <td className="px-5 py-4 text-right text-green-400">{mat.approved_amount !== null ? fmt(mat.approved_amount) : '—'}</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                        </td>
                        <td className="px-5 py-4">
                          {mat.status === 'pending' && (
                            <button
                              onClick={() => updateMaterialStatus('scc_on_site_materials', mat.id, 'submitted', onSite, setOnSite)}
                              className="text-xs text-cyan-400 hover:text-white transition-colors"
                            >
                              Submit
                            </button>
                          )}
                          {mat.status === 'approved' && (
                            <button
                              onClick={() => updateMaterialStatus('scc_on_site_materials', mat.id, 'incorporated', onSite, setOnSite)}
                              className="text-xs text-green-400 hover:text-white transition-colors"
                            >
                              Mark Incorporated
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Off-Site Materials */}
      {activeTab === 'off_site' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Off-Site Materials</h3>
              <p className="text-xs text-gray-500 mt-0.5">Fabricated or stored materials not yet delivered to site</p>
            </div>
            <button
              onClick={() => setShowAddOffSite(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Plus size={16} /> Add Material
            </button>
          </div>

          {showAddOffSite && (
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-5 space-y-4">
              <h4 className="font-semibold text-white text-sm">Add Off-Site Material Claim</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-400 mb-1 block">Description *</label>
                  <input type="text" value={offSiteForm.description} onChange={e => setOffSiteForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Storage Location</label>
                  <input type="text" value={offSiteForm.storage_location} onChange={e => setOffSiteForm(f => ({ ...f, storage_location: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Claimed Amount (NZD)</label>
                  <input type="number" value={offSiteForm.claimed_amount} onChange={e => setOffSiteForm(f => ({ ...f, claimed_amount: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Inspector</label>
                  <input type="text" value={offSiteForm.inspector_name} onChange={e => setOffSiteForm(f => ({ ...f, inspector_name: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Inspection Date</label>
                  <input type="date" value={offSiteForm.inspection_date} onChange={e => setOffSiteForm(f => ({ ...f, inspection_date: e.target.value }))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="bond" checked={offSiteForm.is_bond_secured} onChange={e => setOffSiteForm(f => ({ ...f, is_bond_secured: e.target.checked }))} className="rounded" />
                  <label htmlFor="bond" className="text-sm text-gray-300">Bond secured</label>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAddOffSite(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">Cancel</button>
                <button onClick={addOffSiteMaterial} disabled={saving || !offSiteForm.description} className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {saving ? <RefreshCw size={16} className="animate-spin mx-auto" /> : 'Add Material'}
                </button>
              </div>
            </div>
          )}

          {offSite.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-800/50 border border-slate-700/50 rounded-xl">
              <Truck size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-400 font-medium">No off-site materials yet</p>
              <p className="text-gray-500 text-sm mt-1">Add fabricated or stored materials to include in your claims.</p>
            </div>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Description</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Location</th>
                    <th className="text-center px-5 py-3 text-gray-400 font-medium">Bond</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Inspector</th>
                    <th className="text-right px-5 py-3 text-gray-400 font-medium">Claimed</th>
                    <th className="text-right px-5 py-3 text-gray-400 font-medium">Approved</th>
                    <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {offSite.map(mat => {
                    const cfg = MATERIAL_STATUS[mat.status] || MATERIAL_STATUS.pending;
                    return (
                      <tr key={mat.id} className="hover:bg-slate-700/20">
                        <td className="px-5 py-4">
                          <div className="text-white">{mat.description}</div>
                          {mat.fabrication_complete_date && <div className="text-gray-500 text-xs">Fab: {fmtDate(mat.fabrication_complete_date)}</div>}
                        </td>
                        <td className="px-5 py-4 text-gray-400 text-sm">{mat.storage_location || '—'}</td>
                        <td className="px-5 py-4 text-center">
                          {mat.is_bond_secured
                            ? <CheckCircle size={16} className="text-green-400 mx-auto" />
                            : <AlertCircle size={16} className="text-yellow-400 mx-auto" />}
                        </td>
                        <td className="px-5 py-4 text-gray-400 text-sm">{mat.inspector_name || '—'}</td>
                        <td className="px-5 py-4 text-right font-medium text-white">{fmt(mat.claimed_amount)}</td>
                        <td className="px-5 py-4 text-right text-green-400">{mat.approved_amount !== null ? fmt(mat.approved_amount) : '—'}</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
