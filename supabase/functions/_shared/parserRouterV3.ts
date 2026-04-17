// =============================================================================
// PARSER ROUTER V3  (Deno edge-function compatible)
//
// Architecture: LLM-primary (process_parsing_job) with regex as recovery path.
//
// This module owns the REGEX side of the pipeline only.
// It is invoked either:
//   (A) Directly, when the document is a spreadsheet (regex-only path)
//   (B) As a fallback recovery, when LLM output is unreliable
//
// Exports:
//   runRegexRecoveryParser(input)   — the canonical entry point (new name)
//   runParserV3(input)              — backward-compatible alias
//   evaluateNeedForRegexRecovery()  — decision predicate used by the main pipeline
//
// Three commercial parser families:
//   itemized_quote   — many rows, preserves qty/unit/rate/total
//   lump_sum_quote   — few rows, grand total is sole financial truth
//   hybrid_quote     — rows + prelims + optional scope sections
//
// Fixed paths:
//   spreadsheet_quote — parseSpreadsheetBoq
//   scanned_ocr_quote — parseScannedOcrPdf
//   unknown_quote     — tryHybrid → tryItemized → tryLumpSum
// =============================================================================

import { classifyDocument } from './documentClassifier.ts';
import { runResolutionLayer } from './parseResolutionLayerV3.ts';
import { parseItemizedQuote } from './parsers/parseItemizedQuote.ts';
import { parseLumpSumQuote } from './parsers/parseLumpSumQuote.ts';
import { parseHybridQuote } from './parsers/parseHybridQuote.ts';
import { parseScannedOcrPdf } from './parsers/parseScannedOcrPdf.ts';
import { parseSpreadsheetBoq } from './parsers/parseSpreadsheetBoq.ts';

import type { PageData, ClassificationResult } from './documentClassifier.ts';
import type { RawParserOutput, ResolutionOutput } from './parseResolutionLayerV3.ts';

export type { ResolutionOutput };

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface ParserV3Input {
  pages: PageData[];
  rawText: string;
  fileExtension?: string;
  spreadsheetRows?: (string | number | null | undefined)[][];
}

