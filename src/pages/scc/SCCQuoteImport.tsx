import { useState, useEffect, useRef } from 'react';
import {
  Upload, FileText, CheckCircle, AlertCircle, Clock, Lock,
  ChevronRight, Eye, Trash2, RefreshCw, Plus, Package,
  Percent, Hash, ToggleLeft, ToggleRight, ArrowRight
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ size: number; className?: string }> }> = {
  uploaded:  { label: 'Uploaded',  color: 'text-gray-300',   bg: 'bg-gray-500/20',   icon: Clock },
  parsing:   { label: 'Parsing',   color: 'text-yellow-300', bg: 'bg-yellow-500/20', icon: RefreshCw },
  parsed:    { label: 'Parsed',    color: 'text-blue-300',   bg: 'bg-blue-500/20',   icon: Eye },
  reviewed:  { label: 'Reviewed',  color: 'text-green-300',  bg: 'bg-green-500/20',  icon: CheckCircle },
  locked:    { label: 'Locked',    color: 'text-cyan-300',   bg: 'bg-cyan-500/20',   icon: Lock },
};

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

export default function SCCQuoteImport({ onContinue }: { onContinue?: (importId: string) => void }) {
  const { currentOrganisation } = useOrganisation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imports, setImports] = useState<QuoteImport[]>([]);
  const [selectedImport, setSelectedImport] = useState<QuoteImport | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [view, setView] = useState<'list' | 'review'>('list');
  const [editingMeta, setEditingMeta] = useState<Partial<QuoteImport>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentOrganisation?.id) loadImports();
  }, [currentOrganisation?.id]);

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentOrganisation?.id) return;
    setUploading(true);
    try {
      const path = `scc-quotes/${currentOrganisation.id}/${Date.now()}_${file.name}`;
      let fileUrl: string | null = null;
      const { error: uploadError } = await supabase.storage.from('quote-files').upload(path, file);
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('quote-files').getPublicUrl(path);
        fileUrl = urlData.publicUrl;
      }
      const { data: importData, error } = await supabase
        .from('scc_quote_imports')
        .insert({
          organisation_id: currentOrganisation.id,
          file_name: file.name,
          file_url: fileUrl,
          file_size_bytes: file.size,
          status: 'uploaded',
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      setImports(prev => [importData, ...prev]);
    } catch (err) {
      console.error('Upload error:', err);
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
  };

  const toggleLineInclude = async (lineId: string, current: boolean) => {
    await supabase
      .from('scc_quote_line_items')
      .update({ include_in_baseline: !current })
      .eq('id', lineId);
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

  const lockAsBaseline = async () => {
    if (!selectedImport) return;
    setSaving(true);
    await supabase
      .from('scc_quote_imports')
      .update({ status: 'locked', locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', selectedImport.id);
    setImports(prev => prev.map(i => i.id === selectedImport.id ? { ...i, status: 'locked' } : i));
    setSelectedImport(prev => prev ? { ...prev, status: 'locked' } : null);
    setSaving(false);
    if (onContinue) onContinue(selectedImport.id);
  };

  const includedCount = lineItems.filter(l => l.include_in_baseline && !l.is_excluded).length;
  const includedTotal = lineItems
    .filter(l => l.include_in_baseline && !l.is_excluded)
    .reduce((s, l) => s + (l.total_amount || 0), 0);

  if (view === 'review' && selectedImport) {
    const cfg = STATUS_CONFIG[selectedImport.status] || STATUS_CONFIG.uploaded;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
            <ChevronRight size={16} className="rotate-180" /> Back
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium">{selectedImport.file_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Metadata Panel */}
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
                      disabled={selectedImport.status === 'locked'}
                      className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                ))}
              </div>
              {selectedImport.status !== 'locked' && (
                <button
                  onClick={saveMeta}
                  disabled={saving}
                  className="mt-4 w-full py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Details'}
                </button>
              )}
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="font-semibold text-white mb-3">Baseline Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Lines</span>
                  <span className="text-white font-medium">{lineItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Included</span>
                  <span className="text-green-400 font-medium">{includedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Excluded</span>
                  <span className="text-red-400 font-medium">{lineItems.length - includedCount}</span>
                </div>
                <div className="border-t border-slate-700/50 pt-2 flex justify-between">
                  <span className="text-gray-400">Baseline Value</span>
                  <span className="text-cyan-400 font-bold">{fmt(includedTotal)}</span>
                </div>
              </div>
            </div>

            {selectedImport.status !== 'locked' && (
              <button
                onClick={lockAsBaseline}
                disabled={saving || includedCount === 0}
                className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Lock size={16} />
                Lock as Contract Baseline
              </button>
            )}

            {selectedImport.status === 'locked' && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                <CheckCircle size={24} className="text-green-400 mx-auto mb-2" />
                <p className="text-green-300 font-semibold text-sm">Baseline Locked</p>
                <p className="text-green-400/70 text-xs mt-1">This quote is locked as the contract baseline.</p>
                {onContinue && (
                  <button
                    onClick={() => onContinue(selectedImport.id)}
                    className="mt-3 flex items-center gap-2 mx-auto px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm rounded-lg transition-colors"
                  >
                    Continue to Contract Setup <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
              <h3 className="font-semibold text-white">Quote Line Items</h3>
              {loadingLines && <RefreshCw size={16} className="animate-spin text-cyan-400" />}
            </div>
            {lineItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <Package size={40} className="text-gray-600 mb-3" />
                <p className="text-gray-400 font-medium">No line items extracted yet</p>
                <p className="text-gray-500 text-sm mt-1">
                  Line items will appear here once the quote has been parsed.
                  You can manually add items or use AI parsing.
                </p>
                <button
                  onClick={() => {
                    supabase.from('scc_quote_line_items').insert([
                      { import_id: selectedImport.id, organisation_id: currentOrganisation?.id, description: 'Sample line item — edit or replace', unit: 'item', quantity: 1, unit_rate: 0, total_amount: 0, include_in_baseline: true, confidence_score: 1.0 }
                    ]).then(() => loadLineItems(selectedImport.id));
                  }}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm rounded-lg transition-colors"
                >
                  <Plus size={14} /> Add Manual Line Item
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
                      <th className="text-center px-4 py-3 text-gray-400 font-medium">Flags</th>
                      <th className="text-center px-4 py-3 text-gray-400 font-medium">Include</th>
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
                          <div className="text-white text-sm">{line.description}</div>
                          {line.scope_category && <div className="text-gray-500 text-xs">{line.scope_category}</div>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{line.quantity ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{line.unit || '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {line.unit_rate != null ? `$${line.unit_rate.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-white">{fmt(line.total_amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {line.is_provisional && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded">PROV</span>}
                            {line.is_pc_sum && <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">PC</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {selectedImport.status !== 'locked' ? (
                            <button
                              onClick={() => toggleLineInclude(line.id, line.include_in_baseline)}
                              className="text-gray-400 hover:text-white transition-colors"
                            >
                              {line.include_in_baseline
                                ? <ToggleRight size={20} className="text-cyan-400" />
                                : <ToggleLeft size={20} className="text-gray-600" />}
                            </button>
                          ) : (
                            line.include_in_baseline
                              ? <CheckCircle size={16} className="text-green-400 mx-auto" />
                              : <span className="text-gray-600 text-xs">excluded</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700/50 bg-slate-900/30">
                      <td colSpan={5} className="px-4 py-3 text-right text-gray-400 text-sm font-medium">
                        Baseline Total ({includedCount} lines)
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-cyan-400">{fmt(includedTotal)}</td>
                      <td colSpan={2} />
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
          <p className="text-sm text-gray-400 mt-0.5">Step 1 — Import your approved quote as the contract baseline</p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? 'Uploading...' : 'Import Quote'}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
      </div>

      {/* Workflow Steps Banner */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-5">
        <div className="flex items-center gap-6 overflow-x-auto pb-1">
          {[
            { num: 1, label: 'Import Quote', desc: 'Upload PDF or Excel', active: true },
            { num: 2, label: 'Review Lines', desc: 'Check & clean data' },
            { num: 3, label: 'Lock Baseline', desc: 'Freeze as contract truth' },
            { num: 4, label: 'Build Tracker', desc: 'Auto-populate scope lines' },
          ].map((step, i) => (
            <div key={step.num} className="flex items-center gap-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step.active ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-gray-500'}`}>
                  {step.num}
                </div>
                <div>
                  <p className={`text-sm font-medium ${step.active ? 'text-white' : 'text-gray-500'}`}>{step.label}</p>
                  <p className="text-xs text-gray-600">{step.desc}</p>
                </div>
              </div>
              {i < 3 && <ChevronRight size={16} className="text-gray-700 flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-cyan-400" />
        </div>
      ) : imports.length === 0 ? (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-2xl p-16 text-center cursor-pointer transition-colors group"
        >
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-cyan-500/10 transition-colors">
            <Upload size={32} className="text-gray-600 group-hover:text-cyan-400 transition-colors" />
          </div>
          <p className="text-white font-semibold text-lg mb-2">Import your approved quote</p>
          <p className="text-gray-400 text-sm max-w-sm mx-auto">
            Upload the quote you submitted to the main contractor. Supports PDF, Excel (.xlsx), and CSV formats.
          </p>
          <p className="text-gray-600 text-xs mt-3">Click anywhere or drag & drop your file</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
            <h3 className="font-semibold text-white">{imports.length} Import{imports.length !== 1 ? 's' : ''}</h3>
          </div>
          <div className="divide-y divide-slate-700/30">
            {imports.map(imp => {
              const cfg = STATUS_CONFIG[imp.status] || STATUS_CONFIG.uploaded;
              const Icon = cfg.icon;
              return (
                <div key={imp.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-700/20 transition-colors">
                  <div className={`w-10 h-10 ${cfg.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon size={18} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-white truncate">{imp.file_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.color} flex-shrink-0`}>{cfg.label}</span>
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-3">
                      {imp.project_name && <span>{imp.project_name}</span>}
                      {imp.main_contractor && <span>{imp.main_contractor}</span>}
                      {imp.parsed_line_count > 0 && <span>{imp.parsed_line_count} lines</span>}
                      {imp.total_value && <span className="text-cyan-400">{fmt(imp.total_value)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openReview(imp)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-cyan-400 hover:text-white hover:bg-cyan-500/10 rounded-lg transition-colors"
                    >
                      <Eye size={14} />
                      {imp.status === 'locked' ? 'View' : 'Review'}
                    </button>
                    {imp.status === 'locked' && onContinue && (
                      <button
                        onClick={() => onContinue(imp.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-cyan-500 hover:bg-cyan-600 rounded-lg transition-colors"
                      >
                        Continue <ArrowRight size={14} />
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
