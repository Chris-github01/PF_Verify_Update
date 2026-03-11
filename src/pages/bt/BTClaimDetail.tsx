import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, FileSpreadsheet, Download, CheckCircle,
  AlertTriangle, Save, RefreshCw, Send, DollarSign
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import type {
  BTClaimPeriod, BTClaimLineItem, BTBaselineLineItem,
  BTVariation, BTProject, BTBaselineHeader, BTClaimStatus
} from '../../types/baselineTracker.types';
import { exportClaimPeriod, downloadBlob } from '../../lib/export/baselineTrackerExport';

interface BTClaimDetailProps {
  claimId: string;
  onNavigate: (view: string, id?: string) => void;
}

const STATUS_FLOW: BTClaimStatus[] = ['draft', 'under_review', 'ready_to_submit', 'submitted', 'certified', 'part_paid', 'paid', 'disputed'];

const statusColors: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  under_review: 'bg-amber-900/50 text-amber-300',
  ready_to_submit: 'bg-blue-900/50 text-blue-300',
  submitted: 'bg-cyan-900/50 text-cyan-300',
  certified: 'bg-emerald-900/50 text-emerald-300',
  part_paid: 'bg-teal-900/50 text-teal-300',
  paid: 'bg-green-900/50 text-green-300',
  disputed: 'bg-red-900/50 text-red-300',
};

