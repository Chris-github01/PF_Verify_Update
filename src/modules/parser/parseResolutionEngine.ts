export interface RawParsedRow {
  description: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  total_price?: number | null;
  source?: string;
  [key: string]: unknown;
}

export interface ParsedData {
  rows: RawParsedRow[];
}

export interface SummaryTotals {
  grandTotal: number | null;
  subTotal: number | null;
  blockTotals: { label: string; value: number }[];
}

export interface ClassifiedData {
  summaryTotals: SummaryTotals;
  lineItems: RawParsedRow[];
  optionalItems: RawParsedRow[];
}

export interface ResolvedTotal {
  source: 'summary_grand_total' | 'summary_sub_total' | 'line_items_sum';
  value: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ResolutionWarning {
  type: 'systemic_miss' | 'summary_line_mismatch' | 'duplicate_rows_removed';
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
}

export interface ResolutionDebug {
  totalExtracted: number;
  totalUsed: number;
  excludedCount: number;
  excludedValue: number;
  duplicatesRemoved: number;
  resolutionSource: 'summary' | 'line_items';
  resolvedTotal: ResolvedTotal;
  warnings: ResolutionWarning[];
}

export interface ResolutionResult {
  validLineItems: RawParsedRow[];
  optionalItems: RawParsedRow[];
  resolvedTotal: ResolvedTotal;
  debug: ResolutionDebug;
}

const OPTIONAL_KEYWORDS = [
  'OPTIONAL',
  'ADD TO SCOPE',
  'PROVISIONAL',
  'NOT PART OF PASSIVE FIRE',
  'BY OTHERS',
  'EXCLUDED',
  'EXCLUSION',
  'PC SUM',
  'PRIME COST',
];

const SUMMARY_KEYWORDS = [
  'GRAND TOTAL',
  'TOTAL PRICE',
  'CONTRACT TOTAL',
  'TOTAL EX GST',
  'TOTAL EX. GST',
  'TOTAL EXCLUDING GST',
  'LUMP SUM TOTAL',
  'TOTAL LUMP SUM',
  'TOTAL VALUE',
  'NET TOTAL',
  'SUBTOTAL',
  'SUB TOTAL',
  'SUB-TOTAL',
];

const SUB_TOTAL_KEYWORDS = [
  'SUBTOTAL',
  'SUB TOTAL',
  'SUB-TOTAL',
  'SECTION TOTAL',
  'TRADE TOTAL',
];

const BLOCK_LABEL_PATTERN = /\b(BLOCK|LEVEL|ZONE|STAGE|BUILDING|AREA|LOT)\s+[A-Z0-9]{1,5}\b/i;

function normaliseDescription(desc: string): string {
  return desc.trim().toUpperCase().replace(/\s+/g, ' ');
}

function isOptionalItem(row: RawParsedRow): boolean {
  const text = normaliseDescription(row.description ?? '');
  return OPTIONAL_KEYWORDS.some(kw => text.includes(kw));
}

function isSummaryRow(row: RawParsedRow): boolean {
  const text = normaliseDescription(row.description ?? '');
  return SUMMARY_KEYWORDS.some(kw => text.includes(kw));
}

function isSubTotalRow(row: RawParsedRow): boolean {
  const text = normaliseDescription(row.description ?? '');
  return SUB_TOTAL_KEYWORDS.some(kw => text.includes(kw));
}

function isGrandTotalRow(row: RawParsedRow): boolean {
  const text = normaliseDescription(row.description ?? '');
  const grandKws = [
    'GRAND TOTAL',
    'TOTAL PRICE',
    'CONTRACT TOTAL',
    'TOTAL EX GST',
    'TOTAL EX. GST',
    'TOTAL EXCLUDING GST',
    'LUMP SUM TOTAL',
    'TOTAL LUMP SUM',
    'TOTAL VALUE',
    'NET TOTAL',
  ];
  return grandKws.some(kw => text.includes(kw));
}

function isBlockTotalRow(row: RawParsedRow): boolean {
  const text = normaliseDescription(row.description ?? '');
  return BLOCK_LABEL_PATTERN.test(text) && isSubTotalRow(row);
}

function rowValue(row: RawParsedRow): number {
  return Number(row.total_price ?? 0);
}

export function classifyParsedData(rows: RawParsedRow[]): ClassifiedData {
  const summaryTotals: SummaryTotals = {
    grandTotal: null,
    subTotal: null,
    blockTotals: [],
  };
  const lineItems: RawParsedRow[] = [];
  const optionalItems: RawParsedRow[] = [];

  for (const row of rows) {
    const val = rowValue(row);

    if (isOptionalItem(row)) {
      optionalItems.push(row);
      continue;
    }

    if (isGrandTotalRow(row)) {
      if (summaryTotals.grandTotal === null || val > summaryTotals.grandTotal) {
        summaryTotals.grandTotal = val;
      }
      continue;
    }

    if (isBlockTotalRow(row)) {
      const text = normaliseDescription(row.description ?? '');
      const match = text.match(BLOCK_LABEL_PATTERN);
      summaryTotals.blockTotals.push({ label: match ? match[0] : text, value: val });
      continue;
    }

    if (isSubTotalRow(row)) {
      if (summaryTotals.subTotal === null || val > summaryTotals.subTotal) {
        summaryTotals.subTotal = val;
      }
      continue;
    }

    if (isSummaryRow(row)) {
      continue;
    }

    lineItems.push(row);
  }

  return { summaryTotals, lineItems, optionalItems };
}

function deduplicateRows(rows: RawParsedRow[]): { deduped: RawParsedRow[]; removed: number } {
  const seen = new Set<string>();
  const deduped: RawParsedRow[] = [];
  let removed = 0;

  for (const row of rows) {
    const key = [
      normaliseDescription(row.description ?? ''),
      String(Number(row.quantity ?? 0).toFixed(4)),
      String(Number(row.unit_price ?? 0).toFixed(4)),
      String(Number(row.total_price ?? 0).toFixed(4)),
    ].join('|');

    if (seen.has(key)) {
      removed++;
    } else {
      seen.add(key);
      deduped.push(row);
    }
  }

  return { deduped, removed };
}

export function isValidLineItem(row: RawParsedRow): boolean {
  return !isOptionalItem(row) && !isSummaryRow(row);
}

function sumValidLineItems(rows: RawParsedRow[]): number {
  return rows.reduce((sum, r) => sum + rowValue(r), 0);
}

export function resolveFinalTotal(classified: ClassifiedData): ResolvedTotal {
  if (classified.summaryTotals.grandTotal !== null && classified.summaryTotals.grandTotal > 0) {
    return {
      source: 'summary_grand_total',
      value: classified.summaryTotals.grandTotal,
      confidence: 'HIGH',
    };
  }

  if (classified.summaryTotals.subTotal !== null && classified.summaryTotals.subTotal > 0) {
    return {
      source: 'summary_sub_total',
      value: classified.summaryTotals.subTotal,
      confidence: 'MEDIUM',
    };
  }

  return {
    source: 'line_items_sum',
    value: sumValidLineItems(classified.lineItems),
    confidence: 'LOW',
  };
}

export function runParseResolution(rows: RawParsedRow[]): ResolutionResult {
  const warnings: ResolutionWarning[] = [];

  const classified = classifyParsedData(rows);
  const { deduped, removed } = deduplicateRows(classified.lineItems);

  if (removed > 0) {
    warnings.push({
      type: 'duplicate_rows_removed',
      risk: 'MEDIUM',
      message: `${removed} duplicate row${removed === 1 ? '' : 's'} removed before summing`,
    });
  }

  const dedupedClassified: ClassifiedData = {
    ...classified,
    lineItems: deduped,
  };

  const resolvedTotal = resolveFinalTotal(dedupedClassified);

  const lineItemSum = sumValidLineItems(deduped);
  const optionalValue = classified.optionalItems.reduce((s, r) => s + rowValue(r), 0);

  if (
    resolvedTotal.source !== 'line_items_sum' &&
    lineItemSum > 0
  ) {
    const diff = Math.abs(resolvedTotal.value - lineItemSum);
    const pct = resolvedTotal.value > 0 ? diff / resolvedTotal.value : 0;

    if (pct > 0.02) {
      const direction = resolvedTotal.value > lineItemSum ? 'above' : 'below';
      warnings.push({
        type: 'systemic_miss',
        risk: 'HIGH',
        message: `Mismatch between summary (${resolvedTotal.value.toFixed(2)}) and line item sum (${lineItemSum.toFixed(2)}) — ${(pct * 100).toFixed(1)}% ${direction}`,
      });
    }

    if (pct > 0.001) {
      warnings.push({
        type: 'summary_line_mismatch',
        risk: pct > 0.05 ? 'HIGH' : 'MEDIUM',
        message: `Summary total differs from line items by ${(pct * 100).toFixed(2)}%`,
      });
    }
  }

  const totalExtracted = rows.length;
  const totalUsed = deduped.length;
  const excludedCount = classified.optionalItems.length + removed + (rows.length - classified.lineItems.length - classified.optionalItems.length);

  const debug: ResolutionDebug = {
    totalExtracted,
    totalUsed,
    excludedCount,
    excludedValue: optionalValue,
    duplicatesRemoved: removed,
    resolutionSource: resolvedTotal.source === 'line_items_sum' ? 'line_items' : 'summary',
    resolvedTotal,
    warnings,
  };

  return {
    validLineItems: deduped,
    optionalItems: classified.optionalItems,
    resolvedTotal,
    debug,
  };
}
