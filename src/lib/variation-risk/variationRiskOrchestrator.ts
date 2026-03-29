import { VARIATION_RISK_CONFIG_VERSION } from './variationRiskConfig';
import type {
  VariationRiskInputData,
  VariationRiskRunOptions,
  VariationRiskRunResult,
  SupplierVariationRiskResult,
  DataQuality,
} from './variationRiskTypes';
import {
  buildRiskDrivers,
  computeVariationRiskScore,
  computeConfidenceScore,
  getTopDrivers,
} from './variationRiskScoringService';
import {
  calculateSupplierExposure,
  computeSubmittedRanks,
  computeRiskAdjustedRanks,
} from './variationRiskExposureCalculator';
import { buildVariationRiskComparison } from './variationRiskComparisonService';
import { enrichSupplierResultWithSummaries } from './variationRiskSummaryBuilder';

function processSupplier(
  supplier: VariationRiskInputData
): Omit<SupplierVariationRiskResult, 'submitted_rank' | 'risk_adjusted_rank' | 'rank_changed'> {
  const drivers = buildRiskDrivers(supplier);
  const riskScore = computeVariationRiskScore(drivers);
  const { score: confidenceScore, quality } = computeConfidenceScore(supplier, drivers);
  const exposure = calculateSupplierExposure(supplier, riskScore);
  const topDrivers = getTopDrivers(drivers, 4);

  return {
    supplier_id: supplier.supplier_id,
    supplier_name: supplier.supplier_name,
    submitted_total: supplier.submitted_total,
    normalised_total: supplier.normalised_total,
    variation_risk_score: riskScore,
    variation_risk_level: exposure.variation_risk_level,
    predicted_variation_exposure_percent: exposure.predicted_variation_exposure_percent,
    predicted_variation_exposure_value: exposure.predicted_variation_exposure_value,
    risk_adjusted_tender_value: exposure.risk_adjusted_tender_value,
    exposure_range: exposure.exposure_range,
    confidence_score: confidenceScore,
    data_quality: quality,
    main_risk_drivers: topDrivers,
    risk_summary: '',
    driver_summary: '',
    exposure_summary: '',
    adjusted_position_summary: '',
  };
}

function computeOverallDataQuality(results: SupplierVariationRiskResult[]): DataQuality {
  const qualities = results.map((r) => r.data_quality);
  if (qualities.every((q) => q === 'sufficient')) return 'sufficient';
  if (qualities.some((q) => q === 'insufficient')) return 'insufficient';
  return 'partial';
}

export async function runVariationRiskPredictor(
  options: VariationRiskRunOptions
): Promise<VariationRiskRunResult> {
  const { project_id, trade, suppliers, run_by_user_id } = options;

  const partialResults = suppliers.map(processSupplier);

  const submittedRanks = computeSubmittedRanks(
    partialResults.map((r) => ({
      supplier_id: r.supplier_id,
      submitted_total: r.submitted_total,
    }))
  );

  const riskAdjustedRanks = computeRiskAdjustedRanks(
    partialResults.map((r) => ({
      supplier_id: r.supplier_id,
      risk_adjusted_tender_value: r.risk_adjusted_tender_value,
    }))
  );

  const rankedPartials = partialResults.map((r) => {
    const submittedRank = submittedRanks.get(r.supplier_id) ?? 0;
    const riskAdjustedRank = riskAdjustedRanks.get(r.supplier_id) ?? 0;
    return {
      ...r,
      submitted_rank: submittedRank,
      risk_adjusted_rank: riskAdjustedRank,
      rank_changed: submittedRank !== riskAdjustedRank,
    };
  });

  const enrichedResults: SupplierVariationRiskResult[] = rankedPartials.map(
    enrichSupplierResultWithSummaries
  );

  const comparison = buildVariationRiskComparison(enrichedResults);
  const overallQuality = computeOverallDataQuality(enrichedResults);

  return {
    project_id,
    trade,
    supplier_results: enrichedResults,
    comparison,
    overall_data_quality: overallQuality,
    config_version: VARIATION_RISK_CONFIG_VERSION,
    generated_at: new Date().toISOString(),
    run_by_user_id,
  };
}
