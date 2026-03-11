import { useState, useEffect, useRef } from 'react';
import {
  Upload, CheckCircle, Clock,
  ChevronRight, Eye, RefreshCw, ToggleLeft, ToggleRight,
  Loader2, Package
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

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  icon: React.ComponentType<{ size: number; className?: string }>;
}> = {
  uploaded:  { label: 'Uploaded',  color: 'text-gray-300',   bg: 'bg-gray-500/20',   icon: Clock },
  parsing:   { label: 'Parsing…',  color: 'text-yellow-300', bg: 'bg-yellow-500/20', icon: RefreshCw },
  parsed:    { label: 'Parsed',    color: 'text-blue-300',   bg: 'bg-blue-500/20',   icon: Eye },
  reviewed:  { label: 'Active Baseline', color: 'text-green-300', bg: 'bg-green-500/20', icon: CheckCircle },
  locked:    { label: 'Active Baseline', color: 'text-green-300', bg: 'bg-green-500/20', icon: CheckCircle },
};

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

export default function SCCQuoteImport() {
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

    await supabase
      .from('scc_quote_imports')
      .update({
        status: 'parsed',
        parsed_line_count: items.length,
        total_value: total,
        updated_at: new Date().toISOString(),
      })
      .eq('id', importId);

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
    setImports(prev => prev.map(i => i.id === selectedImport.id ? { ...i, ...editingMeta, status: 'reviewed' } : i));
    setSelectedImport(prev => prev ? { ...prev, ...editingMeta, status: 'reviewed' } : null);
    setSaving(false);
  };

  const includedCount = lineItems.filter(l => l.include_in_baseline && !l.is_excluded).length;
  const includedTotal = lineItems
    .filter(l => l.include_in_baseline && !l.is_excluded)
    .reduce((s, l) => s + (l.total_amount || 0), 0);

  if (view === 'review' && selectedImport) {
    const cfg = STATUS_CONFIG[selectedImport.status] || STATUS_CONFIG.uploaded;
    const activeJob = activeJobs[selectedImport.id];
    const isParsing = selectedImport.status === 'parsing' || !!activeJob;
    const isActive = selectedImport.status === 'reviewed' || selectedImport.status === 'locked';

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => { setView('list'); if (pollingRef.current) clearInterval(pollingRef.current); }} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
            <ChevronRight size={16} className="rotate-180" /> Back
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium">{selectedImport.file_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
        </div>

        {isParsing && activeJob && (
          <div className="flex items-center gap-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-4">
            <Loader2 size={20} className="text-yellow-400 animate-spin flex-shrink-0" />
            <div className="flex-1">
              <p className="text-yellow-300 font-semibold text-sm">Parsing in progress — {activeJob.progress}%</p>
              <p className="text-yellow-400/70 text-xs mt-0.5">
                Using the same AI parsing engine as the main quote audit platform. This may take 15–60 seconds.
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-4">Quote Details</h3>
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
              {!isParsing && (
                <button onClick={saveMeta} disabled={saving} className="mt-4 w-full py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Saving…' : isActive ? 'Update Details' : 'Save & Set as Active Baseline'}
                </button>
              )}
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-3">Baseline Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Lines</span>
                  <span className="text-white font-medium">{isParsing ? '…' : lineItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Included</span>
                  <span className="text-green-400 font-medium">{isParsing ? '…' : includedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Excluded</span>
                  <span className="text-red-400 font-medium">{isParsing ? '…' : lineItems.length - includedCount}</span>
                </div>
                <div className="border-t border-slate-700/50 pt-2 flex justify-between">
                  <span className="text-gray-400">Baseline Value</span>
                  <span className="text-cyan-400 font-bold">{isParsing ? '…' : fmt(includedTotal)}</span>
                </div>
              </div>
              {isActive && (
                <div className="mt-3 flex items-center gap-2 text-green-400 text-xs">
                  <CheckCircle size={13} />
                  <span>Active baseline — adjustable at any time</span>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h3 className="font-semibold text-white">Parsed Line Items</h3>
              <div className="flex items-center gap-2">
                {(loadingLines || isParsing) && <Loader2 size={16} className="animate-spin text-cyan-400" />}
                {!isParsing && lineItems.length > 0 && !loadingLines && (
                  <span className="text-xs text-gray-500">{lineItems.length} items</span>
                )}
              </div>
            </div>

            {isParsing ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="relative mb-6">
                  <div className="w-16 h-16 bg-yellow-500/10 rounded-2xl flex items-center justify-center">
                    <Loader2 size={32} className="text-yellow-400 animate-spin" />
                  </div>
                </div>
                <p className="text-white font-semibold text-lg mb-2">AI Parsing in Progress</p>
                <p className="text-gray-400 text-sm max-w-sm">
                  The quote is being parsed using VerifyTrade's AI extraction engine. Line items will appear here automatically once complete.
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Quote Import</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {imports[0]?.status === 'parsing' ? 'AI is parsing your quote' :
             imports[0]?.status === 'parsed' ? 'Review and adjust the extracted line items' :
             imports[0]?.status === 'reviewed' || imports[0]?.status === 'locked' ? 'Active baseline — adjustable at any time via Review' :
             'Import your awarded quote as the contract baseline'}
          </p>
        </div>
      </div>

      {/* Workflow Steps Banner */}
      {(() => {
        const latestImport = imports[0] ?? null;
        const statusToStep: Record<string, number> = {
          uploaded: 1, parsing: 2, parsed: 3, reviewed: 4, locked: 4,
        };
        const currentStep = latestImport ? (statusToStep[latestImport.status] ?? 1) : 1;
        const steps = [
          { num: 1, label: 'Import Quote',    desc: 'Upload PDF or Excel' },
          { num: 2, label: 'AI Parsing',       desc: 'Auto-extract line items' },
          { num: 3, label: 'Review Lines',     desc: 'Check & adjust data' },
          { num: 4, label: 'Active Baseline',  desc: 'Flexible baseline set' },
        ];
        const handleStepClick = (stepNum: number) => {
          if (!latestImport) return;
          if (stepNum === 1) { setView('list'); return; }
          if (stepNum <= currentStep) {
            setSelectedImport(latestImport);
            setEditingMeta({
              main_contractor: latestImport.main_contractor || '',
              project_name: latestImport.project_name || '',
              quote_reference: latestImport.quote_reference || '',
              trade_type: latestImport.trade_type || '',
            });
            setView('review');
          }
        };
        return (
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-5">
            <div className="flex items-center gap-6 overflow-x-auto pb-1">
              {steps.map((step, i) => {
                const isActive = step.num === currentStep;
                const isCompleted = step.num < currentStep;
                const isClickable = latestImport && step.num <= currentStep;
                return (
                  <div key={step.num} className="flex items-center gap-4 flex-shrink-0">
                    <button
                      onClick={() => handleStepClick(step.num)}
                      disabled={!isClickable}
                      className={`flex items-center gap-3 text-left transition-opacity ${isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default opacity-40'}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                        isActive ? 'bg-cyan-500 text-white' :
                        isCompleted ? 'bg-cyan-800 text-cyan-300' :
                        'bg-slate-700 text-gray-500'
                      }`}>
                        {isCompleted ? <CheckCircle size={16} /> : step.num}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${isActive ? 'text-white' : isCompleted ? 'text-cyan-400' : 'text-gray-500'}`}>{step.label}</p>
                        <p className="text-xs text-gray-600">{step.desc}</p>
                      </div>
                    </button>
                    {i < steps.length - 1 && <ChevronRight size={16} className="text-gray-700 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Upload form */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">Upload a Quote</h3>
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
        <p className="text-xs text-gray-500 mt-2">Supports PDF, Excel (.xlsx, .xls), and CSV — same parsing engine as the main platform</p>
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : imports.length === 0 ? (
        <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-2xl p-16 text-center">
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Upload size={32} className="text-gray-600" />
          </div>
          <p className="text-white font-semibold text-lg mb-2">No imports yet</p>
          <p className="text-gray-400 text-sm max-w-sm mx-auto">
            Enter a supplier name above and upload the quote you submitted to the main contractor. The AI engine will extract all line items automatically.
          </p>
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
            <h3 className="font-semibold text-white">{imports.length} Import{imports.length !== 1 ? 's' : ''}</h3>
            <button onClick={loadImports} className="text-gray-500 hover:text-white transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
          <div className="divide-y divide-slate-700/30">
            {imports.map(imp => {
              const cfg = STATUS_CONFIG[imp.status] || STATUS_CONFIG.uploaded;
              const Icon = cfg.icon;
              const job = activeJobs[imp.id];

              return (
                <div key={imp.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-700/20 transition-colors">
                  <div className={`w-10 h-10 ${cfg.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    {job && (job.status === 'pending' || job.status === 'processing')
                      ? <Loader2 size={18} className="text-yellow-400 animate-spin" />
                      : <Icon size={18} className={cfg.color} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-white truncate">{imp.file_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color} flex-shrink-0`}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {imp.project_name && <span>{imp.project_name}</span>}
                      {imp.main_contractor && <span>{imp.main_contractor}</span>}
                      {imp.parsed_line_count > 0 && <span>{imp.parsed_line_count} lines</span>}
                      {imp.total_value != null && <span className="text-cyan-400 font-medium">{fmt(imp.total_value)}</span>}
                      {job && (job.status === 'pending' || job.status === 'processing') && (
                        <span className="text-yellow-400">{job.progress}% parsed</span>
                      )}
                    </div>
                    {job && (job.status === 'pending' || job.status === 'processing') && (
                      <div className="mt-1.5 w-48 bg-slate-700/50 rounded-full h-1">
                        <div className="h-1 bg-yellow-400 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {imp.status !== 'parsing' && (
                      <button
                        onClick={() => openReview(imp)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-cyan-400 hover:text-white hover:bg-cyan-500/10 rounded-lg transition-colors"
                      >
                        <Eye size={14} />
                        Review
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
