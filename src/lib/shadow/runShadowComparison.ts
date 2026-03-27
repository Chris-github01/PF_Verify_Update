import { supabase } from '../supabase';
import { runLiveParser } from '../modules/parsers/plumbing/live';
import { runShadowParser } from '../modules/parsers/plumbing/shadow';
import { LIVE_PARSER_VERSION, SHADOW_PARSER_VERSION } from '../modules/parsers/plumbing/shared';
import type { PlumbingSourceRow, PlumbingParserOutput } from '../modules/parsers/plumbing/types';
import { TRADE_MODULES } from '../modules/tradeRegistry';
import type { RunMode } from '../../types/shadow';
import { buildAndSaveDiagnostics } from './phase1/runDiagnosticsBuilder';
import { classifyAndSaveFailures } from './phase1/failureClassifier';
import { resolveDocumentTruth } from './phase1/shadowDocumentTruth';
import type { ResolvedDataset } from './phase1/sourceAdapters';

export interface RunShadowComparisonInput {
  moduleKey: string;
  quoteId: string;
  mode: RunMode;
}

export interface RunShadowComparisonResult {
  runId: string;
  status: 'completed' | 'failed';
  error?: string;
}

interface QuoteRowsResult {
  rows: PlumbingSourceRow[];
  documentTotal: number | null;
  supplierName: string | null;
  sourceLabel: string;
  itemCount: number;
  resolvedVia: string;
}

async function fetchQuoteRows(quoteId: string): Promise<QuoteRowsResult> {
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('id, supplier_name, document_total, total_price, inserted_items_count, line_item_count, final_items_count, trade')
    .eq('id', quoteId)
    .maybeSingle();

  if (qErr) throw new Error(qErr.message);
  if (!quote) throw new Error(`Quote ${quoteId} not found`);

  const { data: items, error: iErr } = await supabase
    .from('quote_items')
    .select('description, raw_description, quantity, unit, unit_price, total_price')
    .eq('quote_id', quoteId)
    .order('created_at');

  if (iErr) throw new Error(iErr.message);

  const rows: PlumbingSourceRow[] = (items ?? []).map((item) => ({
    description: item.description ?? item.raw_description ?? null,
    qty: item.quantity ?? null,
    unit: item.unit ?? null,
    rate: item.unit_price ?? null,
    total: item.total_price ?? null,
  }));

  const resolvedItemCount = rows.length;

  const metaItemCount =
    (quote.inserted_items_count ?? 0) > 0 ? (quote.inserted_items_count as number) :
    (quote.line_item_count ?? 0) > 0 ? (quote.line_item_count as number) :
    (quote.final_items_count ?? 0) as number;

  console.log('[ShadowComparison] Source resolution', {
    moduleKey: quote.trade,
    quoteId: quoteId.slice(0, 8),
    resolvedFromQuoteItems: resolvedItemCount,
    metaItemCountFromQuotes: metaItemCount,
    resolvedVia: resolvedItemCount > 0 ? 'quote_items' : 'quote_items_empty',
  });

  return {
    rows,
    documentTotal: quote.document_total ?? quote.total_price ?? null,
    supplierName: quote.supplier_name ?? null,
    sourceLabel: `${quote.supplier_name ?? 'Quote'} (${quoteId.slice(0, 8)})`,
    itemCount: resolvedItemCount > 0 ? resolvedItemCount : metaItemCount,
    resolvedVia: resolvedItemCount > 0 ? 'quote_items' : 'meta_count_fallback',
  };
}

function buildRunOutput(output: PlumbingParserOutput): Record<string, unknown> {
  return {
    parserVersion: output.parserVersion,
    parsedValue: output.parsedValue,
    detectedDocumentTotal: output.detectedDocumentTotal,
    differenceToDocumentTotal: output.differenceToDocumentTotal,
    includedLineCount: output.includedLineCount,
    excludedLineCount: output.excludedLineCount,
    totalRowCount: output.totalRowCount,
    parserWarnings: output.parserWarnings,
    hasTotalMismatch: output.hasTotalMismatch,
    hasLikelyFinalTotalAsLineItem: output.hasLikelyFinalTotalAsLineItem,
    hasDuplicateValueRisk: output.hasDuplicateValueRisk,
    ruleHitsSummary: output.ruleHitsSummary,
    rows: output.allRows,
    items: output.includedRows,
    executedAt: output.executedAt,
  };
}

