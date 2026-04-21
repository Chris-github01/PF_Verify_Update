import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronsRight,
  Clock,
  Filter,
  GitCompare,
  Rocket,
  Timer,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Winner = 'v1' | 'v2' | 'equal';
type ReviewStatus = 'any' | 'required' | 'clean';

interface ComparisonRow {
  id: string;
  created_at: string;
  quote_id: string | null;
  supplier: string;
  trade: string;
  v1_total: number;
  v2_total: number;
  actual_total: number | null;
  v1_runtime_ms: number;
  v2_runtime_ms: number;
  requires_review: boolean;
  winner: Winner;
}

const EMPTY_FILTER = '__all__';

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(raw: Record<string, unknown>): ComparisonRow {
  const winnerRaw = typeof raw.winner === 'string' ? raw.winner.toLowerCase() : 'equal';
  const winner: Winner =
    winnerRaw === 'v1' || winnerRaw === 'v2' ? (winnerRaw as Winner) : 'equal';
  return {
    id: String(raw.id ?? ''),
    created_at: String(raw.created_at ?? new Date().toISOString()),
    quote_id: (raw.quote_id as string | null) ?? null,
    supplier: typeof raw.supplier === 'string' ? raw.supplier : '',
    trade: typeof raw.trade === 'string' ? raw.trade : '',
    v1_total: toNum(raw.v1_total),
    v2_total: toNum(raw.v2_total),
    actual_total: toNullableNum(raw.actual_total),
    v1_runtime_ms: toNum(raw.v1_runtime_ms),
    v2_runtime_ms: toNum(raw.v2_runtime_ms),
    requires_review: !!raw.requires_review,
    winner,
  };
}

export default function VersionComparison() {
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tradeFilter, setTradeFilter] = useState<string>(EMPTY_FILTER);
  const [supplierFilter, setSupplierFilter] = useState<string>(EMPTY_FILTER);
  const [winnerFilter, setWinnerFilter] = useState<Winner | 'all'>('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewStatus>('any');
  const [rangeDays, setRangeDays] = useState<number>(30);

  useEffect(() => {
    void loadComparisons();
  }, [rangeDays]);

  const loadComparisons = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
      const { data, error: err } = await supabase
        .from('parser_version_comparisons')
        .select(
          'id, created_at, quote_id, supplier, trade, v1_total, v2_total, actual_total, v1_runtime_ms, v2_runtime_ms, requires_review, winner',
        )
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);

      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows((data ?? []).map(normalizeRow));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const trades = useMemo(
    () => Array.from(new Set(rows.map((r) => r.trade).filter(Boolean))).sort(),
    [rows],
  );
  const suppliers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.supplier).filter(Boolean))).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (tradeFilter !== EMPTY_FILTER && r.trade !== tradeFilter) return false;
      if (supplierFilter !== EMPTY_FILTER && r.supplier !== supplierFilter) return false;
      if (winnerFilter !== 'all' && r.winner !== winnerFilter) return false;
      if (reviewFilter === 'required' && !r.requires_review) return false;
      if (reviewFilter === 'clean' && r.requires_review) return false;
      return true;
    });
  }, [rows, tradeFilter, supplierFilter, winnerFilter, reviewFilter]);

  const kpis = useMemo(() => computeKPIs(filteredRows), [filteredRows]);
  const failureCauses = useMemo(() => computeFailureCauses(filteredRows), [filteredRows]);
  const readiness = useMemo(() => computeReadiness(rows), [rows]);

  const enriched = useMemo(
    () => filteredRows.map((r) => ({ ...r, variance_pct: deriveVariance(r) })),
    [filteredRows],
  );

  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <GitCompare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-50">Version Comparison</h1>
              <p className="text-sm text-slate-400">
                Legacy parser V1 vs parser_v2 during shadow rollout
              </p>
            </div>
          </div>
        </div>
        <ReadinessBadge readiness={readiness} />
      </header>

      <KpiGrid kpis={kpis} />

      <FilterBar
        trades={trades}
        suppliers={suppliers}
        tradeFilter={tradeFilter}
        supplierFilter={supplierFilter}
        winnerFilter={winnerFilter}
        reviewFilter={reviewFilter}
        rangeDays={rangeDays}
        onTrade={setTradeFilter}
        onSupplier={setSupplierFilter}
        onWinner={setWinnerFilter}
        onReview={setReviewFilter}
        onRange={setRangeDays}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <ComparisonTable rows={enriched} loading={loading} error={error} />
        </div>
        <div className="space-y-6">
          <FailureCausesPanel causes={failureCauses} />
          <ReadinessPanel readiness={readiness} />
        </div>
      </div>
    </div>
  );
}

