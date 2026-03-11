import { useState, useEffect, useRef } from 'react';
import {
  ChevronRight, Plus, Trash2, RefreshCw, Upload, AlertCircle,
  Send, Download, CheckCircle, Image, X, FileSpreadsheet,
  DollarSign, Clock, FileCheck, XCircle, Info, Activity,
  CreditCard, History
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import {
  computeClaimTotals, computeLineTotal, LEGAL_NOTICE,
  type ClaimLine, type ClaimTotals
} from '../../lib/scc/paymentClaimCalculations';
import { exportPaymentClaimExcel, type ClaimHeader } from '../../lib/scc/paymentClaimExport';

interface PaymentClaim {
  id: string;
  claim_number: string;
  our_ref: string;
  internal_reference: string;
  trade: string;
  payer_company: string;
  payer_address: string;
  payer_attention: string;
  project_name: string;
  site_location: string;
  claim_period: string;
  claim_period_start: string | null;
  claim_period_end: string | null;
  payee_company: string;
  payee_address: string;
  payee_contact: string;
  submission_date: string | null;
  last_date_for_submitting: string | null;
  due_date: string | null;
  logo_url: string | null;
  retention_rate_tier1: number;
  retention_rate_tier2: number;
  retention_rate_tier3: number;
  retention_released: number;
  previous_net_claimed: number;
  net_payment_certified: number;
  bank_name: string;
  account_name: string;
  account_number: string;
  payment_notes: string;
  status: string;
}

interface ActivityLog {
  id: string;
  action_type: string;
  action_label: string;
  action_by: string | null;
  action_at: string;
}

interface Props {
  claimId: string | null;
  contractId: string | null;
  onBack: () => void;
  onSaved?: (id: string) => void;
}

type Section = 'header' | 'lines' | 'summary' | 'bank' | 'notice' | 'activity';

const FIELD = 'w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-colors';
const TEXTAREA = FIELD + ' resize-none';
const LABEL = 'text-xs text-slate-400 mb-1 block';

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n as number)) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(r: number): string {
  return `${(r * 100).toFixed(2)}%`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; next?: string; nextLabel?: string }> = {
  draft:     { label: 'Draft',     color: 'text-slate-300', bg: 'bg-slate-500/20', next: 'submitted', nextLabel: 'Submit Claim' },
  submitted: { label: 'Submitted', color: 'text-blue-300',  bg: 'bg-blue-500/20',  next: 'certified', nextLabel: 'Mark Certified' },
  certified: { label: 'Certified', color: 'text-green-300', bg: 'bg-green-500/20', next: 'paid', nextLabel: 'Mark Paid' },
  paid:      { label: 'Paid',      color: 'text-cyan-300',  bg: 'bg-cyan-500/20' },
  disputed:  { label: 'Disputed',  color: 'text-amber-300', bg: 'bg-amber-500/20', next: 'draft', nextLabel: 'Reopen' },
  cancelled: { label: 'Cancelled', color: 'text-red-300',   bg: 'bg-red-500/20',   next: 'draft', nextLabel: 'Reopen' },
};

const DEFAULT_CLAIM: Omit<PaymentClaim, 'id'> = {
  claim_number: '', our_ref: '', internal_reference: '', trade: '',
  payer_company: '', payer_address: '', payer_attention: '',
  project_name: '', site_location: '', claim_period: '',
  claim_period_start: null, claim_period_end: null,
  payee_company: '', payee_address: '', payee_contact: '',
  submission_date: null, last_date_for_submitting: null, due_date: null,
  logo_url: null,
  retention_rate_tier1: 0.05, retention_rate_tier2: 0.025, retention_rate_tier3: 0.0,
  retention_released: 0, previous_net_claimed: 0, net_payment_certified: 0,
  bank_name: '', account_name: '', account_number: '', payment_notes: '',
  status: 'draft',
};

