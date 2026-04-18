import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  Search,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuoteRow {
  quote_id: string | null;
  job_id: string;
  filename: string;
  supplier_name: string;
  trade: string;
  created_at: string;
  job_status: string;
  // quote fields
  total_amount: number | null;
  document_total: number | null;
  resolved_total: number | null;
  resolution_source: string | null;
  resolution_confidence: string | null;
  items_count: number | null;
  line_item_count: number | null;
  raw_items_count: number | null;
  optional_scope_total: number | null;
  parse_status: string | null;
  needs_review: boolean | null;
  // metadata fields
  parser_used: string | null;
  commercial_family: string | null;
  document_class: string | null;
  confidence: number | null;
  total_source: string | null;
  validation_risk: string | null;
  variance_pct: number | null;
  summary_detected: string | null;
  optional_scope_detected: string | null;
  item_count_base: string | null;
  item_count_optional: string | null;
  item_count_excluded: string | null;
  warnings: string[] | null;
  grand_total: number | null;
  optional_total: number | null;
  row_sum: number | null;
}

type SuspicionLevel = 'ok' | 'warn' | 'fail';

interface SuspicionFlag {
  level: SuspicionLevel;
  message: string;
}

interface AnalysedRow extends QuoteRow {
  flags: SuspicionFlag[];
  overallLevel: SuspicionLevel;
  varianceGrade: 'OK' | 'MEDIUM' | 'HIGH' | null;
  parserStrategy: string;
  baseTotal: number;
  optTotal: number;
  exclTotal: number;
  resolvedTotalDisplay: number;
  rowCount: number;
}

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

function computeVarianceGrade(pct: number | null): 'OK' | 'MEDIUM' | 'HIGH' | null {
  if (pct === null) return null;
  if (pct <= 2) return 'OK';
  if (pct <= 10) return 'MEDIUM';
  return 'HIGH';
}

function inferParserStrategy(row: QuoteRow): string {
  if (row.parser_used) return row.parser_used;
  if (row.commercial_family) return row.commercial_family;
  const fn = (row.filename ?? '').toLowerCase();
  if (fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) return 'spreadsheet_parser';
  return 'production_pipeline';
}

function computeVariancePct(row: QuoteRow): number | null {
  const resolved = row.resolved_total ?? row.total_amount;
  const docTotal = row.document_total;
  if (resolved && docTotal && docTotal > 0) {
    return Math.abs(resolved - docTotal) / docTotal * 100;
  }
  return row.variance_pct ?? null;
}

