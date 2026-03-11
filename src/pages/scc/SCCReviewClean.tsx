import { useState, useEffect, useCallback } from 'react';
import {
  Wand2, ChevronDown, ChevronUp, Check, X, Edit2, ToggleLeft, ToggleRight,
  AlertCircle, CheckCircle, Loader2, RefreshCw, ArrowRight, ArrowLeft, Package
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useOrganisation } from '../../lib/organisationContext';

interface LineItem {
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

interface Import {
  id: string;
  file_name: string;
  status: string;
  parsed_line_count: number;
  total_value: number | null;
  main_contractor: string | null;
  project_name: string | null;
  quote_reference: string | null;
  trade_type: string | null;
}

interface SCCReviewCleanProps {
  onNavigateBack?: () => void;
  onNavigateNext?: () => void;
}

const UNIT_MAP: Record<string, string> = {
  ea: 'No', each: 'No', nr: 'No', no: 'No', pcs: 'No', pc: 'No',
  m: 'lm', 'linear meter': 'lm', 'lineal meter': 'lm', meter: 'lm', metres: 'lm', lm: 'lm',
  'm2': 'm²', sqm: 'm²', 'sq m': 'm²',
  'm3': 'm³', 'cu m': 'm³',
  hr: 'hr', hrs: 'hr', hour: 'hr', hours: 'hr',
  item: 'Item', items: 'Item', lot: 'Item', allow: 'Item', allowance: 'Item',
  ls: 'LS', 'lump sum': 'LS',
};

function normaliseUnit(raw: string | null): string | null {
  if (!raw) return raw;
  const key = raw.trim().toLowerCase();
  return UNIT_MAP[key] ?? raw;
}

function fmt(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

function confidenceColor(score: number | null): string {
  if (score == null) return 'text-slate-500';
  if (score >= 0.8) return 'text-green-400';
  if (score >= 0.5) return 'text-amber-400';
  return 'text-red-400';
}

export default function SCCReviewClean({ onNavigateBack, onNavigateNext }: SCCReviewCleanProps) {
  const { currentOrganisation } = useOrganisation();
  const [latestImport, setLatestImport] = useState<Import | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [cleanComplete, setCleanComplete] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuf, setEditBuf] = useState<Partial<LineItem>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<'all' | 'flagged' | 'excluded'>('all');

  const load = useCallback(async () => {
    if (!currentOrganisation?.id) return;
    setLoading(true);
    const { data: imp } = await supabase
      .from('scc_quote_imports')
      .select('id, file_name, status, parsed_line_count, total_value, main_contractor, project_name, quote_reference, trade_type')
      .eq('organisation_id', currentOrganisation.id)
      .in('status', ['parsed', 'reviewed', 'locked'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!imp) { setLoading(false); return; }
    setLatestImport(imp);

    const { data: lines } = await supabase
      .from('scc_quote_line_items')
      .select('*')
      .eq('import_id', imp.id)
      .order('created_at', { ascending: true });

    setItems(lines || []);
    setLoading(false);
  }, [currentOrganisation?.id]);

  useEffect(() => { load(); }, [load]);

  const smartClean = async () => {
    setCleaning(true);
    const updates: Promise<unknown>[] = [];

    const cleaned = items.map(item => {
      const normUnit = normaliseUnit(item.unit);
      const flagged = !item.unit || !item.quantity || item.confidence_score != null && item.confidence_score < 0.5;
      const notes = flagged ? 'Needs review — missing unit or quantity, or low confidence' : null;

      updates.push(
        supabase
          .from('scc_quote_line_items')
          .update({
            unit: normUnit ?? item.unit,
            review_notes: notes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
      );

      return { ...item, unit: normUnit ?? item.unit, review_notes: notes };
    });

    await Promise.all(updates);
    setItems(cleaned);
    setCleanComplete(true);
    setCleaning(false);

    const allCategories = new Set(cleaned.map(i => i.scope_category || 'Uncategorised'));
    setExpandedCategories(allCategories);
  };

  const toggleInclude = async (id: string, current: boolean) => {
    await supabase.from('scc_quote_line_items').update({ include_in_baseline: !current, updated_at: new Date().toISOString() }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, include_in_baseline: !current } : i));
  };

  const startEdit = (item: LineItem) => {
    setEditingId(item.id);
    setEditBuf({ description: item.description, unit: item.unit, quantity: item.quantity, unit_rate: item.unit_rate, review_notes: item.review_notes });
  };

  const saveEdit = async (id: string) => {
    await supabase.from('scc_quote_line_items').update({ ...editBuf, updated_at: new Date().toISOString() }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...editBuf } as LineItem : i));
    setEditingId(null);
    setEditBuf({});
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const included = items.filter(i => i.include_in_baseline && !i.is_excluded);
  const flagged = items.filter(i => i.review_notes);
  const excluded = items.filter(i => !i.include_in_baseline || i.is_excluded);
  const includedTotal = included.reduce((s, i) => s + (i.total_amount || 0), 0);

  const displayItems = filterMode === 'flagged' ? items.filter(i => i.review_notes)
    : filterMode === 'excluded' ? items.filter(i => !i.include_in_baseline || i.is_excluded)
    : items;

  const grouped = displayItems.reduce<Record<string, LineItem[]>>((acc, item) => {
    const cat = item.scope_category || 'Uncategorised';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!latestImport || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        <Package size={48} className="text-slate-600 mb-4" />
        <p className="text-slate-300 font-semibold text-lg mb-2">No parsed quote found</p>
        <p className="text-slate-500 text-sm max-w-sm">
          Go back to Quote Import, upload and parse a quote, then return here to review the line items.
        </p>
        {onNavigateBack && (
          <button onClick={onNavigateBack} className="mt-5 flex items-center gap-2 px-4 py-2 text-sm text-cyan-400 border border-cyan-700/40 rounded-xl hover:bg-cyan-900/20 transition-colors">
            <ArrowLeft size={15} /> Back to Import
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-4 flex-shrink-0 border-b border-slate-800/60 bg-slate-900/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-white font-semibold">{latestImport.file_name}</p>
            <p className="text-slate-400 text-xs mt-0.5">
              {items.length} items &bull; {fmt(latestImport.total_value)} &bull;
              <span className="text-green-400 ml-1">{included.length} included</span>
              {flagged.length > 0 && <span className="text-amber-400 ml-2">{flagged.length} flagged</span>}
              {excluded.length > 0 && <span className="text-red-400 ml-2">{excluded.length} excluded</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={smartClean}
              disabled={cleaning}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              {cleaning ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
              {cleaning ? 'Cleaning…' : cleanComplete ? 'Re-run Smart Clean' : 'Smart Clean'}
            </button>
          </div>
        </div>

        {cleanComplete && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
            <CheckCircle size={15} />
            Smart Clean complete — units normalised, {flagged.length} item{flagged.length !== 1 ? 's' : ''} flagged for review
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          {(['all', 'flagged', 'excluded'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterMode(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterMode === f ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f === 'all' ? `All (${items.length})` : f === 'flagged' ? `Flagged (${flagged.length})` : `Excluded (${excluded.length})`}
            </button>
          ))}
          <button onClick={load} className="ml-auto text-slate-500 hover:text-white transition-colors">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {Object.entries(grouped).map(([category, catItems]) => {
          const isOpen = expandedCategories.has(category);
          const catTotal = catItems.reduce((s, i) => s + (i.total_amount || 0), 0);
          const catFlagged = catItems.filter(i => i.review_notes).length;

          return (
            <div key={category} className="bg-slate-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  <span className="text-white text-sm font-medium">{category}</span>
                  <span className="text-xs text-slate-500">{catItems.length} items</span>
                  {catFlagged > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-400">
                      <AlertCircle size={11} /> {catFlagged} flagged
                    </span>
                  )}
                </div>
                <span className="text-cyan-400 text-sm font-semibold">{fmt(catTotal)}</span>
              </button>

              {isOpen && (
                <div className="border-t border-slate-700/40 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-900/40 text-left">
                        <th className="px-4 py-2 text-xs text-slate-500 font-medium w-6">#</th>
                        <th className="px-4 py-2 text-xs text-slate-500 font-medium">Description</th>
                        <th className="px-4 py-2 text-xs text-slate-500 font-medium text-right w-20">Qty</th>
                        <th className="px-4 py-2 text-xs text-slate-500 font-medium w-16">Unit</th>
                        <th className="px-4 py-2 text-xs text-slate-500 font-medium text-right w-24">Rate</th>
                        <th className="px-4 py-2 text-xs text-slate-500 font-medium text-right w-28">Total</th>
                        <th className="px-4 py-2 text-xs text-slate-500 font-medium text-center w-20">Include</th>
                        <th className="px-4 py-2 text-xs text-slate-500 font-medium w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/20">
                      {catItems.map((item, idx) => {
                        const isEditing = editingId === item.id;
                        const isFlagged = !!item.review_notes;
                        const isExcl = !item.include_in_baseline || item.is_excluded;

                        return (
                          <tr
                            key={item.id}
                            className={`transition-colors ${
                              isExcl ? 'opacity-40 bg-red-500/5' :
                              isFlagged ? 'bg-amber-500/5' :
                              'hover:bg-slate-700/20'
                            }`}
                          >
                            <td className="px-4 py-2.5 text-slate-500 text-xs">{idx + 1}</td>
                            <td className="px-4 py-2.5 max-w-xs">
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={editBuf.description ?? ''}
                                  onChange={e => setEditBuf(p => ({ ...p, description: e.target.value }))}
                                  className="w-full bg-slate-900 border border-cyan-600 rounded px-2 py-1 text-white text-sm focus:outline-none"
                                />
                              ) : (
                                <>
                                  <p className="text-white text-sm leading-snug truncate max-w-xs" title={item.description}>{item.description}</p>
                                  {isFlagged && (
                                    <p className="text-amber-400 text-xs mt-0.5 flex items-center gap-1">
                                      <AlertCircle size={10} /> {item.review_notes}
                                    </p>
                                  )}
                                  {item.confidence_score != null && (
                                    <p className={`text-xs mt-0.5 ${confidenceColor(item.confidence_score)}`}>
                                      {Math.round(item.confidence_score * 100)}% confidence
                                    </p>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-300 text-sm">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editBuf.quantity ?? ''}
                                  onChange={e => setEditBuf(p => ({ ...p, quantity: parseFloat(e.target.value) || null }))}
                                  className="w-16 bg-slate-900 border border-cyan-600 rounded px-2 py-1 text-white text-sm text-right focus:outline-none"
                                />
                              ) : item.quantity ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-slate-400 text-xs">
                              {isEditing ? (
                                <input
                                  value={editBuf.unit ?? ''}
                                  onChange={e => setEditBuf(p => ({ ...p, unit: e.target.value }))}
                                  className="w-14 bg-slate-900 border border-cyan-600 rounded px-2 py-1 text-white text-sm focus:outline-none"
                                />
                              ) : item.unit || '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right text-slate-300 text-sm">
                              {item.unit_rate != null ? `$${item.unit_rate.toFixed(2)}` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-white">{fmt(item.total_amount)}</td>
                            <td className="px-4 py-2.5 text-center">
                              <button onClick={() => toggleInclude(item.id, item.include_in_baseline)}>
                                {item.include_in_baseline
                                  ? <ToggleRight size={20} className="text-cyan-400" />
                                  : <ToggleLeft size={20} className="text-slate-600" />}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {isEditing ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <button onClick={() => saveEdit(item.id)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                                  <button onClick={() => { setEditingId(null); setEditBuf({}); }} className="text-slate-500 hover:text-white"><X size={14} /></button>
                                </div>
                              ) : (
                                <button onClick={() => startEdit(item)} className="text-slate-500 hover:text-slate-300 transition-colors">
                                  <Edit2 size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-6 py-4 border-t border-slate-800/60 bg-slate-900/30 flex-shrink-0 flex items-center justify-between gap-4">
        <div className="text-sm text-slate-400">
          Baseline: <span className="text-cyan-400 font-semibold">{fmt(includedTotal)}</span>
          <span className="ml-2 text-slate-600">({included.length} of {items.length} lines)</span>
        </div>
        <div className="flex items-center gap-3">
          {onNavigateBack && (
            <button
              onClick={onNavigateBack}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 border border-slate-700 rounded-xl hover:border-slate-500 transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>
          )}
          {onNavigateNext && (
            <button
              onClick={onNavigateNext}
              className="flex items-center gap-2 px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Next: Quote Intelligence <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
