import { classifyRows, computeParserWarnings, toNum, SHADOW_PARSER_VERSION, MODULE_KEY } from './shared';
import type { PlumbingParserInput, PlumbingParserOutput, PlumbingNormalizedRow } from './types';

export function runShadowParser(input: PlumbingParserInput): PlumbingParserOutput {
  let allRows = classifyRows(input.rows, input.documentTotal);

  allRows = applyEnhancedExclusionRules(allRows, input.documentTotal ?? null);

  const includedRows = allRows.filter((r) => r.includedInParsedTotal);
  const excludedSummaryRows = allRows.filter(
    (r) => !r.includedInParsedTotal && r.classification === 'summary_total'
  );
  const suspiciousRows = allRows.filter(
    (r) => r.includedInParsedTotal &&
      r.detectionSignals.some((s) => s.startsWith('phrase:')) &&
      r.confidenceScore > 0.5
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
      Math.abs(r.amount - detectedDocumentTotal) < Math.max(detectedDocumentTotal * 0.015, 25)
  );

  const amounts = includedRows.map((r) => r.amount).filter((a): a is number => a != null);
  const hasDuplicateValueRisk = amounts.length !== new Set(amounts.map((a) => a.toFixed(2))).size &&
    amounts.filter((a) => a > 1000).length !== new Set(
      amounts.filter((a) => a > 1000).map((a) => a.toFixed(2))
    ).size;

  const hasTotalMismatch = differenceToDocumentTotal != null && Math.abs(differenceToDocumentTotal) > 100;

  return {
    parserVersion: SHADOW_PARSER_VERSION,
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

function applyEnhancedExclusionRules(
  rows: PlumbingNormalizedRow[],
  documentTotal: number | null
): PlumbingNormalizedRow[] {
  const result = [...rows];

  let runningSum = 0;
  const includedAmounts: number[] = [];

  for (let i = 0; i < result.length; i++) {
    const row = result[i];
    if (!row.includedInParsedTotal || row.amount == null) continue;

    const nearMatchTolerance = Math.max(row.amount * 0.01, 10);

    if (includedAmounts.length >= 2 && Math.abs(row.amount - runningSum) <= nearMatchTolerance) {
      result[i] = {
        ...row,
        includedInParsedTotal: false,
        classification: 'summary_total',
        exclusionReason: 'shadow_rule: amount matches running sum of prior rows',
        detectionSignals: [...row.detectionSignals, 'shadow:running_sum_match'],
        confidenceScore: Math.max(row.confidenceScore, 0.75),
      };
      continue;
    }

    if (documentTotal != null) {
      const strictTolerance = Math.max(documentTotal * 0.015, 25);
      if (Math.abs(row.amount - documentTotal) <= strictTolerance) {
        result[i] = {
          ...row,
          includedInParsedTotal: false,
          classification: 'summary_total',
          exclusionReason: 'shadow_rule: amount closely matches document total (strict tolerance)',
          detectionSignals: [...row.detectionSignals, 'shadow:strict_document_total_match'],
          confidenceScore: Math.max(row.confidenceScore, 0.85),
        };
        continue;
      }
    }

    runningSum += row.amount;
    includedAmounts.push(row.amount);
  }

  const finalWindow = Math.max(1, Math.floor(result.length * 0.05));
  for (let i = result.length - finalWindow; i < result.length; i++) {
    const row = result[i];
    if (!row.includedInParsedTotal || row.amount == null) continue;
    if (row.description.trim() === '' || /^\$?[\d,]+(\.\d{1,2})?$/.test(row.description.trim())) {
      result[i] = {
        ...row,
        includedInParsedTotal: false,
        classification: 'summary_total',
        exclusionReason: 'shadow_rule: amount-only row in final 5% of document',
        detectionSignals: [...row.detectionSignals, 'shadow:end_of_doc_amount_only'],
        confidenceScore: Math.max(row.confidenceScore, 0.65),
      };
    }
  }

  return result;
}

function detectDocumentTotal(rows: PlumbingNormalizedRow[]): number | null {
  const excluded = rows.filter((r) => !r.includedInParsedTotal && r.amount != null);
  if (excluded.length === 0) return null;
  const maxExcluded = excluded.reduce((max, r) =>
    (r.amount ?? 0) > (max.amount ?? 0) ? r : max
  );
  return maxExcluded.amount;
}
