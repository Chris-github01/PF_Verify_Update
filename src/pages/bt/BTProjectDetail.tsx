import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, LayoutDashboard, List, TrendingUp, FileText, RefreshCw, Paperclip, Activity, Lock, Unlock, Plus, Trash2, Save, CreditCard as Edit3, AlertTriangle, CheckCircle, Download, FileSpreadsheet, Upload, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import type {
  BTProject, BTBaselineHeader, BTBaselineLineItem, BTClaimPeriod,
  BTVariation, BTAttachment, BTActivityLog, BTClaimMethod, BTVariationType
} from '../../types/baselineTracker.types';
import {
  exportBaselineSnapshot, exportProgressSummary, downloadBlob
} from '../../lib/export/baselineTrackerExport';

type Tab = 'overview' | 'baseline' | 'progress' | 'claims' | 'variations' | 'attachments' | 'activity';

interface BTProjectDetailProps {
  projectId: string;
  onNavigate: (view: string, id?: string) => void;
}

const claimStatusColor: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  under_review: 'bg-amber-900/50 text-amber-300',
  ready_to_submit: 'bg-blue-900/50 text-blue-300',
  submitted: 'bg-cyan-900/50 text-cyan-300',
  certified: 'bg-emerald-900/50 text-emerald-300',
  part_paid: 'bg-teal-900/50 text-teal-300',
  paid: 'bg-green-900/50 text-green-300',
  disputed: 'bg-red-900/50 text-red-300',
};

const varStatusColor: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  submitted: 'bg-amber-900/50 text-amber-300',
  under_review: 'bg-blue-900/50 text-blue-300',
  approved: 'bg-emerald-900/50 text-emerald-300',
  rejected: 'bg-red-900/50 text-red-300',
  withdrawn: 'bg-slate-700 text-slate-400',
};