export default function PaymentClaimForm({ claimId, contractId, onBack, onSaved }: Props) {
  const { currentOrganisation } = useOrganisation();
  const [claim, setClaim] = useState<PaymentClaim | null>(null);
  const [lines, setLines] = useState<ClaimLine[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('header');
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (claimId) {
      loadClaim(claimId);
    } else {
      setIsNew(true);
      setClaim({ id: '', ...DEFAULT_CLAIM });
      setLines([]);
      if (contractId) prefillFromContract(contractId);
    }
  }, [claimId]);

  const loadClaim = async (id: string) => {
    const [{ data: c }, { data: l }, { data: a }] = await Promise.all([
      supabase.from('payment_claims').select('*').eq('id', id).maybeSingle(),
      supabase.from('payment_claim_lines').select('*').eq('payment_claim_id', id).order('sort_order'),
      supabase.from('payment_claim_activity_logs').select('*').eq('payment_claim_id', id).order('action_at', { ascending: false }).limit(50),
    ]);
    if (c) setClaim(c);
    setLines(l || []);
    setActivity(a || []);
  };

  const prefillFromContract = async (cid: string) => {
    const { data: contract } = await supabase
      .from('scc_contracts')
      .select('*')
      .eq('id', cid)
      .maybeSingle();
    if (!contract) return;
    setClaim(prev => prev ? {
      ...prev,
      project_name: contract.contract_name || '',
      payer_company: contract.main_contractor_company || '',
      payer_attention: contract.main_contractor_contact || '',
      payee_company: contract.subcontractor_company || '',
      retention_rate_tier1: contract.retention_percentage ? contract.retention_percentage / 100 : 0.05,
    } : null);
  };

  const logActivity = async (claimId: string, type: string, label: string) => {
    await supabase.from('payment_claim_activity_logs').insert({
      payment_claim_id: claimId,
      action_type: type,
      action_label: label,
      action_by: (await supabase.auth.getUser()).data.user?.id,
    });
  };

  const buildTotals = () => {
    if (!claim) return null;
    return computeClaimTotals(
      lines,
      claim.retention_rate_tier1,
      claim.retention_rate_tier2,
      claim.retention_rate_tier3,
      claim.retention_released,
      claim.previous_net_claimed,
      claim.net_payment_certified
    );
  };

  const buildSavePayload = (totals: ClaimTotals) => ({
    claim_number: claim!.claim_number,
    our_ref: claim!.our_ref,
    internal_reference: claim!.internal_reference,
    trade: claim!.trade,
    payer_company: claim!.payer_company,
    payer_address: claim!.payer_address,
    payer_attention: claim!.payer_attention,
    project_name: claim!.project_name,
    site_location: claim!.site_location,
    claim_period: claim!.claim_period,
    claim_period_start: claim!.claim_period_start || null,
    claim_period_end: claim!.claim_period_end || null,
    payee_company: claim!.payee_company,
    payee_address: claim!.payee_address,
    payee_contact: claim!.payee_contact,
    submission_date: claim!.submission_date || null,
    last_date_for_submitting: claim!.last_date_for_submitting || null,
    due_date: claim!.due_date || null,
    logo_url: claim!.logo_url,
    retention_rate_tier1: claim!.retention_rate_tier1,
    retention_rate_tier2: claim!.retention_rate_tier2,
    retention_rate_tier3: claim!.retention_rate_tier3,
    retention_released: claim!.retention_released,
    previous_net_claimed: claim!.previous_net_claimed,
    net_payment_certified: claim!.net_payment_certified,
    bank_name: claim!.bank_name,
    account_name: claim!.account_name,
    account_number: claim!.account_number,
    payment_notes: claim!.payment_notes,
    base_total: totals.baseTotal,
    variations_total: totals.variationsTotal,
    total_c: totals.totalC,
    retention_amount: totals.retentionAmount,
    net_claim_to_date_e: totals.netClaimToDateE,
    claimed_this_period_ex_gst: totals.claimedThisPeriodExGst,
    gst_amount: totals.gstAmount,
    claimed_this_period_inc_gst: totals.claimedThisPeriodIncGst,
    amount_payable_ex_gst: totals.amountPayableExGst,
    amount_payable_inc_gst: totals.amountPayableIncGst,
  });

  const saveClaim = async (): Promise<string | null> => {
    if (!currentOrganisation?.id || !claim) return null;
    setSaving(true);
    setError(null);
    const totals = buildTotals()!;
    try {
      if (isNew || !claim.id) {
        const { data, error: err } = await supabase
          .from('payment_claims')
          .insert({ organisation_id: currentOrganisation.id, contract_id: contractId || null, status: 'draft', ...buildSavePayload(totals) })
          .select().single();
        if (err || !data) throw err || new Error('Failed to create');
        const newId = data.id;
        setClaim(prev => prev ? { ...prev, id: newId } : null);
        setIsNew(false);
        if (lines.length > 0) {
          await supabase.from('payment_claim_lines').insert(
            lines.map(l => ({ ...l, id: undefined, payment_claim_id: newId, organisation_id: currentOrganisation.id }))
          );
        }
        await logActivity(newId, 'created', 'Payment claim created');
        if (onSaved) onSaved(newId);
        return newId;
      } else {
        await supabase.from('payment_claims').update({ ...buildSavePayload(totals), updated_at: new Date().toISOString() }).eq('id', claim.id);
        await logActivity(claim.id, 'saved', 'Claim saved');
        if (onSaved) onSaved(claim.id);
        return claim.id;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (newStatus: string) => {
    const savedId = await saveClaim();
    const id = savedId || claim?.id;
    if (!id) return;
    await supabase.from('payment_claims').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
    setClaim(prev => prev ? { ...prev, status: newStatus } : null);
    await logActivity(id, 'status_change', `Status changed to ${newStatus}`);
    const { data: a } = await supabase.from('payment_claim_activity_logs').select('*').eq('payment_claim_id', id).order('action_at', { ascending: false }).limit(50);
    setActivity(a || []);
  };

  const disputeClaim = async () => {
    const savedId = await saveClaim();
    const id = savedId || claim?.id;
    if (!id) return;
    await supabase.from('payment_claims').update({ status: 'disputed', updated_at: new Date().toISOString() }).eq('id', id);
    setClaim(prev => prev ? { ...prev, status: 'disputed' } : null);
    await logActivity(id, 'disputed', 'Claim marked as disputed');
  };

  const handleExcelExport = async () => {
    if (!claim) return;
    setExporting(true);
    try {
      const totals = buildTotals()!;
      const header: ClaimHeader = {
        claim_number: claim.claim_number,
        our_ref: claim.our_ref,
        internal_reference: claim.internal_reference,
        trade: claim.trade,
        project_name: claim.project_name,
        site_location: claim.site_location,
        claim_period: claim.claim_period,
        claim_period_start: claim.claim_period_start,
        claim_period_end: claim.claim_period_end,
        submission_date: claim.submission_date,
        last_date_for_submitting: claim.last_date_for_submitting,
        due_date: claim.due_date,
        payer_company: claim.payer_company,
        payer_attention: claim.payer_attention,
        payer_address: claim.payer_address,
        payee_company: claim.payee_company,
        payee_contact: claim.payee_contact,
        payee_address: claim.payee_address,
        bank_name: claim.bank_name,
        account_name: claim.account_name,
        account_number: claim.account_number,
        payment_notes: claim.payment_notes,
        retention_rate_tier1: claim.retention_rate_tier1,
        retention_rate_tier2: claim.retention_rate_tier2,
        retention_rate_tier3: claim.retention_rate_tier3,
        retention_released: claim.retention_released,
        previous_net_claimed: claim.previous_net_claimed,
        net_payment_certified: claim.net_payment_certified,
        status: claim.status,
      };
      await exportPaymentClaimExcel(header, lines, totals);
      if (claim.id) {
        await supabase.from('payment_claims').update({ exported_excel_at: new Date().toISOString() }).eq('id', claim.id);
        await logActivity(claim.id, 'exported', 'Exported to Excel');
      }
    } catch (e) {
      setError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handlePdfPrint = () => {
    window.print();
  };

  const uploadLogo = async (file: File) => {
    if (!currentOrganisation?.id) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${currentOrganisation.id}/${Date.now()}.${ext}`;
    const { data, error: err } = await supabase.storage.from('payment-claim-logos').upload(path, file, { upsert: true });
    if (!err && data) {
      const { data: urlData } = supabase.storage.from('payment-claim-logos').getPublicUrl(data.path);
      setClaim(prev => prev ? { ...prev, logo_url: urlData.publicUrl } : null);
    }
    setUploading(false);
  };

  const addLine = (type: 'base' | 'variation') => {
    const existing = lines.filter(l => l.line_type === type);
    const prefix = type === 'base' ? '1' : 'VO';
    const itemNo = type === 'base' ? `${existing.length + 1}.1` : `${prefix}-${String(existing.length + 1).padStart(2, '0')}`;
    setLines(prev => [...prev, {
      id: `temp-${Date.now()}-${Math.random()}`,
      line_type: type, item_no: itemNo, description: '',
      qty: 1, unit: 'Sum', rate: null, total: 0,
      claim_to_date_pct: 0, claim_to_date_amount: 0,
      previous_claimed_value: 0, sort_order: prev.length,
    }]);
  };

  const updateLine = async (id: string, updates: Partial<ClaimLine & { previous_claimed_value: number }>) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, ...updates };
      if ('claim_to_date_pct' in updates || 'total' in updates) {
        updated.claim_to_date_amount = updated.total * (updated.claim_to_date_pct / 100);
      }
      if ('qty' in updates || 'rate' in updates) {
        updated.total = computeLineTotal(updated.qty, updated.rate, updated.total);
        updated.claim_to_date_amount = updated.total * (updated.claim_to_date_pct / 100);
      }
      return updated;
    }));
    if (!id.startsWith('temp-') && claim?.id) {
      await supabase.from('payment_claim_lines').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    }
  };

  const removeLine = async (id: string) => {
    setLines(prev => prev.filter(l => l.id !== id));
    if (!id.startsWith('temp-')) {
      await supabase.from('payment_claim_lines').delete().eq('id', id);
    }
  };

  const set = (key: keyof PaymentClaim, value: unknown) => {
    setClaim(prev => prev ? { ...prev, [key]: value } : null);
  };

  if (!claim) {
    return <div className="flex items-center justify-center py-16"><RefreshCw size={24} className="animate-spin text-cyan-400" /></div>;
  }

  const baselines = lines.filter(l => l.line_type === 'base');
  const variations = lines.filter(l => l.line_type === 'variation');
  const totals = buildTotals()!;
  const isEditable = claim.status === 'draft';
  const statusCfg = STATUS_CONFIG[claim.status] || STATUS_CONFIG.draft;

  const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
    { id: 'header', label: 'Claim Details', icon: FileCheck },
    { id: 'lines', label: `Line Items (${lines.length})`, icon: DollarSign },
    { id: 'summary', label: 'Summary', icon: Info },
    { id: 'bank', label: 'Bank Details', icon: CreditCard },
    { id: 'notice', label: 'S.20 Notice', icon: AlertCircle },
    { id: 'activity', label: 'Activity', icon: History },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Breadcrumb + Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1 transition-colors">
          <ChevronRight size={16} className="rotate-180" /> Back to Claims
        </button>
        <span className="text-slate-700">/</span>
        <span className="text-white font-medium">{claim.claim_number || 'New Payment Claim'}</span>
        <span className={`text-xs px-2 py-1 rounded-lg font-medium ${statusCfg.bg} ${statusCfg.color}`}>
          {statusCfg.label}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {isEditable && (
            <button
              onClick={() => saveClaim()}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              Save Draft
            </button>
          )}
          <button
            onClick={handleExcelExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
            title="Export to Excel"
          >
            {exporting ? <RefreshCw size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            Excel
          </button>
          <button
            onClick={handlePdfPrint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
            title="Print / Save as PDF"
          >
            <Download size={13} />
            PDF
          </button>
          {isEditable && (
            <>
              <button
                onClick={() => disputeClaim()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-700/50 hover:bg-amber-700 text-amber-300 rounded-lg text-sm transition-colors"
              >
                <AlertCircle size={13} /> Dispute
              </button>
              {statusCfg.next && (
                <button
                  onClick={() => advanceStatus(statusCfg.next!)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <Send size={13} /> {statusCfg.nextLabel}
                </button>
              )}
            </>
          )}
          {!isEditable && statusCfg.next && (
            <button
              onClick={() => advanceStatus(statusCfg.next!)}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Send size={13} /> {statusCfg.nextLabel}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto bg-slate-800/40 border border-slate-700/50 rounded-xl p-1.5">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeSection === s.id
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/40'
            }`}
          >
            <s.icon size={12} />
            {s.label}
          </button>
        ))}
      </div>

      {/* ─── SECTION: CLAIM DETAILS ──────────────────────────────────────────── */}
      {activeSection === 'header' && (
        <div className="space-y-4">
          {/* Header band */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="bg-slate-900/60 border-b border-slate-700/50 px-6 py-5 flex items-center gap-6">
              <div>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
                {claim.logo_url ? (
                  <div className="relative group">
                    <img src={claim.logo_url} alt="Logo" className="h-12 object-contain rounded" />
                    {isEditable && (
                      <button onClick={() => set('logo_url', null)} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={10} className="text-white" />
                      </button>
                    )}
                  </div>
                ) : isEditable ? (
                  <button onClick={() => logoInputRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-600 rounded-lg text-slate-500 hover:text-slate-300 hover:border-slate-500 text-xs transition-colors">
                    {uploading ? <RefreshCw size={12} className="animate-spin" /> : <Image size={12} />}
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                  </button>
                ) : (
                  <div className="w-16 h-10 bg-slate-700/40 rounded flex items-center justify-center"><Image size={16} className="text-slate-600" /></div>
                )}
              </div>
              <div className="text-center flex-1">
                <h1 className="text-2xl font-bold text-white tracking-widest">PAYMENT CLAIM</h1>
                <p className="text-xs text-slate-400 mt-0.5">Construction Contracts Act 2002 — Section 20 / Form 1</p>
              </div>
              <div className="text-right space-y-2 min-w-[160px]">
                <div>
                  <label className={LABEL}>Claim No *</label>
                  {isEditable ? <input type="text" value={claim.claim_number} onChange={e => set('claim_number', e.target.value)} className={FIELD} placeholder="PC-001" /> : <span className="text-white font-bold text-lg">{claim.claim_number || '—'}</span>}
                </div>
                <div>
                  <label className={LABEL}>Our Ref</label>
                  {isEditable ? <input type="text" value={claim.our_ref} onChange={e => set('our_ref', e.target.value)} className={FIELD} placeholder="Internal reference" /> : <span className="text-white text-sm">{claim.our_ref || '—'}</span>}
                </div>
              </div>
            </div>

            {/* Core claim details */}
            <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-700/50">
              {[
                { label: 'Trade / Discipline', key: 'trade' as const, placeholder: 'e.g. Passive Fire Protection' },
                { label: 'Internal Reference', key: 'internal_reference' as const, placeholder: 'Optional internal ref' },
                { label: 'Claim Period Label', key: 'claim_period' as const, placeholder: 'e.g. March 2026' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className={LABEL}>{label}</label>
                  {isEditable ? <input type="text" value={(claim[key] as string) || ''} onChange={e => set(key, e.target.value)} className={FIELD} placeholder={placeholder} /> : <p className="text-white text-sm">{(claim[key] as string) || '—'}</p>}
                </div>
              ))}
              <div>
                <label className={LABEL}>Period Start</label>
                {isEditable ? <input type="date" value={claim.claim_period_start || ''} onChange={e => set('claim_period_start', e.target.value || null)} className={FIELD} /> : <p className="text-white text-sm">{claim.claim_period_start || '—'}</p>}
              </div>
              <div>
                <label className={LABEL}>Period End</label>
                {isEditable ? <input type="date" value={claim.claim_period_end || ''} onChange={e => set('claim_period_end', e.target.value || null)} className={FIELD} /> : <p className="text-white text-sm">{claim.claim_period_end || '—'}</p>}
              </div>
              <div>
                <label className={LABEL}>Last Date for Submitting</label>
                {isEditable ? <input type="date" value={claim.last_date_for_submitting || ''} onChange={e => set('last_date_for_submitting', e.target.value || null)} className={FIELD} /> : <p className="text-white text-sm">{claim.last_date_for_submitting || '—'}</p>}
              </div>
              <div>
                <label className={LABEL}>Due Date for Payment *</label>
                {isEditable ? <input type="date" value={claim.due_date || ''} onChange={e => set('due_date', e.target.value || null)} className={FIELD} /> : <p className="text-white text-sm">{claim.due_date || '—'}</p>}
              </div>
              <div>
                <label className={LABEL}>Submission Date</label>
                {isEditable ? <input type="date" value={claim.submission_date || ''} onChange={e => set('submission_date', e.target.value || null)} className={FIELD} /> : <p className="text-white text-sm">{claim.submission_date || '—'}</p>}
              </div>
            </div>

            {/* TO / FROM */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-700/50">
              <div className="px-6 py-5 space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">TO — Payment Claim To (Payer)</h3>
                {([
                  { label: 'Company / Name *', key: 'payer_company', placeholder: 'e.g. Fletcher Construction' },
                  { label: 'Attention', key: 'payer_attention', placeholder: 'Contract manager name' },
                  { label: 'Project Name', key: 'project_name', placeholder: 'Full project name' },
                  { label: 'Site Location', key: 'site_location', placeholder: 'Site address or description' },
                ] as { label: string; key: keyof PaymentClaim; placeholder: string }[]).map(({ label, key, placeholder }) => (
                  <div key={key as string}>
                    <label className={LABEL}>{label}</label>
                    {isEditable ? <input type="text" value={(claim[key] as string) || ''} onChange={e => set(key, e.target.value)} className={FIELD} placeholder={placeholder} /> : <p className="text-white text-sm">{(claim[key] as string) || '—'}</p>}
                  </div>
                ))}
                <div>
                  <label className={LABEL}>Payer Address</label>
                  {isEditable ? <textarea rows={2} value={claim.payer_address} onChange={e => set('payer_address', e.target.value)} className={TEXTAREA} placeholder="Street address, suburb, city" /> : <p className="text-white text-sm whitespace-pre-line">{claim.payer_address || '—'}</p>}
                </div>
              </div>
              <div className="px-6 py-5 space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">FROM — Payment Claim From (Payee)</h3>
                {([
                  { label: 'Company / Name *', key: 'payee_company', placeholder: 'e.g. Optimal Fire Limited' },
                  { label: 'Contact Person', key: 'payee_contact', placeholder: 'Name and phone' },
                ] as { label: string; key: keyof PaymentClaim; placeholder: string }[]).map(({ label, key, placeholder }) => (
                  <div key={key as string}>
                    <label className={LABEL}>{label}</label>
                    {isEditable ? <input type="text" value={(claim[key] as string) || ''} onChange={e => set(key, e.target.value)} className={FIELD} placeholder={placeholder} /> : <p className="text-white text-sm">{(claim[key] as string) || '—'}</p>}
                  </div>
                ))}
                <div>
                  <label className={LABEL}>Payee Address</label>
                  {isEditable ? <textarea rows={2} value={claim.payee_address} onChange={e => set('payee_address', e.target.value)} className={TEXTAREA} placeholder="Street address, suburb, city" /> : <p className="text-white text-sm whitespace-pre-line">{claim.payee_address || '—'}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECTION: LINE ITEMS ─────────────────────────────────────────────── */}
      {activeSection === 'lines' && (
        <div className="space-y-4">
          {/* Base contract */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">A — Base Contract</h3>
                <p className="text-xs text-slate-500 mt-0.5">Original contracted work items</p>
              </div>
              {isEditable && (
                <button onClick={() => addLine('base')} className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 rounded-lg transition-all">
                  <Plus size={13} /> Add Line
                </button>
              )}
            </div>
            <div className="px-4 py-4">
              <ClaimLinesTable lines={baselines} isEditable={isEditable} onUpdate={updateLine} onRemove={removeLine} showPrevious />
            </div>
            <div className="px-6 py-3 bg-slate-900/30 border-t border-slate-700/30 flex items-center justify-end gap-6 text-sm">
              <span className="text-slate-400 text-xs">TOTAL BASE CONTRACT (A)</span>
              <span className="text-white font-bold">{fmt(totals.baseTotal)}</span>
            </div>
          </div>

          {/* Variations */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">B — Variations</h3>
                <p className="text-xs text-slate-500 mt-0.5">Approved variation orders included in this claim</p>
              </div>
              {isEditable && (
                <button onClick={() => addLine('variation')} className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 rounded-lg transition-all">
                  <Plus size={13} /> Add Variation
                </button>
              )}
            </div>
            <div className="px-4 py-4">
              <ClaimLinesTable lines={variations} isEditable={isEditable} onUpdate={updateLine} onRemove={removeLine} showPrevious={false} />
            </div>
            <div className="px-6 py-3 bg-slate-900/30 border-t border-slate-700/30 flex items-center justify-end gap-6 text-sm">
              <span className="text-slate-400 text-xs">TOTAL VARIATIONS (B)</span>
              <span className="text-white font-bold">{fmt(totals.variationsTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECTION: SUMMARY ────────────────────────────────────────────────── */}
      {activeSection === 'summary' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Retention rates */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-4">
            <h3 className="font-semibold text-white">Retention Rates (Tiered)</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Tier 1 (≤ $200k)', key: 'retention_rate_tier1' as const },
                { label: 'Tier 2 ($200k–$1m)', key: 'retention_rate_tier2' as const },
                { label: 'Tier 3 (> $1m)', key: 'retention_rate_tier3' as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className={LABEL}>{label}</label>
                  {isEditable ? (
                    <div className="relative">
                      <input type="number" step="0.005" min={0} max={1} value={claim[key]} onChange={e => set(key, parseFloat(e.target.value) || 0)} className={FIELD + ' pr-7'} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">dec</span>
                    </div>
                  ) : <p className="text-white text-sm">{fmtPct(claim[key] as number)}</p>}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Retentions Released ($)</label>
                {isEditable ? <input type="number" value={claim.retention_released || ''} onChange={e => set('retention_released', parseFloat(e.target.value) || 0)} className={FIELD} placeholder="0.00" /> : <p className="text-white text-sm">{fmt(claim.retention_released)}</p>}
              </div>
              <div>
                <label className={LABEL}>Less Previous Net Claimed (F)</label>
                {isEditable ? <input type="number" value={claim.previous_net_claimed || ''} onChange={e => set('previous_net_claimed', parseFloat(e.target.value) || 0)} className={FIELD} placeholder="0.00" /> : <p className="text-white text-sm">{fmt(claim.previous_net_claimed)}</p>}
              </div>
            </div>
          </div>

          {/* Summary calcs */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="font-semibold text-white mb-4">Claim Summary</h3>
            <div className="space-y-1.5">
              <SummaryRow label="Total Base Contract (A)" value={totals.baseTotal} />
              <SummaryRow label="Total Variations (B)" value={totals.variationsTotal} />
              <SummaryRow label="Total (A + B) = C" value={totals.totalC} bold separator />
              <SummaryRow label={`Retention (${fmtPct(claim.retention_rate_tier1)} / ${fmtPct(claim.retention_rate_tier2)} / ${fmtPct(claim.retention_rate_tier3)})`} value={totals.retentionAmount} negative />
              <SummaryRow label="Add: Retentions Released" value={claim.retention_released} positive />
              <SummaryRow label="Net Claim to Date (E)" value={totals.netClaimToDateE} bold separator />
              <SummaryRow label="Less Previous Net Claimed (F)" value={-claim.previous_net_claimed} negative />
              <SummaryRow label="Claimed This Period (excl. GST)" value={totals.claimedThisPeriodExGst} bold separator />
              <SummaryRow label="GST (15%)" value={totals.gstAmount} />
              <SummaryRow label="CLAIMED THIS PERIOD (incl. GST)" value={totals.claimedThisPeriodIncGst} bold highlight large separator />
            </div>
          </div>

          {/* Amount payable */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 lg:col-span-2">
            <h3 className="font-semibold text-white mb-4">Amount Payable</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <SummaryRow label="Net Claim to Date (excl. GST)" value={totals.netClaimToDateE} />
                <div className="py-1">
                  <label className={LABEL}>Less Net Payment Certified to Date</label>
                  {isEditable ? <input type="number" value={claim.net_payment_certified || ''} onChange={e => set('net_payment_certified', parseFloat(e.target.value) || 0)} className={FIELD} placeholder="0.00" /> : <p className="text-white text-sm">{fmt(claim.net_payment_certified)}</p>}
                </div>
                <SummaryRow label="Amount Payable (excl. GST)" value={totals.amountPayableExGst} bold separator />
                <SummaryRow label="GST (15%)" value={totals.amountPayableExGst * 0.15} />
                <SummaryRow label="AMOUNT PAYABLE (incl. GST)" value={totals.amountPayableIncGst} bold highlight large separator />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECTION: BANK DETAILS ───────────────────────────────────────────── */}
      {activeSection === 'bank' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 max-w-xl space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard size={16} className="text-cyan-400" />
            <h3 className="font-semibold text-white">Direct Credit Details</h3>
          </div>
          <p className="text-xs text-slate-500">Bank details for direct payment of this claim.</p>
          {[
            { label: 'Bank Name', key: 'bank_name' as const, placeholder: 'e.g. ASB Bank' },
            { label: 'Account Name', key: 'account_name' as const, placeholder: 'Company name as on account' },
            { label: 'Account Number', key: 'account_number' as const, placeholder: 'XX-XXXX-XXXXXXX-XX' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className={LABEL}>{label}</label>
              {isEditable ? <input type="text" value={claim[key] || ''} onChange={e => set(key, e.target.value)} className={FIELD} placeholder={placeholder} /> : <p className="text-white text-sm font-mono">{claim[key] || '—'}</p>}
            </div>
          ))}
          <div>
            <label className={LABEL}>Payment Reference / Notes</label>
            {isEditable ? <textarea rows={2} value={claim.payment_notes || ''} onChange={e => set('payment_notes', e.target.value)} className={TEXTAREA} placeholder="Reference or notes for the payer" /> : <p className="text-white text-sm">{claim.payment_notes || '—'}</p>}
          </div>
          {isEditable && (
            <button onClick={() => saveClaim()} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={13} />} Save Bank Details
            </button>
          )}
        </div>
      )}

      {/* ─── SECTION: STATUTORY NOTICE ───────────────────────────────────────── */}
      {activeSection === 'notice' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={16} className="text-amber-400" />
            <h3 className="font-semibold text-white">Statutory Notice</h3>
            <span className="text-xs text-slate-500 ml-1">— automatically appended to every claim export</span>
          </div>
          <div className="bg-slate-900/50 border border-slate-700/40 rounded-xl p-6">
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{LEGAL_NOTICE}</pre>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            This notice is a required component of every payment claim made under the Construction Contracts Act 2002 (NZ). It cannot be modified.
          </p>
        </div>
      )}

      {/* ─── SECTION: ACTIVITY ───────────────────────────────────────────────── */}
      {activeSection === 'activity' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-2">
            <Activity size={15} className="text-cyan-400" />
            <h3 className="font-semibold text-white">Activity Log</h3>
            <span className="text-xs text-slate-500 ml-1">— {activity.length} events</span>
          </div>
          {activity.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">
              <Clock size={24} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No activity recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/30">
              {activity.map(a => (
                <div key={a.id} className="px-6 py-3.5 flex items-start gap-3">
                  <div className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Activity size={11} className="text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{a.action_label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{fmtDate(a.action_at)}</p>
                  </div>
                  <span className="text-[10px] text-slate-600 bg-slate-700/40 px-2 py-0.5 rounded uppercase tracking-wide flex-shrink-0">{a.action_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating summary bar — always visible */}
      <div className="sticky bottom-4 bg-slate-900/95 border border-slate-700 rounded-2xl px-6 py-3 shadow-2xl backdrop-blur-sm flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-4 flex-1 flex-wrap">
          {[
            { label: 'Base (A)', value: fmt(totals.baseTotal) },
            { label: 'Vars (B)', value: fmt(totals.variationsTotal) },
            { label: 'Net to Date', value: fmt(totals.netClaimToDateE) },
            { label: 'This Claim excl. GST', value: fmt(totals.claimedThisPeriodExGst) },
          ].map(s => (
            <div key={s.label}>
              <p className="text-[10px] text-slate-500">{s.label}</p>
              <p className="text-sm font-semibold text-white">{s.value}</p>
            </div>
          ))}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-[10px] text-slate-500">THIS CLAIM (incl. GST)</p>
          <p className="text-xl font-bold text-cyan-400">{fmt(totals.claimedThisPeriodIncGst)}</p>
        </div>
      </div>
    </div>
  );
}

function ClaimLinesTable({ lines, isEditable, onUpdate, onRemove, showPrevious }: {
  lines: ClaimLine[];
  isEditable: boolean;
  onUpdate: (id: string, updates: Partial<ClaimLine & { previous_claimed_value: number }>) => void;
  onRemove: (id: string) => void;
  showPrevious: boolean;
}) {
  const F = 'bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-white placeholder-slate-600 focus:border-cyan-500 outline-none w-full';
  const fmt = (n: number | null | undefined) => {
    if (!n) return '—';
    return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  };

  if (lines.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-slate-700/50 rounded-xl">
        <p className="text-slate-500 text-sm">No lines added yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b border-slate-700/40 text-slate-400 text-xs">
            <th className="text-left py-2 w-16">Item</th>
            <th className="text-left py-2">Description</th>
            <th className="text-right py-2 w-14">Qty</th>
            <th className="text-left py-2 w-14">Unit</th>
            <th className="text-right py-2 w-24">Rate</th>
            <th className="text-right py-2 w-28">Total ($)</th>
            <th className="text-right py-2 w-16">Claim %</th>
            <th className="text-right py-2 w-28">Claim $</th>
            {showPrevious && <th className="text-right py-2 w-28">Prev. Claimed</th>}
            {showPrevious && <th className="text-right py-2 w-28">This Claim $</th>}
            {isEditable && <th className="w-8" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/20">
          {lines.map(line => {
            const prevVal = (line as ClaimLine & { previous_claimed_value?: number }).previous_claimed_value ?? 0;
            const thisClaimVal = line.claim_to_date_amount - prevVal;
            return (
              <tr key={line.id} className="group hover:bg-slate-700/10">
                <td className="py-2 pr-2">{isEditable ? <input value={line.item_no} onChange={e => onUpdate(line.id, { item_no: e.target.value })} className={F} /> : <span className="text-slate-400 text-xs">{line.item_no}</span>}</td>
                <td className="py-2 pr-2">{isEditable ? <input value={line.description} onChange={e => onUpdate(line.id, { description: e.target.value })} className={F} placeholder="Description" /> : <span className="text-white">{line.description || '—'}</span>}</td>
                <td className="py-2 pr-2">{isEditable ? <input type="number" value={line.qty ?? ''} onChange={e => onUpdate(line.id, { qty: parseFloat(e.target.value) || null })} className={F + ' text-right'} /> : <span className="text-slate-300 block text-right">{line.qty ?? '—'}</span>}</td>
                <td className="py-2 pr-2">{isEditable ? <input value={line.unit || ''} onChange={e => onUpdate(line.id, { unit: e.target.value })} className={F} placeholder="Sum" /> : <span className="text-slate-400">{line.unit || '—'}</span>}</td>
                <td className="py-2 pr-2">{isEditable ? <input type="number" value={line.rate ?? ''} onChange={e => onUpdate(line.id, { rate: parseFloat(e.target.value) || null })} className={F + ' text-right'} placeholder="—" /> : <span className="text-slate-300 block text-right">{line.rate != null ? fmt(line.rate) : '—'}</span>}</td>
                <td className="py-2 pr-2">{isEditable ? <input type="number" value={line.total || ''} onChange={e => onUpdate(line.id, { total: parseFloat(e.target.value) || 0 })} className={F + ' text-right'} placeholder="0" /> : <span className="text-white font-medium block text-right">{fmt(line.total)}</span>}</td>
                <td className="py-2 pr-2">
                  {isEditable ? (
                    <div className="flex items-center gap-0.5">
                      <input type="number" min={0} max={100} step={1} value={line.claim_to_date_pct} onChange={e => onUpdate(line.id, { claim_to_date_pct: parseFloat(e.target.value) || 0 })} className={F + ' text-right w-14'} />
                      <span className="text-slate-500 text-xs">%</span>
                    </div>
                  ) : <span className="text-slate-300 block text-right">{line.claim_to_date_pct}%</span>}
                </td>
                <td className="py-2 pr-2 text-right"><span className="text-cyan-400 font-medium">{fmt(line.claim_to_date_amount)}</span></td>
                {showPrevious && (
                  <td className="py-2 pr-2 text-right">
                    {isEditable ? (
                      <input type="number" value={prevVal || ''} onChange={e => onUpdate(line.id, { previous_claimed_value: parseFloat(e.target.value) || 0 } as Partial<ClaimLine & { previous_claimed_value: number }>)} className={F + ' text-right'} placeholder="0" />
                    ) : <span className="text-slate-400">{fmt(prevVal)}</span>}
                  </td>
                )}
                {showPrevious && (
                  <td className="py-2 pr-2 text-right">
                    <span className={`font-semibold ${thisClaimVal < 0 ? 'text-red-400' : 'text-white'}`}>{fmt(thisClaimVal)}</span>
                  </td>
                )}
                {isEditable && (
                  <td className="py-2">
                    <button onClick={() => onRemove(line.id)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-0.5">
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryRow({ label, value, bold, negative, positive, separator, highlight, large }: {
  label: string; value: number;
  bold?: boolean; negative?: boolean; positive?: boolean;
  separator?: boolean; highlight?: boolean; large?: boolean;
}) {
  const fmt = (n: number) => new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const valueColor = highlight ? 'text-cyan-400' : negative ? 'text-red-400' : positive ? 'text-green-400' : 'text-white';
  return (
    <div className={`flex items-center justify-between py-1 ${separator ? 'border-t border-slate-700/50 mt-1 pt-2' : ''}`}>
      <span className={`text-xs ${bold ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>{label}</span>
      <span className={`${large ? 'text-lg' : 'text-sm'} ${bold ? 'font-bold' : 'font-medium'} ${valueColor} tabular-nums`}>{fmt(value)}</span>
    </div>
  );
}
