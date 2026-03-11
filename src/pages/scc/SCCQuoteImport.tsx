import { useState, useEffect, useRef } from 'react';
import {
  Upload, CheckCircle, Clock,
  ChevronRight, Eye, RefreshCw, ToggleLeft, ToggleRight,
  Loader2, Package, ArrowRight, FileText, Zap, ClipboardList, AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';
import { useTrade } from '../../lib/tradeContext';

interface QuoteImport {
  id: string;
  file_name: string;
  file_url: string | null;
  status: 'uploaded' | 'parsing' | 'parsed' | 'reviewed' | 'locked';
  parsed_line_count: number;
  total_value: number | null;
  main_contractor: string | null;
  project_name: string | null;
  quote_reference: string | null;
  quote_date: string | null;
  trade_type: string | null;
  parsing_notes: string | null;
  created_at: string;
  contract_id: string | null;
  parsing_job_id: string | null;
}

interface QuoteLineItem {
  id: string;
  import_id: string;
  line_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  unit_rate: number | null;
  total_amount: number | null;
  scope_category: string | null;
  is_provisional: boolean;
  is_pc_sum: boolean;
  is_excluded: boolean;
  include_in_baseline: boolean;
  review_notes: string | null;
  confidence_score: number | null;
}

interface ParsingJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error_message: string | null;
  quote_id: string | null;
  filename: string;
  updated_at: string;
}

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