interface Kpis {
  compared: number;
  v2Better: number;
  equal: number;
  v1Better: number;
  v2Accuracy: number;
  avgV1: number;
  avgV2: number;
  v2ReviewRate: number;
}

function computeKPIs(rows: ComparisonRow[]): Kpis {
  const compared = rows.length;
  const v2Better = rows.filter((r) => r.winner === 'v2').length;
  const equal = rows.filter((r) => r.winner === 'equal').length;
  const v1Better = rows.filter((r) => r.winner === 'v1').length;

  const withActual = rows.filter((r) => r.actual_total != null && r.actual_total > 0);
  const v2Hits = withActual.filter((r) => {
    const diff = Math.abs(r.v2_total - (r.actual_total as number));
    return diff / (r.actual_total as number) <= 0.01;
  }).length;
  const v2Accuracy = withActual.length === 0 ? 0 : (v2Hits / withActual.length) * 100;

  const avgV1 = compared === 0 ? 0 : rows.reduce((a, r) => a + r.v1_runtime_ms, 0) / compared;
  const avgV2 = compared === 0 ? 0 : rows.reduce((a, r) => a + r.v2_runtime_ms, 0) / compared;

  const needsReview = rows.filter((r) => r.requires_review).length;
  const v2ReviewRate = compared === 0 ? 0 : (needsReview / compared) * 100;

  return { compared, v2Better, equal, v1Better, v2Accuracy, avgV1, avgV2, v2ReviewRate };
}

interface FailureCause {
  cause: string;
  count: number;
}

function computeFailureCauses(rows: ComparisonRow[]): FailureCause[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const cause = deriveFailureCause(r);
    if (!cause) continue;
    counts.set(cause, (counts.get(cause) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function deriveFailureCause(r: ComparisonRow): string | null {
  if (r.actual_total != null && r.actual_total > 0) {
    const v2Diff = Math.abs(r.v2_total - r.actual_total) / r.actual_total;
    if (v2Diff > 0.1) return 'V2 total >10% off actual';
    if (v2Diff > 0.01) return 'V2 total 1–10% off actual';
  }
  if (r.requires_review) return 'Flagged for manual review';
  if (r.winner === 'v1') return 'V1 outperformed V2';
  return null;
}

function deriveVariance(r: ComparisonRow): number {
  const ref = r.actual_total != null && r.actual_total > 0 ? r.actual_total : r.v1_total;
  if (!ref) return 0;
  return ((r.v2_total - ref) / ref) * 100;
}

interface Readiness {
  eligible: boolean;
  ready: boolean;
  sampleSize: number;
  accuracy: number;
  reviewsRequired: number;
  minSample: number;
  accuracyTarget: number;
  maxReviews: number;
}

function computeReadiness(rows: ComparisonRow[]): Readiness {
  const minSample = 50;
  const accuracyTarget = 97;
  const maxReviews = 3;

  const last = rows.slice(0, minSample);
  const withActual = last.filter((r) => r.actual_total != null && r.actual_total > 0);
  const hits = withActual.filter((r) => {
    const diff = Math.abs(r.v2_total - (r.actual_total as number));
    return diff / (r.actual_total as number) <= 0.01;
  }).length;
  const accuracy = withActual.length === 0 ? 0 : (hits / withActual.length) * 100;
  const reviewsRequired = last.filter((r) => r.requires_review).length;

  return {
    eligible: last.length >= minSample,
    ready: last.length >= minSample && accuracy > accuracyTarget && reviewsRequired < maxReviews,
    sampleSize: last.length,
    accuracy,
    reviewsRequired,
    minSample,
    accuracyTarget,
    maxReviews,
  };
}

function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  if (readiness.ready) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.25)]">
        <Rocket className="w-4 h-4" />
        Ready to switch V2 as default parser
      </div>
    );
  }
  if (!readiness.eligible) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm text-slate-300">
        <Clock className="w-4 h-4" />
        Collecting {readiness.sampleSize}/{readiness.minSample} samples
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
      <AlertTriangle className="w-4 h-4" />
      V2 not ready yet
    </div>
  );
}

