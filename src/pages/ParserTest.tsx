import { useState, useRef, useCallback } from 'react';
import {
  Upload, Play, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, BarChart3, FileText, Bug, RefreshCw, Target, TrendingUp, List,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommercialFamily =
  | 'itemized_quote'
  | 'lump_sum_quote'
  | 'hybrid_quote'
  | 'spreadsheet_quote'
  | 'scanned_ocr_quote'
  | 'unknown_quote'
  | '';

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
  variance: number;
  variance_pct: number | null;
  pass: boolean | null;
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
}

const FAMILY_OPTIONS: { value: CommercialFamily; label: string }[] = [
  { value: 'itemized_quote', label: 'Itemized Quote' },
  { value: 'lump_sum_quote', label: 'Lump Sum Quote' },
  { value: 'hybrid_quote', label: 'Hybrid Quote' },
  { value: 'spreadsheet_quote', label: 'Spreadsheet Quote' },
  { value: 'scanned_ocr_quote', label: 'Scanned / OCR Quote' },
];

const FAMILY_COLORS: Record<string, string> = {
  itemized_quote: 'bg-blue-100 text-blue-800',
  lump_sum_quote: 'bg-amber-100 text-amber-800',
  hybrid_quote: 'bg-teal-100 text-teal-800',
  spreadsheet_quote: 'bg-green-100 text-green-800',
  scanned_ocr_quote: 'bg-slate-100 text-slate-700',
  unknown_quote: 'bg-red-100 text-red-700',
};

const RISK_COLORS: Record<string, string> = {
  OK: 'text-green-600',
  MEDIUM: 'text-amber-600',
  HIGH: 'text-red-600',
  UNKNOWN: 'text-slate-400',
};

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 });
}

