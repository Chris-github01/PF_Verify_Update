import { supabase } from '../../../../supabase';
import { evaluateCase } from './evaluateCase';
import { logAdminAction } from '../../../../shadow/auditLogger';
import { PLUMBING_REGRESSION_CONFIG as CFG } from './regressionConfig';
import type {
  RegressionCaseInput,
  SuiteRunSummary,
  CaseEvalResult,
  SuiteRecommendation,
  ExpectedOutcome,
  RegressionSuiteCaseRecordExtended,
} from './types';

function deriveRecommendation(
  results: CaseEvalResult[],
  total: number
): { recommendation: SuiteRecommendation; reasons: string[] } {
  const gate = CFG.betaGate;
  const reasons: string[] = [];

  const critical = results.filter((r) => r.passStatus === 'fail_critical');
  const major = results.filter((r) => r.passStatus === 'fail_major');
  const minor = results.filter((r) => r.passStatus === 'fail_minor');
  const mustPassFailed = results.filter((r) => r.isMustPass && r.passStatus !== 'pass');
  const shadowBetter = results.filter((r) => r.shadowBetterThanLive);

  if (critical.length > 0 || mustPassFailed.length > 0) {
    if (critical.length > 0) reasons.push(`${critical.length} critical failure(s) detected`);
    if (mustPassFailed.length > 0) reasons.push(`${mustPassFailed.length} must-pass case(s) failed`);
    return { recommendation: 'blocked_by_critical_failures', reasons };
  }

  const majorRate = total > 0 ? major.length / total : 0;
  const minorRate = total > 0 ? minor.length / total : 0;
  const shadowBetterRate = total > 0 ? shadowBetter.length / total : 0;

  if (majorRate > gate.maxMajorFailureRate) {
    reasons.push(`Major failure rate ${(majorRate * 100).toFixed(1)}% exceeds threshold ${(gate.maxMajorFailureRate * 100).toFixed(0)}%`);
    return { recommendation: 'needs_more_work', reasons };
  }
  if (minorRate > gate.maxMinorFailureRate) {
    reasons.push(`Minor failure rate ${(minorRate * 100).toFixed(1)}% exceeds threshold ${(gate.maxMinorFailureRate * 100).toFixed(0)}%`);
    return { recommendation: 'needs_more_work', reasons };
  }
  if (shadowBetterRate < gate.minShadowBetterRate && total >= 5) {
    reasons.push(`Shadow better rate ${(shadowBetterRate * 100).toFixed(1)}% is below required ${(gate.minShadowBetterRate * 100).toFixed(0)}%`);
    return { recommendation: 'needs_more_work', reasons };
  }

  reasons.push(`All gates passed: ${results.filter((r) => r.passStatus === 'pass').length}/${total} cases passed`);
  reasons.push(`Shadow outperformed live on ${shadowBetter.length} cases`);
  return { recommendation: 'ready_for_internal_beta', reasons };
}

