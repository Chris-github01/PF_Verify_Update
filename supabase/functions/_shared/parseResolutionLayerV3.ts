// =============================================================================
// PARSE RESOLUTION LAYER  (v3 architecture — final arbitration)
//
// Accepts outputs from:
//   - LLM primary parsers
//   - Regex recovery parsers (parseHybridQuote, parseSimpleLineItemsPdf, …)
//   - Spreadsheet parsers (parseSpreadsheetBoq, excelParser, …)
//
// Responsibilities:
//   1. Normalise incoming parser output to a common shape
//   2. Classify and separate: base scope, optional scope, excluded items
//   3. Deduplicate (exact + fuzzy same-description/total/scope)
//   4. Determine authoritative total using strict priority chain
//   5. Grade variance between row sum and document total
//   6. Produce normalized, caller-ready output
//
// Total priority:
//   1. Trusted document grand total (summary_page / structured_total)
//   2. Trusted document subtotal  (+ qa allowance if present)
//   3. base row sum + optional row sum
//   4. raw row sum only
//
// Returns:
//   {
//     base_items, optional_items, excluded_items,
//     resolved_total, resolution_source, resolution_confidence, warnings
//   }
//   + backward-compat shape (baseItems, totals, validation, debug, …)
// =============================================================================

import type { DocumentClass, ClassificationResult } from './documentClassifier.ts';

// ---------------------------------------------------------------------------
// Core item type — all parsers produce this shape
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
  frr?: string;
}

// ---------------------------------------------------------------------------
// Raw parser output — each specialized parser returns this (or superset)
// ---------------------------------------------------------------------------

export interface RawParserOutput {
  parserUsed: string;
  allItems: ParsedLineItem[];
  totals: {
    grandTotal: number;
    optionalTotal: number;
    subTotal: number | null;
    rowSum: number;
    source: 'summary_page' | 'row_sum' | 'spreadsheet_total' | 'structured_total';
  };
  summaryDetected: boolean;
  optionalScopeDetected: boolean;
  parserReasons: string[];
  rawSummary: unknown;

  // Optional — present on regex_recovery parsers
  confidence?: number;
  warnings?: string[];
  parser_mode?: string;

  // Analytics-only: raw schedule row sum before any total override.
  // Populated by parseSummarySchedulePdf when a document grand total exists.
  // Consumers must NOT use this as the commercial total — use totals.grandTotal.
  derived_items_total?: number;

  // Optional — document-level total fields from extractDocumentTotals
  documentTotals?: {
    grandTotal: number | null;
    subTotal: number | null;
    qaTotal: number | null;
    optionalTotal: number | null;
  };
}

// ---------------------------------------------------------------------------
// Resolution output types
// ---------------------------------------------------------------------------

export type TotalSource =
  | 'document_grand_total'
  | 'document_subtotal'
  | 'summary_page'
  | 'spreadsheet_total'
  | 'structured_total'
  | 'row_sum';

export type VarianceGrade = 'OK' | 'MEDIUM' | 'HIGH';

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
  varianceGrade: VarianceGrade;
  warnings: string[];
  risk: VarianceGrade;
}

/** Standard arbitration output */
export interface ResolutionOutput {
  // Standard shape (new)
  base_items: ParsedLineItem[];
  optional_items: ParsedLineItem[];
  excluded_items: ParsedLineItem[];
  resolved_total: number;
  resolution_source: TotalSource;
  resolution_confidence: number;
  warnings: string[];
  // Analytics-only schedule row sum — only set when a document grand total exists
  // and differs from the row sum. Never use as commercial total.
  derived_items_total?: number;
  optional_scope_total: number;

  // Backward-compat aliases
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
    dupsRemoved: number;
    parserMode: string;
  };
}

// ---------------------------------------------------------------------------
// Exclusion detection — comprehensive inline + section-level
// ---------------------------------------------------------------------------

const EXCLUSION_PATTERNS: RegExp[] = [
  /\bby\s+others\b/i,
  /\bnot\s+in\s+contract\b/i,
  /\bn\.?i\.?c\.?\b/i,
  /\bnot\s+included\b/i,
  /\bnot\s+part\s+of\s+(?:passive\s+fire|this\s+contract|scope|contract)\b/i,
  /\bservices?\s+(?:identified\s+)?not\s+(?:in\s+|part\s+of\s+)?(?:scope|contract)\b/i,
  /\bexcluded\s+from\s+(?:scope|contract)\b/i,
  /\bclient\s+supply\b/i,
  /\bowner[\s-]?supplied\b/i,
];

