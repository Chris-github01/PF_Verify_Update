import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Play, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, BarChart3, FileText, Bug, RefreshCw, Target, TrendingUp, List,
  Database, GitCompare, Plus, Trash2, FlaskConical, Tag, Download,
  ArrowUpDown, ArrowUp, ArrowDown, Filter, Layers,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommercialFamily =
  | 'itemized_quote' | 'lump_sum_quote' | 'hybrid_quote'
  | 'spreadsheet_quote' | 'scanned_ocr_quote' | 'unknown_quote' | '';

type TradeModule =
  | 'passive_fire' | 'plumbing' | 'electrical' | 'carpentry' | 'hvac' | 'active_fire' | '';

type ErrorCategory =
  | 'wrong_family_selected' | 'total_extraction_failed' | 'optional_contamination'
  | 'exclusions_counted' | 'duplicate_inflation' | 'row_parse_low_quality'
  | 'ocr_low_quality' | 'fallback_used' | null;

interface Diagnostics {
  document_class: string;
  commercial_family: CommercialFamily;
  confidence: number;
  classifier_reasons: string[];
  signals: Record<string, unknown>;
  parser_used: string;
  total_source: string;
  warnings: string[];
  validation_risk: string;
  parser_reasons: string[];
  parsed_total: number;
  optional_total: number;
  row_sum: number;
  sub_total: number | null;
  item_count: number;
  item_count_base: number;
  item_count_optional: number;
  item_count_excluded: number;
  summary_detected: boolean;
  optional_scope_detected: boolean;
  expected_family: string;
  expected_total: number;
  expected_optional_total: number;
  expected_item_count_min: number | null;
  expected_item_count_max: number | null;
  expected_has_optional: boolean | null;
  expected_has_exclusions: boolean | null;
  variance: number;
  variance_pct: number | null;
  pass: boolean;
  total_pass: boolean | null;
  item_count_ok: boolean | null;
  optional_pass: boolean | null;
  has_optional_pass: boolean | null;
  error_category: ErrorCategory;
  filename: string;
  file_extension: string;
  duration_ms: number;
}

interface HistoryRun {
  id: string;
  run_at: string;
  filename: string;
  expected_family: string;
  detected_family: string;
  expected_total: number;
  parsed_total: number;
  variance_pct: number | null;
  pass: boolean | null;
  validation_risk: string;
  confidence: number;
  item_count: number;
  total_source: string;
  error_category: ErrorCategory;
  run_mode: string;
  trade: TradeModule | null;
}

interface Benchmark {
  id: string;
  label: string;
  filename: string;
  storage_path: string;
  expected_family: string;
  expected_total: number;
  expected_optional_total: number;
  expected_item_count_min: number | null;
  expected_item_count_max: number | null;
  expected_has_optional: boolean | null;
  is_active: boolean;
  notes: string;
  created_at: string;
  trade: TradeModule | null;
}

interface BulkQueueItem {
  file: File;
  label: string;
  family: CommercialFamily;
  trade: TradeModule;
  total: string;
  optTotal: string;
  hasOptional: string;
  suggestedFamily: CommercialFamily;
}

interface BatchRunProgress {
  label: string;
  filename: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'error';
  error_category?: ErrorCategory;
  variance_pct?: number | null;
}

interface ShadowDiff {
  [key: string]: { current: unknown; candidate: unknown; changed: boolean };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAMILY_OPTIONS: { value: CommercialFamily; label: string }[] = [
  { value: 'itemized_quote', label: 'Itemized Quote' },
  { value: 'lump_sum_quote', label: 'Lump Sum Quote' },
  { value: 'hybrid_quote', label: 'Hybrid Quote' },
  { value: 'spreadsheet_quote', label: 'Spreadsheet Quote' },
  { value: 'scanned_ocr_quote', label: 'Scanned / OCR Quote' },
];

const TRADE_OPTIONS: { value: TradeModule; label: string }[] = [
  { value: 'passive_fire', label: 'Passive Fire' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'active_fire', label: 'Active Fire' },
];

const FAMILIES = ['itemized_quote', 'lump_sum_quote', 'hybrid_quote', 'spreadsheet_quote', 'scanned_ocr_quote'];
const TRADES = ['passive_fire', 'plumbing', 'electrical', 'carpentry', 'hvac', 'active_fire'];

const FAMILY_COLORS: Record<string, string> = {
  itemized_quote: 'bg-blue-100 text-blue-800',
  lump_sum_quote: 'bg-amber-100 text-amber-800',
  hybrid_quote: 'bg-teal-100 text-teal-800',
  spreadsheet_quote: 'bg-green-100 text-green-800',
  scanned_ocr_quote: 'bg-slate-100 text-slate-700',
  unknown_quote: 'bg-red-100 text-red-700',
};

const TRADE_COLORS: Record<string, string> = {
  passive_fire: 'bg-orange-100 text-orange-800',
  plumbing: 'bg-blue-100 text-blue-800',
  electrical: 'bg-yellow-100 text-yellow-800',
  carpentry: 'bg-stone-100 text-stone-800',
  hvac: 'bg-cyan-100 text-cyan-800',
  active_fire: 'bg-red-100 text-red-800',
};

const TRADE_LABELS: Record<string, string> = {
  passive_fire: 'Passive Fire',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  carpentry: 'Carpentry',
  hvac: 'HVAC',
  active_fire: 'Active Fire',
};

const ERROR_COLORS: Record<string, string> = {
  wrong_family_selected: 'bg-red-100 text-red-700',
  total_extraction_failed: 'bg-red-100 text-red-700',
  optional_contamination: 'bg-orange-100 text-orange-700',
  exclusions_counted: 'bg-orange-100 text-orange-700',
  duplicate_inflation: 'bg-yellow-100 text-yellow-700',
  row_parse_low_quality: 'bg-yellow-100 text-yellow-700',
  ocr_low_quality: 'bg-slate-100 text-slate-600',
  fallback_used: 'bg-slate-100 text-slate-600',
};

const fmt = (n: number) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
const pct = (n: number | null) => n === null ? '—' : n.toFixed(2) + '%';

// ---------------------------------------------------------------------------
// Family auto-suggest from filename/extension
// ---------------------------------------------------------------------------

function suggestFamilyFromFile(file: File): CommercialFamily {
  const name = file.name.toLowerCase();
  const ext = name.split('.').pop() ?? '';

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'spreadsheet_quote';
  if (name.includes('ocr') || name.includes('scan') || name.includes('scanned')) return 'scanned_ocr_quote';
  if (name.includes('lump') || name.includes('lumpsum') || name.includes('lump_sum')) return 'lump_sum_quote';
  if (name.includes('hybrid')) return 'hybrid_quote';
  if (name.includes('itemis') || name.includes('itemiz') || name.includes('schedule')) return 'itemized_quote';
  return '';
}

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------

function exportHistoryCSV(rows: HistoryRun[]) {
  const headers = ['filename', 'run_mode', 'trade', 'expected_family', 'detected_family', 'expected_total', 'parsed_total', 'variance_pct', 'pass', 'error_category', 'run_at'];
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      `"${r.filename}"`,
      r.run_mode,
      r.trade ?? '',
      r.expected_family,
      r.detected_family,
      r.expected_total,
      r.parsed_total,
      r.variance_pct ?? '',
      r.pass ? 'PASS' : 'FAIL',
      r.error_category ?? '',
      r.run_at,
    ].join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `parser_validation_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

function PassBadge({ pass }: { pass: boolean | null }) {
  if (pass === true) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (pass === false) return <XCircle className="w-4 h-4 text-red-500" />;
  return <span className="text-slate-400 text-xs">—</span>;
}

function FamilyTag({ family }: { family: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FAMILY_COLORS[family] ?? 'bg-slate-100 text-slate-600'}`}>
      {family.replace(/_quote$/, '').replace(/_/g, ' ') || '—'}
    </span>
  );
}

