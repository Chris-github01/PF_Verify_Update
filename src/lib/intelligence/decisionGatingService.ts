import { supabase } from '../supabase';
import type {
  SupplierScopeSummary,
  BehaviourProfile,
  DecisionGateResult,
  GateReason,
  GateStatus,
} from './types';
import { GATE_RULES } from './scopeIntelligenceConfig';

function worstStatus(statuses: GateStatus[]): GateStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'pass';
}

function evaluateCoreScopeCoverage(
  coreCoveragePct: number,
): GateReason {
  if (coreCoveragePct < GATE_RULES.FAIL_CORE_COVERAGE_BELOW) {
    return {
      dimension: 'scope_coverage',
      status: 'fail',
      message: `Core scope coverage is critically low at ${coreCoveragePct.toFixed(0)}% (minimum required: ${GATE_RULES.FAIL_CORE_COVERAGE_BELOW}%).`,
      value: coreCoveragePct,
      threshold: GATE_RULES.FAIL_CORE_COVERAGE_BELOW,
    };
  }
  if (coreCoveragePct < GATE_RULES.WARN_CORE_COVERAGE_BELOW) {
    return {
      dimension: 'scope_coverage',
      status: 'warn',
      message: `Core scope coverage is below target at ${coreCoveragePct.toFixed(0)}% (target: ≥${GATE_RULES.WARN_CORE_COVERAGE_BELOW}%). Review before recommending.`,
      value: coreCoveragePct,
      threshold: GATE_RULES.WARN_CORE_COVERAGE_BELOW,
    };
  }
  return {
    dimension: 'scope_coverage',
    status: 'pass',
    message: `Core scope coverage is acceptable at ${coreCoveragePct.toFixed(0)}%.`,
    value: coreCoveragePct,
  };
}

function evaluateExclusionGate(excludedCount: number): GateReason {
  if (excludedCount > GATE_RULES.FAIL_EXCLUDED_COUNT_ABOVE) {
    return {
      dimension: 'exclusions',
      status: 'fail',
      message: `Exclusion count is critically high (${excludedCount} items). Supplier has excluded significant scope — material risk of gaps.`,
      value: excludedCount,
      threshold: GATE_RULES.FAIL_EXCLUDED_COUNT_ABOVE,
    };
  }
  if (excludedCount > GATE_RULES.WARN_EXCLUDED_COUNT_ABOVE) {
    return {
      dimension: 'exclusions',
      status: 'warn',
      message: `${excludedCount} exclusion(s) identified. Confirm these are commercially acceptable before recommending.`,
      value: excludedCount,
      threshold: GATE_RULES.WARN_EXCLUDED_COUNT_ABOVE,
    };
  }
  return {
    dimension: 'exclusions',
    status: 'pass',
    message: `Exclusion count is within acceptable range (${excludedCount}).`,
    value: excludedCount,
  };
}

function evaluateRiskScopeGate(riskCount: number): GateReason {
  if (riskCount > GATE_RULES.FAIL_RISK_COUNT_ABOVE) {
    return {
      dimension: 'risk_scope',
      status: 'fail',
      message: `Risk/assumption item count is critically high (${riskCount}). High probability of post-award variations.`,
      value: riskCount,
      threshold: GATE_RULES.FAIL_RISK_COUNT_ABOVE,
    };
  }
  if (riskCount > GATE_RULES.WARN_RISK_COUNT_ABOVE) {
    return {
      dimension: 'risk_scope',
      status: 'warn',
      message: `${riskCount} risk/provisional/assumption items detected. These carry variation exposure.`,
      value: riskCount,
      threshold: GATE_RULES.WARN_RISK_COUNT_ABOVE,
    };
  }
  return {
    dimension: 'risk_scope',
    status: 'pass',
    message: `Risk scope item count is acceptable (${riskCount}).`,
    value: riskCount,
  };
}

function evaluateUnknownConfidenceGate(
  unknownCount: number,
  scopeConfidence: number,
): GateReason {
  if (
    unknownCount > GATE_RULES.FAIL_UNKNOWN_COUNT_ABOVE &&
    scopeConfidence < GATE_RULES.FAIL_SCOPE_CONFIDENCE_BELOW
  ) {
    return {
      dimension: 'confidence',
      status: 'fail',
      message: `Too many unclassified items (${unknownCount}) combined with low scope confidence (${scopeConfidence}%). Analysis is unreliable.`,
      value: unknownCount,
    };
  }
  if (
    unknownCount > GATE_RULES.WARN_UNKNOWN_COUNT_ABOVE ||
    scopeConfidence < GATE_RULES.WARN_SCOPE_CONFIDENCE_BELOW
  ) {
    return {
      dimension: 'confidence',
      status: 'warn',
      message: `${unknownCount} unclassified items with scope confidence at ${scopeConfidence}%. Results should be treated as indicative.`,
      value: unknownCount,
    };
  }
  return {
    dimension: 'confidence',
    status: 'pass',
    message: `Scope confidence is acceptable (${scopeConfidence}%).`,
    value: scopeConfidence,
  };
}