function isExcluded(item: ParsedLineItem): boolean {
  if (item.total === 0 && item.description.trim().length === 0) return true;
  return EXCLUSION_PATTERNS.some(re => re.test(item.description));
}

// ---------------------------------------------------------------------------
// Deduplication
//
// Two passes:
//   1. Exact: same description + qty + rate + total + scope
//   2. Fuzzy: same normalised description + same total + same scope
//      (catches copy-paste rows where qty/rate differ but value is identical)
// ---------------------------------------------------------------------------

function normaliseDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[\s\-–—_/\\]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

interface DedupeResult {
  deduped: ParsedLineItem[];
  removed: number;
  removedDescriptions: string[];
}

function deduplicateItems(items: ParsedLineItem[]): DedupeResult {
  const exactSeen = new Set<string>();
  const fuzzySeen = new Set<string>();
  const deduped: ParsedLineItem[] = [];
  let removed = 0;
  const removedDescriptions: string[] = [];

  for (const item of items) {
    const normDesc = normaliseDescription(item.description);

    const exactKey = [
      normDesc,
      item.qty.toFixed(4),
      item.rate.toFixed(4),
      item.total.toFixed(2),
      item.scopeCategory,
    ].join('||');

    const fuzzyKey = [
      normDesc,
      item.total.toFixed(2),
      item.scopeCategory,
    ].join('||');

    if (exactSeen.has(exactKey) || fuzzySeen.has(fuzzyKey)) {
      removed++;
      removedDescriptions.push(item.description.slice(0, 60));
    } else {
      exactSeen.add(exactKey);
      fuzzySeen.add(fuzzyKey);
      deduped.push(item);
    }
  }

  return { deduped, removed, removedDescriptions };
}

// ---------------------------------------------------------------------------
// Total priority chain
// ---------------------------------------------------------------------------

interface TotalResolution {
  grandTotal: number;
  source: TotalSource;
}

function resolveTrustedTotal(
  parserTotals: RawParserOutput['totals'],
  documentTotals: RawParserOutput['documentTotals'],
  baseRowSum: number,
  optRowSum: number,
): TotalResolution {
  // Priority 1: trusted document grand total
  if (documentTotals?.grandTotal && documentTotals.grandTotal > 0) {
    return { grandTotal: documentTotals.grandTotal, source: 'document_grand_total' };
  }

  // Priority 2: parser summary_page / structured_total
  if (
    parserTotals.grandTotal > 0 &&
    (parserTotals.source === 'summary_page' || parserTotals.source === 'structured_total')
  ) {
    return { grandTotal: parserTotals.grandTotal, source: 'summary_page' };
  }

  // Priority 3: document subtotal + qa (reconstruction)
  if (documentTotals?.subTotal && documentTotals.subTotal > 0) {
    const reconstructed = documentTotals.subTotal + (documentTotals.qaTotal ?? 0);
    return { grandTotal: reconstructed, source: 'document_subtotal' };
  }

  // Priority 4: parser subtotal field
  if (parserTotals.subTotal && parserTotals.subTotal > 0) {
    return { grandTotal: parserTotals.subTotal, source: 'document_subtotal' };
  }

  // Priority 5: spreadsheet structural total
  if (
    parserTotals.grandTotal > 0 &&
    parserTotals.source === 'spreadsheet_total'
  ) {
    return { grandTotal: parserTotals.grandTotal, source: 'spreadsheet_total' };
  }

  // Priority 6: base + optional row sums
  const combined = baseRowSum + optRowSum;
  if (combined > 0) {
    return { grandTotal: combined, source: 'row_sum' };
  }

  // Priority 7: base row sum only
  return { grandTotal: baseRowSum, source: 'row_sum' };
}

// ---------------------------------------------------------------------------
// Variance grading
// ---------------------------------------------------------------------------

