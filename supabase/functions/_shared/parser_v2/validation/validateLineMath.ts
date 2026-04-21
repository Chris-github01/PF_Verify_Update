/**
 * validateLineMath — verifies qty * unit_price ≈ total_price per row.
 * Tolerance is the greater of 1% or $1.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";

export type LineMathResult = {
  ok: boolean;
  checked: number;
  mismatches: number;
  anomalies: string[];
};

export function validateLineMath(items: ParsedLineItemV2[]): LineMathResult {
  let checked = 0;
  let mismatches = 0;
  const anomalies: string[] = [];

  for (const it of items) {
    if (it.quantity == null || it.unit_price == null || it.total_price == null) continue;
    checked++;
    const expected = it.quantity * it.unit_price;
    const tol = Math.max(1, Math.abs(it.total_price) * 0.01);
    if (Math.abs(expected - it.total_price) > tol) {
      mismatches++;
      anomalies.push(
        `line_math_mismatch: "${it.description.slice(0, 40)}" qty*rate=${expected.toFixed(2)} vs total=${it.total_price}`,
      );
    }
  }

  return {
    ok: checked === 0 || mismatches / Math.max(1, checked) < 0.1,
    checked,
    mismatches,
    anomalies: anomalies.slice(0, 20),
  };
}
