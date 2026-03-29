import { COMPARISON_THRESHOLDS } from './variationRiskConfig';
import type {
  SupplierVariationRiskResult,
  VariationRiskComparisonResult,
} from './variationRiskTypes';

function findCheapestBySubmitted(
  results: SupplierVariationRiskResult[]
): SupplierVariationRiskResult {
  return results.reduce((min, s) =>
    s.submitted_total < min.submitted_total ? s : min
  );
}

function findCheapestByRiskAdjusted(
  results: SupplierVariationRiskResult[]
): SupplierVariationRiskResult {
  return results.reduce((min, s) =>
    s.risk_adjusted_tender_value < min.risk_adjusted_tender_value ? s : min
  );
}

function findLowestRisk(
  results: SupplierVariationRiskResult[]
): SupplierVariationRiskResult {
  return results.reduce((min, s) =>
    s.variation_risk_score < min.variation_risk_score ? s : min
  );
}

function findLargestExposure(
  results: SupplierVariationRiskResult[]
): SupplierVariationRiskResult {
  return results.reduce((max, s) =>
    s.predicted_variation_exposure_value > max.predicted_variation_exposure_value ? s : max
  );
}

function findBiggestCostShift(
  results: SupplierVariationRiskResult[]
): { supplier: SupplierVariationRiskResult; shiftValue: number } {
  let biggest = results[0];
  let biggestShift = 0;

  for (const s of results) {
    const shift = s.risk_adjusted_tender_value - s.submitted_total;
    if (shift > biggestShift) {
      biggestShift = shift;
      biggest = s;
    }
  }

  return { supplier: biggest, shiftValue: biggestShift };
}

export function buildVariationRiskComparison(
  results: SupplierVariationRiskResult[]
): VariationRiskComparisonResult {
  if (results.length === 0) {
    return buildEmptyComparison();
  }

  const cheapestSubmitted = findCheapestBySubmitted(results);
  const cheapestRiskAdjusted = findCheapestByRiskAdjusted(results);
  const lowestRisk = findLowestRisk(results);
  const largestExposure = findLargestExposure(results);
  const { supplier: biggestShiftSupplier, shiftValue } = findBiggestCostShift(results);

  const recommendationChanged =
    cheapestSubmitted.supplier_id !== cheapestRiskAdjusted.supplier_id;

  const originalCheapestStillCheapest = !recommendationChanged;

  const exposureDifference =
    (cheapestSubmitted.predicted_variation_exposure_percent -
      cheapestRiskAdjusted.predicted_variation_exposure_percent);

  const isMaterialDifference =
    Math.abs(exposureDifference) >= COMPARISON_THRESHOLDS.material_exposure_difference;

  const comparisonSummary = buildComparisonSummary(
    results,
    cheapestSubmitted,
    cheapestRiskAdjusted,
    recommendationChanged
  );

  const executiveSummary = buildExecutiveSummary(
    results,
    cheapestSubmitted,
    cheapestRiskAdjusted,
    lowestRisk,
    recommendationChanged
  );

  const riskAdjustedComparisonSummary = buildRiskAdjustedComparisonSummary(
    results,
    cheapestSubmitted,
    cheapestRiskAdjusted
  );

  const recommendationImpactSummary = buildRecommendationImpactSummary(
    recommendationChanged,
    cheapestSubmitted,
    cheapestRiskAdjusted,
    isMaterialDifference
  );

  const whyCheapestMayNotBeSummary = recommendationChanged
    ? buildWhyCheapestMayNotBeSummary(
        cheapestSubmitted,
        cheapestRiskAdjusted
      )
    : null;

  return {
    cheapest_submitted_supplier_id: cheapestSubmitted.supplier_id,
    cheapest_submitted_supplier_name: cheapestSubmitted.supplier_name,
    cheapest_risk_adjusted_supplier_id: cheapestRiskAdjusted.supplier_id,
    cheapest_risk_adjusted_supplier_name: cheapestRiskAdjusted.supplier_name,
    lowest_variation_risk_supplier_id: lowestRisk.supplier_id,
    lowest_variation_risk_supplier_name: lowestRisk.supplier_name,
    largest_predicted_exposure_supplier_id: largestExposure.supplier_id,
    largest_predicted_exposure_supplier_name: largestExposure.supplier_name,
    biggest_cost_shift_supplier_id: biggestShiftSupplier.supplier_id,
    biggest_cost_shift_supplier_name: biggestShiftSupplier.supplier_name,
    biggest_cost_shift_value: shiftValue,
    recommendation_changed_after_risk_adjustment: recommendationChanged,
    original_cheapest_still_cheapest: originalCheapestStillCheapest,
    comparison_summary: comparisonSummary,
    executive_variation_risk_summary: executiveSummary,
    risk_adjusted_comparison_summary: riskAdjustedComparisonSummary,
    recommendation_impact_summary: recommendationImpactSummary,
    why_cheapest_may_not_be_cheapest_summary: whyCheapestMayNotBeSummary,
  };
}