export default function BTProjectDetail({ projectId, onNavigate }: BTProjectDetailProps) {
  const { currentOrganisation } = useOrganisation();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [project, setProject] = useState<BTProject | null>(null);
  const [header, setHeader] = useState<BTBaselineHeader | null>(null);
  const [lineItems, setLineItems] = useState<BTBaselineLineItem[]>([]);
  const [claims, setClaims] = useState<BTClaimPeriod[]>([]);
  const [variations, setVariations] = useState<BTVariation[]>([]);
  const [attachments, setAttachments] = useState<BTAttachment[]>([]);
  const [activityLogs, setActivityLogs] = useState<BTActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingLineItem, setEditingLineItem] = useState<string | null>(null);
  const [newLineItem, setNewLineItem] = useState<Partial<BTBaselineLineItem> | null>(null);
  const [editingVariation, setEditingVariation] = useState<string | null>(null);
  const [newVariation, setNewVariation] = useState<Partial<BTVariation> | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingBaseline, setExportingBaseline] = useState(false);

  const loadData = useCallback(async () => {
    if (!currentOrganisation) return;
    setLoading(true);
    try {
      const [projRes, headerRes, itemsRes, claimsRes, varsRes, attachRes, logsRes] = await Promise.all([
        supabase.from('bt_projects').select('*').eq('id', projectId).maybeSingle(),
        supabase.from('bt_baseline_headers').select('*').eq('project_id', projectId).order('baseline_version', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('bt_baseline_line_items').select('*').eq('organisation_id', currentOrganisation.id).order('display_order').order('line_number'),
        supabase.from('bt_claim_periods').select('*').eq('project_id', projectId).order('claim_no', { ascending: false }),
        supabase.from('bt_variations').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('bt_attachments').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
        supabase.from('bt_activity_logs').select('*').eq('project_id', projectId).order('action_at', { ascending: false }).limit(50),
      ]);

      setProject(projRes.data);
      setHeader(headerRes.data);

      if (headerRes.data) {
        const { data: items } = await supabase
          .from('bt_baseline_line_items')
          .select('*')
          .eq('baseline_header_id', headerRes.data.id)
          .order('display_order')
          .order('line_number');
        setLineItems(items || []);
      }

      setClaims(claimsRes.data || []);
      setVariations(varsRes.data || []);
      setAttachments(attachRes.data || []);
      setActivityLogs(logsRes.data || []);
    } finally {
      setLoading(false);
    }
  }, [projectId, currentOrganisation?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2 }).format(n);

  const logActivity = async (actionType: string, actionLabel: string, entityType?: string, entityId?: string) => {
    if (!currentOrganisation || !project) return;
    const { data: user } = await supabase.auth.getUser();
    await supabase.from('bt_activity_logs').insert({
      organisation_id: currentOrganisation.id,
      project_id: project.id,
      entity_type: entityType || 'project',
      entity_id: entityId || project.id,
      action_type: actionType,
      action_label: actionLabel,
      action_by: user.user?.id,
    });
  };

  // ---- Baseline actions ----
  const handleLockBaseline = async () => {
    if (!header || !project || !currentOrganisation) return;
    if (lineItems.length === 0) { alert('Add at least one line item before locking the baseline.'); return; }
    if (!confirm('Lock the baseline? This will make line items read-only. You cannot undo this.')) return;

    setSaving(true);
    const totalExcl = lineItems.reduce((s, i) => s + i.baseline_amount, 0);
    const gstRate = project.gst_rate || 0.15;
    const { data: user } = await supabase.auth.getUser();

    await supabase.from('bt_baseline_headers').update({
      baseline_status: 'locked',
      contract_value_excl_gst: totalExcl,
      contract_value_incl_gst: totalExcl * (1 + gstRate),
      confirmed_by: user.user?.id,
      confirmed_at: new Date().toISOString(),
    }).eq('id', header.id);

    await supabase.from('bt_projects').update({ status: 'active', baseline_locked_at: new Date().toISOString() }).eq('id', project.id);
    await logActivity('baseline_locked', `Baseline locked — ${lineItems.length} items, ${fmt(totalExcl)} excl. GST`, 'baseline', header.id);
    await loadData();
    setSaving(false);
  };

  const handleAddLineItem = async () => {
    if (!header || !currentOrganisation) return;
    if (!newLineItem?.item_title?.trim()) return;

    setSaving(true);
    const nextNum = lineItems.length + 1;
    const { error } = await supabase.from('bt_baseline_line_items').insert({
      baseline_header_id: header.id,
      organisation_id: currentOrganisation.id,
      line_number: newLineItem.line_number || String(nextNum).padStart(3, '0'),
      work_breakdown_code: newLineItem.work_breakdown_code || null,
      trade_category: newLineItem.trade_category || null,
      location: newLineItem.location || null,
      area_or_zone: newLineItem.area_or_zone || null,
      item_title: newLineItem.item_title,
      item_description: newLineItem.item_description || null,
      unit: newLineItem.unit || 'No.',
      baseline_quantity: newLineItem.baseline_quantity || 0,
      baseline_rate: newLineItem.baseline_rate || 0,
      claim_method: newLineItem.claim_method || 'quantity_based',
      display_order: nextNum,
    });

    if (!error) {
      await logActivity('line_item_added', `Line item added: ${newLineItem.item_title}`, 'baseline_line', header.id);
      setNewLineItem(null);
      await loadData();
    }
    setSaving(false);
  };

  const handleDeleteLineItem = async (id: string) => {
    if (!confirm('Remove this line item?')) return;
    await supabase.from('bt_baseline_line_items').delete().eq('id', id);
    await logActivity('line_item_removed', 'Line item removed', 'baseline_line', id);
    await loadData();
  };

  // ---- Claim actions ----
  const handleCreateClaim = async () => {
    if (!project || !header || !currentOrganisation) return;
    const nextNo = claims.length + 1;
    const now = new Date();
    const monthStr = now.toLocaleString('en-NZ', { month: 'long', year: 'numeric' });
    const previousTotal = claims.length > 0 ? (claims[0].previous_claimed_total + claims[0].current_claim_subtotal) : 0;

    const { data: claim, error } = await supabase.from('bt_claim_periods').insert({
      project_id: project.id,
      baseline_header_id: header.id,
      organisation_id: currentOrganisation.id,
      claim_no: nextNo,
      claim_period_name: `PC${nextNo} — ${monthStr}`,
      status: 'draft',
      previous_claimed_total: previousTotal,
      current_claim_subtotal: 0,
      approved_variations_total: variations.filter((v) => v.status === 'approved').reduce((s, v) => s + (v.approved_amount || v.amount), 0),
      gross_claim: 0,
      retention_amount: 0,
      net_before_gst: 0,
      gst_amount: 0,
      total_this_claim_incl_gst: 0,
    }).select().single();

    if (!error && claim) {
      await logActivity('claim_created', `Claim PC${nextNo} created`, 'claim', claim.id);
      onNavigate('bt-claim-detail', claim.id);
    }
  };

  // ---- Variation actions ----
  const handleAddVariation = async () => {
    if (!project || !header || !currentOrganisation) return;
    if (!newVariation?.title?.trim()) return;

    setSaving(true);
    const nextVONum = variations.length + 1;
    const { error } = await supabase.from('bt_variations').insert({
      project_id: project.id,
      baseline_header_id: header.id,
      organisation_id: currentOrganisation.id,
      variation_reference: newVariation.variation_reference || `VO-${String(nextVONum).padStart(3, '0')}`,
      title: newVariation.title,
      description: newVariation.description || null,
      variation_type: newVariation.variation_type || 'addition',
      status: 'draft',
      quantity: newVariation.quantity || 0,
      rate: newVariation.rate || 0,
      amount: newVariation.amount || 0,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    });

    if (!error) {
      await logActivity('variation_created', `Variation ${newVariation.variation_reference || `VO-${String(nextVONum).padStart(3, '0')}`} created`, 'variation');
      setNewVariation(null);
      await loadData();
    }
    setSaving(false);
  };

  const handleExportBaseline = async () => {
    if (!project || !header) return;
    setExportingBaseline(true);
    try {
      const blob = await exportBaselineSnapshot(project, header, lineItems, variations);
      downloadBlob(blob, `BASELINE_SNAPSHOT_${project.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
      await logActivity('baseline_exported', 'Baseline snapshot exported to Excel', 'baseline', header.id);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExportingBaseline(false);
    }
  };

  const handleExportProgress = async () => {
    if (!project) return;
    const claimedMap = new Map<string, number>();
    lineItems.forEach((item) => {
      const total = claims.reduce((s, claim) => {
        return s;
      }, 0);
      claimedMap.set(item.id, total);
    });
    const blob = await exportProgressSummary(project, lineItems, claimedMap);
    downloadBlob(blob, `PROGRESS_SUMMARY_${project.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-400">Project not found</p>
        <button onClick={() => onNavigate('bt-projects')} className="mt-4 text-cyan-400 text-sm">Back to projects</button>
      </div>
    );
  }

  const baselineLocked = header?.baseline_status === 'locked';
  const contractValue = header?.contract_value_excl_gst || lineItems.reduce((s, i) => s + i.baseline_amount, 0);
  const latestClaim = claims[0];
  const totalClaimedToDate = latestClaim ? latestClaim.previous_claimed_total + latestClaim.current_claim_subtotal : 0;
  const remaining = contractValue - totalClaimedToDate;
  const approvedVariationsTotal = variations.filter((v) => v.status === 'approved').reduce((s, v) => s + (v.approved_amount || v.amount), 0);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'baseline', label: 'Baseline', icon: List },
    { id: 'progress', label: 'Progress', icon: TrendingUp },
    { id: 'claims', label: 'Claims', icon: FileText },
    { id: 'variations', label: 'Variations', icon: RefreshCw },
    { id: 'attachments', label: 'Attachments', icon: Paperclip },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-800/60">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('bt-projects')}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-50">{project.project_name}</h1>
                {baselineLocked && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-300 border border-emerald-700">
                    <Lock size={10} /> Baseline Locked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {project.client_name && `${project.client_name} | `}
                {project.contract_reference && `Ref: ${project.contract_reference} | `}
                {project.main_contractor_name && project.main_contractor_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!baselineLocked && header && lineItems.length > 0 && (
              <button
                onClick={handleLockBaseline}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-medium transition-colors"
              >
                <Lock size={14} /> Lock Baseline
              </button>
            )}
            <button
              onClick={handleExportBaseline}
              disabled={exportingBaseline || lineItems.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
            >
              {exportingBaseline ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" /> : <FileSpreadsheet size={14} />}
              Export Baseline
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-cyan-900/60 text-cyan-200 border border-cyan-700/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ======== OVERVIEW TAB ======== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {[
                { label: 'Contract Value', value: fmt(contractValue), color: 'text-blue-400', sub: 'excl. GST' },
                { label: 'Retention', value: `${header?.retention_percent || project.retention_percent}%`, color: 'text-amber-400', sub: `${fmt(contractValue * (header?.retention_percent || project.retention_percent) / 100)} held` },
                { label: 'Claimed to Date', value: fmt(totalClaimedToDate), color: 'text-cyan-400', sub: `${contractValue > 0 ? Math.round(totalClaimedToDate / contractValue * 100) : 0}% of contract` },
                { label: 'Remaining', value: fmt(remaining), color: remaining >= 0 ? 'text-slate-300' : 'text-red-400', sub: '' },
                { label: 'Approved VOs', value: fmt(approvedVariationsTotal), color: 'text-emerald-400', sub: `${variations.filter((v) => v.status === 'approved').length} variations` },
                { label: 'Claim Count', value: claims.length, color: 'text-slate-300', sub: latestClaim ? `Latest: PC${latestClaim.claim_no}` : 'No claims yet' },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                  <p className="text-xs text-slate-400 mb-1">{card.label}</p>
                  <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
                  {card.sub && <p className="text-xs text-slate-500 mt-1">{card.sub}</p>}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Project Info</h3>
                <dl className="space-y-2">
                  {[
                    ['Status', project.status.replace(/_/g, ' ').toUpperCase()],
                    ['Claim Frequency', project.claim_frequency],
                    ['Payment Terms', `${project.payment_terms_days} days`],
                    ['Start Date', project.start_date || '—'],
                    ['End Date', project.end_date || '—'],
                    ['GST Rate', `${(project.gst_rate * 100).toFixed(0)}%`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="text-slate-300 font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-5">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Baseline Status</h3>
                <div className="flex items-center gap-2 mb-4">
                  {baselineLocked ? (
                    <CheckCircle size={16} className="text-emerald-400" />
                  ) : (
                    <Unlock size={16} className="text-amber-400" />
                  )}
                  <span className={`text-sm font-medium ${baselineLocked ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {baselineLocked ? 'Baseline Locked' : 'Baseline Not Locked'}
                  </span>
                </div>
                <dl className="space-y-2">
                  {[
                    ['Line Items', lineItems.length],
                    ['Baseline Ref', header?.baseline_reference || '—'],
                    ['Version', header?.baseline_version || 1],
                    ['Confirmed At', header?.confirmed_at ? new Date(header.confirmed_at).toLocaleDateString('en-NZ') : '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="text-slate-300 font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        )}

        {/* ======== BASELINE TAB ======== */}
        {activeTab === 'baseline' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-200">Baseline Line Items</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {lineItems.length} items | {fmt(lineItems.reduce((s, i) => s + i.baseline_amount, 0))} total
                  {baselineLocked && <span className="ml-2 text-emerald-400">• Locked (read-only)</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!baselineLocked && (
                  <button
                    onClick={() => setNewLineItem({ unit: 'No.', baseline_quantity: 1, baseline_rate: 0, claim_method: 'quantity_based' })}
                    className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-medium transition-colors"
                  >
                    <Plus size={14} /> Add Line
                  </button>
                )}
                <button
                  onClick={handleExportBaseline}
                  disabled={exportingBaseline || lineItems.length === 0}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Download size={14} /> Export
                </button>
              </div>
            </div>

            {/* New line item form */}
            {newLineItem && (
              <div className="rounded-xl border border-cyan-700/50 bg-cyan-900/10 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-cyan-300">New Line Item</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Line No', key: 'line_number' as keyof BTBaselineLineItem },
                    { label: 'WBS Code', key: 'work_breakdown_code' as keyof BTBaselineLineItem },
                    { label: 'Trade Category', key: 'trade_category' as keyof BTBaselineLineItem },
                    { label: 'Location', key: 'location' as keyof BTBaselineLineItem },
                  ].map(({ label, key }) => (
                    <div key={String(key)}>
                      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                      <input
                        type="text"
                        value={(newLineItem[key] as string) || ''}
                        onChange={(e) => setNewLineItem((n) => ({ ...n, [key]: e.target.value }))}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="col-span-2 md:col-span-1">
                    <label className="text-xs text-slate-400 mb-1 block">Item Title *</label>
                    <input
                      type="text"
                      value={newLineItem.item_title || ''}
                      onChange={(e) => setNewLineItem((n) => ({ ...n, item_title: e.target.value }))}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Unit</label>
                    <input
                      type="text"
                      value={newLineItem.unit || 'No.'}
                      onChange={(e) => setNewLineItem((n) => ({ ...n, unit: e.target.value }))}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Qty</label>
                    <input
                      type="number"
                      value={newLineItem.baseline_quantity || 0}
                      onChange={(e) => setNewLineItem((n) => ({ ...n, baseline_quantity: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Rate ($)</label>
                    <input
                      type="number"
                      value={newLineItem.baseline_rate || 0}
                      onChange={(e) => setNewLineItem((n) => ({ ...n, baseline_rate: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Claim Method</label>
                    <select
                      value={newLineItem.claim_method || 'quantity_based'}
                      onChange={(e) => setNewLineItem((n) => ({ ...n, claim_method: e.target.value as BTClaimMethod }))}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="quantity_based">Quantity Based</option>
                      <option value="percent_based">Percent Based</option>
                      <option value="milestone_based">Milestone Based</option>
                      <option value="manual_value">Manual Value</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleAddLineItem} disabled={saving} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-medium">
                    {saving ? 'Saving...' : 'Add Line'}
                  </button>
                  <button onClick={() => setNewLineItem(null)} className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs">Cancel</button>
                </div>
              </div>
            )}

            {lineItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center">
                <List size={24} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">No line items yet</p>
                {!baselineLocked && (
                  <button
                    onClick={() => setNewLineItem({ unit: 'No.', baseline_quantity: 1, baseline_rate: 0, claim_method: 'quantity_based' })}
                    className="mt-3 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1"
                  >
                    <Plus size={13} /> Add First Line
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-800/60 border-b border-slate-700/60">
                      {['Line', 'WBS', 'Trade', 'Location', 'Title', 'Unit', 'Qty', 'Rate', 'Amount', 'Method', !baselineLocked ? 'Actions' : ''].filter(Boolean).map((h) => (
                        <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, idx) => (
                      <tr key={item.id} className={`border-b border-slate-800/40 ${idx % 2 === 0 ? '' : 'bg-slate-800/10'} hover:bg-slate-800/20`}>
                        <td className="px-3 py-2 text-slate-400 font-mono">{item.line_number}</td>
                        <td className="px-3 py-2 text-slate-500">{item.work_breakdown_code || '—'}</td>
                        <td className="px-3 py-2 text-slate-400">{item.trade_category || '—'}</td>
                        <td className="px-3 py-2 text-slate-400">{item.location || '—'}</td>
                        <td className="px-3 py-2 text-slate-200 font-medium max-w-xs truncate">{item.item_title}</td>
                        <td className="px-3 py-2 text-slate-400">{item.unit}</td>
                        <td className="px-3 py-2 text-slate-300 text-right">{item.baseline_quantity.toLocaleString('en-NZ', { maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-slate-300 text-right">{fmt(item.baseline_rate)}</td>
                        <td className="px-3 py-2 text-cyan-400 text-right font-semibold">{fmt(item.baseline_amount)}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-300">
                            {item.claim_method.replace(/_/g, ' ')}
                          </span>
                        </td>
                        {!baselineLocked && (
                          <td className="px-3 py-2">
                            <button onClick={() => handleDeleteLineItem(item.id)} className="text-red-400 hover:text-red-300">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="bg-slate-800/40 border-t border-slate-700">
                      <td colSpan={baselineLocked ? 7 : 7} className="px-3 py-2 text-right font-bold text-slate-300 text-xs">TOTAL</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right font-bold text-cyan-400">
                        {fmt(lineItems.reduce((s, i) => s + i.baseline_amount, 0))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======== CLAIMS TAB ======== */}
        {activeTab === 'claims' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-200">Progress Claims</h2>
                <p className="text-xs text-slate-500 mt-0.5">{claims.length} claim period{claims.length !== 1 ? 's' : ''}</p>
              </div>
              {baselineLocked && (
                <button
                  onClick={handleCreateClaim}
                  className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-medium transition-colors"
                >
                  <Plus size={14} /> New Claim
                </button>
              )}
            </div>

            {!baselineLocked && (
              <div className="rounded-xl border border-amber-700/50 bg-amber-900/10 px-4 py-3 flex items-start gap-2">
                <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">Baseline must be locked before you can create progress claims.</p>
              </div>
            )}

            {claims.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center">
                <FileText size={24} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">No claims yet</p>
                {baselineLocked && (
                  <button onClick={handleCreateClaim} className="mt-3 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1">
                    <Plus size={13} /> Create PC1
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-800/60 border-b border-slate-700/60">
                      {['Claim', 'Period', 'Status', 'Prev Claimed', 'This Claim', 'Retention', 'GST', 'Total incl GST', 'Certified', 'Paid', 'Actions'].map((h) => (
                        <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim, idx) => (
                      <tr key={claim.id} className={`border-b border-slate-800/40 ${idx % 2 === 0 ? '' : 'bg-slate-800/10'} hover:bg-slate-800/20`}>
                        <td className="px-3 py-3 font-semibold text-slate-200">PC{claim.claim_no}</td>
                        <td className="px-3 py-3">
                          <div>
                            <p className="text-slate-300 text-xs font-medium">{claim.claim_period_name}</p>
                            {claim.period_start && claim.period_end && (
                              <p className="text-slate-500 text-xs">
                                {new Date(claim.period_start).toLocaleDateString('en-NZ')} — {new Date(claim.period_end).toLocaleDateString('en-NZ')}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${claimStatusColor[claim.status]}`}>
                            {claim.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-400 text-xs">{fmt(claim.previous_claimed_total)}</td>
                        <td className="px-3 py-3 text-cyan-400 text-xs font-medium">{fmt(claim.current_claim_subtotal)}</td>
                        <td className="px-3 py-3 text-red-400 text-xs">({fmt(claim.retention_amount)})</td>
                        <td className="px-3 py-3 text-slate-400 text-xs">{fmt(claim.gst_amount)}</td>
                        <td className="px-3 py-3 text-emerald-400 text-xs font-semibold">{fmt(claim.total_this_claim_incl_gst)}</td>
                        <td className="px-3 py-3 text-xs">{claim.certified_amount !== null ? <span className="text-blue-400">{fmt(claim.certified_amount)}</span> : <span className="text-slate-600">Pending</span>}</td>
                        <td className="px-3 py-3 text-xs">{claim.paid_amount !== null ? <span className="text-green-400">{fmt(claim.paid_amount)}</span> : <span className="text-slate-600">—</span>}</td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => onNavigate('bt-claim-detail', claim.id)}
                            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                          >
                            <Eye size={12} /> Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======== VARIATIONS TAB ======== */}
        {activeTab === 'variations' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-200">Variation Register</h2>
                <p className="text-xs text-slate-500 mt-0.5">{variations.length} variation{variations.length !== 1 ? 's' : ''}</p>
              </div>
              <button
                onClick={() => setNewVariation({ variation_type: 'addition', status: 'draft', quantity: 0, rate: 0, amount: 0 })}
                className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-medium"
              >
                <Plus size={14} /> New Variation
              </button>
            </div>

            {newVariation && (
              <div className="rounded-xl border border-cyan-700/50 bg-cyan-900/10 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-cyan-300">New Variation</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">VO Reference</label>
                    <input type="text" value={newVariation.variation_reference || ''} onChange={(e) => setNewVariation((n) => ({ ...n, variation_reference: e.target.value }))}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 mb-1 block">Title *</label>
                    <input type="text" value={newVariation.title || ''} onChange={(e) => setNewVariation((n) => ({ ...n, title: e.target.value }))}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Type</label>
                    <select value={newVariation.variation_type || 'addition'} onChange={(e) => setNewVariation((n) => ({ ...n, variation_type: e.target.value as BTVariationType }))}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500">
                      <option value="addition">Addition</option>
                      <option value="omission">Omission</option>
                      <option value="substitution">Substitution</option>
                      <option value="rework">Rework</option>
                      <option value="rate_change">Rate Change</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Amount ($)</label>
                    <input type="number" value={newVariation.amount || 0} onChange={(e) => setNewVariation((n) => ({ ...n, amount: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 mb-1 block">Description</label>
                    <textarea value={newVariation.description || ''} onChange={(e) => setNewVariation((n) => ({ ...n, description: e.target.value }))} rows={2}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 resize-none" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddVariation} disabled={saving} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-medium">
                    {saving ? 'Saving...' : 'Add Variation'}
                  </button>
                  <button onClick={() => setNewVariation(null)} className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs">Cancel</button>
                </div>
              </div>
            )}

            {variations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center">
                <RefreshCw size={24} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">No variations recorded</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-800/60 border-b border-slate-700/60">
                      {['Ref', 'Title', 'Type', 'Status', 'Amount', 'Approved $', 'Claimed to Date', 'Date'].map((h) => (
                        <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {variations.map((v, idx) => (
                      <tr key={v.id} className={`border-b border-slate-800/40 ${idx % 2 === 0 ? '' : 'bg-slate-800/10'}`}>
                        <td className="px-3 py-3 text-slate-300 font-mono text-xs">{v.variation_reference}</td>
                        <td className="px-3 py-3 text-slate-200 text-xs font-medium">{v.title}</td>
                        <td className="px-3 py-3 text-slate-400 text-xs capitalize">{v.variation_type.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${varStatusColor[v.status]}`}>
                            {v.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-300 text-xs">{fmt(v.amount)}</td>
                        <td className="px-3 py-3 text-xs">
                          {v.approved_amount !== null ? <span className="text-emerald-400">{fmt(v.approved_amount)}</span> : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-3 py-3 text-cyan-400 text-xs">{fmt(v.claimed_to_date)}</td>
                        <td className="px-3 py-3 text-slate-500 text-xs">{new Date(v.created_at).toLocaleDateString('en-NZ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======== PROGRESS TAB ======== */}
        {activeTab === 'progress' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-200">Progress Tracking</h2>
              <button onClick={handleExportProgress} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-medium">
                <Download size={14} /> Export Progress
              </button>
            </div>

            {lineItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center">
                <TrendingUp size={24} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">Add baseline line items first to track progress</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800/60 border-b border-slate-700/60">
                      {['Line', 'Title', 'Unit', 'Contract Qty', 'Contract $', 'Claimed to Date', 'Remaining', 'Progress'].map((h) => (
                        <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, idx) => {
                      const progressPct = item.baseline_amount > 0 ? Math.min(100, 0) : 0;
                      return (
                        <tr key={item.id} className={`border-b border-slate-800/40 ${idx % 2 === 0 ? '' : 'bg-slate-800/10'}`}>
                          <td className="px-3 py-3 text-slate-400 font-mono text-xs">{item.line_number}</td>
                          <td className="px-3 py-3 text-slate-200 text-xs font-medium">{item.item_title}</td>
                          <td className="px-3 py-3 text-slate-400 text-xs">{item.unit}</td>
                          <td className="px-3 py-3 text-slate-300 text-xs">{item.baseline_quantity.toLocaleString('en-NZ', { maximumFractionDigits: 2 })}</td>
                          <td className="px-3 py-3 text-slate-300 text-xs">{fmt(item.baseline_amount)}</td>
                          <td className="px-3 py-3 text-cyan-400 text-xs">{fmt(0)}</td>
                          <td className="px-3 py-3 text-slate-300 text-xs">{fmt(item.baseline_amount)}</td>
                          <td className="px-3 py-3 w-32">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-700 rounded-full h-1.5">
                                <div className="bg-cyan-500 h-1.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                              </div>
                              <span className="text-xs text-slate-400 w-8">{progressPct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ======== ATTACHMENTS TAB ======== */}
        {activeTab === 'attachments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-200">Attachments & Evidence</h2>
              <label className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-medium cursor-pointer transition-colors">
                <Upload size={14} />
                Upload File
                <input type="file" className="hidden" onChange={async (e) => {
                  if (!e.target.files?.length || !currentOrganisation || !project) return;
                  const file = e.target.files[0];
                  const path = `bt-attachments/${project.id}/${Date.now()}-${file.name}`;
                  const { error: upErr } = await supabase.storage.from('attachments').upload(path, file);
                  if (!upErr) {
                    const { data: user } = await supabase.auth.getUser();
                    await supabase.from('bt_attachments').insert({
                      project_id: project.id,
                      organisation_id: currentOrganisation.id,
                      entity_type: 'general',
                      file_name: file.name,
                      file_path: path,
                      file_type: file.type,
                      file_size: file.size,
                      upload_category: 'general',
                      uploaded_by: user.user?.id,
                    });
                    await loadData();
                  }
                }} />
              </label>
            </div>

            {attachments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center">
                <Paperclip size={24} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">No attachments yet</p>
                <p className="text-slate-500 text-xs mt-1">Upload photos, dockets, drawings, and other evidence</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {attachments.map((att) => (
                  <div key={att.id} className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <Paperclip size={15} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-medium truncate">{att.file_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{att.upload_category.replace(/_/g, ' ')} • {(att.file_size / 1024).toFixed(0)} KB</p>
                      <p className="text-xs text-slate-600 mt-0.5">{new Date(att.created_at).toLocaleDateString('en-NZ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======== ACTIVITY TAB ======== */}
        {activeTab === 'activity' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-200">Activity Log</h2>
            {activityLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center">
                <Activity size={24} className="mx-auto text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">No activity recorded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activityLogs.map((log) => (
                  <div key={log.id} className="rounded-xl border border-slate-700/60 bg-slate-800/20 px-4 py-3 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Activity size={13} className="text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-200">{log.action_label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {log.entity_type && <span className="text-xs text-slate-600 capitalize">{log.entity_type.replace(/_/g, ' ')}</span>}
                        <span className="text-xs text-slate-500">{new Date(log.action_at).toLocaleString('en-NZ', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
