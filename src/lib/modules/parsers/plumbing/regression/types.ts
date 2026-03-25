import type { RowClassification, RecommendedOutcome } from '../../../../../types/plumbingDiscrepancy';

export type PassStatus = 'pass' | 'fail_minor' | 'fail_major' | 'fail_critical';

export type SuiteRecommendation =
  | 'ready_for_internal_beta'
  | 'needs_more_work'
  | 'blocked_by_critical_failures';

export interface ToleranceRule {
  type: 'exact' | 'absolute' | 'percentage';
  value: number;
}

export interface RowClassificationAssertion {
  matchType: 'phrase' | 'row_index' | 'amount_equals';
  matchValue: string | number;
  expectedClassification: RowClassification;
  expectedIncluded: boolean;
  label?: string;
}

export interface ExpectedOutcome {
  expectedDocumentTotal?: number | null;
  expectedParsedTotal?: number | null;
  expectedIncludedLineCount?: number | null;
  expectedExcludedLineCount?: number | null;
  expectedExcludedSummaryPhrases?: string[];
  expectedRiskFlagsPresent?: string[];
  expectedRiskFlagsAbsent?: string[];
  expectedClassificationAssertions?: RowClassificationAssertion[];
  toleranceRules?: {
    parsedTotal?: ToleranceRule;
    documentTotal?: ToleranceRule;
  };
  notes?: string;
}

export interface RegressionCaseInput {
  id: string;
  suiteId: string;
  sourceType: string;
  sourceId: string;
  caseLabel: string;
  isMustPass: boolean;
  notes?: string;
  expectedOutcome: ExpectedOutcome;
}

export interface CaseActualOutput {
  parsedTotal: number;
  detectedDocumentTotal: number | null;
  includedLineCount: number;
  excludedLineCount: number;
  excludedSummaryPhrases: string[];
  riskFlagIds: string[];
  classifiedRows: Array<{
    rowIndex: number;
    rawText: string;
    classification: RowClassification;
    includedInParsedTotal: boolean;
    amount: number | null;
    detectionSignals: string[];
  }>;
  parserWarnings: string[];
}

export interface AssertionResult {
  assertionType: string;
  label: string;
  expected: string;
  actual: string;
  passed: boolean;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
}

export interface CaseEvalResult {
  caseId: string;
  caseLabel: string;
  sourceType: string;
  sourceId: string;
  isMustPass: boolean;
  passStatus: PassStatus;
  overallSeverity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  assertionResults: AssertionResult[];
  failureReasons: string[];
  shadowBetterThanLive: boolean;
  livePassStatus: PassStatus;
  shadowPassStatus: PassStatus;
  metrics: CaseMetrics;
  liveOutput: CaseActualOutput;
  shadowOutput: CaseActualOutput;
}

export interface CaseMetrics {
  liveTotalDelta: number | null;
  shadowTotalDelta: number | null;
  liveDocTotalDelta: number | null;
  shadowDocTotalDelta: number | null;
  includedLineDelta: number;
  excludedLineDelta: number;
  classificationMismatchCount: number;
  riskFlagMismatchCount: number;
  shadowBetterThanLive: boolean;
  shadowMatchedExpectedTotal: boolean;
  liveMatchedExpectedTotal: boolean;
}

export interface SuiteRunSummary {
  suiteId: string;
  suiteRunId: string;
  moduleKey: string;
  casesTotal: number;
  casesPassed: number;
  casesFailedMinor: number;
  casesFailedMajor: number;
  casesFailedCritical: number;
  mustPassCasesFailed: number;
  shadowBetterCount: number;
  liveBetterCount: number;
  inconclusiveCount: number;
  recommendation: SuiteRecommendation;
  recommendationReasons: string[];
  caseResults: CaseEvalResult[];
  completedAt: string;
}

export interface RegressionSuiteCaseResultRecord {
  id: string;
  suite_run_id: string;
  suite_case_id: string;
  module_key: string;
  source_type: string;
  source_id: string;
  expected_json: Record<string, unknown>;
  live_output_json: Record<string, unknown>;
  shadow_output_json: Record<string, unknown>;
  diff_output_json: Record<string, unknown>;
  pass_status: PassStatus;
  severity: string;
  failure_reasons_json: string[];
  metrics_json: Record<string, unknown>;
  created_at: string;
}

export interface RegressionSuiteRecordExtended {
  id: string;
  module_key: string;
  suite_name: string;
  description?: string;
  is_active: boolean;
  config_json: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RegressionSuiteCaseRecordExtended {
  id: string;
  suite_id: string;
  source_type: string;
  source_id: string;
  case_label?: string;
  is_must_pass: boolean;
  notes?: string;
  expected_json?: Record<string, unknown>;
  created_at: string;
}

export interface RegressionSuiteRunRecordExtended {
  id: string;
  suite_id: string;
  module_key: string;
  version_under_test: string;
  initiated_by: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  summary_json: Record<string, unknown>;
  recommendation?: string;
  cases_total: number;
  cases_passed: number;
  cases_failed_minor: number;
  cases_failed_major: number;
  cases_failed_critical: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}
