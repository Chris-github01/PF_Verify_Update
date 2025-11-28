import { Search, Download, ChevronLeft, ChevronRight, Edit3, Check, X, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { needsQuantity } from '../lib/quoteUtils';

interface Quote {
  id: string;
  supplier: string;
  quoteValue: number;
  quotedTotal: number | null;
  contingencyAmount: number;
  lineItemsTotal: number;
  status: 'Draft' | 'Imported' | 'Reviewed' | 'Awarded';
  lastUpdated: string;
  owner: string;
  missingQtyCount?: number;
}

interface QuotesTableProps {
  projectId?: string;
}

export default function QuotesTable({ projectId }: QuotesTableProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editingTotalQuoteId, setEditingTotalQuoteId] = useState<string | null>(null);
  const [editTotalValue, setEditTotalValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const totalPages = 1;

  useEffect(() => {
    if (projectId) {
      loadQuotes();
    }
  }, [projectId]);

  const loadQuotes = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const { data: quotesData } = await supabase
        .from('quotes')
        .select('id, supplier_name, total_amount, status, updated_at, quoted_total, contingency_amount')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false });

      if (quotesData) {
        const { data: itemsData } = await supabase
          .from('quote_items')
          .select('quote_id, quantity, total_price')
          .in('quote_id', quotesData.map(q => q.id));

        const missingQtyByQuote = new Map<string, number>();
        const lineItemsTotalByQuote = new Map<string, number>();

        if (itemsData) {
          itemsData.forEach(item => {
            if (needsQuantity(item)) {
              const count = missingQtyByQuote.get(item.quote_id) || 0;
              missingQtyByQuote.set(item.quote_id, count + 1);
            }
            const currentTotal = lineItemsTotalByQuote.get(item.quote_id) || 0;
            lineItemsTotalByQuote.set(item.quote_id, currentTotal + (item.total_price || 0));
          });
        }

        const formattedQuotes: Quote[] = quotesData.map(q => {
          const lineItemsTotal = lineItemsTotalByQuote.get(q.id) || 0;
          const quotedTotal = q.quoted_total;
          const contingencyAmount = q.contingency_amount || 0;
          const displayTotal = quotedTotal || q.total_amount || lineItemsTotal;

          return {
            id: q.id,
            supplier: q.supplier_name || 'Unknown Supplier',
            quoteValue: displayTotal,
            quotedTotal: quotedTotal,
            contingencyAmount: contingencyAmount,
            lineItemsTotal: lineItemsTotal,
            status: (q.status || 'Imported') as 'Draft' | 'Imported' | 'Reviewed' | 'Awarded',
            lastUpdated: new Date(q.updated_at).toLocaleDateString(),
            owner: 'PV',
            missingQtyCount: missingQtyByQuote.get(q.id) || 0,
          };
        });
        setQuotes(formattedQuotes);
      }
    } catch (error) {
      console.error('Error loading quotes:', error);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (quote: Quote) => {
    setEditingQuoteId(quote.id);
    setEditValue(quote.supplier);
    setSaveError(null);

    setTimeout(() => {
      const input = document.querySelector(`input[data-quote-id="${quote.id}"]`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  };

  const cancelEdit = () => {
    setEditingQuoteId(null);
    setEditValue('');
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!editingQuoteId || !editValue.trim()) {
      setSaveError('Supplier name is required');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const { error } = await supabase
        .from('quotes')
        .update({ supplier_name: editValue.trim() })
        .eq('id', editingQuoteId);

      if (error) throw error;

      setQuotes(prev =>
        prev.map(q => q.id === editingQuoteId ? { ...q, supplier: editValue.trim() } : q)
      );

      setEditingQuoteId(null);
      setEditValue('');
    } catch (error) {
      console.error('Error saving supplier name:', error);
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  const startEditTotal = (quote: Quote) => {
    setEditingTotalQuoteId(quote.id);
    setEditTotalValue((quote.quotedTotal || quote.quoteValue).toString());
    setSaveError(null);

    setTimeout(() => {
      const input = document.querySelector(`input[data-total-quote-id="${quote.id}"]`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 50);
  };

  const cancelEditTotal = () => {
    setEditingTotalQuoteId(null);
    setEditTotalValue('');
    setSaveError(null);
  };

  const saveEditTotal = async () => {
    if (!editingTotalQuoteId || !editTotalValue.trim()) {
      setSaveError('Quote total is required');
      return;
    }

    const newTotal = parseFloat(editTotalValue);
    if (isNaN(newTotal) || newTotal < 0) {
      setSaveError('Please enter a valid positive number');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const quote = quotes.find(q => q.id === editingTotalQuoteId);
      if (!quote) throw new Error('Quote not found');

      const lineItemsTotal = quote.lineItemsTotal;
      const contingencyAmount = Math.max(0, newTotal - lineItemsTotal);

      const { error } = await supabase
        .from('quotes')
        .update({
          quoted_total: newTotal,
          total_amount: newTotal,
          contingency_amount: contingencyAmount
        })
        .eq('id', editingTotalQuoteId);

      if (error) throw error;

      setQuotes(prev =>
        prev.map(q => q.id === editingTotalQuoteId ? {
          ...q,
          quoteValue: newTotal,
          quotedTotal: newTotal,
          contingencyAmount: contingencyAmount
        } : q)
      );

      setEditingTotalQuoteId(null);
      setEditTotalValue('');
    } catch (error) {
      console.error('Error saving quote total:', error);
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTotalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditTotal();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditTotal();
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'status-badge status-draft';
      case 'Imported':
        return 'status-badge status-imported';
      case 'Reviewed':
        return 'status-badge status-reviewed';
      case 'Awarded':
        return 'status-badge status-awarded';
      default:
        return 'status-badge status-draft';
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-600">Loading quotes...</div>
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-600">Select a project to view quotes</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900">Supplier Quotes</h3>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search quotes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent"
            />
          </div>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-2">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table-clean">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Quote Value</th>
              <th>Status</th>
              <th>Last Updated</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {quotes
              .filter((quote) =>
                quote.supplier.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((quote) => (
                <tr key={quote.id} className="bg-white hover:bg-slate-50 transition-colors duration-150">
                  <td className="px-4 py-3 min-w-[220px]">
                    {editingQuoteId === quote.id ? (
                      <div>
                        <div className="flex items-center gap-2 max-w-full">
                          <input
                            type="text"
                            data-quote-id={quote.id}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={saving}
                            className="w-full h-8 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] transition"
                            placeholder="Enter supplier name"
                          />
                          <button
                            onClick={saveEdit}
                            disabled={saving || !editValue.trim()}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full cursor-pointer text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                            title="Save"
                          >
                            <Check size={14} strokeWidth={2} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saving}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full cursor-pointer text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                            title="Cancel"
                          >
                            <X size={14} strokeWidth={2} />
                          </button>
                        </div>
                        {saveError && (
                          <p className="mt-1 text-[11px] text-red-500">{saveError}</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-1.5 text-sm text-slate-800 group cursor-default">
                          <span className="truncate max-w-[220px] group-hover:underline">{quote.supplier}</span>
                          <button
                            onClick={() => startEdit(quote)}
                            className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded cursor-pointer text-slate-400 group-hover:text-[#0A66C2] hover:bg-slate-100 transition-colors duration-150"
                            title="Edit name"
                          >
                            <Edit3 size={12} strokeWidth={1.5} />
                          </button>
                        </div>
                        {quote.missingQtyCount && quote.missingQtyCount > 0 && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-yellow-700">
                            <AlertTriangle size={12} />
                            <span>{quote.missingQtyCount} {quote.missingQtyCount === 1 ? 'item needs' : 'items need'} quantity</span>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingTotalQuoteId === quote.id ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">$</span>
                          <input
                            type="number"
                            data-total-quote-id={quote.id}
                            value={editTotalValue}
                            onChange={(e) => setEditTotalValue(e.target.value)}
                            onKeyDown={handleTotalKeyDown}
                            disabled={saving}
                            className="w-32 h-8 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:border-[#0A66C2] transition"
                            placeholder="Enter total"
                          />
                          <button
                            onClick={saveEditTotal}
                            disabled={saving || !editTotalValue.trim()}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full cursor-pointer text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                            title="Save"
                          >
                            <Check size={14} strokeWidth={2} />
                          </button>
                          <button
                            onClick={cancelEditTotal}
                            disabled={saving}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full cursor-pointer text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                            title="Cancel"
                          >
                            <X size={14} strokeWidth={2} />
                          </button>
                        </div>
                        {saveError && (
                          <p className="mt-1 text-[11px] text-red-500">{saveError}</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-1.5 group cursor-default">
                          <span className="font-semibold text-gray-900">
                            ${quote.quoteValue.toLocaleString()}
                          </span>
                          <button
                            onClick={() => startEditTotal(quote)}
                            className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded cursor-pointer text-slate-400 group-hover:text-[#0A66C2] hover:bg-slate-100 transition-colors duration-150"
                            title="Edit quote total"
                          >
                            <Edit3 size={12} strokeWidth={1.5} />
                          </button>
                        </div>
                        {quote.contingencyAmount > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            Line items: ${quote.lineItemsTotal.toLocaleString()}
                            <br />
                            Contingency: ${quote.contingencyAmount.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={getStatusClass(quote.status)}>{quote.status}</span>
                  </td>
                  <td className="text-gray-600">{quote.lastUpdated}</td>
                  <td>
                    <div className="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center text-xs font-semibold">
                      {quote.owner}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-600">
          Showing {quotes.length} of {quotes.length} quotes
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
