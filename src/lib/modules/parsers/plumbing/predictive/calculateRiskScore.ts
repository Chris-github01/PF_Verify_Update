import type {
  QuoteSignature,
  RiskFactor,
  RiskFactorKey,
  RiskScoringResult,
  RiskTier,
  RoutingRecommendation,
} from './riskTypes';

interface FactorSpec {
  key: RiskFactorKey;
  weight: number;
  evaluate: (sig: QuoteSignature) => { score: number; evidence: string; explanation: string } | null;
}

const FACTOR_SPECS: FactorSpec[] = [
  {
    key: 'final_total_phrase_present',
    weight: 8,
    evaluate: (sig) => {
      if (sig.totalPhraseCount === 0) return null;
      const score = Math.min(100, sig.totalPhraseCount * 25);
      return {
        score,
        evidence: `${sig.totalPhraseCount} total phrase(s) detected`,
        explanation: 'Document contains phrases like "Grand Total" or "Contract Sum" — high risk of total row duplication in parsed output.',
      };
    },
  },
  {
    key: 'carried_forward_detected',
    weight: 9,
    evaluate: (sig) => {
      if (sig.carriedForwardPhraseCount === 0) return null;
      return {
        score: Math.min(100, sig.carriedForwardPhraseCount * 40),
        evidence: `${sig.carriedForwardPhraseCount} carried-forward phrase(s)`,
        explanation: 'Carried forward phrases indicate multi-page document structure prone to subtotal inclusion errors.',
      };
    },
  },
  {
    key: 'multiple_total_candidates',
    weight: 10,
    evaluate: (sig) => {
      const candidates = sig.totalPhraseCount + sig.subtotalPhraseCount;
      if (candidates < 2) return null;
      return {
        score: Math.min(100, candidates * 20),
        evidence: `${candidates} total/subtotal candidates found`,
        explanation: 'Multiple summary row candidates increase the risk of misclassification.',
      };
    },
  },
  {
    key: 'amount_only_footer_rows',
    weight: 9,
    evaluate: (sig) => {
      if (sig.amountOnlyRatio < 0.05) return null;
      const score = Math.min(100, sig.amountOnlyRatio * 200);
      return {
        score,
        evidence: `${sig.amountOnlyRowCount} amount-only rows (${(sig.amountOnlyRatio * 100).toFixed(0)}%)`,
        explanation: 'High ratio of amount-only rows indicates poor structure — these are often summary totals that are hard to classify.',
      };
    },
  },
  {
    key: 'high_value_outlier_rows',
    weight: 7,
    evaluate: (sig) => {
      if (sig.highValueOutlierCount === 0) return null;
      return {
        score: Math.min(100, sig.highValueOutlierCount * 30),
        evidence: `${sig.highValueOutlierCount} high-value outlier row(s)`,
        explanation: 'Values significantly larger than typical line items often indicate summary totals that should be excluded.',
      };
    },
  },
  {
    key: 'low_structure_consistency',
    weight: 6,
    evaluate: (sig) => {
      if (sig.formattingIrregularityScore < 20) return null;
      return {
        score: sig.formattingIrregularityScore,
        evidence: `Formatting irregularity score: ${sig.formattingIrregularityScore.toFixed(0)}`,
        explanation: 'Inconsistent row structure (mixed amount-only and structured rows) reduces parser confidence.',
      };
    },
  },
  {
    key: 'repeated_known_bad_pattern',
    weight: 12,
    evaluate: (sig) => {
      if (sig.knownBadPatternMatches.length === 0) return null;
      return {
        score: Math.min(100, sig.knownBadPatternMatches.length * 35),
        evidence: `Matched pattern(s): ${sig.knownBadPatternMatches.slice(0, 3).join(', ')}`,
        explanation: 'This document matches one or more patterns previously associated with parsing failures.',
      };
    },
  },
  {
    key: 'org_has_recent_anomalies',
    weight: 8,
    evaluate: (sig) => {
      if (sig.orgRecentAnomalyCount === 0) return null;
      return {
        score: Math.min(100, sig.orgRecentAnomalyCount * 20),
        evidence: `${sig.orgRecentAnomalyCount} recent anomalies from this org`,
        explanation: 'This organisation has recent parsing anomaly history — similar future documents carry elevated risk.',
      };
    },
  },
  {
    key: 'low_confidence_classification_expected',
    weight: 7,
    evaluate: (sig) => {
      const poorSignals = (sig.amountOnlyRatio > 0.15 ? 1 : 0)
        + (sig.totalPhraseCount > 0 ? 1 : 0)
        + (sig.highValueOutlierCount > 0 ? 1 : 0);
      if (poorSignals < 2) return null;
      return {
        score: Math.min(100, poorSignals * 30),
        evidence: `${poorSignals} confidence-reducing signals`,
        explanation: 'Combination of signals suggests parser will have low confidence classifying key rows.',
      };
    },
  },
  {
    key: 'historical_regression_match',
    weight: 10,
    evaluate: (sig) => {
      if (sig.priorHighRiskCount === 0) return null;
      return {
        score: Math.min(100, sig.priorHighRiskCount * 25),
        evidence: `${sig.priorHighRiskCount} prior high/critical risk assessments for this pattern`,
        explanation: 'Historically similar inputs have been scored high-risk and confirmed as problematic.',
      };
    },
  },
  {
    key: 'high_missing_qty_ratio',
    weight: 5,
    evaluate: (sig) => {
      if (sig.missingQtyRatio < 0.20) return null;
      return {
        score: Math.min(100, sig.missingQtyRatio * 150),
        evidence: `${(sig.missingQtyRatio * 100).toFixed(0)}% of rows missing quantity`,
        explanation: 'Many rows without quantities — difficult to distinguish line items from summary totals.',
      };
    },
  },
  {
    key: 'gst_ambiguity_detected',
    weight: 6,
    evaluate: (sig) => {
      if (sig.gstPhraseCount < 2) return null;
      return {
        score: Math.min(100, sig.gstPhraseCount * 20),
        evidence: `${sig.gstPhraseCount} GST-related phrase(s)`,
        explanation: 'Multiple GST phrases can indicate separate excl/incl GST total rows — a common source of double-counting.',
      };
    },
  },
  {
    key: 'formatting_irregularity',
    weight: 4,
    evaluate: (sig) => {
      if (sig.keywordComplexityScore < 40) return null;
      return {
        score: sig.keywordComplexityScore,
        evidence: `Keyword complexity: ${sig.keywordComplexityScore.toFixed(0)}`,
        explanation: 'High keyword diversity suggests a non-standard document format that may confuse the parser.',
      };
    },
  },
  {
    key: 'low_row_count',
    weight: 3,
    evaluate: (sig) => {
      if (sig.rowCount >= 5) return null;
      return {
        score: 60,
        evidence: `Only ${sig.rowCount} data rows`,
        explanation: 'Very few rows — entire document may be a summary statement rather than a detailed quote.',
      };
    },
  },
  {
    key: 'repeated_high_values',
    weight: 5,
    evaluate: (sig) => {
      if (sig.repeatedHighValueCount < 2) return null;
      return {
        score: Math.min(100, sig.repeatedHighValueCount * 30),
        evidence: `${sig.repeatedHighValueCount} repeated high-value groups`,
        explanation: 'Repeated large values across rows — may indicate total rows presented in multiple formats.',
      };
    },
  },
];