function gradeVariance(variancePct: number): VarianceGrade {
  if (variancePct <= 2) return 'OK';
  if (variancePct <= 10) return 'MEDIUM';
  return 'HIGH';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(
  rowSum: number,
  summaryTotal: number | null,
  parserOutput: RawParserOutput,
  parserWarnings: string[],
): ValidationResult {
  const warnings: string[] = [...parserWarnings];
  let variancePercent = 0;
  let varianceGrade: VarianceGrade = 'OK';

  if (summaryTotal !== null && summaryTotal > 0 && rowSum > 0) {
    const diff = Math.abs(summaryTotal - rowSum);
    variancePercent = (diff / summaryTotal) * 100;
    varianceGrade = gradeVariance(variancePercent);

    if (varianceGrade === 'HIGH') {
      warnings.push(
        `HIGH variance: row sum $${rowSum.toFixed(2)} vs document total $${summaryTotal.toFixed(2)} (${variancePercent.toFixed(1)}%) — itemization may be incomplete`,
      );
    } else if (varianceGrade === 'MEDIUM') {
      warnings.push(
        `MEDIUM variance: row sum $${rowSum.toFixed(2)} vs document total $${summaryTotal.toFixed(2)} (${variancePercent.toFixed(1)}%)`,
      );
    }
  }

  if (!parserOutput.summaryDetected && rowSum === 0) {
    varianceGrade = 'HIGH';
    warnings.push('No document total detected and no parseable rows — empty result');
  }

  return {
    rowSum,
    summaryTotal,
    variancePercent,
    varianceGrade,
    warnings,
    risk: varianceGrade,
  };
}

// ---------------------------------------------------------------------------
// Resolution confidence
// Combines: parser confidence, variance grade, item count, total source trust
// ---------------------------------------------------------------------------

function computeResolutionConfidence(
  parserConfidence: number,
  varianceGrade: VarianceGrade,
  itemCount: number,
  totalSource: TotalSource,
  totalDupsRemoved: number,
): number {
  let score = parserConfidence;

  // Variance penalty
  if (varianceGrade === 'HIGH') score -= 0.25;
  else if (varianceGrade === 'MEDIUM') score -= 0.10;

  // Item count
  if (itemCount === 0) return 0.0;
  if (itemCount < 3) score -= 0.15;
  else if (itemCount < 8) score -= 0.05;

  // Total source trust
  if (totalSource === 'row_sum') score -= 0.10;
  else if (totalSource === 'document_subtotal') score -= 0.03;

  // Duplication penalty (suggests repeated pages or parsing errors)
  if (totalDupsRemoved > 5) score -= 0.10;
  else if (totalDupsRemoved > 2) score -= 0.05;

  return parseFloat(Math.max(0.05, Math.min(1.0, score)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Source label normalisation for callers that pass legacy source strings
// ---------------------------------------------------------------------------

function normaliseTotalSource(raw: string): TotalSource {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('summary')) return 'summary_page';
  if (s.includes('spreadsheet')) return 'spreadsheet_total';
  if (s.includes('structured')) return 'structured_total';
  if (s.includes('document_grand')) return 'document_grand_total';
  if (s.includes('document_sub') || s.includes('subtotal')) return 'document_subtotal';
  return 'row_sum';
}

// ---------------------------------------------------------------------------
// Main arbitration function
// ---------------------------------------------------------------------------

export function runResolutionLayer(
  parserOutput: RawParserOutput,
  classification: ClassificationResult,
): ResolutionOutput {
  const {
    allItems,
    totals,
    parserUsed,
    parserReasons,
    summaryDetected,
    optionalScopeDetected,
    documentTotals,
  } = parserOutput;

  const incomingParserWarnings: string[] = parserOutput.warnings ?? [];
  const parserMode: string = parserOutput.parser_mode ?? 'unknown';
  const incomingParserConfidence: number =
    typeof parserOutput.confidence === 'number' ? parserOutput.confidence : classification.confidence;

  // ------------------------------------------------------------------
  // Step 1: Classify items — excluded / base / optional
  // ------------------------------------------------------------------

  const excludedRaw = allItems.filter(isExcluded);
  const scopeItems = allItems.filter(item => !isExcluded(item));
  const baseRaw = scopeItems.filter(i => i.scopeCategory === 'base');
  const optionalRaw = scopeItems.filter(i => i.scopeCategory === 'optional');

  // ------------------------------------------------------------------
  // Step 2: Deduplicate each group independently
  // ------------------------------------------------------------------

  const { deduped: baseItems, removed: baseDups, removedDescriptions: baseDupDescs } = deduplicateItems(baseRaw);
  const { deduped: optionalItems, removed: optDups } = deduplicateItems(optionalRaw);
  const totalDupsRemoved = baseDups + optDups;

  // ------------------------------------------------------------------
  // Step 3: Row sums
  // ------------------------------------------------------------------

  const baseRowSum = baseItems.reduce((s, i) => s + i.total, 0);
  const optRowSum = optionalItems.reduce((s, i) => s + i.total, 0);

  // ------------------------------------------------------------------
  // Step 4: Resolve trusted total using priority chain
  // ------------------------------------------------------------------

  const { grandTotal: resolvedGrandTotal, source: resolvedSource } = resolveTrustedTotal(
    totals,
    documentTotals,
    baseRowSum,
    optRowSum,
  );

  const canonicalOptionalTotal =
    (documentTotals?.optionalTotal && documentTotals.optionalTotal > 0)
      ? documentTotals.optionalTotal
      : (totals.optionalTotal > 0 ? totals.optionalTotal : optRowSum);

  // ------------------------------------------------------------------
  // Step 5: Validate / grade variance
  // ------------------------------------------------------------------

  const summaryTotal = summaryDetected ? (documentTotals?.grandTotal ?? totals.grandTotal) : null;
  const validation = validate(baseRowSum, summaryTotal, parserOutput, incomingParserWarnings);

  // Collect all warnings
  const allWarnings: string[] = [...validation.warnings];

  // Warn if document declares an optional total but no optional items were classified
  const declaredOptionalTotal =
    (documentTotals?.optionalTotal && documentTotals.optionalTotal > 0)
      ? documentTotals.optionalTotal
      : (totals.optionalTotal > 0 ? totals.optionalTotal : null);
  if (declaredOptionalTotal && declaredOptionalTotal > 0 && optionalItems.length === 0) {
    allWarnings.push(
      `optional_scope_total $${declaredOptionalTotal.toFixed(2)} declared in document but 0 optional items classified — scope heading may not have been detected`,
    );
  }

  if (totalDupsRemoved > 0) {
    allWarnings.push(
      `${totalDupsRemoved} duplicate item(s) removed` +
      (baseDupDescs.length > 0 ? `: "${baseDupDescs.slice(0, 3).join('", "')}"…` : ''),
    );
    validation.warnings.push(`${totalDupsRemoved} duplicate item(s) removed`);
  }

  // ------------------------------------------------------------------
  // Step 6: Resolution confidence
  // ------------------------------------------------------------------

  const resolutionConfidence = computeResolutionConfidence(
    incomingParserConfidence,
    validation.varianceGrade,
    baseItems.length + optionalItems.length,
    resolvedSource,
    totalDupsRemoved,
  );

  // ------------------------------------------------------------------
  // Build output
  // ------------------------------------------------------------------

  const resolvedTotals: ResolvedTotals = {
    grandTotal: resolvedGrandTotal,
    optionalTotal: canonicalOptionalTotal,
    subTotal: documentTotals?.subTotal ?? totals.subTotal,
    rowSum: baseRowSum,
    source: resolvedSource,
  };

  const debugBlock = {
    classifierReasons: classification.reasons,
    parserReasons,
    confidence: resolutionConfidence,
    summaryDetected,
    optionalScopeDetected,
    itemCountBase: baseItems.length,
    itemCountOptional: optionalItems.length,
    itemCountExcluded: excludedRaw.length,
    dupsRemoved: totalDupsRemoved,
    parserMode,
  };

  // derived_items_total: only surface when parser explicitly set it AND a real
  // document grand total was found (meaning the two differ meaningfully).
  const derivedItemsTotal: number | undefined =
    typeof parserOutput.derived_items_total === 'number' &&
    parserOutput.derived_items_total > 0 &&
    resolvedSource !== 'row_sum'
      ? parserOutput.derived_items_total
      : undefined;

  return {
    // Standard shape
    base_items: baseItems,
    optional_items: optionalItems,
    excluded_items: excludedRaw,
    resolved_total: resolvedGrandTotal,
    resolution_source: resolvedSource,
    resolution_confidence: resolutionConfidence,
    warnings: allWarnings,
    derived_items_total: derivedItemsTotal,
    optional_scope_total: canonicalOptionalTotal,

    // Backward-compat
    documentClass: classification.documentClass,
    parserUsed,
    baseItems,
    optionalItems,
    excludedItems: excludedRaw,
    totals: resolvedTotals,
    validation,
    debug: debugBlock,
  };
}
