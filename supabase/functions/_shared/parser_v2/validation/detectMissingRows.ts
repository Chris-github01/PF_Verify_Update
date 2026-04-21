/**
 * detectMissingRows — scans raw text for patterns that look like line items
 * but did not make it into the extracted output. Reports heuristic gaps.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";
import type { QuoteType } from "../classifiers/classifyQuoteType.ts";

const NUMBERED_ROW_RE = /^\s*(\d{1,3})[.)\s]+(.{5,120}?)\s{2,}\$?([\d,]+\.\d{2})\s*$/;

export type MissingRowsResult = {
  missing: string[];
  anomalies: string[];
};

export function detectMissingRows(
  items: ParsedLineItemV2[],
  rawText: string,
  quoteType: QuoteType,
): MissingRowsResult {
  const missing: string[] = [];
  const anomalies: string[] = [];

  if (quoteType === "lump_sum") {
    return { missing, anomalies };
  }

  const have = new Set(
    items.map((i) => i.description.toLowerCase().replace(/\s+/g, " ").trim()),
  );

  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(NUMBERED_ROW_RE);
    if (!m) continue;
    const desc = m[2].toLowerCase().replace(/\s+/g, " ").trim();
    if (!have.has(desc) && !Array.from(have).some((h) => h.includes(desc.slice(0, 20)))) {
      missing.push(m[2].trim());
    }
  }

  if (missing.length > 10) {
    anomalies.push(`high_missing_row_count:${missing.length}`);
  }

  return { missing: missing.slice(0, 30), anomalies };
}
