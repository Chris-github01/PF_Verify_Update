import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Search,
  Shield,
  XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  classifyParsedQuoteRows,
  type EnrichedQuoteRow,
  type MissingExtractedLine,
  type ClassificationSummary,
  type ParsedQuoteRow,
} from '../lib/classification/classifyParsedQuoteRows';
import type { ClassificationTag } from '../lib/classification/classificationRules';

interface ClassificationAuditViewProps {
  quoteId: string;
  supplierName: string;
  documentTotal?: number | null;
  onClose?: () => void;
}

const TAG_META: Record<ClassificationTag, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  main_scope: {
    label: 'Main Scope',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />,
  },
  summary_only: {
    label: 'Summary Only',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: <XCircle className="w-3.5 h-3.5 text-red-600" />,
  },
  optional_scope: {
    label: 'Optional Scope',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
  },
  review_required: {
    label: 'Review Required',
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    icon: <Search className="w-3.5 h-3.5 text-slate-500" />,
  },
};

type GroupKey = ClassificationTag | 'missing_lines';
const GROUP_ORDER: GroupKey[] = ['main_scope', 'summary_only', 'optional_scope', 'review_required', 'missing_lines'];

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TagBadge({ tag }: { tag: ClassificationTag }) {
  const meta = TAG_META[tag];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${meta.bg} ${meta.color} border ${meta.border}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

function ConfidenceDot({ level }: { level: 'high' | 'medium' | 'low' }) {
  const map = { high: 'bg-emerald-500', medium: 'bg-amber-400', low: 'bg-slate-400' };
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      <span className={`w-1.5 h-1.5 rounded-full ${map[level]}`} />
      {level}
    </span>
  );
}

