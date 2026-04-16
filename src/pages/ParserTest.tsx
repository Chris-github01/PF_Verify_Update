import { useState, useRef } from 'react';
import { Play, Copy, Check, Loader2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, BarChart3, FileText, Layers, Bug } from 'lucide-react';

const TRADE_TYPES = [
  'passive_fire',
  'plumbing',
  'electrical',
  'hvac',
  'active_fire',
  'carpentry',
  'unknown',
] as const;

type TradeType = typeof TRADE_TYPES[number];

interface QualityMetrics {
  percentLinesParsed: number;
  avgParseConfidence: number;
  avgNormalizationConfidence: number;
  highRiskItems: number;
}

interface DebugStructure {
  sectionsDetected: number;
  tablesDetected: number;
  blocksDetected: number;
}

interface ParseResult {
  items?: unknown[];
  validation?: {
    score: number;
    itemsTotal: number;
    documentTotal: number | null;
    parsingGap: number;
    parsingGapPercent: number;
    hasGap: boolean;
    hasCriticalErrors: boolean;
  };
  confidence_score?: number;
  issues?: unknown[];
  stats?: {
    totalChunks: number;
    deterministicItems: number;
    llmItems: number;
    validationScore: number;
  };
  debug?: {
    parsingGap: number;
    parsingGapPercent: number;
    hasGap: boolean;
    invalidItemsCount: number;
    lowConfidenceItemsCount: number;
    totalInputLines: number;
    totalParsedRows: number;
    deterministicRatio: number;
    detectedTrade: string;
    documentTotal: number | null;
    chunksTotal: number;
    processingMs: number;
    chunks: unknown[];
    failedLinesGlobal: string[];
    structure: DebugStructure;
    quality: QualityMetrics;
  };
  error?: string;
}

