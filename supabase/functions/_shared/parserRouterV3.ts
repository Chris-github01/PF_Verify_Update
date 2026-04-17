// =============================================================================
// PARSER ROUTER V3  (Deno edge-function compatible)
//
// Classify → Map to CommercialFamily → Route to family parser → Resolution Layer
//
// Three commercial parser families:
//   itemized_quote   — many rows, preserves qty/unit/rate/total
//   lump_sum_quote   — few rows, grand total is sole financial truth
//   hybrid_quote     — rows + prelims + optional scope sections
//
// Fixed paths (unchanged):
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
// Unknown fallback: try each family in order of likelihood
// ---------------------------------------------------------------------------

function parseUnknownFallback(pages: PageData[], signals: ClassificationResult['signals']): RawParserOutput {
  // Try hybrid first (most tolerant — handles rows + optional sections)
  const hybrid = parseHybridQuote(pages);
  if (hybrid.allItems.length > 0 || hybrid.summaryDetected) {
    return { ...hybrid, parserUsed: 'unknown_fallback(hybrid)' };
  }

  // Try itemized (numbered rows only)
  const itemized = parseItemizedQuote(pages, signals.hasSummaryTotals);
  if (itemized.allItems.length > 0) {
    return { ...itemized, parserUsed: 'unknown_fallback(itemized)' };
  }

  // Last resort: lump sum (extract any grand total + priced lines)
  const lumpSum = parseLumpSumQuote(pages);
  return { ...lumpSum, parserUsed: 'unknown_fallback(lump_sum)' };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function runParserV3(input: ParserV3Input): ParserV3Output {
  const start = Date.now();
  const { pages, rawText, fileExtension, spreadsheetRows } = input;

  // Step 1: Classify
  const classification = classifyDocument(rawText, pages, fileExtension);
  const { documentClass, commercialFamily, signals } = classification;

  console.log(`[ParserV3] documentClass=${documentClass} commercialFamily=${commercialFamily} confidence=${classification.confidence.toFixed(2)}`);
  console.log(`[ParserV3] reasons: ${classification.reasons.join(' | ')}`);

  // Step 2: Route by commercial family
  let rawOutput: RawParserOutput;

  switch (commercialFamily) {
    case 'itemized_quote':
      rawOutput = parseItemizedQuote(pages, signals.hasSummaryTotals);
      break;

    case 'lump_sum_quote':
      rawOutput = parseLumpSumQuote(pages);
      break;

    case 'hybrid_quote':
      rawOutput = parseHybridQuote(pages);
      break;

    case 'spreadsheet_quote':
      rawOutput = spreadsheetRows && spreadsheetRows.length > 0
        ? parseSpreadsheetBoq(spreadsheetRows)
        : parseItemizedQuote(pages, signals.hasSummaryTotals);
      break;

    case 'scanned_ocr_quote':
      rawOutput = parseScannedOcrPdf(pages);
      break;

    case 'unknown_quote':
    default:
      rawOutput = parseUnknownFallback(pages, signals);
      break;
  }

  console.log(`[ParserV3] parserUsed=${rawOutput.parserUsed} items=${rawOutput.allItems.length} summaryDetected=${rawOutput.summaryDetected}`);
  console.log(`[ParserV3] grandTotal=${rawOutput.totals.grandTotal.toFixed(2)} source=${rawOutput.totals.source}`);

  // Step 3: Resolution layer
  const resolution = runResolutionLayer(rawOutput, classification);

  console.log(`[ParserV3] baseItems=${resolution.baseItems.length} optionalItems=${resolution.optionalItems.length} excludedItems=${resolution.excludedItems.length}`);
  console.log(`[ParserV3] resolvedTotal=${resolution.totals.grandTotal.toFixed(2)} source=${resolution.totals.source} risk=${resolution.validation.risk}`);

  if (resolution.validation.warnings.length > 0) {
    for (const w of resolution.validation.warnings) {
      console.warn(`[ParserV3] WARNING: ${w}`);
    }
  }

  return {
    resolution,
    classification,
    durationMs: Date.now() - start,
  };
}