export interface ParserV3Output {
  resolution: ResolutionOutput;
  classification: ClassificationResult;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Standardized regex parser result — all internal parsers produce this shape
// before being handed to the resolution layer.
// ---------------------------------------------------------------------------

export interface RegexParserResult {
  items: RawParserOutput['allItems'];
  confidence: number;
  parser_used: string;
  parser_mode: 'regex_recovery';
  totals: RawParserOutput['totals'];
  summaryDetected: boolean;
  optionalScopeDetected: boolean;
  parserReasons: string[];
  rawSummary: unknown;
}

// ---------------------------------------------------------------------------
// evaluateNeedForRegexRecovery
//
// Returns true when the LLM output is unreliable and regex recovery should run.
// Called by process_parsing_job before merging strategies.
// ---------------------------------------------------------------------------

export interface RegexRecoveryEvaluation {
  needed: boolean;
  reasons: string[];
  zeroItems: boolean;
  lowConfidence: boolean;
  highVariance: boolean;
  tooFewRows: boolean;
}

export function evaluateNeedForRegexRecovery(params: {
  items: unknown[];
  confidence: number;
  documentTotal: number;
  rowTotal: number;
  lineCount: number;
}): RegexRecoveryEvaluation {
  const { items, confidence, documentTotal, rowTotal, lineCount } = params;

  const reasons: string[] = [];

  const zeroItems = items.length === 0;
  if (zeroItems) reasons.push('zero_items');

  const lowConfidence = confidence < 0.55;
  if (lowConfidence) reasons.push(`low_confidence(${confidence.toFixed(2)})`);

  const varianceRatio =
    documentTotal > 0 && rowTotal > 0
      ? Math.abs(documentTotal - rowTotal) / documentTotal
      : 0;
  const highVariance = documentTotal > 0 && varianceRatio > 0.20;
  if (highVariance) reasons.push(`high_variance(${(varianceRatio * 100).toFixed(1)}%)`);

  // Long document with suspiciously few rows detected:
  // heuristic — if the document has many lines of text but LLM extracted very few items,
  // regex may recover more rows.
  const tooFewRows = lineCount > 200 && items.length < 5 && items.length > 0;
  if (tooFewRows) reasons.push(`too_few_rows(lines=${lineCount},items=${items.length})`);

  const needed = zeroItems || lowConfidence || highVariance || tooFewRows;

  return { needed, reasons, zeroItems, lowConfidence, highVariance, tooFewRows };
}

// ---------------------------------------------------------------------------
// Unknown-family fallback: try each family in order of likelihood
// ---------------------------------------------------------------------------

function parseUnknownFallback(
  pages: PageData[],
  signals: ClassificationResult['signals'],
): RawParserOutput {
  const hybrid = parseHybridQuote(pages);
  if (hybrid.allItems.length > 0 || hybrid.summaryDetected) {
    return { ...hybrid, parserUsed: 'unknown_fallback(hybrid)' };
  }

  const itemized = parseItemizedQuote(pages, signals.hasSummaryTotals);
  if (itemized.allItems.length > 0) {
    return { ...itemized, parserUsed: 'unknown_fallback(itemized)' };
  }

  const lumpSum = parseLumpSumQuote(pages);
  return { ...lumpSum, parserUsed: 'unknown_fallback(lump_sum)' };
}

// ---------------------------------------------------------------------------
// Route a single parser family → RawParserOutput (pre-resolution)
// ---------------------------------------------------------------------------

function routeToFamilyParser(
  commercialFamily: ClassificationResult['commercialFamily'],
  pages: PageData[],
  signals: ClassificationResult['signals'],
  spreadsheetRows: (string | number | null | undefined)[][] | undefined,
): RawParserOutput {
  switch (commercialFamily) {
    case 'itemized_quote':
      return parseItemizedQuote(pages, signals.hasSummaryTotals);

    case 'lump_sum_quote':
      return parseLumpSumQuote(pages);

    case 'hybrid_quote':
      return parseHybridQuote(pages);

    case 'spreadsheet_quote':
      return spreadsheetRows && spreadsheetRows.length > 0
        ? parseSpreadsheetBoq(spreadsheetRows)
        : parseItemizedQuote(pages, signals.hasSummaryTotals);

    case 'scanned_ocr_quote':
      return parseScannedOcrPdf(pages);

    case 'unknown_quote':
    default:
      return parseUnknownFallback(pages, signals);
  }
}

// ---------------------------------------------------------------------------
// Compute a normalized confidence score from raw parser output.
// Factors: item count, summary detection, variance between row sum and total.
// ---------------------------------------------------------------------------

function deriveRegexConfidence(rawOutput: RawParserOutput): number {
  const { allItems, totals, summaryDetected } = rawOutput;

  if (allItems.length === 0) return 0;

  let score = 0.60;

  if (allItems.length >= 10) score += 0.10;
  if (allItems.length >= 25) score += 0.05;
  if (summaryDetected) score += 0.15;

  if (totals.grandTotal > 0 && totals.rowSum > 0) {
    const variance = Math.abs(totals.grandTotal - totals.rowSum) / totals.grandTotal;
    if (variance < 0.02) score += 0.10;
    else if (variance < 0.10) score += 0.05;
    else if (variance > 0.30) score -= 0.15;
  }

  return Math.min(1.0, Math.max(0, score));
}

// ---------------------------------------------------------------------------
// runRegexRecoveryParser — canonical entry point (new architecture name)
//
// Classify → Route to family parser → Resolution layer.
// Returns both the full ParserV3Output (for backward compat) AND the
// standardized RegexParserResult shape for the merge layer.
// ---------------------------------------------------------------------------

export function runRegexRecoveryParser(input: ParserV3Input): ParserV3Output & {
  regexResult: RegexParserResult;
} {
  const start = Date.now();
  const { pages, rawText, fileExtension, spreadsheetRows } = input;

  const classification = classifyDocument(rawText, pages, fileExtension);
  const { documentClass, commercialFamily, signals } = classification;

  console.log(
    `[RegexRecovery] documentClass=${documentClass} commercialFamily=${commercialFamily}` +
    ` confidence=${classification.confidence.toFixed(2)}`,
  );
  console.log(`[RegexRecovery] reasons: ${classification.reasons.join(' | ')}`);

  const rawOutput = routeToFamilyParser(commercialFamily, pages, signals, spreadsheetRows);

  console.log(
    `[RegexRecovery] parserUsed=${rawOutput.parserUsed} items=${rawOutput.allItems.length}` +
    ` summaryDetected=${rawOutput.summaryDetected}`,
  );
  console.log(
    `[RegexRecovery] grandTotal=${rawOutput.totals.grandTotal.toFixed(2)}` +
    ` source=${rawOutput.totals.source}`,
  );

  const resolution = runResolutionLayer(rawOutput, classification);

  console.log(
    `[RegexRecovery] baseItems=${resolution.baseItems.length}` +
    ` optionalItems=${resolution.optionalItems.length}` +
    ` excludedItems=${resolution.excludedItems.length}`,
  );
  console.log(
    `[RegexRecovery] resolvedTotal=${resolution.totals.grandTotal.toFixed(2)}` +
    ` source=${resolution.totals.source} risk=${resolution.validation.risk}`,
  );

  if (resolution.validation.warnings.length > 0) {
    for (const w of resolution.validation.warnings) {
      console.warn(`[RegexRecovery] WARNING: ${w}`);
    }
  }

  const confidence = deriveRegexConfidence(rawOutput);

  const regexResult: RegexParserResult = {
    items: rawOutput.allItems,
    confidence,
    parser_used: rawOutput.parserUsed,
    parser_mode: 'regex_recovery',
    totals: rawOutput.totals,
    summaryDetected: rawOutput.summaryDetected,
    optionalScopeDetected: rawOutput.optionalScopeDetected,
    parserReasons: rawOutput.parserReasons,
    rawSummary: rawOutput.rawSummary,
  };

  return {
    resolution,
    classification,
    durationMs: Date.now() - start,
    regexResult,
  };
}

// ---------------------------------------------------------------------------
// runParserV3 — backward-compatible alias
// All existing callers (process_parsing_job, tests) continue to work unchanged.
// ---------------------------------------------------------------------------

export const runParserV3 = runRegexRecoveryParser;
