export const PLUMBING_REGRESSION_CONFIG = {
  defaultToleranceAbsolute: 0.5,
  defaultTolerancePercent: 0.001,

  betaGate: {
    maxMajorFailureRate: 0.15,
    maxMinorFailureRate: 0.30,
    minShadowBetterRate: 0.60,
    maxTotalMismatchRate: 0.10,
    allowCriticalFailures: false,
  },

  suiteSizeWarningThreshold: 50,

  mustPassWeight: 3,

  severityToPassStatus: {
    info: 'pass',
    low: 'fail_minor',
    medium: 'fail_minor',
    high: 'fail_major',
    critical: 'fail_critical',
  } as const,

  assertionSeverities: {
    parsedTotal: 'critical',
    documentTotal: 'high',
    includedLineCount: 'high',
    excludedLineCount: 'medium',
    classificationAssertion: 'high',
    excludedPhrase: 'high',
    riskFlagPresent: 'medium',
    riskFlagAbsent: 'medium',
  } as const,

  totalMismatchThresholdAbsolute: 1.0,
  totalMismatchThresholdPercent: 0.005,
} as const;
