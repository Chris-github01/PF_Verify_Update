import { supabase } from '../../supabase';
import type { ScopeIntelligenceResult } from './scopeIntelligenceService';
import type { RateIntelligenceResult } from './rateIntelligenceService';
import type { RevenueLeakageSummary } from './revenueLeakageService';

export type CommercialRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface CommercialRiskFactor {
  factor: string;
  description: string;
  severity: CommercialRiskLevel;
  score: number;
}

export interface CommercialRiskProfile {
  runId: string;
  overallScore: number;
  riskLevel: CommercialRiskLevel;
  factors: CommercialRiskFactor[];
  scopeScore: number;
  rateScore: number;
  leakageScore: number;
  recommendation: string;
  generatedAt: string;
  fromDb?: boolean;
}

// Thresholds: 0-20 low, 21-50 medium, 51-80 high, 81-100 critical
function scoreToLevel(score: number): CommercialRiskLevel {
  if (score >= 81) return 'critical';
  if (score >= 51) return 'high';
  if (score >= 21) return 'medium';
  return 'low';
}

function buildRecommendation(level: CommercialRiskLevel, factors: CommercialRiskFactor[]): string {
  if (level === 'critical') {
    return 'Immediate review required. Multiple high-severity commercial risks detected. Do not proceed without a detailed scope and rate review.';
  }
  if (level === 'high') {
    const topFactor = factors.find((f) => f.severity === 'high' || f.severity === 'critical');
    if (topFactor) {
      return `Significant commercial risk: ${topFactor.description}. Senior review recommended before proceeding.`;
    }
    return 'Significant commercial risks detected. Senior review recommended.';
  }
  if (level === 'medium') {
    return 'Moderate commercial risks detected. Standard review process should capture these issues.';
  }
  return 'Commercial risk profile appears normal. Standard QA procedures apply.';
}

// Nonlinear amplifier: normalises rawScore/cap to [0,1], applies power,
// then re-scales back. exponent > 1 = convex curve (large issues grow faster).
function amplify(rawScore: number, cap: number, exponent: number): number {
  if (rawScore <= 0) return 0;
  const normalized = Math.min(1, rawScore / cap);
  const amplified = Math.pow(normalized, exponent);
  return Math.round(amplified * cap);
}

// Scope pillar
function buildScopeScore(
  scope: ScopeIntelligenceResult,
): { score: number; factors: CommercialRiskFactor[] } {
  const factors: CommercialRiskFactor[] = [];
  let raw = 0;

  const highGaps = scope.gaps.filter((g) => g.risk_level === 'high');
  const medGaps = scope.gaps.filter((g) => g.risk_level === 'medium');

  if (highGaps.length > 0) {
    const base = highGaps.length * 20;
    const s = amplify(base, 80, 1.4);
    raw += s;
    factors.push({
      factor: 'scope_gaps_high',
      description: `${highGaps.length} high-risk scope gap(s) detected`,
      severity: highGaps.length >= 3 ? 'critical' : 'high',
      score: s,
    });
  }

  if (medGaps.length > 0) {
    const base = medGaps.length * 8;
    const s = amplify(base, 48, medGaps.length > 3 ? 1.3 : 1.0);
    raw += s;
    factors.push({
      factor: 'scope_gaps_medium',
      description: `${medGaps.length} medium-risk scope gap(s) detected`,
      severity: medGaps.length >= 4 ? 'high' : 'medium',
      score: s,
    });
  }

  const highExclusions = scope.exclusions.filter((e) => e.risk_level === 'high');
  if (highExclusions.length > 0) {
    const base = highExclusions.length * 18;
    const s = amplify(base, 54, 1.3);
    raw += s;
    factors.push({
      factor: 'high_risk_exclusions',
      description: `${highExclusions.length} high-risk scope exclusion(s) detected`,
      severity: highExclusions.length >= 2 ? 'high' : 'medium',
      score: s,
    });
  }

  const provisionalItems = scope.qualifications.filter((q) => q.impact_type === 'provisional_sum');
  if (provisionalItems.length > 3) {
    const base = (provisionalItems.length - 3) * 6;
    const s = amplify(base, 36, provisionalItems.length > 8 ? 1.5 : 1.0);
    raw += s;
    factors.push({
      factor: 'high_provisional_density',
      description: `${provisionalItems.length} provisional sum items — scope creep risk`,
      severity: provisionalItems.length > 10 ? 'high' : 'medium',
      score: s,
    });
  }

  return { score: Math.min(100, raw), factors };
}

