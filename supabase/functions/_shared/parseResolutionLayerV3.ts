// =============================================================================
// PARSE RESOLUTION LAYER  (v3 architecture)
//
// Runs after any specialized parser.
// Responsibilities:
//   - Separate base scope vs optional scope
//   - Identify exclusions (by others, zero-value, informational)
//   - Determine authoritative total source
//   - Validate mismatch between summary and rows
//   - Attach confidence score
//   - Produce normalized output for saving
// =============================================================================

import type { DocumentClass, ClassificationResult } from './documentClassifier.ts';

// ---------------------------------------------------------------------------
// Shared item type — all parsers produce this shape
// ---------------------------------------------------------------------------

export interface ParsedLineItem {
  lineId: string;
  section: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  scopeCategory: 'base' | 'optional';
  pageNum: number;
  confidence: number;
  source: string;
}

// ---------------------------------------------------------------------------
// Raw parser output — each specialized parser returns this
// ---------------------------------------------------------------------------

export interface RawParserOutput {
  parserUsed: string;
  allItems: ParsedLineItem[];
  totals: {
    grandTotal: number;
    optionalTotal: number;
    subTotal: number | null;
    rowSum: number;
    source: 'summary_page' | 'row_sum';
  };
  summaryDetected: boolean;
  optionalScopeDetected: boolean;
  parserReasons: string[];
  rawSummary: unknown;
}

// ---------------------------------------------------------------------------
// Normalized resolution output
// ---------------------------------------------------------------------------

export type TotalSource = 'summary_page' | 'row_sum' | 'spreadsheet_total';

export interface ResolvedTotals {
  grandTotal: number;
  optionalTotal: number;
  subTotal: number | null;
  rowSum: number;
  source: TotalSource;
}

export interface ValidationResult {
  rowSum: number;
  summaryTotal: number | null;
  variancePercent: number;
  warnings: string[];
  risk: 'OK' | 'MEDIUM' | 'HIGH';
}

export interface ResolutionOutput {
  documentClass: DocumentClass;
  parserUsed: string;
  baseItems: ParsedLineItem[];
  optionalItems: ParsedLineItem[];
  excludedItems: ParsedLineItem[];
  totals: ResolvedTotals;
  validation: ValidationResult;
  debug: {
    classifierReasons: string[];
    parserReasons: string[];
    confidence: number;
    summaryDetected: boolean;
    optionalScopeDetected: boolean;
    itemCountBase: number;
    itemCountOptional: number;
    itemCountExcluded: number;
  };
}

// ---------------------------------------------------------------------------
// Exclusion rules — generic, no vendor names
// ---------------------------------------------------------------------------

const EXCLUSION_PATTERNS: RegExp[] = [
  /\bby\s+others\b/i,
  /\bnot\s+in\s+contract\b/i,
  /\bn\.?i\.?c\.?\b/i,
  /\bnot\s+part\s+of\s+(passive\s+fire|this\s+contract|scope)\b/i,
  /services\s+identified\s+not\s+part/i,
];

function isExcluded(item: ParsedLineItem): boolean {
  if (item.total === 0 && item.description.trim().length === 0) return true;
  return EXCLUSION_PATTERNS.some(re => re.test(item.description));
}

// ---------------------------------------------------------------------------
// Deduplication — exact match on (description + qty + rate + total)
// ---------------------------------------------------------------------------

