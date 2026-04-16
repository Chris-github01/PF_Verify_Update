import { useState, useEffect } from 'react';
import { CheckSquare, Square, Info, ArrowRight, AlertCircle, CheckCircle, Layers, FlaskConical, X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTrade } from '../lib/tradeContext';
import { classifyParsedQuoteRows } from '../lib/classification/classifyParsedQuoteRows';
import type { DashboardMode } from '../App';

interface ParsedItem {
  id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  service: string | null;
  frr: string | null;
  mapped_service_type: string | null;
  mapped_system: string | null;
  confidence: number | null;
  scope_category: string | null;
  source: string | null;
  is_excluded: boolean | null;
  subclass: string | null;
  size: string | null;
}

function ParseResultsModal({ quoteId, quoteName, onClose }: { quoteId: string; quoteName: string; onClose: () => void }) {
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const { data, error } = await supabase
          .from('quote_items')
          .select('id, description, quantity, unit, unit_price, total_price, service, frr, mapped_service_type, mapped_system, confidence, scope_category, source, is_excluded, subclass, size')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: true })
          .limit(2000);
        if (error) throw error;
        setItems(data ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load items');
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [quoteId]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = items.filter(item =>
    !filter || item.description?.toLowerCase().includes(filter.toLowerCase()) ||
    item.service?.toLowerCase().includes(filter.toLowerCase()) ||
    item.mapped_service_type?.toLowerCase().includes(filter.toLowerCase()) ||
    item.mapped_system?.toLowerCase().includes(filter.toLowerCase())
  );

  const totalValue = items.reduce((sum, i) => sum + Number(i.total_price ?? 0), 0);
  const pricedCount = items.filter(i => Number(i.total_price ?? 0) > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <FlaskConical size={18} className="text-amber-400" />
              <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Parse Results</span>
            </div>
            <h2 className="text-lg font-bold text-slate-100">{quoteName}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {!loading && !error && (
          <div className="px-6 py-3 border-b border-slate-700/50 flex items-center gap-6 flex-shrink-0 bg-slate-800/40">
            <div className="text-sm"><span className="text-slate-400">Total Items:</span> <span className="font-semibold text-slate-100">{items.length}</span></div>
            <div className="text-sm"><span className="text-slate-400">Priced:</span> <span className="font-semibold text-emerald-400">{pricedCount}</span></div>
            <div className="text-sm"><span className="text-slate-400">Total Value:</span> <span className="font-semibold text-slate-100">${totalValue.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div className="ml-auto">
              <input
                type="text"
                placeholder="Filter items..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 w-48"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400" />
            </div>
          )}
          {error && (
            <div className="p-6 text-red-400 text-sm">{error}</div>
          )}
          {!loading && !error && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800 z-10">
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
                  <th className="px-4 py-2 w-8">#</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2">Unit</th>
                  <th className="px-4 py-2 text-right">Unit Price</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Service</th>
                  <th className="px-4 py-2">FRR</th>
                  <th className="px-4 py-2">Mapped Type</th>
                  <th className="px-4 py-2 text-right">Conf.</th>
                  <th className="px-4 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((item, idx) => (
                  <>
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                      onClick={() => toggleRow(item.id)}
                    >
                      <td className="px-4 py-2 text-slate-500 text-xs">{idx + 1}</td>
                      <td className="px-4 py-2 text-slate-200 max-w-xs">
                        <div className="truncate">{item.description || <span className="text-slate-600 italic">—</span>}</div>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-300">
                        {item.quantity != null ? item.quantity : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-slate-400 text-xs">
                        {item.unit || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-300">
                        {item.unit_price != null
                          ? `$${Number(item.unit_price).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">
                        {item.total_price != null && Number(item.total_price) > 0
                          ? <span className="text-emerald-400">${Number(item.total_price).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        {item.service
                          ? <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">{item.service}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">
                        {item.frr || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400">
                        {item.mapped_service_type || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-xs">
                        {item.confidence != null
                          ? <span className={item.confidence >= 0.8 ? 'text-emerald-400' : item.confidence >= 0.5 ? 'text-amber-400' : 'text-red-400'}>
                              {Math.round(item.confidence * 100)}%
                            </span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {expandedRows.has(item.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {expandedRows.has(item.id) && (
                      <tr key={`${item.id}-expanded`} className="bg-slate-800/30">
                        <td />
                        <td colSpan={10} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div><span className="text-slate-500">Mapped System:</span> <span className="text-slate-300">{item.mapped_system || '—'}</span></div>
                            <div><span className="text-slate-500">Scope Category:</span> <span className="text-slate-300">{item.scope_category || '—'}</span></div>
                            <div><span className="text-slate-500">Subclass:</span> <span className="text-slate-300">{item.subclass || '—'}</span></div>
                            <div><span className="text-slate-500">Size:</span> <span className="text-slate-300">{item.size || '—'}</span></div>
                            <div><span className="text-slate-500">Source:</span> <span className="text-slate-300">{item.source || '—'}</span></div>
                            <div><span className="text-slate-500">Excluded:</span> <span className={item.is_excluded ? 'text-red-400' : 'text-slate-300'}>{item.is_excluded ? 'Yes' : 'No'}</span></div>
                            <div className="col-span-2"><span className="text-slate-500">Full Description:</span> <span className="text-slate-300">{item.description || '—'}</span></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-slate-500">No items match your filter</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-700 flex-shrink-0 flex items-center justify-between">
          <span className="text-xs text-slate-500">Showing {filtered.length} of {items.length} items</span>
          <button onClick={onClose} className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

interface Quote {
  id: string;
  supplier_name: string;
  quote_reference: string;
  total_amount: number;
  document_total?: number;
  levels_multiplier?: number;
  items_count: number;
  final_items_count?: number;
  inserted_items_count?: number;
  status: string;
  is_selected: boolean;
  file_name?: string;
  quoted_total?: number;
  main_scope_total?: number;
  main_scope_count?: number;
}

interface QuoteSelectProps {
  projectId: string;
  onNavigateBack?: () => void;
  onNavigateNext?: () => void;
  dashboardMode?: DashboardMode;
}

export default function QuoteSelect({
  projectId,
  onNavigateBack,
  onNavigateNext,
  dashboardMode = 'original'
}: QuoteSelectProps) {
  const { currentTrade } = useTrade();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [parseModal, setParseModal] = useState<{ quoteId: string; quoteName: string } | null>(null);

  useEffect(() => {
    loadQuotes();
  }, [projectId, dashboardMode, currentTrade]);

  const loadQuotes = async () => {
    setLoading(true);
    try {
      const { data: allQuotes, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('project_id', projectId)
        .eq('trade', currentTrade)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const filteredQuotes = allQuotes?.filter(q => {
        const revisionNumber = q.revision_number ?? 1;
        if (dashboardMode === 'original') {
          return revisionNumber === 1;
        } else {
          return revisionNumber > 1;
        }
      }) || [];

      const quoteIds = filteredQuotes.map(q => q.id);
      let itemsByQuote: Record<string, { quantity: number; unit_price: number; total_price: number; description: string }[]> = {};

      if (quoteIds.length > 0) {
        const { data: allItems } = await supabase
          .from('quote_items')
          .select('quote_id, description, quantity, unit_price, total_price')
          .in('quote_id', quoteIds)
          .limit(5000);

        if (allItems) {
          for (const item of allItems) {
            if (!itemsByQuote[item.quote_id]) itemsByQuote[item.quote_id] = [];
            itemsByQuote[item.quote_id].push(item);
          }
        }
      }

      const isPassiveFire = currentTrade === 'passive_fire';

      const quotesWithCounts = filteredQuotes.map(quote => {
        const rawItems = itemsByQuote[quote.id] ?? [];

        let main_scope_total: number;
        let main_scope_count: number;

        if (isPassiveFire) {
          const { summary } = classifyParsedQuoteRows(rawItems);
          main_scope_total = summary.main_scope_total;
          main_scope_count = summary.counts.main_scope;
        } else if (quote.levels_multiplier && quote.document_total) {
          main_scope_total = Number(quote.document_total);
          const pricedCount = rawItems.filter(item => Number(item.total_price ?? 0) > 0).length;
          main_scope_count = pricedCount > 0 ? pricedCount : (quote.inserted_items_count ?? quote.items_count ?? 0);
        } else {
          const priced = rawItems.filter(item => Number(item.total_price ?? 0) > 0);
          main_scope_total = priced.reduce((sum, item) => sum + Number(item.total_price ?? 0), 0);
          main_scope_count = priced.length;
        }

        return {
          ...quote,
          items_count: (quote.inserted_items_count && quote.inserted_items_count > 0)
            ? quote.inserted_items_count
            : (quote.final_items_count && quote.final_items_count > 0)
            ? quote.final_items_count
            : quote.items_count ?? 0,
          main_scope_total,
          main_scope_count,
        };
      });

      setQuotes(quotesWithCounts);
      setMessage(null);
    } catch (error) {
      console.error('Error loading quotes:', error);
      setMessage({ type: 'error', text: `Failed to load quotes: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setLoading(false);
    }
  };

  const toggleQuoteSelection = async (quoteId: string) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;

    const newIsSelected = !quote.is_selected;

    try {
      const { error } = await supabase
        .from('quotes')
        .update({ is_selected: newIsSelected })
        .eq('id', quoteId);

      if (error) throw error;

      setQuotes(quotes.map(q =>
        q.id === quoteId ? { ...q, is_selected: newIsSelected } : q
      ));
    } catch (error) {
      console.error('Error updating quote selection:', error);
      setMessage({ type: 'error', text: 'Failed to update quote selection' });
    }
  };

  const selectAll = async () => {
    setSaving(true);
    try {
      const quoteIds = quotes.map(q => q.id);
      const { error } = await supabase
        .from('quotes')
        .update({ is_selected: true })
        .in('id', quoteIds);

      if (error) throw error;

      setQuotes(quotes.map(q => ({ ...q, is_selected: true })));
      setMessage({ type: 'success', text: 'All quotes selected' });
    } catch (error) {
      console.error('Error selecting all quotes:', error);
      setMessage({ type: 'error', text: 'Failed to select all quotes' });
    } finally {
      setSaving(false);
    }
  };

  const deselectAll = async () => {
    setSaving(true);
    try {
      const quoteIds = quotes.map(q => q.id);
      const { error } = await supabase
        .from('quotes')
        .update({ is_selected: false })
        .in('id', quoteIds);

      if (error) throw error;

      setQuotes(quotes.map(q => ({ ...q, is_selected: false })));
      setMessage({ type: 'success', text: 'All quotes deselected' });
    } catch (error) {
      console.error('Error deselecting all quotes:', error);
      setMessage({ type: 'error', text: 'Failed to deselect all quotes' });
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = quotes.filter(q => q.is_selected).length;
  const totalCount = quotes.length;
  const canProceed = selectedCount > 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed':
      case 'ready':
      case 'accepted':
      case 'awarded':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'processing':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'processed':
      case 'accepted':
      case 'awarded':
        return 'Ready';
      case 'ready':
        return 'Ready';
      case 'processing':
        return 'Processing';
      case 'failed':
        return 'Failed';
      default:
        return 'Ready';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading quotes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full">
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
            <CheckSquare className="text-orange-400" size={20} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-100">Select Quotes</h2>
            <p className="text-sm text-slate-400">
              Choose which quotes you want to clean, map, and include in your analysis
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mb-6">
          <button
            onClick={selectAll}
            disabled={saving || totalCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors text-sm"
          >
            <CheckSquare size={16} />
            Select All
          </button>
          <button
            onClick={deselectAll}
            disabled={saving || totalCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-300 rounded-lg font-medium transition-colors text-sm"
          >
            <Square size={16} />
            Deselect All
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-xl mb-6 ${
            message.type === 'success' ? 'bg-green-900/20 border border-green-500/30' :
            message.type === 'error' ? 'bg-red-900/20 border border-red-500/30' :
            'bg-blue-900/20 border border-blue-500/30'
          }`}>
            <div className="flex items-start gap-2">
              {message.type === 'success' ? (
                <CheckCircle size={18} className="mt-0.5 flex-shrink-0 text-green-400" />
              ) : message.type === 'error' ? (
                <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-red-400" />
              ) : (
                <Info size={18} className="mt-0.5 flex-shrink-0 text-blue-400" />
              )}
              <span className={
                message.type === 'success' ? 'text-green-300' :
                message.type === 'error' ? 'text-red-300' :
                'text-blue-300'
              }>{message.text}</span>
            </div>
          </div>
        )}

        <div className="mb-6 p-4 bg-slate-900/50 border border-slate-700/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <CheckSquare className="text-orange-400" size={20} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-100">
                  {selectedCount} of {totalCount}
                </p>
                <p className="text-sm text-slate-400">quotes selected</p>
              </div>
            </div>
            {!canProceed && (
              <div className="flex items-center gap-2 text-amber-400">
                <AlertCircle size={16} />
                <span className="text-sm">Select at least one quote to continue</span>
              </div>
            )}
          </div>
        </div>

        {quotes.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-900/50 mb-4">
              <Info className="text-slate-400" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No Quotes Found</h3>
            <p className="text-sm text-slate-500 mb-4">
              Import quotes first before selecting them for processing
            </p>
            {onNavigateBack && (
              <button
                onClick={onNavigateBack}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Go to Import Quotes
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map((quote) => (
              <div
                key={quote.id}
                className={`group relative w-full rounded-lg border transition-all ${
                  quote.is_selected
                    ? 'bg-slate-900/50 border-orange-500/50'
                    : 'bg-slate-900/30 border-slate-700/50 hover:border-slate-600/50 hover:bg-slate-900/40'
                }`}
              >
                <div className="flex items-stretch">
                  <button
                    onClick={() => toggleQuoteSelection(quote.id)}
                    className="flex-1 p-4 text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center transition-all ${
                        quote.is_selected
                          ? 'bg-orange-500 text-white'
                          : 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600'
                      }`}>
                        {quote.is_selected ? <CheckSquare size={14} /> : <Square size={14} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-slate-100 mb-0.5 truncate">
                              {quote.supplier_name}
                            </h3>
                            {quote.quote_reference && (
                              <p className="text-xs text-slate-400">
                                Reference: {quote.quote_reference}
                              </p>
                            )}
                            {quote.file_name && (
                              <p className="text-xs text-slate-500 mt-0.5 truncate">
                                {quote.file_name}
                              </p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${getStatusColor(quote.status)}`}>
                            {getStatusLabel(quote.status)}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Main Scope:</span>
                            <span className="font-semibold text-slate-100">
                              ${(quote.main_scope_total ?? quote.total_amount ?? 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Items:</span>
                            <span className="font-medium text-slate-300">
                              {(quote.main_scope_count ?? quote.items_count).toLocaleString()}
                            </span>
                          </div>
                          {quote.levels_multiplier && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-300 font-medium">
                              <Layers size={10} />
                              <span>×{quote.levels_multiplier} levels</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center px-3 border-l border-slate-700/50">
                    <button
                      onClick={() => setParseModal({ quoteId: quote.id, quoteName: quote.supplier_name })}
                      title="View parse results"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-400 text-xs font-medium transition-all whitespace-nowrap"
                    >
                      <FlaskConical size={13} />
                      Parse Results
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {canProceed && onNavigateNext && (
          <div className="mt-6 pt-6 border-t border-slate-700/50 flex justify-end">
            <button
              onClick={() => {
                // Trigger dashboard refresh when navigating
                window.dispatchEvent(new Event('refresh-dashboard'));
                onNavigateNext();
              }}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg font-medium text-sm transition-all"
            >
              Continue to Review & Clean
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>

      {parseModal && (
        <ParseResultsModal
          quoteId={parseModal.quoteId}
          quoteName={parseModal.quoteName}
          onClose={() => setParseModal(null)}
        />
      )}
    </div>
  );
}