function MetricCard({
  label,
  value,
  unit,
  status,
}: {
  label: string;
  value: string | number;
  unit?: string;
  status?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const statusColors = {
    good: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    warn: 'bg-amber-50 border-amber-200 text-amber-700',
    bad: 'bg-red-50 border-red-200 text-red-700',
    neutral: 'bg-gray-50 border-gray-200 text-gray-700',
  };
  const color = statusColors[status ?? 'neutral'];
  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-bold">
        {value}
        {unit && <span className="text-sm font-normal ml-1 opacity-70">{unit}</span>}
      </p>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          {icon}
          {title}
          {count !== undefined && (
            <span className="bg-gray-200 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

export default function ParserTest() {
  const [text, setText] = useState('');
  const [tradeType, setTradeType] = useState<TradeType>('passive_fire');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const jsonRef = useRef<HTMLPreElement>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const runTest = async () => {
    if (!text.trim()) {
      setError('Please paste some text to parse.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/test_parsing_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ text, tradeType }),
      });
      const data: ParseResult = await res.json();
      setResult(data);
      if (!res.ok) setError(data.error ?? 'Unknown error from endpoint.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const copyJson = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const debug = result?.debug;
  const quality = debug?.quality;
  const structure = debug?.structure;

  const gapStatus = (pct: number): 'good' | 'warn' | 'bad' =>
    pct < 5 ? 'good' : pct < 15 ? 'warn' : 'bad';

  const ratioStatus = (r: number): 'good' | 'warn' | 'bad' =>
    r > 0.7 ? 'good' : r > 0.4 ? 'warn' : 'bad';

  const coverageStatus = (pct: number): 'good' | 'warn' | 'bad' =>
    pct > 60 ? 'good' : pct > 30 ? 'warn' : 'bad';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <Bug size={18} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Parser Test Lab</h1>
            <span className="bg-amber-500/20 text-amber-400 text-xs font-semibold px-2 py-1 rounded border border-amber-500/30">
              INTERNAL TOOL
            </span>
          </div>
          <p className="text-gray-400 text-sm">
            Diagnose parsing behavior and failures for <code className="text-amber-400">parsing_v2</code>. Paste extracted text or raw quote content below.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Raw Text Input
              </label>
              <textarea
                className="w-full h-80 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
                placeholder="Paste extracted PDF text or raw quote text here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                {text.split('\n').filter((l) => l.trim()).length} non-empty lines &bull; {text.length.toLocaleString()} chars
              </p>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Trade Type
                </label>
                <select
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                  value={tradeType}
                  onChange={(e) => setTradeType(e.target.value as TradeType)}
                >
                  {TRADE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={runTest}
                disabled={loading || !text.trim()}
                className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    Run Parser Test
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-3 bg-red-950/50 border border-red-800 rounded-lg px-4 py-3">
                <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}
          </div>

          {result && debug && (
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Key Metrics</h2>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Validation Score"
                  value={result.confidence_score ?? 0}
                  unit="/100"
                  status={
                    (result.confidence_score ?? 0) >= 80 ? 'good'
                    : (result.confidence_score ?? 0) >= 60 ? 'warn'
                    : 'bad'
                  }
                />
                <MetricCard
                  label="Parsing Gap"
                  value={debug.parsingGapPercent.toFixed(1)}
                  unit="%"
                  status={gapStatus(debug.parsingGapPercent)}
                />
                <MetricCard
                  label="Lines Parsed"
                  value={quality ? quality.percentLinesParsed.toFixed(1) : '—'}
                  unit="%"
                  status={quality ? coverageStatus(quality.percentLinesParsed) : 'neutral'}
                />
                <MetricCard
                  label="Deterministic Ratio"
                  value={debug.deterministicRatio ? (debug.deterministicRatio * 100).toFixed(0) : '0'}
                  unit="%"
                  status={ratioStatus(debug.deterministicRatio)}
                />
                <MetricCard
                  label="Avg Parse Confidence"
                  value={quality ? quality.avgParseConfidence.toFixed(2) : '—'}
                  status={
                    quality && quality.avgParseConfidence >= 0.7 ? 'good'
                    : quality && quality.avgParseConfidence >= 0.5 ? 'warn'
                    : 'bad'
                  }
                />
                <MetricCard
                  label="High Risk Items"
                  value={quality ? quality.highRiskItems : '—'}
                  status={
                    quality && quality.highRiskItems === 0 ? 'good'
                    : quality && quality.highRiskItems <= 3 ? 'warn'
                    : 'bad'
                  }
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Input Lines</p>
                  <p className="text-lg font-bold text-white">{debug.totalInputLines}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Parsed Rows</p>
                  <p className="text-lg font-bold text-white">{debug.totalParsedRows}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Failed Lines</p>
                  <p className="text-lg font-bold text-amber-400">{debug.failedLinesGlobal?.length ?? 0}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Chunks</p>
                  <p className="text-lg font-bold text-white">{debug.chunksTotal}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Valid Items</p>
                  <p className="text-lg font-bold text-emerald-400">{result.items?.length ?? 0}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Invalid Items</p>
                  <p className="text-lg font-bold text-red-400">{debug.invalidItemsCount}</p>
                </div>
              </div>

              {structure && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Structure Detected</p>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">Sections:</span>{' '}
                      <span className="text-white font-medium">{structure.sectionsDetected}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Tables:</span>{' '}
                      <span className="text-white font-medium">{structure.tablesDetected}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Blocks:</span>{' '}
                      <span className="text-white font-medium">{structure.blocksDetected}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Trade:</span>{' '}
                      <span className="text-amber-400 font-medium">{debug.detectedTrade}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Time:</span>{' '}
                      <span className="text-white font-medium">{debug.processingMs}ms</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {result && debug && (
          <div className="flex flex-col gap-4 mb-6">
            {(debug.failedLinesGlobal?.length ?? 0) > 0 && (
              <CollapsibleSection
                title="Failed Lines"
                icon={<AlertTriangle size={14} className="text-amber-500" />}
                count={debug.failedLinesGlobal.length}
                defaultOpen
              >
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {debug.failedLinesGlobal.map((line, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 bg-amber-950/30 border border-amber-900/50 rounded px-3 py-2"
                    >
                      <span className="text-amber-600 text-xs font-mono mt-0.5 flex-shrink-0">
                        {String(i + 1).padStart(3, '0')}
                      </span>
                      <span className="text-amber-200 text-xs font-mono break-all">{line}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {(debug.chunks?.length ?? 0) > 0 && (
              <CollapsibleSection
                title="Chunk-Level Breakdown"
                icon={<Layers size={14} className="text-blue-400" />}
                count={debug.chunks.length}
              >
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {(debug.chunks as Array<{
                    chunkIndex: number;
                    section: string;
                    block: string | null;
                    lineCount: number;
                    detectedAsTable: boolean;
                    deterministicItems: number;
                    llmItems: number;
                    rawLines: string[];
                    parsedItems: Array<{ description: string; total: number; confidence: string; parseMethod: string }>;
                    failedLines: string[];
                  }>).map((chunk) => (
                    <div key={chunk.chunkIndex} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-500">#{chunk.chunkIndex}</span>
                          <span className="text-sm font-semibold text-white">{chunk.section}</span>
                          {chunk.block && (
                            <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded border border-blue-800">
                              {chunk.block}
                            </span>
                          )}
                          {chunk.detectedAsTable && (
                            <span className="text-xs bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
                              table
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{chunk.lineCount} lines</span>
                          <span className="text-emerald-400">{chunk.deterministicItems} det</span>
                          <span className="text-blue-400">{chunk.llmItems} llm</span>
                          {chunk.failedLines.length > 0 && (
                            <span className="text-amber-400">{chunk.failedLines.length} failed</span>
                          )}
                        </div>
                      </div>

                      {chunk.parsedItems.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Parsed Items</p>
                          <div className="space-y-1">
                            {chunk.parsedItems.map((item, j) => (
                              <div key={j} className="flex items-center justify-between bg-gray-800 rounded px-3 py-1.5 gap-2">
                                <span className="text-xs text-gray-200 truncate flex-1">{item.description}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-xs text-gray-400">${item.total?.toLocaleString()}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                                    item.confidence === 'high' ? 'bg-emerald-900/50 text-emerald-300' :
                                    item.confidence === 'medium' ? 'bg-amber-900/50 text-amber-300' :
                                    'bg-red-900/50 text-red-300'
                                  }`}>
                                    {item.confidence}
                                  </span>
                                  <span className="text-xs text-gray-500 font-mono">{item.parseMethod}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {chunk.failedLines.length > 0 && (
                        <div>
                          <p className="text-xs text-amber-500 mb-2 uppercase tracking-wide">Failed Lines in Chunk</p>
                          <div className="space-y-1">
                            {chunk.failedLines.map((line, j) => (
                              <div key={j} className="text-xs font-mono text-amber-200 bg-amber-950/30 border border-amber-900/40 rounded px-3 py-1.5 break-all">
                                {line}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {(result.items?.length ?? 0) > 0 && (
              <CollapsibleSection
                title="Valid Parsed Items"
                icon={<CheckCircle2 size={14} className="text-emerald-400" />}
                count={result.items?.length}
              >
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 text-left border-b border-gray-800">
                        <th className="pb-2 pr-4 font-medium">Description</th>
                        <th className="pb-2 pr-3 font-medium">Qty</th>
                        <th className="pb-2 pr-3 font-medium">Unit</th>
                        <th className="pb-2 pr-3 font-medium">Rate</th>
                        <th className="pb-2 pr-3 font-medium">Total</th>
                        <th className="pb-2 pr-3 font-medium">Conf</th>
                        <th className="pb-2 font-medium">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {(result.items as Array<{
                        description: string;
                        qty: number;
                        unit: string;
                        rate: number;
                        total: number;
                        confidence: string;
                        parseMethod: string;
                        section: string;
                      }>).map((item, i) => (
                        <tr key={i} className="hover:bg-gray-900">
                          <td className="py-2 pr-4 text-gray-200 max-w-xs truncate" title={item.description}>
                            {item.description}
                          </td>
                          <td className="py-2 pr-3 text-gray-400 tabular-nums">{item.qty}</td>
                          <td className="py-2 pr-3 text-gray-400">{item.unit}</td>
                          <td className="py-2 pr-3 text-gray-400 tabular-nums">${item.rate?.toLocaleString()}</td>
                          <td className="py-2 pr-3 text-white tabular-nums font-medium">${item.total?.toLocaleString()}</td>
                          <td className="py-2 pr-3">
                            <span className={`px-1.5 py-0.5 rounded font-mono ${
                              item.confidence === 'high' ? 'bg-emerald-900/50 text-emerald-300' :
                              item.confidence === 'medium' ? 'bg-amber-900/50 text-amber-300' :
                              'bg-red-900/50 text-red-300'
                            }`}>
                              {item.confidence}
                            </span>
                          </td>
                          <td className="py-2 text-gray-500 font-mono">{item.parseMethod}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>
            )}

            {(result.issues?.length ?? 0) > 0 && (
              <CollapsibleSection
                title="Validation Issues"
                icon={<BarChart3 size={14} className="text-red-400" />}
                count={result.issues?.length}
              >
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {(result.issues as Array<{ type: string; severity: string; message: string; itemIndex: number | null }>).map((issue, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 rounded px-3 py-2 text-xs ${
                        issue.severity === 'error'
                          ? 'bg-red-950/50 border border-red-900 text-red-300'
                          : 'bg-amber-950/50 border border-amber-900 text-amber-300'
                      }`}
                    >
                      <span className="font-mono opacity-60 flex-shrink-0">{issue.severity.toUpperCase()}</span>
                      <span className="font-mono text-gray-400 flex-shrink-0">[{issue.type}]</span>
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection
              title="Full JSON Response"
              icon={<FileText size={14} className="text-gray-400" />}
            >
              <div className="relative">
                <button
                  onClick={copyJson}
                  className="absolute top-2 right-2 flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded transition-colors z-10"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </button>
                <pre
                  ref={jsonRef}
                  className="bg-gray-950 border border-gray-800 rounded-lg p-4 pt-10 text-xs text-gray-300 font-mono overflow-auto max-h-[600px] whitespace-pre leading-relaxed"
                >
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </CollapsibleSection>
          </div>
        )}

        {!result && !loading && (
          <div className="text-center py-20 text-gray-600">
            <Bug size={40} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">Paste text above and click Run Parser Test to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