function SummaryCard({
  label,
  amount,
  count,
  variant,
}: {
  label: string;
  amount: number;
  count: number;
  variant: 'green' | 'red' | 'amber' | 'slate' | 'blue';
}) {
  const colorMap = {
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', amt: 'text-emerald-800' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', amt: 'text-red-800' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', amt: 'text-amber-800' },
    slate: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', amt: 'text-slate-700' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', amt: 'text-blue-800' },
  };
  const c = colorMap[variant];
  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-3`}>
      <div className={`text-xs font-medium ${c.text} mb-1`}>{label}</div>
      <div className={`text-base font-bold ${c.amt}`}>{fmt(amount)}</div>
      <div className={`text-xs ${c.text} mt-0.5`}>{count} row{count !== 1 ? 's' : ''}</div>
    </div>
  );
}

export default function ClassificationAuditView({
  quoteId,
  supplierName,
  documentTotal,
  onClose,
}: ClassificationAuditViewProps) {
  const [loading, setLoading] = useState(true);
  const [enrichedRows, setEnrichedRows] = useState<EnrichedQuoteRow[]>([]);
  const [missingLines, setMissingLines] = useState<MissingExtractedLine[]>([]);
  const [summary, setSummary] = useState<ClassificationSummary | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<GroupKey>>(new Set(['main_scope', 'summary_only', 'optional_scope']));

  useEffect(() => {
    loadAndClassify();
  }, [quoteId]);

  async function loadAndClassify() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId)
        .order('id', { ascending: true });

      if (error) throw error;

      const rows: ParsedQuoteRow[] = (data || []).map(item => ({
        id: item.id,
        quote_id: item.quote_id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
        section: item.section,
        service: item.service,
        scope_category: item.scope_category,
        frr: item.frr,
        source: item.source,
      }));

      const result = classifyParsedQuoteRows(rows, {}, undefined, documentTotal ?? null);
      setEnrichedRows(result.enrichedRows);
      setMissingLines(result.missingLines);
      setSummary(result.summary);
    } catch (err) {
      console.error('[ClassificationAuditView] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }

  function toggleGroup(key: GroupKey) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading classification audit…
      </div>
    );
  }

  if (!summary) return null;

  const grouped: Record<ClassificationTag, EnrichedQuoteRow[]> = {
    main_scope: enrichedRows.filter(r => r.safe_classification_tag === 'main_scope'),
    summary_only: enrichedRows.filter(r => r.safe_classification_tag === 'summary_only'),
    optional_scope: enrichedRows.filter(r => r.safe_classification_tag === 'optional_scope'),
    review_required: enrichedRows.filter(r => r.safe_classification_tag === 'review_required'),
  };

  const varianceAbs = summary.variance_to_document_total != null
    ? Math.abs(summary.variance_to_document_total)
    : null;
  const varianceIsGood = varianceAbs != null && varianceAbs <= 1;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-800">Classification Audit</h2>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {supplierName} — non-destructive overlay, no data modified
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
            Close
          </button>
        )}
      </div>

      {/* Totals reconstruction banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Variance Reconstruction</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 text-sm">
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">Parsed Total</div>
            <div className="font-bold text-slate-800">{fmt(summary.parsed_total_all_rows)}</div>
            <div className="text-xs text-slate-400 mt-0.5">{enrichedRows.length} rows</div>
          </div>
          <div className="flex items-center justify-center text-slate-400 text-lg font-light hidden sm:flex">−</div>
          <div className="bg-red-50 rounded-lg border border-red-200 p-3">
            <div className="text-xs text-red-600 mb-1">Summary Only</div>
            <div className="font-bold text-red-700">{fmt(summary.summary_only_total)}</div>
            <div className="text-xs text-red-500 mt-0.5">{summary.counts.summary_only} rows</div>
          </div>
          <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
            <div className="text-xs text-amber-700 mb-1">Optional Scope</div>
            <div className="font-bold text-amber-800">{fmt(summary.optional_scope_total)}</div>
            <div className="text-xs text-amber-600 mt-0.5">{summary.counts.optional_scope} rows</div>
          </div>
          <div className="flex items-center justify-center text-slate-400 text-lg font-light hidden sm:flex">+</div>
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
            <div className="text-xs text-blue-700 mb-1">Missing Lines</div>
            <div className="font-bold text-blue-800">{fmt(summary.missing_extracted_total)}</div>
            <div className="text-xs text-blue-600 mt-0.5">{summary.counts.missing_extracted_line} items</div>
          </div>
          <div className={`rounded-lg border p-3 ${varianceIsGood ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className={`text-xs mb-1 ${varianceIsGood ? 'text-emerald-700' : 'text-slate-600'}`}>Reconstructed</div>
            <div className={`font-bold ${varianceIsGood ? 'text-emerald-800' : 'text-slate-800'}`}>{fmt(summary.reconstructed_total)}</div>
            {summary.document_total != null && (
              <div className={`text-xs mt-0.5 ${varianceIsGood ? 'text-emerald-600' : 'text-slate-500'}`}>
                {varianceIsGood ? '✓ matches PDF' : `${fmt(summary.variance_to_document_total)} from PDF`}
              </div>
            )}
          </div>
        </div>

        {summary.document_total != null && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm flex items-center gap-2 ${varianceIsGood ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            <Info className="w-4 h-4 flex-shrink-0" />
            PDF Grand Total: {fmt(summary.document_total)}
            {varianceIsGood
              ? ' — reconstruction matches exactly.'
              : ` — reconstruction variance: ${fmt(summary.variance_to_document_total)}`}
          </div>
        )}
      </div>

      {/* Row groups */}
      {GROUP_ORDER.map(groupKey => {
        if (groupKey === 'missing_lines') {
          if (missingLines.length === 0) return null;
          const open = openGroups.has('missing_lines');
          return (
            <div key="missing_lines" className="rounded-xl border border-blue-200 bg-white overflow-hidden">
              <button
                onClick={() => toggleGroup('missing_lines')}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-700">Missing Extracted Lines</span>
                  <span className="text-xs bg-blue-200 text-blue-800 rounded px-1.5 py-0.5">{missingLines.length}</span>
                  <span className="text-xs text-blue-600">Audit only — not in DB</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-blue-800">{fmt(summary.missing_extracted_total)}</span>
                  {open ? <ChevronDown className="w-4 h-4 text-blue-500" /> : <ChevronRight className="w-4 h-4 text-blue-500" />}
                </div>
              </button>
              {open && (
                <div className="divide-y divide-blue-100">
                  {missingLines.map((m, idx) => (
                    <div key={idx} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-700 font-medium">{m.description}</div>
                          <div className="text-xs text-slate-500 mt-1">{m.reason}</div>
                        </div>
                        <div className="text-sm font-semibold text-blue-700 whitespace-nowrap">{fmt(m.expected_total)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        const rows = grouped[groupKey as ClassificationTag];
        if (rows.length === 0) return null;
        const meta = TAG_META[groupKey as ClassificationTag];
        const groupTotal = rows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
        const open = openGroups.has(groupKey);

        return (
          <div key={groupKey} className={`rounded-xl border ${meta.border} bg-white overflow-hidden`}>
            <button
              onClick={() => toggleGroup(groupKey)}
              className={`w-full flex items-center justify-between px-4 py-3 ${meta.bg} hover:opacity-90 transition-opacity`}
            >
              <div className="flex items-center gap-2">
                {meta.icon}
                <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
                <span className={`text-xs rounded px-1.5 py-0.5 ${meta.bg} ${meta.color} border ${meta.border}`}>{rows.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${meta.color}`}>{fmt(groupTotal)}</span>
                {open ? <ChevronDown className={`w-4 h-4 ${meta.color}`} /> : <ChevronRight className={`w-4 h-4 ${meta.color}`} />}
              </div>
            </button>

            {open && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-4 py-2 font-medium text-slate-500 w-full">Description</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500 whitespace-nowrap">Qty</th>
                      <th className="text-left px-2 py-2 font-medium text-slate-500">Unit</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500 whitespace-nowrap">Rate</th>
                      <th className="text-right px-4 py-2 font-medium text-slate-500 whitespace-nowrap">Total</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500 whitespace-nowrap">Confidence</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map((row, idx) => (
                      <tr key={row.id ?? idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 text-slate-700 max-w-xs">
                          <div className="truncate" title={row.description}>{row.description || '—'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{row.quantity ?? '—'}</td>
                        <td className="px-2 py-2.5 text-slate-500">{row.unit || '—'}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{fmt(row.unit_price)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-slate-800 tabular-nums">{fmt(row.total_price)}</td>
                        <td className="px-3 py-2.5">
                          <ConfidenceDot level={row.safe_classification_confidence} />
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 max-w-xs">
                          <div className="truncate" title={row.safe_classification_reason}>{row.safe_classification_reason}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={`border-t ${meta.border} ${meta.bg}`}>
                      <td className={`px-4 py-2 text-xs font-semibold ${meta.color}`} colSpan={4}>
                        {meta.label} Subtotal
                      </td>
                      <td className={`px-4 py-2 text-right text-xs font-bold ${meta.color} tabular-nums`}>
                        {fmt(groupTotal)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <div className="text-xs text-slate-400 border-t border-slate-100 pt-3">
        Classification Audit is a read-only overlay. No rows were modified, hidden, or inserted into the database.
      </div>
    </div>
  );
}
