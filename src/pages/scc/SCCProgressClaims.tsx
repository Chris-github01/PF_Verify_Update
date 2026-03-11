import { useState, useEffect } from 'react';
import {
  Plus, RefreshCw, ChevronRight, Lock, CheckCircle, AlertTriangle,
  AlertCircle, Clock, TrendingUp, DollarSign, FileText, Send,
  Percent, Hash, ArrowUpRight, ArrowDownRight, Calendar, Info, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import { useTrade } from '../../lib/tradeContext';

interface Contract {
  id: string;
  contract_name: string;
  contract_number: string;
  contract_value: number;
  payment_claim_prefix: string;
  next_claim_number: number;
  retention_percentage: number;
  retention_limit_pct: number;
  payment_terms_days: number;
  status: string;
}

interface ClaimPeriod {
  id: string;
  contract_id: string;
  period_name: string;
  claim_number: string | null;
  status: string;
  claim_date: string;
  period_start_date: string | null;
  period_end_date: string | null;
  total_claimed_this_period: number;
  total_claimed_cumulative: number;
  site_materials_total: number;
  off_site_materials_total: number;
  retention_held_this_period: number;
  retention_released_this_period: number;
  retention_balance_cumulative: number;
  net_payable_this_period: number;
  approved_amount: number | null;
  created_at: string;
}

interface ScopeLine {
  id: string;
  line_reference: string;
  description: string;
  contract_amount: number;
  claim_method: string;
  original_qty: number | null;
  unit: string | null;
  qty_claimed_to_date: number;
  pct_claimed_to_date: number;
  amount_claimed_to_date: number;
}

interface ClaimLine {
  id: string;
  scope_line_id: string;
  claim_period_id: string;
  description: string;
  pct_this_period: number | null;
  pct_cumulative: number | null;
  qty_this_period: number | null;
  qty_cumulative: number | null;
  amount_this_period: number;
  amount_cumulative: number;
  certification_status: string;
  overrun_flagged: boolean;
}

const CLAIM_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:            { label: 'Draft',            color: 'text-gray-300',   bg: 'bg-gray-500/20'   },
  submitted:        { label: 'Submitted',         color: 'text-blue-300',   bg: 'bg-blue-500/20'   },
  under_review:     { label: 'Under Review',      color: 'text-yellow-300', bg: 'bg-yellow-500/20' },
  overrun_flagged:  { label: 'Overrun Flagged',   color: 'text-orange-300', bg: 'bg-orange-500/20' },
  commercial_hold:  { label: 'Commercial Hold',   color: 'text-red-300',    bg: 'bg-red-500/20'    },
  approved:         { label: 'Approved',          color: 'text-green-300',  bg: 'bg-green-500/20'  },
  partial:          { label: 'Partial',           color: 'text-orange-300', bg: 'bg-orange-500/20' },
  rejected:         { label: 'Rejected',          color: 'text-red-300',    bg: 'bg-red-500/20'    },
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SCCProgressClaims() {
  const { currentOrganisation } = useOrganisation();
  const { currentTrade } = useTrade();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [dismissedIntro, setDismissedIntro] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [claims, setClaims] = useState<ClaimPeriod[]>([]);
  const [scopeLines, setScopeLines] = useState<ScopeLine[]>([]);
  const [claimLines, setClaimLines] = useState<Record<string, ClaimLine[]>>({});
  const [selectedClaim, setSelectedClaim] = useState<ClaimPeriod | null>(null);
  const [view, setView] = useState<'contracts' | 'claims' | 'builder'>('contracts');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [builderData, setBuilderData] = useState<Record<string, { pct: number; qty: number }>>({});

  useEffect(() => {
    if (currentOrganisation?.id) loadContracts();
  }, [currentOrganisation?.id, currentTrade]);

  const loadContracts = async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('scc_contracts')
      .select('*')
      .eq('organisation_id', currentOrganisation.id)
      .eq('trade', currentTrade)
      .eq('snapshot_locked', true)
      .order('created_at', { ascending: false });
    setContracts(data || []);
    setLoading(false);
  };

  const loadClaims = async (contract: Contract) => {
    setSelectedContract(contract);
    setView('claims');
    const { data } = await supabase
      .from('scc_claim_periods')
      .select('*')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: false });
    setClaims(data || []);

    const { data: lines } = await supabase
      .from('scc_scope_lines')
      .select('*')
      .eq('contract_id', contract.id)
      .order('created_at', { ascending: true });
    setScopeLines(lines || []);
  };

  const openBuilder = async (claim: ClaimPeriod) => {
    setSelectedClaim(claim);
    setView('builder');
    if (!claimLines[claim.id]) {
      const { data } = await supabase
        .from('scc_claim_lines')
        .select('*')
        .eq('claim_period_id', claim.id);
      setClaimLines(prev => ({ ...prev, [claim.id]: data || [] }));
      const initialData: Record<string, { pct: number; qty: number }> = {};
      (data || []).forEach(l => {
        initialData[l.scope_line_id] = { pct: l.pct_this_period || 0, qty: l.qty_this_period || 0 };
      });
      setBuilderData(initialData);
    }
  };

  const createClaim = async () => {
    if (!selectedContract || !currentOrganisation?.id) return;
    setSaving(true);
    const claimNum = `${selectedContract.payment_claim_prefix}${selectedContract.next_claim_number}`;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('scc_claim_periods')
      .insert({
        organisation_id: currentOrganisation.id,
        contract_id: selectedContract.id,
        period_name: claimNum,
        claim_number: claimNum,
        status: 'draft',
        claim_date: today,
        total_claimed_this_period: 0,
        total_claimed_cumulative: 0,
        site_materials_total: 0,
        off_site_materials_total: 0,
        retention_held_this_period: 0,
        retention_released_this_period: 0,
        retention_balance_cumulative: 0,
        net_payable_this_period: 0,
      })
      .select()
      .single();
    if (data) {
      setClaims(prev => [data, ...prev]);
      await supabase.from('scc_contracts').update({ next_claim_number: selectedContract.next_claim_number + 1 }).eq('id', selectedContract.id);
      setSelectedContract(prev => prev ? { ...prev, next_claim_number: prev.next_claim_number + 1 } : null);
      await openBuilder(data);
    }
    setSaving(false);
  };

  const saveClaimLine = async (scopeLine: ScopeLine, pct: number, qty: number) => {
    if (!selectedClaim || !currentOrganisation?.id) return;

    const contractAmt = scopeLine.contract_amount;
    let amtThisPeriod = 0;
    if (scopeLine.claim_method === 'percentage') {
      const prevPct = scopeLine.pct_claimed_to_date;
      amtThisPeriod = contractAmt * (pct / 100) - contractAmt * (prevPct / 100);
    } else if (scopeLine.claim_method === 'quantity') {
      const rate = scopeLine.original_qty ? contractAmt / scopeLine.original_qty : 0;
      amtThisPeriod = qty * rate - scopeLine.qty_claimed_to_date * rate;
    } else if (scopeLine.claim_method === 'lump_sum') {
      amtThisPeriod = pct > 0 ? contractAmt : 0;
    }

    amtThisPeriod = Math.max(0, amtThisPeriod);
    const cumulativeAmt = scopeLine.amount_claimed_to_date + amtThisPeriod;
    const overrunFlagged = cumulativeAmt > contractAmt;

    const existing = (claimLines[selectedClaim.id] || []).find(l => l.scope_line_id === scopeLine.id);
    if (existing) {
      await supabase.from('scc_claim_lines').update({
        pct_this_period: pct,
        qty_this_period: qty,
        amount_this_period: amtThisPeriod,
        amount_cumulative: cumulativeAmt,
        overrun_flagged: overrunFlagged,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      setClaimLines(prev => ({
        ...prev,
        [selectedClaim.id]: (prev[selectedClaim.id] || []).map(l =>
          l.id === existing.id ? { ...l, pct_this_period: pct, qty_this_period: qty, amount_this_period: amtThisPeriod, amount_cumulative: cumulativeAmt, overrun_flagged: overrunFlagged } : l
        )
      }));
    } else {
      const { data } = await supabase.from('scc_claim_lines').insert({
        organisation_id: currentOrganisation.id,
        claim_period_id: selectedClaim.id,
        contract_id: selectedContract?.id,
        scope_line_id: scopeLine.id,
        description: scopeLine.description,
        contract_amount: contractAmt,
        pct_this_period: pct,
        qty_this_period: qty,
        amount_this_period: amtThisPeriod,
        amount_cumulative: cumulativeAmt,
        certification_status: overrunFlagged ? 'commercial_hold' : 'pending',
        overrun_flagged: overrunFlagged,
      }).select().single();
      if (data) {
        setClaimLines(prev => ({ ...prev, [selectedClaim.id]: [...(prev[selectedClaim.id] || []), data] }));
      }
    }
    setBuilderData(prev => ({ ...prev, [scopeLine.id]: { pct, qty } }));
  };

  const recalcAndSave = async () => {
    if (!selectedClaim || !currentOrganisation?.id) return;
    setSaving(true);
    let totalThisPeriod = 0;
    const lines = claimLines[selectedClaim.id] || [];
    for (const l of lines) {
      totalThisPeriod += l.amount_this_period || 0;
    }
    const prevCumulative = claims
      .filter(c => c.id !== selectedClaim.id && new Date(c.created_at) < new Date(selectedClaim.created_at))
      .reduce((s, c) => s + (c.total_claimed_this_period || 0), 0);
    const cumulative = prevCumulative + totalThisPeriod;
    const retentionHeld = Math.min(
      totalThisPeriod * ((selectedContract?.retention_percentage || 0) / 100),
      cumulative * ((selectedContract?.retention_limit_pct || 0) / 100)
    );
    const netPayable = totalThisPeriod - retentionHeld;

    await supabase.from('scc_claim_periods').update({
      total_claimed_this_period: totalThisPeriod,
      total_claimed_cumulative: cumulative,
      retention_held_this_period: retentionHeld,
      net_payable_this_period: netPayable,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedClaim.id);

    setClaims(prev => prev.map(c => c.id === selectedClaim.id
      ? { ...c, total_claimed_this_period: totalThisPeriod, total_claimed_cumulative: cumulative, retention_held_this_period: retentionHeld, net_payable_this_period: netPayable }
      : c
    ));
    setSelectedClaim(prev => prev ? { ...prev, total_claimed_this_period: totalThisPeriod, net_payable_this_period: netPayable } : null);
    setSaving(false);
  };

  const submitClaim = async () => {
    if (!selectedClaim) return;
    await recalcAndSave();
    await supabase.from('scc_claim_periods').update({ status: 'submitted', updated_at: new Date().toISOString() }).eq('id', selectedClaim.id);
    setClaims(prev => prev.map(c => c.id === selectedClaim.id ? { ...c, status: 'submitted' } : c));
    setSelectedClaim(prev => prev ? { ...prev, status: 'submitted' } : null);
  };

  const currentLines = selectedClaim ? (claimLines[selectedClaim.id] || []) : [];
  const totalThisPeriod = currentLines.reduce((s, l) => s + (l.amount_this_period || 0), 0);
  const overrunLines = currentLines.filter(l => l.overrun_flagged);

  if (view === 'builder' && selectedClaim && selectedContract) {
    const retRate = selectedContract.retention_percentage / 100;
    const retHeld = totalThisPeriod * retRate;
    const netPayable = totalThisPeriod - retHeld;
    const claimStatus = CLAIM_STATUS_CONFIG[selectedClaim.status] || CLAIM_STATUS_CONFIG.draft;
    const isEditable = selectedClaim.status === 'draft';

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('claims')} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
            <ChevronRight size={16} className="rotate-180" /> Back
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white">{selectedContract.contract_name}</span>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium">{selectedClaim.period_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${claimStatus.bg} ${claimStatus.color}`}>{claimStatus.label}</span>
        </div>

        {overrunLines.length > 0 && (
          <div className="flex items-start gap-3 bg-red-900/20 border border-red-500/30 rounded-xl px-5 py-4">
            <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-semibold text-sm">{overrunLines.length} line{overrunLines.length !== 1 ? 's' : ''} exceed the agreed contract amount</p>
              <p className="text-red-200/80 text-xs mt-1 leading-relaxed">
                <span className="font-semibold text-red-300">What this means:</span> You're claiming more than what was agreed for one or more line items. These are flagged as "Commercial Hold" — the main contractor will not certify them for payment until you agree on a revised amount or raise a variation.
              </p>
              <p className="text-red-400/70 text-xs mt-1.5">
                <span className="font-semibold">What to do:</span> Raise an Early Warning or Variation for each red-flagged line, then re-submit this claim once agreed.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'This Period', value: fmt(totalThisPeriod), color: 'text-white' },
            { label: 'Retention Held', value: fmt(retHeld), sub: `${selectedContract.retention_percentage}%`, color: 'text-yellow-400' },
            { label: 'Net Payable', value: fmt(netPayable), color: 'text-green-400' },
            { label: 'Overrun Lines', value: overrunLines.length, color: overrunLines.length > 0 ? 'text-red-400' : 'text-gray-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              {stat.sub && <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>}
            </div>
          ))}
        </div>

        {/* Claim Builder Table */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
            <h3 className="font-semibold text-white">Claim Lines — {selectedClaim.period_name}</h3>
            <div className="flex items-center gap-2">
              {isEditable && (
                <button
                  onClick={recalcAndSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={14} className={saving ? 'animate-spin' : ''} /> Recalculate
                </button>
              )}
              {isEditable && (
                <button
                  onClick={submitClaim}
                  disabled={saving || scopeLines.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <Send size={14} /> Submit Claim
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-900/30">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Scope Line</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">
                    <span>Contract Value</span>
                    <p className="text-gray-600 text-xs font-normal">agreed amount</p>
                  </th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">
                    <span>Already Claimed</span>
                    <p className="text-gray-600 text-xs font-normal">from earlier claims</p>
                  </th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">
                    <span>Claim This Month</span>
                    <p className="text-gray-600 text-xs font-normal">enter % or qty</p>
                  </th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">
                    <span>Amount This Period</span>
                    <p className="text-gray-600 text-xs font-normal">calculated for you</p>
                  </th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">
                    <span>Running Total</span>
                    <p className="text-gray-600 text-xs font-normal">all claims to date</p>
                  </th>
                  <th className="text-center px-4 py-3 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {scopeLines.map(scopeLine => {
                  const existing = currentLines.find(l => l.scope_line_id === scopeLine.id);
                  const bd = builderData[scopeLine.id] || { pct: existing?.pct_this_period || 0, qty: existing?.qty_this_period || 0 };
                  const amtThis = existing?.amount_this_period || 0;
                  const cumulative = existing?.amount_cumulative || 0;
                  const isOverrun = existing?.overrun_flagged;
                  const certStatus = existing?.certification_status || 'pending';

                  return (
                    <tr key={scopeLine.id} className={`transition-colors ${isOverrun ? 'bg-red-500/5' : 'hover:bg-slate-700/20'}`}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {isOverrun && <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />}
                          <div>
                            <div className="text-white text-sm">{scopeLine.description}</div>
                            <div className="text-gray-500 text-xs">{scopeLine.line_reference}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right text-gray-300">{fmt(scopeLine.contract_amount)}</td>
                      <td className="px-4 py-4 text-right text-gray-400 text-xs">
                        {scopeLine.claim_method === 'percentage'
                          ? `${scopeLine.pct_claimed_to_date}%`
                          : fmt(scopeLine.amount_claimed_to_date)}
                      </td>
                      <td className="px-4 py-4">
                        {isEditable ? (
                          <div className="flex flex-col items-center gap-1">
                            {scopeLine.claim_method === 'percentage' ? (
                              <>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={bd.pct}
                                    onChange={e => setBuilderData(prev => ({ ...prev, [scopeLine.id]: { ...prev[scopeLine.id] || { qty: 0 }, pct: parseFloat(e.target.value) || 0 } }))}
                                    onBlur={() => saveClaimLine(scopeLine, bd.pct, bd.qty)}
                                    className="w-16 text-right bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:border-cyan-500"
                                  />
                                  <Percent size={12} className="text-gray-500" />
                                </div>
                                <p className="text-gray-600 text-xs text-center leading-tight">cumulative<br/>% complete</p>
                              </>
                            ) : scopeLine.claim_method === 'quantity' ? (
                              <>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    value={bd.qty}
                                    onChange={e => setBuilderData(prev => ({ ...prev, [scopeLine.id]: { ...prev[scopeLine.id] || { pct: 0 }, qty: parseFloat(e.target.value) || 0 } }))}
                                    onBlur={() => saveClaimLine(scopeLine, bd.pct, bd.qty)}
                                    className="w-20 text-right bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-white text-sm focus:border-cyan-500"
                                  />
                                  <Hash size={12} className="text-gray-500" />
                                </div>
                                <p className="text-gray-600 text-xs text-center leading-tight">units installed<br/>this period</p>
                              </>
                            ) : (
                              <button
                                onClick={() => saveClaimLine(scopeLine, bd.pct > 0 ? 0 : 100, 0)}
                                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${bd.pct > 0 ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                              >
                                {bd.pct > 0 ? 'Claimed' : 'Claim'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="text-center text-gray-400 text-sm">
                            {scopeLine.claim_method === 'percentage' ? `${bd.pct}%` : bd.qty}
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-4 text-right font-medium ${isOverrun ? 'text-red-400' : 'text-white'}`}>
                        {fmt(amtThis)}
                      </td>
                      <td className="px-4 py-4 text-right text-blue-400">{fmt(cumulative)}</td>
                      <td className="px-4 py-4 text-center">
                        {isOverrun ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300 flex items-center gap-1 justify-center">
                            <Lock size={10} /> Hold
                          </span>
                        ) : certStatus === 'certified' ? (
                          <CheckCircle size={16} className="text-green-400 mx-auto" />
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700/50 bg-slate-900/30">
                  <td colSpan={4} className="px-4 py-3 text-right text-gray-400 text-sm font-medium">Total This Period</td>
                  <td className="px-4 py-3 text-right font-bold text-white">{fmt(totalThisPeriod)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="bg-slate-900/20">
                  <td colSpan={4} className="px-4 py-2 text-right text-gray-500 text-xs">Retention ({selectedContract.retention_percentage}%)</td>
                  <td className="px-4 py-2 text-right text-yellow-400 text-sm">-{fmt(retHeld)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="bg-slate-900/30 border-t border-cyan-500/20">
                  <td colSpan={4} className="px-4 py-3 text-right text-gray-300 text-sm font-bold">Net Payable</td>
                  <td className="px-4 py-3 text-right font-bold text-green-400 text-lg">{fmt(netPayable)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'claims' && selectedContract) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('contracts')} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
            <ChevronRight size={16} className="rotate-180" /> Back
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium">{selectedContract.contract_name}</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">{claims.length} Progress Claim{claims.length !== 1 ? 's' : ''}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Next claim: <span className="text-cyan-400 font-medium">{selectedContract.payment_claim_prefix}{selectedContract.next_claim_number}</span>
            </p>
          </div>
          <button
            onClick={createClaim}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
            New Claim Period
          </button>
        </div>

        {claims.length === 0 ? (
          <div className="border-2 border-dashed border-slate-700 rounded-2xl p-16 text-center">
            <TrendingUp size={48} className="text-gray-600 mb-4 mx-auto" />
            <p className="text-white font-semibold text-lg mb-2">No claims yet</p>
            <p className="text-gray-400 text-sm max-w-sm mx-auto mb-6">
              No claims yet for this contract. Click below to create your first one — the system will number it {selectedContract.payment_claim_prefix}1 and open the claim builder where you fill in this month's progress.
            </p>
            <button onClick={createClaim} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition-colors">
              <Plus size={18} /> Create {selectedContract.payment_claim_prefix}1
            </button>
          </div>
        ) : (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Claim</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Date</th>
                  <th className="text-right px-5 py-3 text-gray-400 font-medium">This Period</th>
                  <th className="text-right px-5 py-3 text-gray-400 font-medium">Retention</th>
                  <th className="text-right px-5 py-3 text-gray-400 font-medium">Net Payable</th>
                  <th className="text-right px-5 py-3 text-gray-400 font-medium">Approved</th>
                  <th className="text-left px-5 py-3 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {claims.map(claim => {
                  const cfg = CLAIM_STATUS_CONFIG[claim.status] || CLAIM_STATUS_CONFIG.draft;
                  const isHeld = claim.status === 'commercial_hold';
                  const variance = claim.approved_amount !== null ? claim.approved_amount - claim.net_payable_this_period : null;
                  return (
                    <tr
                      key={claim.id}
                      onClick={() => openBuilder(claim)}
                      className={`cursor-pointer transition-colors ${isHeld ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-slate-700/20'}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{claim.claim_number || claim.period_name}</span>
                          {isHeld && <Lock size={12} className="text-red-400" />}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-gray-400 text-xs">{fmtDate(claim.claim_date)}</td>
                      <td className="px-5 py-4 text-right text-gray-300">{fmt(claim.total_claimed_this_period)}</td>
                      <td className="px-5 py-4 text-right text-yellow-400 text-xs">{fmt(claim.retention_held_this_period)}</td>
                      <td className="px-5 py-4 text-right font-semibold text-white">{fmt(claim.net_payable_this_period)}</td>
                      <td className="px-5 py-4 text-right">
                        {claim.approved_amount !== null ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="font-semibold text-white">{fmt(claim.approved_amount)}</span>
                            {variance !== null && (
                              variance < 0
                                ? <ArrowDownRight size={13} className="text-red-400" />
                                : <ArrowUpRight size={13} className="text-green-400" />
                            )}
                          </div>
                        ) : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-2 py-1 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Progress Claims</h2>
        <p className="text-sm text-gray-400 mt-0.5">Raise your monthly payment claim for each active contract</p>
      </div>

      {!dismissedIntro && (
        <div className="rounded-2xl border bg-blue-500/10 border-blue-500/20 p-5 flex gap-4">
          <div className="w-8 h-8 rounded-lg bg-slate-800/60 flex items-center justify-center flex-shrink-0">
            <Info size={16} className="text-blue-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300 mb-1">How to raise a progress claim</p>
            <p className="text-slate-300 text-xs leading-relaxed mb-3">
              Each month, you tell the system how much of each scope item you've completed — either as a percentage done or as a number of units installed. It automatically calculates the dollar amount, deducts retention, and generates your claim document ready to send.
            </p>
            <ol className="space-y-1">
              {[
                'Click a contract card below to open its claims list',
                'Click "New Claim Period" to start the current month\'s claim',
                'For each line item, enter the % complete or qty installed this period',
                'Click "Recalculate" to update totals, then "Submit Claim" when ready',
                'If any lines show red (overrun), you\'ll need to raise a variation first',
              ].map((task, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                  <span className="font-bold flex-shrink-0 text-blue-300">{i + 1}.</span>
                  {task}
                </li>
              ))}
            </ol>
          </div>
          <button
            onClick={() => setDismissedIntro(true)}
            className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 self-start"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="border-2 border-dashed border-slate-700 rounded-2xl p-16 text-center">
          <Lock size={40} className="text-gray-600 mb-4 mx-auto" />
          <p className="text-white font-semibold text-lg mb-2">No active contracts</p>
          <p className="text-gray-400 text-sm max-w-sm mx-auto">
            Before you can raise a progress claim, you need to lock a contract in "Contract Setup". Locking it confirms the scope and agreed amounts — then you can start claiming each month.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contracts.map(contract => (
            <div
              key={contract.id}
              onClick={() => loadClaims(contract)}
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800/80 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center">
                  <FileText size={18} className="text-cyan-400" />
                </div>
                <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">Active</span>
              </div>
              <h4 className="font-semibold text-white mb-0.5">{contract.contract_name}</h4>
              <p className="text-sm text-gray-400 mb-3">{contract.contract_number}</p>
              <div className="text-lg font-bold text-white mb-1">{fmt(contract.contract_value)}</div>
              <p className="text-xs text-gray-500">Next: <span className="text-cyan-400">{contract.payment_claim_prefix}{contract.next_claim_number}</span></p>
              <div className="flex items-center gap-1 mt-3 text-cyan-400 text-sm font-medium">
                Open Claims <ChevronRight size={14} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
