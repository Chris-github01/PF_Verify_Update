import { useState, useEffect } from 'react';
import {
  ArrowLeft, Hash, CheckCircle, AlertTriangle, X, Send,
  Clock, Lock, DollarSign, TrendingUp, BarChart3, Plus, ChevronDown, ChevronRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SCCContract, SCCScopeLine, SCCClaimPeriod, SCCClaimLine } from '../../types/scc.types';

interface SCCClaimBuilderProps {
  contractId: string;
  onBack: () => void;
}

const nzd = (v: number) =>
  '$' + v.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (v: number) => `${v.toFixed(1)}%`;

interface ClaimLineState {
  scopeLineId: string;
  scopeLine: SCCScopeLine;
  previousCumulative: number;
  qtyClaimed: number;
  percentClaimed: number;
}

const claimStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-slate-400', bg: 'bg-slate-700/60' },
  submitted: { label: 'Submitted', color: 'text-sky-400', bg: 'bg-sky-900/30' },
  under_review: { label: 'Under Review', color: 'text-amber-400', bg: 'bg-amber-900/30' },
  approved: { label: 'Approved', color: 'text-emerald-400', bg: 'bg-emerald-900/30' },
  partial: { label: 'Partial', color: 'text-orange-400', bg: 'bg-orange-900/30' },
  rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-900/30' },
};

