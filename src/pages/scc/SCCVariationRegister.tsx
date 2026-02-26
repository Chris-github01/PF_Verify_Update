import { useState, useEffect } from 'react';
import {
  ArrowLeft, Plus, X, CheckCircle, AlertTriangle, TrendingUp,
  TrendingDown, Minus, Edit2, Trash2, ChevronDown, ChevronRight,
  FileText
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SCCContract, SCCVariation } from '../../types/scc.types';

interface SCCVariationRegisterProps {
  contractId: string;
  onBack: () => void;
}

const nzd = (v: number) =>
  '$' + Math.abs(v).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const voStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-slate-400', bg: 'bg-slate-700/60' },
  submitted: { label: 'Submitted', color: 'text-sky-400', bg: 'bg-sky-900/30' },
  approved: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-900/30' },
  rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-900/30' },
  claimed: { label: 'Claimed', color: 'text-blue-400', bg: 'bg-blue-900/30' },
  paid: { label: 'Paid', color: 'text-teal-400', bg: 'bg-teal-900/30' },
};

const voTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
  addition: { label: 'Addition', icon: TrendingUp, color: 'text-emerald-400' },
  omission: { label: 'Omission', icon: TrendingDown, color: 'text-red-400' },
  adjustment: { label: 'Adjustment', icon: Minus, color: 'text-amber-400' },
};

const statusOrder = ['draft', 'submitted', 'approved', 'rejected', 'claimed', 'paid'];

const blankForm = {
  vo_number: '',
  title: '',
  description: '',
  type: 'addition' as SCCVariation['type'],
  status: 'draft' as SCCVariation['status'],
  submitted_by: '',
  instructed_by: '',
  instruction_reference: '',
  claimed_amount: '',
  approved_amount: '',
  notes: '',
};

