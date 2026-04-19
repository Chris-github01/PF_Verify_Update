/**
 * Confidence Aggregation Engine
 *
 * Combines per-facet confidences (total, scope, item) into a unified structure,
 * and exposes the threshold used to trigger LLM fallback.
 */

export const LLM_FALLBACK_THRESHOLD = 0.75;

export interface ConfidenceReport {
  total_confidence: number;
  scope_confidence: number;
  item_confidence: number;
  overall_confidence: number;
  parser_used: string;
  warnings: string[];
  requires_llm_fallback: boolean;
}

export interface ItemLike {
  confidence?: number | null;
  qty?: number | null;
  rate?: number | null;
  total?: number | null;
}

export function computeItemConfidence(items: ItemLike[]): number {
  if (items.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (const item of items) {
    let base = typeof item.confidence === "number" ? item.confidence : 0.75;
    if (item.qty !== null && item.qty !== undefined && item.rate !== null && item.rate !== undefined && item.total !== null && item.total !== undefined && item.total > 0) {
      const expected = (item.qty as number) * (item.rate as number);
      const diff = Math.abs(expected - (item.total as number));
      const tol = Math.max((item.total as number) * 0.02, 0.5);
      if (diff <= tol) base = Math.max(base, 0.90);
      else base = Math.min(base, 0.60);
    }
    sum += base;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

export function buildConfidenceReport(args: {
  total_confidence: number;
  scope_confidence: number;
  item_confidence: number;
  parser_used: string;
  warnings: string[];
}): ConfidenceReport {
  const { total_confidence, scope_confidence, item_confidence, parser_used, warnings } = args;
  const overall_confidence =
    0.4 * item_confidence + 0.35 * total_confidence + 0.25 * scope_confidence;
  return {
    total_confidence,
    scope_confidence,
    item_confidence,
    overall_confidence,
    parser_used,
    warnings,
    requires_llm_fallback: overall_confidence < LLM_FALLBACK_THRESHOLD,
  };
}