export default function SCCClaimBuilder({ contractId, onBack }: SCCClaimBuilderProps) {
  const [contract, setContract] = useState<SCCContract | null>(null);
  const [scopeLines, setScopeLines] = useState<SCCScopeLine[]>([]);
  const [claimPeriods, setClaimPeriods] = useState<SCCClaimPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);
  const [claimLines, setClaimLines] = useState<ClaimLineState[]>([]);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [showNewPeriod, setShowNewPeriod] = useState(false);

  useEffect(() => { load(); }, [contractId]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: c }, { data: sl }, { data: cp }] = await Promise.all([
        supabase.from('scc_contracts').select('*').eq('id', contractId).maybeSingle(),
        supabase.from('scc_scope_lines').select('*').eq('contract_id', contractId).order('line_number'),
        supabase.from('scc_claim_periods').select('*').eq('contract_id', contractId).order('period_number'),
      ]);
      setContract(c);
      setScopeLines(sl || []);
      setClaimPeriods(cp || []);

      // Auto-open draft claim if exists
      const draftPeriod = (cp || []).find(p => p.status === 'draft');
      if (draftPeriod) {
        await openClaimPeriod(draftPeriod.id, sl || [], cp || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openClaimPeriod = async (
    periodId: string,
    lines: SCCScopeLine[],
    periods: SCCClaimPeriod[]
  ) => {
    setActivePeriodId(periodId);

    // Load existing claim lines for this period
    const { data: existingLines } = await supabase
      .from('scc_claim_lines')
      .select('*')
      .eq('claim_period_id', periodId);

    // Build prior cumulative from all approved/submitted periods before this one
    const thisPeriod = periods.find(p => p.id === periodId);
    const priorPeriods = periods.filter(p =>
      p.status !== 'draft' && p.period_number < (thisPeriod?.period_number ?? 999)
    );

    // Per scope line, find cumulative from prior periods
    const priorByLine: Record<string, number> = {};
    for (const pp of priorPeriods) {
      const { data: ppLines } = await supabase
        .from('scc_claim_lines')
        .select('scope_line_id, qty_cumulative')
        .eq('claim_period_id', pp.id);
      for (const l of ppLines || []) {
        priorByLine[l.scope_line_id] = l.qty_cumulative || 0;
      }
    }

    const states: ClaimLineState[] = (lines || scopeLines).map(sl => {
      const existing = existingLines?.find(el => el.scope_line_id === sl.id);
      return {
        scopeLineId: sl.id,
        scopeLine: sl,
        previousCumulative: priorByLine[sl.id] ?? 0,
        qtyClaimed: existing?.qty_this_claim ?? 0,
        percentClaimed: existing?.percent_this_claim ?? 0,
      };
    });

    setClaimLines(states);
  };

  const handleNewPeriod = async () => {
    if (!contract || !newPeriodName.trim()) return;
    if (!contract.snapshot_locked) {
      showToast('Lock the contract snapshot before creating claims', 'error');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const periodNumber = claimPeriods.length + 1;
      const { data: period, error } = await supabase.from('scc_claim_periods').insert({
        contract_id: contractId,
        project_id: contract.project_id,
        organisation_id: contract.organisation_id,
        period_number: periodNumber,
        period_name: newPeriodName.trim(),
        claim_date: new Date().toISOString().split('T')[0],
        status: 'draft',
        total_claimed_this_period: 0,
        total_claimed_cumulative: 0,
        retention_deducted_this_period: 0,
        retention_held_cumulative: 0,
        net_payable_this_period: 0,
        disputed_amount: 0,
      }).select().single();
      if (error) throw error;

      setShowNewPeriod(false);
      setNewPeriodName('');
      await load();
      await openClaimPeriod(period.id, scopeLines, [...claimPeriods, period as SCCClaimPeriod]);
      showToast(`Claim period created: ${period.period_name}`);
    } catch (err: any) {
      showToast(err.message || 'Failed to create period', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateClaimLine = (scopeLineId: string, field: 'qtyClaimed' | 'percentClaimed', value: number) => {
    setClaimLines(prev => prev.map(cl => {
      if (cl.scopeLineId !== scopeLineId) return cl;
      if (field === 'percentClaimed') {
        const qty = (cl.scopeLine.qty_contract * value) / 100;
        return { ...cl, percentClaimed: value, qtyClaimed: qty };
      } else {
        const pctVal = cl.scopeLine.qty_contract > 0
          ? (value / cl.scopeLine.qty_contract) * 100
          : 0;
        return { ...cl, qtyClaimed: value, percentClaimed: pctVal };
      }
    }));
  };

  const saveDraft = async () => {
    if (!activePeriodId || !contract) return;
    setSaving(true);
    try {
      // Compute totals
      const computedLines = claimLines.map(cl => {
        const prevCum = cl.previousCumulative;
        const qtyThis = cl.qtyClaimed;
        const qtyCum = prevCum + qtyThis;
        const pctThis = cl.scopeLine.qty_contract > 0 ? (qtyThis / cl.scopeLine.qty_contract) * 100 : 0;
        const pctCum = cl.scopeLine.qty_contract > 0 ? (qtyCum / cl.scopeLine.qty_contract) * 100 : 0;
        const amtThis = qtyThis * cl.scopeLine.unit_rate;
        const amtCum = qtyCum * cl.scopeLine.unit_rate;
        const amtRemaining = cl.scopeLine.line_total - amtCum;
        return { cl, qtyCum, pctThis, pctCum, amtThis, amtCum, amtRemaining };
      });

      const totalThisClaim = computedLines.reduce((s, r) => s + r.amtThis, 0);
      const retentionThis = totalThisClaim * (contract.retention_percentage / 100);

      // Compute cumulative retention from all prior periods
      const prevPeriods = claimPeriods.filter(p => p.status !== 'draft' && p.period_number < (claimPeriods.find(p => p.id === activePeriodId)?.period_number ?? 999));
      const retentionCumPrior = prevPeriods.reduce((s, p) => s + (p.retention_held_cumulative || 0), 0);
      const retentionHeldCumulative = retentionCumPrior + retentionThis;

      const totalClaimed = (prevPeriods.reduce((s, p) => s + p.total_claimed_this_period, 0)) + totalThisClaim;
      const netPayable = totalThisClaim - retentionThis;

      // Delete old claim lines then reinsert
      await supabase.from('scc_claim_lines').delete().eq('claim_period_id', activePeriodId);
      const insertRows = computedLines.map(r => ({
        claim_period_id: activePeriodId,
        scope_line_id: r.cl.scopeLineId,
        contract_id: contractId,
        qty_previous_cumulative: r.cl.previousCumulative,
        qty_this_claim: r.cl.qtyClaimed,
        qty_cumulative: r.qtyCum,
        percent_this_claim: r.pctThis,
        percent_cumulative: r.pctCum,
        amount_this_claim: r.amtThis,
        amount_cumulative: r.amtCum,
        amount_remaining: r.amtRemaining,
      }));
      if (insertRows.length > 0) {
        await supabase.from('scc_claim_lines').insert(insertRows);
      }

      await supabase.from('scc_claim_periods').update({
        total_claimed_this_period: totalThisClaim,
        total_claimed_cumulative: totalClaimed,
        retention_deducted_this_period: retentionThis,
        retention_held_cumulative: retentionHeldCumulative,
        net_payable_this_period: netPayable,
        updated_at: new Date().toISOString(),
      }).eq('id', activePeriodId);

      await load();
      showToast('Draft saved');
    } catch (err: any) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitClaim = async () => {
    await saveDraft();
    if (!activePeriodId) return;
    setSaving(true);
    try {
      await supabase.from('scc_claim_periods').update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', activePeriodId);
      setActivePeriodId(null);
      setClaimLines([]);
      await load();
      showToast('Claim submitted for review');
    } finally {
      setSaving(false);
    }
  };

  const totalThisClaim = claimLines.reduce((s, cl) => s + cl.qtyClaimed * cl.scopeLine.unit_rate, 0);
  const retentionThis = contract ? totalThisClaim * (contract.retention_percentage / 100) : 0;
  const netPayable = totalThisClaim - retentionThis;

  const sections = Array.from(new Set(scopeLines.map(l => l.section)));
  const activePeriod = claimPeriods.find(p => p.id === activePeriodId);

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
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white">Progress Claims</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {contract?.contract_name} — {contract?.subcontractor_name}
                </p>
              </div>
            </div>
            {!activePeriodId && contract?.snapshot_locked && (
              <button
                onClick={() => setShowNewPeriod(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Plus size={14} />
                New Claim Period
              </button>
            )}
            {!contract?.snapshot_locked && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-900/30 border border-amber-700/50 rounded-xl text-amber-300 text-sm">
                <Lock size={14} />
                Lock the scope snapshot first to start claiming
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Past periods */}
        {claimPeriods.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Claim History</h2>
            <div className="space-y-2">
              {claimPeriods.map(period => {
                const cfg = claimStatusConfig[period.status] || claimStatusConfig.draft;
                const isActive = period.id === activePeriodId;
                return (
                  <div key={period.id} className={`bg-slate-800/50 border rounded-2xl overflow-hidden transition-all ${isActive ? 'border-sky-600/60' : 'border-slate-700/50'}`}>
                    <div
                      className="flex items-center justify-between px-5 py-4 cursor-pointer"
                      onClick={() => setExpandedPeriod(expandedPeriod === period.id ? null : period.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
                          <Hash size={14} className="text-sky-400" />
                        </div>
                        <div>
                          <p className="text-white font-semibold text-sm">{period.period_name}</p>
                          <p className="text-slate-500 text-xs mt-0.5">Claim #{period.period_number} · {period.claim_date}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-white font-bold">{nzd(period.total_claimed_this_period)}</span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {isActive ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                      </div>
                    </div>
                    {(expandedPeriod === period.id || isActive) && (
                      <div className="border-t border-slate-700/50 px-5 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Claimed This Period</p>
                            <p className="text-white font-semibold">{nzd(period.total_claimed_this_period)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Retention Deducted</p>
                            <p className="text-amber-400 font-semibold">{nzd(period.retention_deducted_this_period)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Net Payable</p>
                            <p className="text-emerald-400 font-semibold">{nzd(period.net_payable_this_period)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Retention Held (Cum.)</p>
                            <p className="text-amber-300 font-semibold">{nzd(period.retention_held_cumulative)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Claim Builder */}
        {activePeriodId && activePeriod && claimLines.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
                Building: {activePeriod.period_name}
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveDraft}
                  disabled={saving}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Draft'}
                </button>
                <button
                  onClick={submitClaim}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <Send size={13} />
                  Submit Claim
                </button>
              </div>
            </div>

            {/* Claim totals bar */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
                <p className="text-slate-400 text-xs mb-1">Claimed This Period</p>
                <p className="text-2xl font-bold text-white">{nzd(totalThisClaim)}</p>
              </div>
              <div className="bg-amber-900/20 border border-amber-700/30 rounded-2xl p-4">
                <p className="text-amber-400/80 text-xs mb-1">Retention ({contract?.retention_percentage}%)</p>
                <p className="text-2xl font-bold text-amber-400">({nzd(retentionThis)})</p>
              </div>
              <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-2xl p-4">
                <p className="text-emerald-400/80 text-xs mb-1">Net Payable</p>
                <p className="text-2xl font-bold text-emerald-400">{nzd(netPayable)}</p>
              </div>
            </div>

            {/* Claim line input table */}
            <div className="space-y-4">
              {sections.map(section => {
                const sectionClaimLines = claimLines.filter(cl => cl.scopeLine.section === section);
                return (
                  <div key={section}>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{section}</h4>
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700/50">
                            <th className="text-left px-4 py-3 text-slate-500 text-xs font-semibold uppercase w-24">Line</th>
                            <th className="text-left px-4 py-3 text-slate-500 text-xs font-semibold uppercase">Description</th>
                            <th className="text-right px-4 py-3 text-slate-500 text-xs font-semibold uppercase w-24">Contract</th>
                            <th className="text-right px-4 py-3 text-slate-500 text-xs font-semibold uppercase w-24">Prev. Cum.</th>
                            <th className="text-center px-4 py-3 text-slate-500 text-xs font-semibold uppercase w-36">This Claim</th>
                            <th className="text-right px-4 py-3 text-slate-500 text-xs font-semibold uppercase w-28">Amount</th>
                            <th className="text-right px-4 py-3 text-slate-500 text-xs font-semibold uppercase w-20">% Cum.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionClaimLines.map((cl, i) => {
                            const amtThis = cl.qtyClaimed * cl.scopeLine.unit_rate;
                            const pctCum = cl.scopeLine.qty_contract > 0
                              ? ((cl.previousCumulative + cl.qtyClaimed) / cl.scopeLine.qty_contract) * 100
                              : 0;
                            const isOver = pctCum > 100;
                            return (
                              <tr key={cl.scopeLineId} className={`border-b border-slate-700/30 last:border-0 ${i % 2 === 0 ? '' : 'bg-slate-900/20'}`}>
                                <td className="px-4 py-3">
                                  <span className="font-mono text-slate-400 text-xs">{cl.scopeLine.line_number}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-white text-sm leading-snug">{cl.scopeLine.description}</p>
                                  {cl.scopeLine.claim_method === 'milestone' && (
                                    <span className="text-xs text-amber-400 mt-0.5">Milestone</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-400 text-xs">
                                  {cl.scopeLine.qty_contract} {cl.scopeLine.unit}
                                </td>
                                <td className="px-4 py-3 text-right text-slate-400 text-xs">
                                  {cl.previousCumulative > 0 ? cl.previousCumulative.toFixed(2) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  {cl.scopeLine.claim_method === 'percentage' ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value={cl.percentClaimed || ''}
                                        onChange={e => updateClaimLine(cl.scopeLineId, 'percentClaimed', parseFloat(e.target.value) || 0)}
                                        className={`w-16 px-2 py-1.5 text-right text-sm rounded-lg border focus:outline-none transition-colors ${isOver ? 'bg-red-900/30 border-red-600 text-red-300' : 'bg-slate-700 border-slate-600 text-white focus:border-sky-500'}`}
                                      />
                                      <span className="text-slate-400 text-xs">%</span>
                                    </div>
                                  ) : (
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={cl.qtyClaimed || ''}
                                      onChange={e => updateClaimLine(cl.scopeLineId, 'qtyClaimed', parseFloat(e.target.value) || 0)}
                                      className={`w-20 px-2 py-1.5 text-right text-sm rounded-lg border focus:outline-none transition-colors ${isOver ? 'bg-red-900/30 border-red-600 text-red-300' : 'bg-slate-700 border-slate-600 text-white focus:border-sky-500'}`}
                                    />
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-white font-semibold text-sm">
                                  {amtThis > 0 ? nzd(amtThis) : '—'}
                                </td>
                                <td className={`px-4 py-3 text-right text-sm font-semibold ${isOver ? 'text-red-400' : pctCum >= 100 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                  {pct(pctCum)}
                                  {isOver && <AlertTriangle size={12} className="inline ml-1" />}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!activePeriodId && claimPeriods.length === 0 && contract?.snapshot_locked && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-sky-900/30 flex items-center justify-center mb-4">
              <Hash size={24} className="text-sky-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">No claims yet</h3>
            <p className="text-slate-400 text-sm max-w-sm mb-6">Start your first progress claim period to begin tracking payments.</p>
            <button
              onClick={() => setShowNewPeriod(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-semibold"
            >
              <Plus size={14} />
              First Claim Period
            </button>
          </div>
        )}
      </div>

      {/* New Period Modal */}
      {showNewPeriod && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold">New Claim Period</h3>
              <button onClick={() => setShowNewPeriod(false)} className="text-slate-400 hover:text-white p-1"><X size={18} /></button>
            </div>
            <label className="block text-slate-400 text-xs font-medium mb-2">Claim Period Name</label>
            <input
              value={newPeriodName}
              onChange={e => setNewPeriodName(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-sky-500 mb-5"
              placeholder="e.g. Progress Claim #1 — March 2026"
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setShowNewPeriod(false)} className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium">Cancel</button>
              <button
                onClick={handleNewPeriod}
                disabled={saving || !newPeriodName.trim()}
                className="flex-1 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold"
              >
                {saving ? 'Creating...' : 'Create Period'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
