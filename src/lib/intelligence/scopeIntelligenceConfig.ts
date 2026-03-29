export type ScopeBucket =
  | 'core_scope'
  | 'secondary_scope'
  | 'optional_scope'
  | 'excluded_scope'
  | 'risk_scope'
  | 'summary_only'
  | 'unknown_scope';

export type BehaviourRiskRating = 'green' | 'amber' | 'red' | 'unknown';
export type GateStatus = 'pass' | 'warn' | 'fail' | 'pending';
export type TrendDirection = 'improving' | 'stable' | 'deteriorating' | 'unknown';

export const CLASSIFIER_VERSION = '1.0';

export const SCOPE_WEIGHTS: Record<ScopeBucket, number> = {
  core_scope: 3.0,
  secondary_scope: 1.5,
  optional_scope: 0.0,
  excluded_scope: -1.0,
  risk_scope: -0.5,
  summary_only: 0.0,
  unknown_scope: 0.3,
};

export const SCOPE_COVERAGE_THRESHOLDS = {
  CORE_FAIL: 60,
  CORE_WARN: 80,
  CORE_STRONG: 90,
} as const;

export const RISK_COUNT_THRESHOLDS = {
  RISK_SCOPE_WARN: 3,
  RISK_SCOPE_FAIL: 6,
  EXCLUDED_SCOPE_WARN: 2,
  EXCLUDED_SCOPE_FAIL: 5,
  UNKNOWN_SCOPE_WARN: 5,
  UNKNOWN_SCOPE_FAIL: 10,
} as const;

export const BEHAVIOUR_RISK_THRESHOLDS = {
  GREEN_MIN_CORE_COVERAGE: 80,
  AMBER_MIN_CORE_COVERAGE: 65,
  RED_MAX_CORE_COVERAGE: 64,
  GREEN_MAX_EXCLUSIONS: 2,
  AMBER_MAX_EXCLUSIONS: 4,
  RED_MIN_EXCLUSIONS: 5,
  MIN_TENDERS_FOR_TREND: 3,
} as const;

export const GATE_RULES = {
  FAIL_CORE_COVERAGE_BELOW: 60,
  WARN_CORE_COVERAGE_BELOW: 80,
  FAIL_EXCLUDED_COUNT_ABOVE: 5,
  WARN_EXCLUDED_COUNT_ABOVE: 2,
  FAIL_RISK_COUNT_ABOVE: 6,
  WARN_RISK_COUNT_ABOVE: 3,
  FAIL_UNKNOWN_COUNT_ABOVE: 10,
  WARN_UNKNOWN_COUNT_ABOVE: 5,
  FAIL_SCOPE_CONFIDENCE_BELOW: 40,
  WARN_SCOPE_CONFIDENCE_BELOW: 60,
  FAIL_BEHAVIOUR_RISK_IS_RED: true,
} as const;

export const CORE_SCOPE_ANCHOR_PHRASES: string[] = [
  'supply and install',
  'supply & install',
  'supply and fit',
  'furnish and install',
  'main contract',
  'prime cost',
  'preliminaries',
  'provisional sum',
  'pipe work',
  'pipework',
  'ductwork',
  'sprinkler',
  'fire main',
  'structural',
  'earthwork',
  'concrete',
  'reinforcement',
  'formwork',
  'fire protection',
  'active fire',
  'suppression',
  'detection system',
  'commissioning',
  'testing and commissioning',
  'hydraulic',
  'mechanical',
  'electrical',
  'cabling',
  'switchboard',
  'hvac',
  'air conditioning',
  'roofing',
  'waterproofing',
  'cladding',
  'glazing',
  'facade',
  'head contract',
  'main works',
  'all labour',
  'all materials',
];

export const RISK_SCOPE_ANCHOR_PHRASES: string[] = [
  'assumed',
  'assumption',
  'deferred',
  'subject to',
  'to be confirmed',
  'tbc',
  'to be advised',
  'tba',
  'allowance only',
  'indicative only',
  'budget rate',
  'budget allowance',
  'provisional',
  'pc rate',
  'pending confirmation',
  'variation may apply',
  'not yet confirmed',
  'subject to site',
  'subject to survey',
  'as advised',
  'estimate only',
  'approximate',
  'may vary',
  'if required',
  'if applicable',
  'contingent on',
  'rates only',
];

export const EXCLUDED_SCOPE_ANCHOR_PHRASES: string[] = [
  'excluded',
  'exclusion',
  'not included',
  'not in scope',
  'nis',
  'by others',
  'not by this contractor',
  'owner supplied',
  'client supplied',
  'principal supplied',
  'not part of',
  'omitted',
  'n/a',
  'outside scope',
  'out of scope',
  'excluded from quote',
];

export const OPTIONAL_SCOPE_ANCHOR_PHRASES: string[] = [
  'optional',
  'option:',
  'option -',
  'alternate',
  'alternative',
  'add alternate',
  'voluntary alternate',
  'elective',
  'add-on',
  'add on',
  'addon',
  'deduct alternate',
  'base bid alternate',
];

export const SUMMARY_ONLY_ANCHOR_PHRASES: string[] = [
  'total',
  'subtotal',
  'sub-total',
  'sub total',
  'grand total',
  'total excl',
  'total incl',
  'total gst',
  'carry forward',
  'brought forward',
  'summary',
  'page total',
  'section total',
];

export const SECONDARY_SCOPE_ANCHOR_PHRASES: string[] = [
  'maintenance',
  'defects',
  'warranty',
  'handover',
  'documentation',
  'as-built',
  'as built',
  'shop drawing',
  'operation and maintenance',
  'o&m manual',
  'training',
  'signage',
  'labels',
  'identification',
  'minor works',
  'make good',
  'cleaning',
  'disposal',
  'permit',
  'authority approval',
  'council approval',
];
