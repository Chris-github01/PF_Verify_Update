import { useState, useEffect } from 'react';
import { CheckSquare, Square, Info, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import WorkflowNav from '../components/WorkflowNav';
import type { DashboardMode } from '../App';

interface Quote {
  id: string;
  supplier_name: string;
  quote_reference: string;
  total_amount: number;
  items_count: number;
  status: string;
  is_selected: boolean;
  file_name?: string;
  quoted_total?: number;
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
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    loadQuotes();
  }, [projectId, dashboardMode]);

  const loadQuotes = async () => {
    setLoading(true);
    try {
      const { data: allQuotes, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('project_id', projectId)
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

      const quotesWithCounts = await Promise.all(
        filteredQuotes.map(async (quote) => {
          const { count } = await supabase
            .from('quote_items')
            .select('*', { count: 'exact', head: true })
            .eq('quote_id', quote.id);

          return {
            ...quote,
            items_count: count || 0,
          };
        })
      );

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
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'processing':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'processed':
        return 'Processed';
      case 'ready':
        return 'Ready';
      case 'processing':
        return 'Processing';
      case 'failed':
        return 'Failed';
      default:
        return status || 'Unknown';
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
    <div className="h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <WorkflowNav
          currentStep="select"
          onNavigateBack={onNavigateBack}
          onNavigateNext={canProceed ? onNavigateNext : undefined}
        />

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-start justify-between mb-8">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-50 mb-2">Select Quotes</h1>
              <p className="text-slate-400 text-lg">
                Choose which quotes you want to clean, map, and include in your analysis
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={selectAll}
                disabled={saving || totalCount === 0}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-emerald-500/20"
              >
                <CheckSquare size={18} />
                Select All
              </button>
              <button
                onClick={deselectAll}
                disabled={saving || totalCount === 0}
                className="flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-300 rounded-xl font-medium transition-all"
              >
                <Square size={18} />
                Deselect All
              </button>
            </div>
          </div>

          {message && (
            <div className={`mb-6 p-4 rounded-xl border ${
              message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
              message.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
              'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}>
              <div className="flex items-center gap-2">
                <Info size={18} />
                <span className="font-medium">{message.text}</span>
              </div>
            </div>
          )}

          <div className="mb-6 p-5 bg-slate-900/50 border border-slate-700/50 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                  <CheckSquare className="text-white" size={24} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-50">
                    {selectedCount} of {totalCount}
                  </p>
                  <p className="text-slate-400">quotes selected</p>
                </div>
              </div>
              {!canProceed && (
                <div className="flex items-center gap-2 text-amber-400">
                  <AlertCircle size={18} />
                  <span className="text-sm font-medium">Select at least one quote to continue</span>
                </div>
              )}
            </div>
          </div>

          {quotes.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
                <Info className="text-slate-400" size={32} />
              </div>
              <h3 className="text-xl font-semibold text-slate-300 mb-2">No Quotes Found</h3>
              <p className="text-slate-500 mb-6">
                Import quotes first before selecting them for processing
              </p>
              {onNavigateBack && (
                <button
                  onClick={onNavigateBack}
                  className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition-colors"
                >
                  Go to Import Quotes
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {quotes.map((quote) => (
                <button
                  key={quote.id}
                  onClick={() => toggleQuoteSelection(quote.id)}
                  className={`group relative p-6 rounded-xl border-2 transition-all text-left ${
                    quote.is_selected
                      ? 'bg-slate-800/80 border-orange-500/50 shadow-lg shadow-orange-500/10'
                      : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-600/50 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 mt-1 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                      quote.is_selected
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600'
                    }`}>
                      {quote.is_selected ? <CheckSquare size={20} /> : <Square size={20} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl font-bold text-slate-50 mb-1 truncate">
                            {quote.supplier_name}
                          </h3>
                          {quote.quote_reference && (
                            <p className="text-sm text-slate-400">
                              Reference: {quote.quote_reference}
                            </p>
                          )}
                          {quote.file_name && (
                            <p className="text-xs text-slate-500 mt-1 truncate">
                              {quote.file_name}
                            </p>
                          )}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${getStatusColor(quote.status)}`}>
                          {getStatusLabel(quote.status)}
                        </span>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Total:</span>
                          <span className="font-bold text-slate-50">
                            £{(quote.total_amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Items:</span>
                          <span className="font-semibold text-slate-300">
                            {quote.items_count.toLocaleString()}
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
            <div className="mt-8 pt-6 border-t border-slate-700/50 flex justify-end">
              <button
                onClick={onNavigateNext}
                className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-orange-500/30 transition-all"
              >
                Continue to Review & Clean
                <ArrowRight size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