export default function SCCVariationRegister({ contractId, onBack }: SCCVariationRegisterProps) {
  const [contract, setContract] = useState<SCCContract | null>(null);
  const [variations, setVariations] = useState<SCCVariation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<SCCVariation | null>(null);
  const [form, setForm] = useState({ ...blankForm });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => { load(); }, [contractId]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: c }, { data: v }] = await Promise.all([
        supabase.from('scc_contracts').select('*').eq('id', contractId).maybeSingle(),
        supabase.from('scc_variations').select('*').eq('contract_id', contractId).order('created_at'),
      ]);
      setContract(c);
      setVariations(v || []);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const nextVONumber = () => {
    const existing = variations.map(v => parseInt(v.vo_number?.replace(/\D/g, '') || '0')).filter(Boolean);
    const max = existing.length > 0 ? Math.max(...existing) : 0;
    return `VO-${String(max + 1).padStart(3, '0')}`;
  };

  const openNew = () => {
    setForm({ ...blankForm, vo_number: nextVONumber() });
    setEditTarget(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (v: SCCVariation) => {
    setForm({
      vo_number: v.vo_number,
      title: v.title,
      description: v.description,
      type: v.type,
      status: v.status,
      submitted_by: v.submitted_by,
      instructed_by: v.instructed_by,
      instruction_reference: v.instruction_reference,
      claimed_amount: String(v.claimed_amount),
      approved_amount: v.approved_amount != null ? String(v.approved_amount) : '',
      notes: v.notes,
    });
    setEditTarget(v);
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !contract) {
      setFormError('Title is required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        contract_id: contractId,
        project_id: contract.project_id,
        organisation_id: contract.organisation_id,
        vo_number: form.vo_number.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        status: form.status,
        submitted_by: form.submitted_by.trim(),
        instructed_by: form.instructed_by.trim(),
        instruction_reference: form.instruction_reference.trim(),
        claimed_amount: parseFloat(form.claimed_amount) || 0,
        approved_amount: form.approved_amount ? parseFloat(form.approved_amount) : null,
        notes: form.notes.trim(),
        updated_at: new Date().toISOString(),
      };

      if (editTarget) {
        const { error } = await supabase.from('scc_variations').update(payload).eq('id', editTarget.id);
        if (error) throw error;
        showToast('Variation updated');
      } else {
        const { error } = await supabase.from('scc_variations').insert(payload);
        if (error) throw error;
        showToast('Variation created');
      }

      setShowForm(false);
      setEditTarget(null);
      await load();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (voId: string) => {
    await supabase.from('scc_variations').delete().eq('id', voId);
    await load();
    showToast('Variation removed');
  };

  const totalApproved = variations
    .filter(v => ['approved', 'claimed', 'paid'].includes(v.status))
    .reduce((s, v) => {
      const amt = v.approved_amount ?? v.claimed_amount;
      return v.type === 'omission' ? s - amt : s + amt;
    }, 0);

  const totalPending = variations
    .filter(v => ['draft', 'submitted'].includes(v.status))
    .reduce((s, v) => s + v.claimed_amount, 0);

  const adjustedContractValue = (contract?.contract_value || 0) + totalApproved;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border ${
          toast.type === 'success'
            ? 'bg-emerald-900/90 border-emerald-700 text-emerald-200'
            : 'bg-red-900/90 border-red-700 text-red-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/60">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white">Variation Register</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {contract?.contract_name} — {contract?.subcontractor_name}
                </p>
              </div>
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus size={14} />
              New Variation
            </button>
          </div>

          {/* Summary strip */}
          {variations.length > 0 && (
            <div className="grid grid-cols-3 gap-4 mt-5">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
                <p className="text-slate-400 text-xs mb-1">Original Contract</p>
                <p className="text-white font-bold text-lg">{nzd(contract?.contract_value || 0)}</p>
              </div>
              <div className={`border rounded-2xl p-4 ${totalApproved >= 0 ? 'bg-emerald-900/20 border-emerald-700/30' : 'bg-red-900/20 border-red-700/30'}`}>
                <p className={`text-xs mb-1 ${totalApproved >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>Approved Variations</p>
                <p className={`font-bold text-lg ${totalApproved >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalApproved >= 0 ? '+' : '-'}{nzd(totalApproved)}
                </p>
              </div>
              <div className="bg-sky-900/20 border border-sky-700/30 rounded-2xl p-4">
                <p className="text-sky-400/80 text-xs mb-1">Adjusted Contract Value</p>
                <p className="text-sky-300 font-bold text-lg">{nzd(adjustedContractValue)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {variations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-sky-900/30 flex items-center justify-center mb-4">
              <FileText size={24} className="text-sky-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">No variations yet</h3>
            <p className="text-slate-400 text-sm max-w-sm mb-6">Record additions, omissions, and scope adjustments to keep the contract traceable.</p>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold"
            >
              <Plus size={14} />
              New Variation
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {statusOrder
              .filter(status => variations.some(v => v.status === status))
              .map(status => {
                const group = variations.filter(v => v.status === status);
                const cfg = voStatusConfig[status];
                return (
                  <div key={status}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-slate-500 text-xs">{group.length} variation{group.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-2">
                      {group.map(vo => {
                        const typeCfg = voTypeConfig[vo.type];
                        const TypeIcon = typeCfg.icon;
                        const isExpanded = expandedId === vo.id;
                        return (
                          <div key={vo.id} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden hover:border-slate-600 transition-all">
                            <div
                              className="flex items-center justify-between px-5 py-4 cursor-pointer"
                              onClick={() => setExpandedId(isExpanded ? null : vo.id)}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg bg-slate-700/80 flex items-center justify-center`}>
                                  <TypeIcon size={15} className={typeCfg.color} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 text-xs font-mono">{vo.vo_number}</span>
                                    <span className="text-white font-semibold text-sm">{vo.title}</span>
                                    <span className={`text-xs font-medium ${typeCfg.color}`}>{typeCfg.label}</span>
                                  </div>
                                  {vo.description && (
                                    <p className="text-slate-400 text-xs mt-0.5 line-clamp-1">{vo.description}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-white font-bold text-sm">
                                    {vo.type === 'omission' ? '(' : '+'}{nzd(vo.approved_amount ?? vo.claimed_amount)}
                                  </p>
                                  {vo.approved_amount != null && vo.approved_amount !== vo.claimed_amount && (
                                    <p className="text-slate-500 text-xs">Claimed: {nzd(vo.claimed_amount)}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button onClick={e => { e.stopPropagation(); openEdit(vo); }} className="p-1.5 text-slate-500 hover:text-sky-400 hover:bg-sky-900/20 rounded-lg transition-colors">
                                    <Edit2 size={13} />
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); handleDelete(vo.id); }} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                                {isExpanded ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="border-t border-slate-700/50 px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <InfoCell label="Submitted By" value={vo.submitted_by || '—'} />
                                <InfoCell label="Instructed By" value={vo.instructed_by || '—'} />
                                <InfoCell label="Instruction Ref" value={vo.instruction_reference || '—'} />
                                <InfoCell label="Claimed" value={nzd(vo.claimed_amount)} />
                                {vo.approved_amount != null && (
                                  <InfoCell label="Approved" value={nzd(vo.approved_amount)} />
                                )}
                                {vo.notes && (
                                  <div className="col-span-2 md:col-span-4">
                                    <p className="text-slate-500 text-xs mb-1">Notes</p>
                                    <p className="text-slate-300 text-sm">{vo.notes}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-xl shadow-2xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h3 className="text-white font-bold">{editTarget ? 'Edit Variation' : 'New Variation'}</h3>
              <button onClick={() => { setShowForm(false); setEditTarget(null); }} className="text-slate-400 hover:text-white p-1"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-xl text-red-300 text-sm">
                  <AlertTriangle size={14} />
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField label="VO Number">
                  <input value={form.vo_number} onChange={e => setForm(p => ({ ...p, vo_number: e.target.value }))} className={inputCls} placeholder="VO-001" />
                </FormField>
                <FormField label="Type">
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as SCCVariation['type'] }))} className={inputCls}>
                    <option value="addition">Addition</option>
                    <option value="omission">Omission</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </FormField>
              </div>
              <FormField label="Title *">
                <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={inputCls} placeholder="Brief title for this variation" />
              </FormField>
              <FormField label="Description">
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className={inputCls + ' resize-none'} placeholder="Detailed description of scope change..." />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Submitted By">
                  <input value={form.submitted_by} onChange={e => setForm(p => ({ ...p, submitted_by: e.target.value }))} className={inputCls} placeholder="Who submitted this VO" />
                </FormField>
                <FormField label="Instructed By">
                  <input value={form.instructed_by} onChange={e => setForm(p => ({ ...p, instructed_by: e.target.value }))} className={inputCls} placeholder="Who instructed the change" />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Instruction Reference">
                  <input value={form.instruction_reference} onChange={e => setForm(p => ({ ...p, instruction_reference: e.target.value }))} className={inputCls} placeholder="e.g. RFI-12, SI-003" />
                </FormField>
                <FormField label="Status">
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as SCCVariation['status'] }))} className={inputCls}>
                    {statusOrder.map(s => (
                      <option key={s} value={s}>{voStatusConfig[s].label}</option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Claimed Amount ($)">
                  <input type="number" min="0" step="0.01" value={form.claimed_amount} onChange={e => setForm(p => ({ ...p, claimed_amount: e.target.value }))} className={inputCls} placeholder="0.00" />
                </FormField>
                <FormField label="Approved Amount ($)">
                  <input type="number" min="0" step="0.01" value={form.approved_amount} onChange={e => setForm(p => ({ ...p, approved_amount: e.target.value }))} className={inputCls} placeholder="Leave blank if not yet approved" />
                </FormField>
              </div>
              <FormField label="Notes">
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputCls + ' resize-none'} placeholder="Any notes..." />
              </FormField>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
              <button onClick={() => { setShowForm(false); setEditTarget(null); }} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold"
              >
                <CheckCircle size={14} />
                {saving ? 'Saving...' : editTarget ? 'Update' : 'Create Variation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <p className="text-slate-200 text-sm">{value}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-slate-400 text-xs font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors';