function analyseRow(row: QuoteRow): AnalysedRow {
  const flags: SuspicionFlag[] = [];

  const resolvedTotalDisplay = row.resolved_total ?? row.total_amount ?? 0;
  const baseTotal = resolvedTotalDisplay;
  const optTotal = row.optional_scope_total ?? row.optional_total ?? 0;
  const exclTotal = 0;
  const rowCount = row.line_item_count ?? row.items_count ?? 0;

  const variancePct = computeVariancePct(row);
  const varianceGrade = computeVarianceGrade(variancePct);

  // Flag: no items parsed
  if (rowCount === 0) {
    flags.push({ level: 'fail', message: 'Zero rows extracted — parser returned no line items' });
  } else if (rowCount === 1 && resolvedTotalDisplay > 100000) {
    flags.push({ level: 'warn', message: 'Only 1 row extracted for a large-value quote — likely lump-sum fallback' });
  }

  // Flag: needs_review flagged by system
  if (row.needs_review) {
    flags.push({ level: 'warn', message: 'Flagged for human review by parsing pipeline' });
  }

  // Flag: document_total vs total_amount discrepancy
  if (row.document_total && row.total_amount) {
    const disc = Math.abs(row.document_total - row.total_amount);
    const pct = disc / Math.max(row.document_total, row.total_amount) * 100;
    if (pct > 20) {
      flags.push({ level: 'fail', message: `document_total ($${fmtCcy(row.document_total)}) vs items total ($${fmtCcy(row.total_amount)}) differ by ${pct.toFixed(1)}% — total extraction mismatch` });
    } else if (pct > 5) {
      flags.push({ level: 'warn', message: `document_total ($${fmtCcy(row.document_total)}) vs items total ($${fmtCcy(row.total_amount)}) differ by ${pct.toFixed(1)}%` });
    }
  }

  // Flag: document_total absurdly high (stray OCR total, e.g. Sero Quote = $31.8M vs $521k)
  if (row.document_total && row.total_amount && row.document_total > row.total_amount * 10) {
    flags.push({ level: 'fail', message: `document_total ($${fmtCcy(row.document_total)}) is >10x items total — likely OCR artefact or wrong page total captured` });
  }

  // Flag: variance grade
  if (varianceGrade === 'HIGH') {
    flags.push({ level: 'fail', message: `HIGH variance: ${variancePct?.toFixed(1)}% between row sum and document total` });
  } else if (varianceGrade === 'MEDIUM') {
    flags.push({ level: 'warn', message: `MEDIUM variance: ${variancePct?.toFixed(1)}% between row sum and document total` });
  }

  // Flag: raw vs final item count divergence
  if (row.raw_items_count && rowCount) {
    const dropped = row.raw_items_count - rowCount;
    const droppedPct = (dropped / row.raw_items_count) * 100;
    if (dropped > 0 && droppedPct > 25) {
      flags.push({ level: 'warn', message: `${dropped} items dropped post-filter (${droppedPct.toFixed(0)}% of raw rows) — exclusion or dedup may be over-aggressive` });
    }
  }

  // Flag: optional total exceeds base total (contamination)
  if (optTotal > baseTotal && baseTotal > 0) {
    flags.push({ level: 'warn', message: `Optional scope total ($${fmtCcy(optTotal)}) exceeds base total ($${fmtCcy(baseTotal)}) — possible optional/base contamination` });
  }

  // Flag: resolution source is row_sum with no summary detected
  if (row.resolution_source === 'row_sum' && !row.document_total) {
    flags.push({ level: 'warn', message: 'No document total found — resolved total is row sum only (lower confidence)' });
  }

  // Flag: very low LLM confidence
  if (row.confidence !== null && row.confidence < 0.4) {
    flags.push({ level: 'fail', message: `Low LLM confidence: ${(row.confidence * 100).toFixed(0)}%` });
  } else if (row.confidence !== null && row.confidence < 0.6) {
    flags.push({ level: 'warn', message: `Medium LLM confidence: ${(row.confidence * 100).toFixed(0)}%` });
  }

  // Flag: job status
  if (row.job_status === 'failed') {
    flags.push({ level: 'fail', message: 'Parsing job status: FAILED' });
  }

  // Propagated warnings from parser
  if (row.warnings && row.warnings.length > 0) {
    row.warnings.forEach(w => {
      const lvl: SuspicionLevel = w.toLowerCase().includes('high') ? 'fail'
        : w.toLowerCase().includes('medium') ? 'warn'
        : 'warn';
      flags.push({ level: lvl, message: `Parser warning: ${w}` });
    });
  }

  const overallLevel: SuspicionLevel = flags.some(f => f.level === 'fail') ? 'fail'
    : flags.some(f => f.level === 'warn') ? 'warn'
    : 'ok';

  return {
    ...row,
    flags,
    overallLevel,
    varianceGrade,
    parserStrategy: inferParserStrategy(row),
    baseTotal,
    optTotal,
    exclTotal,
    resolvedTotalDisplay,
    rowCount,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmtCcy(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(1)}%`;
}

function tradeBadge(trade: string) {
  const map: Record<string, string> = {
    passive_fire: 'bg-orange-900/40 text-orange-300 border-orange-700/50',
    plumbing: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/50',
    electrical: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
    carpentry: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
    hvac: 'bg-sky-900/40 text-sky-300 border-sky-700/50',
    active_fire: 'bg-red-900/40 text-red-300 border-red-700/50',
  };
  return map[trade] ?? 'bg-slate-800 text-slate-300 border-slate-700';
}

function gradeColor(g: 'OK' | 'MEDIUM' | 'HIGH' | null): string {
  if (g === 'OK') return 'text-emerald-400';
  if (g === 'MEDIUM') return 'text-amber-400';
  if (g === 'HIGH') return 'text-red-400';
  return 'text-slate-500';
}

function GradeIcon({ g }: { g: 'OK' | 'MEDIUM' | 'HIGH' | null }) {
  if (g === 'OK') return <TrendingUp className="w-3.5 h-3.5" />;
  if (g === 'HIGH') return <TrendingDown className="w-3.5 h-3.5" />;
  if (g === 'MEDIUM') return <Minus className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5 opacity-30" />;
}

// ---------------------------------------------------------------------------
// Scorecard card
// ---------------------------------------------------------------------------

function ScoreCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-1">
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold ${accent ?? 'text-slate-100'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row detail drawer
// ---------------------------------------------------------------------------

function RowDetail({ row, onClose }: { row: AnalysedRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-xl h-full bg-slate-950 border-l border-slate-800 overflow-y-auto p-6 flex flex-col gap-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 mb-1">{row.trade?.replace('_', ' ')}</div>
            <div className="text-base font-semibold text-slate-100 leading-tight">{row.filename}</div>
            <div className="text-xs text-slate-400 mt-0.5">{row.supplier_name}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 mt-0.5">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Flags */}
        {row.flags.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-slate-500">Flags</div>
            {row.flags.map((f, i) => (
              <div key={i} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs border ${
                f.level === 'fail' ? 'bg-red-950/40 border-red-800/50 text-red-300'
                  : f.level === 'warn' ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                  : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
              }`}>
                {f.level === 'fail' ? <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  : f.level === 'warn' ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  : <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
                {f.message}
              </div>
            ))}
          </div>
        )}

        {/* Parser output */}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Parser Output</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Parser Strategy', row.parserStrategy],
              ['Commercial Family', row.commercial_family ?? '—'],
              ['Document Class', row.document_class ?? '—'],
              ['Total Source', row.resolution_source ?? row.total_source ?? '—'],
              ['LLM Confidence', row.confidence !== null ? `${(row.confidence * 100).toFixed(0)}%` : '—'],
              ['Summary Detected', row.summary_detected ?? '—'],
              ['Optional Scope Detected', row.optional_scope_detected ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-slate-500">{k}</div>
                <div className="text-slate-200 font-medium mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Totals</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Resolved Total', `$${fmtCcy(row.resolvedTotalDisplay)}`],
              ['Document Total', row.document_total ? `$${fmtCcy(row.document_total)}` : '—'],
              ['Row Sum', row.row_sum ? `$${fmtCcy(row.row_sum)}` : '—'],
              ['Optional Total', row.optTotal > 0 ? `$${fmtCcy(row.optTotal)}` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-slate-500">{k}</div>
                <div className="text-slate-200 font-medium mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Counts */}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Item Counts</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              ['Extracted', row.rowCount],
              ['Raw', row.raw_items_count ?? '—'],
              ['Optional', row.item_count_optional ?? '—'],
              ['Excluded', row.item_count_excluded ?? '—'],
              ['Base', row.item_count_base ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                <div className="text-slate-500">{k}</div>
                <div className="text-slate-200 font-bold mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Variance */}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Variance</div>
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold ${
            row.varianceGrade === 'OK' ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
              : row.varianceGrade === 'MEDIUM' ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
              : row.varianceGrade === 'HIGH' ? 'bg-red-950/40 border-red-800/50 text-red-300'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}>
            <GradeIcon g={row.varianceGrade} />
            {row.varianceGrade ?? 'No document total to compare'}
            {row.varianceGrade && computeVariancePct(row) !== null && (
              <span className="ml-auto font-normal text-xs opacity-70">{fmtPct(computeVariancePct(row))}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ParserValidationReport() {
  const [rows, setRows] = useState<AnalysedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AnalysedRow | null>(null);
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());
  const [filterTrade, setFilterTrade] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<'created_at' | 'resolvedTotalDisplay' | 'rowCount' | 'varianceGrade'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc('exec_sql' as any, {
      sql: `
        SELECT DISTINCT ON (pj.filename)
          pj.id as job_id,
          pj.filename,
          pj.status as job_status,
          pj.trade,
          pj.supplier_name,
          pj.created_at,
          q.id as quote_id,
          q.total_amount,
          q.document_total,
          q.resolved_total,
          q.resolution_source,
          q.resolution_confidence,
          q.items_count,
          q.line_item_count,
          q.raw_items_count,
          q.optional_scope_total,
          q.parse_status,
          q.needs_review,
          pj.metadata->>'parserUsed' as parser_used,
          pj.metadata->>'commercialFamily' as commercial_family,
          pj.metadata->>'documentClass' as document_class,
          (pj.metadata->>'confidence')::numeric as confidence,
          pj.metadata->'totals'->>'source' as total_source,
          pj.metadata->'validation'->>'risk' as validation_risk,
          pj.metadata->'validation'->>'variancePercent' as variance_pct,
          pj.metadata->'debug'->>'summaryDetected' as summary_detected,
          pj.metadata->'debug'->>'optionalScopeDetected' as optional_scope_detected,
          pj.metadata->'debug'->>'itemCountBase' as item_count_base,
          pj.metadata->'debug'->>'itemCountOptional' as item_count_optional,
          pj.metadata->'debug'->>'itemCountExcluded' as item_count_excluded,
          pj.metadata->'validation'->'warnings' as warnings,
          (pj.metadata->'totals'->>'grandTotal')::numeric as grand_total,
          (pj.metadata->'totals'->>'optionalTotal')::numeric as optional_total,
          (pj.metadata->'totals'->>'rowSum')::numeric as row_sum
        FROM parsing_jobs pj
        LEFT JOIN quotes q ON q.id = pj.quote_id
        WHERE pj.status IN ('completed', 'failed')
        ORDER BY pj.filename, pj.created_at DESC
      `
    } as any);

    // Fallback: direct query
    const { data: directData } = await supabase
      .from('parsing_jobs')
      .select(`
        id,
        filename,
        status,
        trade,
        supplier_name,
        created_at,
        metadata,
        quote_id,
        quotes:quote_id (
          id,
          total_amount,
          document_total,
          resolved_total,
          resolution_source,
          resolution_confidence,
          items_count,
          line_item_count,
          raw_items_count,
          optional_scope_total,
          parse_status,
          needs_review
        )
      `)
      .in('status', ['completed', 'failed'])
      .order('created_at', { ascending: false });

    if (directData) {
      const seen = new Set<string>();
      const unique = directData.filter(r => {
        if (seen.has(r.filename ?? '')) return false;
        seen.add(r.filename ?? '');
        return true;
      });

      const mapped: QuoteRow[] = unique.map((r: any) => {
        const q = Array.isArray(r.quotes) ? r.quotes[0] : r.quotes;
        const meta = r.metadata ?? {};
        const metaTotals = meta.totals ?? {};
        const metaDebug = meta.debug ?? {};
        const metaValidation = meta.validation ?? {};
        return {
          job_id: r.id,
          filename: r.filename ?? '',
          job_status: r.status,
          trade: r.trade ?? 'unknown',
          supplier_name: r.supplier_name ?? '',
          created_at: r.created_at,
          quote_id: q?.id ?? null,
          total_amount: q?.total_amount ?? null,
          document_total: q?.document_total ?? null,
          resolved_total: q?.resolved_total ?? null,
          resolution_source: q?.resolution_source ?? null,
          resolution_confidence: q?.resolution_confidence ?? null,
          items_count: q?.items_count ?? null,
          line_item_count: q?.line_item_count ?? null,
          raw_items_count: q?.raw_items_count ?? null,
          optional_scope_total: q?.optional_scope_total ?? null,
          parse_status: q?.parse_status ?? null,
          needs_review: q?.needs_review ?? null,
          parser_used: meta.parserUsed ?? null,
          commercial_family: meta.commercialFamily ?? null,
          document_class: meta.documentClass ?? null,
          confidence: typeof meta.confidence === 'number' ? meta.confidence : null,
          total_source: metaTotals.source ?? null,
          validation_risk: metaValidation.risk ?? null,
          variance_pct: metaValidation.variancePercent ? parseFloat(metaValidation.variancePercent) : null,
          summary_detected: metaDebug.summaryDetected ?? null,
          optional_scope_detected: metaDebug.optionalScopeDetected ?? null,
          item_count_base: metaDebug.itemCountBase ?? null,
          item_count_optional: metaDebug.itemCountOptional ?? null,
          item_count_excluded: metaDebug.itemCountExcluded ?? null,
          warnings: Array.isArray(metaValidation.warnings) ? metaValidation.warnings : null,
          grand_total: metaTotals.grandTotal ? parseFloat(metaTotals.grandTotal) : null,
          optional_total: metaTotals.optionalTotal ? parseFloat(metaTotals.optionalTotal) : null,
          row_sum: metaTotals.rowSum ? parseFloat(metaTotals.rowSum) : null,
        };
      });

      setRows(mapped.map(analyseRow));
    }

    setLoading(false);
  }

  // ---------------------------------------------------------------------------
  // Filtered / sorted view
  // ---------------------------------------------------------------------------

  const visible = rows
    .filter(r => filterTrade === 'all' || r.trade === filterTrade)
    .filter(r => filterLevel === 'all' || r.overallLevel === filterLevel)
    .filter(r => !search || r.filename.toLowerCase().includes(search.toLowerCase()) || r.supplier_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'created_at') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortCol === 'resolvedTotalDisplay') cmp = a.resolvedTotalDisplay - b.resolvedTotalDisplay;
      else if (sortCol === 'rowCount') cmp = a.rowCount - b.rowCount;
      else if (sortCol === 'varianceGrade') {
        const order = { OK: 0, MEDIUM: 1, HIGH: 2, null: 3 } as any;
        cmp = (order[a.varianceGrade ?? 'null'] ?? 3) - (order[b.varianceGrade ?? 'null'] ?? 3);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

  // ---------------------------------------------------------------------------
  // Scorecard numbers
  // ---------------------------------------------------------------------------

  const total = rows.length;
  const failCount = rows.filter(r => r.overallLevel === 'fail').length;
  const warnCount = rows.filter(r => r.overallLevel === 'warn').length;
  const okCount = rows.filter(r => r.overallLevel === 'ok').length;
  const noDocTotal = rows.filter(r => !r.document_total).length;
  const needsReview = rows.filter(r => r.needs_review).length;
  const highVar = rows.filter(r => r.varianceGrade === 'HIGH').length;
  const avgConf = rows.filter(r => r.confidence !== null).reduce((s, r) => s + (r.confidence ?? 0), 0) / (rows.filter(r => r.confidence !== null).length || 1);

  const trades = [...new Set(rows.map(r => r.trade))].filter(Boolean);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  function SortBtn({ col, label }: { col: typeof sortCol; label: string }) {
    const active = sortCol === col;
    return (
      <button onClick={() => toggleSort(col)} className={`flex items-center gap-1 text-xs font-medium transition-colors ${active ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'}`}>
        {label}
        {active ? (sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />) : <Minus className="w-3 h-3 opacity-30" />}
      </button>
    );
  }

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------

  function exportCSV() {
    const headers = [
      'filename', 'supplier', 'trade', 'status', 'parser_strategy',
      'llm_confidence', 'row_count', 'base_total', 'optional_total',
      'excluded_total', 'resolved_total', 'document_total', 'variance_grade',
      'variance_pct', 'resolution_source', 'needs_review', 'flags'
    ];
    const csvRows = [headers.join(',')];
    for (const r of rows) {
      csvRows.push([
        `"${r.filename}"`,
        `"${r.supplier_name}"`,
        r.trade,
        r.overallLevel,
        `"${r.parserStrategy}"`,
        r.confidence !== null ? (r.confidence * 100).toFixed(0) + '%' : '',
        r.rowCount,
        r.baseTotal.toFixed(2),
        r.optTotal.toFixed(2),
        r.exclTotal.toFixed(2),
        r.resolvedTotalDisplay.toFixed(2),
        r.document_total?.toFixed(2) ?? '',
        r.varianceGrade ?? '',
        computeVariancePct(r)?.toFixed(1) ?? '',
        r.resolution_source ?? '',
        r.needs_review ? 'yes' : 'no',
        `"${r.flags.map(f => f.message).join(' | ')}"`,
      ].join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parser-validation-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Parser Validation Report</h1>
            <p className="text-sm text-slate-400">Live corpus analysis — {total} unique files</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-800/60 hover:bg-sky-700/60 text-sky-200 text-sm border border-sky-700/50 transition-colors">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Scorecard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <ScoreCard label="Total Files" value={total} />
        <ScoreCard label="Pass" value={okCount} accent="text-emerald-400" sub={`${total ? Math.round(okCount/total*100) : 0}%`} />
        <ScoreCard label="Warnings" value={warnCount} accent="text-amber-400" sub={`${total ? Math.round(warnCount/total*100) : 0}%`} />
        <ScoreCard label="Failures" value={failCount} accent="text-red-400" sub={`${total ? Math.round(failCount/total*100) : 0}%`} />
        <ScoreCard label="Needs Review" value={needsReview} accent="text-orange-400" />
        <ScoreCard label="High Variance" value={highVar} accent="text-red-400" />
        <ScoreCard label="No Doc Total" value={noDocTotal} accent="text-slate-400" />
        <ScoreCard label="Avg Confidence" value={rows.some(r => r.confidence !== null) ? `${(avgConf * 100).toFixed(0)}%` : '—'} accent="text-sky-400" />
      </div>

      {/* Failure breakdown */}
      {failCount > 0 && (
        <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-red-300">Failures & Suspicious Results</span>
          </div>
          <div className="space-y-2">
            {rows.filter(r => r.overallLevel === 'fail').map(r => (
              <button
                key={r.job_id}
                onClick={() => setSelected(r)}
                className="w-full flex items-start gap-3 text-left rounded-xl bg-red-950/30 border border-red-900/40 px-4 py-2.5 hover:bg-red-950/50 transition-colors"
              >
                <FileText className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-red-200 font-medium truncate">{r.filename}</div>
                  <div className="text-xs text-red-400 mt-0.5">{r.flags.filter(f => f.level === 'fail').map(f => f.message).join(' • ')}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-lg border ${tradeBadge(r.trade)} flex-shrink-0`}>{r.trade.replace('_', ' ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search filename or supplier…"
            className="bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none w-48"
          />
        </div>
        <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select value={filterTrade} onChange={e => setFilterTrade(e.target.value)} className="bg-transparent text-sm text-slate-200 outline-none">
            <option value="all">All trades</option>
            {trades.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="bg-transparent text-sm text-slate-200 outline-none">
            <option value="all">All statuses</option>
            <option value="ok">Pass</option>
            <option value="warn">Warning</option>
            <option value="fail">Failure</option>
          </select>
        </div>
        <div className="ml-auto text-xs text-slate-500">{visible.length} of {total} shown</div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500 gap-3">
            <RefreshCw className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <th className="text-left px-4 py-3 w-6"></th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">File</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Trade</th>
                  <th className="text-left px-4 py-3"><SortBtn col="created_at" label="Parser Strategy" /></th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">LLM Conf.</th>
                  <th className="text-right px-4 py-3"><SortBtn col="rowCount" label="Rows" /></th>
                  <th className="text-right px-4 py-3"><SortBtn col="resolvedTotalDisplay" label="Base Total" /></th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Optional</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Excluded</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Resolved</th>
                  <th className="text-left px-4 py-3"><SortBtn col="varianceGrade" label="Variance" /></th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Warnings</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r, idx) => {
                  const isExpanded = expandedFlags.has(r.job_id);
                  return (
                    <>
                      <tr
                        key={r.job_id}
                        onClick={() => setSelected(r)}
                        className={`border-b border-slate-800/60 cursor-pointer transition-colors ${
                          r.overallLevel === 'fail' ? 'hover:bg-red-950/20 bg-red-950/10'
                            : r.overallLevel === 'warn' ? 'hover:bg-amber-950/10'
                            : 'hover:bg-slate-800/30'
                        }`}
                      >
                        {/* Status indicator */}
                        <td className="px-4 py-3">
                          {r.overallLevel === 'fail'
                            ? <XCircle className="w-4 h-4 text-red-400" />
                            : r.overallLevel === 'warn'
                            ? <AlertTriangle className="w-4 h-4 text-amber-400" />
                            : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        </td>
                        {/* File */}
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="text-slate-200 font-medium truncate">{r.filename}</div>
                          <div className="text-xs text-slate-500 truncate">{r.supplier_name}</div>
                        </td>
                        {/* Trade */}
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-lg border ${tradeBadge(r.trade)}`}>
                            {r.trade.replace('_', ' ')}
                          </span>
                        </td>
                        {/* Parser strategy */}
                        <td className="px-4 py-3 text-xs text-slate-400 max-w-[140px]">
                          <div className="truncate">{r.parserStrategy}</div>
                          {r.resolution_source && (
                            <div className="text-slate-600 truncate">{r.resolution_source}</div>
                          )}
                        </td>
                        {/* LLM confidence */}
                        <td className="px-4 py-3 text-right">
                          {r.confidence !== null ? (
                            <span className={`text-xs font-mono ${r.confidence >= 0.7 ? 'text-emerald-400' : r.confidence >= 0.4 ? 'text-amber-400' : 'text-red-400'}`}>
                              {(r.confidence * 100).toFixed(0)}%
                            </span>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                        {/* Row count */}
                        <td className="px-4 py-3 text-right text-slate-300 font-mono text-xs">
                          {r.rowCount > 0 ? r.rowCount : <span className="text-red-400 font-bold">0</span>}
                          {r.raw_items_count && r.raw_items_count !== r.rowCount && (
                            <span className="text-slate-600 ml-1">/{r.raw_items_count}</span>
                          )}
                        </td>
                        {/* Base total */}
                        <td className="px-4 py-3 text-right text-slate-200 font-mono text-xs whitespace-nowrap">
                          ${fmtCcy(r.baseTotal)}
                        </td>
                        {/* Optional */}
                        <td className="px-4 py-3 text-right text-xs font-mono whitespace-nowrap">
                          {r.optTotal > 0 ? <span className="text-sky-400">${fmtCcy(r.optTotal)}</span> : <span className="text-slate-600">—</span>}
                        </td>
                        {/* Excluded */}
                        <td className="px-4 py-3 text-right text-xs font-mono">
                          <span className="text-slate-600">—</span>
                        </td>
                        {/* Resolved */}
                        <td className="px-4 py-3 text-right text-slate-100 font-mono text-xs font-semibold whitespace-nowrap">
                          ${fmtCcy(r.resolvedTotalDisplay)}
                        </td>
                        {/* Variance */}
                        <td className="px-4 py-3">
                          <div className={`flex items-center gap-1.5 text-xs font-medium ${gradeColor(r.varianceGrade)}`}>
                            <GradeIcon g={r.varianceGrade} />
                            {r.varianceGrade ?? <span className="text-slate-600">—</span>}
                            {r.varianceGrade && computeVariancePct(r) !== null && (
                              <span className="text-slate-500 font-normal ml-0.5">{fmtPct(computeVariancePct(r))}</span>
                            )}
                          </div>
                        </td>
                        {/* Warnings */}
                        <td className="px-4 py-3">
                          {r.flags.length > 0 ? (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedFlags(s => {
                                  const n = new Set(s);
                                  n.has(r.job_id) ? n.delete(r.job_id) : n.add(r.job_id);
                                  return n;
                                });
                              }}
                              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
                            >
                              <Info className="w-3.5 h-3.5" />
                              {r.flags.length} flag{r.flags.length !== 1 ? 's' : ''}
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          ) : <span className="text-slate-600 text-xs">none</span>}
                        </td>
                        {/* Needs review */}
                        <td className="px-4 py-3">
                          {r.needs_review
                            ? <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-900/40 text-amber-300 border border-amber-700/50">Review</span>
                            : r.job_status === 'failed'
                            ? <span className="text-xs px-2 py-0.5 rounded-lg bg-red-900/40 text-red-300 border border-red-700/50">Failed</span>
                            : <span className="text-xs text-slate-600">OK</span>}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${r.job_id}-flags`} className="bg-slate-900/40">
                          <td colSpan={13} className="px-6 pb-3 pt-0">
                            <div className="flex flex-wrap gap-2 pt-2">
                              {r.flags.map((f, i) => (
                                <div key={i} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${
                                  f.level === 'fail' ? 'bg-red-950/40 border-red-800/50 text-red-300'
                                    : 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                                }`}>
                                  {f.level === 'fail'
                                    ? <XCircle className="w-3 h-3 flex-shrink-0" />
                                    : <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
                                  {f.message}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 && (
              <div className="py-16 text-center text-slate-500 text-sm">No results match the current filters</div>
            )}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && <RowDetail row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
