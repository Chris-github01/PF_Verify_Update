import {
  SCORE_WEIGHTS,
  BEHAVIOUR_RISK_PENALTIES,
  VARIATION_RISK_REFERENCE_MAX,
  GATE_STATUS_ELIGIBILITY,
  HARD_STOP_THRESHOLDS,
} from './autoAdjudicationConfig';
import type {
  SupplierInputData,
  RawScores,
  SupplierScoreBreakdown,
  HardStopEvaluation,
  GateStatusValue,
} from './autoAdjudicationTypes';

function computePricePositionScore(
  supplierTotal: number,
  allTotals: number[]
): number {
  const min = Math.min(...allTotals);
  const max = Math.max(...allTotals);
  if (max === min) return 1.0;
  const raw = 1 - (supplierTotal - min) / (max - min);
  return Math.max(0, Math.min(1, raw));
}

function computeScopeStrengthScore(supplier: SupplierInputData): number {
  const coreWeight = 0.65;
  const secondaryWeight = 0.20;
  const penaltyWeight = 0.15;

  const coreContrib = supplier.core_scope_coverage_pct * coreWeight;
  const secondaryContrib = supplier.secondary_scope_coverage_pct * secondaryWeight;

  const excludedPenalty = Math.min(1, supplier.excluded_scope_count / 15) * 0.5;
  const riskPenalty = Math.min(1, supplier.risk_scope_count / 12) * 0.3;
  const unknownPenalty = Math.min(1, supplier.unknown_scope_count / 20) * 0.2;
  const penaltyContrib = (excludedPenalty + riskPenalty + unknownPenalty) * penaltyWeight;

  const raw = coreContrib + secondaryContrib - penaltyContrib;
  return Math.max(0, Math.min(1, raw));
}

function computeValidationIntegrityScore(supplier: SupplierInputData): number {
  let score = supplier.scope_confidence_score;

  if (supplier.document_truth_valid === false) {
    score -= 0.25;
  } else if (supplier.document_truth_valid === null) {
    score -= 0.05;
  }

  if (supplier.quantity_comparability_valid === false) {
    score -= 0.20;
  } else if (supplier.quantity_comparability_valid === null) {
    score -= 0.03;
  }

  return Math.max(0, Math.min(1, score));
}

function computeBehaviourTrustScore(supplier: SupplierInputData): number {
  const riskMultiplier = BEHAVIOUR_RISK_PENALTIES[supplier.behaviour_risk_rating];
  const base = supplier.behaviour_confidence;
  return Math.max(0, Math.min(1, base * riskMultiplier));
}

function computeVariationRiskScore(supplier: SupplierInputData): number {
  const raw = 1 - Math.min(1, supplier.variation_exposure_score / VARIATION_RISK_REFERENCE_MAX);
  return Math.max(0, Math.min(1, raw));
}

function applyGatePenalty(score: number, gateStatus: GateStatusValue): number {
  if (gateStatus === 'fail') return score * 0.50;
  if (gateStatus === 'warn') return score * 0.88;
  return score;
}

export function scoreSupplier(
  supplier: SupplierInputData,
  allSubmittedTotals: number[]
): RawScores {
  const price_position_score = computePricePositionScore(
    supplier.submitted_total,
    allSubmittedTotals
  );
  const scope_strength_score = computeScopeStrengthScore(supplier);
  const validation_integrity_score = computeValidationIntegrityScore(supplier);
  const behaviour_trust_score = computeBehaviourTrustScore(supplier);
  const variation_risk_score = computeVariationRiskScore(supplier);

  const weighted =
    price_position_score * SCORE_WEIGHTS.price_position +
    scope_strength_score * SCORE_WEIGHTS.scope_strength +
    validation_integrity_score * SCORE_WEIGHTS.validation_integrity +
    behaviour_trust_score * SCORE_WEIGHTS.behaviour_trust +
    variation_risk_score * SCORE_WEIGHTS.variation_risk;

  const overall_score = applyGatePenalty(weighted, supplier.gate_status);

  return {
    price_position_score,
    scope_strength_score,
    validation_integrity_score,
    behaviour_trust_score,
    variation_risk_score,
    overall_score,
  };
}

