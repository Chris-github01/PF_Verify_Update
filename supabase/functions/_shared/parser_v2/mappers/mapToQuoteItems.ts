/**
 * mapToQuoteItems — shapes parser_v2 line items into the existing
 * `quote_items` row shape (compatible with legacy parser output).
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";

export type QuoteItemsRow = {
  item_number: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  scope_category: "main" | "optional" | "excluded";
  trade: string;
  sub_scope: string | null;
  frr: string | null;
  source: string;
  confidence: number;
  parser_version: string;
};

export function mapToQuoteItems(ctx: {
  items: ParsedLineItemV2[];
}): QuoteItemsRow[] {
  return ctx.items.map((it, idx) => ({
    item_number: it.item_number ?? String(idx + 1),
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unit_price: it.unit_price,
    total_price: it.total_price,
    scope_category: it.scope_category,
    trade: it.trade,
    sub_scope: it.sub_scope,
    frr: it.frr,
    source: it.source,
    confidence: it.confidence,
    parser_version: "v2",
  }));
}
