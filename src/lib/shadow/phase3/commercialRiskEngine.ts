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
}

function scoreToLevel(score: number): CommercialRiskLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
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

export function computeCommercialRiskProfile(
  runId: string,
  scope: ScopeIntelligenceResult,
  rates: RateIntelligenceResult,
  leakage: RevenueLeakageSummary,
  parsedValue: number,
): CommercialRiskProfile {
  const factors: CommercialRiskFactor[] = [];
  let scopeScore = 0;
  let rateScore = 0;
  let leakageScore = 0;

  const highRiskGaps = scope.gaps.filter((g) => g.risk_level === 'high');
  const mediumRiskGaps = scope.gaps.filter((g) => g.risk_level === 'medium');
  if (highRiskGaps.length > 0) {
    const s = Math.min(40, highRiskGaps.length * 15);
    scopeScore += s;
    factors.push({
      factor: 'scope_gaps_high',
      description: `${highRiskGaps.length} high-risk scope gap(s) detected`,
      severity: highRiskGaps.length >= 3 ? 'critical' : 'high',
      score: s,
    });
  }
  if (mediumRiskGaps.length > 2) {
    const s = Math.min(20, mediumRiskGaps.length * 5);
    scopeScore += s;
    factors.push({
      factor: 'scope_gaps_medium',
      description: `${mediumRiskGaps.length} medium-risk scope gap(s) detected`,
      severity: 'medium',
      score: s,
    });
  }

  const highRiskExclusions = scope.exclusions.filter((e) => e.risk_level === 'high');
  if (highRiskExclusions.length > 0) {
    const s = Math.min(30, highRiskExclusions.length * 12);
    scopeScore += s;
    factors.push({
      factor: 'high_risk_exclusions',
      description: `${highRiskExclusions.length} high-risk scope exclusion(s) detected`,
      severity: highRiskExclusions.length >= 2 ? 'high' : 'medium',
      score: s,
    });
  }

  const provisionalItems = scope.qualifications.filter((q) => q.impact_type === 'provisional_sum');
  if (provisionalItems.length > 5) {
    const s = Math.min(20, provisionalItems.length * 3);
    scopeScore += s;
    factors.push({
      factor: 'high_provisional_density',
      description: `${provisionalItems.length} provisional sum items — scope creep risk`,
      severity: 'medium',
      score: s,
    });
  }

  const anomalyRate = rates.records.length > 0
    ? (rates.anomalyCount / rates.records.length) * 100
    : 0;

  if (rates.anomalyCount > 0) {
    const s = Math.min(40, rates.anomalyCount * 8);
    rateScore += s;
    factors.push({
      factor: 'rate_anomalies',
      description: `${rates.anomalyCount} rate anomaly(ies) detected (${anomalyRate.toFixed(0)}% of priced items)`,
      severity: anomalyRate > 20 ? 'critical' : anomalyRate > 10 ? 'high' : 'medium',
      score: s,
    });
  }

  if (rates.underPricedCount > 3) {
    const s = Math.min(20, rates.underPricedCount * 4);
    rateScore += s;
    factors.push({
      factor: 'under_priced_items',
      description: `${rates.underPricedCount} items priced significantly below market benchmark`,
      severity: 'medium',
      score: s,
    });
  }

  if (leakage.events.length > 0) {
    const totalMismatch = leakage.events.find((e) => e.leakage_type === 'total_mismatch');
    if (totalMismatch) {
      const mismatchPercent =
        parsedValue > 0 ? ((totalMismatch.estimated_value ?? 0) / parsedValue) * 100 : 0;
      const s = Math.min(30, mismatchPercent * 2);
      leakageScore += s;
      factors.push({
        factor: 'document_total_mismatch',
        description: totalMismatch.description,
        severity: mismatchPercent > 10 ? 'high' : 'medium',
        score: s,
      });
    }

    const highConfEvents = leakage.events.filter(
      (e) => e.confidence >= 0.75 && e.leakage_type !== 'total_mismatch',
    );
    if (highConfEvents.length > 0) {
      const s = Math.min(20, highConfEvents.length * 5);
      leakageScore += s;
      factors.push({
        factor: 'high_confidence_leakage_events',
        description: `${highConfEvents.length} high-confidence revenue leakage event(s) detected`,
        severity: highConfEvents.length >= 3 ? 'high' : 'medium',
        score: s,
      });
    }
  }

  const overallScore = Math.min(
    100,
    Math.round((scopeScore * 0.4) + (rateScore * 0.35) + (leakageScore * 0.25)),
  );

  const riskLevel = scoreToLevel(overallScore);
  const recommendation = buildRecommendation(riskLevel, factors);

  return {
    runId,
    overallScore,
    riskLevel,
    factors: factors.sort((a, b) => b.score - a.score),
    scopeScore: Math.min(100, scopeScore),
    rateScore: Math.min(100, rateScore),
    leakageScore: Math.min(100, leakageScore),
    recommendation,
    generatedAt: new Date().toISOString(),
  };
}
