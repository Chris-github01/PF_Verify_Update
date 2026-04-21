/**
 * riskScorer — converts comparison output into a per-supplier risk profile
 * spanning price, coverage, variance, and confidence dimensions.
 */

import type { ComparisonResult, SupplierQuote } from "./compareQuotes.ts";
import type { ScopeGap } from "./scopeGapDetector.ts";

export type SupplierRisk = {
  supplier: string;
  risk_level: "low" | "medium" | "high" | "critical";
  score: number;
  drivers: string[];
  scope_gaps_high: number;
  rate_outlier_count: number;
  confidence: number;
};

export function riskScorer(
  comparison: ComparisonResult,
  quotes: SupplierQuote[],
  gaps: ScopeGap[],
  confidenceBySupplier: Record<string, number>,
): SupplierRisk[] {
  return quotes.map((q) => {
    const drivers: string[] = [];
    let score = 0;

    const highGaps = gaps.filter((g) => g.severity === "high" && g.missing_from.includes(q.supplier)).length;
    if (highGaps > 0) {
      score += highGaps * 2;
      drivers.push(`${highGaps}_critical_scope_gaps`);
    }

    let outliers = 0;
    for (const row of comparison.rows) {
      const myRate = row.prices[q.supplier];
      if (myRate == null || row.median_rate == null || row.median_rate === 0) continue;
      const deviation = Math.abs(myRate - row.median_rate) / row.median_rate;
      if (deviation > 0.4) outliers++;
    }
    if (outliers > 0) {
      score += outliers;
      drivers.push(`${outliers}_rate_outliers`);
    }

    const confidence = confidenceBySupplier[q.supplier] ?? 0.5;
    if (confidence < 0.5) {
      score += 3;
      drivers.push("low_parser_confidence");
    } else if (confidence < 0.7) {
      score += 1;
      drivers.push("medium_parser_confidence");
    }

    const risk_level: SupplierRisk["risk_level"] =
      score >= 8 ? "critical" : score >= 5 ? "high" : score >= 2 ? "medium" : "low";

    return {
      supplier: q.supplier,
      risk_level,
      score,
      drivers,
      scope_gaps_high: highGaps,
      rate_outlier_count: outliers,
      confidence,
    };
  });
}
