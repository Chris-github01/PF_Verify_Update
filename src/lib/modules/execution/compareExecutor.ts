import type {
  PlumbingParserOutput,
  PlumbingCompareResult,
  PlumbingClassificationChange,
  PlumbingRiskFlag,
} from '../parsers/plumbing/types';

export function buildPlumbingCompare(
  liveOutput: PlumbingParserOutput,
  shadowOutput: PlumbingParserOutput
): PlumbingCompareResult {
  const liveParsedTotal = liveOutput.parsedValue;
  const shadowParsedTotal = shadowOutput.parsedValue;
  const totalsDelta = shadowParsedTotal - liveParsedTotal;
  const totalsMatch = Math.abs(totalsDelta) < 1;

  const detectedDocumentTotal =
    shadowOutput.detectedDocumentTotal ?? liveOutput.detectedDocumentTotal ?? null;

  const liveDiffToDocument = detectedDocumentTotal != null
    ? liveParsedTotal - detectedDocumentTotal
    : null;
  const shadowDiffToDocument = detectedDocumentTotal != null
    ? shadowParsedTotal - detectedDocumentTotal
    : null;

  const shadowIsBetter = detectedDocumentTotal != null
    ? Math.abs(shadowDiffToDocument ?? Infinity) < Math.abs(liveDiffToDocument ?? Infinity)
    : liveOutput.hasLikelyFinalTotalAsLineItem && !shadowOutput.hasLikelyFinalTotalAsLineItem;

  const itemCountDelta = shadowOutput.includedLineCount - liveOutput.includedLineCount;
  const excludedCountDelta = shadowOutput.excludedLineCount - liveOutput.excludedLineCount;

  const changedClassifications = buildChangedClassifications(liveOutput, shadowOutput);
  const riskFlags = buildRiskFlags(liveOutput, shadowOutput, totalsDelta, detectedDocumentTotal);

  const recommendation = deriveRecommendation(
    liveOutput,
    shadowOutput,
    liveDiffToDocument,
    shadowDiffToDocument,
    riskFlags
  );

  const adjudicationSummary = buildAdjudicationSummary(
    liveOutput,
    shadowOutput,
    totalsDelta,
    liveDiffToDocument,
    shadowDiffToDocument,
    changedClassifications,
    riskFlags,
    recommendation
  );

  return {
    liveOutput,
    shadowOutput,
    liveParsedTotal,
    shadowParsedTotal,
    totalsDelta,
    totalsMatch,
    detectedDocumentTotal,
    liveDiffToDocument,
    shadowDiffToDocument,
    shadowIsBetter,
    itemCountDelta,
    excludedCountDelta,
    changedClassifications,
    riskFlags,
    recommendation,
    adjudicationSummary,
    executedAt: new Date().toISOString(),
  };
}