export default function SCCQuoteImport({ onProceedToWorkflow }: { onProceedToWorkflow?: (sentinelProjectId: string) => void } = {}) {
  const { currentOrganisation } = useOrganisation();
  const { currentTrade } = useTrade();
  const fileRef = useRef<HTMLInputElement>(null);

  const [imports, setImports] = useState<QuoteImport[]>([]);
  const [selectedImport, setSelectedImport] = useState<QuoteImport | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [activeJobs, setActiveJobs] = useState<Record<string, ParsingJob>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [view, setView] = useState<'list' | 'review'>('list');
  const [editingMeta, setEditingMeta] = useState<{ main_contractor: string; project_name: string; quote_reference: string; trade_type: string }>({
    main_contractor: '', project_name: '', quote_reference: '', trade_type: ''
  });
  const [saving, setSaving] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [sentinelProjectId, setSentinelProjectId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (currentOrganisation?.id) {
      loadImports();
      ensureSentinelProject();
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [currentOrganisation?.id]);

  const ensureSentinelProject = async () => {
    if (!currentOrganisation?.id) return;
    try {
      const { data } = await supabase.rpc('get_or_create_scc_sentinel_project', {
        org_id: currentOrganisation.id
      });
      if (data) setSentinelProjectId(data);
    } catch (err) {
      console.error('Failed to get SCC sentinel project:', err);
    }
  };

  const loadImports = async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('scc_quote_imports')
      .select('*')
      .eq('organisation_id', currentOrganisation.id)
      .order('created_at', { ascending: false });
    setImports(data || []);
    setLoading(false);
  };

  const loadLineItems = async (importId: string) => {
    setLoadingLines(true);
    const { data } = await supabase
      .from('scc_quote_line_items')
      .select('*')
      .eq('import_id', importId)
      .order('created_at', { ascending: true });
    setLineItems(data || []);
    setLoadingLines(false);
  };

  const pollParsingJob = (importId: string, jobId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      const { data: job } = await supabase
        .from('parsing_jobs')
        .select('id, status, progress, error_message, quote_id, filename, updated_at')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) return;

      setActiveJobs(prev => ({ ...prev, [importId]: job }));

      if (job.status === 'completed' && job.quote_id) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        await syncQuoteItemsToImport(importId, job.quote_id);
      } else if (job.status === 'failed') {
        if (pollingRef.current) clearInterval(pollingRef.current);
        await supabase
          .from('scc_quote_imports')
          .update({ status: 'uploaded', parsing_notes: job.error_message || 'Parsing failed', updated_at: new Date().toISOString() })
          .eq('id', importId);
        setImports(prev => prev.map(i => i.id === importId ? { ...i, status: 'uploaded', parsing_notes: job.error_message } : i));
        setActiveJobs(prev => { const n = { ...prev }; delete n[importId]; return n; });
      }
    }, 3000);
  };

  const syncQuoteItemsToImport = async (importId: string, quoteId: string) => {
    const { data: items } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId);

    if (!items || items.length === 0) return;

    const total = items.reduce((s: number, i: { total_price?: number }) => s + (i.total_price || 0), 0);

    const lineRows = items.map((item: {
      item_number?: string;
      description?: string;
      unit?: string;
      quantity?: number;
      unit_price?: number;
      total_price?: number;
      scope_category?: string;
      system_id?: string;
      confidence?: number;
      raw_text?: string;
    }) => ({
      import_id: importId,
      organisation_id: currentOrganisation!.id,
      line_number: item.item_number || null,
      description: item.description || 'No description',
      unit: item.unit || null,
      quantity: item.quantity || null,
      unit_rate: item.unit_price || null,
      total_amount: item.total_price || null,
      scope_category: item.scope_category || item.system_id || null,
      is_provisional: false,
      is_pc_sum: false,
      is_excluded: false,
      include_in_baseline: true,
      confidence_score: item.confidence || null,
      original_text: item.raw_text || item.description || null,
    }));

    await supabase.from('scc_quote_line_items').insert(lineRows);

    await Promise.all([
      supabase
        .from('scc_quote_imports')
        .update({
          status: 'parsed',
          parsed_line_count: items.length,
          total_value: total,
          updated_at: new Date().toISOString(),
        })
        .eq('id', importId),
      supabase
        .from('quotes')
        .update({ is_selected: true, updated_at: new Date().toISOString() })
        .eq('id', quoteId),
    ]);

    setImports(prev => prev.map(i =>
      i.id === importId
        ? { ...i, status: 'parsed', parsed_line_count: items.length, total_value: total }
        : i
    ));
    setActiveJobs(prev => { const n = { ...prev }; delete n[importId]; return n; });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrganisation?.id) return;
    if (!supplierName.trim()) {
      alert('Please enter a supplier / quote name before uploading.');
      return;
    }

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      let projectId = sentinelProjectId;
      if (!projectId) {
        const { data } = await supabase.rpc('get_or_create_scc_sentinel_project', { org_id: currentOrganisation.id });
        projectId = data;
        setSentinelProjectId(data);
      }
      if (!projectId) throw new Error('Could not create SCC workspace project');

      const { data: importData, error: importErr } = await supabase
        .from('scc_quote_imports')
        .insert({
          organisation_id: currentOrganisation.id,
          file_name: file.name,
          status: 'parsing',
          trade_type: currentTrade,
          created_by: session.user.id,
        })
        .select()
        .single();

      if (importErr || !importData) throw importErr || new Error('Failed to create import record');

      setImports(prev => [importData, ...prev]);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('supplierName', supplierName.trim());
      formData.append('organisationId', currentOrganisation.id);
      formData.append('dashboardMode', 'original');
      formData.append('trade', currentTrade);

      const jobUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start_parsing_job`;
      const response = await fetch(jobUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start parsing job');
      }

      const { jobId } = await response.json();

      await supabase
        .from('parsing_jobs')
        .update({ scc_import_id: importData.id })
        .eq('id', jobId);

      setActiveJobs(prev => ({
        ...prev,
        [importData.id]: { id: jobId, status: 'pending', progress: 0, error_message: null, quote_id: null, filename: file.name, updated_at: new Date().toISOString() }
      }));

      pollParsingJob(importData.id, jobId);
      setSupplierName('');
    } catch (err: unknown) {
      console.error('SCC upload error:', err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openReview = async (imp: QuoteImport) => {
    setSelectedImport(imp);
    setEditingMeta({
      main_contractor: imp.main_contractor || '',
      project_name: imp.project_name || '',
      quote_reference: imp.quote_reference || '',
      trade_type: imp.trade_type || '',
    });
    setView('review');
    await loadLineItems(imp.id);

    if (imp.status === 'parsing') {
      const { data: job } = await supabase
        .from('parsing_jobs')
        .select('id, status, progress, error_message, quote_id, filename, updated_at')
        .eq('scc_import_id', imp.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (job && (job.status === 'pending' || job.status === 'processing')) {
        setActiveJobs(prev => ({ ...prev, [imp.id]: job }));
        pollParsingJob(imp.id, job.id);
      }
    }
  };

  const toggleLineInclude = async (lineId: string, current: boolean) => {
    await supabase.from('scc_quote_line_items').update({ include_in_baseline: !current }).eq('id', lineId);
    setLineItems(prev => prev.map(l => l.id === lineId ? { ...l, include_in_baseline: !current } : l));
  };

  const saveMeta = async () => {
    if (!selectedImport) return;
    setSaving(true);

    await supabase
      .from('scc_quote_imports')
      .update({ ...editingMeta, status: 'reviewed', updated_at: new Date().toISOString() })
      .eq('id', selectedImport.id);

    if (selectedImport.parsing_job_id) {
      const { data: job } = await supabase
        .from('parsing_jobs')
        .select('quote_id')
        .eq('id', selectedImport.parsing_job_id)
        .maybeSingle();
      if (job?.quote_id) {
        await supabase
          .from('quotes')
          .update({ is_selected: true, updated_at: new Date().toISOString() })
          .eq('id', job.quote_id);
      }
    }

    setImports(prev => prev.map(i => i.id === selectedImport.id ? { ...i, ...editingMeta, status: 'reviewed' } : i));
    setSelectedImport(prev => prev ? { ...prev, ...editingMeta, status: 'reviewed' } : null);
    setSaving(false);
  };

  const includedCount = lineItems.filter(l => l.include_in_baseline && !l.is_excluded).length;
  const includedTotal = lineItems
    .filter(l => l.include_in_baseline && !l.is_excluded)
    .reduce((s, l) => s + (l.total_amount || 0), 0);

  const latestImport = imports[0] ?? null;
  const latestJob = latestImport ? activeJobs[latestImport.id] : null;
  const isParsing = latestImport?.status === 'parsing' || !!(latestJob && (latestJob.status === 'pending' || latestJob.status === 'processing'));
  const isParsed = latestImport?.status === 'parsed';
  const isActive = latestImport?.status === 'reviewed' || latestImport?.status === 'locked';

  if (view === 'review' && selectedImport) {
    const activeJob = activeJobs[selectedImport.id];
    const reviewIsParsing = selectedImport.status === 'parsing' || !!activeJob;
    const reviewIsActive = selectedImport.status === 'reviewed' || selectedImport.status === 'locked';

    return (
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setView('list'); if (pollingRef.current) clearInterval(pollingRef.current); }}
            className="text-gray-400 hover:text-white text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-700/40 transition-colors"
          >
            <ChevronRight size={16} className="rotate-180" /> Back to list
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium truncate">{selectedImport.file_name}</span>
          {reviewIsActive && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-300 flex-shrink-0 flex items-center gap-1">
              <CheckCircle size={11} /> Active Baseline
            </span>
          )}
        </div>

        {/* Parsing progress */}
        {reviewIsParsing && activeJob && (
          <div className="flex items-center gap-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-4">
            <Loader2 size={20} className="text-yellow-400 animate-spin flex-shrink-0" />
            <div className="flex-1">
              <p className="text-yellow-300 font-semibold text-sm">AI is reading your quote — {activeJob.progress}%</p>
              <p className="text-yellow-400/70 text-xs mt-0.5">
                This usually takes 15–60 seconds. Line items will appear automatically when done.
              </p>
              <div className="mt-2 w-full bg-yellow-900/30 rounded-full h-1.5">
                <div
                  className="h-1.5 bg-yellow-400 rounded-full transition-all duration-500"
                  style={{ width: `${activeJob.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* What to do on this screen */}
        {!reviewIsParsing && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-4 flex gap-3">
            <AlertCircle size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-300 text-sm font-semibold mb-1">
                {reviewIsActive ? 'This quote is your active baseline' : 'Review the line items, then confirm as your baseline'}
              </p>
              <p className="text-blue-300/70 text-xs">
                {reviewIsActive
                  ? 'You can still toggle individual items on/off at any time. When ready, click "Next: Review & Clean" below.'
                  : 'Toggle off any items you want to exclude from your contract baseline, fill in the details on the left, then click "Confirm as Active Baseline".'}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel */}
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-1">Quote Details</h3>
              <p className="text-xs text-gray-500 mb-4">Fill these in to help identify this quote later</p>
              <div className="space-y-3">
                {[
                  { key: 'main_contractor', label: 'Main Contractor' },
                  { key: 'project_name', label: 'Project Name' },
                  { key: 'quote_reference', label: 'Quote Reference' },
                  { key: 'trade_type', label: 'Trade Type' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-xs text-gray-400 mb-1 block">{field.label}</label>
                    <input
                      type="text"
                      value={(editingMeta as Record<string, string>)[field.key] || ''}
                      onChange={e => setEditingMeta(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-3">Baseline Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Lines</span>
                  <span className="text-white font-medium">{reviewIsParsing ? '…' : lineItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Included</span>
                  <span className="text-green-400 font-medium">{reviewIsParsing ? '…' : includedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Excluded</span>
                  <span className="text-red-400 font-medium">{reviewIsParsing ? '…' : lineItems.length - includedCount}</span>
                </div>
                <div className="border-t border-slate-700/50 pt-2 flex justify-between">
                  <span className="text-gray-400">Baseline Value</span>
                  <span className="text-cyan-400 font-bold">{reviewIsParsing ? '…' : fmt(includedTotal)}</span>
                </div>
              </div>
            </div>

            {/* Primary CTA */}
            {!reviewIsParsing && (
              <div className="space-y-3">
                {!reviewIsActive && (
                  <button
                    onClick={saveMeta}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    {saving ? 'Saving…' : 'Confirm as Active Baseline'}
                  </button>
                )}

                {reviewIsActive && onProceedToWorkflow && sentinelProjectId && (
                  <>
                    <button
                      onClick={saveMeta}
                      disabled={saving}
                      className="w-full py-2 text-sm text-gray-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-xl transition-colors"
                    >
                      {saving ? 'Saving…' : 'Update Details'}
                    </button>
                    <button
                      onClick={() => onProceedToWorkflow(sentinelProjectId)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      Next: Review & Clean <ArrowRight size={15} />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right panel — line items */}
          <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <div>
                <h3 className="font-semibold text-white">Parsed Line Items</h3>
                <p className="text-xs text-gray-500 mt-0.5">Toggle the switch to include or exclude each line from your baseline</p>
              </div>
              <div className="flex items-center gap-2">
                {(loadingLines || reviewIsParsing) && <Loader2 size={16} className="animate-spin text-cyan-400" />}
                {!reviewIsParsing && lineItems.length > 0 && !loadingLines && (
                  <span className="text-xs text-gray-500">{lineItems.length} items</span>
                )}
              </div>
            </div>

            {reviewIsParsing ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="w-16 h-16 bg-yellow-500/10 rounded-2xl flex items-center justify-center mb-6">
                  <Loader2 size={32} className="text-yellow-400 animate-spin" />
                </div>
                <p className="text-white font-semibold text-lg mb-2">AI Parsing in Progress</p>
                <p className="text-gray-400 text-sm max-w-sm">
                  The quote is being read by the AI. Line items will appear here automatically — no need to refresh.
                </p>
                <div className="mt-4 text-xs text-gray-600">
                  {activeJob?.progress || 0}% complete
                </div>
              </div>
            ) : lineItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <Package size={40} className="text-gray-600 mb-3" />
                <p className="text-gray-400 font-medium">No line items extracted</p>
                <p className="text-gray-500 text-sm mt-1">
                  Parsing may still be in progress, or no line items could be extracted from this file.
                </p>
                <button
                  onClick={() => loadLineItems(selectedImport.id)}
                  className="mt-3 flex items-center gap-2 px-3 py-1.5 text-sm text-cyan-400 hover:text-white hover:bg-cyan-500/10 rounded-lg transition-colors"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 bg-slate-900/30">
                      <th className="text-left px-4 py-3 text-gray-400 font-medium w-8">#</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Description</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Qty</th>
                      <th className="text-left px-4 py-3 text-gray-400 font-medium">Unit</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Rate</th>
                      <th className="text-right px-4 py-3 text-gray-400 font-medium">Total</th>
                      <th className="text-center px-4 py-3 text-gray-400 font-medium w-20">Include</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {lineItems.map((line, idx) => (
                      <tr
                        key={line.id}
                        className={`transition-colors ${
                          !line.include_in_baseline || line.is_excluded
                            ? 'opacity-40 bg-red-500/5'
                            : 'hover:bg-slate-700/20'
                        }`}
                      >
                        <td className="px-4 py-3 text-gray-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="text-white text-sm leading-tight">{line.description}</div>
                          {line.scope_category && (
                            <div className="text-gray-500 text-xs mt-0.5">{line.scope_category}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300 text-sm">{line.quantity ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{line.unit || '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-300 text-sm">
                          {line.unit_rate != null ? `$${line.unit_rate.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-white">{fmt(line.total_amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => toggleLineInclude(line.id, line.include_in_baseline)}>
                            {line.include_in_baseline
                              ? <ToggleRight size={20} className="text-cyan-400" />
                              : <ToggleLeft size={20} className="text-gray-600" />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700/50 bg-slate-900/30">
                      <td colSpan={5} className="px-4 py-3 text-right text-gray-400 text-sm font-medium">
                        Baseline Total ({includedCount} of {lineItems.length} lines)
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-cyan-400">{fmt(includedTotal)}</td>
                      <td />
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
      {/* Page title */}
      <div>
        <h2 className="text-xl font-bold text-white">Step 1 of 3 — Import Your Quote</h2>
        <p className="text-sm text-gray-400 mt-1">
          Upload the subcontractor's quote. The AI will extract every line item automatically.
        </p>
      </div>

      {/* How it works — only shown when no imports yet */}
      {!loading && imports.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Upload, label: '1. Upload', desc: 'Upload any PDF, Excel, or CSV quote file', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
            { icon: Zap, label: '2. AI Reads It', desc: 'The AI extracts every line item automatically', color: 'text-amber-400', bg: 'bg-amber-500/10' },
            { icon: ClipboardList, label: '3. Review & Confirm', desc: 'Toggle items, then confirm as your baseline', color: 'text-green-400', bg: 'bg-green-500/10' },
          ].map(({ icon: Icon, label, desc, color, bg }) => (
            <div key={label} className={`rounded-xl border border-slate-700/50 p-4 ${bg}/20 flex gap-3 items-start`}>
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${color}`}>{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-1">Upload a Quote</h3>
        <p className="text-xs text-gray-500 mb-4">Enter the supplier name, then upload the file</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Quote / Supplier name (e.g. FireSafe Ltd)"
            value={supplierName}
            onChange={e => setSupplierName(e.target.value)}
            className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
          <button
            onClick={() => {
              if (!supplierName.trim()) {
                alert('Please enter a supplier / quote name first.');
                return;
              }
              fileRef.current?.click();
            }}
            disabled={uploading}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? 'Uploading…' : 'Import Quote'}
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2">Supports PDF, Excel (.xlsx, .xls), and CSV</p>
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
      </div>

      {/* Imports list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : imports.length === 0 ? (
        <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-2xl p-16 text-center transition-colors">
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText size={32} className="text-gray-600" />
          </div>
          <p className="text-white font-semibold text-lg mb-2">No quotes imported yet</p>
          <p className="text-gray-400 text-sm max-w-sm mx-auto">
            Enter a supplier name above and upload the quote file to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">{imports.length} Import{imports.length !== 1 ? 's' : ''}</h3>
            <button onClick={loadImports} className="text-gray-500 hover:text-white transition-colors p-1">
              <RefreshCw size={14} />
            </button>
          </div>

          {imports.map(imp => {
            const job = activeJobs[imp.id];
            const isJobParsing = job && (job.status === 'pending' || job.status === 'processing');
            const impIsParsing = imp.status === 'parsing' || !!isJobParsing;
            const impIsParsed = imp.status === 'parsed';
            const impIsActive = imp.status === 'reviewed' || imp.status === 'locked';

            return (
              <div
                key={imp.id}
                className={`rounded-xl border transition-all ${
                  impIsActive
                    ? 'border-green-500/40 bg-green-500/5'
                    : impIsParsed
                    ? 'border-cyan-500/40 bg-cyan-500/5'
                    : 'border-slate-700/50 bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    impIsActive ? 'bg-green-500/20' : impIsParsed ? 'bg-cyan-500/20' : impIsParsing ? 'bg-yellow-500/20' : 'bg-slate-700/50'
                  }`}>
                    {isJobParsing
                      ? <Loader2 size={18} className="text-yellow-400 animate-spin" />
                      : impIsActive
                      ? <CheckCircle size={18} className="text-green-400" />
                      : impIsParsed
                      ? <Eye size={18} className="text-cyan-400" />
                      : impIsParsing
                      ? <Loader2 size={18} className="text-yellow-400 animate-spin" />
                      : <Clock size={18} className="text-gray-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-medium text-white truncate">{imp.file_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                        impIsActive ? 'bg-green-500/20 text-green-300' :
                        impIsParsed ? 'bg-cyan-500/20 text-cyan-300' :
                        impIsParsing ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-slate-700 text-gray-400'
                      }`}>
                        {impIsActive ? 'Active Baseline' : impIsParsed ? 'Ready to Review' : impIsParsing ? 'Parsing…' : 'Uploaded'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                      {imp.project_name && <span>{imp.project_name}</span>}
                      {imp.main_contractor && <span>{imp.main_contractor}</span>}
                      {imp.parsed_line_count > 0 && <span>{imp.parsed_line_count} lines</span>}
                      {imp.total_value != null && <span className="text-cyan-400 font-medium">{fmt(imp.total_value)}</span>}
                      {isJobParsing && (
                        <span className="text-yellow-400">{job.progress}% parsed</span>
                      )}
                    </div>
                    {isJobParsing && (
                      <div className="mt-1.5 w-48 bg-slate-700/50 rounded-full h-1">
                        <div className="h-1 bg-yellow-400 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {impIsParsed && (
                      <button
                        onClick={() => openReview(imp)}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-cyan-500 hover:bg-cyan-600 rounded-lg transition-colors"
                      >
                        <Eye size={14} /> Review & Confirm
                      </button>
                    )}
                    {impIsActive && onProceedToWorkflow && sentinelProjectId && (
                      <button
                        onClick={() => onProceedToWorkflow(sentinelProjectId)}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-cyan-500 hover:bg-cyan-600 rounded-lg transition-colors"
                      >
                        Next: Review & Clean <ArrowRight size={14} />
                      </button>
                    )}
                    {(impIsParsed || impIsActive) && (
                      <button
                        onClick={() => openReview(imp)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                        title="View details"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline guidance strip for parsed-but-not-confirmed state */}
                {impIsParsed && (
                  <div className="border-t border-cyan-500/20 px-5 py-3 flex items-center gap-2 bg-cyan-500/5">
                    <AlertCircle size={14} className="text-cyan-400 flex-shrink-0" />
                    <p className="text-xs text-cyan-300">
                      Quote has been parsed. Click <strong>Review & Confirm</strong> to check the line items and set this as your active baseline.
                    </p>
                  </div>
                )}

                {impIsActive && (
                  <div className="border-t border-green-500/20 px-5 py-3 flex items-center gap-2 bg-green-500/5">
                    <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                    <p className="text-xs text-green-300">
                      Active baseline set. Click <strong>Next: Review & Clean</strong> to continue to the next step.
                    </p>
                  </div>
                )}

                {impIsParsing && (
                  <div className="border-t border-yellow-500/20 px-5 py-3 flex items-center gap-2 bg-yellow-500/5">
                    <Loader2 size={14} className="text-yellow-400 animate-spin flex-shrink-0" />
                    <p className="text-xs text-yellow-300">
                      AI is reading your quote. Line items will appear automatically when parsing is complete — no action needed.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Prominent CTA if active baseline exists and we're on the list view */}
          {isActive && onProceedToWorkflow && sentinelProjectId && (
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={20} className="text-cyan-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Baseline ready — proceed to Step 2</p>
                  <p className="text-cyan-300/70 text-xs mt-0.5">Review & Clean normalises your line items for accurate analysis</p>
                </div>
              </div>
              <button
                onClick={() => onProceedToWorkflow(sentinelProjectId)}
                className="flex items-center gap-2 px-5 py-3 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-bold rounded-xl transition-colors whitespace-nowrap flex-shrink-0"
              >
                Next: Review & Clean <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Prompt to review parsed-but-not-confirmed import */}
          {isParsed && !isActive && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={20} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Quote parsed — review and confirm to continue</p>
                  <p className="text-amber-300/70 text-xs mt-0.5">You need to confirm the baseline before moving to the next step</p>
                </div>
              </div>
              {latestImport && (
                <button
                  onClick={() => openReview(latestImport)}
                  className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-colors whitespace-nowrap flex-shrink-0"
                >
                  Review & Confirm <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