function KpiGrid({ kpis }: { kpis: Kpis }) {
  const cards: {
    label: string;
    value: string;
    sub?: string;
    icon: React.ReactNode;
    tone: 'sky' | 'emerald' | 'slate' | 'rose' | 'amber' | 'cyan';
  }[] = [
    { label: 'Quotes Compared', value: kpis.compared.toLocaleString(), icon: <Activity className="w-4 h-4" />, tone: 'sky' },
    { label: 'V2 Better Than V1', value: kpis.v2Better.toLocaleString(), sub: pct(kpis.v2Better, kpis.compared), icon: <TrendingUp className="w-4 h-4" />, tone: 'emerald' },
    { label: 'Equal Results', value: kpis.equal.toLocaleString(), sub: pct(kpis.equal, kpis.compared), icon: <ChevronsRight className="w-4 h-4" />, tone: 'slate' },
    { label: 'V1 Better Than V2', value: kpis.v1Better.toLocaleString(), sub: pct(kpis.v1Better, kpis.compared), icon: <Trophy className="w-4 h-4" />, tone: 'rose' },
    { label: 'V2 Accuracy', value: `${kpis.v2Accuracy.toFixed(1)}%`, sub: 'vs ground truth', icon: <CheckCircle2 className="w-4 h-4" />, tone: 'cyan' },
    { label: 'Avg Runtime V1', value: fmtMs(kpis.avgV1), icon: <Timer className="w-4 h-4" />, tone: 'amber' },
    { label: 'Avg Runtime V2', value: fmtMs(kpis.avgV2), sub: runtimeDelta(kpis.avgV1, kpis.avgV2), icon: <Timer className="w-4 h-4" />, tone: 'amber' },
  ];

  const tones: Record<string, string> = {
    sky: 'from-sky-500/20 to-sky-500/0 text-sky-300',
    emerald: 'from-emerald-500/20 to-emerald-500/0 text-emerald-300',
    slate: 'from-slate-500/20 to-slate-500/0 text-slate-300',
    rose: 'from-rose-500/20 to-rose-500/0 text-rose-300',
    amber: 'from-amber-500/20 to-amber-500/0 text-amber-300',
    cyan: 'from-cyan-500/20 to-cyan-500/0 text-cyan-300',
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-2"
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${tones[c.tone]} pointer-events-none`} />
          <div className="relative flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">{c.label}</span>
            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-xl bg-slate-950/60 ${tones[c.tone].split(' ').pop()}`}>
              {c.icon}
            </span>
          </div>
          <div className="relative">
            <div className="text-2xl font-semibold text-slate-50">{c.value}</div>
            {c.sub && <div className="text-[11px] text-slate-400 mt-0.5">{c.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

interface FilterBarProps {
  trades: string[];
  suppliers: string[];
  tradeFilter: string;
  supplierFilter: string;
  winnerFilter: Winner | 'all';
  reviewFilter: ReviewStatus;
  rangeDays: number;
  onTrade: (v: string) => void;
  onSupplier: (v: string) => void;
  onWinner: (v: Winner | 'all') => void;
  onReview: (v: ReviewStatus) => void;
  onRange: (v: number) => void;
}

function FilterBar(p: FilterBarProps) {
  const selectCls =
    'bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 mb-3 text-slate-300">
        <Filter className="w-4 h-4" />
        <span className="text-sm font-medium">Filters</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Trade</span>
          <select className={selectCls} value={p.tradeFilter} onChange={(e) => p.onTrade(e.target.value)}>
            <option value={EMPTY_FILTER}>All trades</option>
            {p.trades.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Supplier</span>
          <select className={selectCls} value={p.supplierFilter} onChange={(e) => p.onSupplier(e.target.value)}>
            <option value={EMPTY_FILTER}>All suppliers</option>
            {p.suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Date Range</span>
          <select className={selectCls} value={p.rangeDays} onChange={(e) => p.onRange(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 12 months</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Winner</span>
          <select className={selectCls} value={p.winnerFilter} onChange={(e) => p.onWinner(e.target.value as Winner | 'all')}>
            <option value="all">Any winner</option>
            <option value="v2">V2 wins</option>
            <option value="equal">Equal</option>
            <option value="v1">V1 wins</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Review Status</span>
          <select className={selectCls} value={p.reviewFilter} onChange={(e) => p.onReview(e.target.value as ReviewStatus)}>
            <option value="any">All</option>
            <option value="required">Requires review</option>
            <option value="clean">Clean</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function ComparisonTable({
  rows,
  loading,
  error,
}: {
  rows: (ComparisonRow & { variance_pct: number })[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-100">Comparison Results</h3>
        <span className="text-xs text-slate-400">{rows.length} quote{rows.length === 1 ? '' : 's'}</span>
      </div>
      {error && (
        <div className="px-4 py-8 text-center text-sm text-rose-300">
          Failed to load comparisons: {error}
        </div>
      )}
      {!error && loading && (
        <div className="px-4 py-10 text-center text-sm text-slate-400">Loading…</div>
      )}
      {!error && !loading && rows.length === 0 && (
        <div className="px-4 py-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/60 mb-3">
            <GitCompare className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-300 font-medium">No comparisons yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Shadow-mode runs will populate this view once both parsers produce results for the same quote.
          </p>
        </div>
      )}
      {!error && !loading && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Supplier</th>
                <th className="text-left px-4 py-2.5 font-medium">Trade</th>
                <th className="text-right px-4 py-2.5 font-medium">V1 Total</th>
                <th className="text-right px-4 py-2.5 font-medium">V2 Total</th>
                <th className="text-right px-4 py-2.5 font-medium">Actual</th>
                <th className="text-right px-4 py-2.5 font-medium">Variance</th>
                <th className="text-right px-4 py-2.5 font-medium">V1 Runtime</th>
                <th className="text-right px-4 py-2.5 font-medium">V2 Runtime</th>
                <th className="text-left px-4 py-2.5 font-medium">Winner</th>
                <th className="text-left px-4 py-2.5 font-medium">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800/60 hover:bg-slate-900/60 transition">
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-slate-200">{r.supplier || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-300">{r.trade || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-200 tabular-nums">{fmtMoney(r.v1_total)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-200 tabular-nums">{fmtMoney(r.v2_total)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">
                    {r.actual_total != null ? fmtMoney(r.actual_total) : '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${varianceTone(r.variance_pct)}`}>
                    {`${r.variance_pct.toFixed(2)}%`}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">{fmtMs(r.v1_runtime_ms)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">{fmtMs(r.v2_runtime_ms)}</td>
                  <td className="px-4 py-2.5"><WinnerPill winner={r.winner} /></td>
                  <td className="px-4 py-2.5"><ReviewPill requires={r.requires_review} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WinnerPill({ winner }: { winner: Winner }) {
  const map: Record<Winner, string> = {
    v2: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    v1: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    equal: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  const label: Record<Winner, string> = { v2: 'V2', v1: 'V1', equal: 'Equal' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${map[winner]}`}>
      {label[winner]}
    </span>
  );
}

function ReviewPill({ requires }: { requires: boolean }) {
  if (!requires) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
        Clean
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-amber-500/10 text-amber-300 border-amber-500/30">
      Review Required
    </span>
  );
}

function FailureCausesPanel({ causes }: { causes: FailureCause[] }) {
  const total = causes.reduce((a, c) => a + c.count, 0);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-slate-100">Top Failure Causes</h3>
      </div>
      {causes.length === 0 ? (
        <p className="text-xs text-slate-500">No failures recorded in this range.</p>
      ) : (
        <ul className="space-y-3">
          {causes.map((c) => {
            const pctVal = total === 0 ? 0 : (c.count / total) * 100;
            return (
              <li key={c.cause}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-300 truncate pr-2">{c.cause}</span>
                  <span className="text-xs text-slate-400 tabular-nums">{c.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-rose-500" style={{ width: `${pctVal}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ReadinessPanel({ readiness }: { readiness: Readiness }) {
  const rows = [
    {
      label: `Sample size (≥ ${readiness.minSample})`,
      value: `${readiness.sampleSize}`,
      ok: readiness.sampleSize >= readiness.minSample,
    },
    {
      label: `V2 accuracy (> ${readiness.accuracyTarget}%)`,
      value: `${readiness.accuracy.toFixed(1)}%`,
      ok: readiness.accuracy > readiness.accuracyTarget,
    },
    {
      label: `Reviews required (< ${readiness.maxReviews})`,
      value: `${readiness.reviewsRequired}`,
      ok: readiness.reviewsRequired < readiness.maxReviews,
    },
  ];
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Rocket className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-semibold text-slate-100">Migration Readiness</h3>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">{r.label}</span>
            <span className={`text-xs font-medium tabular-nums ${r.ok ? 'text-emerald-300' : 'text-slate-300'}`}>
              {r.ok ? '✓ ' : ''}{r.value}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400 leading-relaxed">
        Measured against the most recent 50 quotes. When all three criteria are met, the
        green badge at the top of the page signals V2 is safe to promote as the default parser.
      </div>
    </div>
  );
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

function fmtMs(ms: number): string {
  if (ms === 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function runtimeDelta(v1: number, v2: number): string {
  if (v1 === 0 || v2 === 0) return '';
  const delta = ((v2 - v1) / v1) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}% vs V1`;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function varianceTone(v: number | null): string {
  if (v == null) return 'text-slate-400';
  const abs = Math.abs(v);
  if (abs <= 1) return 'text-emerald-300';
  if (abs <= 5) return 'text-amber-300';
  return 'text-rose-300';
}