function buildChangedClassifications(
  live: PlumbingParserOutput,
  shadow: PlumbingParserOutput
): PlumbingClassificationChange[] {
  const shadowByIndex = new Map(shadow.allRows.map((r) => [r.rowIndex, r]));
  const changes: PlumbingClassificationChange[] = [];

  for (const liveRow of live.allRows) {
    const shadowRow = shadowByIndex.get(liveRow.rowIndex);
    if (!shadowRow) continue;

    if (
      liveRow.classification !== shadowRow.classification ||
      liveRow.includedInParsedTotal !== shadowRow.includedInParsedTotal
    ) {
      changes.push({
        rowIndex: liveRow.rowIndex,
        rawText: liveRow.description,
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

  return changes;
}

function buildRiskFlags(
  live: PlumbingParserOutput,
  shadow: PlumbingParserOutput,
  totalsDelta: number,
  documentTotal: number | null
): PlumbingRiskFlag[] {
  const flags: PlumbingRiskFlag[] = [];

  if (live.hasLikelyFinalTotalAsLineItem && !shadow.hasLikelyFinalTotalAsLineItem) {
    flags.push({
      id: 'live_includes_final_total',
      severity: 'critical',
      title: 'Live parser likely includes final contract total as a line item',
      explanation: 'Shadow parser correctly identified and excluded the final total row.',
      suggestedAction: 'Review excluded rows in shadow output to confirm correctness.',
    });
  }

  if (!live.hasLikelyFinalTotalAsLineItem && shadow.hasLikelyFinalTotalAsLineItem) {
    flags.push({
      id: 'shadow_may_exclude_valid_row',
      severity: 'warning',
      title: 'Shadow parser may be incorrectly excluding a valid line item',
      explanation: 'Live parser did not flag this row; shadow exclusion may be over-aggressive.',
      suggestedAction: 'Manually review the shadow excluded rows for false positives.',
    });
  }

  if (live.hasDuplicateValueRisk) {
    flags.push({
      id: 'duplicate_value_risk_live',
      severity: 'warning',
      title: 'Live output contains duplicate high-value amounts',
      explanation: 'Multiple included rows share the same large amount — possible double-count.',
      suggestedAction: 'Check for duplicate line items or subtotal rows included in live total.',
    });
  }

  if (Math.abs(totalsDelta) > 10000) {
    flags.push({
      id: 'large_totals_delta',
      severity: 'critical',
      title: `Large variance between live and shadow totals ($${Math.abs(totalsDelta).toFixed(2)})`,
      explanation: 'A delta this large suggests a significant classification difference.',
      suggestedAction: 'Review changed classifications to identify the source of variance.',
    });
  }

  if (documentTotal != null && live.hasTotalMismatch && !shadow.hasTotalMismatch) {
    flags.push({
      id: 'shadow_resolves_mismatch',
      severity: 'info',
      title: 'Shadow parser resolves document total mismatch',
      explanation: 'Shadow total aligns with the detected document total; live total does not.',
      suggestedAction: 'Shadow parser improvement confirmed — consider promoting after full review.',
    });
  }

  if (shadow.suspiciousRows.length > live.suspiciousRows.length) {
    flags.push({
      id: 'shadow_more_suspicious_rows',
      severity: 'info',
      title: `Shadow parser flags ${shadow.suspiciousRows.length} suspicious rows (vs ${live.suspiciousRows.length} in live)`,
      explanation: 'Shadow uses stricter thresholds for suspicious row detection.',
      suggestedAction: 'Review suspicious rows to ensure no false positives.',
    });
  }

  if (shadow.excludedSummaryRows.length > live.excludedSummaryRows.length + 5) {
    flags.push({
      id: 'shadow_over_exclusion',
      severity: 'warning',
      title: `Shadow excludes ${shadow.excludedSummaryRows.length - live.excludedSummaryRows.length} more rows than live`,
      explanation: 'Shadow may be over-excluding. Verify excluded rows are not valid line items.',
      suggestedAction: 'Review the shadow excluded rows list carefully before promoting.',
    });
  }

  return flags;
}

function deriveRecommendation(
  live: PlumbingParserOutput,
  shadow: PlumbingParserOutput,
  liveDiffToDocument: number | null,
  shadowDiffToDocument: number | null,
  flags: PlumbingRiskFlag[]
): PlumbingCompareResult['recommendation'] {
  if (liveDiffToDocument != null && shadowDiffToDocument != null) {
    const liveDiff = Math.abs(liveDiffToDocument);
    const shadowDiff = Math.abs(shadowDiffToDocument);

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

  const criticalFlags = flags.filter((f) => f.severity === 'critical');
  if (criticalFlags.length >= 2 || shadow.suspiciousRows.length > 5) {
    return 'needs_review';
  }

  if (Math.abs(shadow.parsedValue - live.parsedValue) < 1 &&
    shadow.excludedLineCount === live.excludedLineCount) {
    return 'inconclusive';
  }

  return 'needs_review';
}

function buildAdjudicationSummary(
  live: PlumbingParserOutput,
  shadow: PlumbingParserOutput,
  totalsDelta: number,
  liveDiffToDocument: number | null,
  shadowDiffToDocument: number | null,
  changes: PlumbingClassificationChange[],
  flags: PlumbingRiskFlag[],
  recommendation: PlumbingCompareResult['recommendation']
): string {
  const lines: string[] = [];
  lines.push('PLUMBING PARSER SHADOW COMPARISON — ADJUDICATION SUMMARY');
  lines.push('');
  lines.push(`Live parsed total:   $${live.parsedValue.toFixed(2)}`);
  lines.push(`Shadow parsed total: $${shadow.parsedValue.toFixed(2)}`);
  lines.push(`Delta:               $${totalsDelta.toFixed(2)}`);

  if (live.detectedDocumentTotal ?? shadow.detectedDocumentTotal) {
    const docTotal = shadow.detectedDocumentTotal ?? live.detectedDocumentTotal;
    lines.push(`Document total:      $${docTotal?.toFixed(2)}`);
    if (liveDiffToDocument != null) lines.push(`Live off by:         $${liveDiffToDocument.toFixed(2)}`);
    if (shadowDiffToDocument != null) lines.push(`Shadow off by:       $${shadowDiffToDocument.toFixed(2)}`);
  }

  lines.push('');
  lines.push(`Changed classifications: ${changes.length}`);
  lines.push(`Shadow excluded: ${shadow.excludedLineCount} rows (live: ${live.excludedLineCount})`);

  if (flags.length > 0) {
    lines.push('');
    lines.push(`Risk flags (${flags.length}):`);
    for (const flag of flags) {
      lines.push(`  [${flag.severity.toUpperCase()}] ${flag.title}`);
    }
  }

  lines.push('');
  lines.push(`RECOMMENDATION: ${recommendation.toUpperCase().replace(/_/g, ' ')}`);

  if (recommendation === 'shadow_better') {
    lines.push('Shadow parser improvement confirmed. Suitable for internal beta after review.');
  } else if (recommendation === 'live_better') {
    lines.push('Live parser performs better on this quote. Shadow rules may need adjustment.');
  } else if (recommendation === 'needs_review') {
    lines.push('Manual review required before any rollout consideration.');
  } else {
    lines.push('Parsers produce equivalent results. Additional test quotes recommended.');
  }

  return lines.join('\n');
}