const TOTAL_WEIGHT = FACTOR_SPECS.reduce((sum, f) => sum + f.weight, 0);

function computeWeightedScore(factors: RiskFactor[]): number {
  let weightedSum = 0;
  let appliedWeight = 0;
  for (const f of factors) {
    weightedSum += f.score * f.weight;
    appliedWeight += f.weight;
  }
  if (appliedWeight === 0) return 0;
  const rawScore = (weightedSum / appliedWeight);
  const coverageFactor = appliedWeight / TOTAL_WEIGHT;
  return Math.min(100, rawScore * (0.6 + coverageFactor * 0.4));
}

function deriveTier(score: number): RiskTier {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

function deriveRouting(tier: RiskTier, factors: RiskFactor[]): RoutingRecommendation {
  if (tier === 'critical') return 'manual_review_recommended';
  if (tier === 'high') {
    const hasKnownBad = factors.some((f) => f.key === 'repeated_known_bad_pattern');
    return hasKnownBad ? 'shadow_only_recommended' : 'shadow_compare_recommended';
  }
  if (tier === 'medium') return 'shadow_compare_recommended';
  const hasOrgHistory = factors.some((f) => f.key === 'org_has_recent_anomalies');
  return hasOrgHistory ? 'shadow_compare_recommended' : 'normal_live_path';
}

function buildExplanation(tier: RiskTier, factors: RiskFactor[]): string {
  if (factors.length === 0) return 'No significant risk signals detected.';
  const topFactors = [...factors].sort((a, b) => b.score * b.weight - a.score * a.weight).slice(0, 3);
  const tierDesc = {
    low: 'Low risk',
    medium: 'Medium risk — monitoring recommended',
    high: 'High risk — shadow comparison recommended',
    critical: 'Critical risk — manual review recommended',
  }[tier];
  return `${tierDesc}. Primary signals: ${topFactors.map((f) => f.key.replace(/_/g, ' ')).join(', ')}.`;
}

export function calculateRiskScore(signature: QuoteSignature): RiskScoringResult {
  const activeFactors: RiskFactor[] = [];

  for (const spec of FACTOR_SPECS) {
    const result = spec.evaluate(signature);
    if (result) {
      activeFactors.push({
        key: spec.key,
        weight: spec.weight,
        score: result.score,
        evidence: result.evidence,
        explanation: result.explanation,
      });
    }
  }

  const riskScore = Math.round(computeWeightedScore(activeFactors) * 10) / 10;
  const riskTier = deriveTier(riskScore);
  const routingRecommendation = deriveRouting(riskTier, activeFactors);
  const topFactorKeys = [...activeFactors]
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 5)
    .map((f) => f.key);

  return {
    riskScore,
    riskTier,
    riskFactors: activeFactors,
    routingRecommendation,
    topFactorKeys,
    explanation: buildExplanation(riskTier, activeFactors),
  };
}
