/**
 * supplierRanking — produces a ranked list of suppliers using weighted scoring
 * over price, coverage, and confidence.
 */

import type { ComparisonResult, SupplierQuote } from "./compareQuotes.ts";

export type RankingWeights = {
  price: number;        // lower is better
  coverage: number;     // more of the schedule covered is better
  confidence: number;   // per-quote parser confidence
};

export const DEFAULT_WEIGHTS: RankingWeights = {
  price: 0.5,
  coverage: 0.3,
  confidence: 0.2,
};

export type SupplierRank = {
  supplier: string;
  score: number;
  price_score: number;
  coverage_score: number;
  confidence_score: number;
  grand_total: number;
  coverage_pct: number;
};

export function supplierRanking(
  comparison: ComparisonResult,
  quotes: SupplierQuote[],
  confidenceBySupplier: Record<string, number>,
  weights: RankingWeights = DEFAULT_WEIGHTS,
): SupplierRank[] {
  const totalRows = comparison.rows.length;
  const grandTotals = quotes.map((q) => q.grand_total).filter((v) => v > 0);
  const minGrand = grandTotals.length === 0 ? 0 : Math.min(...grandTotals);

  const ranked: SupplierRank[] = quotes.map((q) => {
    const rowsCovered = comparison.rows.filter((r) => r.prices[q.supplier] != null).length;
    const coverage = totalRows === 0 ? 0 : rowsCovered / totalRows;
    const priceScore = q.grand_total > 0 && minGrand > 0 ? minGrand / q.grand_total : 0;
    const confScore = clamp01(confidenceBySupplier[q.supplier] ?? 0.5);

    const score =
      weights.price * priceScore +
      weights.coverage * coverage +
      weights.confidence * confScore;

    return {
      supplier: q.supplier,
      score: round(score),
      price_score: round(priceScore),
      coverage_score: round(coverage),
      confidence_score: round(confScore),
      grand_total: q.grand_total,
      coverage_pct: round(coverage * 100),
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