export function evaluateHardStops(suppliers: SupplierInputData[]): HardStopEvaluation {
  const reasons: string[] = [];
  const affected: string[] = [];

  const eligibleSuppliers = suppliers.filter(s => {
    const gateMeta = GATE_STATUS_ELIGIBILITY[s.gate_status];
    return gateMeta.can_recommend_with_warnings;
  });

  if (eligibleSuppliers.length === 0) {
    reasons.push('All suppliers have failed commercial decision gates — no safe recommendation is possible.');
    suppliers.forEach(s => affected.push(s.supplier_id));
    return { triggered: true, reasons, affected_suppliers: affected };
  }

  if (suppliers.length < 2) {
    reasons.push('Insufficient supplier data — at least 2 analysable suppliers are required for auto-adjudication.');
  }

  for (const s of suppliers) {
    if (s.core_scope_coverage_pct < HARD_STOP_THRESHOLDS.min_core_scope_coverage) {
      reasons.push(
        `${s.supplier_name}: core scope coverage (${Math.round(s.core_scope_coverage_pct * 100)}%) is critically below the minimum threshold.`
      );
      affected.push(s.supplier_id);
    }
    if (s.gate_status === 'fail' && s.behaviour_risk_rating === 'red') {
      reasons.push(
        `${s.supplier_name}: failed decision gate combined with red behaviour risk — recommendation blocked.`
      );
      if (!affected.includes(s.supplier_id)) affected.push(s.supplier_id);
    }
  }

  return {
    triggered: reasons.length > 0 && affected.length === suppliers.length,
    reasons,
    affected_suppliers: affected,
  };
}

export function buildSupplierRankings(
  suppliers: SupplierInputData[],
  allSubmittedTotals: number[]
): SupplierScoreBreakdown[] {
  const scored = suppliers.map(s => {
    const scores = scoreSupplier(s, allSubmittedTotals);
    const gateMeta = GATE_STATUS_ELIGIBILITY[s.gate_status];
    const eligible = gateMeta.can_recommend_with_warnings;

    const reasons: string[] = [];
    const warnings: string[] = [];

    if (scores.price_position_score >= 0.80) reasons.push('Competitive price position.');
    if (scores.scope_strength_score >= 0.75) reasons.push('Strong core scope coverage.');
    if (scores.behaviour_trust_score >= 0.80) reasons.push('Favourable behaviour history.');
    if (scores.variation_risk_score >= 0.75) reasons.push('Low variation exposure.');

    if (s.gate_status === 'fail') warnings.push('Failed commercial decision gate — not eligible for recommendation.');
    if (s.gate_status === 'warn') warnings.push('Decision gate warnings present — recommendation requires review.');
    if (s.behaviour_risk_rating === 'red') warnings.push('Red behaviour risk rating — elevated caution required.');
    if (s.behaviour_risk_rating === 'amber') warnings.push('Amber behaviour risk — monitor closely.');
    if (s.excluded_scope_count > 5) warnings.push(`${s.excluded_scope_count} excluded scope items detected.`);
    if (s.risk_scope_count > 3) warnings.push(`${s.risk_scope_count} risk-flagged scope items.`);
    if (s.core_scope_coverage_pct < 0.65) warnings.push(`Core scope coverage below 65% (${Math.round(s.core_scope_coverage_pct * 100)}%).`);

    const summary = eligible
      ? `Score ${(scores.overall_score * 100).toFixed(1)} — ${s.gate_status === 'pass' ? 'Eligible' : 'Conditional eligibility'}`
      : `Score ${(scores.overall_score * 100).toFixed(1)} — Not eligible for recommendation`;

    return {
      supplier_id: s.supplier_id,
      supplier_name: s.supplier_name,
      submitted_total: s.submitted_total,
      normalised_total: s.normalised_total,
      gate_status: s.gate_status,
      overall_score: scores.overall_score,
      price_position_score: scores.price_position_score,
      scope_strength_score: scores.scope_strength_score,
      validation_integrity_score: scores.validation_integrity_score,
      behaviour_trust_score: scores.behaviour_trust_score,
      variation_risk_score: scores.variation_risk_score,
      recommendation_eligible: eligible,
      rank_position: 0,
      ranking_summary: summary,
      ranking_reasons: reasons,
      ranking_warnings: warnings,
    } as SupplierScoreBreakdown;
  });

  scored.sort((a, b) => b.overall_score - a.overall_score);
  scored.forEach((s, i) => { s.rank_position = i + 1; });

  return scored;
}
