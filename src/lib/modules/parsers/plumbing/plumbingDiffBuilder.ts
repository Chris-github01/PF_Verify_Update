import { buildRiskFlags } from './plumbingNormalizer';
import type {
  PlumbingNormalizedOutput,
  PlumbingDiff,
  RowClassificationChange,
  TotalsComparison,
  RecommendedOutcome,
  DocumentTotalValidation,
  ClassifiedRow,
} from '../../../../types/plumbingDiscrepancy';

const SYSTEMIC_MISS_THRESHOLD = 500;
const EXTRACTION_MISMATCH_TOLERANCE = 50;

// ─── Document Total Validation ────────────────────────────────────────────────

interface TotalCandidate {
  value: number;
  anchorType: string;
  confidence: number;
}

const EXPLICIT_LABEL_RE = /\b(total\s+price|contract\s+total|grand\s+total|total\s+amount|total\s+value)\b/i;

function buildTotalCandidates(
  liveRows: ClassifiedRow[],
  shadowRows: ClassifiedRow[],
  liveDetected: number | null,
  shadowDetected: number | null
): TotalCandidate[] {
  const candidates: TotalCandidate[] = [];
  const allRows = [...liveRows, ...shadowRows];

  for (const row of allRows) {
    if (row.amount == null) continue;
    const text = row.rawText ?? row.normalizedDescription ?? '';
    if (EXPLICIT_LABEL_RE.test(text) && row.classification === 'summary_total') {
      candidates.push({ value: row.amount, anchorType: 'explicit_label', confidence: 0.95 });
    }
  }

  const lastLive = liveRows.filter((r) => r.amount != null && r.classification === 'summary_total').at(-1);
  const lastShadow = shadowRows.filter((r) => r.amount != null && r.classification === 'summary_total').at(-1);

  if (lastLive?.amount != null) {
    candidates.push({ value: lastLive.amount, anchorType: 'final_total_row_live', confidence: 0.8 });
  }
  if (lastShadow?.amount != null) {
    candidates.push({ value: lastShadow.amount, anchorType: 'final_total_row_shadow', confidence: 0.8 });
  }

  const summaryAmounts = allRows
    .filter((r) => r.amount != null && (r.classification === 'summary_total' || r.classification === 'subtotal'))
    .map((r) => r.amount!);

  if (summaryAmounts.length > 0) {
    candidates.push({ value: Math.max(...summaryAmounts), anchorType: 'max_summary', confidence: 0.6 });
  }

  if (liveDetected != null) {
    candidates.push({ value: liveDetected, anchorType: 'detected_live', confidence: 0.5 });
  }
  if (shadowDetected != null) {
    candidates.push({ value: shadowDetected, anchorType: 'detected_shadow', confidence: 0.5 });
  }

  return candidates;
}

