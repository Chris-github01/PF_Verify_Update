import { useState, useEffect } from 'react';
import {
  Plus, RefreshCw, FileText, ChevronRight, Send, CheckCircle,
  Clock, DollarSign, Calendar, Search, Filter, Copy,
  FileSpreadsheet, AlertCircle, XCircle, FileCheck
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import { useTrade } from '../../lib/tradeContext';
import PaymentClaimForm from './PaymentClaimForm';

interface PaymentClaimSummary {
  id: string;
  claim_number: string;
  our_ref: string;
  internal_reference: string;
  trade: string;
  payer_company: string;
  project_name: string;
  claim_period: string;
  submission_date: string | null;
  last_date_for_submitting: string | null;
  due_date: string | null;
  claimed_this_period_inc_gst: number;
  claimed_this_period_ex_gst: number;
  gst_amount: number;
  status: string;
  created_at: string;
  updated_at: string;
  contract_id: string | null;
}

interface Contract {
  id: string;
  contract_name: string;
  contract_number: string;
  subcontractor_company: string;
  contract_value: number;
}

type StatusFilter = 'all' | 'draft' | 'submitted' | 'certified' | 'paid' | 'disputed' | 'cancelled';

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n as number)) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

function fmtFull(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n as number)) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'text-slate-300',  bg: 'bg-slate-500/20',  icon: Clock },
  submitted: { label: 'Submitted', color: 'text-blue-300',   bg: 'bg-blue-500/20',   icon: Send },
  certified: { label: 'Certified', color: 'text-green-300',  bg: 'bg-green-500/20',  icon: FileCheck },
  paid:      { label: 'Paid',      color: 'text-cyan-300',   bg: 'bg-cyan-500/20',   icon: DollarSign },
  disputed:  { label: 'Disputed',  color: 'text-amber-300',  bg: 'bg-amber-500/20',  icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'text-red-300',    bg: 'bg-red-500/20',    icon: XCircle },
};

