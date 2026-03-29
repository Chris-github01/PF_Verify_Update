import { RISK_LEVEL_LABELS, SEVERITY_LABELS } from './variationRiskConfig';
import type {
  SupplierVariationRiskResult,
  RiskDriver,
  VariationRiskLevel,
  DataQuality,
} from './variationRiskTypes';

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

function riskLevelLabel(level: VariationRiskLevel): string {
  return RISK_LEVEL_LABELS[level];
}

function qualityClause(quality: DataQuality): string {
  if (quality === 'sufficient') return '';
  if (quality === 'partial') return ' Note: prediction confidence is partial due to incomplete data.';
  return ' Caution: data quality is insufficient for high-confidence prediction.';
}

export function buildRiskSummary(result: SupplierVariationRiskResult): string {
  const { supplier_name, variation_risk_level, variation_risk_score, confidence_score, data_quality } = result;

  const baseText =
    `${supplier_name} carries a ${riskLevelLabel(variation_risk_level)} profile (score: ${variation_risk_score}/100). ` +
    `Prediction confidence is ${formatPercent(confidence_score)}.`;

  return baseText + qualityClause(data_quality);
}

export function buildDriverSummary(drivers: RiskDriver[]): string {
  const top = [...drivers]
    .sort((a, b) => b.weighted_contribution - a.weighted_contribution)
    .slice(0, 3);

  if (top.length === 0) return 'No significant risk drivers identified.';

  const parts = top.map(
    (d) => `${SEVERITY_LABELS[d.severity].toLowerCase()} ${d.category.replace(/_/g, ' ')} (${formatPercent(d.weighted_contribution)})`
  );

  return `Primary risk drivers: ${parts.join(', ')}.`;
}

export function buildExposureSummary(result: SupplierVariationRiskResult): string {
  const {
    supplier_name,
    predicted_variation_exposure_percent,
    predicted_variation_exposure_value,
    risk_adjusted_tender_value,
    submitted_total,
    exposure_range,
  } = result;

  const rangeText =
    `Conservative estimate: ${formatPercent(exposure_range.conservative_exposure_percent)}, ` +
    `elevated estimate: ${formatPercent(exposure_range.elevated_exposure_percent)}.`;

  return (
    `${supplier_name} carries an estimated ${formatPercent(predicted_variation_exposure_percent)} post-award variation exposure ` +
    `(${formatCurrency(predicted_variation_exposure_value)}) on a base of ${formatCurrency(submitted_total)}. ` +
    `Risk-adjusted tender value: ${formatCurrency(risk_adjusted_tender_value)}. ${rangeText}`
  );
}

export function buildAdjustedPositionSummary(result: SupplierVariationRiskResult): string {
  const { supplier_name, submitted_rank, risk_adjusted_rank, rank_changed } = result;

  if (!rank_changed) {
    return (
      `${supplier_name} maintains its submitted ranking (#${submitted_rank}) after risk adjustment. ` +
      `No material position change identified.`
    );
  }

  if (risk_adjusted_rank < submitted_rank) {
    return (
      `${supplier_name} improves from submitted rank #${submitted_rank} to risk-adjusted rank #${risk_adjusted_rank}. ` +
      `Lower variation exposure positions this supplier more favourably on a risk-adjusted basis.`
    );
  }

  return (
    `${supplier_name} moves from submitted rank #${submitted_rank} to risk-adjusted rank #${risk_adjusted_rank}. ` +
    `Predicted variation exposure reduces this supplier's relative commercial position.`
  );
}

export function enrichSupplierResultWithSummaries(
  result: Omit<SupplierVariationRiskResult, 'risk_summary' | 'driver_summary' | 'exposure_summary' | 'adjusted_position_summary'>
): SupplierVariationRiskResult {
  const full = result as SupplierVariationRiskResult;
  full.risk_summary = buildRiskSummary(full);
  full.driver_summary = buildDriverSummary(full.main_risk_drivers);
  full.exposure_summary = buildExposureSummary(full);
  full.adjusted_position_summary = buildAdjustedPositionSummary(full);
  return full;
}
