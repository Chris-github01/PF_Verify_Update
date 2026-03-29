import {
  RISK_DRIVER_WEIGHTS,
  RISK_SCORE_THRESHOLDS,
  SCOPE_THRESHOLDS,
  BEHAVIOUR_RISK_EXPOSURE_MULTIPLIERS,
  CONFIDENCE_REDUCTIONS,
} from './variationRiskConfig';
import type {
  RiskDriver,
  RiskDriverCategory,
  RiskSeverity,
  VariationRiskLevel,
  DataQuality,
  VariationRiskInputData,
} from './variationRiskTypes';

export function mapSeverity(normalizedScore: number): RiskSeverity {
  if (normalizedScore >= 0.80) return 'critical';
  if (normalizedScore >= 0.60) return 'high';
  if (normalizedScore >= 0.40) return 'moderate';
  if (normalizedScore >= 0.20) return 'low';
  return 'minimal';
}

export function mapRiskLevel(riskScore: number): VariationRiskLevel {
  if (riskScore > RISK_SCORE_THRESHOLDS.high_max) return 'critical';
  if (riskScore > RISK_SCORE_THRESHOLDS.moderate_max) return 'high';
  if (riskScore > RISK_SCORE_THRESHOLDS.low_max) return 'moderate';
  return 'low';
}

