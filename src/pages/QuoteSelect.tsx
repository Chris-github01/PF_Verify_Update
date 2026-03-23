import { useState, useEffect } from 'react';
import { CheckSquare, Square, Info, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTrade } from '../lib/tradeContext';
import { classifyParsedQuoteRows } from '../lib/classification/classifyParsedQuoteRows';
import type { DashboardMode } from '../App';

interface Quote {
  id: string;
  supplier_name: string;
  quote_reference: string;
  total_amount: number;
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
          .in('quote_id', quoteIds);

        if (allItems) {
          for (const item of allItems) {
            if (!itemsByQuote[item.quote_id]) itemsByQuote[item.quote_id] = [];
            itemsByQuote[item.quote_id].push(item);
          }
        }
      }

      const quotesWithCounts = filteredQuotes.map(quote => {
        const rawItems = itemsByQuote[quote.id] ?? [];
        const { summary } = classifyParsedQuoteRows(rawItems);
        return {
          ...quote,
          items_count: (quote.inserted_items_count && quote.inserted_items_count > 0)
            ? quote.inserted_items_count
            : (quote.final_items_count && quote.final_items_count > 0)
            ? quote.final_items_count
            : quote.items_count ?? 0,
          main_scope_total: summary.main_scope_total,
          main_scope_count: summary.counts.main_scope,
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
              <button
                key={quote.id}
                onClick={() => toggleQuoteSelection(quote.id)}
                className={`group relative w-full p-4 rounded-lg border transition-all text-left ${
                  quote.is_selected
                    ? 'bg-slate-900/50 border-orange-500/50'
                    : 'bg-slate-900/30 border-slate-700/50 hover:border-slate-600/50 hover:bg-slate-900/40'
                }`}
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

                    <div className="flex items-center gap-4 text-xs">
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
                    </div>
                  </div>
                </div>
              </button>
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
    </div>
  );
}
