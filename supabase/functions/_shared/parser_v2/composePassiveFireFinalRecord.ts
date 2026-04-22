/**
 * composePassiveFireFinalRecord — Prompt 6 composer.
 *
 * Combines the validated outputs of sanitizer, structure map, line-item
 * extractor, authoritative total selector, and validation audit gate into
 * ONE normalized, production-grade quote record. No re-parsing. No LLM.
 * Pure deterministic composition so the final object is schema-stable and
 * safe for Version Comparison, review queues, and analytics.
 */

import type { PassiveFireStructure } from "./classifiers/classifyPassiveFireStructure.ts";
import type { PassiveFireAuthoritativeTotal } from "./classifiers/selectPassiveFireAuthoritativeTotal.ts";
import type { PassiveFireSanitizerResult } from "./classifiers/sanitizePassiveFireText.ts";
import type {
  PassiveFireValidationResult,
  PassiveFireReviewStatus,
  PassiveFireRootCause,
} from "./validation/validatePassiveFireParse.ts";
import type { ParsedLineItemV2 } from "./runParserV2.ts";

export type PassiveFireQuoteType =
  | "itemized"
  | "lump_sum"
  | "hybrid"
  | "summary_plus_breakdown"
  | "schedule_only"
  | "unknown";

export type PassiveFireFinalRecord = {
  supplier: string | null;
  trade: "passive_fire";
  quote_type: PassiveFireQuoteType;
  document_type: string | null;

  currency: string | null;
  gst_basis: "excl_gst" | "incl_gst" | "unclear" | null;

  quote_total_ex_gst: number | null;
  quote_total_inc_gst: number | null;

  optional_total: number | null;
  ps3_qa_total: number | null;
  site_setup_total: number | null;

  line_items_count: number;
  main_items_count: number;
  optional_items_count: number;
  duplicates_removed: number;
  ignored_rows_count: number;

  summary_page_present: boolean;
  rollup_match: boolean;
  line_item_alignment: boolean;
  sanitizer_success: boolean;

  confidence: number;
  requires_review: boolean;
  review_status: PassiveFireReviewStatus;
  comparison_safe: boolean;
  root_cause: PassiveFireRootCause;

  review_reason: string | null;
  recommended_action: string;

  legacy_fields: {
    total: number | null;
    subtotal: number | null;
    optionalValue: number | null;
    confidenceScore: number;
    needsReview: boolean;
  };

  analytics: {
    service_trade_mix: Record<string, number>;
    dominant_system_brand: string | null;
    page_count: number | null;
  };
};

export function composePassiveFireFinalRecord(ctx: {
  supplier: string | null;
  items: ParsedLineItemV2[];
  structure: PassiveFireStructure | null;
  authoritative: PassiveFireAuthoritativeTotal | null;
  sanitizer: PassiveFireSanitizerResult | null;
  validation: PassiveFireValidationResult | null;
  pageCount?: number | null;
  declaredQuoteType?: string | null;
}): PassiveFireFinalRecord {
  const {
    supplier,
    items,
    structure,
    authoritative,
    sanitizer,
    validation,
    pageCount = null,
    declaredQuoteType = null,
  } = ctx;

  const main = items.filter((i) => i.scope_category === "main");
  const optional = items.filter((i) => i.scope_category === "optional");

  const selectedTotal = authoritative?.selected_main_total_ex_gst ?? null;
  const gstBasis = authoritative?.gst_basis ?? null;
  const currency = authoritative?.currency ?? null;

  const quoteTotalIncGst = deriveIncGst(selectedTotal, gstBasis, currency);
  const subtotal = deriveSubtotal(selectedTotal, authoritative);

  const validationChecks = validation?.validation_checks ?? null;
  const summaryPresent =
    validationChecks?.summary_page_present ??
    authoritative?.support_checks?.summary_page_present ??
    (structure?.summary_exists ?? false);
  const rollupMatch =
    validationChecks?.rollup_match ??
    authoritative?.support_checks?.rollup_match ??
    false;
  const lineItemAlignment =
    validationChecks?.line_item_alignment ??
    authoritative?.support_checks?.line_item_alignment ??
    false;
  const sanitizerSuccess =
    validationChecks?.sanitizer_success ??
    (sanitizer ? sanitizer.risk_score <= 0.4 : false);

  const confidence = clamp01(
    validation?.confidence ?? authoritative?.confidence ?? 0,
  );
  const requiresReview =
    (validation?.requires_review ?? (authoritative?.requires_review ?? false)) ||
    selectedTotal == null ||
    confidence < 0.75;

  const reviewStatus: PassiveFireReviewStatus =
    validation?.review_status ?? deriveReviewStatus(confidence, requiresReview);

  const comparisonSafe =
    selectedTotal != null && confidence >= 0.75 && !requiresReview;

  const rootCause: PassiveFireRootCause =
    validation?.root_cause ?? (requiresReview ? "mixed_issue" : "clean_parse");

  const reviewReason = requiresReview
    ? buildReviewReason(validation, authoritative, selectedTotal)
    : null;

  const recommendedAction =
    validation?.recommended_action ??
    (comparisonSafe ? "accept_v2_total" : "manual_review");

  const quoteType = deriveQuoteType({
    declared: declaredQuoteType,
    documentType: structure?.document_type ?? null,
    rowCount: items.length,
    hasSummary: summaryPresent,
  });

  return {
    supplier: supplier ?? null,
    trade: "passive_fire",
    quote_type: quoteType,
    document_type: structure?.document_type ?? null,
    currency,
    gst_basis: gstBasis,
    quote_total_ex_gst: selectedTotal,
    quote_total_inc_gst: quoteTotalIncGst,
    optional_total: authoritative?.optional_total_ex_gst ?? null,
    ps3_qa_total: authoritative?.ps3_qa_total_ex_gst ?? null,
    site_setup_total: authoritative?.site_setup_total_ex_gst ?? null,
    line_items_count: items.length,
    main_items_count: main.length,
    optional_items_count: optional.length,
    duplicates_removed: 0,
    ignored_rows_count: sanitizer?.removed_tokens.length ?? 0,
    summary_page_present: !!summaryPresent,
    rollup_match: !!rollupMatch,
    line_item_alignment: !!lineItemAlignment,
    sanitizer_success: !!sanitizerSuccess,
    confidence,
    requires_review: requiresReview,
    review_status: reviewStatus,
    comparison_safe: comparisonSafe,
    root_cause: rootCause,
    review_reason: reviewReason,
    recommended_action: recommendedAction,
    legacy_fields: {
      total: selectedTotal,
      subtotal,
      optionalValue: authoritative?.optional_total_ex_gst ?? null,
      confidenceScore: confidence,
      needsReview: requiresReview,
    },
    analytics: {
      service_trade_mix: buildServiceTradeMix(items),
      dominant_system_brand: findDominantBrand(items),
      page_count: pageCount,
    },
  };
}

