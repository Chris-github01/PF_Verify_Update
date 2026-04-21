/**
 * scoreConfidence — evidence-based HIGH/MEDIUM/LOW grader for parser_v2.
 * Mirrors the legacy post-Fix-B rubric: rewards resolved guards, penalises
 * unresolved anomalies.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";
import type { QuoteType } from "../classifiers/classifyQuoteType.ts";

export type ConfidenceScore = {
  level: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  notes: string[];
};

export function scoreConfidence(ctx: {
  items: ParsedLineItemV2[];
  lineMathOk: boolean;
  totalsOk: boolean;
  missingRows: string[];
  quoteType: QuoteType;
}): ConfidenceScore {
  const notes: string[] = [];
  let score = 0;

  if (ctx.items.length > 0) { score += 2; notes.push("items_extracted(+2)"); }
  if (ctx.items.length >= 10) { score += 1; notes.push("row_count>=10(+1)"); }
  if (ctx.lineMathOk) { score += 2; notes.push("line_math_ok(+2)"); }
  else { score -= 2; notes.push("line_math_mismatch(-2)"); }
  if (ctx.totalsOk) { score += 2; notes.push("totals_reconciled(+2)"); }
  else { score -= 3; notes.push("totals_unresolved(-3)"); }
  if (ctx.missingRows.length === 0) { score += 1; notes.push("no_missing_rows(+1)"); }
  else if (ctx.missingRows.length > 5) { score -= 2; notes.push(`missing_rows(${ctx.missingRows.length})(-2)`); }

  const avgRowConfidence =
    ctx.items.length === 0
      ? 0
      : ctx.items.reduce((a, i) => a + i.confidence, 0) / ctx.items.length;
  if (avgRowConfidence >= 0.75) { score += 1; notes.push("avg_row_conf>=0.75(+1)"); }
  if (avgRowConfidence < 0.5) { score -= 1; notes.push("avg_row_conf<0.5(-1)"); }

  if (ctx.quoteType === "lump_sum" && ctx.items.length === 1) {
    score += 1;
    notes.push("lump_sum_single_row(+1)");
  }

  const level: "HIGH" | "MEDIUM" | "LOW" =
    score >= 5 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW";

  return { level, score, notes };
}