function deduplicateItems(items: ParsedLineItem[]): { deduped: ParsedLineItem[]; removed: number } {
  const seen = new Set<string>();
  const deduped: ParsedLineItem[] = [];
  let removed = 0;
  for (const item of items) {
    const key = [
      item.description.toLowerCase().replace(/\s+/g, ' ').trim(),
      item.qty.toFixed(4),
      item.rate.toFixed(4),
      item.total.toFixed(2),
    ].join('|');
    if (seen.has(key)) {
      removed++;
    } else {
      seen.add(key);
      deduped.push(item);
    }
  }
  return { deduped, removed };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(
  rowSum: number,
  summaryTotal: number | null,
  parserOutput: RawParserOutput,
): ValidationResult {
  const warnings: string[] = [];
  let risk: 'OK' | 'MEDIUM' | 'HIGH' = 'OK';
  let variancePercent = 0;

  if (summaryTotal !== null && summaryTotal > 0 && rowSum > 0) {
    const diff = Math.abs(summaryTotal - rowSum);
    variancePercent = (diff / summaryTotal) * 100;

    if (variancePercent > 15) {
      risk = 'HIGH';
      warnings.push(
        `Row sum $${rowSum.toFixed(2)} differs from summary $${summaryTotal.toFixed(2)} by ${variancePercent.toFixed(1)}% — rows used for itemization only`,
      );
    } else if (variancePercent > 2) {
      risk = 'MEDIUM';
      warnings.push(
        `Minor variance: row sum $${rowSum.toFixed(2)} vs summary $${summaryTotal.toFixed(2)} (${variancePercent.toFixed(1)}%)`,
      );
    }
  }

  if (!parserOutput.summaryDetected && rowSum === 0) {
    risk = 'HIGH';
    warnings.push('No summary total and no parseable rows — empty result');
  }

  return {
    rowSum,
    summaryTotal,
    variancePercent,
    warnings,
    risk,
  };
}

// ---------------------------------------------------------------------------
// Main resolution function
// ---------------------------------------------------------------------------

export function runResolutionLayer(
  parserOutput: RawParserOutput,
  classification: ClassificationResult,
): ResolutionOutput {
  const { allItems, totals, parserUsed, parserReasons, summaryDetected, optionalScopeDetected } = parserOutput;

  // Step 1: Separate excluded items
  const excludedRaw = allItems.filter(isExcluded);
  const scopeItems = allItems.filter(item => !isExcluded(item));

  // Step 2: Separate base vs optional
  const baseRaw = scopeItems.filter(i => i.scopeCategory === 'base');
  const optionalRaw = scopeItems.filter(i => i.scopeCategory === 'optional');

  // Step 3: Deduplicate each group independently
  const { deduped: baseItems, removed: baseDups } = deduplicateItems(baseRaw);
  const { deduped: optionalItems, removed: optDups } = deduplicateItems(optionalRaw);

  const totalDupsRemoved = baseDups + optDups;
  const rowSum = baseItems.reduce((s, i) => s + i.total, 0);

  // Step 4: Determine canonical totals
  // SOURCE PRIORITY:
  //   A) summary_page (from parser) — highest trust
  //   B) spreadsheet_total — structural, also high trust
  //   C) row_sum — derived, lower trust
  const canonicalGrandTotal = totals.grandTotal > 0 ? totals.grandTotal : rowSum;
  const canonicalOptionalTotal = totals.optionalTotal > 0 ? totals.optionalTotal : optionalItems.reduce((s, i) => s + i.total, 0);

  const resolvedSource: TotalSource =
    totals.source === 'summary_page' ? 'summary_page'
    : parserOutput.parserUsed === 'parseSpreadsheetBoq' ? 'spreadsheet_total'
    : 'row_sum';

  // Step 5: Validate
  const summaryTotal = summaryDetected ? totals.grandTotal : null;
  const validation = validate(rowSum, summaryTotal, parserOutput);

  if (totalDupsRemoved > 0) {
    validation.warnings.push(`${totalDupsRemoved} duplicate item(s) removed`);
  }

  return {
    documentClass: classification.documentClass,
    parserUsed,
    baseItems,
    optionalItems,
    excludedItems: excludedRaw,
    totals: {
      grandTotal: canonicalGrandTotal,
      optionalTotal: canonicalOptionalTotal,
      subTotal: totals.subTotal,
      rowSum,
      source: resolvedSource,
    },
    validation,
    debug: {
      classifierReasons: classification.reasons,
      parserReasons,
      confidence: classification.confidence,
      summaryDetected,
      optionalScopeDetected,
      itemCountBase: baseItems.length,
      itemCountOptional: optionalItems.length,
      itemCountExcluded: excludedRaw.length,
    },
  };
}
