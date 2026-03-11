import { useState, useEffect } from 'react';
import { X, FileText, CheckCircle, Loader2, ChevronRight, AlertTriangle, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SccImport {
  id: string;
  file_name: string;
  quote_reference: string | null;
  project_name: string | null;
  main_contractor: string | null;
  trade_type: string | null;
  parsed_line_count: number;
  total_value: number | null;
  status: string;
  created_at: string;
}

interface SccLineItem {
  id: string;
  line_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  unit_rate: number | null;
  total_amount: number | null;
  scope_category: string | null;
  include_in_baseline: boolean;
  is_excluded: boolean;
}

interface BTImportFromQuoteModalProps {
  organisationId: string;
  baselineHeaderId: string;
  onImported: () => void;
  onClose: () => void;
}

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

export default function BTImportFromQuoteModal({
  organisationId,
  baselineHeaderId,
  onImported,
  onClose,
}: BTImportFromQuoteModalProps) {
  const [step, setStep] = useState<'select' | 'preview'>('select');
  const [imports, setImports] = useState<SccImport[]>([]);
  const [loadingImports, setLoadingImports] = useState(true);
  const [selectedImport, setSelectedImport] = useState<SccImport | null>(null);
  const [lineItems, setLineItems] = useState<SccLineItem[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadImports();
  }, []);

  const loadImports = async () => {
    setLoadingImports(true);
    const { data } = await supabase
      .from('scc_quote_imports')
      .select('id, file_name, quote_reference, project_name, main_contractor, trade_type, parsed_line_count, total_value, status, created_at')
      .eq('organisation_id', organisationId)
      .in('status', ['parsed', 'reviewed', 'locked'])
      .gt('parsed_line_count', 0)
      .order('created_at', { ascending: false });
    setImports(data || []);
    setLoadingImports(false);
  };

  const handleSelectImport = async (imp: SccImport) => {
    setSelectedImport(imp);
    setLoadingLines(true);
    const { data } = await supabase
      .from('scc_quote_line_items')
      .select('id, line_number, description, unit, quantity, unit_rate, total_amount, scope_category, include_in_baseline, is_excluded')
      .eq('import_id', imp.id)
      .order('created_at', { ascending: true });
    const items = data || [];
    setLineItems(items);
    const initial: Record<string, boolean> = {};
    items.forEach(l => {
      initial[l.id] = l.include_in_baseline && !l.is_excluded;
    });
    setToggles(initial);
    setLoadingLines(false);
    setStep('preview');
  };

  const toggleItem = (id: string) => {
    setToggles(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedCount = Object.values(toggles).filter(Boolean).length;
  const selectedTotal = lineItems
    .filter(l => toggles[l.id])
    .reduce((s, l) => s + (l.total_amount || 0), 0);

  const handleImport = async () => {
    if (!selectedImport || selectedCount === 0) return;
    setImporting(true);

    const { data: user } = await supabase.auth.getUser();
    const itemsToImport = lineItems.filter(l => toggles[l.id]);

    const rows = itemsToImport.map((item, idx) => ({
      baseline_header_id: baselineHeaderId,
      organisation_id: organisationId,
      line_number: item.line_number || String(idx + 1).padStart(3, '0'),
      trade_category: item.scope_category || null,
      item_title: item.description,
      unit: item.unit || 'No.',
      baseline_quantity: item.quantity ?? 1,
      baseline_rate: item.unit_rate ?? 0,
      claim_method: 'quantity_based' as const,
      display_order: idx + 1,
      source_reference: item.id,
    }));

    const { error } = await supabase.from('bt_baseline_line_items').insert(rows);
    if (error) {
      alert(`Import failed: ${error.message}`);
      setImporting(false);
      return;
    }

    await supabase.from('bt_baseline_headers').update({
      scc_import_id: selectedImport.id,
      awarded_quote_reference: selectedImport.quote_reference || selectedImport.file_name,
    }).eq('id', baselineHeaderId);

    await supabase.from('bt_activity_logs').insert({
      organisation_id: organisationId,
      project_id: (await supabase.from('bt_baseline_headers').select('project_id').eq('id', baselineHeaderId).maybeSingle()).data?.project_id,
      entity_type: 'baseline',
      entity_id: baselineHeaderId,
      action_type: 'baseline_imported',
      action_label: `Baseline established from quote: ${selectedImport.quote_reference || selectedImport.file_name} — ${selectedCount} lines, ${fmt(selectedTotal)} excl. GST`,
      action_by: user.user?.id,
    });

    setImporting(false);
    onImported();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step === 'preview' && (
              <button onClick={() => setStep('select')} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                <ChevronRight size={16} className="rotate-180" />
              </button>
            )}
            <div>
              <h2 className="text-base font-semibold text-white">
                {step === 'select' ? 'Select Quote Import' : 'Preview Baseline Lines'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {step === 'select'
                  ? 'Choose a parsed quote to establish the baseline from'
                  : `${selectedImport?.file_name} — review and confirm lines to import`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step 1: Select */}
          {step === 'select' && (
            loadingImports ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-cyan-400" />
              </div>
            ) : imports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertTriangle size={32} className="text-amber-400 mb-3" />
                <p className="text-white font-medium mb-1">No parsed quotes available</p>
                <p className="text-slate-400 text-sm max-w-sm">
                  Import and parse a quote in the Quote Import section first, then return here to establish your baseline.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {imports.map(imp => (
                  <button
                    key={imp.id}
                    onClick={() => handleSelectImport(imp)}
                    className="w-full text-left rounded-xl border border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60 hover:border-cyan-700/50 p-4 transition-colors group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-cyan-900/50 transition-colors">
                          <FileText size={16} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{imp.file_name}</p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {imp.quote_reference && (
                              <span className="text-xs text-slate-400">Ref: {imp.quote_reference}</span>
                            )}
                            {imp.main_contractor && (
                              <span className="text-xs text-slate-400">{imp.main_contractor}</span>
                            )}
                            {imp.trade_type && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{imp.trade_type}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-sm font-semibold text-cyan-400">{fmt(imp.total_value)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{imp.parsed_line_count} lines</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            loadingLines ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-cyan-400" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-800/40 rounded-xl px-4 py-3">
                  <div className="text-sm text-slate-300">
                    <span className="font-semibold text-white">{selectedCount}</span> of {lineItems.length} lines selected
                  </div>
                  <div className="text-sm font-bold text-cyan-400">{fmt(selectedTotal)}</div>
                </div>

                <div className="rounded-xl border border-slate-700/60 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800/60 border-b border-slate-700/60">
                        <th className="text-left px-3 py-2.5 text-slate-400 font-medium">#</th>
                        <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Description</th>
                        <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Category</th>
                        <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Qty</th>
                        <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Unit</th>
                        <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Rate</th>
                        <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Total</th>
                        <th className="text-center px-3 py-2.5 text-slate-400 font-medium w-16">Include</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {lineItems.map((line, idx) => (
                        <tr
                          key={line.id}
                          className={`transition-colors ${
                            !toggles[line.id] ? 'opacity-40 bg-red-500/5' : 'hover:bg-slate-800/30'
                          }`}
                        >
                          <td className="px-3 py-2 text-slate-500 font-mono">{line.line_number || idx + 1}</td>
                          <td className="px-3 py-2 text-slate-200 max-w-xs">
                            <div className="truncate">{line.description}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-500">{line.scope_category || '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-300">{line.quantity ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-400">{line.unit || '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-300">
                            {line.unit_rate != null ? `$${line.unit_rate.toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-white">{fmt(line.total_amount)}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => toggleItem(line.id)}>
                              {toggles[line.id]
                                ? <ToggleRight size={18} className="text-cyan-400" />
                                : <ToggleLeft size={18} className="text-slate-600" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-800/40 border-t border-slate-700/60">
                        <td colSpan={6} className="px-3 py-2.5 text-right text-slate-400 font-medium">
                          Baseline Total ({selectedCount} of {lineItems.length} lines)
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-cyan-400">{fmt(selectedTotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && !loadingLines && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/60 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <CheckCircle size={13} className="text-green-400" />
              {selectedCount} lines will be added as baseline items
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || selectedCount === 0}
                className="flex items-center gap-2 px-5 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {importing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                {importing ? 'Importing…' : `Establish Baseline (${selectedCount} lines)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
