import { supabase } from '../supabase';
import { runLiveParser } from '../modules/parsers/plumbing/live';
import { runShadowParser } from '../modules/parsers/plumbing/shadow';
import { LIVE_PARSER_VERSION, SHADOW_PARSER_VERSION } from '../modules/parsers/plumbing/shared';
import type { PlumbingSourceRow, PlumbingParserOutput } from '../modules/parsers/plumbing/types';
import type { RunMode } from '../../types/shadow';

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

async function fetchQuoteRows(quoteId: string): Promise<{
  rows: PlumbingSourceRow[];
  documentTotal: number | null;
  supplierName: string | null;
  sourceLabel: string;
  itemCount: number;
}> {
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('id, supplier_name, document_total, total_price')
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

  return {
    rows,
    documentTotal: quote.document_total ?? quote.total_price ?? null,
    supplierName: quote.supplier_name ?? null,
    sourceLabel: `${quote.supplier_name ?? 'Quote'} (${quoteId.slice(0, 8)})`,
    itemCount: rows.length,
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

export async function runShadowComparison(
  input: RunShadowComparisonInput
): Promise<RunShadowComparisonResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: runRecord, error: insertErr } = await supabase
    .from('shadow_runs')
    .insert({
      module_key: input.moduleKey,
      source_type: 'quote',
      source_id: input.quoteId,
      initiated_by: user.id,
      run_mode: input.mode,
      status: 'running',
      live_version: LIVE_PARSER_VERSION,
      shadow_version: SHADOW_PARSER_VERSION,
      started_at: new Date().toISOString(),
      metadata_json: { triggered_from: 'shadow_compare_ui' },
    })
    .select('id')
    .single();

  if (insertErr) throw new Error(insertErr.message);
  const runId = runRecord.id as string;

  try {
    const { rows, documentTotal, supplierName, sourceLabel, itemCount } = await fetchQuoteRows(input.quoteId);

    if (itemCount === 0) {
      throw new Error('Quote has no parsed line items. Import and parse the quote first.');
    }

    const parserInput = {
      sourceType: 'quote' as const,
      sourceId: input.quoteId,
      rows,
      documentTotal,
      supplierName,
    };

    const liveOutput = runLiveParser(parserInput);

    let shadowOutput: PlumbingParserOutput | null = null;
    if (input.mode === 'live_vs_shadow') {
      shadowOutput = runShadowParser(parserInput);
    }

    await supabase
      .from('shadow_runs')
      .update({ source_label: sourceLabel })
      .eq('id', runId);

    const resultRows = [
      {
        shadow_run_id: runId,
        result_type: 'live',
        output_json: buildRunOutput(liveOutput),
        metrics_json: {
          parsedValue: liveOutput.parsedValue,
          itemCount: liveOutput.includedLineCount,
          excludedCount: liveOutput.excludedLineCount,
          totalMismatch: liveOutput.hasTotalMismatch,
          sourceItemCount: itemCount,
        },
      },
    ];

    if (shadowOutput) {
      const delta = Math.abs(liveOutput.parsedValue - shadowOutput.parsedValue);
      const deltaPercent = liveOutput.parsedValue > 0
        ? (delta / liveOutput.parsedValue) * 100
        : 0;

      resultRows.push({
        shadow_run_id: runId,
        result_type: 'shadow',
        output_json: buildRunOutput(shadowOutput),
        metrics_json: {
          parsedValue: shadowOutput.parsedValue,
          itemCount: shadowOutput.includedLineCount,
          excludedCount: shadowOutput.excludedLineCount,
          totalMismatch: shadowOutput.hasTotalMismatch,
          deltaVsLive: delta,
          deltaPercentVsLive: deltaPercent,
          sourceItemCount: itemCount,
        },
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
