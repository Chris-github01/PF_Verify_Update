import { useState, useEffect } from 'react';
import {
  Lock, Plus, ChevronRight, RefreshCw, CheckCircle, AlertCircle,
  Briefcase, DollarSign, Calendar, Users, Percent, Settings2,
  ArrowRight, Building2, Hash, FileText, Sparkles
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import { useTrade } from '../../lib/tradeContext';

interface SCCContract {
  id: string;
  contract_number: string;
  contract_name: string;
  subcontractor_name: string;
  subcontractor_company: string;
  contract_value: number;
  status: string;
  snapshot_locked: boolean;
  retention_percentage: number;
  retention_limit_pct: number;
  payment_terms_days: number;
  payment_claim_prefix: string;
  next_claim_number: number;
  defects_liability_months: number;
  contract_start_date: string | null;
  contract_end_date: string | null;
  practical_completion_date: string | null;
  quote_import_id: string | null;
  created_at: string;
}

interface ScopeLine {
  id: string;
  line_number: string;
  description: string;
  line_total: number;
  qty_contract: number;
  claim_method: string;
  unit: string | null;
  original_qty: number | null;
  unit_rate: number;
  qty_claimed_to_date: number;
  pct_claimed_to_date: number;
  amount_claimed_to_date: number;
  last_claim_date: string | null;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

const CLAIM_METHODS = [
  { value: 'percentage', label: '% Complete', icon: Percent },
  { value: 'quantity', label: 'Quantity', icon: Hash },
  { value: 'lump_sum', label: 'Lump Sum', icon: DollarSign },
  { value: 'milestone', label: 'Milestone', icon: CheckCircle },
];

const BLANK_CONTRACT = {
  contract_number: '',
  contract_name: '',
  subcontractor_name: '',
  subcontractor_company: '',
  contract_value: 0,
  retention_percentage: 5,
  retention_limit_pct: 5,
  payment_terms_days: 20,
  payment_claim_prefix: 'PC',
  defects_liability_months: 12,
  contract_start_date: '',
  contract_end_date: '',
};

interface SCCContractSetupProps {
  importId?: string | null;
  onImportConsumed?: () => void;
}

export default function SCCContractSetup({ importId, onImportConsumed }: SCCContractSetupProps = {}) {
  const { currentOrganisation } = useOrganisation();
  const { currentTrade } = useTrade();
  const [contracts, setContracts] = useState<SCCContract[]>([]);
  const [scopeLines, setScopeLines] = useState<ScopeLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingScope, setLoadingScope] = useState(false);
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [selected, setSelected] = useState<SCCContract | null>(null);
  const [form, setForm] = useState<typeof BLANK_CONTRACT>(BLANK_CONTRACT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefillImportId, setPrefillImportId] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrganisation?.id) loadContracts();
  }, [currentOrganisation?.id, currentTrade]);

  useEffect(() => {
    if (importId && currentOrganisation?.id) {
      prefillFromImport(importId);
    }
  }, [importId, currentOrganisation?.id]);

  const prefillFromImport = async (id: string) => {
    const { data } = await supabase
      .from('scc_quote_imports')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!data) return;

    setForm({
      contract_number: '',
      contract_name: data.file_name
        ? data.file_name.replace(/\.[^/.]+$/, '')
        : '',
      subcontractor_name: '',
      subcontractor_company: data.main_contractor || '',
      contract_value: data.total_value || 0,
      retention_percentage: 5,
      retention_limit_pct: 5,
      payment_terms_days: 20,
      payment_claim_prefix: 'PC',
      defects_liability_months: 12,
      contract_start_date: '',
      contract_end_date: '',
    });
    setPrefillImportId(id);
    setView('new');
    if (onImportConsumed) onImportConsumed();
  };

  const loadContracts = async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('scc_contracts')
      .select('*')
      .eq('organisation_id', currentOrganisation.id)
      .eq('trade', currentTrade)
      .order('created_at', { ascending: false });
    setContracts(data || []);
    setLoading(false);
  };

  const loadScopeLines = async (contractId: string) => {
    setLoadingScope(true);
    const { data } = await supabase
      .from('scc_scope_lines')
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: true });
    setScopeLines(data || []);
    setLoadingScope(false);
  };

  const openDetail = async (contract: SCCContract) => {
    const { data: fresh } = await supabase
      .from('scc_contracts')
      .select('*')
      .eq('id', contract.id)
      .maybeSingle();
    setSelected(fresh || contract);
    setView('detail');
    await loadScopeLines(contract.id);
  };

  const handleCreate = async () => {
    if (!currentOrganisation?.id) return;
    if (!form.contract_name || !form.contract_value) {
      setError('Contract name and value are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const contractNumber = `SCC-${Date.now().toString().slice(-6)}`;
      const { data, error: err } = await supabase
        .from('scc_contracts')
        .insert({
          organisation_id: currentOrganisation.id,
          contract_number: form.contract_number || contractNumber,
          contract_name: form.contract_name,
          subcontractor_name: form.subcontractor_name,
          subcontractor_company: form.subcontractor_company,
          contract_value: parseFloat(String(form.contract_value)),
          retention_percentage: form.retention_percentage,
          retention_limit_pct: form.retention_limit_pct,
          payment_terms_days: form.payment_terms_days,
          payment_claim_prefix: form.payment_claim_prefix,
          defects_liability_months: form.defects_liability_months,
          contract_start_date: form.contract_start_date || null,
          contract_end_date: form.contract_end_date || null,
          status: 'setup',
          snapshot_locked: false,
          next_claim_number: 1,
          quote_import_id: prefillImportId || null,
          trade: currentTrade,
        })
        .select()
        .single();
      if (err) throw err;

      if (prefillImportId) {
        await supabase
          .from('scc_quote_imports')
          .update({ contract_id: data.id, updated_at: new Date().toISOString() })
          .eq('id', prefillImportId);
        setPrefillImportId(null);
      }

      setContracts(prev => [data, ...prev]);
      setForm(BLANK_CONTRACT);
      setView('list');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create contract');
    } finally {
      setSaving(false);
    }
  };

  const lockContract = async () => {
    if (!selected) return;
    setSaving(true);
    await supabase
      .from('scc_contracts')
      .update({ snapshot_locked: true, status: 'active', updated_at: new Date().toISOString() })
      .eq('id', selected.id);
    setContracts(prev => prev.map(c => c.id === selected.id ? { ...c, snapshot_locked: true, status: 'active' } : c));
    setSelected(prev => prev ? { ...prev, snapshot_locked: true, status: 'active' } : null);
    setSaving(false);
  };

  const addScopeLine = async () => {
    if (!selected || !currentOrganisation?.id) return;
    const { data, error: insertErr } = await supabase
      .from('scc_scope_lines')
      .insert({
        contract_id: selected.id,
        organisation_id: currentOrganisation.id,
        line_number: `L${(scopeLines.length + 1).toString().padStart(2, '0')}`,
        description: 'New scope line — click to edit',
        qty_contract: 1,
        unit_rate: 0,
        claim_method: 'percentage',
        pct_claimed_to_date: 0,
        amount_claimed_to_date: 0,
        qty_claimed_to_date: 0,
      })
      .select()
      .single();
    if (insertErr) { alert(`Failed to add scope line: ${insertErr.message}`); return; }
    if (data) setScopeLines(prev => [...prev, data]);
  };

  const generateFromImport = async () => {
    if (!selected || !currentOrganisation?.id) return;
    if (!selected.quote_import_id) {
      alert('This contract has no linked quote import. Please create the contract from a locked quote import.');
      return;
    }
    setSaving(true);
    try {
      const { data: lineItems, error: fetchErr } = await supabase
        .from('scc_quote_line_items')
        .select('*')
        .eq('import_id', selected.quote_import_id)
        .eq('include_in_baseline', true)
        .eq('is_excluded', false)
        .order('created_at', { ascending: true });

      if (fetchErr) throw fetchErr;

      if (!lineItems || lineItems.length === 0) {
        alert('No baseline line items found in the linked quote import. Make sure the quote is locked and lines are marked as included.');
        setSaving(false);
        return;
      }

      const toInsert = lineItems.map((item, idx) => {
        const hasQtyRate = item.unit_rate && item.quantity;
        const qty = hasQtyRate ? (item.quantity || 1) : 1;
        const rate = hasQtyRate ? (item.unit_rate || 0) : (item.total_amount || 0);
        return {
          contract_id: selected.id,
          organisation_id: currentOrganisation.id,
          line_number: item.line_number || `L${(idx + 1).toString().padStart(2, '0')}`,
          description: item.description,
          qty_contract: qty,
          unit_rate: rate,
          claim_method: hasQtyRate ? 'quantity' : 'percentage',
          unit: item.unit || 'item',
          original_qty: item.quantity || null,
          source_quote_line_id: item.id || null,
          pct_claimed_to_date: 0,
          amount_claimed_to_date: 0,
          qty_claimed_to_date: 0,
        };
      });

      const allInserted: ScopeLine[] = [];
      const BATCH = 50;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const { data: batch, error: insertErr } = await supabase
          .from('scc_scope_lines')
          .insert(toInsert.slice(i, i + BATCH))
          .select();
        if (insertErr) throw insertErr;
        if (batch) allInserted.push(...batch);
      }

      setScopeLines(prev => [...prev, ...allInserted]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e);
      alert(`Failed to generate scope lines: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const updateScopeLine = async (id: string, updates: Partial<ScopeLine>) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { line_total: _generated, ...writable } = updates as ScopeLine & { line_total?: number };
    await supabase.from('scc_scope_lines').update(writable).eq('id', id);
    setScopeLines(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const totalScope = scopeLines.reduce((s, l) => s + (l.line_total || 0), 0);
  const totalClaimed = scopeLines.reduce((s, l) => s + (l.amount_claimed_to_date || 0), 0);
  const totalBalance = totalScope - totalClaimed;

  if (view === 'new') {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => { setView('list'); setError(null); }} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
            <ChevronRight size={16} className="rotate-180" /> Back
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium">New Contract</span>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Contract Details</h3>
            {prefillImportId && (
              <span className="flex items-center gap-1.5 text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-full px-3 py-1">
                <CheckCircle size={12} /> Pre-filled from quote import
              </span>
            )}
          </div>
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-300 text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Contract Name *</label>
              <input
                type="text"
                placeholder="e.g. Passive Fire Protection — Tower A"
                value={form.contract_name}
                onChange={e => setForm(f => ({ ...f, contract_name: e.target.value }))}
                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Contract Number</label>
              <input
                type="text"
                placeholder="Auto-generated if blank"
                value={form.contract_number}
                onChange={e => setForm(f => ({ ...f, contract_number: e.target.value }))}
                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Contract Value (NZD) *</label>
              <input
                type="number"
                placeholder="0.00"
                value={form.contract_value || ''}
                onChange={e => setForm(f => ({ ...f, contract_value: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Main Contractor (your client)</label>
              <input
                type="text"
                placeholder="e.g. Fletcher Construction"
                value={form.subcontractor_company}
                onChange={e => setForm(f => ({ ...f, subcontractor_company: e.target.value }))}
                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Contract Manager</label>
              <input
                type="text"
                placeholder="Name of main contractor's PM"
                value={form.subcontractor_name}
                onChange={e => setForm(f => ({ ...f, subcontractor_name: e.target.value }))}
                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div className="border-t border-slate-700/50 pt-4">
            <h4 className="text-sm font-semibold text-white mb-3">Commercial Terms</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Retention Rate (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.retention_percentage}
                  onChange={e => setForm(f => ({ ...f, retention_percentage: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Retention Cap (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.retention_limit_pct}
                  onChange={e => setForm(f => ({ ...f, retention_limit_pct: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Payment Terms (days)</label>
                <input
                  type="number"
                  value={form.payment_terms_days}
                  onChange={e => setForm(f => ({ ...f, payment_terms_days: parseInt(e.target.value) || 20 }))}
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Claim Prefix</label>
                <input
                  type="text"
                  maxLength={4}
                  value={form.payment_claim_prefix}
                  onChange={e => setForm(f => ({ ...f, payment_claim_prefix: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
                <p className="text-gray-600 text-xs mt-1">First claim will be {form.payment_claim_prefix}1</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Contract Start</label>
                <input
                  type="date"
                  value={form.contract_start_date}
                  onChange={e => setForm(f => ({ ...f, contract_start_date: e.target.value }))}
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Contract End</label>
                <input
                  type="date"
                  value={form.contract_end_date}
                  onChange={e => setForm(f => ({ ...f, contract_end_date: e.target.value }))}
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => { setView('list'); setError(null); setForm(BLANK_CONTRACT); setPrefillImportId(null); }}
              className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
              {saving ? 'Creating...' : 'Create Contract'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && selected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
            <ChevronRight size={16} className="rotate-180" /> Back
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium">{selected.contract_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${selected.snapshot_locked ? 'bg-cyan-500/20 text-cyan-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
            {selected.snapshot_locked ? 'Locked' : 'Setup'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Contract Value',  value: fmt(selected.contract_value),  sub: selected.contract_number, color: 'text-cyan-400' },
            { label: 'Scope Lines',     value: scopeLines.length,              sub: `${totalScope > 0 ? Math.round((totalClaimed/totalScope)*100) : 0}% claimed`, color: 'text-white' },
            { label: 'Claimed to Date', value: fmt(totalClaimed),              sub: 'cumulative', color: 'text-blue-400' },
            { label: 'Balance',         value: fmt(totalBalance),              sub: 'remaining', color: totalBalance < 0 ? 'text-red-400' : 'text-green-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contract Info */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-3 text-sm">
            <h3 className="font-semibold text-white">Contract Info</h3>
            {[
              { label: 'Main Contractor', value: selected.subcontractor_company || '—', icon: Building2 },
              { label: 'Contract Manager', value: selected.subcontractor_name || '—', icon: Users },
              { label: 'Retention Rate', value: `${selected.retention_percentage}% (cap ${selected.retention_limit_pct}%)`, icon: Percent },
              { label: 'Payment Terms', value: `${selected.payment_terms_days} days`, icon: Calendar },
              { label: 'Claim Prefix', value: selected.payment_claim_prefix, icon: Hash },
              { label: 'DLP', value: `${selected.defects_liability_months} months`, icon: Settings2 },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3">
                <item.icon size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-gray-500 text-xs">{item.label}</p>
                  <p className="text-white">{item.value}</p>
                </div>
              </div>
            ))}
            {!selected.snapshot_locked && (
              <button
                onClick={lockContract}
                disabled={saving || scopeLines.length === 0}
                className="mt-3 w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Lock size={16} /> Lock Contract Snapshot
              </button>
            )}
          </div>

          {/* Scope Lines */}
          <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h3 className="font-semibold text-white">Scope Lines (Base Tracker)</h3>
              <div className="flex items-center gap-2">
                {loadingScope && <RefreshCw size={14} className="animate-spin text-gray-400" />}
                {!selected.snapshot_locked && (
                  <div className="flex items-center gap-2">
                    {selected.quote_import_id && scopeLines.length === 0 && (
                      <button
                        onClick={generateFromImport}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-cyan-300 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Generate from Import
                      </button>
                    )}
                    <button
                      onClick={addScopeLine}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-cyan-400 hover:text-white hover:bg-cyan-500/10 rounded-lg transition-colors"
                    >
                      <Plus size={14} /> Add Line
                    </button>
                  </div>
                )}
              </div>
            </div>
            {scopeLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                <FileText size={32} className="text-gray-600 mb-3" />
                <p className="text-gray-400">No scope lines yet</p>
                {selected.quote_import_id ? (
                  <>
                    <p className="text-gray-500 text-xs mt-1 max-w-xs">
                      Scope lines can be auto-generated from your locked quote import. All included baseline lines will be imported.
                    </p>
                    {!selected.snapshot_locked && (
                      <div className="flex items-center gap-3 mt-4">
                        <button
                          onClick={generateFromImport}
                          disabled={saving}
                          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                        >
                          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          Generate from Import
                        </button>
                        <button onClick={addScopeLine} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors">
                          <Plus size={14} /> Add Manually
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 text-xs mt-1">Add scope lines manually or link a quote import.</p>
                    {!selected.snapshot_locked && (
                      <button onClick={addScopeLine} className="mt-3 flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm rounded-lg transition-colors">
                        <Plus size={14} /> Add First Scope Line
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 bg-slate-900/30">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Ref</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Description</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Method</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Contract</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Claimed</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {scopeLines.map(line => {
                      const pct = line.line_total > 0 ? Math.round((line.amount_claimed_to_date / line.line_total) * 100) : 0;
                      return (
                        <tr key={line.id} className="hover:bg-slate-700/20 transition-colors">
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={line.line_number}
                              onChange={e => updateScopeLine(line.id, { line_number: e.target.value })}
                              disabled={selected.snapshot_locked}
                              className="w-16 bg-transparent border-0 text-gray-400 text-xs focus:bg-slate-900/60 focus:border focus:border-cyan-500 rounded px-1 py-0.5 disabled:cursor-default"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={line.description}
                              onChange={e => updateScopeLine(line.id, { description: e.target.value })}
                              disabled={selected.snapshot_locked}
                              className="w-full bg-transparent border-0 text-white text-sm focus:bg-slate-900/60 focus:border focus:border-cyan-500 rounded px-1 py-0.5 disabled:cursor-default"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={line.claim_method}
                              onChange={e => updateScopeLine(line.id, { claim_method: e.target.value })}
                              disabled={selected.snapshot_locked}
                              className="bg-transparent text-gray-400 text-xs border-0 focus:bg-slate-900/60 focus:border focus:border-cyan-500 rounded disabled:cursor-default"
                            >
                              {CLAIM_METHODS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              value={line.unit_rate}
                              onChange={e => updateScopeLine(line.id, { unit_rate: parseFloat(e.target.value) || 0 })}
                              disabled={selected.snapshot_locked}
                              title="Rate (line total = qty × rate)"
                              className="w-24 bg-transparent border-0 text-right text-white font-medium text-sm focus:bg-slate-900/60 focus:border focus:border-cyan-500 rounded px-1 py-0.5 disabled:cursor-default"
                            />
                          </td>
                          <td className="px-4 py-3 text-right text-blue-400 text-sm">{fmt(line.amount_claimed_to_date)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 justify-end">
                              <div className="w-16 bg-slate-700/50 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="text-gray-400 text-xs w-8 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700/50 bg-slate-900/30">
                      <td colSpan={3} className="px-4 py-3 text-right text-gray-400 text-sm font-medium">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-white">{fmt(totalScope)}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-400">{fmt(totalClaimed)}</td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">
                        {totalScope > 0 ? Math.round((totalClaimed/totalScope)*100) : 0}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Contract Setup</h2>
          <p className="text-sm text-gray-400 mt-0.5">Step 2 — Set up contracts and define your scope baseline</p>
        </div>
        <button
          onClick={() => setView('new')}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New Contract
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="border-2 border-dashed border-slate-700 rounded-2xl p-16 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Briefcase size={32} className="text-gray-600" />
          </div>
          <p className="text-white font-semibold text-lg mb-2">No contracts yet</p>
          <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
            Create your first subcontract to start tracking your commercial position.
            You'll set up scope lines, claim methods, retention, and payment terms.
          </p>
          <button
            onClick={() => setView('new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus size={18} /> Create First Contract
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map(contract => (
            <div
              key={contract.id}
              onClick={() => openDetail(contract)}
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-5 py-4 hover:bg-slate-800/80 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${contract.snapshot_locked ? 'bg-cyan-500/20' : 'bg-yellow-500/20'}`}>
                  {contract.snapshot_locked ? <Lock size={18} className="text-cyan-400" /> : <Settings2 size={18} className="text-yellow-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-white">{contract.contract_name}</span>
                    <span className="text-xs text-gray-500">{contract.contract_number}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    {contract.subcontractor_company && <span>{contract.subcontractor_company}</span>}
                    <span>{contract.retention_percentage}% retention</span>
                    <span>{contract.payment_terms_days}d payment</span>
                    <span>Claims: {contract.payment_claim_prefix}{contract.next_claim_number}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-white">{fmt(contract.contract_value)}</div>
                  <span className={`text-xs px-2 py-0.5 rounded ${contract.snapshot_locked ? 'bg-cyan-500/20 text-cyan-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                    {contract.snapshot_locked ? 'Active' : 'Setup'}
                  </span>
                </div>
                <ChevronRight size={18} className="text-gray-600 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