function deduplicateCandidates(candidates: TotalCandidate[]): TotalCandidate[] {
  const seen = new Map<number, TotalCandidate>();
  for (const c of candidates) {
    const existing = seen.get(c.value);
    if (!existing || c.confidence > existing.confidence) {
      seen.set(c.value, c);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
}

export function validateDocumentTotal(
  liveOutput: PlumbingNormalizedOutput,
  shadowOutput: PlumbingNormalizedOutput
): DocumentTotalValidation {
  const liveDetected = liveOutput.summary.detectedDocumentTotal;
  const shadowDetected = shadowOutput.summary.detectedDocumentTotal;
  const detectedDocumentTotal = shadowDetected ?? liveDetected;

  const rawCandidates = buildTotalCandidates(
    liveOutput.rows,
    shadowOutput.rows,
    liveDetected,
    shadowDetected
  );
  const candidates = deduplicateCandidates(rawCandidates);
  const best = candidates[0] ?? null;
  const validatedDocumentTotal = best?.value ?? null;

  let extractionMismatch = false;
  let mismatchReason: string | null = null;

  if (
    detectedDocumentTotal != null &&
    validatedDocumentTotal != null &&
    Math.abs(detectedDocumentTotal - validatedDocumentTotal) > EXTRACTION_MISMATCH_TOLERANCE
  ) {
    extractionMismatch = true;
    mismatchReason =
      `Detected total ${fmt(detectedDocumentTotal)} differs from validated total ${fmt(validatedDocumentTotal)} ` +
      `by ${fmt(Math.abs(detectedDocumentTotal - validatedDocumentTotal))} ` +
      `(anchor: ${best?.anchorType ?? 'unknown'})`;
  }

  return {
    detectedDocumentTotal,
    validatedDocumentTotal,
    extractionMismatch,
    mismatchReason,
    candidates,
  };
}

// ─── Systemic Miss ─────────────────────────────────────────────────────────────

function computeSystemicMiss(
  liveParsedTotal: number,
  shadowParsedTotal: number,
  anchorTotal: number | null
): { isSystemicMiss: boolean; documentGap: number | null } {
  if (anchorTotal == null) {
    return { isSystemicMiss: false, documentGap: null };
  }
  const parsersAgree = Math.abs(liveParsedTotal - shadowParsedTotal) < 1;
  const gap = anchorTotal - liveParsedTotal;
  const isSystemicMiss = parsersAgree && Math.abs(gap) > SYSTEMIC_MISS_THRESHOLD;
  return { isSystemicMiss, documentGap: gap };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `$${n.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;
}

// ─── Diff Builder ─────────────────────────────────────────────────────────────

export function buildPlumbingDiff(
  live: PlumbingNormalizedOutput,
  shadow: PlumbingNormalizedOutput
): PlumbingDiff {
  const liveSummary = live.summary;
  const shadowSummary = shadow.summary;

  const documentTotalValidation = validateDocumentTotal(live, shadow);
  const { validatedDocumentTotal, detectedDocumentTotal, extractionMismatch } = documentTotalValidation;

  const anchorTotal = validatedDocumentTotal ?? detectedDocumentTotal;

  const { isSystemicMiss, documentGap } = computeSystemicMiss(
    liveSummary.parsedValue,
    shadowSummary.parsedValue,
    anchorTotal
  );

  const validatedDocumentGap =
    validatedDocumentTotal != null ? validatedDocumentTotal - liveSummary.parsedValue : null;

  const totalsComparison: TotalsComparison = {
    liveParsedTotal: liveSummary.parsedValue,
    shadowParsedTotal: shadowSummary.parsedValue,
    detectedDocumentTotal,
    validatedDocumentTotal,
    documentTotalExtractionMismatch: extractionMismatch,
    liveDiffToDocument: liveSummary.differenceToDocumentTotal,
    shadowDiffToDocument: shadowSummary.differenceToDocumentTotal,
    validatedDocumentGap,
    shadowIsBetter: isShadowBetter(liveSummary, shadowSummary, anchorTotal),
    shadowTotalDelta: shadowSummary.parsedValue - liveSummary.parsedValue,
    isSystemicMiss,
    documentGap,
  };

  const rowClassificationChanges: RowClassificationChange[] = [];
  const shadowRowsByIndex = new Map(shadow.rows.map((r) => [r.rowIndex, r]));

  for (const liveRow of live.rows) {
    const shadowRow = shadowRowsByIndex.get(liveRow.rowIndex);
    if (!shadowRow) continue;
    if (
      liveRow.classification !== shadowRow.classification ||
      liveRow.includedInParsedTotal !== shadowRow.includedInParsedTotal
    ) {
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
    riskFlags.length,
    documentTotalValidation
  );

  const adjudicationSummary = buildAdjudicationSummary(
    liveSummary,
    shadowSummary,
    totalsComparison,
    rowClassificationChanges,
    riskFlags,
    recommendedOutcome,
    documentTotalValidation
  );

  return {
    totalsComparison,
    documentTotalValidation,
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
    systemicFailure: isSystemicMiss,
  };
}

function isShadowBetter(
  live: PlumbingNormalizedOutput['summary'],
  shadow: PlumbingNormalizedOutput['summary'],
  anchorTotal: number | null
): boolean {
  const docTotal = anchorTotal ?? shadow.detectedDocumentTotal ?? live.detectedDocumentTotal;
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
  flagCount: number,
  validation: DocumentTotalValidation
): RecommendedOutcome {
  if (validation.extractionMismatch) {
    return 'needs_review';
  }

  if (totals.isSystemicMiss) {
    return 'systemic_failure';
  }

  const anchorTotal = totals.validatedDocumentTotal ?? totals.detectedDocumentTotal;

  if (anchorTotal) {
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

  if (
    Math.abs(totals.shadowTotalDelta) < 1 &&
    shadow.excludedSummaryRows.length === live.excludedSummaryRows.length
  ) {
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
  outcome: RecommendedOutcome,
  validation: DocumentTotalValidation
): string {
  const lines: string[] = [];

  lines.push('PLUMBING PARSER SHADOW COMPARISON — ADJUDICATION SUMMARY');
  lines.push('');

  lines.push(`Live parsed total:   ${fmt(live.parsedValue)}`);
  lines.push(`Shadow parsed total: ${fmt(shadow.parsedValue)}`);
  lines.push('');

  lines.push('DOCUMENT TOTAL EXTRACTION');
  lines.push(
    `  Detected document total:  ${totals.detectedDocumentTotal != null ? fmt(totals.detectedDocumentTotal) : 'Not detected'}`
  );
  if (totals.validatedDocumentTotal != null) {
    const bestAnchor = validation.candidates[0];
    lines.push(
      `  Validated document total: ${fmt(totals.validatedDocumentTotal)} (anchor: ${bestAnchor?.anchorType ?? 'unknown'})`
    );
  } else {
    lines.push('  Validated document total: Not available');
  }

  if (validation.extractionMismatch && validation.mismatchReason) {
    lines.push('');
    lines.push('⚠ DOCUMENT TOTAL EXTRACTION MISMATCH DETECTED');
    lines.push(`  ${validation.mismatchReason}`);
    lines.push('  The detected document total may not reflect the true contract value.');
    lines.push('  Discrepancy analysis is anchored to the validated total instead.');
  }

  if (totals.validatedDocumentGap != null) {
    const gapAbs = Math.abs(totals.validatedDocumentGap);
    const direction = totals.validatedDocumentGap > 0 ? 'under-counted' : 'over-counted';
    lines.push(`  True missing value (vs validated): ${fmt(gapAbs)} (${direction})`);
  }
  lines.push('');

  if (totals.isSystemicMiss && totals.documentGap != null) {
    const gapAmt = Math.abs(totals.documentGap);
    const direction = totals.documentGap > 0 ? 'under-counted' : 'over-counted';
    lines.push('⚠ SYSTEMIC FAILURE DETECTED');
    lines.push(
      `Both parsers produce identical totals, yet both diverge from the anchor total by ${fmt(gapAmt)}.`
    );
    lines.push(`The document appears to be ${direction} by this amount.`);
    lines.push('This is not a disagreement between parsers — it is a shared blind spot.');
    lines.push('');
    lines.push('LIKELY ROOT CAUSE: summary row detection logic is excluding one or more valid cost lines.');
    lines.push('Review rows with phrase_match signals to identify any billable items being incorrectly excluded.');
    lines.push('');
  } else if (live.hasLikelyFinalTotalAsLineItem && !shadow.hasLikelyFinalTotalAsLineItem) {
    lines.push(
      'FINDING: Live parser likely included the final contract total as a line item. Shadow parser correctly excluded it.'
    );
  } else if (!live.hasLikelyFinalTotalAsLineItem && shadow.hasLikelyFinalTotalAsLineItem) {
    lines.push(
      'FINDING: Shadow parser may be incorrectly including a total row. Live parser handled this correctly.'
    );
  } else if (live.hasLikelyFinalTotalAsLineItem && shadow.hasLikelyFinalTotalAsLineItem) {
    lines.push('FINDING: Both parsers may be including a final total row. Manual review required.');
  } else {
    lines.push(
      'FINDING: No clear evidence of final total row being included as a line item in either parser.'
    );
  }

  lines.push('');
  lines.push(
    `Shadow excluded ${shadow.excludedSummaryRows.length} rows as summary/total rows (vs ${live.excludedSummaryRows.length} in live).`
  );

  if (changes.length > 0) {
    lines.push(`${changes.length} rows changed classification between live and shadow.`);
    const liveToShadowExcluded = changes.filter((c) => c.liveIncluded && !c.shadowIncluded);
    if (liveToShadowExcluded.length > 0) {
      lines.push(`Shadow newly excluded ${liveToShadowExcluded.length} rows that live included.`);
    }
  }

  const anchorTotal = totals.validatedDocumentTotal ?? totals.detectedDocumentTotal;
  if (anchorTotal && !totals.isSystemicMiss) {
    const liveDiff = totals.liveDiffToDocument ?? 0;
    const shadowDiff = totals.shadowDiffToDocument ?? 0;
    if (Math.abs(shadowDiff) < Math.abs(liveDiff)) {
      lines.push(
        `Shadow total (${fmt(Math.abs(shadowDiff))} off anchor) aligns better than live (${fmt(Math.abs(liveDiff))} off).`
      );
    } else if (Math.abs(liveDiff) < Math.abs(shadowDiff)) {
      lines.push(
        `Live total (${fmt(Math.abs(liveDiff))} off anchor) aligns better than shadow (${fmt(Math.abs(shadowDiff))} off).`
      );
    }
  }

  lines.push('');
  lines.push(`Recommended outcome: ${outcome.toUpperCase().replace(/_/g, ' ')}`);

  if (validation.extractionMismatch) {
    lines.push(
      'Recommended action: first verify document total extraction accuracy before comparing parsers.'
    );
    lines.push(
      'The detected total may be wrong — review extracted candidates and confirm the true contract total.'
    );
    if (totals.isSystemicMiss) {
      lines.push('');
      lines.push('Note: even after correcting extraction, a systemic parser miss may still exist.');
    }
  } else if (outcome === 'systemic_failure') {
    lines.push('Parser logic is likely excluding valid cost lines. Both parsers share the same exclusion defect.');
    lines.push(
      'Recommended action: review summary row detection rules, particularly phrase_match confidence thresholds.'
    );
    lines.push('Do not promote shadow parser until the shared exclusion issue is resolved.');
  } else if (outcome === 'shadow_better') {
    lines.push(
      'Shadow parser appears to correct a total-row inclusion issue. Suitable for internal beta after review.'
    );
  } else if (outcome === 'needs_review') {
    lines.push(
      'Manual review required before considering any rollout. Review suspicious rows and classification changes.'
    );
  } else if (outcome === 'live_better') {
    lines.push('Live parser performs better on this quote. Shadow parser may need rule adjustments.');
  } else {
    lines.push(
      'Insufficient evidence to determine which parser is better. Additional test quotes recommended.'
    );
  }

  if (flags.length > 0) {
    lines.push('');
    lines.push(`Active risk flags (${flags.length}):`);
    for (const flag of flags.slice(0, 6)) {
      lines.push(`  - ${flag.title}`);
    }
  }

  return lines.join('\n');
}
