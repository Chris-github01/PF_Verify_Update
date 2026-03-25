import { classifyAllRows } from './totalRowDetection';
import type {
  ClassifiedRow,
  PlumbingNormalizedOutput,
  PlumbingRunLevelSummary,
  RiskFlag,
  RiskLevel,
} from '../../../../types/plumbingDiscrepancy';

interface RawRow {
  description?: string | null;
  qty?: number | null;
  unit?: string | null;
  rate?: number | null;
  total?: number | null;
  total_price?: number | null;
  amount?: number | null;
  [key: string]: unknown;
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }
  return null;
}

export function normalizeForShadowCompare(
  rawRows: RawRow[],
  documentTotal?: number | null
): PlumbingNormalizedOutput {
  const rowInputs = rawRows.map((r, i) => ({
    rowIndex: i,
    rawText: String(r.description ?? r.desc ?? r.item ?? ''),
    quantity: toNum(r.qty ?? r.quantity),
    unit: (r.unit as string | null) ?? null,
    rate: toNum(r.rate ?? r.unit_rate),
    amount: toNum(r.total ?? r.total_price ?? r.amount),
  }));

  const classificationResults = classifyAllRows(rowInputs, documentTotal);

  const classifiedRows: ClassifiedRow[] = rowInputs.map((r, i) => {
    const res = classificationResults[i];
    return {
      rowIndex: r.rowIndex,
      rawText: r.rawText,
      normalizedDescription: r.rawText.trim().replace(/\s+/g, ' '),
      quantity: r.quantity,
      unit: r.unit,
      rate: r.rate,
      amount: r.amount,
      classification: res.classification,
      includedInParsedTotal: !res.shouldExcludeFromItems,
      exclusionReason: res.exclusionReason,
      detectionSignals: res.detectionSignals,
      confidenceScore: res.confidenceScore,
      matchesDocumentTotal: res.matchesDocumentTotal,
      sumsPriorRows: res.sumsPriorRows,
    };
  });

  const includedRows = classifiedRows.filter((r) => r.includedInParsedTotal);
  const excludedRows = classifiedRows.filter((r) => !r.includedInParsedTotal);

  const parsedValue = includedRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);

  const differenceToDocumentTotal =
    documentTotal != null ? parsedValue - documentTotal : null;

  const suspiciousRows = classifiedRows.filter((r) => {
    if (r.classification === 'unclassified') return true;
    if (r.confidenceScore > 0.3 && r.confidenceScore < 0.7) return true;
    if (r.includedInParsedTotal && r.detectionSignals.some((s) => s.startsWith('phrase_match:'))) return true;
    if (r.includedInParsedTotal && r.detectionSignals.includes('value:much_larger_than_typical_line_item')) return true;
    return false;
  });

  const hasTotalMismatch =
    documentTotal != null && differenceToDocumentTotal != null &&
    Math.abs(differenceToDocumentTotal) > (documentTotal * 0.02);

  const hasLikelyFinalTotalAsLineItem = includedRows.some(
    (r) => r.detectionSignals.some((s) => s.startsWith('phrase_match:')) && r.confidenceScore > 0.4
  );

  const hasDuplicateValueRisk = includedRows.some((r) => r.matchesDocumentTotal || r.sumsPriorRows);

  const ruleHitsSummary: Record<string, number> = {};
  for (const row of classifiedRows) {
    for (const signal of row.detectionSignals) {
      ruleHitsSummary[signal] = (ruleHitsSummary[signal] ?? 0) + 1;
    }
  }

  const parserWarnings: string[] = [];
  if (hasTotalMismatch) {
    parserWarnings.push(`Parsed total ($${parsedValue.toFixed(2)}) differs from detected document total ($${documentTotal?.toFixed(2)}) by $${Math.abs(differenceToDocumentTotal ?? 0).toFixed(2)}`);
  }
  if (hasLikelyFinalTotalAsLineItem) {
    parserWarnings.push('One or more included line items may be final total rows');
  }
  if (hasDuplicateValueRisk) {
    parserWarnings.push('Potential duplicate value risk: some included rows match the document total or sum of prior rows');
  }
  if (suspiciousRows.length > 3) {
    parserWarnings.push(`${suspiciousRows.length} rows have ambiguous classification`);
  }

  const summary: PlumbingRunLevelSummary = {
    parsedValue,
    detectedDocumentTotal: documentTotal ?? null,
    differenceToDocumentTotal,
    includedLineCount: includedRows.length,
    excludedLineCount: excludedRows.length,
    excludedSummaryRows: excludedRows,
    suspiciousRows,
    hasTotalMismatch,
    hasLikelyFinalTotalAsLineItem,
    hasDuplicateValueRisk,
    parserWarnings,
    ruleHitsSummary,
  };

  return { rows: classifiedRows, summary, includedRows, excludedRows };
}