export async function executeSuiteRun(params: {
  suiteId: string;
  suiteRunId: string;
  cases: RegressionCaseInput[];
  getRawRows: (sourceType: string, sourceId: string) => Promise<{
    liveRows: Array<Record<string, unknown>>;
    shadowRows: Array<Record<string, unknown>>;
    documentTotal?: number | null;
  }>;
}): Promise<SuiteRunSummary> {
  const { suiteId, suiteRunId, cases, getRawRows } = params;

  await supabase.from('regression_suite_runs').update({
    status: 'running',
    started_at: new Date().toISOString(),
  }).eq('id', suiteRunId);

  const caseResults: CaseEvalResult[] = [];

  for (const caseInput of cases) {
    try {
      const { liveRows, shadowRows, documentTotal } = await getRawRows(
        caseInput.sourceType,
        caseInput.sourceId
      );

      const result = await evaluateCase(caseInput, liveRows, shadowRows, documentTotal);
      caseResults.push(result);

      await supabase.from('regression_suite_case_results').insert({
        suite_run_id: suiteRunId,
        suite_case_id: caseInput.id,
        module_key: 'plumbing_parser',
        source_type: caseInput.sourceType,
        source_id: caseInput.sourceId,
        expected_json: caseInput.expectedOutcome as unknown as Record<string, unknown>,
        live_output_json: result.liveOutput as unknown as Record<string, unknown>,
        shadow_output_json: result.shadowOutput as unknown as Record<string, unknown>,
        diff_output_json: result.metrics as unknown as Record<string, unknown>,
        pass_status: result.passStatus,
        severity: result.overallSeverity,
        failure_reasons_json: result.failureReasons,
        metrics_json: result.metrics as unknown as Record<string, unknown>,
      });
    } catch (err) {
      caseResults.push({
        caseId: caseInput.id,
        caseLabel: caseInput.caseLabel,
        sourceType: caseInput.sourceType,
        sourceId: caseInput.sourceId,
        isMustPass: caseInput.isMustPass,
        passStatus: 'fail_critical',
        overallSeverity: 'critical',
        assertionResults: [],
        failureReasons: [`Case execution failed: ${err instanceof Error ? err.message : String(err)}`],
        shadowBetterThanLive: false,
        livePassStatus: 'fail_critical',
        shadowPassStatus: 'fail_critical',
        metrics: {
          liveTotalDelta: null,
          shadowTotalDelta: null,
          liveDocTotalDelta: null,
          shadowDocTotalDelta: null,
          includedLineDelta: 0,
          excludedLineDelta: 0,
          classificationMismatchCount: 0,
          riskFlagMismatchCount: 0,
          shadowBetterThanLive: false,
          shadowMatchedExpectedTotal: false,
          liveMatchedExpectedTotal: false,
        },
        liveOutput: {
          parsedTotal: 0, detectedDocumentTotal: null, includedLineCount: 0,
          excludedLineCount: 0, excludedSummaryPhrases: [], riskFlagIds: [],
          classifiedRows: [], parserWarnings: [],
        },
        shadowOutput: {
          parsedTotal: 0, detectedDocumentTotal: null, includedLineCount: 0,
          excludedLineCount: 0, excludedSummaryPhrases: [], riskFlagIds: [],
          classifiedRows: [], parserWarnings: [],
        },
      });
    }
  }

  const total = caseResults.length;
  const passed = caseResults.filter((r) => r.passStatus === 'pass').length;
  const minor = caseResults.filter((r) => r.passStatus === 'fail_minor').length;
  const major = caseResults.filter((r) => r.passStatus === 'fail_major').length;
  const critical = caseResults.filter((r) => r.passStatus === 'fail_critical').length;
  const mustPassFailed = caseResults.filter((r) => r.isMustPass && r.passStatus !== 'pass').length;
  const shadowBetterCount = caseResults.filter((r) => r.shadowBetterThanLive).length;
  const liveBetterCount = caseResults.filter((r) => !r.shadowBetterThanLive && !r.metrics.shadowMatchedExpectedTotal && r.metrics.liveMatchedExpectedTotal).length;
  const inconclusive = total - shadowBetterCount - liveBetterCount;

  const { recommendation, reasons } = deriveRecommendation(caseResults, total);

  const summaryJson: Record<string, unknown> = {
    casesTotal: total,
    casesPassed: passed,
    casesFailedMinor: minor,
    casesFailedMajor: major,
    casesFailedCritical: critical,
    mustPassCasesFailed: mustPassFailed,
    shadowBetterCount,
    liveBetterCount,
    inconclusiveCount: inconclusive,
    recommendation,
    recommendationReasons: reasons,
  };

  await supabase.from('regression_suite_runs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    summary_json: summaryJson,
    recommendation,
    cases_total: total,
    cases_passed: passed,
    cases_failed_minor: minor,
    cases_failed_major: major,
    cases_failed_critical: critical,
  }).eq('id', suiteRunId);

  await logAdminAction({
    action: 'regression_suite_run_completed',
    entityType: 'regression_suite_runs',
    entityId: suiteRunId,
    moduleKey: 'plumbing_parser',
    after: { recommendation, casesTotal: total, casesPassed: passed },
  });

  return {
    suiteId,
    suiteRunId,
    moduleKey: 'plumbing_parser',
    casesTotal: total,
    casesPassed: passed,
    casesFailedMinor: minor,
    casesFailedMajor: major,
    casesFailedCritical: critical,
    mustPassCasesFailed: mustPassFailed,
    shadowBetterCount,
    liveBetterCount,
    inconclusiveCount: inconclusive,
    recommendation,
    recommendationReasons: reasons,
    caseResults,
    completedAt: new Date().toISOString(),
  };
}

export function parseCaseRecord(rec: RegressionSuiteCaseRecordExtended): RegressionCaseInput {
  const raw = (rec.expected_json ?? {}) as Record<string, unknown>;
  return {
    id: rec.id,
    suiteId: rec.suite_id,
    sourceType: rec.source_type,
    sourceId: rec.source_id,
    caseLabel: rec.case_label ?? rec.source_id,
    isMustPass: rec.is_must_pass ?? false,
    notes: rec.notes ?? undefined,
    expectedOutcome: raw as unknown as ExpectedOutcome,
  };
}
