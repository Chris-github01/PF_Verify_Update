import type { SupplierAward } from '../../types/award.types';
import type { SystemCoverageSummary } from './systemCoverageAnalyzer';
import type { VarianceSummary } from './varianceAnalyzer';
import type { CommercialInsights } from './commercialInsights';

export interface ExecutiveRecommendation {
  recommendedSupplier: string;
  keyReasons: string[];
  coverageAnalysis: string;
  riskAnalysis: string;
  costAnalysis: string;
  varianceAnalysis: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  alternatives: string[];
}

export function generateExecutiveRecommendation(
  suppliers: SupplierAward[],
  coverageSummary: SystemCoverageSummary,
  varianceSummary: VarianceSummary,
  commercialInsights: CommercialInsights
): ExecutiveRecommendation {
  if (suppliers.length === 0) {
    return {
      recommendedSupplier: 'None',
      keyReasons: ['No suppliers available'],
      coverageAnalysis: 'No coverage data',
      riskAnalysis: 'No risk data',
      costAnalysis: 'No cost data',
      varianceAnalysis: 'No variance data',
      confidence: 'LOW',
      alternatives: []
    };
  }

  const sortedByScore = [...suppliers].sort((a, b) => {
    const scoreA = (a.coveragePercent * 0.4) - (a.riskScore * 0.3) + (100 - (commercialInsights.percentageDifferences[a.supplierName] || 0)) * 0.3;
    const scoreB = (b.coveragePercent * 0.4) - (b.riskScore * 0.3) + (100 - (commercialInsights.percentageDifferences[b.supplierName] || 0)) * 0.3;
    return scoreB - scoreA;
  });

  const recommended = sortedByScore[0];
  const keyReasons: string[] = [];

  const avgCoverage = coverageSummary.averageCoverage[recommended.supplierName] || 0;
  if (avgCoverage >= 90) {
    keyReasons.push('Best system coverage at ' + avgCoverage.toFixed(1) + '%');
  } else if (avgCoverage === Math.max(...Object.values(coverageSummary.averageCoverage))) {
    keyReasons.push('Highest coverage among all suppliers');
  }

  if (recommended.riskScore === Math.min(...suppliers.map(s => s.riskScore))) {
    keyReasons.push('Lowest risk score');
  }

  const avgVariance = varianceSummary.averageVariance[recommended.supplierName] || 0;
  if (avgVariance <= 10) {
    keyReasons.push('Excellent alignment with model rates (±' + avgVariance.toFixed(1) + '%)');
  } else if (avgVariance === Math.min(...Object.values(varianceSummary.averageVariance))) {
    keyReasons.push('Best model rate alignment');
  }

  if (commercialInsights.lowestTotal?.supplierName === recommended.supplierName) {
    keyReasons.push('Most competitive total price');
  }

  const greenCount = varianceSummary.levelCounts[recommended.supplierName]?.GREEN || 0;
  const totalItems = varianceSummary.rows.length;
  if (greenCount / totalItems > 0.7) {
    keyReasons.push('Majority of items within acceptable price variance');
  }

  if (keyReasons.length === 0) {
    keyReasons.push('Best overall balance of coverage, risk, and price');
  }

  const coverageAnalysis = `${recommended.supplierName} provides ${avgCoverage.toFixed(1)}% average system coverage across ${coverageSummary.totalSystems} systems, with ${recommended.itemsQuoted} of ${recommended.totalItems} items quoted.`;

  const riskAnalysis = `Risk score of ${recommended.riskScore.toFixed(1)} based on ${recommended.riskFactors.redCells} critical items, ${recommended.riskFactors.amberCells} moderate concerns, and ${recommended.riskFactors.missingScope} scope gaps.`;

  const costDiff = commercialInsights.percentageDifferences[recommended.supplierName] || 0;
  const costAnalysis = commercialInsights.lowestTotal?.supplierName === recommended.supplierName
    ? `Most competitive pricing at $${recommended.adjustedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `Pricing is ${Math.abs(costDiff).toFixed(1)}% ${costDiff > 0 ? 'higher' : 'lower'} than lowest bid at $${recommended.adjustedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const greenPct = ((greenCount / totalItems) * 100).toFixed(0);
  const varianceAnalysis = `${greenPct}% of items within acceptable variance (±10%), average deviation of ${avgVariance.toFixed(1)}% from model rates.`;

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  if (avgCoverage >= 90 && recommended.riskScore < 30 && avgVariance <= 15) {
    confidence = 'HIGH';
  } else if (avgCoverage < 70 || recommended.riskScore > 60 || avgVariance > 25) {
    confidence = 'LOW';
  }

  const alternatives: string[] = [];
  if (sortedByScore.length > 1) {
    const alt = sortedByScore[1];
    alternatives.push(`${alt.supplierName}: Alternative option with ${alt.coveragePercent.toFixed(0)}% coverage and ${alt.riskScore.toFixed(0)} risk score`);
  }

  return {
    recommendedSupplier: recommended.supplierName,
    keyReasons,
    coverageAnalysis,
    riskAnalysis,
    costAnalysis,
    varianceAnalysis,
    confidence,
    alternatives
  };
}
