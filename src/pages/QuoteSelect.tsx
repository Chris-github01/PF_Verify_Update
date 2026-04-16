import { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Square, Info, ArrowRight, AlertCircle, CheckCircle, Layers, FlaskConical, X, ChevronDown, ChevronUp, Bug, Eye, Code, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTrade } from '../lib/tradeContext';
import { classifyParsedQuoteRows } from '../lib/classification/classifyParsedQuoteRows';
import type { DashboardMode } from '../App';

interface ParsedItem {
  id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  service: string | null;
  frr: string | null;
  mapped_service_type: string | null;
  mapped_system: string | null;
  confidence: number | null;
  scope_category: string | null;
  source: string | null;
  is_excluded: boolean | null;
  subclass: string | null;
  size: string | null;
}

interface DebugResponse {
  items: unknown[];
  validation: {
    score: number;
    itemsTotal: number;
    documentTotal: number | null;
    parsingGap: number;
    parsingGapPercent: number;
    hasGap: boolean;
    hasCriticalErrors: boolean;
  };
  stats: {
    totalChunks: number;
    deterministicItems: number;
    llmItems: number;
    validationScore: number;
  };
  debug: {
    parsingGap: number;
    parsingGapPercent: number;
    deterministicRatio: number;
    totalInputLines: number;
    totalParsedRows: number;
    detectedTrade: string;
    documentTotal: number | null;
    chunksTotal: number;
    processingMs: number;
    failedLinesGlobal: string[];
    chunks: Array<{
      chunkIndex: number;
      section: string;
      block: string | null;
      lineCount: number;
      detectedAsTable: boolean;
      deterministicItems: number;
      llmItems: number;
      rawLines: string[];
      parsedItems: unknown[];
      failedLines: string[];
    }>;
    structure: {
      sectionsDetected: number;
      tablesDetected: number;
      blocksDetected: number;
    };
    quality: {
      percentLinesParsed: number;
      avgParseConfidence: number;
      avgNormalizationConfidence: number;
      highRiskItems: number;
    };
  };
}

function gapColor(pct: number) {
  if (pct <= 2) return 'text-emerald-400';
  if (pct <= 5) return 'text-amber-400';
  return 'text-red-400';
}

