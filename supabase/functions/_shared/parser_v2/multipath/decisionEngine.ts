/**
 * Multi-path Decision Engine.
 *
 * Combines three independent extraction paths and picks the most
 * trustworthy total:
 *
 *   Path A — Line Item extraction (existing LLM extractor, row-sum).
 *   Path B — Labelled commercial totals (regex over specific labels).
 *   Path C — Deterministic currency structure (GST relations, rollups).
 *
 * Rules:
 *   1. Zero extracted rows must NOT imply zero quote value. If A is
 *      empty, B or C can win outright.
 *   2. If A and B agree within tolerance, confidence climbs and A wins
 *      with provenance from B.
 *   3. If A and B disagree materially, whichever has the stronger
 *      evidence score wins; if neither clears the bar, require review.
 *   4. If A fails but B succeeds with a high-confidence labelled total
 *      (grand_total / total_ex_gst / submitted_price), B wins.
 *   5. If A and B both fail, C may win only when a GST relation or
 *      rollup is detected (not just "max currency on the page").
 *   6. Else requires_review = true.
 */

import type { PathBResult, CommercialTotalCandidate } from "./pathB_commercialTotals.ts";
import type { PathCResult } from "./pathC_deterministicStructure.ts";

export type PathAInput = {
  items_count: number;
  row_sum_main: number;
  row_sum_with_optional: number;
  line_math_ok: boolean;
  totals_ok: boolean;
};

export type MultiPathDecision = {
  selected_total: number | null;
  selected_total_inc_gst: number | null;
  winning_path: "A" | "B" | "C" | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  confidence_score: number;
  secondary_candidates: {
    path: "A" | "B" | "C";
    label: string;
    value: number;
    confidence: number;
  }[];
  requires_review: boolean;
  review_reasons: string[];
  agreement: {
    a_b_match: boolean | null;
    a_c_match: boolean | null;
    b_c_match: boolean | null;
  };
  rationale: string;
};

const AGREEMENT_TOLERANCE = 0.02; // 2%

export function decide(ctx: {
  pathA: PathAInput;
  pathB: PathBResult;
  pathC: PathCResult;
}): MultiPathDecision {
  const { pathA, pathB, pathC } = ctx;

  const aTotal = pathA.items_count > 0 ? pathA.row_sum_main : null;
  const bBest = pathB.best;
  const bExTotal = pickBestExGst(pathB);
  const bIncTotal = pickBestIncGst(pathB);
  const cTotal = pathC.best_total;

  const agreement = {
    a_b_match: aTotal != null && bExTotal != null ? approxEqual(aTotal, bExTotal.value, AGREEMENT_TOLERANCE) : null,
    a_c_match: aTotal != null && cTotal != null ? approxEqual(aTotal, cTotal, AGREEMENT_TOLERANCE) : null,
    b_c_match: bExTotal != null && cTotal != null ? approxEqual(bExTotal.value, cTotal, AGREEMENT_TOLERANCE) : null,
  };

  const review_reasons: string[] = [];
  let selected_total: number | null = null;
  let selected_total_inc_gst: number | null = null;
  let winning_path: "A" | "B" | "C" | null = null;
  let confidence_score = 0;
  let rationale = "";

  // Rule 1: A has rows and agrees with B → strongest signal
  if (aTotal != null && bExTotal != null && agreement.a_b_match) {
    selected_total = aTotal;
    selected_total_inc_gst = bIncTotal?.value ?? null;
    winning_path = "A";
    confidence_score = 0.95;
    rationale = "Path A rows reconcile with Path B labelled total";
  }
  // Rule 2: A has rows but no B; rely on row math quality
  else if (aTotal != null && bExTotal == null) {
    selected_total = aTotal;
    winning_path = "A";
    confidence_score = pathA.line_math_ok && pathA.totals_ok ? 0.8 : 0.55;
    rationale = "Path A rows only (no labelled total found)";
    if (!pathA.line_math_ok) review_reasons.push("line_math_mismatch");
  }
  // Rule 3: A rows exist but disagree with B → pick higher confidence
  else if (aTotal != null && bExTotal != null && !agreement.a_b_match) {
    const aScore = (pathA.line_math_ok ? 0.7 : 0.4) + (pathA.totals_ok ? 0.1 : 0);
    if (bExTotal.confidence >= aScore) {
      selected_total = bExTotal.value;
      selected_total_inc_gst = bIncTotal?.value ?? null;
      winning_path = "B";
      confidence_score = bExTotal.confidence * 0.9;
      rationale = `Path B (${bExTotal.label_class}) preferred over mismatched Path A`;
    } else {
      selected_total = aTotal;
      winning_path = "A";
      confidence_score = aScore * 0.8;
      rationale = "Path A preferred over lower-confidence Path B";
    }
    review_reasons.push("path_a_b_disagreement");
  }
  // Rule 4: A empty, B succeeded with labelled total
  else if (aTotal == null && bBest != null) {
    selected_total = bExTotal?.value ?? bBest.value;
    selected_total_inc_gst = bIncTotal?.value ?? null;
    winning_path = "B";
    confidence_score = (bExTotal ?? bBest).confidence * 0.9;
    rationale = `Path B (${(bExTotal ?? bBest).label_class}) — Path A extracted zero rows`;
    if (confidence_score < 0.7) review_reasons.push("path_b_moderate_confidence");
  }
  // Rule 5: A and B empty, C has GST relation or rollup
  else if (aTotal == null && bBest == null && pathC.best_source != null && pathC.best_source !== "max_value") {
    selected_total = cTotal;
    winning_path = "C";
    confidence_score = pathC.confidence * 0.75;
    rationale = `Path C (${pathC.best_source}) — only deterministic structure available`;
    review_reasons.push("path_c_deterministic_only");
  }
  // Rule 6: All paths weak
  else if (pathC.best_total != null) {
    selected_total = pathC.best_total;
    winning_path = "C";
    confidence_score = 0.25;
    rationale = "Path C max-value fallback — no strong signal from any path";
    review_reasons.push("no_strong_signal");
    review_reasons.push("max_value_fallback_only");
  } else {
    rationale = "All three paths failed to identify a quote total";
    review_reasons.push("all_paths_failed");
  }

  const confidence: MultiPathDecision["confidence"] =
    confidence_score >= 0.8 ? "HIGH" : confidence_score >= 0.55 ? "MEDIUM" : "LOW";

  const requires_review = review_reasons.length > 0 || confidence === "LOW" || selected_total == null;

  const secondary_candidates = buildSecondaries({ pathA, pathB, pathC, winning_path });

  return {
    selected_total,
    selected_total_inc_gst,
    winning_path,
    confidence,
    confidence_score,
    secondary_candidates,
    requires_review,
    review_reasons,
    agreement,
    rationale,
  };
}

