import { useState, useEffect } from 'react';
import {
  Plus, RefreshCw, FileText, ChevronRight, Send, CheckCircle,
  Clock, DollarSign, Calendar
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import PaymentClaimForm from './PaymentClaimForm';

interface PaymentClaimSummary {
  id: string;
  claim_number: string;
  our_ref: string;
  payer_company: string;
  project_name: string;
  claim_period: string;
  submission_date: string | null;
  due_date: string | null;
  claimed_this_period_inc_gst: number;
  amount_payable_inc_gst: number;
  status: string;
  created_at: string;
  contract_id: string | null;
}

interface Contract {
  id: string;
  contract_name: string;
  contract_number: string;
  subcontractor_company: string;
  contract_value: number;
  payment_claim_prefix: string;
  next_claim_number: number;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  draft:     { label: 'Draft',     color: 'text-gray-300',  bg: 'bg-gray-500/20',  icon: Clock },
  submitted: { label: 'Submitted', color: 'text-blue-300',  bg: 'bg-blue-500/20',  icon: Send },
  approved:  { label: 'Approved',  color: 'text-green-300', bg: 'bg-green-500/20', icon: CheckCircle },
  paid:      { label: 'Paid',      color: 'text-cyan-300',  bg: 'bg-cyan-500/20',  icon: DollarSign },
};

export default function PaymentClaimsList() {
  const { currentOrganisation } = useOrganisation();
  const [view, setView] = useState<'list' | 'form'>('list');
  const [claims, setClaims] = useState<PaymentClaimSummary[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContractPicker, setShowContractPicker] = useState(false);

  useEffect(() => {
    if (currentOrganisation?.id) {
      loadData();
    }
  }, [currentOrganisation?.id]);

  const loadData = async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    const [{ data: claimsData }, { data: contractsData }] = await Promise.all([
      supabase.from('payment_claims').select('*').eq('organisation_id', currentOrganisation.id).order('created_at', { ascending: false }),
      supabase.from('scc_contracts').select('*').eq('organisation_id', currentOrganisation.id).eq('snapshot_locked', true).order('created_at', { ascending: false }),
    ]);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Payment Claims</h2>
          <p className="text-sm text-gray-400 mt-0.5">Formal payment claim documents (Construction Contracts Act 2002)</p>
        </div>
        <div className="relative">
          <button
            onClick={() => contracts.length > 0 ? setShowContractPicker(p => !p) : openNew(null)}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Claim
          </button>
          {showContractPicker && contracts.length > 0 && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-20">
              <div className="px-4 py-3 border-b border-slate-700">
                <p className="text-sm font-semibold text-white">Link to contract?</p>
                <p className="text-xs text-gray-400 mt-0.5">Select a contract to pre-fill details</p>
              </div>
              <div className="py-1 max-h-56 overflow-y-auto">
                <button
                  onClick={() => openNew(null)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-slate-700/50 transition-colors"
                >
                  Standalone (no contract)
                </button>
                {contracts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => openNew(c.id)}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-700/50 transition-colors"
                  >
                    <p className="text-sm text-white">{c.contract_name}</p>
                    <p className="text-xs text-gray-500">{c.contract_number} · {fmt(c.contract_value)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : claims.length === 0 ? (
        <EmptyState onNew={() => contracts.length > 0 ? setShowContractPicker(true) : openNew(null)} />
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Claims', value: claims.length, sub: 'all time', icon: FileText, color: 'text-white' },
              { label: 'Draft', value: claims.filter(c => c.status === 'draft').length, icon: Clock, color: 'text-gray-400' },
              { label: 'Submitted', value: claims.filter(c => c.status === 'submitted').length, icon: Send, color: 'text-blue-400' },
              {
                label: 'Total Claimed',
                value: fmt(claims.reduce((s, c) => s + (c.claimed_this_period_inc_gst || 0), 0)),
                sub: 'incl. GST',
                icon: DollarSign,
                color: 'text-cyan-400',
              },
            ].map(stat => (
              <div key={stat.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon size={14} className="text-gray-500" />
                  <p className="text-xs text-gray-400">{stat.label}</p>
                </div>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                {stat.sub && <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>}
              </div>
            ))}
          </div>

          {/* Claims table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/30">
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Claim</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Project / Payer</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Period</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium hidden md:table-cell">Due</th>
                  <th className="text-right px-5 py-3 text-gray-400 font-medium">Amount (incl. GST)</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {claims.map(claim => {
                  const cfg = STATUS_CONFIG[claim.status] || STATUS_CONFIG.draft;
                  const StatusIcon = cfg.icon;
                  return (
                    <tr
                      key={claim.id}
                      onClick={() => openExisting(claim)}
                      className="cursor-pointer hover:bg-slate-700/20 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <span className="font-semibold text-white">{claim.claim_number || '(draft)'}</span>
                        {claim.our_ref && <p className="text-xs text-gray-500 mt-0.5">{claim.our_ref}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-white">{claim.project_name || '—'}</span>
                        {claim.payer_company && <p className="text-xs text-gray-500 mt-0.5">{claim.payer_company}</p>}
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs">{claim.claim_period || '—'}</td>
                      <td className="px-5 py-4 text-gray-400 text-xs hidden md:table-cell">
                        <div className="flex items-center gap-1">
                          <Calendar size={11} />
                          {fmtDate(claim.due_date)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-white">
                        {fmt(claim.claimed_this_period_inc_gst)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                          <StatusIcon size={10} /> {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <ChevronRight size={16} className="text-gray-600" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="border-2 border-dashed border-slate-700 rounded-2xl p-16 text-center">
      <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <FileText size={32} className="text-gray-600" />
      </div>
      <p className="text-white font-semibold text-lg mb-2">No payment claims yet</p>
      <p className="text-gray-400 text-sm max-w-md mx-auto mb-6">
        Create your first formal payment claim under the Construction Contracts Act 2002. Include base contract items, variations, retention calculations, and GST.
      </p>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition-colors"
      >
        <Plus size={18} /> Create First Claim
      </button>
    </div>
  );
}
