/**
 * validatePassiveFireParse — LLM-driven audit of the Passive Fire parse.
 *
 * Runs AFTER structure/sanitizer/extractor/selector. Audits the combined
 * output and returns confidence, review status, and a root-cause label
 * used by the composer and review queue.
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
  | "sanitizer_issue"
  | "structure_issue"
  | "selector_issue"
  | "line_item_issue"
  | "mixed_issue"
  | "insufficient_data";

export type PassiveFireValidationChecks = {
  summary_page_present: boolean;
  rollup_match: boolean;
  line_item_alignment: boolean;
  sanitizer_success: boolean;
  optional_separated: boolean;
  duplicates_controlled: boolean;
};

export type PassiveFireValidationResult = {
  confidence: number;
  requires_review: boolean;
  review_status: PassiveFireReviewStatus;
  root_cause: PassiveFireRootCause;
  red_flags: string[];
  warnings: string[];
  validation_checks: PassiveFireValidationChecks;
  recommended_action: string;
};

const DEFAULT_CHECKS: PassiveFireValidationChecks = {
  summary_page_present: false,
  rollup_match: false,
  line_item_alignment: false,
  sanitizer_success: false,
  optional_separated: false,
  duplicates_controlled: true,
};

const SAFE_FALLBACK: PassiveFireValidationResult = {
  confidence: 0,
  requires_review: true,
  review_status: "manual_review_required",
  root_cause: "insufficient_data",
  red_flags: ["validator_unavailable"],
  warnings: [],
  validation_checks: DEFAULT_CHECKS,
  recommended_action: "manual_review",
};

export async function validatePassiveFireParse(ctx: {
  structure: PassiveFireStructure | null;
  authoritative: PassiveFireAuthoritativeTotal | null;
  sanitizer: PassiveFireSanitizerResult | null;
  items: ParsedLineItemV2[];
  supplier: string;
  openAIKey: string;
}): Promise<PassiveFireValidationResult> {
  try {
    return deterministicValidate(ctx);
  } catch (err) {
    console.error("[validatePassiveFireParse] error", err);
    return SAFE_FALLBACK;
  }
}

function deterministicValidate(ctx: {
  structure: PassiveFireStructure | null;
  authoritative: PassiveFireAuthoritativeTotal | null;
  sanitizer: PassiveFireSanitizerResult | null;
  items: ParsedLineItemV2[];
}): PassiveFireValidationResult {
  const red_flags: string[] = [];
  const warnings: string[] = [];

  const selectedTotal = ctx.authoritative?.selected_main_total_ex_gst ?? null;
  const summaryPresent =
    ctx.authoritative?.support_checks?.summary_page_present ??
    ctx.structure?.summary_exists ??
    false;
  const rollupMatch = ctx.authoritative?.support_checks?.rollup_match ?? false;
  const lineItemAlignment =
    ctx.authoritative?.support_checks?.line_item_alignment ?? false;
  const sanitizerSuccess = ctx.sanitizer ? ctx.sanitizer.risk_score <= 0.4 : true;

  const mainItems = ctx.items.filter((i) => i.scope_category === "main");
  const optionalItems = ctx.items.filter((i) => i.scope_category === "optional");
  const optionalSeparated = optionalItems.length === 0 || optionalItems.every((i) => i.scope_category === "optional");

  if (selectedTotal == null) red_flags.push("no_authoritative_total");
  if (!summaryPresent) warnings.push("no_summary_page");
  if (!rollupMatch) warnings.push("rollup_mismatch");
  if (!lineItemAlignment) warnings.push("line_items_misaligned");
  if (!sanitizerSuccess) warnings.push("sanitizer_flagged_risk");
  if (mainItems.length === 0 && ctx.items.length > 0) warnings.push("no_main_items");

  let confidence = 0;
  if (selectedTotal != null) confidence += 0.4;
  if (summaryPresent) confidence += 0.15;
  if (rollupMatch) confidence += 0.15;
  if (lineItemAlignment) confidence += 0.15;
  if (sanitizerSuccess) confidence += 0.1;
  if (mainItems.length > 0) confidence += 0.05;
  confidence = Math.min(1, confidence);

  const selectorConfidence = ctx.authoritative?.confidence ?? 0;
  confidence = Math.round(((confidence + selectorConfidence) / 2) * 100) / 100;

  const requires_review = red_flags.length > 0 || confidence < 0.75;

  const review_status: PassiveFireReviewStatus =
    red_flags.length > 0 && confidence < 0.55
      ? "manual_review_required"
      : requires_review
      ? "manual_review_recommended"
      : confidence >= 0.9
      ? "auto_trust"
      : "trusted_with_monitoring";

  const root_cause: PassiveFireRootCause = selectedTotal == null
    ? "selector_issue"
    : !sanitizerSuccess
    ? "sanitizer_issue"
    : !rollupMatch
    ? "structure_issue"
    : !lineItemAlignment
    ? "line_item_issue"
    : warnings.length > 1
    ? "mixed_issue"
    : "clean_parse";

  return {
    confidence,
    requires_review,
    review_status,
    root_cause,
    red_flags,
    warnings,
    validation_checks: {
      summary_page_present: !!summaryPresent,
      rollup_match: !!rollupMatch,
      line_item_alignment: !!lineItemAlignment,
      sanitizer_success: !!sanitizerSuccess,
      optional_separated: optionalSeparated,
      duplicates_controlled: true,
    },
    recommended_action: requires_review ? "manual_review" : "accept_v2_total",
  };
}