function pct(n: number | null) {
  if (n === null) return '—';
  return n.toFixed(2) + '%';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ComparisonPanel({ d }: { d: Diagnostics }) {
  const passColor = d.pass === true ? 'text-green-600' : d.pass === false ? 'text-red-600' : 'text-slate-400';
  const passIcon = d.pass === true
    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
    : d.pass === false
    ? <XCircle className="w-5 h-5 text-red-500" />
    : <AlertTriangle className="w-5 h-5 text-slate-400" />;

  const familyMatch = d.expected_family === '' || d.commercial_family === d.expected_family;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <Target className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">Comparison</span>
      </div>
      <div className="divide-y divide-slate-100">
        <div className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
          <div className="text-slate-500 font-medium">Field</div>
          <div className="text-slate-500 font-medium">Expected</div>
          <div className="text-slate-500 font-medium">Detected</div>
        </div>

        <div className="grid grid-cols-3 gap-4 px-4 py-3 text-sm items-center">
          <div className="text-slate-600">Document Type</div>
          <div>
            {d.expected_family ? (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FAMILY_COLORS[d.expected_family] ?? 'bg-slate-100 text-slate-700'}`}>
                {d.expected_family}
              </span>
            ) : <span className="text-slate-400">—</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FAMILY_COLORS[d.commercial_family] ?? 'bg-slate-100 text-slate-700'}`}>
              {d.commercial_family}
            </span>
            {d.expected_family && (
              familyMatch
                ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 px-4 py-3 text-sm items-center">
          <div className="text-slate-600">Total</div>
          <div className="font-mono text-slate-800">{d.expected_total > 0 ? fmt(d.expected_total) : '—'}</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-800">{fmt(d.parsed_total)}</span>
            {passIcon}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 px-4 py-3 text-sm items-center">
          <div className="text-slate-600">Variance</div>
          <div />
          <div className={`font-mono font-semibold ${passColor}`}>
            {d.expected_total > 0 ? `${fmt(d.variance)} (${pct(d.variance_pct)})` : '—'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 px-4 py-3 text-sm items-center">
          <div className="text-slate-600">Raw Document Class</div>
          <div />
          <div className="text-slate-700 font-mono text-xs">{d.document_class}</div>
        </div>
      </div>
    </div>
  );
}

function DiagnosticsPanel({ d }: { d: Diagnostics }) {
  const [showSignals, setShowSignals] = useState(false);
  const [showReasons, setShowReasons] = useState(false);

  return (
    <div className="space-y-3">
      {/* Key metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Confidence', value: `${(d.confidence * 100).toFixed(0)}%` },
          { label: 'Items (base)', value: d.item_count_base.toString() },
          { label: 'Items (optional)', value: d.item_count_optional.toString() },
          { label: 'Items (excluded)', value: d.item_count_excluded.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">{label}</div>
            <div className="text-lg font-bold text-slate-800">{value}</div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
        {[
          { label: 'Grand Total (parsed)', value: fmt(d.parsed_total), mono: true },
          { label: 'Optional Total', value: d.optional_total > 0 ? fmt(d.optional_total) : '—', mono: true },
          { label: 'Row Sum', value: fmt(d.row_sum), mono: true },
          { label: 'Sub Total', value: d.sub_total != null ? fmt(d.sub_total) : '—', mono: true },
          { label: 'Total Source', value: d.total_source },
          { label: 'Parser Used', value: d.parser_used },
          { label: 'Validation Risk', value: d.validation_risk, color: RISK_COLORS[d.validation_risk] ?? '' },
          { label: 'Duration', value: `${d.duration_ms}ms` },
          { label: 'Summary Detected', value: d.summary_detected ? 'Yes' : 'No' },
          { label: 'Optional Scope', value: d.optional_scope_detected ? 'Yes' : 'No' },
        ].map(({ label, value, mono, color }) => (
          <div key={label} className="flex justify-between items-center px-4 py-2.5">
            <span className="text-slate-500">{label}</span>
            <span className={`font-medium ${mono ? 'font-mono' : ''} ${color ?? 'text-slate-800'}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {d.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-700">Warnings ({d.warnings.length})</span>
          </div>
          <ul className="space-y-1">
            {d.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-800">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Classifier reasons */}
      <div>
        <button
          onClick={() => setShowReasons(v => !v)}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 w-full text-left py-1"
        >
          {showReasons ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Classifier Reasons ({d.classifier_reasons.length})
        </button>
        {showReasons && (
          <ul className="mt-2 space-y-1 pl-3 border-l-2 border-slate-200">
            {d.classifier_reasons.map((r, i) => (
              <li key={i} className="text-xs text-slate-600">{r}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Signals */}
      <div>
        <button
          onClick={() => setShowSignals(v => !v)}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 w-full text-left py-1"
        >
          {showSignals ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Detection Signals
        </button>
        {showSignals && (
          <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {Object.entries(d.signals).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs py-0.5 border-b border-slate-100">
                  <span className="text-slate-500 font-mono">{k}</span>
                  <span className={`font-semibold ${v === true ? 'text-green-600' : v === false ? 'text-slate-400' : 'text-slate-700'}`}>
                    {String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ run }: { run: HistoryRun }) {
  const passIcon = run.pass === true
    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
    : run.pass === false
    ? <XCircle className="w-4 h-4 text-red-500" />
    : <span className="text-slate-400 text-xs">—</span>;

  const familyMatch = !run.expected_family || run.expected_family === run.detected_family;

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 text-sm">
      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{run.filename}</td>
      <td className="px-3 py-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FAMILY_COLORS[run.expected_family] ?? 'bg-slate-100 text-slate-600'}`}>
          {run.expected_family || '—'}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FAMILY_COLORS[run.detected_family] ?? 'bg-slate-100 text-slate-600'}`}>
            {run.detected_family}
          </span>
          {run.expected_family && (familyMatch
            ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            : <XCircle className="w-3.5 h-3.5 text-red-500" />)}
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-slate-700">{fmt(run.parsed_total)}</td>
      <td className="px-3 py-2 font-mono">{pct(run.variance_pct)}</td>
      <td className="px-3 py-2 text-center">{passIcon}</td>
      <td className="px-3 py-2">
        <span className={`text-xs font-medium ${RISK_COLORS[run.validation_risk] ?? 'text-slate-500'}`}>
          {run.validation_risk}
        </span>
      </td>
      <td className="px-3 py-2 text-slate-500">{run.item_count}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Matrix summary — pass rate per family
// ---------------------------------------------------------------------------

function MatrixSummary({ history }: { history: HistoryRun[] }) {
  const families = ['itemized_quote', 'lump_sum_quote', 'hybrid_quote', 'spreadsheet_quote', 'scanned_ocr_quote'];

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">Test Matrix — Pass Rate by Family</span>
      </div>
      <div className="divide-y divide-slate-100">
        {families.map(fam => {
          const runs = history.filter(r => r.expected_family === fam);
          const passed = runs.filter(r => r.pass === true).length;
          const total = runs.length;
          const rate = total > 0 ? Math.round((passed / total) * 100) : null;
          const barWidth = rate ?? 0;
          const barColor = rate === null ? 'bg-slate-200' : rate === 100 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-400' : 'bg-red-400';

          return (
            <div key={fam} className="px-4 py-3 flex items-center gap-4">
              <div className="w-36 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FAMILY_COLORS[fam]}`}>
                  {fam.replace('_quote', '').replace('_', ' ')}
                </span>
              </div>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
              </div>
              <div className="w-24 text-right text-sm">
                {rate !== null ? (
                  <span className="font-semibold text-slate-700">{passed}/{total} ({rate}%)</span>
                ) : (
                  <span className="text-slate-400 text-xs">No runs yet</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ParserTest() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [expectedFamily, setExpectedFamily] = useState<CommercialFamily>('');
  const [expectedTotal, setExpectedTotal] = useState('');
  const [persist, setPersist] = useState(true);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'comparison' | 'diagnostics'>('comparison');

  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('parser_validation_runs')
        .select('id,run_at,filename,expected_family,detected_family,expected_total,parsed_total,variance_pct,pass,validation_risk,confidence,item_count,total_source')
        .order('run_at', { ascending: false })
        .limit(50);
      setHistory((data ?? []) as HistoryRun[]);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleRun = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const form = new FormData();
      form.append('file', file);
      form.append('expectedFamily', expectedFamily);
      form.append('expectedTotal', expectedTotal);
      form.append('persist', persist ? 'true' : 'false');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate_parser`,
        { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form }
      );

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Validation failed');

      setResult(json.diagnostics as Diagnostics);
      setActiveTab('comparison');
      if (persist) loadHistory();
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Load history on mount
  useState(() => { loadHistory(); });

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Bug className="w-6 h-6 text-slate-500" />
              Parser Validation
            </h1>
            <p className="text-sm text-slate-500 mt-1">Phase 3 — test harness for all 5 commercial parser families</p>
          </div>
          <button
            onClick={loadHistory}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-1.5 bg-white hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh History
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* LEFT: Upload + config */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Upload className="w-4 h-4 text-slate-400" />
                Upload Test Document
              </h2>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
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
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.xlsx,.xls,.csv"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>

              {/* Expected values */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Expected Document Type</label>
                  <select
                    value={expectedFamily}
                    onChange={e => setExpectedFamily(e.target.value as CommercialFamily)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Not specified —</option>
                    {FAMILY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Expected Total (excl. GST)</label>
                  <input
                    type="text"
                    value={expectedTotal}
                    onChange={e => setExpectedTotal(e.target.value)}
                    placeholder="e.g. 485000.00"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={persist}
                    onChange={e => setPersist(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-slate-600">Save run to history</span>
                </label>
              </div>

              <button
                onClick={handleRun}
                disabled={!file || loading}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Running parser...</>
                  : <><Play className="w-4 h-4" />Run Validation</>}
              </button>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            {/* Test matrix */}
            <MatrixSummary history={history} />
          </div>

          {/* RIGHT: Results */}
          <div className="space-y-4">
            {result ? (
              <>
                {/* Pass/fail banner */}
                <div className={`rounded-xl px-4 py-3 flex items-center gap-3 ${
                  result.pass === true ? 'bg-green-50 border border-green-200' :
                  result.pass === false ? 'bg-red-50 border border-red-200' :
                  'bg-slate-50 border border-slate-200'
                }`}>
                  {result.pass === true
                    ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    : result.pass === false
                    ? <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                    : <AlertTriangle className="w-5 h-5 text-slate-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">
                      {result.pass === true ? 'PASS — within 1% tolerance' :
                       result.pass === false ? `FAIL — ${pct(result.variance_pct)} variance` :
                       'No expected total set — review diagnostics'}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{result.filename} · {result.duration_ms}ms</div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                  {[
                    { key: 'comparison', label: 'Comparison', icon: <Target className="w-3.5 h-3.5" /> },
                    { key: 'diagnostics', label: 'Diagnostics', icon: <BarChart3 className="w-3.5 h-3.5" /> },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key as any)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.key
                          ? 'border-slate-900 text-slate-900'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {tab.icon}{tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === 'comparison' && <ComparisonPanel d={result} />}
                {activeTab === 'diagnostics' && <DiagnosticsPanel d={result} />}
              </>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
                <TrendingUp className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Upload a file and run validation to see results</p>
              </div>
            )}
          </div>
        </div>

        {/* History table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <List className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Run History</span>
              {history.length > 0 && (
                <span className="text-xs text-slate-400">({history.length} runs)</span>
              )}
            </div>
            {historyLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>

          {history.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              No validation runs yet. Run a test above with "Save to history" checked.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                    {['File', 'Expected', 'Detected', 'Parsed Total', 'Variance', 'Pass', 'Risk', 'Items'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map(run => <HistoryRow key={run.id} run={run} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