export function buildRiskFlags(
  liveSummary: PlumbingRunLevelSummary,
  shadowSummary: PlumbingRunLevelSummary
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (liveSummary.hasLikelyFinalTotalAsLineItem) {
    flags.push({
      id: 'final_total_as_line_item_live',
      severity: 'critical' as RiskLevel,
      title: 'Likely final total line included as billable item (live)',
      explanation: 'The live parser appears to have included the final contract total as a line item, potentially inflating the parsed total.',
      suggestedAction: 'Review the live excluded rows panel. If shadow correctly excludes this row, shadow parser is preferred.',
    });
  }

  if (shadowSummary.hasLikelyFinalTotalAsLineItem) {
    flags.push({
      id: 'final_total_as_line_item_shadow',
      severity: 'high' as RiskLevel,
      title: 'Likely final total line included as billable item (shadow)',
      explanation: 'The shadow parser also appears to include a final total row as a line item.',
      suggestedAction: 'Review shadow excluded rows and suspicious rows. Tune totalRowDetection rules if needed.',
    });
  }

  if (liveSummary.hasTotalMismatch && !shadowSummary.hasTotalMismatch) {
    flags.push({
      id: 'shadow_corrects_total_mismatch',
      severity: 'medium' as RiskLevel,
      title: 'Shadow total better aligns with detected document total',
      explanation: `Live parser has a total mismatch ($${Math.abs(liveSummary.differenceToDocumentTotal ?? 0).toFixed(2)} off). Shadow parser resolves this.`,
      suggestedAction: 'This is a positive signal for shadow. Verify row classification changes to confirm.',
    });
  }

  if (liveSummary.hasTotalMismatch && shadowSummary.hasTotalMismatch) {
    const liveDiff = Math.abs(liveSummary.differenceToDocumentTotal ?? 0);
    const shadowDiff = Math.abs(shadowSummary.differenceToDocumentTotal ?? 0);
    if (shadowDiff > liveDiff) {
      flags.push({
        id: 'shadow_worse_total_mismatch',
        severity: 'high' as RiskLevel,
        title: 'Shadow total differs more from document total than live',
        explanation: `Shadow parser is further from detected document total. Live: $${liveDiff.toFixed(2)} off. Shadow: $${shadowDiff.toFixed(2)} off.`,
        suggestedAction: 'Review shadow exclusion rules. Shadow parser may be over-excluding valid rows.',
      });
    }
  }

  if (liveSummary.hasDuplicateValueRisk) {
    flags.push({
      id: 'duplicate_total_risk_live',
      severity: 'high' as RiskLevel,
      title: 'Duplicate total value risk detected (live)',
      explanation: 'One or more live line items have amounts matching the document total or sum of prior rows, suggesting double-counting.',
      suggestedAction: 'Cross-check live parsed total against document total. Verify shadow fixes this.',
    });
  }

  if (!liveSummary.detectedDocumentTotal) {
    flags.push({
      id: 'no_document_total_detected',
      severity: 'medium' as RiskLevel,
      title: 'No document total detected',
      explanation: 'Unable to find a reference total in the document. Total-mismatch detection is unavailable.',
      suggestedAction: 'Review the document manually to locate the stated contract total.',
    });
  }

  const shadowExclusionRateDiff = shadowSummary.excludedLineCount - liveSummary.excludedLineCount;
  if (shadowExclusionRateDiff > 5) {
    flags.push({
      id: 'high_shadow_exclusion_delta',
      severity: 'medium' as RiskLevel,
      title: 'Shadow parser excluded significantly more rows than live',
      explanation: `Shadow excluded ${shadowExclusionRateDiff} more rows than live. Some may be false-positive exclusions.`,
      suggestedAction: 'Review excluded rows panel for any incorrectly excluded line items.',
    });
  }

  const lowConfidenceExclusions = shadowSummary.excludedSummaryRows.filter(
    (r) => r.confidenceScore < 0.5
  ).length;
  if (lowConfidenceExclusions > 0) {
    flags.push({
      id: 'low_confidence_exclusions',
      severity: 'medium' as RiskLevel,
      title: `${lowConfidenceExclusions} summary row exclusions have low confidence`,
      explanation: 'Some shadow exclusions are based on weak signals. Manual review is recommended.',
      suggestedAction: 'Review the excluded rows table and check detection signals for low-confidence rows.',
    });
  }

  if (shadowSummary.suspiciousRows.length > 3) {
    flags.push({
      id: 'multiple_suspicious_rows',
      severity: 'medium' as RiskLevel,
      title: `${shadowSummary.suspiciousRows.length} rows require manual classification review`,
      explanation: 'Several rows could not be confidently classified as either line items or summary rows.',
      suggestedAction: 'Review the suspicious rows table and assess each row manually.',
    });
  }

  return flags;
}