function deriveQuoteType(args: {
  declared: string | null;
  documentType: string | null;
  rowCount: number;
  hasSummary: boolean;
}): PassiveFireQuoteType {
  const declared = (args.declared ?? "").toLowerCase();
  const doc = (args.documentType ?? "").toLowerCase();

  if (doc.includes("summary_plus_breakdown") || doc.includes("summary+breakdown")) {
    return "summary_plus_breakdown";
  }
  if (doc.includes("schedule_only") || doc.includes("schedule-only")) {
    return "schedule_only";
  }
  if (declared === "itemized" && args.rowCount > 0 && args.hasSummary) {
    return "hybrid";
  }
  if (declared === "itemized" && args.rowCount > 0) return "itemized";
  if (declared === "lump_sum") return "lump_sum";
  if (declared === "hybrid") return "hybrid";

  if (args.rowCount > 0 && args.hasSummary) return "hybrid";
  if (args.rowCount > 0) return "itemized";
  if (args.hasSummary) return "lump_sum";
  return "unknown";
}

function deriveIncGst(
  selected: number | null,
  gstBasis: string | null,
  currency: string | null,
): number | null {
  if (selected == null) return null;
  if (gstBasis !== "excl_gst") return null;
  const cur = (currency ?? "NZD").toUpperCase();
  if (cur !== "NZD") return null;
  return Math.round(selected * 1.15 * 100) / 100;
}

function deriveSubtotal(
  selected: number | null,
  auth: PassiveFireAuthoritativeTotal | null,
): number | null {
  if (selected == null) return null;
  const ps3 = auth?.ps3_qa_total_ex_gst ?? 0;
  const setup = auth?.site_setup_total_ex_gst ?? 0;
  const sub = selected - ps3 - setup;
  if (!Number.isFinite(sub) || sub <= 0) return null;
  return Math.round(sub * 100) / 100;
}

function deriveReviewStatus(
  confidence: number,
  requiresReview: boolean,
): PassiveFireReviewStatus {
  if (requiresReview && confidence < 0.55) return "manual_review_required";
  if (requiresReview) return "manual_review_recommended";
  if (confidence >= 0.9) return "auto_trust";
  if (confidence >= 0.75) return "trusted_with_monitoring";
  if (confidence >= 0.55) return "manual_review_recommended";
  return "manual_review_required";
}

function buildReviewReason(
  validation: PassiveFireValidationResult | null,
  auth: PassiveFireAuthoritativeTotal | null,
  selected: number | null,
): string {
  if (selected == null) return "manual_total_check";
  const redFlags = validation?.red_flags ?? [];
  if (redFlags.length > 0) return redFlags[0];
  const warnings = validation?.warnings ?? [];
  if (warnings.length > 0) return warnings[0];
  if (auth?.requires_review) return "selector_flagged_review";
  return "low_confidence";
}

function buildServiceTradeMix(
  items: ParsedLineItemV2[],
): Record<string, number> {
  const mix: Record<string, number> = {};
  for (const it of items) {
    const key =
      (it as unknown as { service_trade?: string }).service_trade ?? "unknown";
    mix[key] = (mix[key] ?? 0) + 1;
  }
  return mix;
}

function findDominantBrand(items: ParsedLineItemV2[]): string | null {
  const brands = [
    "hilti",
    "allproof",
    "protecta",
    "ryanfire",
    "firepro",
    "servowrap",
    "rokwrap",
    "multiflex",
    "powerpad",
  ];
  const counts: Record<string, number> = {};
  for (const it of items) {
    const haystack = `${it.description ?? ""} ${
      (it as unknown as { system_name?: string }).system_name ?? ""
    }`.toLowerCase();
    for (const b of brands) {
      if (haystack.includes(b)) counts[b] = (counts[b] ?? 0) + 1;
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [b, c] of Object.entries(counts)) {
    if (c > bestCount) {
      best = b;
      bestCount = c;
    }
  }
  return best;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
