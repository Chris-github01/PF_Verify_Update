import { useState, useEffect } from 'react';
import {
  ArrowLeft, Plus, Lock, Unlock, Save, Trash2, AlertTriangle,
  CheckCircle, Hash, Building2, Calendar, Shield, X, Edit2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SCCContract, SCCScopeLine } from '../../types/scc.types';

interface SCCScopeLedgerProps {
  contractId: string;
  onBack: () => void;
  onNavigateToClaims: () => void;
}

const nzd = (v: number) =>
  '$' + v.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SCCScopeLedger({ contractId, onBack, onNavigateToClaims }: SCCScopeLedgerProps) {
  const [contract, setContract] = useState<SCCContract | null>(null);
  const [lines, setLines] = useState<SCCScopeLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddLine, setShowAddLine] = useState(false);
  const [editingLine, setEditingLine] = useState<SCCScopeLine | null>(null);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [lineForm, setLineForm] = useState({
    section: 'General',
    description: '',
    system_category: '',
    unit: 'item',
    qty_contract: '',
    unit_rate: '',
    claim_method: 'percentage' as SCCScopeLine['claim_method'],
    evidence_required: false,
    notes: '',
  });

  useEffect(() => { load(); }, [contractId]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: c }, { data: l }] = await Promise.all([
        supabase.from('scc_contracts').select('*').eq('id', contractId).maybeSingle(),
        supabase.from('scc_scope_lines').select('*').eq('contract_id', contractId).order('line_number'),
      ]);
      setContract(c);
      setLines(l || []);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAddLine = async () => {
    if (!lineForm.description.trim() || !contract) return;
    setSaving(true);
    try {
      const nextNumber = `SCC-${String(lines.filter(l => !l.is_variation).length + 1).padStart(4, '0')}`;
      const { error } = await supabase.from('scc_scope_lines').insert({
        contract_id: contractId,
        project_id: contract.project_id,
        organisation_id: contract.organisation_id,
        line_number: nextNumber,
        section: lineForm.section.trim() || 'General',
        description: lineForm.description.trim(),
        system_category: lineForm.system_category.trim(),
        unit: lineForm.unit.trim() || 'item',
        qty_contract: parseFloat(lineForm.qty_contract) || 0,
        unit_rate: parseFloat(lineForm.unit_rate) || 0,
        claim_method: lineForm.claim_method,
        evidence_required: lineForm.evidence_required,
        notes: lineForm.notes.trim(),
        is_variation: false,
      });
      if (error) throw error;
      setShowAddLine(false);
      resetLineForm();
      await load();
      showToast('Line added successfully');
    } catch (err: any) {
      showToast(err.message || 'Failed to add line', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLine = async () => {
    if (!editingLine) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('scc_scope_lines').update({
        section: lineForm.section.trim() || 'General',
        description: lineForm.description.trim(),
        system_category: lineForm.system_category.trim(),
        unit: lineForm.unit.trim() || 'item',
        qty_contract: parseFloat(lineForm.qty_contract) || 0,
        unit_rate: parseFloat(lineForm.unit_rate) || 0,
        claim_method: lineForm.claim_method,
        evidence_required: lineForm.evidence_required,
        notes: lineForm.notes.trim(),
      }).eq('id', editingLine.id);
      if (error) throw error;
      setEditingLine(null);
      await load();
      showToast('Line updated');
    } catch (err: any) {
      showToast(err.message || 'Failed to update', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    if (contract?.snapshot_locked) return;
    await supabase.from('scc_scope_lines').delete().eq('id', lineId);
    await load();
    showToast('Line removed');
  };

  const handleLockSnapshot = async () => {
    if (!contract) return;
    setSaving(true);
    try {
      const hash = btoa(JSON.stringify(lines.map(l => ({
        ln: l.line_number, d: l.description, q: l.qty_contract, r: l.unit_rate
      }))));
      const { error } = await supabase.from('scc_contracts').update({
        snapshot_locked: true,
        snapshot_hash: hash,
        status: 'active',
        updated_at: new Date().toISOString(),
      }).eq('id', contractId);
      if (error) throw error;
      setLockConfirm(false);
      await load();
      showToast('Contract snapshot locked — baseline is now immutable');
    } catch (err: any) {
      showToast(err.message || 'Failed to lock snapshot', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openEditLine = (line: SCCScopeLine) => {
    setLineForm({
      section: line.section,
      description: line.description,
      system_category: line.system_category,
      unit: line.unit,
      qty_contract: String(line.qty_contract),
      unit_rate: String(line.unit_rate),
      claim_method: line.claim_method,
      evidence_required: line.evidence_required,
      notes: line.notes,
    });
    setEditingLine(line);
  };

  const resetLineForm = () => {
    setLineForm({
      section: 'General',
      description: '',
      system_category: '',
      unit: 'item',
      qty_contract: '',
      unit_rate: '',
      claim_method: 'percentage',
      evidence_required: false,
      notes: '',
    });
  };

  const totalValue = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const sections = Array.from(new Set(lines.map(l => l.section)));

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Contract not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Toast */}
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
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white">{contract.contract_name}</h1>
                  {contract.contract_number && (
                    <span className="text-slate-500 text-sm font-mono">{contract.contract_number}</span>
                  )}
                  {contract.snapshot_locked && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-700/40">
                      <Lock size={10} />
                      Snapshot Locked
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-sm mt-0.5">
                  {contract.subcontractor_name}
                  {contract.subcontractor_company ? ` — ${contract.subcontractor_company}` : ''}
                  {' '}·{' '}Scope Ledger
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!contract.snapshot_locked && lines.length > 0 && (
                <button
                  onClick={() => setLockConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-700/60 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <Lock size={14} />
                  Lock Snapshot
                </button>
              )}
              {!contract.snapshot_locked && (
                <button
                  onClick={() => setShowAddLine(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <Plus size={14} />
                  Add Line
                </button>
              )}
              <button
                onClick={onNavigateToClaims}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Hash size={14} />
                Claims
              </button>
            </div>
          </div>

          {/* Contract summary strip */}
          <div className="flex items-center gap-6 mt-4 text-sm text-slate-400">
            <span>Contract Value: <span className="text-white font-semibold">{nzd(contract.contract_value)}</span></span>
            <span>Scope Lines Total: <span className={`font-semibold ${Math.abs(totalValue - contract.contract_value) > 1 ? 'text-amber-400' : 'text-emerald-400'}`}>{nzd(totalValue)}</span></span>
            <span>{lines.length} lines</span>
            <span>{contract.retention_percentage}% retention</span>
            <span>{contract.payment_terms_days}d payment terms</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-sky-900/30 flex items-center justify-center mb-4">
              <Hash size={24} className="text-sky-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">No scope lines yet</h3>
            <p className="text-slate-400 text-sm max-w-sm mb-6">Add each line item from the approved quote to create the contract baseline.</p>
            <button
              onClick={() => setShowAddLine(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus size={14} />
              Add First Line
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {sections.map(section => {
              const sectionLines = lines.filter(l => l.section === section);
              const sectionTotal = sectionLines.reduce((s, l) => s + (l.line_total || 0), 0);
              return (
                <div key={section}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{section}</h3>
                    <span className="text-slate-400 text-xs">{nzd(sectionTotal)}</span>
                  </div>
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="text-left px-4 py-3 text-slate-500 text-xs font-semibold uppercase tracking-wide w-24">Line</th>
                          <th className="text-left px-4 py-3 text-slate-500 text-xs font-semibold uppercase tracking-wide">Description</th>
                          <th className="text-right px-4 py-3 text-slate-500 text-xs font-semibold uppercase tracking-wide w-24">Qty</th>
                          <th className="text-left px-4 py-3 text-slate-500 text-xs font-semibold uppercase tracking-wide w-16">Unit</th>
                          <th className="text-right px-4 py-3 text-slate-500 text-xs font-semibold uppercase tracking-wide w-28">Rate</th>
                          <th className="text-right px-4 py-3 text-slate-500 text-xs font-semibold uppercase tracking-wide w-28">Total</th>
                          <th className="text-center px-4 py-3 text-slate-500 text-xs font-semibold uppercase tracking-wide w-24">Method</th>
                          {!contract.snapshot_locked && <th className="w-16" />}
                        </tr>
                      </thead>
                      <tbody>
                        {sectionLines.map((line, i) => (
                          <tr key={line.id} className={`border-b border-slate-700/30 last:border-0 ${i % 2 === 0 ? '' : 'bg-slate-900/20'} hover:bg-slate-700/20 transition-colors`}>
                            <td className="px-4 py-3">
                              <span className="font-mono text-slate-400 text-xs">{line.line_number}</span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-white text-sm leading-snug">{line.description}</p>
                              {line.system_category && (
                                <p className="text-slate-500 text-xs mt-0.5">{line.system_category}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-300">{line.qty_contract.toLocaleString()}</td>
                            <td className="px-4 py-3 text-slate-400 text-xs">{line.unit}</td>
                            <td className="px-4 py-3 text-right text-slate-300">{nzd(line.unit_rate)}</td>
                            <td className="px-4 py-3 text-right text-white font-semibold">{nzd(line.line_total)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-xs bg-slate-700/60 text-slate-400 capitalize">
                                {line.claim_method}
                              </span>
                            </td>
                            {!contract.snapshot_locked && (
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  <button onClick={() => openEditLine(line)} className="p-1.5 text-slate-500 hover:text-sky-400 hover:bg-sky-900/20 rounded-lg transition-colors">
                                    <Edit2 size={13} />
                                  </button>
                                  <button onClick={() => handleDeleteLine(line.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* Totals */}
            <div className="flex items-center justify-end gap-6 pt-2 border-t border-slate-800">
              <span className="text-slate-400 text-sm">Scope Lines Total:</span>
              <span className="text-xl font-bold text-white">{nzd(totalValue)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Line Modal */}
      {(showAddLine || editingLine) && (
        <LineFormModal
          form={lineForm}
          onChange={(k, v) => setLineForm(prev => ({ ...prev, [k]: v }))}
          onSave={editingLine ? handleUpdateLine : handleAddLine}
          onClose={() => { setShowAddLine(false); setEditingLine(null); resetLineForm(); }}
          saving={saving}
          isEdit={!!editingLine}
        />
      )}

      {/* Lock Snapshot Confirm */}
      {lockConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-amber-700/50 p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-900/30 flex items-center justify-center">
                <Lock size={18} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-white font-bold">Lock Contract Snapshot?</h3>
                <p className="text-amber-400/80 text-xs mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-slate-300 text-sm mb-2 leading-relaxed">
              Locking the snapshot permanently freezes these <strong>{lines.length} scope lines</strong> as the contract baseline. A cryptographic hash will be recorded.
            </p>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              After locking, no lines can be added or removed. All future claims will reconcile against this baseline.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setLockConfirm(false)} className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={handleLockSnapshot}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white rounded-xl text-sm font-bold"
              >
                {saving ? 'Locking...' : 'Lock Snapshot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LineFormModal({ form, onChange, onSave, onClose, saving, isEdit }: {
  form: Record<string, any>;
  onChange: (k: string, v: any) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  isEdit: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="text-white font-bold">{isEdit ? 'Edit Scope Line' : 'Add Scope Line'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Section</label>
              <input value={form.section} onChange={e => onChange('section', e.target.value)} className={inputCls} placeholder="e.g. Level 1, Mechanical" />
            </div>
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">System / Category</label>
              <input value={form.system_category} onChange={e => onChange('system_category', e.target.value)} className={inputCls} placeholder="e.g. Sprinkler, Firestopping" />
            </div>
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5">Description *</label>
            <textarea value={form.description} onChange={e => onChange('description', e.target.value)} rows={2} className={inputCls + ' resize-none'} placeholder="Line item description from approved quote" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Qty</label>
              <input type="number" min="0" step="0.01" value={form.qty_contract} onChange={e => onChange('qty_contract', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Unit</label>
              <input value={form.unit} onChange={e => onChange('unit', e.target.value)} className={inputCls} placeholder="item, m, m2, hr..." />
            </div>
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Unit Rate ($)</label>
              <input type="number" min="0" step="0.01" value={form.unit_rate} onChange={e => onChange('unit_rate', e.target.value)} className={inputCls} />
            </div>
          </div>
          {form.qty_contract && form.unit_rate && (
            <div className="px-3 py-2 bg-slate-700/50 rounded-xl text-sm">
              <span className="text-slate-400">Line Total: </span>
              <span className="text-white font-semibold">
                ${(parseFloat(form.qty_contract || '0') * parseFloat(form.unit_rate || '0')).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">Claim Method</label>
              <select value={form.claim_method} onChange={e => onChange('claim_method', e.target.value)} className={inputCls}>
                <option value="percentage">% Complete</option>
                <option value="quantity">Quantity Installed</option>
                <option value="milestone">Milestone</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.evidence_required}
                  onChange={e => onChange('evidence_required', e.target.checked)}
                  className="w-4 h-4 rounded accent-sky-500"
                />
                <span className="text-slate-300 text-sm">Evidence required</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-slate-400 text-xs font-medium mb-1.5">Notes</label>
            <input value={form.notes} onChange={e => onChange('notes', e.target.value)} className={inputCls} placeholder="Optional notes..." />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium">Cancel</button>
          <button
            onClick={onSave}
            disabled={saving || !form.description.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold"
          >
            {saving ? 'Saving...' : isEdit ? <><Save size={14} /> Update</> : <><Plus size={14} /> Add Line</>}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors';