// Rate pillar
function buildRateScore(
  rates: RateIntelligenceResult,
): { score: number; factors: CommercialRiskFactor[] } {
  const factors: CommercialRiskFactor[] = [];
  let raw = 0;

  const priced = rates.records.filter((r) => r.variance_type !== 'no_benchmark');
  const anomalyRate = priced.length > 0 ? (rates.anomalyCount / priced.length) * 100 : 0;

  if (rates.anomalyCount > 0) {
    const base = rates.anomalyCount * 12;
    const s = amplify(base, 72, anomalyRate > 25 ? 1.6 : 1.2);
    raw += s;
    factors.push({
      factor: 'rate_anomalies',
      description: `${rates.anomalyCount} rate anomaly(ies) detected (${anomalyRate.toFixed(0)}% of benchmarked items)`,
      severity: anomalyRate > 30 ? 'critical' : anomalyRate > 15 ? 'high' : 'medium',
      score: s,
    });
  }

  if (rates.underPricedCount > 0) {
    const base = rates.underPricedCount * 7;
    const s = amplify(base, 42, rates.underPricedCount > 5 ? 1.3 : 1.0);
    raw += s;
    factors.push({
      factor: 'under_priced_items',
      description: `${rates.underPricedCount} item(s) priced significantly below market benchmark`,
      severity: rates.underPricedCount >= 5 ? 'high' : 'medium',
      score: s,
    });
  }

  return { score: Math.min(100, raw), factors };
}

// Leakage pillar
function buildLeakageScore(
  leakage: RevenueLeakageSummary,
  parsedValue: number,
): { score: number; factors: CommercialRiskFactor[] } {
  const factors: CommercialRiskFactor[] = [];
  let raw = 0;

  if (leakage.events.length === 0) {
    return { score: 0, factors };
  }

  const totalMismatch = leakage.events.find((e) => e.leakage_type === 'total_mismatch');
  if (totalMismatch) {
    const mismatchAmount = totalMismatch.estimated_value ?? 0;
    const mismatchPercent = parsedValue > 0 ? (mismatchAmount / parsedValue) * 100 : 0;
    const base = Math.round(mismatchPercent * 3);
    const s = amplify(base, 45, mismatchPercent > 5 ? 1.5 : 1.0);
    if (s > 0) {
      raw += s;
      factors.push({
        factor: 'document_total_mismatch',
        description: totalMismatch.description,
        severity: mismatchPercent > 15 ? 'critical' : mismatchPercent > 5 ? 'high' : 'medium',
        score: s,
      });
    }
  }

  const highConfEvents = leakage.events.filter(
    (e) => e.confidence >= 0.75 && e.leakage_type !== 'total_mismatch',
  );
  if (highConfEvents.length > 0) {
    const base = highConfEvents.length * 8;
    const s = amplify(base, 48, highConfEvents.length >= 3 ? 1.4 : 1.0);
    raw += s;
    factors.push({
      factor: 'high_confidence_leakage_events',
      description: `${highConfEvents.length} high-confidence revenue leakage event(s) detected`,
      severity: highConfEvents.length >= 4 ? 'critical' : highConfEvents.length >= 2 ? 'high' : 'medium',
      score: s,
    });
  }

  const lowConfEvents = leakage.events.filter(
    (e) => e.confidence < 0.75 && e.leakage_type !== 'total_mismatch',
  );
  if (lowConfEvents.length > 2) {
    const base = (lowConfEvents.length - 2) * 3;
    const s = amplify(base, 18, 1.0);
    raw += s;
    factors.push({
      factor: 'low_confidence_leakage_signals',
      description: `${lowConfEvents.length} low-confidence leakage signals — warrants monitoring`,
      severity: 'low',
      score: s,
    });
  }

  // Financial amplifier: if total estimated leakage > 5% of parsed value
  if (parsedValue > 0 && leakage.totalEstimatedLeakage > 0) {
    const leakagePct = (leakage.totalEstimatedLeakage / parsedValue) * 100;
    if (leakagePct > 5) {
      const bonus = Math.min(20, Math.round(leakagePct));
      raw += bonus;
      factors.push({
        factor: 'high_financial_leakage',
        description: `Estimated leakage ($${leakage.totalEstimatedLeakage.toFixed(0)}) represents ${leakagePct.toFixed(1)}% of contract value`,
        severity: leakagePct > 15 ? 'high' : 'medium',
        score: bonus,
      });
    }
  }

  return { score: Math.min(100, raw), factors };
}

