import {
  EXPOSURE_DRIVER_COEFFICIENTS,
  EXPOSURE_BANDS,
  BEHAVIOUR_RISK_EXPOSURE_MULTIPLIERS,
  RANGE_MODEL_CONFIG,
  EXPOSURE_BASE_VALUE,
} from './variationRiskConfig';
import type {
  VariationRiskInputData,
  ExposureRange,
  VariationRiskLevel,
} from './variationRiskTypes';
import { mapRiskLevel } from './variationRiskScoringService';

function computeBaseExposurePercent(supplier: VariationRiskInputData): number {
  const {
    core_scope_coverage_pct,
    excluded_scope_count,
    risk_scope_count,
    unknown_scope_count,
    behaviour_risk_rating,
    quantity_comparability_valid,
    document_truth_valid,
    likely_variation_exposure_score,
  } = supplier;

  const scopeOmissionContrib =
    EXPOSURE_DRIVER_COEFFICIENTS.scope_omission_base *
    Math.max(0, 1 - core_scope_coverage_pct / 0.85);

  const exclusionContrib =
    excluded_scope_count * EXPOSURE_DRIVER_COEFFICIENTS.exclusion_per_item;

  const riskScopeContrib =
    risk_scope_count * EXPOSURE_DRIVER_COEFFICIENTS.risk_scope_per_item;

  const unknownContrib =
    unknown_scope_count * EXPOSURE_DRIVER_COEFFICIENTS.unknown_scope_per_item;

  const behaviourMultiplier =
    BEHAVIOUR_RISK_EXPOSURE_MULTIPLIERS[behaviour_risk_rating];

  const quantityContrib =
    quantity_comparability_valid === false
      ? EXPOSURE_DRIVER_COEFFICIENTS.low_quantity_comparability_uplift
      : quantity_comparability_valid === null
      ? EXPOSURE_DRIVER_COEFFICIENTS.low_quantity_comparability_uplift * 0.5
      : 0;

  const documentContrib =
    document_truth_valid === false
      ? EXPOSURE_DRIVER_COEFFICIENTS.invalid_document_truth_uplift
      : 0;

  const existingExposureSignal = likely_variation_exposure_score * 0.06;

  const rawExposure =
    (scopeOmissionContrib +
      exclusionContrib +
      riskScopeContrib +
      unknownContrib +
      quantityContrib +
      documentContrib +
      existingExposureSignal) *
    behaviourMultiplier;

  return Math.min(
    EXPOSURE_DRIVER_COEFFICIENTS.max_exposure_cap,
    Math.max(0, rawExposure)
  );
}

export function computeExposureRange(
  expectedExposurePercent: number
): ExposureRange {
  const conservative =
    expectedExposurePercent * RANGE_MODEL_CONFIG.conservative_reduction;
  const elevated =
    expectedExposurePercent * RANGE_MODEL_CONFIG.elevated_uplift;

  return {
    conservative_exposure_percent: Math.min(
      EXPOSURE_DRIVER_COEFFICIENTS.max_exposure_cap,
      conservative
    ),
    expected_exposure_percent: expectedExposurePercent,
    elevated_exposure_percent: Math.min(
      EXPOSURE_DRIVER_COEFFICIENTS.max_exposure_cap,
      elevated
    ),
  };
}

function selectBaseValue(supplier: VariationRiskInputData): number {
  if (EXPOSURE_BASE_VALUE === 'normalised' && supplier.normalised_total != null) {
    return supplier.normalised_total;
  }
  return supplier.submitted_total;
}

export function mapExposureBand(exposurePercent: number): string {
  if (exposurePercent <= EXPOSURE_BANDS.low.max) return EXPOSURE_BANDS.low.label;
  if (exposurePercent <= EXPOSURE_BANDS.moderate.max) return EXPOSURE_BANDS.moderate.label;
  if (exposurePercent <= EXPOSURE_BANDS.high.max) return EXPOSURE_BANDS.high.label;
  return EXPOSURE_BANDS.critical.label;
}

export interface SupplierExposureCalculation {
  predicted_variation_exposure_percent: number;
  predicted_variation_exposure_value: number;
  risk_adjusted_tender_value: number;
  exposure_range: ExposureRange;
  variation_risk_level: VariationRiskLevel;
  base_value_used: number;
}

export function calculateSupplierExposure(
  supplier: VariationRiskInputData,
  variationRiskScore: number
): SupplierExposureCalculation {
  const expectedExposurePercent = computeBaseExposurePercent(supplier);
  const exposureRange = computeExposureRange(expectedExposurePercent);
  const baseValue = selectBaseValue(supplier);

  const exposureValue = baseValue * expectedExposurePercent;
  const riskAdjustedValue = baseValue + exposureValue;
  const riskLevel = mapRiskLevel(variationRiskScore);

  return {
    predicted_variation_exposure_percent: expectedExposurePercent,
    predicted_variation_exposure_value: exposureValue,
    risk_adjusted_tender_value: riskAdjustedValue,
    exposure_range: exposureRange,
    variation_risk_level: riskLevel,
    base_value_used: baseValue,
  };
}

export function computeSubmittedRanks(
  suppliers: Array<{ supplier_id: string; submitted_total: number }>
): Map<string, number> {
  const sorted = [...suppliers].sort((a, b) => a.submitted_total - b.submitted_total);
  const ranks = new Map<string, number>();
  sorted.forEach((s, i) => ranks.set(s.supplier_id, i + 1));
  return ranks;
}

export function computeRiskAdjustedRanks(
  suppliers: Array<{ supplier_id: string; risk_adjusted_tender_value: number }>
): Map<string, number> {
  const sorted = [...suppliers].sort(
    (a, b) => a.risk_adjusted_tender_value - b.risk_adjusted_tender_value
  );
  const ranks = new Map<string, number>();
  sorted.forEach((s, i) => ranks.set(s.supplier_id, i + 1));
  return ranks;
}
