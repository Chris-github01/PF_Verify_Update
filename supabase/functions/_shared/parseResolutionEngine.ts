/**
 * Parse Resolution Engine — shared Deno-compatible copy
 *
 * Resolves the authoritative total for a parsed quote by:
 *   1. Preferring the Grand Total row extracted from the document (HIGH confidence)
 *   2. Falling back to the largest Sub-Total row (MEDIUM confidence)
 *   3. Finally summing valid line items (LOW confidence)
 *
 * Also removes duplicate rows before summing and flags optional/excluded scope.
 */

export interface RawParsedRow {
  description: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total_price?: number | null;
  [key: string]: unknown;
}

export interface ResolvedTotal {
  source: 'summary_grand_total' | 'summary_sub_total' | 'line_items_sum';
  value: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ResolutionDebug {
  totalExtracted: number;
  totalUsed: number;
  excludedCount: number;
  excludedValue: number;
  duplicatesRemoved: number;
  resolutionSource: 'summary' | 'line_items';
  resolvedTotal: ResolvedTotal;
  warnings: { type: string; risk: string; message: string }[];
}

export interface ResolutionResult {
  validLineItems: RawParsedRow[];
  optionalItems: RawParsedRow[];
  resolvedTotal: ResolvedTotal;
  debug: ResolutionDebug;
}

const OPTIONAL_KEYWORDS = [
  'OPTIONAL', 'ADD TO SCOPE', 'PROVISIONAL', 'NOT PART OF PASSIVE FIRE',
  'BY OTHERS', 'EXCLUDED', 'EXCLUSION', 'PC SUM', 'PRIME COST',
];

const GRAND_TOTAL_KEYWORDS = [
  'GRAND TOTAL', 'TOTAL PRICE', 'CONTRACT TOTAL', 'TOTAL EX GST',
  'TOTAL EX. GST', 'TOTAL EXCLUDING GST', 'LUMP SUM TOTAL',
  'TOTAL LUMP SUM', 'TOTAL VALUE', 'NET TOTAL',
];

const SUB_TOTAL_KEYWORDS = [
  'SUBTOTAL', 'SUB TOTAL', 'SUB-TOTAL', 'SECTION TOTAL', 'TRADE TOTAL',
];

const ALL_SUMMARY_KEYWORDS = [
  ...GRAND_TOTAL_KEYWORDS, ...SUB_TOTAL_KEYWORDS,
];

const BLOCK_LABEL_PATTERN = /\b(BLOCK|LEVEL|ZONE|STAGE|BUILDING|AREA|LOT)\s+[A-Z0-9]{1,5}\b/i;

function norm(desc: string): string {
  return desc.trim().toUpperCase().replace(/\s+/g, ' ');
}

function rowValue(row: RawParsedRow): number {
  return Number(row.total_price ?? 0);
}

function isOptional(row: RawParsedRow): boolean {
  const t = norm(row.description ?? '');
  return OPTIONAL_KEYWORDS.some(kw => t.includes(kw));
}

function isGrandTotal(row: RawParsedRow): boolean {
  const t = norm(row.description ?? '');
  return GRAND_TOTAL_KEYWORDS.some(kw => t.includes(kw));
}

function isSubTotal(row: RawParsedRow): boolean {
  const t = norm(row.description ?? '');
  return SUB_TOTAL_KEYWORDS.some(kw => t.includes(kw));
}

function isBlockTotal(row: RawParsedRow): boolean {
  const t = norm(row.description ?? '');
  return BLOCK_LABEL_PATTERN.test(t) && isSubTotal(row);
}

function isSummary(row: RawParsedRow): boolean {
  const t = norm(row.description ?? '');
  return ALL_SUMMARY_KEYWORDS.some(kw => t.includes(kw));
}

function deduplicate(rows: RawParsedRow[]): { deduped: RawParsedRow[]; removed: number } {
  const seen = new Set<string>();
  const deduped: RawParsedRow[] = [];
  let removed = 0;
  for (const row of rows) {
    const key = [
      norm(row.description ?? ''),
      Number(row.quantity ?? 0).toFixed(4),
      Number(row.unit_price ?? 0).toFixed(4),
      Number(row.total_price ?? 0).toFixed(4),
    ].join('|');
    if (seen.has(key)) { removed++; } else { seen.add(key); deduped.push(row); }
  }
  return { deduped, removed };
}

function sumItems(rows: RawParsedRow[]): number {
  return rows.reduce((s, r) => s + rowValue(r), 0);
}

export function runParseResolution(rows: RawParsedRow[]): ResolutionResult {
  const warnings: { type: string; risk: string; message: string }[] = [];

  let grandTotal: number | null = null;
  let subTotal: number | null = null;
  const lineItems: RawParsedRow[] = [];
  const optionalItems: RawParsedRow[] = [];

  for (const row of rows) {
    const val = rowValue(row);
    if (isOptional(row)) { optionalItems.push(row); continue; }
    if (isGrandTotal(row)) {
      if (grandTotal === null || val > grandTotal) grandTotal = val;
      continue;
    }
    if (isBlockTotal(row)) continue;
    if (isSubTotal(row)) {
      if (subTotal === null || val > subTotal) subTotal = val;
      continue;
    }
    if (isSummary(row)) continue;
    lineItems.push(row);
  }

  const { deduped, removed } = deduplicate(lineItems);

  if (removed > 0) {
    warnings.push({
      type: 'duplicate_rows_removed',
      risk: 'MEDIUM',
      message: `${removed} duplicate row${removed === 1 ? '' : 's'} removed before summing`,
    });
  }

  let resolvedTotal: ResolvedTotal;
  if (grandTotal !== null && grandTotal > 0) {
    resolvedTotal = { source: 'summary_grand_total', value: grandTotal, confidence: 'HIGH' };
  } else if (subTotal !== null && subTotal > 0) {
    resolvedTotal = { source: 'summary_sub_total', value: subTotal, confidence: 'MEDIUM' };
  } else {
    resolvedTotal = { source: 'line_items_sum', value: sumItems(deduped), confidence: 'LOW' };
  }

  const lineItemSum = sumItems(deduped);
  const optionalValue = optionalItems.reduce((s, r) => s + rowValue(r), 0);

  if (resolvedTotal.source !== 'line_items_sum' && lineItemSum > 0) {
    const diff = Math.abs(resolvedTotal.value - lineItemSum);
    const pct = resolvedTotal.value > 0 ? diff / resolvedTotal.value : 0;
    if (pct > 0.02) {
      warnings.push({
        type: 'systemic_miss',
        risk: 'HIGH',
        message: `Mismatch: summary=${resolvedTotal.value.toFixed(2)}, line items=${lineItemSum.toFixed(2)} (${(pct * 100).toFixed(1)}% gap)`,
      });
    }
  }

  const debug: ResolutionDebug = {
    totalExtracted: rows.length,
    totalUsed: deduped.length,
    excludedCount: optionalItems.length + removed + (rows.length - lineItems.length - optionalItems.length),
    excludedValue: optionalValue,
    duplicatesRemoved: removed,
    resolutionSource: resolvedTotal.source === 'line_items_sum' ? 'line_items' : 'summary',
    resolvedTotal,
    warnings,
  };

  return { validLineItems: deduped, optionalItems, resolvedTotal, debug };
}