function buildComparisonSummary(
  results: SupplierVariationRiskResult[],
  cheapestSubmitted: SupplierVariationRiskResult,
  cheapestRiskAdjusted: SupplierVariationRiskResult,
  recommendationChanged: boolean
): string {
  const count = results.length;
  const lowestExposurePct = Math.min(...results.map((s) => s.predicted_variation_exposure_percent));
  const highestExposurePct = Math.max(...results.map((s) => s.predicted_variation_exposure_percent));

  if (recommendationChanged) {
    return (
      `Across ${count} supplier(s), variation risk analysis shifts the price leadership position. ` +
      `${cheapestSubmitted.supplier_name} submits the lowest price but carries the highest predicted exposure. ` +
      `${cheapestRiskAdjusted.supplier_name} is the strongest commercial position after risk adjustment. ` +
      `Predicted exposure ranges from ${(lowestExposurePct * 100).toFixed(1)}% to ${(highestExposurePct * 100).toFixed(1)}% across the field.`
    );
  }
  return (
    `Across ${count} supplier(s), ${cheapestSubmitted.supplier_name} maintains price leadership after risk adjustment. ` +
    `Predicted variation exposure ranges from ${(lowestExposurePct * 100).toFixed(1)}% to ${(highestExposurePct * 100).toFixed(1)}%.`
  );
}

function buildExecutiveSummary(
  results: SupplierVariationRiskResult[],
  cheapestSubmitted: SupplierVariationRiskResult,
  cheapestRiskAdjusted: SupplierVariationRiskResult,
  lowestRisk: SupplierVariationRiskResult,
  recommendationChanged: boolean
): string {
  const valueDiff =
    cheapestRiskAdjusted.risk_adjusted_tender_value -
    cheapestSubmitted.risk_adjusted_tender_value;

  if (results.length === 1) {
    return (
      `Single-supplier analysis: ${results[0].supplier_name} carries a ${(results[0].predicted_variation_exposure_percent * 100).toFixed(1)}% ` +
      `predicted variation exposure, implying a risk-adjusted value of $${results[0].risk_adjusted_tender_value.toLocaleString()}.`
    );
  }

  if (recommendationChanged) {
    return (
      `Variation risk analysis identifies a material commercial divergence. ${cheapestSubmitted.supplier_name} is lowest on submitted price ` +
      `but carries elevated predicted exposure. After risk adjustment, ${cheapestRiskAdjusted.supplier_name} represents the stronger commercial position ` +
      `by approximately $${Math.abs(valueDiff).toLocaleString()}. ${lowestRisk.supplier_name} carries the lowest overall variation risk profile.`
    );
  }

  return (
    `${cheapestSubmitted.supplier_name} holds both the lowest submitted price and the strongest risk-adjusted position across ${results.length} suppliers. ` +
    `${lowestRisk.supplier_name} carries the lowest variation risk profile.`
  );
}

