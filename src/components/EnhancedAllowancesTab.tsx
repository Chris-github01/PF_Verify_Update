import { useState, useEffect } from 'react';
import { Plus, Save, X, Edit2, Trash2, CheckCircle, DollarSign, AlertCircle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import PSSpendModal from './PSSpendModal';

interface Allowance {
  id: string;
  description: string;
  quantity: string;
  unit: string;
  rate: number | null;
  total: number;
  notes: string | null;
  category: string;
  is_provisional: boolean;
  sort_order: number;
  ps_type?: string | null;
  ps_reason?: string | null;
  ps_trigger?: string | null;
  ps_approval_role?: string | null;
  ps_evidence_required?: string | null;
  ps_spend_method?: string | null;
  ps_cap?: number | null;
  ps_rate_basis?: string | null;
  ps_spend_to_date?: number;
  ps_conversion_rule?: string | null;
  ps_status?: string | null;
  ps_standardised?: boolean;
  ps_notes_internal?: string | null;
}

const PS_TYPES = [
  { value: 'penetrations', label: 'Penetrations' },
  { value: 'remedial', label: 'Remedial Works' },
  { value: 'access', label: 'Access' },
  { value: 'doors', label: 'Doors' },
  { value: 'qa', label: 'QA / Testing' },
  { value: 'design', label: 'Design' },
  { value: 'other', label: 'Other' }
];

const APPROVAL_ROLES = ['QS', 'PM', 'CM', 'Client'];
const SPEND_METHODS = [
  { value: 'lump_sum', label: 'Lump Sum' },
  { value: 'rate_and_cap', label: 'Rate + Cap' },
  { value: 'schedule_of_rates', label: 'Schedule of Rates' }
];
const CONVERSION_RULES = [
  { value: 'variation', label: 'Convert to Variation' },
  { value: 'progress_claim', label: 'Convert to Progress Claim' },
  { value: 'manual', label: 'Manual Tracking Only' }
];

export default function EnhancedAllowancesTab({ projectId }: { projectId: string }) {
  const [allowances, setAllowances] = useState<Allowance[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Allowance>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newForm, setNewForm] = useState<Partial<Allowance>>({
    description: '',
    quantity: '1',
    unit: 'Lump sum',
    rate: null,
    total: 0,
    category: 'general',
    is_provisional: false,
    ps_spend_to_date: 0
  });
  const [expandedPSIds, setExpandedPSIds] = useState<Set<string>>(new Set());
  const [psSpendModal, setPsSpendModal] = useState<Allowance | null>(null);

  useEffect(() => {
    loadAllowances();
  }, [projectId]);

  const loadAllowances = async () => {
    try {
      const { data, error } = await supabase
        .from('contract_allowances')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order');

      if (error) throw error;
      setAllowances(data || []);
    } catch (error) {
      console.error('Error loading allowances:', error);
    } finally {
      setLoading(false);
    }
  };

  const validatePSFields = (form: Partial<Allowance>): string | null => {
    if (!form.is_provisional) return null;

    if (!form.ps_type) return 'PS Type is required for Provisional Sums';
    if (!form.ps_reason) return 'Reason is required for Provisional Sums';
    if (!form.ps_trigger) return 'Trigger is required for Provisional Sums';
    if (!form.ps_approval_role) return 'Approval Role is required for Provisional Sums';
    if (!form.ps_evidence_required) return 'Evidence Required is required for Provisional Sums';
    if (!form.ps_spend_method) return 'Spend Method is required for Provisional Sums';
    if (!form.ps_conversion_rule) return 'Conversion Rule is required for Provisional Sums';

    if (form.ps_spend_method === 'rate_and_cap') {
      if (!form.ps_rate_basis) return 'Rate Basis is required for Rate + Cap method';
      if (!form.ps_cap || form.ps_cap <= 0) return 'Cap is required for Rate + Cap method';
    }

    if (form.ps_spend_method === 'schedule_of_rates') {
      if (!form.ps_rate_basis) return 'Rate Basis (schedule reference) is required';
      if (!form.ps_cap || form.ps_cap <= 0) return 'Cap is required for Schedule of Rates method';
    }

    return null;
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    const validationError = validatePSFields(editForm);
    if (validationError) {
      alert(validationError);
      return;
    }

    try {
      const { error } = await supabase
        .from('contract_allowances')
        .update(editForm)
        .eq('id', editingId);

      if (error) throw error;

      await loadAllowances();
      setEditingId(null);
      setEditForm({});
    } catch (error) {
      console.error('Error updating allowance:', error);
      alert('Failed to update allowance');
    }
  };

  const handleAdd = async () => {
    const validationError = validatePSFields(newForm);
    if (validationError) {
      alert(validationError);
      return;
    }

    try {
      const maxSort = Math.max(...allowances.map(a => a.sort_order), 0);

      const { error } = await supabase
        .from('contract_allowances')
        .insert({
          project_id: projectId,
          ...newForm,
          sort_order: maxSort + 1
        });

      if (error) throw error;

      await loadAllowances();
      setIsAdding(false);
      setNewForm({
        description: '',
        quantity: '1',
        unit: 'Lump sum',
        rate: null,
        total: 0,
        category: 'general',
        is_provisional: false,
        ps_spend_to_date: 0
      });
    } catch (error) {
      console.error('Error adding allowance:', error);
      alert('Failed to add allowance');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this allowance?')) return;

    try {
      const { error } = await supabase
        .from('contract_allowances')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadAllowances();
    } catch (error) {
      console.error('Error deleting allowance:', error);
      alert('Failed to delete allowance');
    }
  };

  const togglePSExpand = (id: string) => {
    const newExpanded = new Set(expandedPSIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedPSIds(newExpanded);
  };

  const isPSLikeDescription = (description: string): boolean => {
    const keywords = ['provisional', 'contingency', 'daywork', 'ps', 'allowance'];
    const lower = description.toLowerCase();
    return keywords.some(keyword => lower.includes(keyword));
  };

  const renderPSFields = (form: Partial<Allowance>, setForm: (f: Partial<Allowance>) => void, isNew: boolean) => {
    if (!form.is_provisional) return null;

    return (
      <tr className="bg-slate-900/50">
        <td colSpan={5} className="px-4 py-4">
          <div className="space-y-4 border-l-2 border-orange-500 pl-4">
            <div className="text-sm font-medium text-orange-400 mb-3">Provisional Sum (PS) Controls</div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">PS Type <span className="text-red-400">*</span></label>
                <select
                  value={form.ps_type || ''}
                  onChange={(e) => setForm({ ...form, ps_type: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                >
                  <option value="">Select type...</option>
                  {PS_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Approval Role <span className="text-red-400">*</span></label>
                <select
                  value={form.ps_approval_role || ''}
                  onChange={(e) => setForm({ ...form, ps_approval_role: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                >
                  <option value="">Select role...</option>
                  {APPROVAL_ROLES.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Reason <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.ps_reason || ''}
                  onChange={(e) => setForm({ ...form, ps_reason: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                  placeholder="Why is this a provisional sum?"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Trigger <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.ps_trigger || ''}
                  onChange={(e) => setForm({ ...form, ps_trigger: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                  placeholder="What triggers this PS?"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Evidence Required <span className="text-red-400">*</span></label>
                <textarea
                  value={form.ps_evidence_required || ''}
                  onChange={(e) => setForm({ ...form, ps_evidence_required: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white min-h-[60px]"
                  placeholder="e.g., Photos + marked-up drawings + FRR + location"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Spend Method <span className="text-red-400">*</span></label>
                <select
                  value={form.ps_spend_method || ''}
                  onChange={(e) => setForm({ ...form, ps_spend_method: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                >
                  <option value="">Select method...</option>
                  {SPEND_METHODS.map(method => (
                    <option key={method.value} value={method.value}>{method.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Conversion Rule <span className="text-red-400">*</span></label>
                <select
                  value={form.ps_conversion_rule || ''}
                  onChange={(e) => setForm({ ...form, ps_conversion_rule: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                >
                  <option value="">Select rule...</option>
                  {CONVERSION_RULES.map(rule => (
                    <option key={rule.value} value={rule.value}>{rule.label}</option>
                  ))}
                </select>
              </div>

              {(form.ps_spend_method === 'rate_and_cap' || form.ps_spend_method === 'schedule_of_rates') && (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Rate Basis <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={form.ps_rate_basis || ''}
                      onChange={(e) => setForm({ ...form, ps_rate_basis: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                      placeholder="e.g., per penetration, per hour"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Cap (Max Spend) <span className="text-red-400">*</span></label>
                    <input
                      type="number"
                      value={form.ps_cap || ''}
                      onChange={(e) => setForm({ ...form, ps_cap: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                </>
              )}

              {form.ps_spend_method === 'lump_sum' && (
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Cap (Optional - Max if different from Total)</label>
                  <input
                    type="number"
                    value={form.ps_cap || ''}
                    onChange={(e) => setForm({ ...form, ps_cap: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                    placeholder="Leave empty to use Total as cap"
                    step="0.01"
                  />
                </div>
              )}

              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Internal Notes</label>
                <textarea
                  value={form.ps_notes_internal || ''}
                  onChange={(e) => setForm({ ...form, ps_notes_internal: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white min-h-[60px]"
                  placeholder="Internal commercial notes..."
                />
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  };

  const renderPSDetails = (allowance: Allowance) => {
    if (!allowance.is_provisional || !expandedPSIds.has(allowance.id)) return null;

    const spendToDate = allowance.ps_spend_to_date || 0;
    const cap = allowance.ps_cap || allowance.total;
    const remaining = cap - spendToDate;

    return (
      <tr className="bg-slate-900/30">
        <td colSpan={5} className="px-4 py-4">
          <div className="border-l-2 border-orange-500 pl-4 space-y-3">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-xs text-slate-500">Approved Spend</div>
                <div className="text-lg font-semibold text-white">
                  ${spendToDate.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Cap</div>
                <div className="text-lg font-semibold text-white">
                  ${cap.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Remaining</div>
                <div className={`text-lg font-semibold ${remaining < 0 ? 'text-red-400' : 'text-green-400'}`}>
                  ${remaining.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-slate-500">Type:</span> <span className="text-white ml-2">{PS_TYPES.find(t => t.value === allowance.ps_type)?.label || allowance.ps_type}</span></div>
              <div><span className="text-slate-500">Approval Role:</span> <span className="text-white ml-2">{allowance.ps_approval_role}</span></div>
              <div><span className="text-slate-500">Spend Method:</span> <span className="text-white ml-2">{SPEND_METHODS.find(m => m.value === allowance.ps_spend_method)?.label || allowance.ps_spend_method}</span></div>
              <div><span className="text-slate-500">Conversion:</span> <span className="text-white ml-2">{CONVERSION_RULES.find(r => r.value === allowance.ps_conversion_rule)?.label || allowance.ps_conversion_rule}</span></div>
              {allowance.ps_rate_basis && (
                <div className="col-span-2"><span className="text-slate-500">Rate Basis:</span> <span className="text-white ml-2">{allowance.ps_rate_basis}</span></div>
              )}
              <div className="col-span-2"><span className="text-slate-500">Reason:</span> <span className="text-white ml-2">{allowance.ps_reason}</span></div>
              <div className="col-span-2"><span className="text-slate-500">Trigger:</span> <span className="text-white ml-2">{allowance.ps_trigger}</span></div>
              <div className="col-span-2"><span className="text-slate-500">Evidence Required:</span> <span className="text-white ml-2">{allowance.ps_evidence_required}</span></div>
              {allowance.ps_notes_internal && (
                <div className="col-span-2"><span className="text-slate-500">Internal Notes:</span> <span className="text-white ml-2">{allowance.ps_notes_internal}</span></div>
              )}
            </div>

            <button
              onClick={() => setPsSpendModal(allowance)}
              className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 transition-colors"
            >
              <DollarSign size={14} />
              Record PS Spend
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const totalAllowances = allowances.reduce((sum, a) => sum + (a.total || 0), 0);

  if (loading) {
    return <div className="text-slate-400">Loading allowances...</div>;
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Allowances & Provisional Sums</h3>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-md hover:from-blue-700 hover:to-blue-800 transition-all text-sm font-medium"
          >
            <Plus size={16} />
            Add Allowance
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Qty / Basis</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Rate</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Total</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {isAdding && (
                <>
                  <tr className="bg-slate-800/50">
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={newForm.description}
                        onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                        placeholder="Description"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                      />
                      {isPSLikeDescription(newForm.description || '') && !newForm.is_provisional && (
                        <div className="mt-1 text-xs text-orange-400 flex items-center gap-1">
                          <Info size={12} />
                          This looks like a Provisional Sum item — tick Provisional (PS) if applicable.
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newForm.quantity}
                          onChange={(e) => setNewForm({ ...newForm, quantity: e.target.value })}
                          placeholder="Qty"
                          className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                        />
                        <input
                          type="text"
                          value={newForm.unit}
                          onChange={(e) => setNewForm({ ...newForm, unit: e.target.value })}
                          placeholder="Unit"
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={newForm.rate || ''}
                        onChange={(e) => setNewForm({ ...newForm, rate: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="Rate"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white text-right"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={newForm.total || 0}
                        onChange={(e) => setNewForm({ ...newForm, total: parseFloat(e.target.value) || 0 })}
                        placeholder="Total"
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white text-right"
                      />
                      <div className="mt-1">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newForm.is_provisional || false}
                            onChange={(e) => setNewForm({ ...newForm, is_provisional: e.target.checked })}
                            className="rounded border-slate-700 bg-slate-900"
                          />
                          Provisional (PS)
                        </label>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={handleAdd}
                          className="p-1 text-green-400 hover:text-green-300 transition-colors"
                          title="Save"
                        >
                          <Save size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setIsAdding(false);
                            setNewForm({
                              description: '',
                              quantity: '1',
                              unit: 'Lump sum',
                              rate: null,
                              total: 0,
                              category: 'general',
                              is_provisional: false,
                              ps_spend_to_date: 0
                            });
                          }}
                          className="p-1 text-slate-400 hover:text-slate-300 transition-colors"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {renderPSFields(newForm, setNewForm, true)}
                </>
              )}

              {allowances.map((allowance) => (
                <>
                  <tr key={allowance.id} className="hover:bg-slate-900/30 transition-colors">
                    {editingId === allowance.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                          />
                          {isPSLikeDescription(editForm.description || '') && !editForm.is_provisional && (
                            <div className="mt-1 text-xs text-orange-400 flex items-center gap-1">
                              <Info size={12} />
                              This looks like a Provisional Sum item — tick Provisional (PS) if applicable.
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editForm.quantity}
                              onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                              className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                            />
                            <input
                              type="text"
                              value={editForm.unit}
                              onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={editForm.rate || ''}
                            onChange={(e) => setEditForm({ ...editForm, rate: e.target.value ? parseFloat(e.target.value) : null })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white text-right"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={editForm.total}
                            onChange={(e) => setEditForm({ ...editForm, total: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white text-right"
                          />
                          <div className="mt-1">
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editForm.is_provisional || false}
                                onChange={(e) => setEditForm({ ...editForm, is_provisional: e.target.checked })}
                                className="rounded border-slate-700 bg-slate-900"
                              />
                              Provisional (PS)
                            </label>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={handleSaveEdit}
                              className="p-1 text-green-400 hover:text-green-300 transition-colors"
                              title="Save"
                            >
                              <Save size={16} />
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setEditForm({});
                              }}
                              className="p-1 text-slate-400 hover:text-slate-300 transition-colors"
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm text-white">
                          <div className="flex items-center gap-2">
                            {allowance.is_provisional && (
                              <button
                                onClick={() => togglePSExpand(allowance.id)}
                                className="text-orange-400 hover:text-orange-300 transition-colors"
                              >
                                <Info size={16} />
                              </button>
                            )}
                            {allowance.description}
                            {allowance.is_provisional && (
                              <span className="ml-2 px-2 py-0.5 bg-orange-900/30 text-orange-400 text-xs rounded border border-orange-700">
                                Provisional {allowance.ps_type && `(${PS_TYPES.find(t => t.value === allowance.ps_type)?.label || allowance.ps_type})`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {allowance.quantity} {allowance.unit}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">
                          {allowance.rate ? `$${allowance.rate.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-white text-right">
                          ${allowance.total.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setEditingId(allowance.id);
                                setEditForm(allowance);
                              }}
                              className="p-1 text-blue-400 hover:text-blue-300 transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(allowance.id)}
                              className="p-1 text-red-400 hover:text-red-300 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                  {editingId === allowance.id && renderPSFields(editForm, setEditForm, false)}
                  {editingId !== allowance.id && renderPSDetails(allowance)}
                </>
              ))}

              {allowances.length === 0 && !isAdding && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No allowances added yet. Click "Add Allowance" to create one.
                  </td>
                </tr>
              )}

              {allowances.length > 0 && (
                <tr className="bg-slate-900/70 border-t-2 border-blue-500">
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-white">Total Allowances</td>
                  <td className="px-4 py-3 text-base font-bold text-blue-400 text-right">
                    ${totalAllowances.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4 text-sm text-green-300">
          <CheckCircle size={16} className="inline mr-2" />
          Allowances with full PS control are now live! Add, configure PS fields, and track spend against provisional sums.
        </div>
      </div>

      {psSpendModal && (
        <PSSpendModal
          allowance={psSpendModal}
          projectId={projectId}
          onClose={() => setPsSpendModal(null)}
          onSuccess={loadAllowances}
        />
      )}
    </>
  );
}
