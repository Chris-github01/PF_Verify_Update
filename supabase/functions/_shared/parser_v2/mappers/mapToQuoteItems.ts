/**
 * mapToQuoteItems — shapes parser_v2 line items into the existing
 * `quote_items` row shape (compatible with legacy parser output).
 *
 * Instrumented:
 *   - Accepts field aliases as a safety net at the mapper boundary
 *     (qty/quantity, unitPrice/unit_price/rate, total/total_price/amount,
 *     description/desc).
 *   - Logs input count vs output count. If the input has rows but the
 *     output is empty, logs a clear warning so downstream can surface
 *     `mapping_dropped_all_rows` on that boundary.
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

type LooseItem = ParsedLineItemV2 & {
  desc?: string;
  qty?: number | null;
  rate?: number | null;
  unitPrice?: number | null;
  total?: number | null;
  amount?: number | null;
  uom?: string | null;
};

function pickNumber(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickString(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s.length > 0) return s;
  }
  return null;
}

export function mapToQuoteItems(ctx: {
  items: ParsedLineItemV2[];
}): QuoteItemsRow[] {
  const input = ctx.items ?? [];
  const output: QuoteItemsRow[] = [];

  input.forEach((raw, idx) => {
    const it = raw as LooseItem;
    const description = pickString(it.description, it.desc) ?? "";
    const quantity = pickNumber(it.quantity, it.qty);
    const unit_price = pickNumber(it.unit_price, it.unitPrice, it.rate);
    const total_price = pickNumber(it.total_price, it.total, it.amount);
    const unit = pickString(it.unit, it.uom);

    if (!description && quantity == null && unit_price == null && total_price == null) {
      console.warn(
        `[mapToQuoteItems] row_${idx} dropped: no description and no numeric fields`,
      );
      return;
    }

    output.push({
      item_number: it.item_number ?? String(idx + 1),
      description,
      quantity,
      unit,
      unit_price,
      total_price,
      scope_category: it.scope_category,
      trade: it.trade,
      sub_scope: it.sub_scope,
      frr: it.frr,
      source: it.source,
      confidence: it.confidence,
      parser_version: "v2",
    });
  });

  console.log(
    `[mapToQuoteItems] input_count=${input.length} output_count=${output.length}`,
  );
  if (input.length > 0 && output.length === 0) {
    console.error(
      `[mapToQuoteItems] mapping_dropped_all_rows input_count=${input.length} output_count=0`,
    );
  }

  return output;
}
