import { PLUMBING_REGRESSION_CONFIG as CFG } from './regressionConfig';
import type {
  ExpectedOutcome,
  CaseActualOutput,
  AssertionResult,
  ToleranceRule,
} from './types';

function withinTolerance(actual: number, expected: number, rule?: ToleranceRule): boolean {
  if (!rule) {
    return Math.abs(actual - expected) <= CFG.defaultToleranceAbsolute;
  }
  if (rule.type === 'exact') return actual === expected;
  if (rule.type === 'absolute') return Math.abs(actual - expected) <= rule.value;
  if (rule.type === 'percentage') {
    const pct = expected !== 0 ? Math.abs((actual - expected) / expected) : Math.abs(actual);
    return pct <= rule.value;
  }
  return false;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '(none)';
  return `$${n.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;
}

export function buildAssertions(
  expected: ExpectedOutcome,
  actual: CaseActualOutput
): AssertionResult[] {
  const results: AssertionResult[] = [];

  if (expected.expectedParsedTotal != null) {
    const passed = withinTolerance(
      actual.parsedTotal,
      expected.expectedParsedTotal,
      expected.toleranceRules?.parsedTotal
    );
    results.push({
      assertionType: 'parsed_total',
      label: 'Parsed total within tolerance',
      expected: fmt(expected.expectedParsedTotal),
      actual: fmt(actual.parsedTotal),
      passed,
      severity: passed ? 'info' : CFG.assertionSeverities.parsedTotal,
    });
  }

  if (expected.expectedDocumentTotal != null) {
    const passed = actual.detectedDocumentTotal !== null &&
      withinTolerance(
        actual.detectedDocumentTotal,
        expected.expectedDocumentTotal,
        expected.toleranceRules?.documentTotal
      );
    results.push({
      assertionType: 'document_total',
      label: 'Detected document total matches expected',
      expected: fmt(expected.expectedDocumentTotal),
      actual: fmt(actual.detectedDocumentTotal),
      passed,
      severity: passed ? 'info' : CFG.assertionSeverities.documentTotal,
    });
  }

  if (expected.expectedIncludedLineCount != null) {
    const passed = actual.includedLineCount === expected.expectedIncludedLineCount;
    results.push({
      assertionType: 'included_line_count',
      label: 'Included line count matches expected',
      expected: String(expected.expectedIncludedLineCount),
      actual: String(actual.includedLineCount),
      passed,
      severity: passed ? 'info' : CFG.assertionSeverities.includedLineCount,
    });
  }

  if (expected.expectedExcludedLineCount != null) {
    const passed = actual.excludedLineCount === expected.expectedExcludedLineCount;
    results.push({
      assertionType: 'excluded_line_count',
      label: 'Excluded line count matches expected',
      expected: String(expected.expectedExcludedLineCount),
      actual: String(actual.excludedLineCount),
      passed,
      severity: passed ? 'info' : CFG.assertionSeverities.excludedLineCount,
    });
  }

  for (const phrase of expected.expectedExcludedSummaryPhrases ?? []) {
    const ph = phrase.toLowerCase();
    const found = actual.excludedSummaryPhrases.some((p) => p.toLowerCase().includes(ph));
    results.push({
      assertionType: 'excluded_phrase',
      label: `Phrase "${phrase}" excluded from totals`,
      expected: `"${phrase}" excluded`,
      actual: found ? `Found in excluded rows` : `NOT found in excluded rows`,
      passed: found,
      severity: found ? 'info' : CFG.assertionSeverities.excludedPhrase,
    });
  }

  for (const flagId of expected.expectedRiskFlagsPresent ?? []) {
    const found = actual.riskFlagIds.includes(flagId);
    results.push({
      assertionType: 'risk_flag_present',
      label: `Risk flag "${flagId}" present`,
      expected: 'present',
      actual: found ? 'present' : 'absent',
      passed: found,
      severity: found ? 'info' : CFG.assertionSeverities.riskFlagPresent,
    });
  }

  for (const flagId of expected.expectedRiskFlagsAbsent ?? []) {
    const found = actual.riskFlagIds.includes(flagId);
    results.push({
      assertionType: 'risk_flag_absent',
      label: `Risk flag "${flagId}" must be absent`,
      expected: 'absent',
      actual: found ? 'present' : 'absent',
      passed: !found,
      severity: !found ? 'info' : CFG.assertionSeverities.riskFlagAbsent,
    });
  }

  for (const assertion of expected.expectedClassificationAssertions ?? []) {
    let matchedRows = actual.classifiedRows;

    if (assertion.matchType === 'phrase') {
      const ph = String(assertion.matchValue).toLowerCase();
      matchedRows = actual.classifiedRows.filter((r) => r.rawText.toLowerCase().includes(ph));
    } else if (assertion.matchType === 'row_index') {
      matchedRows = actual.classifiedRows.filter((r) => r.rowIndex === assertion.matchValue);
    } else if (assertion.matchType === 'amount_equals') {
      const target = Number(assertion.matchValue);
      matchedRows = actual.classifiedRows.filter(
        (r) => r.amount !== null && Math.abs((r.amount ?? 0) - target) <= CFG.defaultToleranceAbsolute
      );
    }

    if (matchedRows.length === 0) {
      results.push({
        assertionType: 'classification_assertion',
        label: assertion.label ?? `Row assertion: ${assertion.matchType}=${assertion.matchValue}`,
        expected: `${assertion.expectedClassification} / included=${assertion.expectedIncluded}`,
        actual: 'No matching rows found',
        passed: false,
        severity: CFG.assertionSeverities.classificationAssertion,
      });
      continue;
    }

    for (const row of matchedRows) {
      const clsPassed = row.classification === assertion.expectedClassification;
      const inclPassed = row.includedInParsedTotal === assertion.expectedIncluded;
      const passed = clsPassed && inclPassed;
      results.push({
        assertionType: 'classification_assertion',
        label: assertion.label ?? `Row "${row.rawText.slice(0, 40)}"`,
        expected: `${assertion.expectedClassification} / included=${assertion.expectedIncluded}`,
        actual: `${row.classification} / included=${row.includedInParsedTotal}`,
        passed,
        severity: passed ? 'info' : CFG.assertionSeverities.classificationAssertion,
      });
    }
  }

  return results;
}
