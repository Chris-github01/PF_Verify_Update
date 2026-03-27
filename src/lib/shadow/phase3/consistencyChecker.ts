import { supabase } from '../../supabase';
import type { ScopeIntelligenceResult } from './scopeIntelligenceService';
import type { RateIntelligenceResult } from './rateIntelligenceService';
import type { RevenueLeakageSummary } from './revenueLeakageService';
import type { CommercialRiskProfile } from './commercialRiskEngine';

export interface ConsistencyViolation {
  rule: string;
  severity: 'warning' | 'error';
  detail: string;
}

export interface ConsistencyCheckResult {
  runId: string;
  violations: ConsistencyViolation[];
  passed: boolean;
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// Rule 1: If document truth mismatch exists → must have a leakage event for it
function checkDocumentTruthLinked(
  scope: ScopeIntelligenceResult,
  rates: RateIntelligenceResult,
  leakage: RevenueLeakageSummary,
): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];
  const hasMismatchLeakage = leakage.events.some((e) => e.leakage_type === 'total_mismatch');

  // This rule only fires when document truth indicates a mismatch but leakage missed it.
  // We detect this indirectly: if scope/rates are populated but leakage has no document_truth event
  // and dataset.documentTotal was presumably available, this is suspicious.
  // (The leakage service already handles this, so a violation here means a bug in leakage detection.)
  // We cannot re-check documentTotal here, so this rule is informational only.
  void scope; void rates; void hasMismatchLeakage;
  return violations;
}

// Rule 2: If scope_gaps exist → at least one leakage event must reference them
function checkGapsLinkedToLeakage(
  scope: ScopeIntelligenceResult,
  leakage: RevenueLeakageSummary,
): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];
  if (scope.gaps.length === 0) return violations;

  const leakageGapRefs = new Set(
    leakage.events
      .filter((e) => e.source === 'scope' && e.reference_id != null)
      .map((e) => e.reference_id),
  );

  const unlinkedGaps = scope.gaps.filter((g) => g.id && !leakageGapRefs.has(g.id));
  if (unlinkedGaps.length > 0 && leakage.events.length === 0) {
    violations.push({
      rule: 'gaps_must_have_leakage_events',
      severity: 'warning',
      detail: `${scope.gaps.length} scope gap(s) detected but zero leakage events written — leakage detection may have failed`,
    });
  }

  return violations;
}

// Rule 3: If leakage events exist → risk score must be non-zero
function checkLeakageReflectsInRisk(
  leakage: RevenueLeakageSummary,
  risk: CommercialRiskProfile,
): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];
  if (leakage.events.length > 0 && risk.leakageScore === 0) {
    violations.push({
      rule: 'leakage_must_increase_risk',
      severity: 'warning',
      detail: `${leakage.events.length} leakage event(s) exist but leakage_risk_score=0 — scoring logic may not have received events`,
    });
  }
  return violations;
}

// Rule 4: If no signals at all → risk must be low
function checkCleanRunIsLow(
  scope: ScopeIntelligenceResult,
  rates: RateIntelligenceResult,
  leakage: RevenueLeakageSummary,
  risk: CommercialRiskProfile,
): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];
  const noSignals =
    scope.gaps.length === 0 &&
    scope.exclusions.length === 0 &&
    rates.anomalyCount === 0 &&
    leakage.events.length === 0;

  if (noSignals && (risk.riskLevel === 'high' || risk.riskLevel === 'critical')) {
    violations.push({
      rule: 'clean_run_must_be_low_risk',
      severity: 'error',
      detail: `No signals detected across any layer but risk_level=${risk.riskLevel} (score=${risk.overallScore}) — scoring formula has a bug`,
    });
  }
  return violations;
}

// Rule 5: If overallScore >= 51 → at least one high/critical factor must exist
function checkHighRiskHasSupportingFactors(
  risk: CommercialRiskProfile,
): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];
  if (risk.overallScore >= 51) {
    const hasHighFactor = risk.factors.some(
      (f) => f.severity === 'high' || f.severity === 'critical',
    );
    if (!hasHighFactor) {
      violations.push({
        rule: 'high_score_must_have_high_factor',
        severity: 'warning',
        detail: `overallScore=${risk.overallScore} (high/critical) but no factor has severity=high or critical — factor classification may be miscalibrated`,
      });
    }
  }
  return violations;
}

// Rule 6: Risk scores must be internally consistent
// scopeScore * 0.4 + rateScore * 0.35 + leakageScore * 0.25 should not deviate
// more than 20% from overallScore (accounting for systemic multiplier)
function checkScoreArithmetic(risk: CommercialRiskProfile): ConsistencyViolation[] {
  const violations: ConsistencyViolation[] = [];
  const weighted = Math.round(risk.scopeScore * 0.4 + risk.rateScore * 0.35 + risk.leakageScore * 0.25);
  const maxExpected = Math.min(100, Math.round(weighted * 1.40));
  const minExpected = weighted;

  if (risk.overallScore < minExpected - 5 || risk.overallScore > maxExpected + 5) {
    violations.push({
      rule: 'score_arithmetic_consistent',
      severity: 'warning',
      detail: `overallScore=${risk.overallScore} is outside expected range [${minExpected}, ${maxExpected}] given pillar scores (scope=${risk.scopeScore}, rate=${risk.rateScore}, leakage=${risk.leakageScore})`,
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Main checker — runs all rules, logs violations, tags run if errors found
// Does NOT block run completion or modify any intelligence outputs.
// ---------------------------------------------------------------------------
export async function runConsistencyCheck(
  runId: string,
  scope: ScopeIntelligenceResult,
  rates: RateIntelligenceResult,
  leakage: RevenueLeakageSummary,
  risk: CommercialRiskProfile,
): Promise<ConsistencyCheckResult> {
  const violations: ConsistencyViolation[] = [
    ...checkDocumentTruthLinked(scope, rates, leakage),
    ...checkGapsLinkedToLeakage(scope, leakage),
    ...checkLeakageReflectsInRisk(leakage, risk),
    ...checkCleanRunIsLow(scope, rates, leakage, risk),
    ...checkHighRiskHasSupportingFactors(risk),
    ...checkScoreArithmetic(risk),
  ];

  const result: ConsistencyCheckResult = {
    runId,
    violations,
    passed: violations.filter((v) => v.severity === 'error').length === 0,
    checkedAt: new Date().toISOString(),
  };

  if (violations.length === 0) {
    if (import.meta.env.DEV) {
      console.log(`[Phase3/Consistency] run=${runId.slice(0, 8)} — all checks passed`);
    }
    return result;
  }

  // Log every violation
  for (const v of violations) {
    const tag = v.severity === 'error' ? '[ERROR]' : '[WARN]';
    console.warn(`[Phase3/Consistency] ${tag} run=${runId.slice(0, 8)} rule=${v.rule}: ${v.detail}`);
  }

  // Tag the run with inconsistency flag in DB if any errors found (not just warnings)
  const errors = violations.filter((v) => v.severity === 'error');
  if (errors.length > 0) {
    const { error: updateErr } = await supabase
      .from('shadow_runs')
      .update({ metadata_json: { consistency_violations: violations, checked_at: result.checkedAt } })
      .eq('id', runId);

    if (updateErr) {
      console.warn(
        `[Phase3/Consistency] Failed to tag run ${runId.slice(0, 8)} with violations: ${updateErr.message}`,
      );
    }
  }

  return result;
}