// Cross-pillar systemic multiplier: simultaneous elevation across pillars
// indicates compounding risk that exceeds the sum of parts.
function applySystemicMultiplier(
  scopeScore: number,
  rateScore: number,
  leakageScore: number,
  baseScore: number,
): number {
  const elevatedPillars = [scopeScore, rateScore, leakageScore].filter((s) => s >= 30).length;
  if (elevatedPillars >= 3) {
    return Math.min(100, Math.round(baseScore * 1.35));
  }
  if (elevatedPillars >= 2) {
    return Math.min(100, Math.round(baseScore * 1.18));
  }
  return baseScore;
}

export function computeCommercialRiskProfile(
  runId: string,
  scope: ScopeIntelligenceResult,
  rates: RateIntelligenceResult,
  leakage: RevenueLeakageSummary,
  parsedValue: number,
): CommercialRiskProfile {
  const { score: scopeScore, factors: scopeFactors } = buildScopeScore(scope);
  const { score: rateScore, factors: rateFactors } = buildRateScore(rates);
  const { score: leakageScore, factors: leakageFactors } = buildLeakageScore(leakage, parsedValue);

  const allFactors = [...scopeFactors, ...rateFactors, ...leakageFactors].sort(
    (a, b) => b.score - a.score,
  );

  const weighted = Math.round(scopeScore * 0.4 + rateScore * 0.35 + leakageScore * 0.25);
  const overallScore = applySystemicMultiplier(
    scopeScore,
    rateScore,
    leakageScore,
    Math.min(100, weighted),
  );

  const riskLevel = scoreToLevel(overallScore);
  const recommendation = buildRecommendation(riskLevel, allFactors);

  return {
    runId,
    overallScore,
    riskLevel,
    factors: allFactors,
    scopeScore,
    rateScore,
    leakageScore,
    recommendation,
    generatedAt: new Date().toISOString(),
  };
}

export async function persistCommercialRiskProfile(
  moduleKey: string,
  profile: CommercialRiskProfile,
): Promise<void> {
  const { error } = await supabase
    .from('commercial_risk_profiles')
    .upsert(
      {
        run_id: profile.runId,
        module_key: moduleKey,
        total_risk_score: profile.overallScore,
        scope_risk_score: profile.scopeScore,
        rate_risk_score: profile.rateScore,
        leakage_risk_score: profile.leakageScore,
        risk_level: profile.riskLevel,
        risk_flags_json: profile.factors,
        recommendation: profile.recommendation,
      },
      { onConflict: 'run_id' },
    );

  if (error) {
    console.warn('[Phase3] persistCommercialRiskProfile failed:', error.message);
    throw error;
  }
}

export async function getCommercialRiskProfile(
  runId: string,
): Promise<CommercialRiskProfile | null> {
  const { data, error } = await supabase
    .from('commercial_risk_profiles')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    runId: data.run_id as string,
    overallScore: data.total_risk_score as number,
    riskLevel: data.risk_level as CommercialRiskLevel,
    factors: (data.risk_flags_json ?? []) as CommercialRiskFactor[],
    scopeScore: data.scope_risk_score as number,
    rateScore: data.rate_risk_score as number,
    leakageScore: data.leakage_risk_score as number,
    recommendation: data.recommendation as string,
    generatedAt: data.created_at as string,
    fromDb: true,
  };
}
