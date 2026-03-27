import { buildRiskFlags } from './plumbingNormalizer';
import type {
  PlumbingNormalizedOutput,
  PlumbingDiff,
  RowClassificationChange,
  TotalsComparison,
  RecommendedOutcome,
  DocumentTotalValidation,
  TotalCandidate,
  AnchorType,
  ClassifiedRow,
} from '../../../../types/plumbingDiscrepancy';

const SYSTEMIC_MISS_THRESHOLD = 500;
const EXTRACTION_MISMATCH_TOLERANCE = 50;

// ─── Anchor Ranking Constants ─────────────────────────────────────────────────
// Higher = stronger anchor. Priority order:
//   1. Explicit labeled totals (grand total / total price / contract total / final total) → 1000+
//   2. Final TOTAL row where both parsers agree                                          → 800
//   3. Final TOTAL row from live or shadow individually                                  → 700
//   4. Strong final summary row near end of quote                                        → 600
//   5. Max summary value fallback                                                        → 400
//   6. Detected/fallback from normaliser                                                 → 200

const ANCHOR_RANK: Record<AnchorType, number> = {
  explicit_total_price:       1100,
  explicit_grand_total:       1050,
  explicit_contract_total:    1000,
  explicit_final_total:        980,
  explicit_label:              960,
  final_total_row_agreed:      800,
  final_total_row_live:        700,
  final_total_row_shadow:      700,
  strong_final_summary:        600,
  max_summary:                 400,
  detected_live:               200,
  detected_shadow:             200,
};

// ─── Explicit Label Patterns ──────────────────────────────────────────────────

interface LabelMatch {
  anchorType: AnchorType;
  re: RegExp;
}

const EXPLICIT_LABEL_PATTERNS: LabelMatch[] = [
  { anchorType: 'explicit_total_price',    re: /\btotal\s+price\b/i },
  { anchorType: 'explicit_grand_total',    re: /\bgrand\s+total\b/i },
  { anchorType: 'explicit_contract_total', re: /\bcontract\s+total\b/i },
  { anchorType: 'explicit_final_total',    re: /\bfinal\s+total\b/i },
  { anchorType: 'explicit_label',          re: /\b(total\s+amount|total\s+value|total\s+cost|lump\s+sum\s+total)\b/i },
];

function classifyExplicitLabel(text: string): AnchorType | null {
  for (const { anchorType, re } of EXPLICIT_LABEL_PATTERNS) {
    if (re.test(text)) return anchorType;
  }
  return null;
}

// ─── Candidate Builder ─────────────────────────────────────────────────────────

function rowText(row: ClassifiedRow): string {
  return (row.rawText ?? row.normalizedDescription ?? '').trim();
}