export default function BTClaimDetail({ claimId, onNavigate }: BTClaimDetailProps) {
  const { currentOrganisation } = useOrganisation();
  const [claim, setClaim] = useState<BTClaimPeriod | null>(null);
  const [project, setProject] = useState<BTProject | null>(null);
  const [header, setHeader] = useState<BTBaselineHeader | null>(null);
  const [claimLines, setClaimLines] = useState<BTClaimLineItem[]>([]);
  const [baselineItems, setBaselineItems] = useState<BTBaselineLineItem[]>([]);
  const [variations, setVariations] = useState<BTVariation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editedLines, setEditedLines] = useState<Map<string, Partial<BTClaimLineItem>>>(new Map());

  const loadData = useCallback(async () => {
    if (!currentOrganisation) return;
    setLoading(true);
    try {
      const { data: claimData } = await supabase
        .from('bt_claim_periods')
        .select('*')
        .eq('id', claimId)
        .maybeSingle();

      if (!claimData) { setLoading(false); return; }
      setClaim(claimData);

      const [projRes, headerRes, linesRes, varsRes] = await Promise.all([
        supabase.from('bt_projects').select('*').eq('id', claimData.project_id).maybeSingle(),
        supabase.from('bt_baseline_headers').select('*').eq('id', claimData.baseline_header_id).maybeSingle(),
        supabase.from('bt_claim_line_items').select('*, baseline_line_item:bt_baseline_line_items(*)').eq('claim_period_id', claimId),
        supabase.from('bt_variations').select('*').eq('project_id', claimData.project_id),
      ]);

      setProject(projRes.data);
      setHeader(headerRes.data);
      setVariations(varsRes.data || []);

      const fetchedLines = linesRes.data || [];

      if (headerRes.data) {
        const { data: items } = await supabase
          .from('bt_baseline_line_items')
          .select('*')
          .eq('baseline_header_id', headerRes.data.id)
          .order('display_order')
          .order('line_number');

        setBaselineItems(items || []);

        if (fetchedLines.length === 0 && items && items.length > 0) {
          const newLines = items.map((item) => ({
            claim_period_id: claimId,
            baseline_line_item_id: item.id,
            organisation_id: currentOrganisation.id,
            previous_quantity_claimed: 0,
            previous_value_claimed: 0,
            this_period_quantity: 0,
            this_period_percent: 0,
            this_period_value: 0,
            total_quantity_claimed_to_date: 0,
            total_value_claimed_to_date: 0,
            remaining_quantity: item.baseline_quantity,
            remaining_value: item.baseline_amount,
            progress_percent_to_date: 0,
            line_status: 'not_started' as const,
          }));

          const { data: inserted } = await supabase
            .from('bt_claim_line_items')
            .insert(newLines)
            .select('*, baseline_line_item:bt_baseline_line_items(*)');

          setClaimLines(inserted || []);
        } else {
          setClaimLines(fetchedLines);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [claimId, currentOrganisation?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateLineValue = (lineId: string, key: keyof BTClaimLineItem, value: any) => {
    setEditedLines((prev) => {
      const map = new Map(prev);
      map.set(lineId, { ...(map.get(lineId) || {}), [key]: value });
      return map;
    });

    setClaimLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const baselineItem = line.baseline_line_item as BTBaselineLineItem | undefined;
        const updated = { ...line, [key]: value };

        const baseQty = baselineItem?.baseline_quantity || 0;
        const baseRate = baselineItem?.baseline_rate || 0;
        const baseAmount = baselineItem?.baseline_amount || 0;

        if (baselineItem?.claim_method === 'quantity_based') {
          if (key === 'this_period_quantity') {
            updated.this_period_value = value * baseRate;
            updated.this_period_percent = baseQty > 0 ? (value / baseQty) * 100 : 0;
          }
        } else if (baselineItem?.claim_method === 'percent_based') {
          if (key === 'this_period_percent') {
            updated.this_period_value = (value / 100) * baseAmount;
            updated.this_period_quantity = baseQty > 0 ? (value / 100) * baseQty : 0;
          }
        }

        updated.total_value_claimed_to_date = updated.previous_value_claimed + updated.this_period_value;
        updated.total_quantity_claimed_to_date = updated.previous_quantity_claimed + updated.this_period_quantity;
        updated.remaining_quantity = baseQty - updated.total_quantity_claimed_to_date;
        updated.remaining_value = baseAmount - updated.total_value_claimed_to_date;
        updated.progress_percent_to_date = baseAmount > 0 ? (updated.total_value_claimed_to_date / baseAmount) * 100 : 0;

        return updated;
      })
    );
  };

  const handleSave = async () => {
    if (!claim || !project || !header) return;
    setSaving(true);

    try {
      for (const [lineId, changes] of editedLines) {
        await supabase.from('bt_claim_line_items').update(changes).eq('id', lineId);
      }

      const currentClaimSubtotal = claimLines.reduce((s, l) => s + l.this_period_value, 0);
      const approvedVarsTotal = variations.filter((v) => v.status === 'approved').reduce((s, v) => s + (v.approved_amount || v.amount), 0);
      const grossClaim = currentClaimSubtotal + approvedVarsTotal;
      const retentionRate = header.retention_percent / 100;
      const retentionAmount = grossClaim * retentionRate;
      const netBeforeGST = grossClaim - retentionAmount;
      const gstRate = project.gst_rate || 0.15;
      const gstAmount = netBeforeGST * gstRate;
      const totalInclGST = netBeforeGST + gstAmount;

      await supabase.from('bt_claim_periods').update({
        current_claim_subtotal: currentClaimSubtotal,
        approved_variations_total: approvedVarsTotal,
        gross_claim: grossClaim,
        retention_amount: retentionAmount,
        net_before_gst: netBeforeGST,
        gst_amount: gstAmount,
        total_this_claim_incl_gst: totalInclGST,
      }).eq('id', claim.id);

      setEditedLines(new Map());
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleAdvanceStatus = async (newStatus: BTClaimStatus) => {
    if (!claim) return;
    const updates: Partial<BTClaimPeriod> = { status: newStatus };
    if (newStatus === 'submitted') {
      updates.submitted_at = new Date().toISOString();
      updates.submitted_by = (await supabase.auth.getUser()).data.user?.id || undefined;
    }
    await supabase.from('bt_claim_periods').update(updates).eq('id', claim.id);
    await loadData();
  };

  const handleExport = async () => {
    if (!project || !header || !claim) return;
    setExporting(true);
    try {
      const linesWithItems = claimLines.map((cl) => ({
        ...cl,
        baseline_line_item: baselineItems.find((i) => i.id === cl.baseline_line_item_id),
      }));
      const blob = await exportClaimPeriod(project, header, claim, linesWithItems, variations);
      downloadBlob(blob, `CLAIM_PC${claim.claim_no}_${project.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2 }).format(n);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!claim || !project) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-400">Claim not found</p>
        <button onClick={() => onNavigate('bt-projects')} className="mt-4 text-cyan-400 text-sm">Back to projects</button>
      </div>
    );
  }

  const currentSubtotal = claimLines.reduce((s, l) => s + l.this_period_value, 0);
  const approvedVarsTotal = variations.filter((v) => v.status === 'approved').reduce((s, v) => s + (v.approved_amount || v.amount), 0);
  const grossClaim = currentSubtotal + approvedVarsTotal;
  const retentionRate = (header?.retention_percent || 5) / 100;
  const retentionAmount = grossClaim * retentionRate;
  const netBeforeGST = grossClaim - retentionAmount;
  const gstRate = project.gst_rate || 0.15;
  const gstAmount = netBeforeGST * gstRate;
  const totalInclGST = netBeforeGST + gstAmount;

  const isEditable = ['draft', 'under_review'].includes(claim.status);
  const hasUnsavedChanges = editedLines.size > 0;
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(claim.status) + 1] as BTClaimStatus | undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-800/60">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('bt-project-detail', claim.project_id)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-50">PC{claim.claim_no} — {claim.claim_period_name}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[claim.status]}`}>
                  {claim.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{project.project_name} | {project.client_name || 'No client'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasUnsavedChanges && isEditable && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-medium"
              >
                {saving ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}

            {nextStatus && isEditable && (
              <button
                onClick={() => handleAdvanceStatus(nextStatus)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-xl text-xs font-medium"
              >
                <Send size={14} />
                Move to: {nextStatus.replace(/_/g, ' ')}
              </button>
            )}

            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-medium disabled:opacity-50"
            >
              {exporting ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" /> : <FileSpreadsheet size={14} />}
              Export Excel
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Claim Summary Header */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Previous Claimed', value: fmt(claim.previous_claimed_total), color: 'text-slate-300' },
            { label: 'This Claim Subtotal', value: fmt(currentSubtotal), color: 'text-cyan-400' },
            { label: 'Approved Variations', value: fmt(approvedVarsTotal), color: 'text-emerald-400' },
            { label: 'Gross Claim', value: fmt(grossClaim), color: 'text-blue-400' },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
              <p className="text-xs text-slate-400 mb-1">{card.label}</p>
              <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Line Items Table */}
        <div>
          <h2 className="text-base font-semibold text-slate-200 mb-3">Claim Line Items</h2>
          {!isEditable && (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-900/20 border border-amber-700/50 px-3 py-2">
              <AlertTriangle size={14} className="text-amber-400" />
              <p className="text-xs text-amber-300">Claim is in <strong>{claim.status.replace(/_/g, ' ')}</strong> status. Line items are read-only.</p>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-700/60">
            <table className="w-full text-xs min-w-[1000px]">
              <thead>
                <tr className="bg-slate-800/60 border-b border-slate-700/60">
                  {[
                    { label: 'Line', cls: '' },
                    { label: 'Item', cls: '' },
                    { label: 'Unit', cls: '' },
                    { label: 'Baseline Qty', cls: 'text-right' },
                    { label: 'Baseline $', cls: 'text-right' },
                    { label: 'Prev Claimed', cls: 'text-right' },
                    { label: 'This Period Qty', cls: 'text-right bg-emerald-900/20' },
                    { label: 'This Period %', cls: 'text-right bg-emerald-900/20' },
                    { label: 'This Period $', cls: 'text-right bg-emerald-900/20' },
                    { label: 'Total Claimed', cls: 'text-right' },
                    { label: 'Remaining', cls: 'text-right' },
                    { label: 'Status', cls: '' },
                  ].map(({ label, cls }) => (
                    <th key={label} className={`px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap ${cls}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {claimLines.map((cl, idx) => {
                  const item = (cl.baseline_line_item as BTBaselineLineItem | undefined) || baselineItems.find((i) => i.id === cl.baseline_line_item_id);
                  const isQtyBased = item?.claim_method === 'quantity_based' || item?.claim_method === 'milestone_based';
                  const isPctBased = item?.claim_method === 'percent_based';

                  return (
                    <tr key={cl.id} className={`border-b border-slate-800/40 ${idx % 2 === 0 ? '' : 'bg-slate-800/10'} hover:bg-slate-800/20`}>
                      <td className="px-3 py-2.5 text-slate-400 font-mono">{item?.line_number || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-200 font-medium max-w-xs">
                        <div>
                          <p className="truncate">{item?.item_title || '—'}</p>
                          {item?.location && <p className="text-slate-500 text-xs truncate">{item.location}</p>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{item?.unit || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-300 text-right">{item?.baseline_quantity.toLocaleString('en-NZ', { maximumFractionDigits: 2 }) || 0}</td>
                      <td className="px-3 py-2.5 text-slate-300 text-right">{fmt(item?.baseline_amount || 0)}</td>
                      <td className="px-3 py-2.5 text-slate-400 text-right">{fmt(cl.previous_value_claimed)}</td>

                      {/* Editable cells */}
                      <td className="px-2 py-1.5 bg-emerald-900/10 text-right">
                        {isEditable ? (
                          <input
                            type="number"
                            value={cl.this_period_quantity}
                            onChange={(e) => updateLineValue(cl.id, 'this_period_quantity', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-slate-200 text-right focus:outline-none focus:border-cyan-500"
                          />
                        ) : (
                          <span className="text-slate-300">{cl.this_period_quantity.toLocaleString('en-NZ', { maximumFractionDigits: 2 })}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 bg-emerald-900/10 text-right">
                        {isEditable ? (
                          <input
                            type="number"
                            value={parseFloat(cl.this_period_percent.toFixed(2))}
                            onChange={(e) => updateLineValue(cl.id, 'this_period_percent', parseFloat(e.target.value) || 0)}
                            className="w-16 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-slate-200 text-right focus:outline-none focus:border-cyan-500"
                          />
                        ) : (
                          <span className="text-slate-300">{cl.this_period_percent.toFixed(1)}%</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 bg-emerald-900/10 text-cyan-400 text-right font-semibold">{fmt(cl.this_period_value)}</td>

                      <td className="px-3 py-2.5 text-slate-300 text-right">{fmt(cl.total_value_claimed_to_date)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={cl.remaining_value < 0 ? 'text-red-400' : 'text-slate-400'}>{fmt(cl.remaining_value)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {isEditable ? (
                          <select
                            value={cl.line_status}
                            onChange={(e) => updateLineValue(cl.id, 'line_status', e.target.value)}
                            className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                          >
                            <option value="not_started">Not Started</option>
                            <option value="in_progress">In Progress</option>
                            <option value="substantially_complete">Sub. Complete</option>
                            <option value="complete">Complete</option>
                          </select>
                        ) : (
                          <span className="text-slate-400 capitalize">{cl.line_status.replace(/_/g, ' ')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Totals */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <DollarSign size={15} className="text-cyan-400" />
            Claim Summary
          </h2>
          <div className="max-w-md ml-auto space-y-2">
            {[
              { label: 'Previous Claimed Total', value: claim.previous_claimed_total, color: 'text-slate-400' },
              { label: 'This Claim Subtotal', value: currentSubtotal, color: 'text-cyan-400' },
              { label: 'Approved Variations This Claim', value: approvedVarsTotal, color: 'text-emerald-400' },
              { label: 'Gross Claim', value: grossClaim, bold: true, color: 'text-blue-400', divBefore: true },
              { label: `Retention (${header?.retention_percent || 5}%)`, value: -retentionAmount, color: 'text-red-400' },
              { label: 'Net Before GST', value: netBeforeGST, bold: true, color: 'text-slate-300', divBefore: true },
              { label: `GST (${(gstRate * 100).toFixed(0)}%)`, value: gstAmount, color: 'text-slate-400' },
              { label: 'TOTAL THIS CLAIM (incl. GST)', value: totalInclGST, bold: true, color: 'text-emerald-400', divBefore: true, large: true },
            ].map((row) => (
              <div key={row.label}>
                {row.divBefore && <div className="border-t border-slate-700 my-2" />}
                <div className={`flex justify-between items-center ${row.large ? 'py-2' : 'py-1'}`}>
                  <span className={`text-sm ${row.bold ? 'font-semibold text-slate-200' : 'text-slate-400'}`}>{row.label}</span>
                  <span className={`font-${row.bold ? 'bold' : 'medium'} text-sm ${row.color} ${row.large ? 'text-base' : ''}`}>
                    {fmt(row.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Certified / Paid inputs */}
        {['certified', 'part_paid', 'paid'].includes(claim.status) && (
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Certification & Payment</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Certified Amount</label>
                <input
                  type="number"
                  value={claim.certified_amount ?? ''}
                  onChange={async (e) => {
                    const val = parseFloat(e.target.value);
                    await supabase.from('bt_claim_periods').update({ certified_amount: val }).eq('id', claim.id);
                    await loadData();
                  }}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Paid Amount</label>
                <input
                  type="number"
                  value={claim.paid_amount ?? ''}
                  onChange={async (e) => {
                    const val = parseFloat(e.target.value);
                    await supabase.from('bt_claim_periods').update({ paid_amount: val }).eq('id', claim.id);
                    await loadData();
                  }}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Payment Received Date</label>
                <input
                  type="date"
                  value={claim.payment_received_date || ''}
                  onChange={async (e) => {
                    await supabase.from('bt_claim_periods').update({ payment_received_date: e.target.value }).eq('id', claim.id);
                    await loadData();
                  }}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
