import { normalizeForShadowCompare } from '../plumbingNormalizer';
import { buildRiskFlags } from '../plumbingNormalizer';
import { buildAssertions } from './buildAssertions';
import { PLUMBING_REGRESSION_CONFIG as CFG } from './regressionConfig';
import type {
  RegressionCaseInput,
  CaseActualOutput,
  CaseEvalResult,
  CaseMetrics,
  PassStatus,
} from './types';

function outputFromNormalized(
  normalized: ReturnType<typeof normalizeForShadowCompare>,
  riskFlagIds: string[]
): CaseActualOutput {
  const { summary, includedRows, excludedRows } = normalized;

  const excludedPhrases = excludedRows.flatMap((r) =>
    r.detectionSignals
      .filter((s) => s.startsWith('phrase_match:'))
      .map((s) => s.replace('phrase_match:', ''))
  );

  return {
    parsedTotal: summary.parsedValue,
    detectedDocumentTotal: summary.detectedDocumentTotal,
    includedLineCount: includedRows.length,
    excludedLineCount: excludedRows.length,
    excludedSummaryPhrases: [...new Set(excludedPhrases)],
    riskFlagIds,
    classifiedRows: normalized.rows.map((r) => ({
      rowIndex: r.rowIndex,
      rawText: r.rawText,
      classification: r.classification,
      includedInParsedTotal: r.includedInParsedTotal,
      amount: r.amount,
      detectionSignals: r.detectionSignals,
    })),
    parserWarnings: summary.parserWarnings,
  };
}

function derivePassStatus(assertionResults: ReturnType<typeof buildAssertions>): PassStatus {
  const hasCritical = assertionResults.some((a) => !a.passed && a.severity === 'critical');
  if (hasCritical) return 'fail_critical';
  const hasHigh = assertionResults.some((a) => !a.passed && a.severity === 'high');
  if (hasHigh) return 'fail_major';
  const hasMedLow = assertionResults.some((a) => !a.passed && (a.severity === 'medium' || a.severity === 'low'));
  if (hasMedLow) return 'fail_minor';
  return 'pass';
}

function buildMetrics(
  live: CaseActualOutput,
  shadow: CaseActualOutput,
  expectedParsedTotal: number | null | undefined,
  expectedDocTotal: number | null | undefined
): CaseMetrics {
  const liveTotalDelta = expectedParsedTotal != null ? live.parsedTotal - expectedParsedTotal : null;
  const shadowTotalDelta = expectedParsedTotal != null ? shadow.parsedTotal - expectedParsedTotal : null;
  const liveDocTotalDelta = expectedDocTotal != null && live.detectedDocumentTotal != null
    ? live.detectedDocumentTotal - expectedDocTotal : null;
  const shadowDocTotalDelta = expectedDocTotal != null && shadow.detectedDocumentTotal != null
    ? shadow.detectedDocumentTotal - expectedDocTotal : null;

  const shadowBetterThanLive =
    liveTotalDelta !== null && shadowTotalDelta !== null
      ? Math.abs(shadowTotalDelta) < Math.abs(liveTotalDelta)
      : live.excludedLineCount < shadow.excludedLineCount;

  const shadowMatchedExpectedTotal =
    shadowTotalDelta !== null &&
    Math.abs(shadowTotalDelta) <= CFG.defaultToleranceAbsolute;

  const liveMatchedExpectedTotal =
    liveTotalDelta !== null &&
    Math.abs(liveTotalDelta) <= CFG.defaultToleranceAbsolute;

  const liveClassMap = new Map(live.classifiedRows.map((r) => [r.rowIndex, r]));
  const shadowClassMap = new Map(shadow.classifiedRows.map((r) => [r.rowIndex, r]));
  let classificationMismatchCount = 0;
  for (const [idx, lRow] of liveClassMap) {
    const sRow = shadowClassMap.get(idx);
    if (sRow && (sRow.classification !== lRow.classification || sRow.includedInParsedTotal !== lRow.includedInParsedTotal)) {
      classificationMismatchCount++;
    }
  }

  const liveRiskSet = new Set(live.riskFlagIds);
  const shadowRiskSet = new Set(shadow.riskFlagIds);
  let riskFlagMismatchCount = 0;
  for (const id of liveRiskSet) if (!shadowRiskSet.has(id)) riskFlagMismatchCount++;
  for (const id of shadowRiskSet) if (!liveRiskSet.has(id)) riskFlagMismatchCount++;

  return {
    liveTotalDelta,
    shadowTotalDelta,
    liveDocTotalDelta,
    shadowDocTotalDelta,
    includedLineDelta: shadow.includedLineCount - live.includedLineCount,
    excludedLineDelta: shadow.excludedLineCount - live.excludedLineCount,
    classificationMismatchCount,
    riskFlagMismatchCount,
    shadowBetterThanLive,
    shadowMatchedExpectedTotal,
    liveMatchedExpectedTotal,
  };
}

export async function evaluateCase(
  caseInput: RegressionCaseInput,
  liveRawRows: Array<Record<string, unknown>>,
  shadowRawRows: Array<Record<string, unknown>>,
  documentTotal?: number | null
): Promise<CaseEvalResult> {
  const { expectedOutcome, isMustPass, caseLabel, id: caseId, sourceType, sourceId } = caseInput;

  const docTotal = documentTotal ?? expectedOutcome.expectedDocumentTotal ?? null;

  const liveNorm = normalizeForShadowCompare(liveRawRows, docTotal);
  const shadowNorm = normalizeForShadowCompare(shadowRawRows, docTotal);

  const liveRiskFlags = buildRiskFlags(liveNorm.summary, shadowNorm.summary);
  const shadowRiskFlags = buildRiskFlags(liveNorm.summary, shadowNorm.summary);

  const liveOutput = outputFromNormalized(liveNorm, liveRiskFlags.map((f) => f.id));
  const shadowOutput = outputFromNormalized(shadowNorm, shadowRiskFlags.map((f) => f.id));

  const liveAssertions = buildAssertions(expectedOutcome, liveOutput);
  const shadowAssertions = buildAssertions(expectedOutcome, shadowOutput);

  const livePassStatus = derivePassStatus(liveAssertions);
  const shadowPassStatus = derivePassStatus(shadowAssertions);

  const allAssertionResults = shadowAssertions;

  const failureReasons = shadowAssertions
    .filter((a) => !a.passed)
    .map((a) => `[${a.severity.toUpperCase()}] ${a.label}: expected ${a.expected}, got ${a.actual}`);

  const worstSeverity = (() => {
    if (shadowAssertions.some((a) => !a.passed && a.severity === 'critical')) return 'critical';
    if (shadowAssertions.some((a) => !a.passed && a.severity === 'high')) return 'high';
    if (shadowAssertions.some((a) => !a.passed && a.severity === 'medium')) return 'medium';
    if (shadowAssertions.some((a) => !a.passed && a.severity === 'low')) return 'low';
    return 'info';
  })();

  const metrics = buildMetrics(
    liveOutput,
    shadowOutput,
    expectedOutcome.expectedParsedTotal,
    expectedOutcome.expectedDocumentTotal
  );

  return {
    caseId,
    caseLabel,
    sourceType,
    sourceId,
    isMustPass,
    passStatus: shadowPassStatus,
    overallSeverity: worstSeverity,
    assertionResults: allAssertionResults,
    failureReasons,
    shadowBetterThanLive: metrics.shadowBetterThanLive,
    livePassStatus,
    shadowPassStatus,
    metrics,
    liveOutput,
    shadowOutput,
  };
}