export default function PaymentClaimsList({ sccContractId }: { sccContractId?: string | null } = {}) {
  const { currentOrganisation } = useOrganisation();
  const { currentTrade } = useTrade();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [claims, setClaims] = useState<PaymentClaimSummary[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(sccContractId || null);
  const [loading, setLoading] = useState(true);
  const [showContractPicker, setShowContractPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [duplicating, setDuplicating] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrganisation?.id) loadData();
  }, [currentOrganisation?.id, currentTrade, sccContractId]);

  useEffect(() => {
    if (sccContractId) setSelectedContractId(sccContractId);
  }, [sccContractId]);

  const loadData = async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    let claimsQuery = supabase
      .from('payment_claims')
      .select('*')
      .eq('organisation_id', currentOrganisation.id)
      .eq('trade', currentTrade)
      .order('created_at', { ascending: false });

    if (sccContractId) {
      claimsQuery = claimsQuery.eq('contract_id', sccContractId);
    }

    let contractsQuery = supabase
      .from('scc_contracts')
      .select('id, contract_name, contract_number, subcontractor_company, contract_value')
      .eq('organisation_id', currentOrganisation.id)
      .eq('trade', currentTrade)
      .eq('snapshot_locked', true)
      .order('created_at', { ascending: false });

    if (sccContractId) {
      contractsQuery = contractsQuery.eq('id', sccContractId);
    }

    const [{ data: claimsData }, { data: contractsData }] = await Promise.all([claimsQuery, contractsQuery]);
    setClaims(claimsData || []);
    setContracts(contractsData || []);
    setLoading(false);
  };

  const openNew = (contractId: string | null) => {
    setSelectedClaimId(null);
    setSelectedContractId(contractId);
    setShowContractPicker(false);
    setView('form');
  };

  const openExisting = (claim: PaymentClaimSummary) => {
    setSelectedClaimId(claim.id);
    setSelectedContractId(claim.contract_id);
    setView('form');
  };

  const handleBack = () => {
    setView('list');
    loadData();
  };

  const duplicateClaim = async (e: React.MouseEvent, claim: PaymentClaimSummary) => {
    e.stopPropagation();
    if (!currentOrganisation?.id || duplicating) return;
    setDuplicating(claim.id);

    const { data: src } = await supabase.from('payment_claims').select('*').eq('id', claim.id).maybeSingle();
    if (!src) { setDuplicating(null); return; }

    const { data: lines } = await supabase.from('payment_claim_lines').select('*').eq('payment_claim_id', claim.id);

    const claimCount = claims.filter(c => c.contract_id === claim.contract_id).length;
    const newClaimNumber = src.claim_number ? `${src.claim_number.replace(/\d+$/, '')}${claimCount + 1}` : `PC-${claimCount + 1}`;

    const { data: newClaim, error } = await supabase
      .from('payment_claims')
      .insert({
        organisation_id: currentOrganisation.id,
        contract_id: src.contract_id,
        claim_number: newClaimNumber,
        our_ref: src.our_ref,
        internal_reference: src.internal_reference,
        trade: src.trade,
        payer_company: src.payer_company,
        payer_address: src.payer_address,
        payer_attention: src.payer_attention,
        project_name: src.project_name,
        site_location: src.site_location,
        claim_period: '',
        payee_company: src.payee_company,
        payee_address: src.payee_address,
        payee_contact: src.payee_contact,
        bank_name: src.bank_name,
        account_name: src.account_name,
        account_number: src.account_number,
        payment_notes: src.payment_notes,
        logo_url: src.logo_url,
        retention_rate_tier1: src.retention_rate_tier1,
        retention_rate_tier2: src.retention_rate_tier2,
        retention_rate_tier3: src.retention_rate_tier3,
        retention_released: 0,
        previous_net_claimed: src.net_claim_to_date_e ?? 0,
        net_payment_certified: 0,
        status: 'draft',
        base_total: 0,
        variations_total: 0,
        total_c: 0,
        retention_amount: 0,
        net_claim_to_date_e: 0,
        claimed_this_period_ex_gst: 0,
        gst_amount: 0,
        claimed_this_period_inc_gst: 0,
        amount_payable_ex_gst: 0,
        amount_payable_inc_gst: 0,
      })
      .select()
      .single();

    if (!error && newClaim && lines && lines.length > 0) {
      await supabase.from('payment_claim_lines').insert(
        lines.map(l => ({
          payment_claim_id: newClaim.id,
          organisation_id: currentOrganisation.id,
          line_type: l.line_type,
          item_no: l.item_no,
          description: l.description,
          qty: l.qty,
          unit: l.unit,
          rate: l.rate,
          total: l.total,
          claim_to_date_pct: 0,
          claim_to_date_amount: 0,
          previous_claimed_value: l.claim_to_date_amount,
          sort_order: l.sort_order,
        }))
      );

      await supabase.from('payment_claim_activity_logs').insert({
        payment_claim_id: newClaim.id,
        action_type: 'created',
        action_label: `Claim created as duplicate of ${claim.claim_number || 'prior claim'}`,
      });
    }

    setDuplicating(null);
    await loadData();
    if (newClaim) {
      setSelectedClaimId(newClaim.id);
      setSelectedContractId(newClaim.contract_id);
      setView('form');
    }
  };

  if (view === 'form') {
    return (
      <PaymentClaimForm
        claimId={selectedClaimId}
        contractId={selectedContractId}
        onBack={handleBack}
        onSaved={() => {}}
      />
    );
  }

  const filtered = claims.filter(c => {
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      c.claim_number?.toLowerCase().includes(q) ||
      c.project_name?.toLowerCase().includes(q) ||
      c.payer_company?.toLowerCase().includes(q) ||
      c.claim_period?.toLowerCase().includes(q) ||
      c.our_ref?.toLowerCase().includes(q) ||
      c.trade?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const totalClaimed = claims
    .filter(c => c.status !== 'cancelled')
    .reduce((s, c) => s + (c.claimed_this_period_inc_gst || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Payment Claims</h2>
          <p className="text-sm text-slate-400 mt-0.5">NZ Construction Contracts Act 2002 — Section 20 compliant claims</p>
        </div>
        <div className="relative flex-shrink-0">
          <button
            onClick={() => contracts.length > 0 ? setShowContractPicker(p => !p) : openNew(null)}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Claim
          </button>
          {showContractPicker && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20">
              <div className="px-4 py-3 border-b border-slate-700">
                <p className="text-sm font-semibold text-white">Link to contract?</p>
                <p className="text-xs text-slate-400 mt-0.5">Select a locked contract to pre-fill details</p>
              </div>
              <div className="py-1 max-h-64 overflow-y-auto">
                <button
                  onClick={() => openNew(null)}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 transition-colors"
                >
                  Standalone (no contract link)
                </button>
                {contracts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => openNew(c.id)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors border-t border-slate-700/30"
                  >
                    <p className="text-sm text-white font-medium">{c.contract_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{c.contract_number} · {fmt(c.contract_value)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Claims', value: claims.length, icon: FileText, color: 'text-white' },
          { label: 'Draft / Open', value: claims.filter(c => c.status === 'draft').length, icon: Clock, color: 'text-slate-300' },
          { label: 'Submitted', value: claims.filter(c => c.status === 'submitted').length, icon: Send, color: 'text-blue-400' },
          { label: 'Total Claimed (incl. GST)', value: fmt(totalClaimed), icon: DollarSign, color: 'text-cyan-400' },
        ].map(stat => (
          <div key={stat.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={13} className="text-slate-500" />
              <p className="text-xs text-slate-400">{stat.label}</p>
            </div>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2">
          <Search size={14} className="text-slate-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search claims, projects, payers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-white placeholder-slate-600 outline-none flex-1"
          />
        </div>
        <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2">
          <Filter size={13} className="text-slate-500" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-transparent text-sm text-white outline-none cursor-pointer"
          >
            <option value="all" className="bg-slate-800">All Status</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k} className="bg-slate-800">{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : filtered.length === 0 ? (
        claims.length === 0 ? (
          <EmptyState onNew={() => contracts.length > 0 ? setShowContractPicker(true) : openNew(null)} />
        ) : (
          <div className="text-center py-16 text-slate-500">
            <FileText size={32} className="mx-auto mb-3 opacity-40" />
            <p>No claims match your filters.</p>
          </div>
        )
      ) : (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-900/40">
                <th className="text-left px-5 py-3.5 text-slate-400 font-medium text-xs uppercase tracking-wide">Claim</th>
                <th className="text-left px-5 py-3.5 text-slate-400 font-medium text-xs uppercase tracking-wide">Project / Trade</th>
                <th className="text-left px-5 py-3.5 text-slate-400 font-medium text-xs uppercase tracking-wide hidden lg:table-cell">Period</th>
                <th className="text-left px-5 py-3.5 text-slate-400 font-medium text-xs uppercase tracking-wide hidden md:table-cell">Due Date</th>
                <th className="text-right px-5 py-3.5 text-slate-400 font-medium text-xs uppercase tracking-wide">Excl. GST</th>
                <th className="text-right px-5 py-3.5 text-slate-400 font-medium text-xs uppercase tracking-wide">Incl. GST</th>
                <th className="text-left px-5 py-3.5 text-slate-400 font-medium text-xs uppercase tracking-wide">Status</th>
                <th className="w-16 px-3 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/25">
              {filtered.map(claim => {
                const cfg = STATUS_CONFIG[claim.status] || STATUS_CONFIG.draft;
                const StatusIcon = cfg.icon;
                const isPastDue = claim.due_date && new Date(claim.due_date) < new Date() && claim.status === 'submitted';
                return (
                  <tr
                    key={claim.id}
                    onClick={() => openExisting(claim)}
                    className="cursor-pointer hover:bg-slate-700/20 transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <span className="font-semibold text-white">{claim.claim_number || '(draft)'}</span>
                      {(claim.our_ref || claim.internal_reference) && (
                        <p className="text-xs text-slate-500 mt-0.5">{claim.our_ref || claim.internal_reference}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-white">{claim.project_name || '—'}</span>
                      {claim.payer_company && <p className="text-xs text-slate-500 mt-0.5">{claim.payer_company}</p>}
                      {claim.trade && <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">{claim.trade}</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-400 text-xs hidden lg:table-cell">
                      {claim.claim_period || '—'}
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <div className={`flex items-center gap-1 text-xs ${isPastDue ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                        <Calendar size={11} />
                        {fmtDate(claim.due_date)}
                        {isPastDue && <span className="text-[10px] px-1 py-0.5 bg-red-500/20 rounded">Overdue</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="text-slate-300 text-sm">{fmtFull(claim.claimed_this_period_ex_gst)}</span>
                      {claim.gst_amount > 0 && (
                        <p className="text-xs text-slate-600 mt-0.5">GST {fmtFull(claim.gst_amount)}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-semibold text-white">{fmtFull(claim.claimed_this_period_inc_gst)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${cfg.bg} ${cfg.color} font-medium`}>
                        <StatusIcon size={10} /> {cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => duplicateClaim(e, claim)}
                          disabled={!!duplicating}
                          title="Duplicate as next claim"
                          className="p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-slate-700/50 rounded-lg transition-colors"
                        >
                          {duplicating === claim.id ? <RefreshCw size={12} className="animate-spin" /> : <Copy size={12} />}
                        </button>
                        <ChevronRight size={14} className="text-slate-600" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary footer when claims exist */}
      {filtered.length > 0 && (
        <p className="text-xs text-slate-600 text-right">
          Showing {filtered.length} of {claims.length} claims
        </p>
      )}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="border-2 border-dashed border-slate-700 rounded-2xl p-16 text-center">
      <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <FileText size={32} className="text-slate-600" />
      </div>
      <p className="text-white font-semibold text-lg mb-2">No payment claims yet</p>
      <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
        Create your first NZ payment claim under the Construction Contracts Act 2002.
        Include base contract items, variations, retention, and GST calculations.
      </p>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition-colors"
      >
        <Plus size={18} /> Create First Claim
      </button>
      <div className="mt-8 grid grid-cols-3 gap-4 max-w-md mx-auto text-left">
        {[
          { icon: FileSpreadsheet, title: 'Excel Export', desc: 'Multi-sheet workbook with all claim details' },
          { icon: FileText, title: 'PDF Export', desc: 'Print-ready claim document for submission' },
          { icon: CheckCircle, title: 'S.20 Notice', desc: 'Statutory notice automatically appended' },
        ].map(f => (
          <div key={f.title} className="p-3 bg-slate-800/40 border border-slate-700/40 rounded-xl">
            <f.icon size={16} className="text-cyan-500 mb-2" />
            <p className="text-xs font-semibold text-white">{f.title}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
