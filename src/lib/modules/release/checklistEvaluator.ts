import type {
  ChecklistItemDef,
  ChecklistItemResult,
  ChecklistStatus,
} from '../../../types/shadow';

export interface ChecklistEvalInput {
  regressionSuiteRecentlyPassed: boolean;
  regressionSuiteAgeMs?: number;
  criticalAnomaliesLast7Days: number;
  anomalyRateLast7Days: number;
  unresolvedCriticalCount: number;
  betaTotalRuns: number;
  betaMinRunsRequired: number;
  approvalRecordExists: boolean;
  manualSignOffComplete: boolean;
  mustPassCasesValidated: boolean;
  healthScore?: number;
}

export interface ChecklistEvalResult {
  items: Array<ChecklistItemDef & { result: ChecklistItemResult }>;
  status: ChecklistStatus;
  blockedReasons: string[];
  passCount: number;
  totalRequired: number;
}

export const CHECKLIST_ITEM_DEFS: ChecklistItemDef[] = [
  {
    key: 'regression_suite_passed',
    label: 'Regression suite passed',
    description: 'Most recent regression suite run completed with no must-pass failures.',
    required: true,
    category: 'regression',
  },
  {
    key: 'regression_suite_fresh',
    label: 'Regression suite run within 7 days',
    description: 'The latest regression run is not stale (< 7 days old).',
    required: true,
    category: 'regression',
  },
  {
    key: 'no_critical_anomalies_7d',
    label: 'No critical anomalies in last 7 days',
    description: 'Zero critical anomaly events in the past 7 days of beta traffic.',
    required: true,
    category: 'anomaly',
  },
  {
    key: 'anomaly_rate_below_threshold',
    label: 'Anomaly rate below 20%',
    description: 'Overall anomaly rate in last 7 days is below 20% of total runs.',
    required: true,
    category: 'anomaly',
  },
  {
    key: 'no_unresolved_critical_anomalies',
    label: 'All critical anomalies resolved',
    description: 'No open or acknowledged critical anomalies remain in the anomaly backlog.',
    required: true,
    category: 'anomaly',
  },
  {
    key: 'beta_run_volume_sufficient',
    label: 'Sufficient beta run volume',
    description: 'Minimum required beta runs have been completed before promotion.',
    required: true,
    category: 'beta_coverage',
  },
  {
    key: 'must_pass_cases_validated',
    label: 'Must-pass regression cases validated',
    description: 'All marked must-pass test cases have been explicitly validated.',
    required: true,
    category: 'regression',
  },
  {
    key: 'approval_record_exists',
    label: 'Approval record exists',
    description: 'A formal admin approval record has been created for this version.',
    required: true,
    category: 'approval',
  },
  {
    key: 'manual_sign_off',
    label: 'Manual sign-off complete',
    description: 'Admin has manually reviewed and signed off on this release.',
    required: true,
    category: 'manual',
  },
];

const ANOMALY_RATE_THRESHOLD = 0.20;
const REGRESSION_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function evaluateChecklist(input: ChecklistEvalInput): ChecklistEvalResult {
  const results: Array<ChecklistItemDef & { result: ChecklistItemResult }> = [];
  const blockedReasons: string[] = [];

  function evaluate(key: string, passed: boolean, notes?: string, auto = true): void {
    const def = CHECKLIST_ITEM_DEFS.find((d) => d.key === key)!;
    const result: ChecklistItemResult = { passed, notes, auto, checked_at: new Date().toISOString() };
    results.push({ ...def, result });
    if (!passed && def.required) {
      blockedReasons.push(notes ?? def.label);
    }
  }

  evaluate(
    'regression_suite_passed',
    input.regressionSuiteRecentlyPassed,
    input.regressionSuiteRecentlyPassed
      ? 'Most recent regression run passed'
      : 'No recent passing regression run found'
  );

  const regressionFresh = input.regressionSuiteAgeMs != null
    ? input.regressionSuiteAgeMs < REGRESSION_STALE_MS
    : false;
  evaluate(
    'regression_suite_fresh',
    regressionFresh,
    regressionFresh
      ? 'Regression suite run within 7 days'
      : 'Regression suite not run in 7+ days — refresh required'
  );

  evaluate(
    'no_critical_anomalies_7d',
    input.criticalAnomaliesLast7Days === 0,
    input.criticalAnomaliesLast7Days === 0
      ? 'No critical anomalies in last 7 days'
      : `${input.criticalAnomaliesLast7Days} critical anomaly event(s) in last 7 days`
  );

  evaluate(
    'anomaly_rate_below_threshold',
    input.anomalyRateLast7Days < ANOMALY_RATE_THRESHOLD,
    `Current anomaly rate: ${(input.anomalyRateLast7Days * 100).toFixed(1)}% (threshold: ${(ANOMALY_RATE_THRESHOLD * 100).toFixed(0)}%)`
  );

  evaluate(
    'no_unresolved_critical_anomalies',
    input.unresolvedCriticalCount === 0,
    input.unresolvedCriticalCount === 0
      ? 'All critical anomalies resolved'
      : `${input.unresolvedCriticalCount} unresolved critical anomaly(s) must be resolved first`
  );

  evaluate(
    'beta_run_volume_sufficient',
    input.betaTotalRuns >= input.betaMinRunsRequired,
    `${input.betaTotalRuns} runs completed (minimum: ${input.betaMinRunsRequired})`
  );

  evaluate(
    'must_pass_cases_validated',
    input.mustPassCasesValidated,
    input.mustPassCasesValidated
      ? 'Must-pass cases validated'
      : 'Must-pass regression cases not yet validated'
  );

  evaluate(
    'approval_record_exists',
    input.approvalRecordExists,
    input.approvalRecordExists
      ? 'Approval record exists'
      : 'No approval record found — create one before promoting',
    false
  );

  evaluate(
    'manual_sign_off',
    input.manualSignOffComplete,
    input.manualSignOffComplete
      ? 'Manual sign-off confirmed'
      : 'Admin must manually confirm sign-off',
    false
  );

  const required = results.filter((r) => r.required);
  const passCount = required.filter((r) => r.result.passed).length;
  const allRequired = required.length;

  let status: ChecklistStatus;
  if (blockedReasons.length === 0) {
    status = 'ready';
  } else {
    status = 'blocked';
  }

  return { items: results, status, blockedReasons, passCount, totalRequired: allRequired };
}

export function overrideChecklistItem(
  completed: Record<string, ChecklistItemResult>,
  key: string,
  passed: boolean,
  notes: string
): Record<string, ChecklistItemResult> {
  return {
    ...completed,
    [key]: { passed, notes, auto: false, checked_at: new Date().toISOString() },
  };
}