function buildCandidatesFromRows(
  liveRows: ClassifiedRow[],
  shadowRows: ClassifiedRow[]
): TotalCandidate[] {
  const raw: TotalCandidate[] = [];

  // Pass 1 — scan all rows for explicit labels at highest confidence
  for (const row of [...liveRows, ...shadowRows]) {
    if (row.amount == null) continue;
    const text = rowText(row);
    const labelType = classifyExplicitLabel(text);
    if (labelType) {
      const rank = ANCHOR_RANK[labelType];
      raw.push({
        value: row.amount,
        anchorType: labelType,
        sourceText: text.slice(0, 120),
        confidence: 0.95,
        rankingScore: rank,
        selected: false,
        selectionReason: '',
      });
    }
  }

  // Pass 2 — final summary_total row from each parser
  const lastLiveSummary = liveRows
    .filter((r) => r.amount != null && r.classification === 'summary_total')
    .at(-1);
  const lastShadowSummary = shadowRows
    .filter((r) => r.amount != null && r.classification === 'summary_total')
    .at(-1);

  const liveTotal = lastLiveSummary?.amount ?? null;
  const shadowTotal = lastShadowSummary?.amount ?? null;

  if (liveTotal != null && shadowTotal != null && Math.abs(liveTotal - shadowTotal) < EXTRACTION_MISMATCH_TOLERANCE) {
    // Both parsers agree on the final row → strong confirmation
    raw.push({
      value: liveTotal,
      anchorType: 'final_total_row_agreed',
      sourceText: rowText(lastLiveSummary!),
      confidence: 0.88,
      rankingScore: ANCHOR_RANK['final_total_row_agreed'],
      selected: false,
      selectionReason: '',
    });
  } else {
    if (liveTotal != null) {
      raw.push({
        value: liveTotal,
        anchorType: 'final_total_row_live',
        sourceText: rowText(lastLiveSummary!),
        confidence: 0.80,
        rankingScore: ANCHOR_RANK['final_total_row_live'],
        selected: false,
        selectionReason: '',
      });
    }
    if (shadowTotal != null) {
      raw.push({
        value: shadowTotal,
        anchorType: 'final_total_row_shadow',
        sourceText: rowText(lastShadowSummary!),
        confidence: 0.80,
        rankingScore: ANCHOR_RANK['final_total_row_shadow'],
        selected: false,
        selectionReason: '',
      });
    }
  }

  // Pass 3 — strong final summary rows near the end of the quote (last 20% of rows)
  const NEAR_END_THRESHOLD = 0.8;
  const allRows = [...liveRows, ...shadowRows];
  const maxIndex = Math.max(...allRows.map((r) => r.rowIndex), 0);

  for (const row of allRows) {
    if (row.amount == null) continue;
    if (row.classification !== 'summary_total' && row.classification !== 'subtotal') continue;
    if (row.rowIndex / maxIndex < NEAR_END_THRESHOLD) continue;
    const text = rowText(row);
    if (classifyExplicitLabel(text)) continue; // already captured in pass 1
    raw.push({
      value: row.amount,
      anchorType: 'strong_final_summary',
      sourceText: text.slice(0, 120),
      confidence: 0.65,
      rankingScore: ANCHOR_RANK['strong_final_summary'],
      selected: false,
      selectionReason: '',
    });
  }

  // Pass 4 — max summary value fallback
  const summaryAmounts = allRows
    .filter((r) => r.amount != null && (r.classification === 'summary_total' || r.classification === 'subtotal'))
    .map((r) => r.amount!);

  if (summaryAmounts.length > 0) {
    const maxVal = Math.max(...summaryAmounts);
    const maxRow = allRows.find((r) => r.amount === maxVal);
    raw.push({
      value: maxVal,
      anchorType: 'max_summary',
      sourceText: maxRow ? rowText(maxRow).slice(0, 120) : 'max of summary rows',
      confidence: 0.55,
      rankingScore: ANCHOR_RANK['max_summary'],
      selected: false,
      selectionReason: '',
    });
  }

  return raw;
}

function addDetectedCandidates(
  raw: TotalCandidate[],
  liveDetected: number | null,
  shadowDetected: number | null
): TotalCandidate[] {
  const out = [...raw];
  if (liveDetected != null) {
    out.push({
      value: liveDetected,
      anchorType: 'detected_live',
      sourceText: 'normaliser detected total (live)',
      confidence: 0.50,
      rankingScore: ANCHOR_RANK['detected_live'],
      selected: false,
      selectionReason: '',
    });
  }
  if (shadowDetected != null) {
    out.push({
      value: shadowDetected,
      anchorType: 'detected_shadow',
      sourceText: 'normaliser detected total (shadow)',
      confidence: 0.50,
      rankingScore: ANCHOR_RANK['detected_shadow'],
      selected: false,
      selectionReason: '',
    });
  }
  return out;
}

/**
 * Deduplicate by value, keeping the highest-ranked anchor for each dollar value.
 */
