// =============================================================================
// PARSER ROUTER  (v3 architecture)
//
// Routes a classified document to the correct specialized parser.
// Returns the raw parser output which is then passed to the resolution layer.
//
// Flow:
//   classifyDocument() → parserRouter() → runResolutionLayer()
// =============================================================================

import type { DocumentClass, PageData } from './documentClassifier';
import type { RawParserOutput } from './parseResolutionLayer';
import { parseSummarySchedulePdf } from './parsers/parseSummarySchedulePdf';
import { parseScheduleOnlyPdf } from './parsers/parseScheduleOnlyPdf';
import { parseSimpleLineItemsPdf } from './parsers/parseSimpleLineItemsPdf';
import { parseScannedOcrPdf } from './parsers/parseScannedOcrPdf';
import { parseSpreadsheetBoq, type SpreadsheetRow } from './parsers/parseSpreadsheetBoq';

export interface RouterInput {
  documentClass: DocumentClass;
  pages: PageData[];
  rawText: string;
  // For spreadsheet_boq only
  spreadsheetRows?: (string | number | null | undefined)[][];
}

// ---------------------------------------------------------------------------
// Fallback parser — handles mixed_unknown by trying summary first, then rows
// ---------------------------------------------------------------------------

function parseMixedUnknown(pages: PageData[]): RawParserOutput {
  const simple = parseSimpleLineItemsPdf(pages);

  // If we got items or a summary, use it
  if (simple.allItems.length > 0 || simple.summaryDetected) {
    return { ...simple, parserUsed: 'parseMixedUnknown(simple_fallback)' };
  }

  // Try schedule parser
  const schedule = parseScheduleOnlyPdf(pages);
  if (schedule.allItems.length > 0) {
    return { ...schedule, parserUsed: 'parseMixedUnknown(schedule_fallback)' };
  }

  // Last resort: OCR tolerant
  const ocr = parseScannedOcrPdf(pages);
  return { ...ocr, parserUsed: 'parseMixedUnknown(ocr_fallback)' };
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export function routeParse(input: RouterInput): RawParserOutput {
  const { documentClass, pages, spreadsheetRows } = input;

  console.log(`[ParserRouter] Routing documentClass=${documentClass} pages=${pages.length}`);

  switch (documentClass) {
    case 'summary_schedule_pdf':
      return parseSummarySchedulePdf(pages);

    case 'schedule_only_pdf':
      return parseScheduleOnlyPdf(pages);

    case 'simple_line_items_pdf':
      return parseSimpleLineItemsPdf(pages);

    case 'scanned_ocr_pdf':
      return parseScannedOcrPdf(pages);

    case 'spreadsheet_boq':
      if (!spreadsheetRows || spreadsheetRows.length === 0) {
        console.warn('[ParserRouter] spreadsheet_boq selected but no spreadsheetRows provided — falling back to simple');
        return parseSimpleLineItemsPdf(pages);
      }
      return parseSpreadsheetBoq(spreadsheetRows);

    case 'mixed_unknown':
    default:
      console.warn(`[ParserRouter] Unknown/mixed class "${documentClass}" — running multi-strategy fallback`);
      return parseMixedUnknown(pages);
  }
}