function buildPassthroughOutput(
  moduleKey: string,
  quoteId: string,
  rows: PlumbingSourceRow[],
  documentTotal: number | null,
  itemCount: number,
): Record<string, unknown> {
  const parsedValue = rows.reduce((sum, r) => {
    const t = typeof r.total === 'number' ? r.total : parseFloat(String(r.total ?? '0')) || 0;
    return sum + t;
  }, 0);

  return {
    parserVersion: 'passthrough-v1',
    moduleKey,
    sourceId: quoteId,
    sourceType: 'quote',
    parsedValue,
    detectedDocumentTotal: documentTotal,
    differenceToDocumentTotal: documentTotal != null ? parsedValue - documentTotal : null,
    includedLineCount: itemCount,
    excludedLineCount: 0,
    totalRowCount: itemCount,
    parserWarnings: [],
    hasTotalMismatch: false,
    hasLikelyFinalTotalAsLineItem: false,
    hasDuplicateValueRisk: false,
    ruleHitsSummary: {},
    rows: [],
    items: [],
    executedAt: new Date().toISOString(),
    note: `Passthrough snapshot for ${moduleKey} — deep diff not available for this trade module`,
  };
}

function isPlumbingModule(moduleKey: string): boolean {
  const mod = TRADE_MODULES[moduleKey];
  return mod?.trade_category === 'plumbing';
}