function deduplicateAndRank(candidates: TotalCandidate[]): TotalCandidate[] {
  const seen = new Map<number, TotalCandidate>();
  for (const c of candidates) {
    const existing = seen.get(c.value);
    if (!existing || c.rankingScore > existing.rankingScore) {
      seen.set(c.value, c);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.rankingScore - a.rankingScore);
}

/**
 * Choose the winning candidate and annotate all candidates with
 * selected/selectionReason so the inspector panel can display them.
 */
function selectWinner(
  candidates: TotalCandidate[],
  detectedDocumentTotal: number | null
): TotalCandidate[] {
  if (candidates.length === 0) return candidates;

  const best = candidates[0];

  return candidates.map((c, i) => {
    const isWinner = i === 0;

    let reason: string;
    if (isWinner) {
      reason = `Selected — highest anchor rank (${c.rankingScore}): ${c.anchorType}`;
    } else if (
      detectedDocumentTotal != null &&
      c.anchorType === 'detected_live' &&
      best.rankingScore > ANCHOR_RANK['detected_live']
    ) {
      reason = `Rejected — weaker anchor (${c.rankingScore}) than winner (${best.rankingScore}). Detected fallback overridden by ${best.anchorType}.`;
    } else {
      reason = `Not selected — lower anchor rank (${c.rankingScore}) than winner (${best.rankingScore})`;
    }

    return { ...c, selected: isWinner, selectionReason: reason };
  });
}

// ─── Main Validation Entry Point ──────────────────────────────────────────────

export function validateDocumentTotal(
  liveOutput: PlumbingNormalizedOutput,
  shadowOutput: PlumbingNormalizedOutput
): DocumentTotalValidation {
  const liveDetected = liveOutput.summary.detectedDocumentTotal;
  const shadowDetected = shadowOutput.summary.detectedDocumentTotal;
  const detectedDocumentTotal = shadowDetected ?? liveDetected;

  // Build candidates — FIX: was passing liveOutput.rows twice; now uses both parsers' rows
  const rawFromRows = buildCandidatesFromRows(liveOutput.rows, shadowOutput.rows);
  const rawAll = addDetectedCandidates(rawFromRows, liveDetected, shadowDetected);
  const ranked = deduplicateAndRank(rawAll);
  const annotated = selectWinner(ranked, detectedDocumentTotal);

  const winner = annotated.find((c) => c.selected) ?? null;
  const validatedDocumentTotal = winner?.value ?? null;

  let extractionMismatch = false;
  let mismatchReason: string | null = null;

  if (
    detectedDocumentTotal != null &&
    validatedDocumentTotal != null &&
    Math.abs(detectedDocumentTotal - validatedDocumentTotal) > EXTRACTION_MISMATCH_TOLERANCE
  ) {
    extractionMismatch = true;
    mismatchReason =
      `Detected total ${fmt(detectedDocumentTotal)} was overridden by a stronger anchor (${winner!.anchorType}) ` +
      `yielding validated total ${fmt(validatedDocumentTotal)}. ` +
      `Difference: ${fmt(Math.abs(detectedDocumentTotal - validatedDocumentTotal))}.`;
  }

  return {
    detectedDocumentTotal,
    validatedDocumentTotal,
    anchorType: winner?.anchorType ?? null,
    anchorSourceText: winner?.sourceText ?? null,
    anchorConfidence: winner?.confidence ?? null,
    extractionMismatch,
    mismatchReason,
    candidates: annotated,
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
    lines.push(
      `  Validated document total: ${fmt(totals.validatedDocumentTotal)} (anchor: ${validation.anchorType ?? 'unknown'}, confidence: ${((validation.anchorConfidence ?? 0) * 100).toFixed(0)}%)`
    );
    if (validation.anchorSourceText) {
      lines.push(`  Anchor source text: "${validation.anchorSourceText}"`);
    }
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

  // Candidate summary (top 3)
  const topCandidates = validation.candidates.slice(0, 3);
  if (topCandidates.length > 1) {
    lines.push('CANDIDATES CONSIDERED');
    for (const c of topCandidates) {
      const tag = c.selected ? '[WINNER]' : '[rejected]';
      lines.push(`  ${tag} ${fmt(c.value)} — ${c.anchorType} (rank ${c.rankingScore}, ${(c.confidence * 100).toFixed(0)}%)`);
    }
    lines.push('');
  }

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
      'The detected total was overridden by a stronger anchor — confirm the validated total is correct.'
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
