import { classifyRows, computeParserWarnings, LIVE_PARSER_VERSION, MODULE_KEY } from './shared';
import type { PlumbingParserInput, PlumbingParserOutput, PlumbingNormalizedRow } from './types';

export function runLiveParser(input: PlumbingParserInput): PlumbingParserOutput {
  const allRows = classifyRows(input.rows, input.documentTotal);

  const includedRows = allRows.filter((r) => r.includedInParsedTotal);
  const excludedSummaryRows = allRows.filter(
    (r) => !r.includedInParsedTotal && r.classification === 'summary_total'
  );
  const suspiciousRows = allRows.filter(
    (r) => r.includedInParsedTotal &&
      r.detectionSignals.some((s) => s.startsWith('phrase:')) &&
      r.confidenceScore > 0.4
  );

  const parsedValue = includedRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const detectedDocumentTotal = input.documentTotal ?? detectDocumentTotal(allRows);

  const differenceToDocumentTotal = detectedDocumentTotal != null
    ? parsedValue - detectedDocumentTotal
    : null;

  const ruleHitsSummary: Record<string, number> = {};
  for (const row of allRows) {
    for (const signal of row.detectionSignals) {
      ruleHitsSummary[signal] = (ruleHitsSummary[signal] ?? 0) + 1;
    }
  }

  const parserWarnings = computeParserWarnings(allRows, parsedValue, detectedDocumentTotal);

  const hasLikelyFinalTotalAsLineItem = includedRows.some(
    (r) => r.amount != null &&
      detectedDocumentTotal != null &&
      Math.abs(r.amount - detectedDocumentTotal) < Math.max(detectedDocumentTotal * 0.02, 50)
  );

  const amounts = includedRows.map((r) => r.amount).filter((a): a is number => a != null);
  const hasDuplicateValueRisk = amounts.length !== new Set(amounts.map((a) => a.toFixed(2))).size &&
    amounts.filter((a) => a > 1000).length !== new Set(
      amounts.filter((a) => a > 1000).map((a) => a.toFixed(2))
    ).size;

  const hasTotalMismatch = differenceToDocumentTotal != null && Math.abs(differenceToDocumentTotal) > 100;

  return {
    parserVersion: LIVE_PARSER_VERSION,
    moduleKey: MODULE_KEY,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    parsedValue,
    detectedDocumentTotal,
    differenceToDocumentTotal,
    includedLineCount: includedRows.length,
    excludedLineCount: excludedSummaryRows.length,
    totalRowCount: allRows.length,
    excludedSummaryRows,
    suspiciousRows,
    includedRows,
    allRows,
    parserWarnings,
    ruleHitsSummary,
    hasTotalMismatch,
    hasLikelyFinalTotalAsLineItem,
    hasDuplicateValueRisk,
    executedAt: new Date().toISOString(),
  };
}

function detectDocumentTotal(rows: PlumbingNormalizedRow[]): number | null {
  const excluded = rows.filter((r) => !r.includedInParsedTotal && r.amount != null);
  if (excluded.length === 0) return null;
  const maxExcluded = excluded.reduce((max, r) =>
    (r.amount ?? 0) > (max.amount ?? 0) ? r : max
  );
  return maxExcluded.amount;
}