function approxEqual(a: number, b: number, tol: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
  const ref = Math.max(a, b);
  return Math.abs(a - b) / ref <= tol;
}

function pickBestExGst(pathB: PathBResult): CommercialTotalCandidate | null {
  const exMatches = pathB.candidates.filter(
    (c) => c.label_class === "total_ex_gst" || c.label_class === "grand_total" || c.label_class === "submitted_price" || c.label_class === "contract_value" || c.label_class === "lump_sum",
  );
  if (exMatches.length === 0) return pathB.best;
  return exMatches.sort((a, b) => b.confidence - a.confidence)[0];
}

function pickBestIncGst(pathB: PathBResult): CommercialTotalCandidate | null {
  const incMatches = pathB.candidates.filter((c) => c.label_class === "total_inc_gst");
  if (incMatches.length === 0) return null;
  return incMatches.sort((a, b) => b.confidence - a.confidence)[0];
}

function buildSecondaries(ctx: {
  pathA: PathAInput;
  pathB: PathBResult;
  pathC: PathCResult;
  winning_path: "A" | "B" | "C" | null;
}): MultiPathDecision["secondary_candidates"] {
  const out: MultiPathDecision["secondary_candidates"] = [];
  if (ctx.winning_path !== "A" && ctx.pathA.items_count > 0) {
    out.push({
      path: "A",
      label: "row_sum_main",
      value: ctx.pathA.row_sum_main,
      confidence: ctx.pathA.line_math_ok ? 0.7 : 0.4,
    });
  }
  for (const c of ctx.pathB.candidates.slice(0, 5)) {
    if (ctx.winning_path === "B" && c === ctx.pathB.best) continue;
    out.push({
      path: "B",
      label: `${c.label_class}:${c.label}`,
      value: c.value,
      confidence: c.confidence,
    });
  }
  if (ctx.winning_path !== "C" && ctx.pathC.best_total != null) {
    out.push({
      path: "C",
      label: ctx.pathC.best_source ?? "unknown",
      value: ctx.pathC.best_total,
      confidence: ctx.pathC.confidence,
    });
  }
  return out.slice(0, 8);
}