export function normalizeScore(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function computeScopeOmissionDriver(supplier: VariationRiskInputData): RiskDriver {
  const { core_scope_coverage_pct } = supplier;
  const coverageDeficit = Math.max(0, 1 - core_scope_coverage_pct);

  let rawScore: number;
  let reason: string;

  if (core_scope_coverage_pct >= SCOPE_THRESHOLDS.core_coverage_strong) {
    rawScore = 5;
    reason = `Core scope coverage is strong at ${(core_scope_coverage_pct * 100).toFixed(0)}%. Scope omission risk is low.`;
  } else if (core_scope_coverage_pct >= SCOPE_THRESHOLDS.core_coverage_moderate) {
    rawScore = 30 + coverageDeficit * 60;
    reason = `Core scope coverage is moderate at ${(core_scope_coverage_pct * 100).toFixed(0)}%. Some items may be missing from scope response.`;
  } else if (core_scope_coverage_pct >= SCOPE_THRESHOLDS.core_coverage_weak) {
    rawScore = 50 + coverageDeficit * 80;
    reason = `Core scope coverage is below acceptable threshold at ${(core_scope_coverage_pct * 100).toFixed(0)}%. Material scope gaps are likely.`;
  } else {
    rawScore = 80 + coverageDeficit * 25;
    reason = `Core scope coverage is critically low at ${(core_scope_coverage_pct * 100).toFixed(0)}%. Significant post-award variation exposure is expected from scope omissions.`;
  }

  rawScore = Math.min(100, rawScore);
  const normalized = rawScore / 100;
  const weight = RISK_DRIVER_WEIGHTS.scope_omission_risk;

  return {
    category: 'scope_omission_risk',
    score: rawScore,
    weight,
    weighted_contribution: normalized * weight,
    reason,
    severity: mapSeverity(normalized),
    confidence_contribution: 0.0,
  };
}

function computeExclusionDensityDriver(supplier: VariationRiskInputData): RiskDriver {
  const { excluded_scope_count, risk_scope_count } = supplier;
  const totalDensity = excluded_scope_count + risk_scope_count * 0.5;

  let rawScore: number;
  let reason: string;

  if (totalDensity <= 1) {
    rawScore = 5;
    reason = `Minimal exclusions and risk items (${excluded_scope_count} excluded, ${risk_scope_count} at risk). Exclusion density risk is low.`;
  } else if (excluded_scope_count <= SCOPE_THRESHOLDS.exclusion_density_moderate) {
    rawScore = 20 + totalDensity * 5;
    reason = `${excluded_scope_count} excluded items and ${risk_scope_count} risk scope items. Moderate exclusion density — review specific exclusions before award.`;
  } else if (excluded_scope_count <= SCOPE_THRESHOLDS.exclusion_density_high) {
    rawScore = 45 + totalDensity * 4;
    reason = `Elevated exclusion profile with ${excluded_scope_count} excluded items and ${risk_scope_count} risk scope items. Post-award variation exposure from reincorporating excluded scope is material.`;
  } else {
    rawScore = 72 + totalDensity * 2;
    reason = `Dense exclusion profile: ${excluded_scope_count} excluded items and ${risk_scope_count} risk scope items. High probability of post-award scope variations arising from excluded and risk-flagged items.`;
  }

  rawScore = Math.min(100, rawScore);
  const normalized = rawScore / 100;
  const weight = RISK_DRIVER_WEIGHTS.exclusion_density_risk;

  return {
    category: 'exclusion_density_risk',
    score: rawScore,
    weight,
    weighted_contribution: normalized * weight,
    reason,
    severity: mapSeverity(normalized),
    confidence_contribution: 0.0,
  };
}

function computeQualificationDriver(supplier: VariationRiskInputData): RiskDriver {
  const { likely_variation_exposure_score, unknown_scope_count, scope_confidence_score } = supplier;

  const qualificationSignal =
    likely_variation_exposure_score * 0.50 +
    normalizeScore(unknown_scope_count, 0, SCOPE_THRESHOLDS.unknown_scope_high) * 0.30 +
    (1 - scope_confidence_score) * 0.20;

  const rawScore = Math.min(100, qualificationSignal * 100);
  const normalized = rawScore / 100;
  const weight = RISK_DRIVER_WEIGHTS.qualification_risk;

  let reason: string;
  if (normalized < 0.2) {
    reason = `Low qualification and assumption signals. Scope classification is clear and confidence is high.`;
  } else if (normalized < 0.45) {
    reason = `Some qualification signals present. ${unknown_scope_count} unknown scope items may contain unstated assumptions.`;
  } else if (normalized < 0.70) {
    reason = `Moderate qualification risk. Variation exposure score of ${(likely_variation_exposure_score * 100).toFixed(0)}% suggests risk items and qualifications in tender.`;
  } else {
    reason = `Elevated qualification risk. High variation exposure signals (${(likely_variation_exposure_score * 100).toFixed(0)}%) and ${unknown_scope_count} unclassified items indicate significant qualifying assumptions.`;
  }

  return {
    category: 'qualification_risk',
    score: rawScore,
    weight,
    weighted_contribution: normalized * weight,
    reason,
    severity: mapSeverity(normalized),
    confidence_contribution: 0.0,
  };
}

function computeBehaviourPatternDriver(supplier: VariationRiskInputData): RiskDriver {
  const { behaviour_risk_rating, behaviour_confidence } = supplier;

  const ratingMultiplier = BEHAVIOUR_RISK_EXPOSURE_MULTIPLIERS[behaviour_risk_rating];
  const baseScore =
    behaviour_risk_rating === 'green' ? 10 :
    behaviour_risk_rating === 'amber' ? 45 : 78;

  const rawScore = Math.min(100, baseScore * (0.6 + behaviour_confidence * 0.4) * (ratingMultiplier / 1.7));

  const normalized = rawScore / 100;
  const weight = RISK_DRIVER_WEIGHTS.behaviour_pattern_risk;

  let reason: string;
  if (behaviour_risk_rating === 'green') {
    reason = `Behaviour profile is green-rated with ${(behaviour_confidence * 100).toFixed(0)}% confidence. Historical pattern suggests low post-award variation tendency.`;
  } else if (behaviour_risk_rating === 'amber') {
    reason = `Amber behaviour rating with ${(behaviour_confidence * 100).toFixed(0)}% confidence. Historical patterns indicate a moderate tendency for post-award scope uplift.`;
  } else {
    reason = `Red behaviour rating with ${(behaviour_confidence * 100).toFixed(0)}% confidence. Historical patterns strongly indicate elevated post-award variation risk from this supplier.`;
  }

  return {
    category: 'behaviour_pattern_risk',
    score: rawScore,
    weight,
    weighted_contribution: normalized * weight,
    reason,
    severity: mapSeverity(normalized),
    confidence_contribution: behaviour_confidence < 0.5 ? 0.08 : 0.0,
  };
}

function computeQuantityComparabilityDriver(supplier: VariationRiskInputData): RiskDriver {
  const { quantity_comparability_valid } = supplier;

  let rawScore: number;
  let reason: string;

  if (quantity_comparability_valid === true) {
    rawScore = 8;
    reason = `Quantity comparability is validated. No additional risk from quantity divergence detected.`;
  } else if (quantity_comparability_valid === null) {
    rawScore = 38;
    reason = `Quantity comparability data is unavailable. Cannot confirm whether quantities align with benchmark. Risk is treated as moderate due to insufficient data.`;
  } else {
    rawScore = 72;
    reason = `Quantity comparability validation failed. Quantity divergence from benchmark quantities indicates potential scope or pricing misalignment that may result in post-award variations.`;
  }

  const normalized = rawScore / 100;
  const weight = RISK_DRIVER_WEIGHTS.quantity_comparability_risk;

  return {
    category: 'quantity_comparability_risk',
    score: rawScore,
    weight,
    weighted_contribution: normalized * weight,
    reason,
    severity: mapSeverity(normalized),
    confidence_contribution: quantity_comparability_valid === null ? CONFIDENCE_REDUCTIONS.missing_quantity_comparability : 0.0,
  };
}

function computeValidationIntegrityDriver(supplier: VariationRiskInputData): RiskDriver {
  const { document_truth_valid, gate_status } = supplier;

  let rawScore = 10;
  let reason = `Document integrity and gate status are acceptable.`;

  if (document_truth_valid === false) {
    rawScore += 50;
    reason = `Document truth validation failed. Integrity of parsed data is uncertain, increasing exposure risk.`;
  } else if (document_truth_valid === null) {
    rawScore += 20;
    reason = `Document truth validation result is unavailable. Integrity cannot be confirmed.`;
  }

  if (gate_status === 'fail') {
    rawScore = Math.min(100, rawScore + 30);
    reason += ` Gate status is FAIL — commercial integrity concern registered.`;
  } else if (gate_status === 'warn') {
    rawScore = Math.min(100, rawScore + 15);
    reason += ` Gate status carries a warning.`;
  }

  const normalized = rawScore / 100;
  const weight = RISK_DRIVER_WEIGHTS.validation_integrity_risk;

  return {
    category: 'validation_integrity_risk',
    score: rawScore,
    weight,
    weighted_contribution: normalized * weight,
    reason,
    severity: mapSeverity(normalized),
    confidence_contribution:
      document_truth_valid === false ? CONFIDENCE_REDUCTIONS.invalid_document_truth :
      document_truth_valid === null ? CONFIDENCE_REDUCTIONS.invalid_document_truth * 0.5 : 0.0,
  };
}

function computeUncertaintyDriver(supplier: VariationRiskInputData): RiskDriver {
  const { unknown_scope_count, scope_confidence_score, behaviour_confidence } = supplier;

  const uncertaintyIndex =
    normalizeScore(unknown_scope_count, 0, SCOPE_THRESHOLDS.unknown_scope_high) * 0.45 +
    (1 - scope_confidence_score) * 0.35 +
    (1 - behaviour_confidence) * 0.20;

  const rawScore = Math.min(100, uncertaintyIndex * 100);
  const normalized = rawScore / 100;
  const weight = RISK_DRIVER_WEIGHTS.uncertainty_risk;

  let reason: string;
  if (normalized < 0.25) {
    reason = `Overall data uncertainty is low. Predictions are well-supported by available evidence.`;
  } else if (normalized < 0.55) {
    reason = `Moderate data uncertainty. ${unknown_scope_count} unclassified scope items and partial behaviour data reduce prediction confidence.`;
  } else {
    reason = `High data uncertainty. Limited reliable evidence across scope, behaviour, and quantity data. Predictions should be treated as indicative rather than precise.`;
  }

  return {
    category: 'uncertainty_risk',
    score: rawScore,
    weight,
    weighted_contribution: normalized * weight,
    reason,
    severity: mapSeverity(normalized),
    confidence_contribution: normalized * 0.07,
  };
}

export function computeVariationRiskScore(drivers: RiskDriver[]): number {
  const totalWeightedScore = drivers.reduce(
    (sum, d) => sum + d.weighted_contribution,
    0
  );
  return Math.min(100, Math.round(totalWeightedScore * 100));
}

export function computeConfidenceScore(
  supplier: VariationRiskInputData,
  drivers: RiskDriver[]
): { score: number; quality: DataQuality } {
  let confidence = 1.0;

  const uncertaintyReductions = drivers.reduce(
    (sum, d) => sum + d.confidence_contribution,
    0
  );
  confidence -= uncertaintyReductions;

  if (supplier.scope_confidence_score < 0.5) {
    confidence -= CONFIDENCE_REDUCTIONS.low_scope_confidence;
  }

  if (supplier.behaviour_confidence < 0.4) {
    confidence -= CONFIDENCE_REDUCTIONS.behaviour_sparse_history;
  }

  if (supplier.unknown_scope_count > SCOPE_THRESHOLDS.unknown_scope_high) {
    confidence -= CONFIDENCE_REDUCTIONS.high_unknown_scope;
  }

  confidence = Math.max(0.1, Math.min(1.0, confidence));

  const quality: DataQuality =
    confidence >= 0.70 ? 'sufficient' :
    confidence >= 0.45 ? 'partial' : 'insufficient';

  return { score: confidence, quality };
}

export function buildRiskDrivers(supplier: VariationRiskInputData): RiskDriver[] {
  return [
    computeScopeOmissionDriver(supplier),
    computeExclusionDensityDriver(supplier),
    computeQualificationDriver(supplier),
    computeBehaviourPatternDriver(supplier),
    computeQuantityComparabilityDriver(supplier),
    computeValidationIntegrityDriver(supplier),
    computeUncertaintyDriver(supplier),
  ];
}

export function getTopDrivers(drivers: RiskDriver[], limit = 3): RiskDriver[] {
  return [...drivers]
    .sort((a, b) => b.weighted_contribution - a.weighted_contribution)
    .slice(0, limit);
}
