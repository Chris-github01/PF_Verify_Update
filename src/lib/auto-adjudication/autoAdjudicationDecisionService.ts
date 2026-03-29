import {
  CONFIDENCE_THRESHOLDS,
  CLOSE_CALL_THRESHOLDS,
  GATE_STATUS_ELIGIBILITY,
  AUTO_ADJUDICATION_CONFIG_VERSION,
} from './autoAdjudicationConfig';
import {
  buildSupplierRankings,
  evaluateHardStops,
} from './autoAdjudicationScoringService';
import type {
  SupplierInputData,
  AutoAdjudicationResult,
  AdjudicationRunOptions,
  FinalOutcome,
  CloseCallEvaluation,
  SupplierScoreBreakdown,
} from './autoAdjudicationTypes';
import { buildAdjudicationNarratives } from './autoAdjudicationSummaryBuilder';

function computeRecommendationConfidence(
  rankings: SupplierScoreBreakdown[],
  topEligible: SupplierScoreBreakdown | null,
  supplierCount: number
): number {
  if (!topEligible) return 0;

  const topScore = topEligible.overall_score;
  const secondEligible = rankings.find(
    r => r.recommendation_eligible && r.supplier_id !== topEligible.supplier_id
  );
  const margin = secondEligible ? topScore - secondEligible.overall_score : 1.0;

  const marginFactor = Math.min(1, margin / 0.15);
  const countFactor = supplierCount >= 3 ? 1.0 : 0.85;
  const gateFactor = topEligible.gate_status === 'pass' ? 1.0 : 0.78;
  const validationFactor = topEligible.validation_integrity_score >= 0.70 ? 1.0 : 0.85;

  const confidence = topScore * marginFactor * countFactor * gateFactor * validationFactor;
  return Math.max(0, Math.min(1, confidence));
}

function evaluateCloseCall(rankings: SupplierScoreBreakdown[]): CloseCallEvaluation {
  const eligible = rankings.filter(r => r.recommendation_eligible);
  if (eligible.length < 2) {
    return { is_close_call: false, margin: 1.0, reasons: [] };
  }

  const top = eligible[0];
  const second = eligible[1];
  const margin = top.overall_score - second.overall_score;
  const reasons: string[] = [];

  if (margin <= CLOSE_CALL_THRESHOLDS.overall_score_margin) {
    reasons.push(
      `Top two eligible suppliers are within ${(margin * 100).toFixed(1)} points overall — margin too narrow for automatic recommendation.`
    );
  }

  const priceMargin = Math.abs(top.price_position_score - second.price_position_score);
  const scopeMargin = Math.abs(top.scope_strength_score - second.scope_strength_score);

  if (
    priceMargin > CLOSE_CALL_THRESHOLDS.price_position_margin &&
    scopeMargin > CLOSE_CALL_THRESHOLDS.scope_strength_margin
  ) {
    reasons.push(
      'Significant divergence between price advantage and scope strength — commercial trade-off requires human judgment.'
    );
  }

  return {
    is_close_call: reasons.length > 0,
    margin,
    reasons,
  };
}

function determineFinalOutcome(
  hardStopTriggered: boolean,
  hardStopReasons: string[],
  topEligible: SupplierScoreBreakdown | null,
  confidence: number,
  closeCall: CloseCallEvaluation,
  manualReviewReasons: string[]
): FinalOutcome {
  if (hardStopTriggered) return 'blocked_no_safe_recommendation';
  if (!topEligible) return 'blocked_no_safe_recommendation';

  if (closeCall.is_close_call || manualReviewReasons.length > 0) {
    return 'manual_review_required';
  }

  if (confidence >= CONFIDENCE_THRESHOLDS.min_for_auto_recommend && topEligible.gate_status === 'pass') {
    return 'auto_recommend';
  }

  if (confidence >= CONFIDENCE_THRESHOLDS.min_for_recommend_with_warnings) {
    return 'recommend_with_warnings';
  }

  return 'manual_review_required';
}

