import { buildRiskFlags } from './plumbingNormalizer';
import type {
  PlumbingNormalizedOutput,
  PlumbingDiff,
  RowClassificationChange,
  TotalsComparison,
  RecommendedOutcome,
} from '../../../../types/plumbingDiscrepancy';

export function buildPlumbingDiff(
  live: PlumbingNormalizedOutput,
  shadow: PlumbingNormalizedOutput
): PlumbingDiff {
  const liveSummary = live.summary;
  const shadowSummary = shadow.summary;

  const totalsComparison: TotalsComparison = {
    liveParsedTotal: liveSummary.parsedValue,
    shadowParsedTotal: shadowSummary.parsedValue,
    detectedDocumentTotal: shadowSummary.detectedDocumentTotal ?? liveSummary.detectedDocumentTotal,
    liveDiffToDocument: liveSummary.differenceToDocumentTotal,
    shadowDiffToDocument: shadowSummary.differenceToDocumentTotal,
    shadowIsBetter: isShadowBetter(liveSummary, shadowSummary),
    shadowTotalDelta: shadowSummary.parsedValue - liveSummary.parsedValue,
  };

  const rowClassificationChanges: RowClassificationChange[] = [];

  const shadowRowsByIndex = new Map(shadow.rows.map((r) => [r.rowIndex, r]));
  const liveRowsByIndex = new Map(live.rows.map((r) => [r.rowIndex, r]));

  for (const liveRow of live.rows) {
    const shadowRow = shadowRowsByIndex.get(liveRow.rowIndex);
    if (!shadowRow) continue;
    if (liveRow.classification !== shadowRow.classification || liveRow.includedInParsedTotal !== shadowRow.includedInParsedTotal) {
      rowClassificationChanges.push({
        rowIndex: liveRow.rowIndex,
        rawText: liveRow.rawText,
        amount: liveRow.amount,
        liveClassification: liveRow.classification,
        shadowClassification: shadowRow.classification,
        liveIncluded: liveRow.includedInParsedTotal,
        shadowIncluded: shadowRow.includedInParsedTotal,
        exclusionReason: shadowRow.exclusionReason,
        detectionSignals: shadowRow.detectionSignals,
        confidenceScore: shadowRow.confidenceScore,
      });
    }
  }

  const liveIndices = new Set(live.rows.map((r) => r.rowIndex));
  const shadowIndices = new Set(shadow.rows.map((r) => r.rowIndex));

  const addedRows = shadow.rows.filter((r) => !liveIndices.has(r.rowIndex));
  const removedRows = live.rows.filter((r) => !shadowIndices.has(r.rowIndex));

  const changedRows = rowClassificationChanges.filter(
    (c) => c.liveIncluded !== c.shadowIncluded || c.liveClassification !== c.shadowClassification
  );

  const riskFlags = buildRiskFlags(liveSummary, shadowSummary);

  const recommendedOutcome = deriveRecommendedOutcome(
    liveSummary,
    shadowSummary,
    totalsComparison,
    riskFlags.length
  );

  const adjudicationSummary = buildAdjudicationSummary(
    liveSummary,
    shadowSummary,
    totalsComparison,
    rowClassificationChanges,
    riskFlags,
    recommendedOutcome
  );

  return {
    totalsComparison,
    rowClassificationChanges,
    addedRows,
    removedRows,
    changedRows,
    riskFlags,
    recommendedOutcome,
    adjudicationSummary,
    liveExcludedRows: live.excludedRows,
    shadowExcludedRows: shadow.excludedRows,
    liveSuspiciousRows: liveSummary.suspiciousRows,
    shadowSuspiciousRows: shadowSummary.suspiciousRows,
  };
}

function isShadowBetter(
  live: PlumbingNormalizedOutput['summary'],
  shadow: PlumbingNormalizedOutput['summary']
): boolean {
  const docTotal = shadow.detectedDocumentTotal ?? live.detectedDocumentTotal;
  if (!docTotal) {
    return live.hasLikelyFinalTotalAsLineItem && !shadow.hasLikelyFinalTotalAsLineItem;
  }
  const liveDiff = Math.abs(live.differenceToDocumentTotal ?? Infinity);
  const shadowDiff = Math.abs(shadow.differenceToDocumentTotal ?? Infinity);
  return shadowDiff < liveDiff;
}

