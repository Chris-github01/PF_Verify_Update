import type { SupplierAdjustment } from './supplierAdjustmentEngine';
import type { MatchedLineGroup } from './lineMatcher';
import type { ReferenceQuantityResult } from './referenceQuantityEngine';

export interface ScoredSupplier extends SupplierAdjustment {
  completenessScore: number;
  competitivenessScoreRaw: number;
  competitivenessScoreNormalized: number;
  rawRank: number;
  normalizedRank: number;
}

export interface QuantityIntelligenceResult {
  comparisonName: string;
  suppliers: ScoredSupplier[];
  matchedGroups: MatchedLineGroup[];
  referenceResults: Map<string, ReferenceQuantityResult>;
  totalMatchedLines: number;
  linesWithMajorVariance: number;
  linesWithReviewFlag: number;
  hasUnderallowanceRisk: boolean;
}

function computeCompletenessScore(adj: SupplierAdjustment, totalPossibleLines: number): number {
  if (totalPossibleLines === 0) return 100;

  let score = 100;

  const matchRatio = adj.matchedLinesCount / totalPossibleLines;
  if (matchRatio < 1) {
    score -= (1 - matchRatio) * 30;
  }

  const underallowedRatio =
    adj.matchedLinesCount > 0 ? adj.underallowedLinesCount / adj.matchedLinesCount : 0;
  score -= underallowedRatio * 40;

  if (adj.quantityGapValue > 0) {
    const gapRatio = adj.rawTotal > 0 ? adj.quantityGapValue / adj.rawTotal : 0;
    score -= Math.min(gapRatio * 50, 25);
  }

  if (adj.underallowedLinesCount >= 5) score -= 10;
  if (adj.underallowanceFlag) score -= 5;

  return Math.max(0, Math.min(100, parseFloat(score.toFixed(2))));
}

function rank<T>(items: T[], key: (x: T) => number, ascending = true): number[] {
  const values = items.map(key);
  const sorted = [...values].sort((a, b) => ascending ? a - b : b - a);
  return values.map((v) => sorted.indexOf(v) + 1);
}

function competitivenessFromRank(rankVal: number, total: number): number {
  if (total <= 1) return 100;
  return parseFloat((((total - rankVal) / (total - 1)) * 100).toFixed(2));
}

export function scoreSuppliers(
  adjustments: SupplierAdjustment[],
  matchedGroups: MatchedLineGroup[],
  referenceResults: Map<string, ReferenceQuantityResult>,
): ScoredSupplier[] {
  if (adjustments.length === 0) return [];

  const totalPossibleLines = matchedGroups.length;

  const linesWithMajorVariance = [...referenceResults.values()].filter(
    (r) => (r.quantitySpreadPercent ?? 0) >= 30,
  ).length;

  const withCompleteness = adjustments.map((adj) => ({
    ...adj,
    completenessScore: computeCompletenessScore(adj, totalPossibleLines),
    linesWithMajorVariance,
  }));

  const rawRanks = rank(withCompleteness, (x) => x.rawTotal, true);
  const normRanks = rank(withCompleteness, (x) => x.normalizedTotal, true);
  const total = withCompleteness.length;

  return withCompleteness.map((adj, i) => ({
    ...adj,
    rawRank: rawRanks[i],
    normalizedRank: normRanks[i],
    competitivenessScoreRaw: competitivenessFromRank(rawRanks[i], total),
    competitivenessScoreNormalized: competitivenessFromRank(normRanks[i], total),
  }));
}

export function buildQuantityIntelligenceResult(
  comparisonName: string,
  scored: ScoredSupplier[],
  matchedGroups: MatchedLineGroup[],
  referenceResults: Map<string, ReferenceQuantityResult>,
): QuantityIntelligenceResult {
  const refs = [...referenceResults.values()];
  const linesWithMajorVariance = refs.filter((r) => (r.quantitySpreadPercent ?? 0) >= 30).length;
  const linesWithReviewFlag = refs.filter(
    (r) => (r.quantitySpreadPercent ?? 0) >= 15 && (r.quantitySpreadPercent ?? 0) < 30,
  ).length;
  const hasUnderallowanceRisk = scored.some((s) => s.underallowanceFlag);

  return {
    comparisonName,
    suppliers: scored,
    matchedGroups,
    referenceResults,
    totalMatchedLines: matchedGroups.length,
    linesWithMajorVariance,
    linesWithReviewFlag,
    hasUnderallowanceRisk,
  };
}