export async function runAutoAdjudication(
  options: AdjudicationRunOptions
): Promise<AutoAdjudicationResult> {
  const { project_id, trade, suppliers } = options;
  const generatedAt = new Date().toISOString();

  const allSubmittedTotals = suppliers.map(s => s.submitted_total);

  const rankings = buildSupplierRankings(suppliers, allSubmittedTotals);

  const hardStopEval = evaluateHardStops(suppliers);

  const cheapest = suppliers.reduce((a, b) =>
    a.submitted_total <= b.submitted_total ? a : b
  );

  const adjustedCheapest = suppliers
    .filter(s => s.normalised_total !== null)
    .reduce<SupplierInputData | null>((acc, s) => {
      if (!acc) return s;
      return (s.normalised_total ?? Infinity) < (acc.normalised_total ?? Infinity) ? s : acc;
    }, null);

  const strongestScope = suppliers.reduce((a, b) =>
    a.core_scope_coverage_pct >= b.core_scope_coverage_pct ? a : b
  );

  const lowestRisk = suppliers
    .filter(s => s.behaviour_risk_rating === 'green')
    .sort((a, b) => a.variation_exposure_score - b.variation_exposure_score)[0]
    ?? suppliers.sort((a, b) => a.variation_exposure_score - b.variation_exposure_score)[0];

  const topEligible = rankings.find(r => r.recommendation_eligible) ?? null;

  const confidence = computeRecommendationConfidence(rankings, topEligible, suppliers.length);
  const closeCall = evaluateCloseCall(rankings);

  const manualReviewReasons: string[] = [];
  const warningReasons: string[] = [];
  const blockReasons: string[] = [...hardStopEval.reasons];
  const recommendationReasons: string[] = [];

  if (hardStopEval.triggered) {
    blockReasons.push(...hardStopEval.reasons);
  }

  if (closeCall.is_close_call) {
    manualReviewReasons.push(...closeCall.reasons);
  }

  if (confidence < CONFIDENCE_THRESHOLDS.min_for_recommend_with_warnings && topEligible) {
    manualReviewReasons.push(
      `Recommendation confidence (${(confidence * 100).toFixed(0)}%) is below the minimum threshold for a defensible recommendation.`
    );
  }

  if (topEligible) {
    if (topEligible.scope_strength_score >= 0.75) {
      recommendationReasons.push('Strongest core scope coverage among eligible suppliers.');
    }
    if (topEligible.behaviour_trust_score >= 0.80) {
      recommendationReasons.push('Favourable commercial behaviour history.');
    }
    if (topEligible.price_position_score >= 0.75) {
      recommendationReasons.push('Competitive price position.');
    }
    if (topEligible.variation_risk_score >= 0.75) {
      recommendationReasons.push('Lowest variation risk profile.');
    }
    if (topEligible.gate_status === 'pass') {
      recommendationReasons.push('Passed all commercial decision gates.');
    }
    if (topEligible.gate_status === 'warn') {
      warningReasons.push('Recommended supplier has active gate warnings — QS review recommended before award.');
    }
  }

  if (suppliers.some(s => s.gate_status === 'warn')) {
    warningReasons.push('One or more suppliers have unresolved gate warnings.');
  }

  if (topEligible && cheapest.supplier_id !== topEligible.supplier_id) {
    warningReasons.push(
      `Cheapest submitted price (${cheapest.supplier_name}) was not selected — scored lower on scope strength and/or risk profile.`
    );
  }

  const finalOutcome = determineFinalOutcome(
    hardStopEval.triggered,
    blockReasons,
    topEligible,
    confidence,
    closeCall,
    manualReviewReasons
  );

  const recommendedSupplier =
    finalOutcome === 'auto_recommend' || finalOutcome === 'recommend_with_warnings'
      ? topEligible
      : null;

  const narratives = buildAdjudicationNarratives({
    finalOutcome,
    recommendedSupplier,
    cheapestSupplier: cheapest,
    rankings,
    confidence,
    recommendationReasons,
    warningReasons,
    blockReasons,
    manualReviewReasons,
    trade,
  });

  const recommendationSummary =
    finalOutcome === 'auto_recommend'
      ? `${recommendedSupplier!.supplier_name} is recommended as best tenderer with ${(confidence * 100).toFixed(0)}% confidence.`
      : finalOutcome === 'recommend_with_warnings'
      ? `${recommendedSupplier!.supplier_name} leads on commercial criteria — recommendation issued with warnings.`
      : finalOutcome === 'manual_review_required'
      ? 'Commercial data is insufficient for a safe automatic recommendation — manual review required.'
      : 'No safe recommendation is possible — critical validation blocks are active.';

  return {
    adjudication_mode: 'auto',
    final_outcome: finalOutcome,
    recommended_supplier_id: recommendedSupplier?.supplier_id ?? null,
    recommended_supplier_name: recommendedSupplier?.supplier_name ?? null,
    cheapest_supplier_id: cheapest.supplier_id,
    cheapest_supplier_name: cheapest.supplier_name,
    adjusted_cheapest_supplier_id: adjustedCheapest?.supplier_id ?? null,
    strongest_scope_supplier_id: strongestScope.supplier_id,
    lowest_risk_supplier_id: lowestRisk?.supplier_id ?? null,
    recommendation_confidence_score: confidence,
    recommendation_summary: recommendationSummary,
    recommendation_reasons: recommendationReasons,
    warning_reasons: warningReasons,
    block_reasons: blockReasons,
    manual_review_reasons: manualReviewReasons,
    supplier_rankings: rankings,
    narratives,
    config_version: AUTO_ADJUDICATION_CONFIG_VERSION,
    generated_at: generatedAt,
  };
}