function TradeTag({ trade }: { trade: string | null }) {
  if (!trade) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TRADE_COLORS[trade] ?? 'bg-slate-100 text-slate-600'}`}>
      {TRADE_LABELS[trade] ?? trade}
    </span>
  );
}

function ErrorTag({ cat }: { cat: ErrorCategory }) {
  if (!cat) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ERROR_COLORS[cat] ?? 'bg-slate-100 text-slate-600'}`}>
      {cat.replace(/_/g, ' ')}
    </span>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | null; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color ?? 'text-slate-800'}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter pills
// ---------------------------------------------------------------------------

function FilterPills({ label, icon, options, value, onChange }: {
  label: string;
  icon: React.ReactNode;
  options: { value: string; label: string; color?: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="flex items-center gap-1 text-xs text-slate-500 shrink-0">{icon}{label}:</span>
      <button
        onClick={() => onChange('')}
        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${value === '' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
      >
        All
      </button>
      {options.map(o => (
        <button key={o.value}
          onClick={() => onChange(o.value === value ? '' : o.value)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${value === o.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 1 — Single Test
// ---------------------------------------------------------------------------

function SingleTestTab({ history, onHistoryChange }: { history: HistoryRun[]; onHistoryChange: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [expectedFamily, setExpectedFamily] = useState<CommercialFamily>('');
  const [expectedTotal, setExpectedTotal] = useState('');
  const [expectedOptionalTotal, setExpectedOptionalTotal] = useState('');
  const [expectedItemMin, setExpectedItemMin] = useState('');
  const [expectedItemMax, setExpectedItemMax] = useState('');
  const [expectedHasOptional, setExpectedHasOptional] = useState('');
  const [expectedHasExclusions, setExpectedHasExclusions] = useState('');
  const [persist, setPersist] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'comparison' | 'diagnostics'>('comparison');
  const [showSignals, setShowSignals] = useState(false);
  const [showReasons, setShowReasons] = useState(false);

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    const suggested = suggestFamilyFromFile(f);
    if (suggested && !expectedFamily) setExpectedFamily(suggested);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleRun = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const form = new FormData();
      form.append('file', file);
      form.append('mode', 'single');
      form.append('expectedFamily', expectedFamily);
      form.append('expectedTotal', expectedTotal);
      form.append('expectedOptionalTotal', expectedOptionalTotal);
      if (expectedItemMin) form.append('expectedItemCountMin', expectedItemMin);
      if (expectedItemMax) form.append('expectedItemCountMax', expectedItemMax);
      form.append('expectedHasOptional', expectedHasOptional);
      form.append('expectedHasExclusions', expectedHasExclusions);
      form.append('persist', persist ? 'true' : 'false');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate_parser`,
        { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Validation failed');
      setResult(json.diagnostics as Diagnostics);
      setActiveTab('comparison');
      if (persist) onHistoryChange();
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const d = result;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Upload className="w-4 h-4 text-slate-400" />Upload Test Document
          </h2>

          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-colors"
          >
            {file ? (
              <div>
                <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                {suggestFamilyFromFile(file) && (
                  <p className="text-xs text-teal-600 mt-1">Auto-suggested: {suggestFamilyFromFile(file).replace(/_quote$/, '').replace(/_/g, ' ')}</p>
                )}
              </div>
            ) : (
              <div>
                <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Drop a PDF, XLSX, or CSV here</p>
                <p className="text-xs text-slate-400 mt-1">or click to browse</p>
              </div>
            )}
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ground Truth</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-600 mb-1">Expected Document Type</label>
                <select value={expectedFamily} onChange={e => setExpectedFamily(e.target.value as CommercialFamily)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Not specified —</option>
                  {FAMILY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Expected Total</label>
                <input type="text" value={expectedTotal} onChange={e => setExpectedTotal(e.target.value)}
                  placeholder="485000.00" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Expected Optional Total</label>
                <input type="text" value={expectedOptionalTotal} onChange={e => setExpectedOptionalTotal(e.target.value)}
                  placeholder="0.00" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Item Count Min</label>
                <input type="number" value={expectedItemMin} onChange={e => setExpectedItemMin(e.target.value)}
                  placeholder="—" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Item Count Max</label>
                <input type="number" value={expectedItemMax} onChange={e => setExpectedItemMax(e.target.value)}
                  placeholder="—" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Has Optional Scope?</label>
                <select value={expectedHasOptional} onChange={e => setExpectedHasOptional(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Not specified —</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Has Exclusions?</label>
                <select value={expectedHasExclusions} onChange={e => setExpectedHasExclusions(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Not specified —</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={persist} onChange={e => setPersist(e.target.checked)} className="rounded" />
              <span className="text-xs text-slate-600">Save run to history</span>
            </label>
          </div>

          <button onClick={handleRun} disabled={!file || loading}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Running...</> : <><Play className="w-4 h-4" />Run Validation</>}
          </button>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
      </div>

      <div className="space-y-4">
        {d ? (
          <>
            <div className={`rounded-xl px-4 py-3 flex items-center gap-3 ${d.pass ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {d.pass ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> : <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800">
                  {d.pass ? 'PASS — all checks within tolerance' : `FAIL — ${d.error_category ? d.error_category.replace(/_/g, ' ') : pct(d.variance_pct) + ' variance'}`}
                </div>
                <div className="text-xs text-slate-500 truncate">{d.filename} · {d.duration_ms}ms</div>
              </div>
              {d.error_category && <ErrorTag cat={d.error_category} />}
            </div>

            <div className="flex border-b border-slate-200">
              {(['comparison', 'diagnostics'] as const).map(key => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {key === 'comparison' ? <Target className="w-3.5 h-3.5" /> : <BarChart3 className="w-3.5 h-3.5" />}
                  {key}
                </button>
              ))}
            </div>

            {activeTab === 'comparison' && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                  <Target className="w-4 h-4 text-slate-500" /><span className="text-sm font-semibold text-slate-700">Comparison</span>
                </div>
                <div className="divide-y divide-slate-100 text-sm">
                  <div className="grid grid-cols-3 gap-4 px-4 py-2 bg-slate-50">
                    {['Field', 'Expected', 'Detected'].map(h => <div key={h} className="text-xs font-medium text-slate-500">{h}</div>)}
                  </div>
                  {[
                    {
                      label: 'Document Type',
                      exp: d.expected_family ? <FamilyTag family={d.expected_family} /> : <span className="text-slate-400">—</span>,
                      det: <div className="flex items-center gap-1.5"><FamilyTag family={d.commercial_family} />{d.expected_family && <PassBadge pass={d.commercial_family === d.expected_family} />}</div>,
                    },
                    {
                      label: 'Total',
                      exp: <span className="font-mono">{d.expected_total > 0 ? fmt(d.expected_total) : '—'}</span>,
                      det: <div className="flex items-center gap-1.5"><span className="font-mono">{fmt(d.parsed_total)}</span><PassBadge pass={d.total_pass} /></div>,
                    },
                    {
                      label: 'Optional Total',
                      exp: <span className="font-mono">{d.expected_optional_total > 0 ? fmt(d.expected_optional_total) : '—'}</span>,
                      det: <div className="flex items-center gap-1.5"><span className="font-mono">{fmt(d.optional_total)}</span><PassBadge pass={d.optional_pass} /></div>,
                    },
                    {
                      label: 'Item Count',
                      exp: <span className="text-slate-600">{d.expected_item_count_min != null ? `${d.expected_item_count_min}–${d.expected_item_count_max}` : '—'}</span>,
                      det: <div className="flex items-center gap-1.5"><span>{d.item_count}</span><PassBadge pass={d.item_count_ok} /></div>,
                    },
                    {
                      label: 'Has Optional',
                      exp: <span>{d.expected_has_optional === null ? '—' : d.expected_has_optional ? 'Yes' : 'No'}</span>,
                      det: <div className="flex items-center gap-1.5"><span>{d.item_count_optional > 0 ? 'Yes' : 'No'}</span><PassBadge pass={d.has_optional_pass} /></div>,
                    },
                    {
                      label: 'Variance',
                      exp: <span />,
                      det: <span className={`font-mono font-semibold ${d.total_pass ? 'text-green-600' : 'text-red-600'}`}>{d.expected_total > 0 ? `${fmt(d.variance)} (${pct(d.variance_pct)})` : '—'}</span>,
                    },
                    {
                      label: 'Document Class',
                      exp: <span />,
                      det: <span className="text-xs font-mono text-slate-600">{d.document_class}</span>,
                    },
                  ].map(({ label, exp, det }) => (
                    <div key={label} className="grid grid-cols-3 gap-4 px-4 py-2.5 items-center">
                      <span className="text-slate-500">{label}</span>
                      <div>{exp}</div>
                      <div>{det}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'diagnostics' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[['Confidence', `${(d.confidence * 100).toFixed(0)}%`], ['Base Items', String(d.item_count_base)], ['Optional', String(d.item_count_optional)], ['Excluded', String(d.item_count_excluded)]].map(([lbl, val]) => (
                    <div key={lbl} className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
                      <div className="text-xs text-slate-500 mb-1">{lbl}</div>
                      <div className="text-lg font-bold text-slate-800">{val}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                  {[
                    ['Grand Total', fmt(d.parsed_total), true],
                    ['Row Sum', fmt(d.row_sum), true],
                    ['Total Source', d.total_source, false],
                    ['Parser Used', d.parser_used, false],
                    ['Risk', d.validation_risk, false],
                    ['Duration', `${d.duration_ms}ms`, false],
                  ].map(([lbl, val, mono]) => (
                    <div key={String(lbl)} className="flex justify-between px-4 py-2.5">
                      <span className="text-slate-500">{lbl}</span>
                      <span className={`font-medium text-slate-800 ${mono ? 'font-mono' : ''}`}>{val}</span>
                    </div>
                  ))}
                </div>
                {d.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-amber-500" /><span className="text-sm font-semibold text-amber-700">Warnings</span></div>
                    <ul className="space-y-1">{d.warnings.map((w, i) => <li key={i} className="text-xs text-amber-800">{w}</li>)}</ul>
                  </div>
                )}
                <button onClick={() => setShowReasons(v => !v)} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 w-full text-left py-1">
                  {showReasons ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Classifier Reasons ({d.classifier_reasons.length})
                </button>
                {showReasons && <ul className="space-y-1 pl-3 border-l-2 border-slate-200">{d.classifier_reasons.map((r, i) => <li key={i} className="text-xs text-slate-600">{r}</li>)}</ul>}
                <button onClick={() => setShowSignals(v => !v)} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 w-full text-left py-1">
                  {showSignals ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  Detection Signals
                </button>
                {showSignals && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 grid grid-cols-2 gap-x-6 gap-y-1">
                    {Object.entries(d.signals).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs py-0.5 border-b border-slate-100">
                        <span className="text-slate-500 font-mono">{k}</span>
                        <span className={`font-semibold ${v === true ? 'text-green-600' : v === false ? 'text-slate-400' : 'text-slate-700'}`}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
            <TrendingUp className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Upload a file and run validation to see results</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 2 — Batch / Golden Dataset
// ---------------------------------------------------------------------------

function BatchTab({ organisationId, onHistoryChange }: { organisationId: string | null; onHistoryChange: () => void }) {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [runProgress, setRunProgress] = useState<BatchRunProgress[] | null>(null);
  const [batchResult, setBatchResult] = useState<any>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [bulkQueue, setBulkQueue] = useState<BulkQueueItem[]>([]);
  const [saving, setSaving] = useState(false);
  const bulkDropRef = useRef<HTMLInputElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);

  // Single add form state
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addLabel, setAddLabel] = useState('');
  const [addFamily, setAddFamily] = useState<CommercialFamily>('');
  const [addTrade, setAddTrade] = useState<TradeModule>('');
  const [addTotal, setAddTotal] = useState('');
  const [addOptTotal, setAddOptTotal] = useState('');
  const [addItemMin, setAddItemMin] = useState('');
  const [addItemMax, setAddItemMax] = useState('');
  const [addHasOptional, setAddHasOptional] = useState('');
  const [addNotes, setAddNotes] = useState('');

  const loadBenchmarks = useCallback(async () => {
    if (!organisationId) return;
    setLoading(true);
    const { data } = await supabase.from('parser_golden_benchmarks').select('*').eq('organisation_id', organisationId).order('created_at', { ascending: false });
    setBenchmarks((data ?? []) as Benchmark[]);
    setLoading(false);
  }, [organisationId]);

  useEffect(() => { loadBenchmarks(); }, [loadBenchmarks]);

  const handleBulkDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => /\.(pdf|xlsx|xls|csv)$/i.test(f.name));
    appendToBulkQueue(files);
  };

  const appendToBulkQueue = (files: File[]) => {
    const newItems: BulkQueueItem[] = files.map(f => ({
      file: f,
      label: f.name.replace(/\.(pdf|xlsx|xls|csv)$/i, ''),
      family: suggestFamilyFromFile(f),
      suggestedFamily: suggestFamilyFromFile(f),
      trade: '',
      total: '',
      optTotal: '',
      hasOptional: '',
    }));
    setBulkQueue(prev => [...prev, ...newItems]);
  };

  const updateQueueItem = (idx: number, patch: Partial<BulkQueueItem>) => {
    setBulkQueue(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };

  const removeQueueItem = (idx: number) => {
    setBulkQueue(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveBulk = async () => {
    if (!organisationId || bulkQueue.length === 0) return;
    const invalid = bulkQueue.filter(q => !q.family || !q.total);
    if (invalid.length > 0) { alert(`${invalid.length} item(s) missing required fields (Type, Total)`); return; }
    setSaving(true);
    try {
      for (const item of bulkQueue) {
        const ext = item.file.name.split('.').pop()?.toLowerCase() ?? '';
        const storagePath = `${organisationId}/${Date.now()}_${item.file.name}`;
        const { error: upErr } = await supabase.storage.from('parser-benchmarks').upload(storagePath, item.file);
        if (upErr) throw new Error(`Upload failed for ${item.file.name}: ${upErr.message}`);
        await supabase.from('parser_golden_benchmarks').insert({
          organisation_id: organisationId,
          label: item.label || item.file.name,
          filename: item.file.name,
          storage_path: storagePath,
          expected_family: item.family,
          trade: item.trade || null,
          expected_total: parseFloat(item.total.replace(/[$,]/g, '')) || 0,
          expected_optional_total: parseFloat(item.optTotal.replace(/[$,]/g, '')) || 0,
          expected_item_count_min: null,
          expected_item_count_max: null,
          expected_has_optional: item.hasOptional === '' ? null : item.hasOptional === 'true',
        });
        void ext;
      }
      setBulkQueue([]);
      setShowAddForm(false);
      loadBenchmarks();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadSingle = async () => {
    if (!addFile || !organisationId || !addFamily) return;
    setSaving(true);
    try {
      const storagePath = `${organisationId}/${Date.now()}_${addFile.name}`;
      const { error: upErr } = await supabase.storage.from('parser-benchmarks').upload(storagePath, addFile);
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      await supabase.from('parser_golden_benchmarks').insert({
        organisation_id: organisationId,
        label: addLabel || addFile.name,
        filename: addFile.name,
        storage_path: storagePath,
        expected_family: addFamily,
        trade: addTrade || null,
        expected_total: parseFloat(addTotal.replace(/[$,]/g, '')) || 0,
        expected_optional_total: parseFloat(addOptTotal.replace(/[$,]/g, '')) || 0,
        expected_item_count_min: addItemMin ? parseInt(addItemMin) : null,
        expected_item_count_max: addItemMax ? parseInt(addItemMax) : null,
        expected_has_optional: addHasOptional === '' ? null : addHasOptional === 'true',
        notes: addNotes,
      });
      setShowAddForm(false);
      setAddFile(null); setAddLabel(''); setAddFamily(''); setAddTrade(''); setAddTotal('');
      setAddOptTotal(''); setAddItemMin(''); setAddItemMax(''); setAddHasOptional(''); setAddNotes('');
      loadBenchmarks();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, storagePath: string) => {
    await supabase.storage.from('parser-benchmarks').remove([storagePath]);
    await supabase.from('parser_golden_benchmarks').delete().eq('id', id);
    loadBenchmarks();
  };

  const handleRunBatch = async () => {
    if (!organisationId || benchmarks.length === 0) return;
    setBatchResult(null);

    const initialProgress: BatchRunProgress[] = benchmarks.map(bm => ({
      label: bm.label || bm.filename,
      filename: bm.filename,
      status: 'pending',
    }));
    setRunProgress(initialProgress);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      setRunProgress(prev => prev!.map(p => ({ ...p, status: 'running' as const })));

      const form = new FormData();
      form.append('mode', 'batch');
      form.append('organisationId', organisationId);

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate_parser`,
        { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Batch failed');

      const results: any[] = json.results ?? [];
      setRunProgress(prev => prev!.map((p, i) => {
        const r = results[i];
        if (!r) return { ...p, status: 'error' as const };
        return {
          ...p,
          status: r.pass ? 'pass' : 'fail',
          error_category: r.error_category,
          variance_pct: r.variance_pct,
        };
      }));

      setBatchResult(json);
      onHistoryChange();
    } catch (err: any) {
      alert(err.message);
      setRunProgress(null);
    }
  };

  const sc = batchResult?.scorecard;
  const batchResults: any[] = batchResult?.results ?? [];
  const failedResults = [...batchResults].filter(r => !r.pass).sort((a, b) => (b.variance_pct ?? 0) - (a.variance_pct ?? 0));

  return (
    <div className="space-y-6">
      {/* Benchmark registry */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Golden Benchmarks</span>
            <span className="text-xs text-slate-400">({benchmarks.length} registered)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowAddForm(v => !v); setBulkQueue([]); }}
              className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white hover:bg-slate-50 transition-colors text-slate-600">
              <Plus className="w-3.5 h-3.5" />Add Benchmarks
            </button>
            <button onClick={handleRunBatch} disabled={!!runProgress && batchResult === null || benchmarks.length === 0}
              className="flex items-center gap-1.5 text-sm bg-slate-900 text-white rounded-lg px-3 py-1.5 hover:bg-slate-700 disabled:opacity-40 transition-colors">
              {runProgress && !batchResult ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Running...</> : <><FlaskConical className="w-3.5 h-3.5" />Run All</>}
            </button>
          </div>
        </div>

        {/* Add form — bulk drop area + queue table */}
        {showAddForm && (
          <div className="border-b border-slate-200 bg-slate-50 p-4 space-y-4">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Add Benchmark Files</div>

            {/* Bulk drop zone */}
            <div
              onDrop={handleBulkDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => bulkDropRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-slate-500 hover:bg-white transition-colors"
            >
              <Upload className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Drop multiple files here (PDF, XLSX, CSV)</p>
              <p className="text-xs text-slate-400 mt-1">or click to browse — family auto-suggested from filename</p>
              <input ref={bulkDropRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv" multiple
                onChange={e => { if (e.target.files) appendToBulkQueue(Array.from(e.target.files)); }} />
            </div>

            {/* Bulk queue table */}
            {bulkQueue.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-600">{bulkQueue.length} file(s) queued</div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-slate-100 border-b border-slate-200">
                      {['File', 'Label', 'Trade', 'Family *', 'Expected Total *', 'Has Opt?', ''].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-slate-600">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {bulkQueue.map((item, idx) => (
                        <tr key={idx} className="border-b border-slate-100 bg-white">
                          <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate">{item.file.name}</td>
                          <td className="px-3 py-2">
                            <input value={item.label} onChange={e => updateQueueItem(idx, { label: e.target.value })}
                              className="w-32 border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </td>
                          <td className="px-3 py-2">
                            <select value={item.trade} onChange={e => updateQueueItem(idx, { trade: e.target.value as TradeModule })}
                              className="w-28 border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="">—</option>
                              {TRADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select value={item.family} onChange={e => updateQueueItem(idx, { family: e.target.value as CommercialFamily })}
                              className={`w-32 border rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${!item.family ? 'border-red-300' : 'border-slate-200'}`}>
                              <option value="">Select...</option>
                              {FAMILY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            {item.suggestedFamily && item.suggestedFamily === item.family && (
                              <span className="text-teal-600 text-xs ml-1">auto</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input value={item.total} onChange={e => updateQueueItem(idx, { total: e.target.value })}
                              placeholder="0.00" className={`w-28 border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 ${!item.total ? 'border-red-300' : 'border-slate-200'}`} />
                          </td>
                          <td className="px-3 py-2">
                            <select value={item.hasOptional} onChange={e => updateQueueItem(idx, { hasOptional: e.target.value })}
                              className="w-16 border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                              <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => removeQueueItem(idx)} className="text-slate-400 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveBulk} disabled={saving}
                    className="flex items-center gap-1.5 text-sm bg-slate-900 text-white rounded-lg px-4 py-2 hover:bg-slate-700 disabled:opacity-40 transition-colors">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Save {bulkQueue.length} file{bulkQueue.length !== 1 ? 's' : ''}
                  </button>
                  <button onClick={() => setBulkQueue([])} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2">Clear</button>
                </div>
              </div>
            )}

            {/* Single-file quick form (collapsed by default, shown when no bulk files) */}
            {bulkQueue.length === 0 && (
              <div className="space-y-3">
                <div className="text-xs text-slate-500">Or register a single file:</div>
                <div
                  onClick={() => addFileRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-slate-400 transition-colors">
                  {addFile ? (
                    <div>
                      <span className="text-sm font-medium text-slate-700">{addFile.name}</span>
                      {suggestFamilyFromFile(addFile) && <p className="text-xs text-teal-600 mt-0.5">Suggested: {suggestFamilyFromFile(addFile).replace(/_quote$/, '').replace(/_/g, ' ')}</p>}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500">Click to select file</span>
                  )}
                  <input ref={addFileRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setAddFile(f);
                        if (!addLabel) setAddLabel(f.name.replace(/\.(pdf|xlsx|xls|csv)$/i, ''));
                        const s = suggestFamilyFromFile(f);
                        if (s && !addFamily) setAddFamily(s);
                      }
                    }} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-3">
                    <label className="block text-xs text-slate-600 mb-1">Label</label>
                    <input value={addLabel} onChange={e => setAddLabel(e.target.value)} placeholder="e.g. Trafalgar passive fire Q1"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Trade</label>
                    <select value={addTrade} onChange={e => setAddTrade(e.target.value as TradeModule)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">—</option>
                      {TRADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Expected Type *</label>
                    <select value={addFamily} onChange={e => setAddFamily(e.target.value as CommercialFamily)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select...</option>
                      {FAMILY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Expected Total *</label>
                    <input value={addTotal} onChange={e => setAddTotal(e.target.value)} placeholder="485000.00"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Optional Total</label>
                    <input value={addOptTotal} onChange={e => setAddOptTotal(e.target.value)} placeholder="0"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Has Optional?</label>
                    <select value={addHasOptional} onChange={e => setAddHasOptional(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Item Min</label>
                    <input value={addItemMin} onChange={e => setAddItemMin(e.target.value)} placeholder="—"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Item Max</label>
                    <input value={addItemMax} onChange={e => setAddItemMax(e.target.value)} placeholder="—"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-xs text-slate-600 mb-1">Notes</label>
                    <input value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="Optional notes"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleUploadSingle} disabled={!addFile || !addFamily || saving}
                    className="flex items-center gap-1.5 text-sm bg-slate-900 text-white rounded-lg px-4 py-2 hover:bg-slate-700 disabled:opacity-40 transition-colors">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Save
                  </button>
                  <button onClick={() => setShowAddForm(false)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Benchmark list */}
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /></div>
        ) : benchmarks.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">No benchmarks registered. Click "Add Benchmarks" to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                {['Label', 'Trade', 'Family', 'Expected Total', 'Optional', 'Has Opt?', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {benchmarks.map(bm => (
                  <tr key={bm.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-700 max-w-[160px] truncate">{bm.label || bm.filename}</td>
                    <td className="px-3 py-2"><TradeTag trade={bm.trade} /></td>
                    <td className="px-3 py-2"><FamilyTag family={bm.expected_family} /></td>
                    <td className="px-3 py-2 font-mono text-slate-600">{fmt(bm.expected_total)}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{bm.expected_optional_total > 0 ? fmt(bm.expected_optional_total) : '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{bm.expected_has_optional === null ? '—' : bm.expected_has_optional ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => handleDelete(bm.id, bm.storage_path)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Batch run progress */}
      {runProgress && (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <Loader2 className={`w-4 h-4 ${batchResult ? 'text-green-500' : 'animate-spin text-slate-400'}`} />
            <span className="text-sm font-semibold text-slate-700">
              {batchResult ? `Run complete — ${runProgress.filter(p => p.status === 'pass').length}/${runProgress.length} passed` : 'Running benchmarks...'}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {runProgress.map((p, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <div className="shrink-0">
                  {p.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-slate-200" />}
                  {p.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                  {p.status === 'pass' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {p.status === 'fail' && <XCircle className="w-4 h-4 text-red-500" />}
                  {p.status === 'error' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                </div>
                <span className="text-sm text-slate-700 flex-1 truncate">{p.label}</span>
                {p.status === 'fail' && p.error_category && <ErrorTag cat={p.error_category} />}
                {p.status === 'fail' && p.variance_pct != null && (
                  <span className="text-xs font-mono text-red-600">{pct(p.variance_pct)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch scorecard */}
      {sc && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Overall Accuracy" value={sc.overall_accuracy != null ? `${sc.overall_accuracy}%` : null} sub={`${sc.total_pass}/${sc.total_runs} passed`} color={sc.overall_accuracy >= 90 ? 'text-green-600' : sc.overall_accuracy >= 70 ? 'text-amber-600' : 'text-red-600'} />
            <KpiCard label="Avg Variance" value={`${sc.avg_variance_pct}%`} />
            <KpiCard label="Optional Accuracy" value={sc.optional_separation_accuracy != null ? `${sc.optional_separation_accuracy}%` : null} />
            <KpiCard label="Benchmarks Run" value={String(sc.total_runs)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Family accuracy */}
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-500" /><span className="text-sm font-semibold text-slate-700">Accuracy by Parser Family</span>
              </div>
              {FAMILIES.map(fam => {
                const fa = sc.family_accuracy?.[fam];
                const rate = fa?.pct;
                const barColor = rate == null ? 'bg-slate-200' : rate === 100 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-400' : 'bg-red-400';
                return (
                  <div key={fam} className="px-4 py-3 flex items-center gap-3 border-b border-slate-100 last:border-0">
                    <div className="w-28 shrink-0"><FamilyTag family={fam} /></div>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${rate ?? 0}%` }} />
                    </div>
                    <div className="w-20 text-right text-xs font-semibold text-slate-700">
                      {rate != null ? `${fa.pass}/${fa.total} (${rate}%)` : 'No runs'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Trade accuracy */}
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <Tag className="w-4 h-4 text-slate-500" /><span className="text-sm font-semibold text-slate-700">Accuracy by Trade Module</span>
              </div>
              {TRADES.map(tr => {
                const ta = sc.trade_accuracy?.[tr];
                const rate = ta?.pct;
                const hasData = ta && ta.total > 0;
                const barColor = rate == null ? 'bg-slate-200' : rate === 100 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-400' : 'bg-red-400';
                return (
                  <div key={tr} className="px-4 py-3 flex items-center gap-3 border-b border-slate-100 last:border-0">
                    <div className="w-28 shrink-0"><TradeTag trade={tr} /></div>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${hasData ? (rate ?? 0) : 0}%` }} />
                    </div>
                    <div className="w-20 text-right text-xs font-semibold text-slate-700">
                      {hasData ? `${ta.pass}/${ta.total} (${rate}%)` : <span className="text-slate-400 font-normal">No runs</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Failures sorted by variance desc */}
          {failedResults.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-semibold text-slate-700">Failures — sorted by variance</span>
                </div>
                <button onClick={() => {
                  const csv = ['filename,expected_family,detected_family,expected_total,parsed_total,variance_pct,error_category',
                    ...failedResults.map(r => `"${r.filename}",${r.expected_family},${r.commercial_family},${r.expected_total},${r.parsed_total},${r.variance_pct ?? ''},${r.error_category ?? ''}`)
                  ].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = 'batch_failures.csv'; a.click();
                  URL.revokeObjectURL(url);
                }} className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white hover:bg-slate-50 transition-colors">
                  <Download className="w-3 h-3" />Export CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
                    {['File', 'Expected', 'Detected', 'Expected Total', 'Parsed Total', 'Var%', 'Error'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {failedResults.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-red-50">
                        <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate">{r.filename}</td>
                        <td className="px-3 py-2"><FamilyTag family={r.expected_family} /></td>
                        <td className="px-3 py-2"><FamilyTag family={r.commercial_family} /></td>
                        <td className="px-3 py-2 font-mono text-slate-600">{fmt(r.expected_total)}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{fmt(r.parsed_total)}</td>
                        <td className="px-3 py-2 font-mono text-red-600 font-semibold">{pct(r.variance_pct)}</td>
                        <td className="px-3 py-2"><ErrorTag cat={r.error_category} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top failure causes */}
          {sc.top_failure_causes?.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                <span className="text-sm font-semibold text-slate-700">Top Failure Causes</span>
              </div>
              <div className="divide-y divide-slate-100">
                {sc.top_failure_causes.map((f: { category: string; count: number }) => (
                  <div key={f.category} className="px-4 py-3 flex items-center justify-between">
                    <ErrorTag cat={f.category as ErrorCategory} />
                    <span className="text-sm font-semibold text-slate-700">{f.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 3 — Scorecard
// ---------------------------------------------------------------------------

function ScorecardTab({ history }: { history: HistoryRun[] }) {
  const overallPass = history.filter(r => r.pass).length;
  const overallTotal = history.length;
  const overallPct = overallTotal > 0 ? Math.round((overallPass / overallTotal) * 100) : null;

  const avgVariance = (() => {
    const withVar = history.filter(r => r.variance_pct !== null);
    if (!withVar.length) return null;
    return (withVar.reduce((s, r) => s + (r.variance_pct ?? 0), 0) / withVar.length).toFixed(2);
  })();

  const optionalRuns = history.filter(r => r.expected_family !== '' && r.detected_family !== '');
  const familyMatchPass = optionalRuns.filter(r => r.expected_family === r.detected_family).length;
  const familyMatchPct = optionalRuns.length > 0 ? Math.round((familyMatchPass / optionalRuns.length) * 100) : null;

  const regressionFails = history.filter(r => r.run_mode === 'batch' && !r.pass).length;

  const errorCounts: Record<string, number> = {};
  for (const r of history) {
    if (r.error_category) errorCounts[r.error_category] = (errorCounts[r.error_category] ?? 0) + 1;
  }
  const topErrors = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxErrCount = topErrors[0]?.[1] ?? 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Overall Accuracy" value={overallPct != null ? `${overallPct}%` : null}
          sub={`${overallPass}/${overallTotal} runs`}
          color={overallPct == null ? undefined : overallPct >= 90 ? 'text-green-600' : overallPct >= 70 ? 'text-amber-600' : 'text-red-600'} />
        <KpiCard label="Family Detection" value={familyMatchPct != null ? `${familyMatchPct}%` : null}
          color={familyMatchPct == null ? undefined : familyMatchPct >= 90 ? 'text-green-600' : familyMatchPct >= 70 ? 'text-amber-600' : 'text-red-600'} />
        <KpiCard label="Avg Variance" value={avgVariance != null ? `${avgVariance}%` : null} />
        <KpiCard label="Regression Failures" value={String(regressionFails)} color={regressionFails > 0 ? 'text-red-600' : 'text-green-600'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Parser family accuracy */}
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" /><span className="text-sm font-semibold text-slate-700">Accuracy by Parser Family</span>
          </div>
          {FAMILIES.map(fam => {
            const runs = history.filter(r => r.expected_family === fam);
            const passed = runs.filter(r => r.pass).length;
            const rate = runs.length > 0 ? Math.round((passed / runs.length) * 100) : null;
            const barColor = rate == null ? 'bg-slate-200' : rate === 100 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-400' : 'bg-red-400';
            return (
              <div key={fam} className="px-4 py-3 flex items-center gap-3 border-b border-slate-100 last:border-0">
                <div className="w-28 shrink-0"><FamilyTag family={fam} /></div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${rate ?? 0}%` }} />
                </div>
                <div className="w-24 text-right text-xs">
                  {rate != null ? <span className="font-semibold text-slate-700">{passed}/{runs.length} ({rate}%)</span> : <span className="text-slate-400">No runs</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Trade accuracy */}
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-500" /><span className="text-sm font-semibold text-slate-700">Accuracy by Trade Module</span>
          </div>
          {TRADES.map(tr => {
            const runs = history.filter(r => r.trade === tr);
            const passed = runs.filter(r => r.pass).length;
            const rate = runs.length > 0 ? Math.round((passed / runs.length) * 100) : null;
            const barColor = rate == null ? 'bg-slate-200' : rate === 100 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-400' : 'bg-red-400';
            return (
              <div key={tr} className="px-4 py-3 flex items-center gap-3 border-b border-slate-100 last:border-0">
                <div className="w-28 shrink-0"><TradeTag trade={tr} /></div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${rate ?? 0}%` }} />
                </div>
                <div className="w-24 text-right text-xs">
                  {rate != null ? <span className="font-semibold text-slate-700">{passed}/{runs.length} ({rate}%)</span> : <span className="text-slate-400">No runs</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error breakdown */}
      {topErrors.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-500" /><span className="text-sm font-semibold text-slate-700">Error Category Breakdown</span>
          </div>
          <div className="p-4 space-y-3">
            {topErrors.map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-3">
                <div className="w-44 shrink-0"><ErrorTag cat={cat as ErrorCategory} /></div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.round((count / maxErrCount) * 100)}%` }} />
                </div>
                <div className="w-8 text-right text-sm font-semibold text-slate-700">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length === 0 && (
        <div className="rounded-xl border border-slate-200 p-10 text-center bg-white">
          <BarChart3 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No validation runs yet. Run tests in the Single Test or Batch tabs.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 4 — Shadow
// ---------------------------------------------------------------------------

function ShadowTab() {
  const [quoteId, setQuoteId] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!quoteId.trim()) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate_parser`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'shadow', quoteId: quoteId.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Shadow run failed');
      setResult(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const diff: ShadowDiff = result?.diff ?? {};
  const changedKeys = Object.keys(diff).filter(k => diff[k].changed);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">Shadow Comparison</span>
        </div>
        <p className="text-xs text-slate-500">Enter a Quote ID to re-run the parser silently against the existing production result. No customer-facing data is changed.</p>
        <div className="flex gap-2">
          <input value={quoteId} onChange={e => setQuoteId(e.target.value)}
            placeholder="Quote UUID"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={handleRun} disabled={!quoteId.trim() || running}
            className="flex items-center gap-1.5 text-sm bg-slate-900 text-white rounded-lg px-4 py-2 hover:bg-slate-700 disabled:opacity-40 transition-colors">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompare className="w-4 h-4" />}
            Compare
          </button>
        </div>
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      </div>

      {result && (
        <>
          <div className={`rounded-xl px-4 py-3 flex items-center gap-3 ${changedKeys.length === 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
            {changedKeys.length === 0 ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
            <div>
              <div className="text-sm font-semibold text-slate-800">
                {changedKeys.length === 0 ? 'No differences — candidate matches production' : `${changedKeys.length} field(s) differ`}
              </div>
              <div className="text-xs text-slate-500">Total delta: {fmt(result.summary?.total_delta ?? 0)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-700">Field Comparison</span>
            </div>
            <div className="divide-y divide-slate-100 text-sm">
              <div className="grid grid-cols-3 gap-4 px-4 py-2 bg-slate-50">
                {['Field', 'Current (Production)', 'Candidate (Re-run)'].map(h => (
                  <div key={h} className="text-xs font-medium text-slate-500">{h}</div>
                ))}
              </div>
              {Object.entries(diff).map(([key, { current, candidate, changed }]) => (
                <div key={key} className={`grid grid-cols-3 gap-4 px-4 py-2.5 items-center ${changed ? 'bg-amber-50' : ''}`}>
                  <span className="text-slate-600 font-mono text-xs">{key}</span>
                  <span className="text-slate-700 font-mono text-xs">{String(current ?? '—')}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`font-mono text-xs ${changed ? 'font-semibold text-amber-700' : 'text-slate-700'}`}>{String(candidate ?? '—')}</span>
                    {changed && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run history table — sortable, filterable, exportable
// ---------------------------------------------------------------------------

type SortCol = 'run_at' | 'variance_pct' | 'parsed_total' | 'pass';
type SortDir = 'asc' | 'desc';

function HistoryTable({ history, loading }: { history: HistoryRun[]; loading: boolean }) {
  const [sortCol, setSortCol] = useState<SortCol>('run_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterFamily, setFilterFamily] = useState('');
  const [filterTrade, setFilterTrade] = useState('');

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-slate-600" /> : <ArrowDown className="w-3 h-3 text-slate-600" />;
  };

  const filtered = history
    .filter(r => !filterFamily || r.expected_family === filterFamily || r.detected_family === filterFamily)
    .filter(r => !filterTrade || r.trade === filterTrade);

  const sorted = [...filtered].sort((a, b) => {
    let av: any, bv: any;
    if (sortCol === 'run_at') { av = a.run_at; bv = b.run_at; }
    else if (sortCol === 'variance_pct') { av = a.variance_pct ?? -Infinity; bv = b.variance_pct ?? -Infinity; }
    else if (sortCol === 'parsed_total') { av = a.parsed_total; bv = b.parsed_total; }
    else { av = a.pass ? 1 : 0; bv = b.pass ? 1 : 0; }
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Run History</span>
            {history.length > 0 && <span className="text-xs text-slate-400">({sorted.length}/{history.length})</span>}
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            {sorted.length > 0 && (
              <button onClick={() => exportHistoryCSV(sorted)}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white hover:bg-slate-50 transition-colors">
                <Download className="w-3 h-3" />Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <FilterPills
            label="Family"
            icon={<Filter className="w-3 h-3" />}
            options={FAMILY_OPTIONS.map(o => ({ value: o.value, label: o.label.replace(' Quote', '') }))}
            value={filterFamily}
            onChange={setFilterFamily}
          />
          <FilterPills
            label="Trade"
            icon={<Tag className="w-3 h-3" />}
            options={TRADE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
            value={filterTrade}
            onChange={setFilterTrade}
          />
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">
          {history.length === 0 ? 'No runs yet.' : 'No runs match the current filters.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="px-3 py-2 text-left font-medium">File</th>
                <th className="px-3 py-2 text-left font-medium">Mode</th>
                <th className="px-3 py-2 text-left font-medium">Trade</th>
                <th className="px-3 py-2 text-left font-medium">Expected</th>
                <th className="px-3 py-2 text-left font-medium">Detected</th>
                <th className="px-3 py-2 text-left font-medium">
                  <button onClick={() => handleSort('parsed_total')} className="flex items-center gap-1 hover:text-slate-800">
                    Total <SortIcon col="parsed_total" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <button onClick={() => handleSort('variance_pct')} className="flex items-center gap-1 hover:text-slate-800">
                    Var% <SortIcon col="variance_pct" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium">
                  <button onClick={() => handleSort('pass')} className="flex items-center gap-1 hover:text-slate-800">
                    Pass <SortIcon col="pass" />
                  </button>
                </th>
                <th className="px-3 py-2 text-left font-medium">Error Category</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(run => (
                <tr key={run.id} className={`border-b border-slate-100 hover:bg-slate-50 ${run.pass === false ? 'bg-red-50/30' : ''}`}>
                  <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate">{run.filename}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{run.run_mode}</span>
                  </td>
                  <td className="px-3 py-2"><TradeTag trade={run.trade} /></td>
                  <td className="px-3 py-2"><FamilyTag family={run.expected_family} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <FamilyTag family={run.detected_family} />
                      {run.expected_family && <PassBadge pass={run.expected_family === run.detected_family} />}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-700">{fmt(run.parsed_total)}</td>
                  <td className={`px-3 py-2 font-mono font-semibold ${run.variance_pct != null && run.variance_pct > 1 ? 'text-red-600' : 'text-slate-500'}`}>{pct(run.variance_pct)}</td>
                  <td className="px-3 py-2 text-center"><PassBadge pass={run.pass} /></td>
                  <td className="px-3 py-2"><ErrorTag cat={run.error_category} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Tab = 'single' | 'batch' | 'scorecard' | 'shadow';

export default function ParserTest() {
  const [tab, setTab] = useState<Tab>('batch');
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('parser_validation_runs')
        .select('id,run_at,filename,expected_family,detected_family,expected_total,parsed_total,variance_pct,pass,validation_risk,confidence,item_count,total_source,error_category,run_mode,trade')
        .order('run_at', { ascending: false })
        .limit(200);
      setHistory((data ?? []) as HistoryRun[]);
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase.from('organisation_members').select('organisation_id').eq('user_id', session.user.id).eq('status', 'active').limit(1).maybeSingle()
          .then(({ data }) => { if (data?.organisation_id) setOrganisationId(data.organisation_id); });
      }
    });
  }, [loadHistory]);

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'single', label: 'Single Test', icon: <FlaskConical className="w-4 h-4" /> },
    { key: 'batch', label: 'Golden Dataset', icon: <Database className="w-4 h-4" /> },
    { key: 'scorecard', label: 'Scorecard', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'shadow', label: 'Shadow', icon: <GitCompare className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Bug className="w-6 h-6 text-slate-500" />Parser QA — Phase 4 Benchmark Testing
            </h1>
            <p className="text-sm text-slate-500 mt-1">Commercial baseline across all 5 parser families · 6 trade modules</p>
          </div>
          <button onClick={loadHistory}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 bg-white hover:bg-slate-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
        </div>

        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === 'single' && <SingleTestTab history={history} onHistoryChange={loadHistory} />}
        {tab === 'batch' && <BatchTab organisationId={organisationId} onHistoryChange={loadHistory} />}
        {tab === 'scorecard' && <ScorecardTab history={history} />}
        {tab === 'shadow' && <ShadowTab />}

        {tab !== 'shadow' && <HistoryTable history={history} loading={historyLoading} />}

      </div>
    </div>
  );
}
