import { useState, useEffect, useRef } from 'react';
import {
  ChevronRight, Plus, Trash2, RefreshCw, Upload, AlertCircle,
  Send, Download, CheckCircle, Image, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import {
  computeClaimTotals, computeLineTotal, LEGAL_NOTICE,
  type ClaimLine
} from '../../lib/scc/paymentClaimCalculations';

interface PaymentClaim {
  id: string;
  claim_number: string;
  our_ref: string;
  payer_company: string;
  payer_address: string;
  payer_attention: string;
  project_name: string;
  site_location: string;
  claim_period: string;
  payee_company: string;
  payee_address: string;
  payee_contact: string;
  submission_date: string | null;
  due_date: string | null;
  logo_url: string | null;
  retention_rate_tier1: number;
  retention_rate_tier2: number;
  retention_rate_tier3: number;
  retention_released: number;
  previous_net_claimed: number;
  net_payment_certified: number;
  status: string;
}

interface Props {
  claimId: string | null;
  contractId: string | null;
  onBack: () => void;
  onSaved?: (id: string) => void;
}

const FIELD = 'w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-colors';
const TEXTAREA = FIELD + ' resize-none';
const LABEL = 'text-xs text-gray-400 mb-1 block';

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(r: number): string {
  return `${(r * 100).toFixed(2)}%`;
}

const DEFAULT_CLAIM: Omit<PaymentClaim, 'id'> = {
  claim_number: '',
  our_ref: '',
  payer_company: '',
  payer_address: '',
  payer_attention: '',
  project_name: '',
  site_location: '',
  claim_period: '',
  payee_company: '',
  payee_address: '',
  payee_contact: '',
  submission_date: null,
  due_date: null,
  logo_url: null,
  retention_rate_tier1: 0.05,
  retention_rate_tier2: 0.025,
  retention_rate_tier3: 0.0,
  retention_released: 0,
  previous_net_claimed: 0,
  net_payment_certified: 0,
  status: 'draft',
};

const DEFAULT_BASE_LINES: Omit<ClaimLine, 'id'>[] = [
  { line_type: 'base', item_no: '1.1', description: 'Passive Fire', qty: 1, unit: 'Sum', rate: null, total: 0, claim_to_date_pct: 0, claim_to_date_amount: 0, sort_order: 0 },
  { line_type: 'base', item_no: '1.2', description: 'P&G', qty: 1, unit: 'Sum', rate: null, total: 0, claim_to_date_pct: 0, claim_to_date_amount: 0, sort_order: 1 },
];

export default function PaymentClaimForm({ claimId, contractId, onBack, onSaved }: Props) {
  const { currentOrganisation } = useOrganisation();
  const [claim, setClaim] = useState<PaymentClaim | null>(null);
  const [lines, setLines] = useState<ClaimLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (claimId) {
      loadClaim(claimId);
    } else {
      setIsNew(true);
      setClaim({ id: '', ...DEFAULT_CLAIM });
      setLines([]);
    }
  }, [claimId]);

  const loadClaim = async (id: string) => {
    const { data: c } = await supabase.from('payment_claims').select('*').eq('id', id).maybeSingle();
    if (!c) return;
    setClaim(c);
    const { data: l } = await supabase
      .from('payment_claim_lines')
      .select('*')
      .eq('payment_claim_id', id)
      .order('sort_order', { ascending: true });
    setLines(l || []);
  };

  const getOrCreateClaim = async (): Promise<string | null> => {
    if (!currentOrganisation?.id || !claim) return null;
    if (claim.id) return claim.id;

    const totals = computeClaimTotals(lines, claim.retention_rate_tier1, claim.retention_rate_tier2, claim.retention_rate_tier3, claim.retention_released, claim.previous_net_claimed, claim.net_payment_certified);
    const { data, error: err } = await supabase
      .from('payment_claims')
      .insert({
        organisation_id: currentOrganisation.id,
        contract_id: contractId || null,
        ...claim,
        id: undefined,
        ...totals,
      })
      .select()
      .single();
    if (err || !data) { setError(err?.message || 'Failed to create claim'); return null; }
    setClaim(prev => prev ? { ...prev, id: data.id } : null);
    return data.id;
  };

  const saveClaim = async () => {
    if (!currentOrganisation?.id || !claim) return;
    setSaving(true);
    setError(null);
    try {
      const totals = computeClaimTotals(lines, claim.retention_rate_tier1, claim.retention_rate_tier2, claim.retention_rate_tier3, claim.retention_released, claim.previous_net_claimed, claim.net_payment_certified);

      if (isNew || !claim.id) {
        const { data, error: err } = await supabase
          .from('payment_claims')
          .insert({
            organisation_id: currentOrganisation.id,
            contract_id: contractId || null,
            claim_number: claim.claim_number,
            our_ref: claim.our_ref,
            payer_company: claim.payer_company,
            payer_address: claim.payer_address,
            payer_attention: claim.payer_attention,
            project_name: claim.project_name,
            site_location: claim.site_location,
            claim_period: claim.claim_period,
            payee_company: claim.payee_company,
            payee_address: claim.payee_address,
            payee_contact: claim.payee_contact,
            submission_date: claim.submission_date || null,
            due_date: claim.due_date || null,
            logo_url: claim.logo_url,
            retention_rate_tier1: claim.retention_rate_tier1,
            retention_rate_tier2: claim.retention_rate_tier2,
            retention_rate_tier3: claim.retention_rate_tier3,
            retention_released: claim.retention_released,
            previous_net_claimed: claim.previous_net_claimed,
            net_payment_certified: claim.net_payment_certified,
            status: claim.status,
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
          })
          .select()
          .single();
        if (err || !data) throw err || new Error('Failed to create');
        const newId = data.id;
        setClaim(prev => prev ? { ...prev, id: newId } : null);
        setIsNew(false);

        if (lines.length > 0) {
          await supabase.from('payment_claim_lines').insert(
            lines.map(l => ({ ...l, id: undefined, payment_claim_id: newId, organisation_id: currentOrganisation.id }))
          );
        }
        if (onSaved) onSaved(newId);
      } else {
        await supabase.from('payment_claims').update({
          claim_number: claim.claim_number,
          our_ref: claim.our_ref,
          payer_company: claim.payer_company,
          payer_address: claim.payer_address,
          payer_attention: claim.payer_attention,
          project_name: claim.project_name,
          site_location: claim.site_location,
          claim_period: claim.claim_period,
          payee_company: claim.payee_company,
          payee_address: claim.payee_address,
          payee_contact: claim.payee_contact,
          submission_date: claim.submission_date || null,
          due_date: claim.due_date || null,
          logo_url: claim.logo_url,
          retention_rate_tier1: claim.retention_rate_tier1,
          retention_rate_tier2: claim.retention_rate_tier2,
          retention_rate_tier3: claim.retention_rate_tier3,
          retention_released: claim.retention_released,
          previous_net_claimed: claim.previous_net_claimed,
          net_payment_certified: claim.net_payment_certified,
          status: claim.status,
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
          updated_at: new Date().toISOString(),
        }).eq('id', claim.id);
        if (onSaved) onSaved(claim.id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
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
    const prefix = type === 'base' ? '1' : '2';
    const itemNo = `${prefix}.${existing.length + 1}`;
    const newLine: ClaimLine = {
      id: `temp-${Date.now()}`,
      line_type: type,
      item_no: itemNo,
      description: '',
      qty: 1,
      unit: 'Sum',
      rate: null,
      total: 0,
      claim_to_date_pct: 0,
      claim_to_date_amount: 0,
      sort_order: lines.length,
    };
    setLines(prev => [...prev, newLine]);
  };

  const updateLine = async (id: string, updates: Partial<ClaimLine>) => {
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

  const submitClaim = async () => {
    await saveClaim();
    if (claim?.id) {
      await supabase.from('payment_claims').update({ status: 'submitted', updated_at: new Date().toISOString() }).eq('id', claim.id);
      setClaim(prev => prev ? { ...prev, status: 'submitted' } : null);
    }
  };

  const set = (key: keyof PaymentClaim, value: unknown) => {
    setClaim(prev => prev ? { ...prev, [key]: value } : null);
  };

  if (!claim) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={24} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  const baselines = lines.filter(l => l.line_type === 'base');
  const variations = lines.filter(l => l.line_type === 'variation');
  const totals = computeClaimTotals(lines, claim.retention_rate_tier1, claim.retention_rate_tier2, claim.retention_rate_tier3, claim.retention_released, claim.previous_net_claimed, claim.net_payment_certified);
  const isEditable = claim.status === 'draft';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
          <ChevronRight size={16} className="rotate-180" /> Back
        </button>
        <span className="text-gray-600">/</span>
        <span className="text-white font-medium">{claim.claim_number || 'New Payment Claim'}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${
          claim.status === 'approved' ? 'bg-green-500/20 text-green-300' :
          claim.status === 'submitted' ? 'bg-blue-500/20 text-blue-300' :
          claim.status === 'paid' ? 'bg-cyan-500/20 text-cyan-300' :
          'bg-gray-500/20 text-gray-300'
        }`}>
          {claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {isEditable && (
            <button
              onClick={saveClaim}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              Save Draft
            </button>
          )}
          {isEditable && (
            <button
              onClick={submitClaim}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Send size={14} /> Submit Claim
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-300 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* ─── MAIN FORM CARD ─────────────────────────────────────────────────── */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden">

        {/* Header band */}
        <div className="bg-slate-900/60 border-b border-slate-700/50 px-6 py-5 flex items-center justify-between gap-6">
          {/* Logo upload */}
          <div>
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
            {claim.logo_url ? (
              <div className="relative group">
                <img src={claim.logo_url} alt="Logo" className="h-14 object-contain rounded" />
                {isEditable && (
                  <button
                    onClick={() => set('logo_url', null)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} className="text-white" />
                  </button>
                )}
              </div>
            ) : isEditable ? (
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-600 rounded-lg text-gray-500 hover:text-gray-300 hover:border-slate-500 text-xs transition-colors"
              >
                {uploading ? <RefreshCw size={13} className="animate-spin" /> : <Image size={13} />}
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </button>
            ) : (
              <div className="w-20 h-10 bg-slate-700/40 rounded flex items-center justify-center">
                <Image size={18} className="text-gray-600" />
              </div>
            )}
          </div>

          <div className="text-center flex-1">
            <h1 className="text-2xl font-bold text-white tracking-wide">PAYMENT CLAIM</h1>
            <p className="text-xs text-gray-400 mt-0.5">Construction Contracts Act 2002 — Form 1</p>
          </div>

          <div className="text-right text-sm space-y-1 min-w-[160px]">
            <div>
              <label className={LABEL}>Claim No</label>
              {isEditable ? (
                <input type="text" value={claim.claim_number} onChange={e => set('claim_number', e.target.value)} className={FIELD} placeholder="PC-001" />
              ) : (
                <span className="text-white font-semibold">{claim.claim_number || '—'}</span>
              )}
            </div>
            <div>
              <label className={LABEL}>Our Ref</label>
              {isEditable ? (
                <input type="text" value={claim.our_ref} onChange={e => set('our_ref', e.target.value)} className={FIELD} placeholder="Ref number" />
              ) : (
                <span className="text-white">{claim.our_ref || '—'}</span>
              )}
            </div>
          </div>
        </div>

        {/* TO / FROM party blocks */}
        <div className="grid grid-cols-2 divide-x divide-slate-700/50 border-b border-slate-700/50">
          {/* TO (Payer) */}
          <div className="px-6 py-5 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">TO (Payer)</h3>
            <div className="space-y-2">
              {[
                { label: 'Company / Name', key: 'payer_company' as const, placeholder: 'e.g. Fletcher Construction' },
                { label: 'Attention', key: 'payer_attention' as const, placeholder: 'Contract manager name' },
                { label: 'Project', key: 'project_name' as const, placeholder: 'Project name' },
                { label: 'Site Location', key: 'site_location' as const, placeholder: 'Site address' },
                { label: 'Claim Period', key: 'claim_period' as const, placeholder: 'e.g. March 2026' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className={LABEL}>{label}</label>
                  {isEditable
                    ? <input type="text" value={(claim[key] as string) || ''} onChange={e => set(key, e.target.value)} className={FIELD} placeholder={placeholder} />
                    : <p className="text-white text-sm">{(claim[key] as string) || '—'}</p>
                  }
                </div>
              ))}
              <div>
                <label className={LABEL}>Address</label>
                {isEditable
                  ? <textarea rows={2} value={claim.payer_address} onChange={e => set('payer_address', e.target.value)} className={TEXTAREA} placeholder="Street address, city" />
                  : <p className="text-white text-sm whitespace-pre-line">{claim.payer_address || '—'}</p>
                }
              </div>
            </div>
          </div>

          {/* FROM (Payee) */}
          <div className="px-6 py-5 space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">FROM (Payee)</h3>
            <div className="space-y-2">
              {[
                { label: 'Company / Name', key: 'payee_company' as const, placeholder: 'e.g. Optimal Fire Limited' },
                { label: 'Contact', key: 'payee_contact' as const, placeholder: 'Contact name' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className={LABEL}>{label}</label>
                  {isEditable
                    ? <input type="text" value={(claim[key] as string) || ''} onChange={e => set(key, e.target.value)} className={FIELD} placeholder={placeholder} />
                    : <p className="text-white text-sm">{(claim[key] as string) || '—'}</p>
                  }
                </div>
              ))}
              <div>
                <label className={LABEL}>Address</label>
                {isEditable
                  ? <textarea rows={2} value={claim.payee_address} onChange={e => set('payee_address', e.target.value)} className={TEXTAREA} placeholder="Street address, city" />
                  : <p className="text-white text-sm whitespace-pre-line">{claim.payee_address || '—'}</p>
                }
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={LABEL}>Last date to submit</label>
                  {isEditable
                    ? <input type="date" value={claim.submission_date || ''} onChange={e => set('submission_date', e.target.value || null)} className={FIELD} />
                    : <p className="text-white text-sm">{claim.submission_date || '—'}</p>
                  }
                </div>
                <div>
                  <label className={LABEL}>Due date for payment</label>
                  {isEditable
                    ? <input type="date" value={claim.due_date || ''} onChange={e => set('due_date', e.target.value || null)} className={FIELD} />
                    : <p className="text-white text-sm">{claim.due_date || '—'}</p>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── SECTION A: Base Contract ─────────────────────────────────────── */}
        <div className="px-6 py-5 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white text-sm">A — Base Contract</h3>
              <p className="text-xs text-gray-500 mt-0.5">Original contracted work scope</p>
            </div>
            {isEditable && (
              <button onClick={() => addLine('base')} className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-white transition-colors">
                <Plus size={13} /> Add Line
              </button>
            )}
          </div>
          <ClaimLinesTable
            lines={baselines}
            isEditable={isEditable}
            onUpdate={updateLine}
            onRemove={removeLine}
            onAddDefault={() => {
              if (baselines.length === 0) {
                DEFAULT_BASE_LINES.forEach(l => {
                  setLines(prev => [...prev, { ...l, id: `temp-${Date.now()}-${Math.random()}` }]);
                });
              }
            }}
            emptyText="No base contract lines. Add lines for each work item."
          />
          <div className="mt-3 text-right">
            <span className="text-xs text-gray-400 mr-3">TOTAL BASE CONTRACT (A)</span>
            <span className="text-white font-bold">{fmt(totals.baseTotal)}</span>
          </div>
        </div>

        {/* ─── SECTION B: Variations ────────────────────────────────────────── */}
        <div className="px-6 py-5 border-b border-slate-700/50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-white text-sm">B — Variations</h3>
              <p className="text-xs text-gray-500 mt-0.5">Approved variation orders</p>
            </div>
            {isEditable && (
              <button onClick={() => addLine('variation')} className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-white transition-colors">
                <Plus size={13} /> Add Variation
              </button>
            )}
          </div>
          <ClaimLinesTable
            lines={variations}
            isEditable={isEditable}
            onUpdate={updateLine}
            onRemove={removeLine}
            emptyText="No variations claimed this period."
          />
          <div className="mt-3 text-right">
            <span className="text-xs text-gray-400 mr-3">TOTAL VARIATIONS (B)</span>
            <span className="text-white font-bold">{fmt(totals.variationsTotal)}</span>
          </div>
        </div>

        {/* ─── SUMMARY ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-700/50 border-b border-slate-700/50">

          {/* Retention rates */}
          <div className="px-6 py-5 space-y-4">
            <h3 className="font-semibold text-white text-sm">Retention Rates</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Tier 1 (≤$200k)', key: 'retention_rate_tier1' as const },
                { label: 'Tier 2 ($200k–$1m)', key: 'retention_rate_tier2' as const },
                { label: 'Tier 3 (>$1m)', key: 'retention_rate_tier3' as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className={LABEL}>{label}</label>
                  {isEditable ? (
                    <div className="relative">
                      <input
                        type="number"
                        step="0.005"
                        min={0}
                        max={1}
                        value={claim[key]}
                        onChange={e => set(key, parseFloat(e.target.value) || 0)}
                        className={FIELD + ' pr-6'}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                    </div>
                  ) : (
                    <p className="text-white text-sm">{fmtPct(claim[key] as number)}</p>
                  )}
                </div>
              ))}
            </div>
            <div>
              <label className={LABEL}>Retentions Released ($)</label>
              {isEditable ? (
                <input type="number" value={claim.retention_released || ''} onChange={e => set('retention_released', parseFloat(e.target.value) || 0)} className={FIELD} placeholder="0.00" />
              ) : (
                <p className="text-white text-sm">{fmt(claim.retention_released)}</p>
              )}
            </div>
          </div>

          {/* Summary calc */}
          <div className="px-6 py-5">
            <h3 className="font-semibold text-white text-sm mb-4">Summary</h3>
            <div className="space-y-1.5">
              <SummaryRow label="TOTAL (A + B) = C" value={totals.totalC} bold />
              <SummaryRow label={`Retention (tiered @ ${fmtPct(claim.retention_rate_tier1)} / ${fmtPct(claim.retention_rate_tier2)} / ${fmtPct(claim.retention_rate_tier3)})`} value={totals.retentionAmount} negative />
              <SummaryRow label="Retentions Released" value={claim.retention_released} positive />
              <SummaryRow label="Net Claim to Date (E)" value={totals.netClaimToDateE} bold separator />
              <div>
                <label className={LABEL + ' mt-3'}>Less Previous Net Claimed (F)</label>
                {isEditable ? (
                  <input type="number" value={claim.previous_net_claimed || ''} onChange={e => set('previous_net_claimed', parseFloat(e.target.value) || 0)} className={FIELD} placeholder="0.00" />
                ) : (
                  <p className="text-white text-sm">{fmt(claim.previous_net_claimed)}</p>
                )}
              </div>
              <SummaryRow label="Claimed This Period (excl. GST)" value={totals.claimedThisPeriodExGst} bold separator />
              <SummaryRow label="GST (15%)" value={totals.gstAmount} />
              <SummaryRow label="Claimed This Period (incl. GST)" value={totals.claimedThisPeriodIncGst} bold highlight />
            </div>
          </div>
        </div>

        {/* ─── AMOUNT PAYABLE ───────────────────────────────────────────────── */}
        <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-900/20">
          <h3 className="font-semibold text-white text-sm mb-4">Amount Payable</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <SummaryRow label="Net Claim to Date (excl. GST)" value={totals.netClaimToDateE} />
              <div>
                <label className={LABEL}>Less Net Payment Certified to Date</label>
                {isEditable ? (
                  <input type="number" value={claim.net_payment_certified || ''} onChange={e => set('net_payment_certified', parseFloat(e.target.value) || 0)} className={FIELD} placeholder="0.00" />
                ) : (
                  <p className="text-white text-sm">{fmt(claim.net_payment_certified)}</p>
                )}
              </div>
              <SummaryRow label="Amount Payable (excl. GST)" value={totals.amountPayableExGst} bold separator />
              <SummaryRow label="GST (15%)" value={totals.amountPayableExGst * 0.15} />
              <SummaryRow label="AMOUNT PAYABLE (incl. GST)" value={totals.amountPayableIncGst} bold highlight large />
            </div>
          </div>
        </div>

        {/* ─── LEGAL NOTICE ─────────────────────────────────────────────────── */}
        <div className="px-6 py-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Statutory Notice</h3>
          <pre className="text-xs text-gray-500 whitespace-pre-wrap font-sans leading-relaxed border border-slate-700/30 rounded-lg p-4 bg-slate-900/20">
            {LEGAL_NOTICE}
          </pre>
        </div>
      </div>
    </div>
  );
}

function ClaimLinesTable({
  lines, isEditable, onUpdate, onRemove, onAddDefault, emptyText
}: {
  lines: ClaimLine[];
  isEditable: boolean;
  onUpdate: (id: string, updates: Partial<ClaimLine>) => void;
  onRemove: (id: string) => void;
  onAddDefault?: () => void;
  emptyText: string;
}) {
  const FIELD_SM = 'bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 outline-none w-full';

  if (lines.length === 0) {
    return (
      <div className="text-center py-6 border border-dashed border-slate-700/50 rounded-lg">
        <p className="text-gray-500 text-sm">{emptyText}</p>
        {onAddDefault && isEditable && (
          <button onClick={onAddDefault} className="mt-2 text-xs text-cyan-400 hover:text-white transition-colors">
            + Add default lines
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 text-gray-400 text-xs">
            <th className="text-left py-2 w-16">Item</th>
            <th className="text-left py-2">Description</th>
            <th className="text-right py-2 w-16">Qty</th>
            <th className="text-right py-2 w-16">Unit</th>
            <th className="text-right py-2 w-24">Rate / Sum</th>
            <th className="text-right py-2 w-28">Total</th>
            <th className="text-right py-2 w-16">Claim %</th>
            <th className="text-right py-2 w-28">Claim $</th>
            {isEditable && <th className="w-8" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/20">
          {lines.map(line => (
            <tr key={line.id} className="group">
              <td className="py-2 pr-2">
                {isEditable
                  ? <input value={line.item_no} onChange={e => onUpdate(line.id, { item_no: e.target.value })} className={FIELD_SM} />
                  : <span className="text-gray-400">{line.item_no}</span>
                }
              </td>
              <td className="py-2 pr-2">
                {isEditable
                  ? <input value={line.description} onChange={e => onUpdate(line.id, { description: e.target.value })} className={FIELD_SM} placeholder="Description" />
                  : <span className="text-white">{line.description}</span>
                }
              </td>
              <td className="py-2 pr-2">
                {isEditable
                  ? <input type="number" value={line.qty ?? ''} onChange={e => onUpdate(line.id, { qty: parseFloat(e.target.value) || null })} className={FIELD_SM + ' text-right'} />
                  : <span className="text-gray-300 text-right block">{line.qty ?? '—'}</span>
                }
              </td>
              <td className="py-2 pr-2">
                {isEditable
                  ? <input value={line.unit || ''} onChange={e => onUpdate(line.id, { unit: e.target.value })} className={FIELD_SM} placeholder="Sum" />
                  : <span className="text-gray-400">{line.unit || '—'}</span>
                }
              </td>
              <td className="py-2 pr-2">
                {isEditable
                  ? <input type="number" value={line.rate ?? ''} onChange={e => onUpdate(line.id, { rate: parseFloat(e.target.value) || null })} className={FIELD_SM + ' text-right'} placeholder="—" />
                  : <span className="text-gray-300 text-right block">{line.rate !== null ? fmt(line.rate) : '—'}</span>
                }
              </td>
              <td className="py-2 pr-2">
                {isEditable
                  ? <input type="number" value={line.total || ''} onChange={e => onUpdate(line.id, { total: parseFloat(e.target.value) || 0 })} className={FIELD_SM + ' text-right'} placeholder="0.00" />
                  : <span className="text-white font-medium text-right block">{fmt(line.total)}</span>
                }
              </td>
              <td className="py-2 pr-2">
                {isEditable
                  ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={line.claim_to_date_pct}
                        onChange={e => onUpdate(line.id, { claim_to_date_pct: parseFloat(e.target.value) || 0 })}
                        className={FIELD_SM + ' text-right w-14'}
                      />
                      <span className="text-gray-500 text-xs">%</span>
                    </div>
                  )
                  : <span className="text-gray-300 text-right block">{line.claim_to_date_pct}%</span>
                }
              </td>
              <td className="py-2 pr-2 text-right">
                <span className="text-cyan-400 font-medium">{fmt(line.claim_to_date_amount)}</span>
              </td>
              {isEditable && (
                <td className="py-2">
                  <button onClick={() => onRemove(line.id)} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all">
                    <Trash2 size={13} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryRow({ label, value, bold, negative, positive, separator, highlight, large }: {
  label: string;
  value: number;
  bold?: boolean;
  negative?: boolean;
  positive?: boolean;
  separator?: boolean;
  highlight?: boolean;
  large?: boolean;
}) {
  const valueColor = highlight ? 'text-cyan-400' : negative ? 'text-red-400' : positive ? 'text-green-400' : 'text-white';
  return (
    <div className={`flex items-center justify-between py-1 ${separator ? 'border-t border-slate-700/50 mt-1 pt-2' : ''}`}>
      <span className={`text-xs ${bold ? 'text-gray-200 font-semibold' : 'text-gray-400'}`}>{label}</span>
      <span className={`${large ? 'text-lg' : 'text-sm'} ${bold ? 'font-bold' : 'font-medium'} ${valueColor}`}>
        {fmt(value)}
      </span>
    </div>
  );
}
