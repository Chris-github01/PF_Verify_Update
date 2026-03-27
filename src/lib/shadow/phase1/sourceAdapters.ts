import { supabase } from '../../supabase';
import type { SourceAdapterKey } from './shadowModuleRegistry';

export interface ResolvedDataset {
  datasetId: string;
  moduleKey: string | null;
  quoteId: string;
  supplierName: string | null;
  documentTotal: number | null;
  parsedTotal: number | null;
  itemCount: number;
  lineItems: ResolvedLineItem[];
  resolvedVia: string;
  trade: string | null;
  documentText: string | null;
  rawSource: Record<string, unknown> | null;
}

export interface ResolvedLineItem {
  description: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
}

async function resolveQuoteItems(quoteId: string): Promise<{
  lineItems: ResolvedLineItem[];
  itemCount: number;
  resolvedVia: string;
}> {
  const { data: items, error } = await supabase
    .from('quote_items')
    .select('description, raw_description, quantity, unit, unit_price, total_price')
    .eq('quote_id', quoteId)
    .order('created_at');

  if (error) throw new Error(`[sourceAdapters] quote_items fetch failed: ${error.message}`);

  const lineItems: ResolvedLineItem[] = (items ?? []).map((item) => ({
    description: item.description ?? item.raw_description ?? null,
    qty: item.quantity ?? null,
    unit: item.unit ?? null,
    rate: item.unit_price ?? null,
    total: item.total_price ?? null,
  }));

  return {
    lineItems,
    itemCount: lineItems.length,
    resolvedVia: lineItems.length > 0 ? 'quote_items' : 'quote_items_empty',
  };
}

async function resolveQuoteMeta(quoteId: string): Promise<{
  supplierName: string | null;
  documentTotal: number | null;
  parsedTotal: number | null;
  metaItemCount: number;
  trade: string | null;
}> {
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('supplier_name, document_total, total_price, inserted_items_count, line_item_count, final_items_count, trade')
    .eq('id', quoteId)
    .maybeSingle();

  if (error) throw new Error(`[sourceAdapters] quotes fetch failed: ${error.message}`);
  if (!quote) throw new Error(`[sourceAdapters] Quote not found: ${quoteId}`);

  const metaItemCount =
    (quote.inserted_items_count ?? 0) > 0 ? (quote.inserted_items_count as number) :
    (quote.line_item_count ?? 0) > 0 ? (quote.line_item_count as number) :
    (quote.final_items_count ?? 0) as number;

  return {
    supplierName: quote.supplier_name ?? null,
    documentTotal: quote.document_total ?? quote.total_price ?? null,
    parsedTotal: quote.total_price ?? null,
    metaItemCount,
    trade: quote.trade ?? null,
  };
}

function validateDataset(dataset: ResolvedDataset, adapterKey: SourceAdapterKey): void {
  if (!Array.isArray(dataset.lineItems)) {
    throw new Error(
      `[${adapterKey}] Adapter returned non-array lineItems for quote ${dataset.quoteId}`,
    );
  }
}

async function plumbingQuoteAdapter(quoteId: string): Promise<ResolvedDataset> {
  const [meta, items] = await Promise.all([
    resolveQuoteMeta(quoteId),
    resolveQuoteItems(quoteId),
  ]);

  const finalItemCount = items.itemCount > 0 ? items.itemCount : meta.metaItemCount;

  const dataset: ResolvedDataset = {
    datasetId: quoteId,
    moduleKey: 'plumbing_parser',
    quoteId,
    supplierName: meta.supplierName,
    documentTotal: meta.documentTotal,
    parsedTotal: meta.parsedTotal,
    itemCount: finalItemCount,
    lineItems: items.lineItems,
    resolvedVia: items.resolvedVia,
    trade: meta.trade,
    documentText: null,
    rawSource: null,
  };

  validateDataset(dataset, 'plumbing_quote_adapter');
  return dataset;
}

async function passiveFireQuoteAdapter(quoteId: string): Promise<ResolvedDataset> {
  const [meta, items] = await Promise.all([
    resolveQuoteMeta(quoteId),
    resolveQuoteItems(quoteId),
  ]);

  const finalItemCount = items.itemCount > 0 ? items.itemCount : meta.metaItemCount;

  if (finalItemCount === 0) {
    throw new Error(
      `[passive_fire_quote_adapter] Quote ${quoteId.slice(0, 8)} resolved 0 items. ` +
      `Ensure the quote was parsed successfully before running shadow comparison.`,
    );
  }

  const dataset: ResolvedDataset = {
    datasetId: quoteId,
    moduleKey: 'passive_fire_parser',
    quoteId,
    supplierName: meta.supplierName,
    documentTotal: meta.documentTotal,
    parsedTotal: meta.parsedTotal,
    itemCount: finalItemCount,
    lineItems: items.lineItems,
    resolvedVia: items.itemCount > 0 ? 'quote_items' : 'meta_count_fallback',
    trade: meta.trade,
    documentText: null,
    rawSource: null,
  };

  validateDataset(dataset, 'passive_fire_quote_adapter');
  return dataset;
}

async function genericQuoteAdapter(quoteId: string): Promise<ResolvedDataset> {
  const [meta, items] = await Promise.all([
    resolveQuoteMeta(quoteId),
    resolveQuoteItems(quoteId),
  ]);

  const dataset: ResolvedDataset = {
    datasetId: quoteId,
    moduleKey: null,
    quoteId,
    supplierName: meta.supplierName,
    documentTotal: meta.documentTotal,
    parsedTotal: meta.parsedTotal,
    itemCount: items.itemCount > 0 ? items.itemCount : meta.metaItemCount,
    lineItems: items.lineItems,
    resolvedVia: items.resolvedVia,
    trade: meta.trade,
    documentText: null,
    rawSource: null,
  };

  validateDataset(dataset, 'generic_quote_adapter');
  return dataset;
}

export async function resolveDataset(
  adapterKey: SourceAdapterKey,
  quoteId: string,
): Promise<ResolvedDataset> {
  if (!quoteId) {
    throw new Error(`[sourceAdapters] Cannot resolve dataset: quoteId is required`);
  }

  switch (adapterKey) {
    case 'plumbing_quote_adapter':
      return plumbingQuoteAdapter(quoteId);
    case 'passive_fire_quote_adapter':
      return passiveFireQuoteAdapter(quoteId);
    case 'generic_quote_adapter':
      return genericQuoteAdapter(quoteId);
    default: {
      const _exhaustive: never = adapterKey;
      throw new Error(`[sourceAdapters] Unknown adapter key: ${_exhaustive}`);
    }
  }
}