function buildRiskAdjustedComparisonSummary(
  results: SupplierVariationRiskResult[],
  cheapestSubmitted: SupplierVariationRiskResult,
  cheapestRiskAdjusted: SupplierVariationRiskResult
): string {
  const lines: string[] = results.map((s) => {
    const shift = s.risk_adjusted_tender_value - s.submitted_total;
    return (
      `${s.supplier_name}: submitted $${s.submitted_total.toLocaleString()}, ` +
      `+${(s.predicted_variation_exposure_percent * 100).toFixed(1)}% exposure, ` +
      `risk-adjusted $${s.risk_adjusted_tender_value.toLocaleString()} (+$${shift.toLocaleString()})`
    );
  });

  return lines.join('. ');
}

function buildRecommendationImpactSummary(
  recommendationChanged: boolean,
  cheapestSubmitted: SupplierVariationRiskResult,
  cheapestRiskAdjusted: SupplierVariationRiskResult,
  isMaterialDifference: boolean
): string {
  if (!recommendationChanged) {
    if (isMaterialDifference) {
      return (
        `Variation risk analysis supports the current price-based recommendation. ` +
        `${cheapestSubmitted.supplier_name} maintains position as both submitted and risk-adjusted lowest, ` +
        `though some exposure difference exists across the field.`
      );
    }
    return (
      `Variation risk analysis does not change the commercial recommendation. ` +
      `${cheapestSubmitted.supplier_name} remains lowest on both submitted and risk-adjusted basis.`
    );
  }

  const exposureGap =
    cheapestSubmitted.predicted_variation_exposure_percent -
    cheapestRiskAdjusted.predicted_variation_exposure_percent;

  return (
    `Variation risk analysis indicates the commercial recommendation may differ from submitted price alone. ` +
    `${cheapestSubmitted.supplier_name} is cheapest on submission but carries ${(exposureGap * 100).toFixed(1)}% more predicted exposure than ${cheapestRiskAdjusted.supplier_name}. ` +
    `After risk adjustment, ${cheapestRiskAdjusted.supplier_name} represents the lower expected commercial outturn. ` +
    `This should be considered in final recommendation.`
  );
}

function buildWhyCheapestMayNotBeSummary(
  cheapestSubmitted: SupplierVariationRiskResult,
  cheapestRiskAdjusted: SupplierVariationRiskResult
): string {
  const mainDrivers = cheapestSubmitted.main_risk_drivers.slice(0, 2);
  const driverText = mainDrivers
    .map((d) => d.reason.split('.')[0])
    .join('. ');

  const valueDiff =
    cheapestSubmitted.risk_adjusted_tender_value -
    cheapestRiskAdjusted.risk_adjusted_tender_value;

  return (
    `${cheapestSubmitted.supplier_name} is lowest on submitted price but carries a ${cheapestSubmitted.variation_risk_level} variation risk profile. ` +
    `${driverText}. ` +
    `After applying a predicted exposure of ${(cheapestSubmitted.predicted_variation_exposure_percent * 100).toFixed(1)}%, ` +
    `the risk-adjusted value exceeds ${cheapestRiskAdjusted.supplier_name} by approximately $${Math.abs(valueDiff).toLocaleString()}. ` +
    `${cheapestRiskAdjusted.supplier_name} is the lower expected commercial outturn when variation exposure is considered.`
  );
}

function buildEmptyComparison(): VariationRiskComparisonResult {
  return {
    cheapest_submitted_supplier_id: '',
    cheapest_submitted_supplier_name: '',
    cheapest_risk_adjusted_supplier_id: '',
    cheapest_risk_adjusted_supplier_name: '',
    lowest_variation_risk_supplier_id: '',
    lowest_variation_risk_supplier_name: '',
    largest_predicted_exposure_supplier_id: '',
    largest_predicted_exposure_supplier_name: '',
    biggest_cost_shift_supplier_id: '',
    biggest_cost_shift_supplier_name: '',
    biggest_cost_shift_value: 0,
    recommendation_changed_after_risk_adjustment: false,
    original_cheapest_still_cheapest: true,
    comparison_summary: 'No supplier data available for comparison.',
    executive_variation_risk_summary: 'Insufficient data to generate variation risk summary.',
    risk_adjusted_comparison_summary: 'No comparison data available.',
    recommendation_impact_summary: 'No impact assessment available.',
    why_cheapest_may_not_be_cheapest_summary: null,
  };
}