function deriveRecommendedOutcome(
  live: PlumbingNormalizedOutput['summary'],
  shadow: PlumbingNormalizedOutput['summary'],
  totals: TotalsComparison,
  flagCount: number
): RecommendedOutcome {
  const docTotal = totals.detectedDocumentTotal;

  if (docTotal) {
    const liveDiff = Math.abs(totals.liveDiffToDocument ?? Infinity);
    const shadowDiff = Math.abs(totals.shadowDiffToDocument ?? Infinity);

    if (shadowDiff < liveDiff * 0.5 && shadow.excludedSummaryRows.length > 0) {
      return 'shadow_better';
    }
    if (liveDiff < shadowDiff * 0.5) {
      return 'live_better';
    }
  }

  if (live.hasLikelyFinalTotalAsLineItem && !shadow.hasLikelyFinalTotalAsLineItem) {
    return 'shadow_better';
  }

  if (live.hasDuplicateValueRisk && !shadow.hasDuplicateValueRisk) {
    return 'shadow_better';
  }

  if (flagCount >= 3 || shadow.suspiciousRows.length > 5) {
    return 'needs_review';
  }

  if (Math.abs(totals.shadowTotalDelta) < 1 && shadow.excludedSummaryRows.length === live.excludedSummaryRows.length) {
    return 'inconclusive';
  }

  return 'needs_review';
}

function buildAdjudicationSummary(
  live: PlumbingNormalizedOutput['summary'],
  shadow: PlumbingNormalizedOutput['summary'],
  totals: TotalsComparison,
  changes: RowClassificationChange[],
  flags: Array<{ title: string }>,
  outcome: RecommendedOutcome
): string {
  const lines: string[] = [];

  lines.push('PLUMBING PARSER SHADOW COMPARISON — ADJUDICATION SUMMARY');
  lines.push('');

  lines.push(`Live parsed total: $${live.parsedValue.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`);
  lines.push(`Shadow parsed total: $${shadow.parsedValue.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`);
  if (totals.detectedDocumentTotal) {
    lines.push(`Detected document total: $${totals.detectedDocumentTotal.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`);
  }
  lines.push('');

  if (live.hasLikelyFinalTotalAsLineItem && !shadow.hasLikelyFinalTotalAsLineItem) {
    lines.push('FINDING: Live parser likely included the final contract total as a line item. Shadow parser correctly excluded it.');
  } else if (!live.hasLikelyFinalTotalAsLineItem && shadow.hasLikelyFinalTotalAsLineItem) {
    lines.push('FINDING: Shadow parser may be incorrectly including a total row. Live parser handled this correctly.');
  } else if (live.hasLikelyFinalTotalAsLineItem && shadow.hasLikelyFinalTotalAsLineItem) {
    lines.push('FINDING: Both parsers may be including a final total row. Manual review required.');
  } else {
    lines.push('FINDING: No clear evidence of final total row being included as a line item in either parser.');
  }

  lines.push('');
  lines.push(`Shadow excluded ${shadow.excludedSummaryRows.length} rows as summary/total rows (vs ${live.excludedSummaryRows.length} in live).`);

  if (changes.length > 0) {
    lines.push(`${changes.length} rows changed classification between live and shadow.`);
    const liveToShadowExcluded = changes.filter((c) => c.liveIncluded && !c.shadowIncluded);
    if (liveToShadowExcluded.length > 0) {
      lines.push(`Shadow newly excluded ${liveToShadowExcluded.length} rows that live included.`);
    }
  }

  if (totals.detectedDocumentTotal) {
    const liveDiff = totals.liveDiffToDocument ?? 0;
    const shadowDiff = totals.shadowDiffToDocument ?? 0;
    if (Math.abs(shadowDiff) < Math.abs(liveDiff)) {
      lines.push(`Shadow total ($${Math.abs(shadowDiff).toFixed(2)} off document) aligns better than live ($${Math.abs(liveDiff).toFixed(2)} off).`);
    } else if (Math.abs(liveDiff) < Math.abs(shadowDiff)) {
      lines.push(`Live total ($${Math.abs(liveDiff).toFixed(2)} off document) aligns better than shadow ($${Math.abs(shadowDiff).toFixed(2)} off).`);
    }
  }

  lines.push('');
  lines.push(`Recommended outcome: ${outcome.toUpperCase().replace(/_/g, ' ')}`);

  if (outcome === 'shadow_better') {
    lines.push('Shadow parser appears to correct a total-row inclusion issue. Suitable for internal beta after review.');
  } else if (outcome === 'needs_review') {
    lines.push('Manual review required before considering any rollout. Review suspicious rows and classification changes.');
  } else if (outcome === 'live_better') {
    lines.push('Live parser performs better on this quote. Shadow parser may need rule adjustments.');
  } else {
    lines.push('Insufficient evidence to determine which parser is better. Additional test quotes recommended.');
  }

  if (flags.length > 0) {
    lines.push('');
    lines.push(`Active risk flags (${flags.length}):`);
    for (const flag of flags.slice(0, 4)) {
      lines.push(`  - ${flag.title}`);
    }
  }

  return lines.join('\n');
}
