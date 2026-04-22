/**
 * validatePassiveFireParse — deterministic audit gate.
 *
 * Consumes sanitizer + structure + authoritative total + items and produces a
 * single normalized validation verdict: confidence, review_status, root_cause,
 * red_flags/warnings/validation_checks. No LLM. Safe defaults.
 */

import type { PassiveFireStructure } from "../classifiers/classifyPassiveFireStructure.ts";
import type { PassiveFireAuthoritativeTotal } from "../classifiers/selectPassiveFireAuthoritativeTotal.ts";
import type { PassiveFireSanitizerResult } from "../classifiers/sanitizePassiveFireText.ts";
import type { ParsedLineItemV2 } from "../runParserV2.ts";

export type PassiveFireReviewStatus =
  | "auto_trust"
  | "trusted_with_monitoring"
  | "manual_review_recommended"
  | "manual_review_required";

export type PassiveFireRootCause =
  | "clean_parse"
  | "low_confidence"
  | "missing_total"
  | "total_mismatch"
  | "selector_flagged_review"
  | "noise_contaminated"
  | "no_items_extracted"
  | "mixed_issue";

export type PassiveFireValidationResult = {
  confidence: number;
  requires_review: boolean;
  review_status: PassiveFireReviewStatus;
  root_cause: PassiveFireRootCause;
  recommended_action: string | null;
  red_flags: string[];
  warnings: string[];
  validation_checks: Record<string, boolean | number | string | null>;
};

export type PassiveFireValidationInput = {
  structure: PassiveFireStructure | null;
  authoritative: PassiveFireAuthoritativeTotal | null;
  sanitizer: PassiveFireSanitizerResult | null;
  items: ParsedLineItemV2[];
  supplier: string | null;
  openAIKey: string;
};

export async function validatePassiveFireParse(
  input: PassiveFireValidationInput,
): Promise<PassiveFireValidationResult> {
  const red_flags: string[] = [];
  const warnings: string[] = [];
  const checks: Record<string, boolean | number | string | null> = {};

  const items = input.items ?? [];
  checks.item_count = items.length;

  const selected = (input.authoritative as unknown as {
    selected_total_ex_gst?: number | null;
  })?.selected_total_ex_gst ?? null;
  checks.authoritative_total_ex_gst = selected;

  if (items.length === 0) red_flags.push("no_items_extracted");
  if (selected == null) red_flags.push("missing_authoritative_total");

  const rowSum = items
    .filter((i) => i.scope_category === "main")
    .reduce((s, i) => s + (Number(i.total_price) || 0), 0);
  checks.row_sum_main = Math.round(rowSum * 100) / 100;

  let totalsOk = true;
  if (selected != null && rowSum > 0) {
    const diffRatio = Math.abs(selected - rowSum) / selected;
    checks.total_vs_rowsum_ratio = Math.round(diffRatio * 1000) / 1000;
    if (diffRatio > 0.15) {
      warnings.push(`total_row_sum_mismatch:${(diffRatio * 100).toFixed(1)}%`);
      totalsOk = false;
    }
  }
  checks.totals_ok = totalsOk;

  const authRequiresReview = Boolean(
    (input.authoritative as unknown as { requires_review?: boolean })
      ?.requires_review,
  );
  if (authRequiresReview) red_flags.push("selector_flagged_review");

  const sanitizerNoise =
    (input.sanitizer as unknown as { noise_tokens_removed?: number })
      ?.noise_tokens_removed ?? 0;
  checks.sanitizer_noise_tokens = sanitizerNoise;

  const authConfidence = Number(
    (input.authoritative as unknown as { confidence?: number })?.confidence ?? 0,
  );

  let confidence = 0.5;
  if (items.length > 0 && selected != null) confidence = 0.8;
  if (items.length > 0 && selected != null && totalsOk) confidence = 0.88;
  if (items.length > 0 && selected != null && totalsOk && !authRequiresReview) {
    confidence = Math.max(0.9, authConfidence || 0.9);
  }
  if (items.length === 0) confidence = 0.2;
  if (selected == null) confidence = Math.min(confidence, 0.6);
  if (authRequiresReview) confidence = Math.min(confidence, 0.7);
  confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

  const requires_review =
    confidence < 0.75 ||
    items.length === 0 ||
    selected == null ||
    authRequiresReview ||
    !totalsOk;

  let root_cause: PassiveFireRootCause = "clean_parse";
  if (items.length === 0) root_cause = "no_items_extracted";
  else if (selected == null) root_cause = "missing_total";
  else if (!totalsOk) root_cause = "total_mismatch";
  else if (authRequiresReview) root_cause = "selector_flagged_review";
  else if (confidence < 0.75) root_cause = "low_confidence";
  else if (red_flags.length > 0 || warnings.length > 0) root_cause = "mixed_issue";

  let review_status: PassiveFireReviewStatus;
  if (requires_review && confidence < 0.55) review_status = "manual_review_required";
  else if (requires_review) review_status = "manual_review_recommended";
  else if (confidence >= 0.9) review_status = "auto_trust";
  else if (confidence >= 0.75) review_status = "trusted_with_monitoring";
  else if (confidence >= 0.55) review_status = "manual_review_recommended";
  else review_status = "manual_review_required";

  const recommended_action =
    review_status === "auto_trust"
      ? "proceed"
      : review_status === "trusted_with_monitoring"
        ? "monitor"
        : "manual_review";

  return {
    confidence,
    requires_review,
    review_status,
    root_cause,
    recommended_action,
    red_flags,
    warnings,
    validation_checks: checks,
  };
}
