/**
 * scopeGapDetector — identifies rows present in some suppliers but missing
 * from others. Critical for award reports: missing scope = risk of variation.
 */

import type { ComparisonResult } from "./compareQuotes.ts";

export type ScopeGap = {
  canonical_description: string;
  quantity: number | null;
  unit: string | null;
  missing_from: string[];
  present_in: string[];
  coverage_ratio: number;
  severity: "high" | "medium" | "low";
};

export function scopeGapDetector(comparison: ComparisonResult): ScopeGap[] {
  const totalSuppliers = comparison.suppliers.length;
  if (totalSuppliers < 2) return [];

  const gaps: ScopeGap[] = [];
  for (const row of comparison.rows) {
    const present = comparison.suppliers.filter((s) => row.prices[s] != null);
    const missing = comparison.suppliers.filter((s) => row.prices[s] == null);
    if (missing.length === 0) continue;

    const coverage = present.length / totalSuppliers;
    const severity: "high" | "medium" | "low" =
      coverage >= 0.75 ? "high" : coverage >= 0.5 ? "medium" : "low";

    gaps.push({
      canonical_description: row.canonical_description,
      quantity: row.quantity,
      unit: row.unit,
      missing_from: missing,
      present_in: present,
      coverage_ratio: coverage,
      severity,
    });
  }

  return gaps.sort((a, b) => b.coverage_ratio - a.coverage_ratio);
}
