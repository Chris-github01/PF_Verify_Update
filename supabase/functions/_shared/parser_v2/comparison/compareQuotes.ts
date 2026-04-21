/**
 * compareQuotes — line-level fuzzy reconciliation across N supplier quotes
 * for the same trade & project. Produces a unified schedule with per-supplier
 * pricing columns suitable for award reports.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";

export type SupplierQuote = {
  supplier: string;
  items: ParsedLineItemV2[];
  main_total: number;
  optional_total: number;
  grand_total: number;
};

export type ComparisonRow = {
  canonical_description: string;
  quantity: number | null;
  unit: string | null;
  prices: Record<string, number | null>;
  suppliers_covering: number;
  median_rate: number | null;
  lowest_rate: number | null;
  highest_rate: number | null;
  variance_pct: number | null;
};

export type ComparisonResult = {
  rows: ComparisonRow[];
  totals: Record<string, { main: number; optional: number; grand: number }>;
  suppliers: string[];
};

export function compareQuotes(quotes: SupplierQuote[]): ComparisonResult {
  const suppliers = quotes.map((q) => q.supplier);
  const totals: ComparisonResult["totals"] = {};
  for (const q of quotes) {
    totals[q.supplier] = { main: q.main_total, optional: q.optional_total, grand: q.grand_total };
  }

  const buckets = new Map<string, { desc: string; qty: number | null; unit: string | null; prices: Record<string, number | null> }>();

  for (const q of quotes) {
    for (const item of q.items) {
      if (item.scope_category !== "main") continue;
      const key = canonicalKey(item);
      const existing = buckets.get(key);
      const rate = item.unit_price ?? (item.total_price != null && item.quantity ? item.total_price / item.quantity : null);
      if (existing) {
        existing.prices[q.supplier] = rate;
      } else {
        buckets.set(key, {
          desc: item.description,
          qty: item.quantity,
          unit: item.unit,
          prices: { [q.supplier]: rate },
        });
      }
    }
  }

  const rows: ComparisonRow[] = [];
  for (const b of buckets.values()) {
    const rateVals = Object.values(b.prices).filter((v): v is number => v != null);
    const sorted = [...rateVals].sort((a, b) => a - b);
    const median = sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)];
    const lowest = sorted[0] ?? null;
    const highest = sorted[sorted.length - 1] ?? null;
    const variance = lowest != null && highest != null && lowest > 0
      ? ((highest - lowest) / lowest) * 100
      : null;

    const prices: Record<string, number | null> = {};
    for (const s of suppliers) prices[s] = b.prices[s] ?? null;

    rows.push({
      canonical_description: b.desc,
      quantity: b.qty,
      unit: b.unit,
      prices,
      suppliers_covering: rateVals.length,
      median_rate: median,
      lowest_rate: lowest,
      highest_rate: highest,
      variance_pct: variance,
    });
  }

  rows.sort((a, b) => b.suppliers_covering - a.suppliers_covering);

  return { rows, totals, suppliers };
}

function canonicalKey(item: ParsedLineItemV2): string {
  const desc = item.description.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const shortDesc = desc.split(" ").slice(0, 6).join(" ");
  const qtyKey = item.quantity != null ? Math.round(item.quantity * 100) : "x";
  const unitKey = (item.unit ?? "").toLowerCase();
  return `${shortDesc}|${qtyKey}|${unitKey}`;
}
