import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Play, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, BarChart3, FileText, Bug, RefreshCw, Target, TrendingUp, List,
  Database, GitCompare, Plus, Trash2, FlaskConical, Tag,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommercialFamily =
  | 'itemized_quote' | 'lump_sum_quote' | 'hybrid_quote'
  | 'spreadsheet_quote' | 'scanned_ocr_quote' | 'unknown_quote' | '';

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

const FAMILIES = ['itemized_quote', 'lump_sum_quote', 'hybrid_quote', 'spreadsheet_quote', 'scanned_ocr_quote'];

const FAMILY_COLORS: Record<string, string> = {
  itemized_quote: 'bg-blue-100 text-blue-800',
  lump_sum_quote: 'bg-amber-100 text-amber-800',
  hybrid_quote: 'bg-teal-100 text-teal-800',
  spreadsheet_quote: 'bg-green-100 text-green-800',
  scanned_ocr_quote: 'bg-slate-100 text-slate-700',
  unknown_quote: 'bg-red-100 text-red-700',
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

const RISK_COLORS: Record<string, string> = {
  OK: 'text-green-600', MEDIUM: 'text-amber-600', HIGH: 'text-red-600', UNKNOWN: 'text-slate-400',
};

const fmt = (n: number) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
const pct = (n: number | null) => n === null ? '—' : n.toFixed(2) + '%';

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
      {family || '—'}
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setResult(null); setError(null); }
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
      {/* LEFT */}
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
              </div>
            ) : (
              <div>
                <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Drop a PDF, XLSX, or CSV here</p>
                <p className="text-xs text-slate-400 mt-1">or click to browse</p>
              </div>
            )}
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); setError(null); } }} />
          </div>

          {/* Ground truth inputs */}
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

      {/* RIGHT — Results */}
      <div className="space-y-4">
        {d ? (
          <>
            {/* Banner */}
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

            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              {([['comparison', 'Comparison', <Target className="w-3.5 h-3.5" />], ['diagnostics', 'Diagnostics', <BarChart3 className="w-3.5 h-3.5" />]] as const).map(([key, label, icon]) => (
                <button key={key} onClick={() => setActiveTab(key as any)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {icon}{label}
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

function BatchTab({ organisationId }: { organisationId: string | null }) {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addLabel, setAddLabel] = useState('');
  const [addFamily, setAddFamily] = useState<CommercialFamily>('');
  const [addTotal, setAddTotal] = useState('');
  const [addOptTotal, setAddOptTotal] = useState('');
  const [addItemMin, setAddItemMin] = useState('');
  const [addItemMax, setAddItemMax] = useState('');
  const [addHasOptional, setAddHasOptional] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const addFileRef = useRef<HTMLInputElement>(null);

  const loadBenchmarks = useCallback(async () => {
    if (!organisationId) return;
    setLoading(true);
    const { data } = await supabase.from('parser_golden_benchmarks').select('*').eq('organisation_id', organisationId).order('created_at', { ascending: false });
    setBenchmarks((data ?? []) as Benchmark[]);
    setLoading(false);
  }, [organisationId]);

  useEffect(() => { loadBenchmarks(); }, [loadBenchmarks]);

  const handleUploadBenchmark = async () => {
    if (!addFile || !organisationId || !addFamily) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const ext = addFile.name.split('.').pop()?.toLowerCase() ?? '';
      const storagePath = `${organisationId}/${Date.now()}_${addFile.name}`;

      const { error: upErr } = await supabase.storage.from('parser-benchmarks').upload(storagePath, addFile);
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      await supabase.from('parser_golden_benchmarks').insert({
        organisation_id: organisationId,
        label: addLabel || addFile.name,
        filename: addFile.name,
        storage_path: storagePath,
        expected_family: addFamily,
        expected_total: parseFloat(addTotal.replace(/[$,]/g, '')) || 0,
        expected_optional_total: parseFloat(addOptTotal.replace(/[$,]/g, '')) || 0,
        expected_item_count_min: addItemMin ? parseInt(addItemMin) : null,
        expected_item_count_max: addItemMax ? parseInt(addItemMax) : null,
        expected_has_optional: addHasOptional === '' ? null : addHasOptional === 'true',
        notes: addNotes,
      });

      setShowAddForm(false);
      setAddFile(null); setAddLabel(''); setAddFamily(''); setAddTotal('');
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
    if (!organisationId) return;
    setRunning(true); setBatchResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const form = new FormData();
      form.append('mode', 'batch');
      form.append('organisationId', organisationId);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate_parser`,
        { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? 'Batch failed');
      setBatchResult(json);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRunning(false);
    }
  };

  const sc = batchResult?.scorecard;

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
            <button onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-1.5 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white hover:bg-slate-50 transition-colors text-slate-600">
              <Plus className="w-3.5 h-3.5" />Register
            </button>
            <button onClick={handleRunBatch} disabled={running || benchmarks.length === 0}
              className="flex items-center gap-1.5 text-sm bg-slate-900 text-white rounded-lg px-3 py-1.5 hover:bg-slate-700 disabled:opacity-40 transition-colors">
              {running ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Running...</> : <><FlaskConical className="w-3.5 h-3.5" />Run All</>}
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="border-b border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Register Benchmark</div>
            <div
              onClick={() => addFileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-slate-400 transition-colors">
              {addFile ? (
                <span className="text-sm font-medium text-slate-700">{addFile.name}</span>
              ) : (
                <span className="text-sm text-slate-500">Click to select benchmark file</span>
              )}
              <input ref={addFileRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) setAddFile(f); }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-600 mb-1">Label</label>
                <input value={addLabel} onChange={e => setAddLabel(e.target.value)} placeholder="e.g. Trafalgar passive fire Q1"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                <label className="block text-xs text-slate-600 mb-1">Item Count Min</label>
                <input value={addItemMin} onChange={e => setAddItemMin(e.target.value)} placeholder="—"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Item Count Max</label>
                <input value={addItemMax} onChange={e => setAddItemMax(e.target.value)} placeholder="—"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-600 mb-1">Notes</label>
                <input value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="Optional notes"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleUploadBenchmark} disabled={!addFile || !addFamily || saving}
                className="flex items-center gap-1.5 text-sm bg-slate-900 text-white rounded-lg px-4 py-2 hover:bg-slate-700 disabled:opacity-40 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Save
              </button>
              <button onClick={() => setShowAddForm(false)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" /></div>
        ) : benchmarks.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">No benchmarks registered. Click Register to add your first golden quote.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                {['Label', 'Type', 'Expected Total', 'Optional', 'Items', 'Has Opt?', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {benchmarks.map(bm => (
                  <tr key={bm.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-700 max-w-[160px] truncate">{bm.label || bm.filename}</td>
                    <td className="px-3 py-2"><FamilyTag family={bm.expected_family} /></td>
                    <td className="px-3 py-2 font-mono text-slate-600">{fmt(bm.expected_total)}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{bm.expected_optional_total > 0 ? fmt(bm.expected_optional_total) : '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{bm.expected_item_count_min != null ? `${bm.expected_item_count_min}–${bm.expected_item_count_max}` : '—'}</td>
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

      {/* Batch results */}
      {sc && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Overall Accuracy" value={sc.overall_accuracy != null ? `${sc.overall_accuracy}%` : null} sub={`${sc.total_pass}/${sc.total_runs} passed`} color={sc.overall_accuracy >= 90 ? 'text-green-600' : sc.overall_accuracy >= 70 ? 'text-amber-600' : 'text-red-600'} />
            <KpiCard label="Avg Variance" value={`${sc.avg_variance_pct}%`} />
            <KpiCard label="Optional Accuracy" value={sc.optional_separation_accuracy != null ? `${sc.optional_separation_accuracy}%` : null} />
            <KpiCard label="Benchmarks Run" value={String(sc.total_runs)} />
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-500" /><span className="text-sm font-semibold text-slate-700">Family Accuracy</span>
            </div>
            {FAMILIES.map(fam => {
              const fa = sc.family_accuracy?.[fam];
              const rate = fa?.pct;
              const barColor = rate == null ? 'bg-slate-200' : rate === 100 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-400' : 'bg-red-400';
              return (
                <div key={fam} className="px-4 py-3 flex items-center gap-4 border-b border-slate-100 last:border-0">
                  <div className="w-36 shrink-0"><FamilyTag family={fam} /></div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${rate ?? 0}%` }} />
                  </div>
                  <div className="w-20 text-right text-sm font-semibold text-slate-700">
                    {rate != null ? `${fa.pass}/${fa.total} (${rate}%)` : 'No runs'}
                  </div>
                </div>
              );
            })}
          </div>

          {sc.top_failure_causes?.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
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
  const families = FAMILIES;

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
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Overall Accuracy" value={overallPct != null ? `${overallPct}%` : null}
          sub={`${overallPass}/${overallTotal} runs`}
          color={overallPct == null ? undefined : overallPct >= 90 ? 'text-green-600' : overallPct >= 70 ? 'text-amber-600' : 'text-red-600'} />
        <KpiCard label="Family Detection" value={familyMatchPct != null ? `${familyMatchPct}%` : null}
          color={familyMatchPct == null ? undefined : familyMatchPct >= 90 ? 'text-green-600' : familyMatchPct >= 70 ? 'text-amber-600' : 'text-red-600'} />
        <KpiCard label="Avg Variance" value={avgVariance != null ? `${avgVariance}%` : null} />
        <KpiCard label="Regression Failures" value={String(regressionFails)} color={regressionFails > 0 ? 'text-red-600' : 'text-green-600'} />
      </div>

      {/* Family accuracy */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-500" /><span className="text-sm font-semibold text-slate-700">Accuracy by Family</span>
        </div>
        {families.map(fam => {
          const runs = history.filter(r => r.expected_family === fam);
          const passed = runs.filter(r => r.pass).length;
          const rate = runs.length > 0 ? Math.round((passed / runs.length) * 100) : null;
          const barColor = rate == null ? 'bg-slate-200' : rate === 100 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-400' : 'bg-red-400';
          return (
            <div key={fam} className="px-4 py-3 flex items-center gap-4 border-b border-slate-100 last:border-0">
              <div className="w-36 shrink-0"><FamilyTag family={fam} /></div>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${rate ?? 0}%` }} />
              </div>
              <div className="w-24 text-right text-sm">
                {rate != null ? <span className="font-semibold text-slate-700">{passed}/{runs.length} ({rate}%)</span> : <span className="text-slate-400 text-xs">No runs</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error category breakdown */}
      {topErrors.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
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
            {changedKeys.length === 0
              ? <CheckCircle2 className="w-5 h-5 text-green-500" />
              : <AlertTriangle className="w-5 h-5 text-amber-500" />}
            <div>
              <div className="text-sm font-semibold text-slate-800">
                {changedKeys.length === 0 ? 'No differences — candidate matches production' : `${changedKeys.length} field(s) differ`}
              </div>
              <div className="text-xs text-slate-500">Total delta: {fmt(result.summary?.total_delta ?? 0)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
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
// Run history table — shared
// ---------------------------------------------------------------------------

function HistoryTable({ history, loading }: { history: HistoryRun[]; loading: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">Run History</span>
          {history.length > 0 && <span className="text-xs text-slate-400">({history.length})</span>}
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>
      {history.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">No runs yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
              {['File', 'Mode', 'Expected', 'Detected', 'Total', 'Var%', 'Pass', 'Error Category'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {history.map(run => (
                <tr key={run.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate">{run.filename}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{run.run_mode}</span>
                  </td>
                  <td className="px-3 py-2"><FamilyTag family={run.expected_family} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <FamilyTag family={run.detected_family} />
                      {run.expected_family && <PassBadge pass={run.expected_family === run.detected_family} />}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-700">{fmt(run.parsed_total)}</td>
                  <td className="px-3 py-2 font-mono text-slate-500">{pct(run.variance_pct)}</td>
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
  const [tab, setTab] = useState<Tab>('single');
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('parser_validation_runs')
        .select('id,run_at,filename,expected_family,detected_family,expected_total,parsed_total,variance_pct,pass,validation_risk,confidence,item_count,total_source,error_category,run_mode')
        .order('run_at', { ascending: false })
        .limit(100);
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
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Bug className="w-6 h-6 text-slate-500" />Parser QA Framework
            </h1>
            <p className="text-sm text-slate-500 mt-1">Phase 3 — commercial validation across all 5 parser families</p>
          </div>
          <button onClick={loadHistory}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 bg-white hover:bg-slate-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === 'single' && <SingleTestTab history={history} onHistoryChange={loadHistory} />}
        {tab === 'batch' && <BatchTab organisationId={organisationId} />}
        {tab === 'scorecard' && <ScorecardTab history={history} />}
        {tab === 'shadow' && <ShadowTab />}

        {/* History always visible */}
        {tab !== 'shadow' && <HistoryTable history={history} loading={historyLoading} />}

      </div>
    </div>
  );
}
