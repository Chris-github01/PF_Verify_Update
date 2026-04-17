// =============================================================================
// PARSER ROUTER V3  (Deno edge-function compatible)
//
// Classifier → Router → Resolution Layer
// No vendor-specific logic. Classify by structure only.
// =============================================================================

import { classifyDocument } from './documentClassifier.ts';
import { runResolutionLayer } from './parseResolutionLayerV3.ts';
import { parseSummarySchedulePdf } from './parsers/parseSummarySchedulePdf.ts';
import { parseScheduleOnlyPdf } from './parsers/parseScheduleOnlyPdf.ts';
import { parseSimpleLineItemsPdf } from './parsers/parseSimpleLineItemsPdf.ts';
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
// Fallback: try each parser in order of likeliness
// ---------------------------------------------------------------------------

function parseMixedUnknown(pages: PageData[]): RawParserOutput {
  const simple = parseSimpleLineItemsPdf(pages);
  if (simple.allItems.length > 0 || simple.summaryDetected) {
    return { ...simple, parserUsed: 'parseMixedUnknown(simple_fallback)' };
  }
  const schedule = parseScheduleOnlyPdf(pages);
  if (schedule.allItems.length > 0) {
    return { ...schedule, parserUsed: 'parseMixedUnknown(schedule_fallback)' };
  }
  const ocr = parseScannedOcrPdf(pages);
  return { ...ocr, parserUsed: 'parseMixedUnknown(ocr_fallback)' };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function runParserV3(input: ParserV3Input): ParserV3Output {
  const start = Date.now();
  const { pages, rawText, fileExtension, spreadsheetRows } = input;

  // Step 1: Classify
  const classification = classifyDocument(rawText, pages, fileExtension);
  console.log(`[ParserV3] documentClass=${classification.documentClass} confidence=${classification.confidence.toFixed(2)}`);
  console.log(`[ParserV3] reasons: ${classification.reasons.join(' | ')}`);

  // Step 2: Route to parser
  let rawOutput: RawParserOutput;

  switch (classification.documentClass) {
    case 'multi_page_boq_summary_pdf':
      rawOutput = parseSummarySchedulePdf(pages);
      break;
    case 'summary_schedule_pdf':
      rawOutput = parseSummarySchedulePdf(pages);
      break;
    case 'schedule_only_pdf':
      rawOutput = parseScheduleOnlyPdf(pages);
      break;
    case 'simple_line_items_pdf':
      rawOutput = parseSimpleLineItemsPdf(pages);
      break;
    case 'scanned_ocr_pdf':
      rawOutput = parseScannedOcrPdf(pages);
      break;
    case 'spreadsheet_boq':
      rawOutput = spreadsheetRows && spreadsheetRows.length > 0
        ? parseSpreadsheetBoq(spreadsheetRows)
        : parseSimpleLineItemsPdf(pages);
      break;
    case 'mixed_unknown':
    default:
      rawOutput = parseMixedUnknown(pages);
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
