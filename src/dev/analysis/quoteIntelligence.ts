console.log('[VERIFYTRADE NEXT] Quote Intelligence module loaded');

export interface QuoteData {
  total: number;
  average: number;
  hasBreakdown: boolean;
  hasExclusions: boolean;
  hasQualifications: boolean;
  hasAssumptions?: boolean;
  hasClarifications?: boolean;
  hasSystemDetail?: boolean;
  hasScopeBreakdown?: boolean;
  tradeCount?: number;
  lineItemCount?: number;
  [key: string]: unknown;
}

export type IntelligenceResult = {
  weaknesses: string[];
  risks: string[];
  pricingInsights: string[];
  coverageIssues: string[];
  recommendations: string[];
  overallScore: number;
};

function pricingInsights(data: QuoteData): string[] {
  const insights: string[] = [];
  const variancePct = ((data.total - data.average) / data.average) * 100;

  if (data.total > data.average) {
    insights.push(
      `Quote is ${Math.abs(Math.round(variancePct))}% above market average — may lose on price without strong justification.`
    );
    if (variancePct > 20) {
      insights.push('Significant premium: ensure value proposition is clearly articulated to defend the price.');
    }
  } else if (data.total < data.average) {
    insights.push(
      `Quote is ${Math.abs(Math.round(variancePct))}% below market average — risk of under-scoping or margin squeeze.`
    );
    if (variancePct < -20) {
      insights.push('Heavily underpriced: verify scope is complete and there are no missing allowances.');
    }
  } else {
    insights.push('Quote aligns closely with market average.');
  }

  if (data.lineItemCount !== undefined && data.lineItemCount < 5) {
    insights.push('Very few line items detected — lump-sum pricing may reduce client confidence.');
  }

  return insights;
}

function coverageIssues(data: QuoteData): string[] {
  const issues: string[] = [];

  if (!data.hasBreakdown || data.hasScopeBreakdown === false) {
    issues.push('Missing detailed scope breakdown — client cannot verify what is included.');
  }
  if (!data.hasExclusions) {
    issues.push('No exclusions listed — ambiguity creates variation risk post-award.');
  }
  if (!data.hasAssumptions) {
    issues.push('Assumptions not clearly defined — may lead to disputes during delivery.');
  }
  if (data.tradeCount !== undefined && data.tradeCount === 1) {
    issues.push('Single-trade coverage only — confirm no cross-trade dependencies are overlooked.');
  }

  return issues;
}

function detectRisks(data: QuoteData): string[] {
  const risks: string[] = [];

  if (!data.hasQualifications) {
    risks.push('High risk: no qualifications provided — client has no commercial protection against scope creep.');
  }
  if (!data.hasClarifications) {
    risks.push('Missing clarifications — unresolved queries may stall the award process.');
  }
  if (!data.hasSystemDetail) {
    risks.push('Unclear system specification — potential compliance risk if design intent is not locked in.');
  }
  if (!data.hasExclusions && !data.hasQualifications) {
    risks.push('No commercial safeguards in place — quote is fully open-ended.');
  }

  return risks;
}

function detectWeaknesses(data: QuoteData): string[] {
  const weaknesses: string[] = [];

  if (!data.hasBreakdown && !data.hasScopeBreakdown) {
    weaknesses.push('Lack of commercial clarity — evaluators cannot assess value for money.');
  }
  if (!data.hasSystemDetail) {
    weaknesses.push('Insufficient technical detail — weakens confidence in delivery capability.');
  }
  if (data.lineItemCount !== undefined && data.lineItemCount < 3) {
    weaknesses.push('Quote lacks granularity — difficult to evaluate against competing bids.');
  }
  if (!data.hasQualifications && !data.hasClarifications) {
    weaknesses.push('No response to tender queries — suggests limited engagement with scope.');
  }

  return weaknesses;
}

function buildRecommendations(data: QuoteData): string[] {
  const recs: string[] = [];

  if (!data.hasBreakdown) recs.push('Add a detailed scope breakdown to increase evaluator confidence.');
  if (!data.hasExclusions) recs.push('Include explicit exclusions to protect against scope creep.');
  if (!data.hasSystemDetail) recs.push('Clarify system specifications and design intent.');
  if (!data.hasQualifications) recs.push('Add commercial qualifications to reduce open-ended risk.');
  if (!data.hasAssumptions) recs.push('State all key assumptions clearly within the submission.');
  if (!data.hasClarifications) recs.push('Address outstanding tender queries with written clarifications.');
  if (data.total > data.average) recs.push('Justify the price premium with a value statement or methodology note.');
  if (data.total < data.average) recs.push('Audit scope completeness — ensure no allowances are missing at this price point.');

  if (recs.length === 0) {
    recs.push('Quote appears complete — consider a commercial summary page to strengthen the submission.');
  }

  return recs;
}

function scoreIntelligence(result: Omit<IntelligenceResult, 'overallScore'>): number {
  const totalIssues =
    result.weaknesses.length +
    result.risks.length +
    result.coverageIssues.length;

  const score = Math.max(0, 100 - totalIssues * 12);
  return score;
}

export function analyzeQuoteIntelligence(quoteData: QuoteData): IntelligenceResult {
  console.log('[VERIFYTRADE NEXT] Running Quote Intelligence Analysis');

  const pricingResults = pricingInsights(quoteData);
  const coverageResults = coverageIssues(quoteData);
  const riskResults = detectRisks(quoteData);
  const weaknessResults = detectWeaknesses(quoteData);
  const recommendationResults = buildRecommendations(quoteData);

  const partial = {
    weaknesses: weaknessResults,
    risks: riskResults,
    pricingInsights: pricingResults,
    coverageIssues: coverageResults,
    recommendations: recommendationResults,
  };

  const overallScore = scoreIntelligence(partial);

  console.log('[VERIFYTRADE NEXT] Quote Intelligence Analysis complete — score:', overallScore);

  return { ...partial, overallScore };
}