function gapBg(pct: number) {
  if (pct <= 2) return 'bg-emerald-500/10 border-emerald-500/30';
  if (pct <= 5) return 'bg-amber-500/10 border-amber-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

function MetricCard({ label, value, sub, colorClass }: { label: string; value: string | number; sub?: string; colorClass?: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colorClass ?? 'text-slate-100'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function DebugView({ debugData, rawJson, showRaw, onToggleRaw }: {
  debugData: DebugResponse;
  rawJson: string;
  showRaw: boolean;
  onToggleRaw: () => void;
}) {
  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());
  const { debug, stats, validation } = debugData;

  const toggleChunk = (i: number) => {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <div className="p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Debug Analysis</h3>
        <button
          onClick={onToggleRaw}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors border border-slate-600"
        >
          <Code size={13} />
          {showRaw ? 'Hide' : 'Show'} Raw JSON
        </button>
      </div>

      {showRaw && (
        <div className="bg-slate-950 border border-slate-700 rounded-lg p-4 overflow-auto max-h-64">
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{rawJson}</pre>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Section A — Summary Metrics</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Parsing Gap"
            value={`${debug.parsingGapPercent}%`}
            sub={`$${Math.abs(debug.parsingGap).toLocaleString('en-NZ', { maximumFractionDigits: 0 })} gap`}
            colorClass={gapColor(debug.parsingGapPercent)}
          />
          <MetricCard
            label="Deterministic Ratio"
            value={`${Math.round(debug.deterministicRatio * 100)}%`}
            sub="of rows parsed deterministically"
            colorClass={debug.deterministicRatio >= 0.7 ? 'text-emerald-400' : debug.deterministicRatio >= 0.4 ? 'text-amber-400' : 'text-red-400'}
          />
          <MetricCard
            label="Validation Score"
            value={stats.validationScore}
            sub="out of 100"
            colorClass={stats.validationScore >= 80 ? 'text-emerald-400' : stats.validationScore >= 60 ? 'text-amber-400' : 'text-red-400'}
          />
          <MetricCard
            label="Lines Parsed"
            value={`${debug.quality.percentLinesParsed}%`}
            sub={`${debug.totalParsedRows} of ${debug.totalInputLines} lines`}
            colorClass={debug.quality.percentLinesParsed >= 60 ? 'text-emerald-400' : debug.quality.percentLinesParsed >= 30 ? 'text-amber-400' : 'text-red-400'}
          />
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Section B — Parse Stats</div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg divide-y divide-slate-700">
          {[
            ['Total Chunks', stats.totalChunks],
            ['Deterministic Items', stats.deterministicItems],
            ['LLM Items', stats.llmItems],
            ['Detected Trade', debug.detectedTrade],
            ['Document Total', debug.documentTotal != null ? `$${Number(debug.documentTotal).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}` : '—'],
            ['Items Total (parsed)', `$${validation.itemsTotal.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`],
            ['Processing Time', `${debug.processingMs}ms`],
            ['Sections Detected', debug.structure.sectionsDetected],
            ['Tables Detected', debug.structure.tablesDetected],
            ['Blocks Detected', debug.structure.blocksDetected],
          ].map(([k, v]) => (
            <div key={String(k)} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-slate-400">{k}</span>
              <span className="text-slate-100 font-medium">{String(v)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Section C — Failed Lines
          <span className="ml-2 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium">
            {debug.failedLinesGlobal.length}
          </span>
        </div>
        {debug.failedLinesGlobal.length === 0 ? (
          <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3">No failed lines detected</div>
        ) : (
          <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-auto max-h-52">
            {debug.failedLinesGlobal.slice(0, 50).map((line, i) => (
              <div key={i} className="flex gap-3 px-4 py-1.5 border-b border-slate-800 last:border-0">
                <span className="text-slate-600 text-xs w-6 flex-shrink-0">{i + 1}</span>
                <span className="text-red-300 text-xs font-mono break-all">{line}</span>
              </div>
            ))}
            {debug.failedLinesGlobal.length > 50 && (
              <div className="px-4 py-2 text-xs text-slate-500">+{debug.failedLinesGlobal.length - 50} more lines not shown</div>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Section D — Chunk Breakdown</div>
        <div className="space-y-2">
          {debug.chunks.map((chunk, i) => (
            <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleChunk(i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-500 w-8">#{i}</span>
                  <span className="text-sm font-medium text-slate-200">{chunk.section}</span>
                  {chunk.block && <span className="text-xs text-slate-400">{chunk.block}</span>}
                  {chunk.detectedAsTable && <span className="px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">table</span>}
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-400">{chunk.lineCount} lines</span>
                  <span className="text-emerald-400">{chunk.deterministicItems} det</span>
                  <span className="text-blue-400">{chunk.llmItems} llm</span>
                  <span className="text-red-400">{chunk.failedLines.length} failed</span>
                  {expandedChunks.has(i) ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
              </button>
              {expandedChunks.has(i) && (
                <div className="border-t border-slate-700 px-4 py-3 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-2">Raw Lines (first 10)</div>
                    <div className="bg-slate-950 rounded p-2 space-y-1 max-h-40 overflow-auto">
                      {chunk.rawLines.slice(0, 10).map((l, j) => (
                        <div key={j} className="text-xs text-slate-400 font-mono truncate">{l}</div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-2">Parsed Items (first 10)</div>
                    <div className="bg-slate-950 rounded p-2 space-y-1 max-h-40 overflow-auto">
                      {(chunk.parsedItems as Array<{ description?: string; total?: number; source?: string }>).slice(0, 10).map((item, j) => (
                        <div key={j} className="text-xs font-mono">
                          <span className="text-slate-300 truncate block">{item.description ?? '—'}</span>
                          <span className="text-emerald-500">${Number(item.total ?? 0).toFixed(2)}</span>
                          {item.source && <span className={`ml-2 ${item.source === 'llm' ? 'text-blue-400' : 'text-amber-400'}`}>[{item.source}]</span>}
                        </div>
                      ))}
                      {chunk.parsedItems.length === 0 && <div className="text-slate-600 text-xs">No items parsed</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Section E — Quality Metrics</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Avg Parse Confidence"
            value={`${Math.round(debug.quality.avgParseConfidence * 100)}%`}
            colorClass={debug.quality.avgParseConfidence >= 0.7 ? 'text-emerald-400' : debug.quality.avgParseConfidence >= 0.5 ? 'text-amber-400' : 'text-red-400'}
          />
          <MetricCard
            label="Avg Norm. Confidence"
            value={`${Math.round(debug.quality.avgNormalizationConfidence * 100)}%`}
            colorClass={debug.quality.avgNormalizationConfidence >= 0.8 ? 'text-emerald-400' : 'text-amber-400'}
          />
          <MetricCard
            label="High Risk Items"
            value={debug.quality.highRiskItems}
            colorClass={debug.quality.highRiskItems === 0 ? 'text-emerald-400' : debug.quality.highRiskItems < 5 ? 'text-amber-400' : 'text-red-400'}
          />
          <MetricCard
            label="Has Critical Errors"
            value={validation.hasCriticalErrors ? 'Yes' : 'No'}
            colorClass={validation.hasCriticalErrors ? 'text-red-400' : 'text-emerald-400'}
          />
        </div>
      </div>
    </div>
  );
}

function ParseResultsModal({ quoteId, quoteName, fileUrl, tradeType, onClose }: {
  quoteId: string;
  quoteName: string;
  fileUrl: string | null;
  tradeType: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<'user' | 'debug'>('user');
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  const [debugData, setDebugData] = useState<DebugResponse | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const { data, error } = await supabase
          .from('quote_items')
          .select('id, description, quantity, unit, unit_price, total_price, service, frr, mapped_service_type, mapped_system, confidence, scope_category, source, is_excluded, subclass, size')
          .eq('quote_id', quoteId)
          .order('created_at', { ascending: true })
          .limit(2000);
        if (error) throw error;
        setItems(data ?? []);
      } catch (e) {
        setItemsError(e instanceof Error ? e.message : 'Failed to load items');
      } finally {
        setLoadingItems(false);
      }
    };
    fetchItems();
  }, [quoteId]);

  const loadDebugData = async () => {
    if (debugData || debugLoading) return;
    if (!fileUrl) {
      setDebugError('No file URL available for this quote — cannot run debug analysis.');
      return;
    }
    setDebugLoading(true);
    setDebugError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? anonKey;

      const { data: signedData, error: signedError } = await supabase.storage
        .from('quotes')
        .createSignedUrl(fileUrl, 300);

      if (signedError || !signedData?.signedUrl) {
        throw new Error(`Could not generate signed URL for file: ${signedError?.message ?? 'Unknown error'}`);
      }

      const resolvedFileUrl = signedData.signedUrl;

      const res = await fetch(`${supabaseUrl}/functions/v1/test_parsing_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Apikey': anonKey,
        },
        body: JSON.stringify({ fileUrl: resolvedFileUrl, tradeType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const jsonStr = JSON.stringify(json, null, 2);
      setRawJson(jsonStr);
      setDebugData(json as DebugResponse);
    } catch (e) {
      setDebugError(e instanceof Error ? e.message : 'Debug analysis failed');
    } finally {
      setDebugLoading(false);
    }
  };

  const handleViewChange = (v: 'user' | 'debug') => {
    setView(v);
    if (v === 'debug') loadDebugData();
  };

  const exportDebugPDF = useCallback(async () => {
    if (!debugData) return;
    const { debug, stats, validation } = debugData;

    const fmtMoney = (n: number) => `$${Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

    const sectionStyle = `margin:0 0 24px 0;`;
    const headingStyle = `font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;margin:0 0 10px 0;padding-bottom:6px;border-bottom:1px solid #e2e8f0;`;
    const cardStyle = `display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;min-width:140px;margin:0 8px 8px 0;vertical-align:top;`;
    const tableStyle = `width:100%;border-collapse:collapse;font-size:12px;`;
    const tdStyle = `padding:7px 12px;border-bottom:1px solid #f1f5f9;`;
    const tdRStyle = `padding:7px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;`;

    const metricCard = (label: string, value: string, color: string) => `
      <div style="${cardStyle}">
        <div style="font-size:10px;color:#94a3b8;margin-bottom:4px;">${label}</div>
        <div style="font-size:22px;font-weight:700;color:${color};">${value}</div>
      </div>`;

    const gapPct = debug.parsingGapPercent;
    const gapColor = gapPct === 0 ? '#10b981' : gapPct < 5 ? '#f59e0b' : '#ef4444';
    const detRatio = debug.deterministicRatio;
    const detColor = detRatio >= 0.7 ? '#10b981' : detRatio >= 0.4 ? '#f59e0b' : '#ef4444';
    const vscore = stats.validationScore;
    const vColor = vscore >= 80 ? '#10b981' : vscore >= 60 ? '#f59e0b' : '#ef4444';
    const lpPct = debug.quality.percentLinesParsed;
    const lpColor = lpPct >= 60 ? '#10b981' : lpPct >= 30 ? '#f59e0b' : '#ef4444';

    const statRows = [
      ['Total Chunks', stats.totalChunks],
      ['Deterministic Items', stats.deterministicItems],
      ['LLM Items', stats.llmItems],
      ['Detected Trade', debug.detectedTrade ?? '—'],
      ['Document Total', debug.documentTotal != null ? fmtMoney(Number(debug.documentTotal)) : '—'],
      ['Items Total (parsed)', fmtMoney(validation.itemsTotal)],
      ['Processing Time', `${debug.processingMs}ms`],
      ['Sections Detected', debug.structure.sectionsDetected],
      ['Tables Detected', debug.structure.tablesDetected],
      ['Blocks Detected', debug.structure.blocksDetected],
    ];

    const failedHtml = debug.failedLinesGlobal.length === 0
      ? `<div style="color:#10b981;font-size:12px;">No failed lines detected</div>`
      : debug.failedLinesGlobal.slice(0, 200).map((l, i) => `
          <tr>
            <td style="${tdStyle}color:#94a3b8;">${i + 1}</td>
            <td style="${tdStyle}font-family:monospace;color:#ef4444;word-break:break-all;">${l}</td>
          </tr>`).join('') + (debug.failedLinesGlobal.length > 200 ? `<tr><td colspan="2" style="${tdStyle}color:#94a3b8;">+${debug.failedLinesGlobal.length - 200} more lines not shown</td></tr>` : '');

    const chunkRows = debug.chunks.map((chunk, i) => `
      <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#ffffff'};">
        <td style="${tdStyle}color:#94a3b8;">#${i}</td>
        <td style="${tdStyle}font-weight:500;">${chunk.section}</td>
        <td style="${tdStyle}color:#64748b;">${chunk.block ?? '—'}</td>
        <td style="${tdStyle}text-align:center;">${chunk.detectedAsTable ? 'Yes' : 'No'}</td>
        <td style="${tdRStyle}">${chunk.lineCount}</td>
        <td style="${tdRStyle}color:#10b981;">${chunk.deterministicItems}</td>
        <td style="${tdRStyle}color:#3b82f6;">${chunk.llmItems}</td>
        <td style="${tdRStyle}color:#ef4444;">${chunk.failedLines.length}</td>
      </tr>`).join('');

    const qmCards = [
      ['Avg Parse Confidence', fmtPct(debug.quality.avgParseConfidence), debug.quality.avgParseConfidence >= 0.7 ? '#10b981' : debug.quality.avgParseConfidence >= 0.5 ? '#f59e0b' : '#ef4444'],
      ['Avg Norm. Confidence', fmtPct(debug.quality.avgNormalizationConfidence), debug.quality.avgNormalizationConfidence >= 0.8 ? '#10b981' : '#f59e0b'],
      ['High Risk Items', String(debug.quality.highRiskItems), debug.quality.highRiskItems === 0 ? '#10b981' : debug.quality.highRiskItems < 5 ? '#f59e0b' : '#ef4444'],
      ['Has Critical Errors', validation.hasCriticalErrors ? 'Yes' : 'No', validation.hasCriticalErrors ? '#ef4444' : '#10b981'],
    ];

    const now = new Date().toLocaleString('en-NZ', { dateStyle: 'full', timeStyle: 'short' });

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Debug Analysis — ${quoteName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#1e293b;background:#fff;padding:32px 40px;}
  @media print{body{padding:20px 28px;}@page{size:A4;margin:16mm 14mm;}}
  h1{font-size:22px;font-weight:700;color:#0f172a;margin-bottom:4px;}
  .subtitle{font-size:13px;color:#64748b;margin-bottom:24px;}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:#fef3c7;color:#92400e;margin-right:6px;}
  pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:8px;font-size:10px;font-family:monospace;white-space:pre-wrap;word-break:break-all;line-height:1.6;max-height:none;}
  table{${tableStyle}}
  th{padding:7px 12px;background:#f1f5f9;text-align:left;font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.04em;}
  th.r{text-align:right;}
  .divider{border:none;border-top:1px solid #e2e8f0;margin:28px 0;}
</style>
</head>
<body>
  <div style="margin-bottom:20px;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;">
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#f59e0b;margin-bottom:4px;">
          <span class="badge">Debug Analysis Report</span>
        </div>
        <h1>${quoteName}</h1>
        <div class="subtitle">Generated ${now}</div>
      </div>
    </div>
    <hr class="divider"/>
  </div>

  <div style="${sectionStyle}">
    <div style="${headingStyle}">Raw JSON Output</div>
    <pre>${rawJson.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  </div>

  <hr class="divider"/>

  <div style="${sectionStyle}">
    <div style="${headingStyle}">Section A — Summary Metrics</div>
    <div style="display:flex;flex-wrap:wrap;gap:0;">
      ${metricCard('Parsing Gap', `${debug.parsingGapPercent}%`, gapColor)}
      ${metricCard('Deterministic Ratio', `${Math.round(detRatio * 100)}%`, detColor)}
      ${metricCard('Validation Score', String(vscore), vColor)}
      ${metricCard('Lines Parsed', `${lpPct}%`, lpColor)}
    </div>
    <div style="font-size:11px;color:#94a3b8;margin-top:6px;">
      Gap: ${fmtMoney(Math.abs(debug.parsingGap))} &nbsp;|&nbsp;
      ${debug.totalParsedRows} of ${debug.totalInputLines} lines parsed
    </div>
  </div>

  <hr class="divider"/>

  <div style="${sectionStyle}">
    <div style="${headingStyle}">Section B — Parse Stats</div>
    <table>
      ${statRows.map(([k, v]) => `<tr><td style="${tdStyle}">${k}</td><td style="${tdRStyle}">${v}</td></tr>`).join('')}
    </table>
  </div>

  <hr class="divider"/>

  <div style="${sectionStyle}">
    <div style="${headingStyle}">Section C — Failed Lines (${debug.failedLinesGlobal.length})</div>
    ${debug.failedLinesGlobal.length === 0
      ? `<div style="color:#10b981;font-size:12px;">No failed lines detected</div>`
      : `<table><thead><tr><th style="width:40px;">#</th><th>Line</th></tr></thead><tbody>${failedHtml}</tbody></table>`
    }
  </div>

  <hr class="divider"/>

  <div style="${sectionStyle}">
    <div style="${headingStyle}">Section D — Chunk Breakdown (${debug.chunks.length} chunks)</div>
    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>Section</th>
          <th>Block</th>
          <th style="text-align:center;">Table?</th>
          <th class="r">Lines</th>
          <th class="r">Det.</th>
          <th class="r">LLM</th>
          <th class="r">Failed</th>
        </tr>
      </thead>
      <tbody>${chunkRows}</tbody>
    </table>
  </div>

  <hr class="divider"/>

  <div style="${sectionStyle}">
    <div style="${headingStyle}">Section E — Quality Metrics</div>
    <div style="display:flex;flex-wrap:wrap;gap:0;">
      ${qmCards.map(([l, v, c]) => metricCard(l as string, v as string, c as string)).join('')}
    </div>
  </div>

</body>
</html>`;

    setExportingPdf(true);
    setShareUrl(null);
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const slug = quoteName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `${slug}_${Date.now()}.html`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('debug-reports')
        .upload(fileName, blob, { contentType: 'text/html;charset=utf-8', upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('debug-reports')
        .getPublicUrl(uploadData.path);
      const publicUrl = urlData.publicUrl;
      setShareUrl(publicUrl);
      await navigator.clipboard.writeText(publicUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Export failed';
      alert(`Export failed: ${errMsg}`);
    } finally {
      setExportingPdf(false);
    }
  }, [debugData, rawJson, quoteName]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = items.filter(item =>
    !filter || item.description?.toLowerCase().includes(filter.toLowerCase()) ||
    item.service?.toLowerCase().includes(filter.toLowerCase()) ||
    item.mapped_service_type?.toLowerCase().includes(filter.toLowerCase()) ||
    item.mapped_system?.toLowerCase().includes(filter.toLowerCase())
  );

  const totalValue = items.reduce((sum, i) => sum + Number(i.total_price ?? 0), 0);
  const pricedCount = items.filter(i => Number(i.total_price ?? 0) > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <FlaskConical size={18} className="text-amber-400" />
                <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Parse Results</span>
              </div>
              <h2 className="text-lg font-bold text-slate-100">{quoteName}</h2>
            </div>
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 ml-4">
              <button
                onClick={() => handleViewChange('user')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  view === 'user'
                    ? 'bg-slate-600 text-slate-100 shadow'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <Eye size={13} />
                User View
              </button>
              <button
                onClick={() => handleViewChange('debug')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  view === 'debug'
                    ? 'bg-amber-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <Bug size={13} />
                Debug View
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {view === 'user' && !loadingItems && !itemsError && (
          <div className="px-6 py-3 border-b border-slate-700/50 flex items-center gap-6 flex-shrink-0 bg-slate-800/40">
            <div className="text-sm"><span className="text-slate-400">Total Items:</span> <span className="font-semibold text-slate-100">{items.length}</span></div>
            <div className="text-sm"><span className="text-slate-400">Priced:</span> <span className="font-semibold text-emerald-400">{pricedCount}</span></div>
            <div className="text-sm"><span className="text-slate-400">Total Value:</span> <span className="font-semibold text-slate-100">${totalValue.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div className="ml-auto">
              <input
                type="text"
                placeholder="Filter items..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 w-48"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {view === 'user' && (
            <>
              {loadingItems && (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400" />
                </div>
              )}
              {itemsError && (
                <div className="p-6 text-red-400 text-sm">{itemsError}</div>
              )}
              {!loadingItems && !itemsError && (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-800 z-10">
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
                      <th className="px-4 py-2 w-8">#</th>
                      <th className="px-4 py-2">Description</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2">Unit</th>
                      <th className="px-4 py-2 text-right">Unit Price</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2">Service</th>
                      <th className="px-4 py-2">FRR</th>
                      <th className="px-4 py-2">Mapped Type</th>
                      <th className="px-4 py-2 text-right">Conf.</th>
                      <th className="px-4 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filtered.map((item, idx) => (
                      <>
                        <tr
                          key={item.id}
                          className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                          onClick={() => toggleRow(item.id)}
                        >
                          <td className="px-4 py-2 text-slate-500 text-xs">{idx + 1}</td>
                          <td className="px-4 py-2 text-slate-200 max-w-xs">
                            <div className="truncate">{item.description || <span className="text-slate-600 italic">—</span>}</div>
                          </td>
                          <td className="px-4 py-2 text-right text-slate-300">
                            {item.quantity != null ? item.quantity : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-2 text-slate-400 text-xs">
                            {item.unit || <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-300">
                            {item.unit_price != null
                              ? `$${Number(item.unit_price).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">
                            {item.total_price != null && Number(item.total_price) > 0
                              ? <span className="text-emerald-400">${Number(item.total_price).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-2">
                            {item.service
                              ? <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">{item.service}</span>
                              : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-400">
                            {item.frr || <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-400">
                            {item.mapped_service_type || <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-xs">
                            {item.confidence != null
                              ? <span className={item.confidence >= 0.8 ? 'text-emerald-400' : item.confidence >= 0.5 ? 'text-amber-400' : 'text-red-400'}>
                                  {Math.round(item.confidence * 100)}%
                                </span>
                              : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-2 text-slate-500">
                            {expandedRows.has(item.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </td>
                        </tr>
                        {expandedRows.has(item.id) && (
                          <tr key={`${item.id}-expanded`} className="bg-slate-800/30">
                            <td />
                            <td colSpan={10} className="px-4 py-3">
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div><span className="text-slate-500">Mapped System:</span> <span className="text-slate-300">{item.mapped_system || '—'}</span></div>
                                <div><span className="text-slate-500">Scope Category:</span> <span className="text-slate-300">{item.scope_category || '—'}</span></div>
                                <div><span className="text-slate-500">Subclass:</span> <span className="text-slate-300">{item.subclass || '—'}</span></div>
                                <div><span className="text-slate-500">Size:</span> <span className="text-slate-300">{item.size || '—'}</span></div>
                                <div><span className="text-slate-500">Source:</span> <span className="text-slate-300">{item.source || '—'}</span></div>
                                <div><span className="text-slate-500">Excluded:</span> <span className={item.is_excluded ? 'text-red-400' : 'text-slate-300'}>{item.is_excluded ? 'Yes' : 'No'}</span></div>
                                <div className="col-span-2"><span className="text-slate-500">Full Description:</span> <span className="text-slate-300">{item.description || '—'}</span></div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-4 py-12 text-center text-slate-500">No items match your filter</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </>
          )}

          {view === 'debug' && (
            <>
              {debugLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400" />
                  <p className="text-slate-400 text-sm">Running parsing_v2 diagnostics...</p>
                </div>
              )}
              {debugError && (
                <div className="p-6">
                  <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-sm text-red-400">{debugError}</div>
                </div>
              )}
              {debugData && !debugLoading && (
                <DebugView
                  debugData={debugData}
                  rawJson={rawJson}
                  showRaw={showRaw}
                  onToggleRaw={() => setShowRaw(v => !v)}
                />
              )}
            </>
          )}
        </div>

        {view === 'debug' && shareUrl && (
          <div className="px-6 py-3 border-t border-slate-700 bg-slate-800/60 flex items-center gap-3 flex-shrink-0">
            <span className="text-xs text-slate-400 flex-shrink-0">Shareable link:</span>
            <input
              readOnly
              value={shareUrl}
              className="flex-1 min-w-0 px-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-xs text-slate-200 font-mono focus:outline-none select-all"
              onClick={e => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000);
              }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${copySuccess ? 'bg-emerald-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
            >
              {copySuccess ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
        <div className="px-6 py-3 border-t border-slate-700 flex-shrink-0 flex items-center justify-between gap-3">
          {view === 'user'
            ? <span className="text-xs text-slate-500">Showing {filtered.length} of {items.length} items</span>
            : <span className="text-xs text-slate-500">
                {debugData ? `${debugData.debug.chunks.length} chunks · ${debugData.debug.failedLinesGlobal.length} failed lines` : 'Debug mode'}
              </span>
          }
          <div className="flex items-center gap-2">
            {view === 'debug' && debugData && (
              <button
                onClick={exportDebugPDF}
                disabled={exportingPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {exportingPdf ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                {exportingPdf ? 'Uploading...' : shareUrl ? 'Re-export & Share' : 'Export & Share Link'}
              </button>
            )}
            <button onClick={onClose} className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Quote {
  id: string;
  supplier_name: string;
  quote_reference: string;
  total_amount: number;
  document_total?: number;
  levels_multiplier?: number;
  items_count: number;
  final_items_count?: number;
  inserted_items_count?: number;
  status: string;
  is_selected: boolean;
  file_name?: string;
  file_url?: string;
  trade?: string;
  quoted_total?: number;
  main_scope_total?: number;
  main_scope_count?: number;
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
  const { currentTrade } = useTrade();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [parseModal, setParseModal] = useState<{ quoteId: string; quoteName: string; fileUrl: string | null; tradeType: string } | null>(null);

  useEffect(() => {
    loadQuotes();
  }, [projectId, dashboardMode, currentTrade]);

  const loadQuotes = async () => {
    setLoading(true);
    try {
      const { data: allQuotes, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('project_id', projectId)
        .eq('trade', currentTrade)
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

      const quoteIds = filteredQuotes.map(q => q.id);
      let itemsByQuote: Record<string, { quantity: number; unit_price: number; total_price: number; description: string }[]> = {};

      let fileUrlByQuote: Record<string, string> = {};

      if (quoteIds.length > 0) {
        const { data: allItems } = await supabase
          .from('quote_items')
          .select('quote_id, description, quantity, unit_price, total_price')
          .in('quote_id', quoteIds)
          .limit(5000);

        if (allItems) {
          for (const item of allItems) {
            if (!itemsByQuote[item.quote_id]) itemsByQuote[item.quote_id] = [];
            itemsByQuote[item.quote_id].push(item);
          }
        }

        const { data: parsingJobs } = await supabase
          .from('parsing_jobs')
          .select('quote_id, file_url')
          .in('quote_id', quoteIds)
          .not('file_url', 'is', null);

        if (parsingJobs) {
          for (const job of parsingJobs) {
            if (job.quote_id && job.file_url && !fileUrlByQuote[job.quote_id]) {
              fileUrlByQuote[job.quote_id] = job.file_url;
            }
          }
        }
      }

      const isPassiveFire = currentTrade === 'passive_fire';

      const quotesWithCounts = filteredQuotes.map(quote => {
        const rawItems = itemsByQuote[quote.id] ?? [];

        let main_scope_total: number;
        let main_scope_count: number;

        if (isPassiveFire) {
          const { summary } = classifyParsedQuoteRows(rawItems);
          main_scope_total = summary.main_scope_total;
          main_scope_count = summary.counts.main_scope;
        } else if (quote.levels_multiplier && quote.document_total) {
          main_scope_total = Number(quote.document_total);
          const pricedCount = rawItems.filter(item => Number(item.total_price ?? 0) > 0).length;
          main_scope_count = pricedCount > 0 ? pricedCount : (quote.inserted_items_count ?? quote.items_count ?? 0);
        } else {
          const priced = rawItems.filter(item => Number(item.total_price ?? 0) > 0);
          main_scope_total = priced.reduce((sum, item) => sum + Number(item.total_price ?? 0), 0);
          main_scope_count = priced.length;
        }

        return {
          ...quote,
          file_url: fileUrlByQuote[quote.id] ?? quote.file_url ?? null,
          items_count: (quote.inserted_items_count && quote.inserted_items_count > 0)
            ? quote.inserted_items_count
            : (quote.final_items_count && quote.final_items_count > 0)
            ? quote.final_items_count
            : quote.items_count ?? 0,
          main_scope_total,
          main_scope_count,
        };
      });

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
      case 'accepted':
      case 'awarded':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'processing':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'failed':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'processed':
      case 'accepted':
      case 'awarded':
        return 'Ready';
      case 'ready':
        return 'Ready';
      case 'processing':
        return 'Processing';
      case 'failed':
        return 'Failed';
      default:
        return 'Ready';
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
    <div className="p-6 max-w-full">
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
            <CheckSquare className="text-orange-400" size={20} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-100">Select Quotes</h2>
            <p className="text-sm text-slate-400">
              Choose which quotes you want to clean, map, and include in your analysis
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mb-6">
          <button
            onClick={selectAll}
            disabled={saving || totalCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors text-sm"
          >
            <CheckSquare size={16} />
            Select All
          </button>
          <button
            onClick={deselectAll}
            disabled={saving || totalCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700 disabled:text-slate-500 text-slate-300 rounded-lg font-medium transition-colors text-sm"
          >
            <Square size={16} />
            Deselect All
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-xl mb-6 ${
            message.type === 'success' ? 'bg-green-900/20 border border-green-500/30' :
            message.type === 'error' ? 'bg-red-900/20 border border-red-500/30' :
            'bg-blue-900/20 border border-blue-500/30'
          }`}>
            <div className="flex items-start gap-2">
              {message.type === 'success' ? (
                <CheckCircle size={18} className="mt-0.5 flex-shrink-0 text-green-400" />
              ) : message.type === 'error' ? (
                <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-red-400" />
              ) : (
                <Info size={18} className="mt-0.5 flex-shrink-0 text-blue-400" />
              )}
              <span className={
                message.type === 'success' ? 'text-green-300' :
                message.type === 'error' ? 'text-red-300' :
                'text-blue-300'
              }>{message.text}</span>
            </div>
          </div>
        )}

        <div className="mb-6 p-4 bg-slate-900/50 border border-slate-700/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <CheckSquare className="text-orange-400" size={20} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-100">
                  {selectedCount} of {totalCount}
                </p>
                <p className="text-sm text-slate-400">quotes selected</p>
              </div>
            </div>
            {!canProceed && (
              <div className="flex items-center gap-2 text-amber-400">
                <AlertCircle size={16} />
                <span className="text-sm">Select at least one quote to continue</span>
              </div>
            )}
          </div>
        </div>

        {quotes.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-900/50 mb-4">
              <Info className="text-slate-400" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">No Quotes Found</h3>
            <p className="text-sm text-slate-500 mb-4">
              Import quotes first before selecting them for processing
            </p>
            {onNavigateBack && (
              <button
                onClick={onNavigateBack}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Go to Import Quotes
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map((quote) => (
              <div
                key={quote.id}
                className={`group relative w-full rounded-lg border transition-all ${
                  quote.is_selected
                    ? 'bg-slate-900/50 border-orange-500/50'
                    : 'bg-slate-900/30 border-slate-700/50 hover:border-slate-600/50 hover:bg-slate-900/40'
                }`}
              >
                <div className="flex items-stretch">
                  <button
                    onClick={() => toggleQuoteSelection(quote.id)}
                    className="flex-1 p-4 text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center transition-all ${
                        quote.is_selected
                          ? 'bg-orange-500 text-white'
                          : 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-600'
                      }`}>
                        {quote.is_selected ? <CheckSquare size={14} /> : <Square size={14} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold text-slate-100 mb-0.5 truncate">
                              {quote.supplier_name}
                            </h3>
                            {quote.quote_reference && (
                              <p className="text-xs text-slate-400">
                                Reference: {quote.quote_reference}
                              </p>
                            )}
                            {quote.file_name && (
                              <p className="text-xs text-slate-500 mt-0.5 truncate">
                                {quote.file_name}
                              </p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${getStatusColor(quote.status)}`}>
                            {getStatusLabel(quote.status)}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Main Scope:</span>
                            <span className="font-semibold text-slate-100">
                              ${(quote.main_scope_total ?? quote.total_amount ?? 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Items:</span>
                            <span className="font-medium text-slate-300">
                              {(quote.main_scope_count ?? quote.items_count).toLocaleString()}
                            </span>
                          </div>
                          {quote.levels_multiplier && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-300 font-medium">
                              <Layers size={10} />
                              <span>×{quote.levels_multiplier} levels</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center px-3 border-l border-slate-700/50">
                    <button
                      onClick={() => setParseModal({ quoteId: quote.id, quoteName: quote.supplier_name, fileUrl: quote.file_url ?? null, tradeType: quote.trade ?? currentTrade })}
                      title="View parse results"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-400 text-xs font-medium transition-all whitespace-nowrap"
                    >
                      <FlaskConical size={13} />
                      Parse Results
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {canProceed && onNavigateNext && (
          <div className="mt-6 pt-6 border-t border-slate-700/50 flex justify-end">
            <button
              onClick={() => {
                // Trigger dashboard refresh when navigating
                window.dispatchEvent(new Event('refresh-dashboard'));
                onNavigateNext();
              }}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg font-medium text-sm transition-all"
            >
              Continue to Review & Clean
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>

      {parseModal && (
        <ParseResultsModal
          quoteId={parseModal.quoteId}
          quoteName={parseModal.quoteName}
          fileUrl={parseModal.fileUrl}
          tradeType={parseModal.tradeType}
          onClose={() => setParseModal(null)}
        />
      )}
    </div>
  );
}
