import type { RiskTier, BehaviourClass } from './types';

export const RISK_TIER_LABELS: Record<RiskTier, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
};

export const RISK_TIER_COLORS: Record<RiskTier, string> = {
  low: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  medium: 'text-amber-700 bg-amber-50 border-amber-200',
  high: 'text-orange-700 bg-orange-50 border-orange-200',
  critical: 'text-red-700 bg-red-50 border-red-200',
};

export const BEHAVIOUR_CLASS_LABELS: Record<BehaviourClass, string> = {
  compliant: 'Compliant',
  standard: 'Standard',
  opportunistic: 'Opportunistic',
  adversarial: 'Adversarial',
  unreliable: 'Unreliable',
};

export const BEHAVIOUR_CLASS_COLORS: Record<BehaviourClass, string> = {
  compliant: 'text-emerald-700 bg-emerald-50',
  standard: 'text-slate-700 bg-slate-100',
  opportunistic: 'text-amber-700 bg-amber-50',
  adversarial: 'text-red-700 bg-red-50',
  unreliable: 'text-orange-700 bg-orange-50',
};

export const VARIATION_RATE_THRESHOLDS = {
  low: 0.05,
  medium: 0.12,
  high: 0.20,
};

export const SCOPE_COVERAGE_THRESHOLDS = {
  poor: 0.70,
  adequate: 0.85,
  good: 0.95,
};
