// =============================================================================
// FAMILY PARSER: itemized_quote
//
// Entry point for documents classified as itemized_quote:
//   - multi_page_boq_summary_pdf  (many rows + summary page)
//   - summary_schedule_pdf        (rows + summary totals)
//   - schedule_only_pdf           (rows only, totals from row sum)
//
// RULES:
//   - Preserve qty / unit / rate / total for every row
//   - If a summary page exists, its grand total is authoritative
//   - Row sum is used for itemization validation only
//   - Do NOT fabricate rows from summary labels
// =============================================================================

import type { PageData } from '../documentClassifier.ts';
import type { RawParserOutput } from '../parseResolutionLayerV3.ts';
import { parseSummarySchedulePdf } from './parseSummarySchedulePdf.ts';
import { parseScheduleOnlyPdf } from './parseScheduleOnlyPdf.ts';

export function parseItemizedQuote(
  pages: PageData[],
  hasSummaryTotals: boolean,
): RawParserOutput {
  console.log(`[parseItemizedQuote] pages=${pages.length} hasSummaryTotals=${hasSummaryTotals}`);

  if (hasSummaryTotals) {
    const result = parseSummarySchedulePdf(pages);
    return { ...result, parserUsed: `parseItemizedQuote(summary_schedule)` };
  }

  const result = parseScheduleOnlyPdf(pages);
  return { ...result, parserUsed: `parseItemizedQuote(schedule_only)` };
}