export async function runShadowComparison(
  input: RunShadowComparisonInput
): Promise<RunShadowComparisonResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const usePlumbingParser = isPlumbingModule(input.moduleKey);

  const { data: runRecord, error: insertErr } = await supabase
    .from('shadow_runs')
    .insert({
      module_key: input.moduleKey,
      source_type: 'quote',
      source_id: input.quoteId,
      initiated_by: user.id,
      run_mode: input.mode,
      status: 'running',
      live_version: usePlumbingParser ? LIVE_PARSER_VERSION : 'passthrough-v1',
      shadow_version: usePlumbingParser ? SHADOW_PARSER_VERSION : 'passthrough-v1',
      started_at: new Date().toISOString(),
      metadata_json: { triggered_from: 'shadow_compare_ui', trade_module: input.moduleKey },
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);
  const runId = runRecord.id as string;

  try {
    const { rows, documentTotal, supplierName, sourceLabel, itemCount, resolvedVia } =
      await fetchQuoteRows(input.quoteId);

    console.log('[ShadowComparison] Preflight', {
      moduleKey: input.moduleKey,
      quoteId: input.quoteId.slice(0, 8),
      resolvedLineItems: rows.length,
      itemCount,
      resolvedVia,
      usePlumbingParser,
    });

    if (itemCount === 0) {
      throw new Error(
        usePlumbingParser
          ? 'Quote has no parsed line items. Import and parse the quote first.'
          : `Parsed dataset record found, but no executable row payload could be resolved for ${input.moduleKey}. Ensure the quote was successfully parsed and items were saved.`
      );
    }

    if (!usePlumbingParser && rows.length === 0) {
      console.warn(
        `[ShadowComparison] ${input.moduleKey}: quote_items returned 0 rows but meta count is ${itemCount}. ` +
        `Using passthrough snapshot with meta count. resolvedVia=${resolvedVia}`
      );
    }

    await supabase
      .from('shadow_runs')
      .update({ source_label: sourceLabel })
      .eq('id', runId);

    let liveOutputJson: Record<string, unknown>;
    let shadowOutputJson: Record<string, unknown> | null = null;
    let liveMetrics: Record<string, unknown>;
    let shadowMetrics: Record<string, unknown> | null = null;

    if (usePlumbingParser) {
      const parserInput = {
        sourceType: 'quote' as const,
        sourceId: input.quoteId,
        rows,
        documentTotal,
        supplierName,
      };

      const liveOutput = runLiveParser(parserInput);
      liveOutputJson = buildRunOutput(liveOutput);
      liveMetrics = {
        parsedValue: liveOutput.parsedValue,
        itemCount: liveOutput.includedLineCount,
        excludedCount: liveOutput.excludedLineCount,
        totalMismatch: liveOutput.hasTotalMismatch,
        sourceItemCount: itemCount,
      };

      if (input.mode === 'live_vs_shadow') {
        const shadowOutput = runShadowParser(parserInput);
        shadowOutputJson = buildRunOutput(shadowOutput);
        const delta = Math.abs(liveOutput.parsedValue - shadowOutput.parsedValue);
        const deltaPercent = liveOutput.parsedValue > 0
          ? (delta / liveOutput.parsedValue) * 100
          : 0;
        shadowMetrics = {
          parsedValue: shadowOutput.parsedValue,
          itemCount: shadowOutput.includedLineCount,
          excludedCount: shadowOutput.excludedLineCount,
          totalMismatch: shadowOutput.hasTotalMismatch,
          deltaVsLive: delta,
          deltaPercentVsLive: deltaPercent,
          sourceItemCount: itemCount,
        };
      }
    } else {
      liveOutputJson = buildPassthroughOutput(
        input.moduleKey, input.quoteId, rows, documentTotal, itemCount
      );
      liveMetrics = {
        parsedValue: liveOutputJson.parsedValue,
        itemCount,
        excludedCount: 0,
        totalMismatch: false,
        sourceItemCount: itemCount,
        resolvedVia,
        passthrough: true,
      };

      if (input.mode === 'live_vs_shadow') {
        shadowOutputJson = {
          ...liveOutputJson,
          parserVersion: 'passthrough-shadow-v1',
          note: `Shadow passthrough snapshot for ${input.moduleKey}`,
        };
        shadowMetrics = {
          ...liveMetrics,
          deltaVsLive: 0,
          deltaPercentVsLive: 0,
        };
      }
    }

    const resultRows: {
      shadow_run_id: string;
      result_type: string;
      output_json: Record<string, unknown>;
      metrics_json: Record<string, unknown>;
    }[] = [
      {
        shadow_run_id: runId,
        result_type: 'live',
        output_json: liveOutputJson,
        metrics_json: liveMetrics,
      },
    ];

    if (shadowOutputJson && shadowMetrics) {
      resultRows.push({
        shadow_run_id: runId,
        result_type: 'shadow',
        output_json: shadowOutputJson,
        metrics_json: shadowMetrics,
      });
    }

    const { error: resultsErr } = await supabase
      .from('shadow_run_results')
      .insert(resultRows);

    if (resultsErr) throw new Error(resultsErr.message);

    await supabase
      .from('shadow_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    const resolvedDataset: ResolvedDataset = {
      quoteId: input.quoteId,
      supplierName,
      documentTotal,
      parsedTotal: documentTotal,
      itemCount,
      lineItems: rows.map((r) => ({
        description: r.description,
        qty: r.qty,
        unit: r.unit,
        rate: r.rate,
        total: r.total,
      })),
      resolvedVia,
      trade: TRADE_MODULES[input.moduleKey]?.trade_category ?? null,
    };

    Promise.allSettled([
      buildAndSaveDiagnostics({
        runId,
        dataset: resolvedDataset,
        moduleKey: input.moduleKey,
        liveOutputJson,
        shadowOutputJson,
      }),
      resolveDocumentTruth(runId, liveOutputJson, resolvedDataset),
    ]).then(async ([diagResult]) => {
      if (diagResult.status === 'fulfilled') {
        const diagnostics = diagResult.value;
        await classifyAndSaveFailures(
          runId,
          resolvedDataset,
          liveOutputJson,
          shadowOutputJson,
          diagnostics,
        ).catch(() => {});
      }
    }).catch(() => {});

    return { runId, status: 'completed' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('shadow_runs')
      .update({
        status: 'failed',
        error_message: msg,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    return { runId, status: 'failed', error: msg };
  }
}

export interface QuoteOption {
  id: string;
  supplierName: string | null;
  totalPrice: number | null;
  trade: string | null;
  parseStatus: string | null;
  itemCount: number;
  hasItems: boolean;
}

export async function fetchPlumbingQuotes(limit = 80, includeEmpty = false): Promise<QuoteOption[]> {
  return fetchQuotesByTrade('plumbing', limit, includeEmpty);
}

export async function fetchQuotesByTrade(trade: string, limit = 80, includeEmpty = false): Promise<QuoteOption[]> {
  let query = supabase
    .from('quotes')
    .select('id, supplier_name, total_price, trade, parse_status, inserted_items_count, line_item_count, final_items_count')
    .eq('trade', trade)
    .eq('parse_status', 'success')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!includeEmpty) {
    query = query.or('inserted_items_count.gt.0,line_item_count.gt.0');
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((q) => {
    const itemCount =
      (q.inserted_items_count ?? 0) > 0 ? (q.inserted_items_count as number) :
      (q.line_item_count ?? 0) > 0 ? (q.line_item_count as number) :
      (q.final_items_count ?? 0) as number;

    return {
      id: q.id,
      supplierName: q.supplier_name ?? null,
      totalPrice: q.total_price ?? null,
      trade: q.trade ?? null,
      parseStatus: q.parse_status ?? null,
      itemCount,
      hasItems: itemCount > 0,
    };
  });
}
