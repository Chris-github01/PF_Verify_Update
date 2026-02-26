import { useState, useEffect } from 'react';
import {
  FileText, Plus, ChevronRight, TrendingUp, DollarSign,
  Shield, Clock, AlertTriangle, CheckCircle, Lock, Unlock,
  Building2, Hash, Calendar, BarChart3, ArrowRight,
  Edit3, Trash2, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import type { SCCContract, SCCContractSummary } from '../../types/scc.types';

interface SCCDashboardProps {
  projectId: string | null;
  onNavigateToContract: (contractId: string) => void;
  onNavigateToNewClaim: (contractId: string) => void;
  onNavigateToVariations: (contractId: string) => void;
}

interface ContractWithSummary extends SCCContract {
  summary?: SCCContractSummary;
}

const nzd = (v: number) =>
  '$' + v.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const statusConfig = {
  setup: { label: 'Setup', color: 'text-slate-400 bg-slate-700/60', dot: 'bg-slate-400' },
  active: { label: 'Active', color: 'text-emerald-400 bg-emerald-900/30', dot: 'bg-emerald-400' },
  complete: { label: 'Complete', color: 'text-sky-400 bg-sky-900/30', dot: 'bg-sky-400' },
  disputed: { label: 'Disputed', color: 'text-red-400 bg-red-900/30', dot: 'bg-red-400' },
};

export default function SCCDashboard({
  projectId,
  onNavigateToContract,
  onNavigateToNewClaim,
  onNavigateToVariations,
}: SCCDashboardProps) {
  const { currentOrganisation } = useOrganisation();
  const [contracts, setContracts] = useState<ContractWithSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewContractModal, setShowNewContractModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SCCContract | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [form, setForm] = useState({
    contract_number: '',
    contract_name: '',
    subcontractor_name: '',
    subcontractor_company: '',
    subcontractor_email: '',
    subcontractor_phone: '',
    contract_value: '',
    retention_percentage: '5',
    retention_release_method: 'practical_completion' as SCCContract['retention_release_method'],
    payment_terms_days: '20',
    claim_cutoff_day: '20',
    contract_start_date: '',
    contract_end_date: '',
    notes: '',
  });

  useEffect(() => {
    if (currentOrganisation) loadContracts();
  }, [projectId, currentOrganisation]);

  const loadContracts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('scc_contracts')
        .select('*')
        .eq('organisation_id', currentOrganisation!.id)
        .order('created_at', { ascending: false });

      if (projectId) query = query.eq('project_id', projectId);

      const { data, error } = await query;
      if (error) throw error;

      const enriched: ContractWithSummary[] = await Promise.all(
        (data || []).map(async (c) => {
          const summary = await loadContractSummary(c.id, c.contract_value, c.retention_percentage);
          return { ...c, summary };
        })
      );

      setContracts(enriched);
    } catch (err) {
      console.error('[SCCDashboard] loadContracts error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadContractSummary = async (
    contractId: string,
    contractValue: number,
    retentionPct: number
  ): Promise<SCCContractSummary> => {
    const { data: claims } = await supabase
      .from('scc_claim_periods')
      .select('total_claimed_this_period, approved_amount, retention_held_cumulative, net_payable_this_period, status')
      .eq('contract_id', contractId);

    const { data: variations } = await supabase
      .from('scc_variations')
      .select('type, status, approved_amount, claimed_amount')
      .eq('contract_id', contractId);

    const claimList = claims || [];
    const varList = variations || [];

    const claimed_to_date = claimList.reduce((s, c) => s + (c.total_claimed_this_period || 0), 0);
    const approved_to_date = claimList.reduce((s, c) => s + (c.approved_amount || 0), 0);
    const retention_held = claimList.length > 0
      ? Math.max(...claimList.map(c => c.retention_held_cumulative || 0))
      : 0;
    const net_paid = claimList.reduce((s, c) =>
      c.status === 'approved' ? s + (c.net_payable_this_period || 0) : s, 0);

    const variations_approved = varList.filter(v => v.status === 'approved' || v.status === 'claimed' || v.status === 'paid').length;
    const variations_pending = varList.filter(v => v.status === 'draft' || v.status === 'submitted').length;

    const percent_complete = contractValue > 0
      ? Math.min(100, Math.round((claimed_to_date / contractValue) * 100))
      : 0;

    return {
      contract_value: contractValue,
      claimed_to_date,
      approved_to_date,
      retention_held,
      net_paid,
      variations_approved,
      variations_pending,
      percent_complete,
      remaining_value: Math.max(0, contractValue - claimed_to_date),
      claim_count: claimList.length,
    };
  };

  const handleCreateContract = async () => {
    if (!form.contract_name.trim() || !form.subcontractor_name.trim()) {
      setFormError('Contract name and subcontractor name are required.');
      return;
    }
    if (!currentOrganisation) return;

    setSaving(true);
    setFormError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('scc_contracts').insert({
        organisation_id: currentOrganisation.id,
        project_id: projectId || null,
        contract_number: form.contract_number.trim(),
        contract_name: form.contract_name.trim(),
        subcontractor_name: form.subcontractor_name.trim(),
        subcontractor_company: form.subcontractor_company.trim(),
        subcontractor_email: form.subcontractor_email.trim(),
        subcontractor_phone: form.subcontractor_phone.trim(),
        contract_value: parseFloat(form.contract_value) || 0,
        retention_percentage: parseFloat(form.retention_percentage) || 5,
        retention_release_method: form.retention_release_method,
        payment_terms_days: parseInt(form.payment_terms_days) || 20,
        claim_cutoff_day: parseInt(form.claim_cutoff_day) || 20,
        contract_start_date: form.contract_start_date || null,
        contract_end_date: form.contract_end_date || null,
        notes: form.notes.trim(),
        created_by: user?.id || null,
        status: 'setup',
      });

      if (error) throw error;

      setShowNewContractModal(false);
      resetForm();
      await loadContracts();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create contract.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContract = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await supabase.from('scc_contracts').delete().eq('id', deleteTarget.id);
      setDeleteTarget(null);
      await loadContracts();
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      contract_number: '',
      contract_name: '',
      subcontractor_name: '',
      subcontractor_company: '',
      subcontractor_email: '',
      subcontractor_phone: '',
      contract_value: '',
      retention_percentage: '5',
      retention_release_method: 'practical_completion',
      payment_terms_days: '20',
      claim_cutoff_day: '20',
      contract_start_date: '',
      contract_end_date: '',
      notes: '',
    });
    setFormError('');
  };

  const totalContractValue = contracts.reduce((s, c) => s + (c.contract_value || 0), 0);
  const totalClaimedToDate = contracts.reduce((s, c) => s + (c.summary?.claimed_to_date || 0), 0);
  const totalRetentionHeld = contracts.reduce((s, c) => s + (c.summary?.retention_held || 0), 0);
  const activeContracts = contracts.filter(c => c.status === 'active').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500 mx-auto" />
          <p className="mt-4 text-slate-400 text-sm">Loading SCC contracts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/60">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-600 to-blue-700 flex items-center justify-center shadow-lg">
                <Shield size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Subcontract Commercial Control
                </h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  Award-to-pay subcontract ledger — claims, variations, and reconciliation
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowNewContractModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold text-sm transition-all shadow-lg"
            >
              <Plus size={16} />
              New Contract
            </button>
          </div>

          {/* Summary stats */}
          {contracts.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <StatCard label="Total Contract Value" value={nzd(totalContractValue)} icon={DollarSign} color="sky" />
              <StatCard label="Claimed to Date" value={nzd(totalClaimedToDate)} icon={TrendingUp} color="emerald" />
              <StatCard label="Retention Held" value={nzd(totalRetentionHeld)} icon={Lock} color="amber" />
              <StatCard label="Active Contracts" value={String(activeContracts)} icon={Building2} color="blue" />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {contracts.length === 0 ? (
          <EmptyState onNew={() => setShowNewContractModal(true)} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-200">
                {contracts.length} Contract{contracts.length !== 1 ? 's' : ''}
              </h2>
            </div>
            {contracts.map((contract) => (
              <ContractCard
                key={contract.id}
                contract={contract}
                onOpen={() => onNavigateToContract(contract.id)}
                onNewClaim={() => onNavigateToNewClaim(contract.id)}
                onVariations={() => onNavigateToVariations(contract.id)}
                onDelete={() => setDeleteTarget(contract)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Contract Modal */}
      {showNewContractModal && (
        <NewContractModal
          form={form}
          onChange={(k, v) => setForm(prev => ({ ...prev, [k]: v }))}
          onSave={handleCreateContract}
          onClose={() => { setShowNewContractModal(false); resetForm(); }}
          saving={saving}
          error={formError}
        />
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-2">Delete Contract?</h3>
            <p className="text-slate-400 text-sm mb-6">
              This will permanently delete <span className="text-white font-medium">{deleteTarget.contract_name}</span> and all associated scope lines, claims, and variations. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteContract}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: any; color: string;
}) {
  const colors: Record<string, string> = {
    sky: 'text-sky-400 bg-sky-900/30',
    emerald: 'text-emerald-400 bg-emerald-900/30',
    amber: 'text-amber-400 bg-amber-900/30',
    blue: 'text-blue-400 bg-blue-900/30',
  };
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon size={16} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-slate-400 text-xs mt-1">{label}</p>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-sky-900/30 flex items-center justify-center mb-5">
        <Shield size={28} className="text-sky-400" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2">No subcontracts yet</h3>
      <p className="text-slate-400 text-sm max-w-md mb-8 leading-relaxed">
        Create a contract record to start managing progress claims, variations, and payment reconciliation for a subcontractor.
      </p>
      <button
        onClick={onNew}
        className="flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold transition-all"
      >
        <Plus size={16} />
        New Contract
      </button>
    </div>
  );
}

function ContractCard({ contract, onOpen, onNewClaim, onVariations, onDelete }: {
  contract: ContractWithSummary;
  onOpen: () => void;
  onNewClaim: () => void;
  onVariations: () => void;
  onDelete: () => void;
}) {
  const s = contract.summary;
  const cfg = statusConfig[contract.status] || statusConfig.setup;
  const pct = s?.percent_complete ?? 0;

  return (
    <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl overflow-hidden hover:border-sky-700/50 transition-all group">
      {/* Top row */}
      <div className="flex items-start justify-between p-5 pb-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-slate-700/80 flex items-center justify-center flex-shrink-0">
            <Building2 size={18} className="text-sky-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-semibold text-base leading-tight">{contract.contract_name}</h3>
              {contract.contract_number && (
                <span className="text-slate-500 text-xs font-mono">{contract.contract_number}</span>
              )}
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
              {contract.snapshot_locked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-emerald-400 bg-emerald-900/30">
                  <Lock size={10} />
                  Snapshot Locked
                </span>
              )}
            </div>
            <p className="text-slate-400 text-sm mt-0.5">{contract.subcontractor_name}
              {contract.subcontractor_company ? ` — ${contract.subcontractor_company}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onDelete}
            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={onOpen}
            className="p-2 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Edit3 size={15} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
          <span>Claimed to date</span>
          <span className="font-semibold text-white">{pct}%</span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      {/* Financial row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-t border-slate-700/50">
        <FinancialCell label="Contract Value" value={nzd(contract.contract_value)} />
        <FinancialCell label="Claimed to Date" value={nzd(s?.claimed_to_date || 0)} />
        <FinancialCell label="Retention Held" value={nzd(s?.retention_held || 0)} accent="amber" />
        <FinancialCell label="Remaining" value={nzd(s?.remaining_value || 0)} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-5 py-3 bg-slate-900/40 border-t border-slate-700/50">
        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 px-4 py-2 bg-sky-600/80 hover:bg-sky-600 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          <FileText size={13} />
          Scope Ledger
          <ChevronRight size={12} />
        </button>
        <button
          onClick={onNewClaim}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700/60 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          <Hash size={13} />
          {s && s.claim_count > 0 ? `Claim #${s.claim_count + 1}` : 'First Claim'}
        </button>
        <button
          onClick={onVariations}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-700/60 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
        >
          <BarChart3 size={13} />
          Variations
          {(s?.variations_pending ?? 0) > 0 && (
            <span className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
              {s!.variations_pending}
            </span>
          )}
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          {contract.payment_terms_days && (
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {contract.payment_terms_days}d terms
            </span>
          )}
          {contract.retention_percentage > 0 && (
            <span className="flex items-center gap-1">
              <Lock size={11} />
              {contract.retention_percentage}% retention
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FinancialCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="px-5 py-3">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <p className={`text-sm font-bold ${accent === 'amber' ? 'text-amber-400' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function NewContractModal({ form, onChange, onSave, onClose, saving, error }: {
  form: Record<string, string>;
  onChange: (k: string, v: string) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-2xl shadow-2xl my-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-white">New Subcontract</h2>
            <p className="text-slate-400 text-sm mt-0.5">Set up a new contract record for a subcontractor</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-xl text-red-300 text-sm">
              <AlertTriangle size={15} />
              {error}
            </div>
          )}

          <Section title="Contract Details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contract Number" placeholder="e.g. SC-2026-001">
                <input value={form.contract_number} onChange={e => onChange('contract_number', e.target.value)} className={inputCls} placeholder="e.g. SC-2026-001" />
              </Field>
              <Field label="Contract Name *" placeholder="">
                <input value={form.contract_name} onChange={e => onChange('contract_name', e.target.value)} className={inputCls} placeholder="e.g. Passive Fire Protection — Level 3" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contract Start Date">
                <input type="date" value={form.contract_start_date} onChange={e => onChange('contract_start_date', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Contract End Date">
                <input type="date" value={form.contract_end_date} onChange={e => onChange('contract_end_date', e.target.value)} className={inputCls} />
              </Field>
            </div>
          </Section>

          <Section title="Subcontractor">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contact Name *">
                <input value={form.subcontractor_name} onChange={e => onChange('subcontractor_name', e.target.value)} className={inputCls} placeholder="e.g. James Tait" />
              </Field>
              <Field label="Company">
                <input value={form.subcontractor_company} onChange={e => onChange('subcontractor_company', e.target.value)} className={inputCls} placeholder="e.g. Proshield Ltd" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email">
                <input type="email" value={form.subcontractor_email} onChange={e => onChange('subcontractor_email', e.target.value)} className={inputCls} placeholder="james@proshield.co.nz" />
              </Field>
              <Field label="Phone">
                <input value={form.subcontractor_phone} onChange={e => onChange('subcontractor_phone', e.target.value)} className={inputCls} placeholder="021 000 0000" />
              </Field>
            </div>
          </Section>

          <Section title="Commercial Terms">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contract Value ($)">
                <input type="number" min="0" step="1000" value={form.contract_value} onChange={e => onChange('contract_value', e.target.value)} className={inputCls} placeholder="0.00" />
              </Field>
              <Field label="Retention (%)">
                <input type="number" min="0" max="20" step="0.5" value={form.retention_percentage} onChange={e => onChange('retention_percentage', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Retention Release">
                <select value={form.retention_release_method} onChange={e => onChange('retention_release_method', e.target.value)} className={inputCls}>
                  <option value="practical_completion">Practical Completion</option>
                  <option value="on_demand">On Demand</option>
                  <option value="staged">Staged</option>
                </select>
              </Field>
              <Field label="Payment Terms (days)">
                <input type="number" min="1" max="90" value={form.payment_terms_days} onChange={e => onChange('payment_terms_days', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Claim Cutoff (day of month)">
                <input type="number" min="1" max="31" value={form.claim_cutoff_day} onChange={e => onChange('claim_cutoff_day', e.target.value)} className={inputCls} />
              </Field>
            </div>
          </Section>

          <Section title="Notes">
            <textarea
              value={form.notes}
              onChange={e => onChange('notes', e.target.value)}
              rows={3}
              className={inputCls + ' resize-none'}
              placeholder="Any additional contract notes..."
            />
          </Section>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-700">
          <button onClick={onClose} className="px-5 py-2.5 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {saving ? 'Creating...' : (
              <>
                <CheckCircle size={15} />
                Create Contract
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-slate-400 text-xs font-medium mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors';