function evaluateBehaviourRiskGate(
  profile: BehaviourProfile | null,
  currentCoreCoverage: number,
): GateReason {
  if (!profile || profile.totalTendersSeen < 1) {
    return {
      dimension: 'behaviour_risk',
      status: 'pass',
      message: 'No historical behaviour data — cannot assess historical risk pattern.',
    };
  }

  const rating = profile.behaviourRiskRating;

  if (rating === 'red' && currentCoreCoverage < GATE_RULES.WARN_CORE_COVERAGE_BELOW) {
    return {
      dimension: 'behaviour_risk',
      status: 'fail',
      message: `Behaviour risk rating is RED and current tender shows low core coverage. Historically repeated pattern of insufficient scope.`,
      value: rating,
    };
  }

  if (rating === 'red') {
    return {
      dimension: 'behaviour_risk',
      status: 'warn',
      message: `Supplier has a RED historical behaviour rating. Past tenders show repeated commercial concerns.`,
      value: rating,
    };
  }

  if (rating === 'amber') {
    return {
      dimension: 'behaviour_risk',
      status: 'warn',
      message: `Supplier has an AMBER historical behaviour rating. Some past commercial concerns noted.`,
      value: rating,
    };
  }

  return {
    dimension: 'behaviour_risk',
    status: 'pass',
    message: `Historical behaviour risk is GREEN — no significant past concerns.`,
    value: rating,
  };
}

function buildGateSummary(
  gateStatus: GateStatus,
  supplierName: string,
  reasons: GateReason[],
): string {
  if (gateStatus === 'pass') {
    return `${supplierName} passes all commercial validation gates and is eligible for recommendation.`;
  }

  const failReasons = reasons.filter((r) => r.status === 'fail');
  const warnReasons = reasons.filter((r) => r.status === 'warn');

  if (gateStatus === 'fail') {
    return `${supplierName} fails ${failReasons.length} critical gate(s): ${failReasons.map((r) => r.dimension).join(', ')}. Supplier cannot be recommended without explicit override.`;
  }

  return `${supplierName} passes with ${warnReasons.length} warning(s): ${warnReasons.map((r) => r.dimension).join(', ')}. Review recommended before awarding.`;
}

export function evaluateDecisionGate(
  scopeSummary: SupplierScopeSummary,
  behaviourProfile: BehaviourProfile | null,
): DecisionGateResult {
  const reasons: GateReason[] = [];

  reasons.push(evaluateCoreScopeCoverage(scopeSummary.coreScope.coveragePct));
  reasons.push(evaluateExclusionGate(scopeSummary.excludedScopeCount));
  reasons.push(evaluateRiskScopeGate(scopeSummary.riskScopeCount));
  reasons.push(evaluateUnknownConfidenceGate(scopeSummary.unknownScopeCount, scopeSummary.scopeConfidenceScore));
  reasons.push(evaluateBehaviourRiskGate(behaviourProfile, scopeSummary.coreScope.coveragePct));

  const gateStatus = worstStatus(reasons.map((r) => r.status));
  const gateSummary = buildGateSummary(gateStatus, scopeSummary.supplierName, reasons);

  const canBeRecommended = gateStatus !== 'fail';
  const canBeBestTenderer = gateStatus === 'pass';
  const overrideRequired = gateStatus === 'fail';

  return {
    supplierName: scopeSummary.supplierName,
    quoteId: scopeSummary.quoteId,
    projectId: scopeSummary.projectId,
    organisationId: scopeSummary.organisationId,
    gateStatus,
    gateReasons: reasons,
    gateSummary,
    canBeRecommended,
    canBeBestTenderer,
    overrideRequired,
    evaluatedAt: new Date().toISOString(),
  };
}

export async function persistGateResult(result: DecisionGateResult): Promise<void> {
  try {
    const row = {
      organisation_id: result.organisationId,
      project_id: result.projectId,
      quote_id: result.quoteId,
      supplier_name: result.supplierName,
      gate_status: result.gateStatus,
      gate_reasons: result.gateReasons,
      gate_summary: result.gateSummary,
      can_be_recommended: result.canBeRecommended,
      can_be_best_tenderer: result.canBeBestTenderer,
      override_required: result.overrideRequired,
      evaluated_at: result.evaluatedAt,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('ci_decision_gate_results')
      .select('id')
      .eq('project_id', result.projectId)
      .eq('quote_id', result.quoteId)
      .maybeSingle();

    let error;
    if (existing?.id) {
      ({ error } = await supabase
        .from('ci_decision_gate_results')
        .update(row)
        .eq('id', existing.id));
    } else {
      ({ error } = await supabase
        .from('ci_decision_gate_results')
        .insert(row));
    }

    if (error) console.warn('[GatingService] persistGateResult failed:', error.message);
  } catch (err) {
    console.warn('[GatingService] persistGateResult error:', err);
  }
}

export async function fetchGateResult(
  projectId: string,
  quoteId: string,
): Promise<DecisionGateResult | null> {
  try {
    const { data, error } = await supabase
      .from('ci_decision_gate_results')
      .select('*')
      .eq('project_id', projectId)
      .eq('quote_id', quoteId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      supplierName: data.supplier_name,
      quoteId: data.quote_id,
      projectId: data.project_id,
      organisationId: data.organisation_id,
      gateStatus: data.gate_status,
      gateReasons: data.gate_reasons ?? [],
      gateSummary: data.gate_summary,
      canBeRecommended: data.can_be_recommended,
      canBeBestTenderer: data.can_be_best_tenderer,
      overrideRequired: data.override_required,
      evaluatedAt: data.evaluated_at,
    };
  } catch (err) {
    console.warn('[GatingService] fetchGateResult error:', err);
    return null;
  }
}
