/**
 * validatePassiveFireParse — final audit pass that independently reviews the
 * outputs of the sanitizer, structure analyst, line-item extractor, and
 * authoritative total selector. Assigns a trust-confidence score, decides
 * whether the parse needs manual review, classifies likely root cause, and
 * flags whether the resulting total is safe for Version Comparison.
 */

import { PASSIVE_FIRE_VALIDATION_PROMPT } from "../prompts/passiveFireValidationPrompt.ts";
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
  | "ocr_noise"
  | "supplier_weird_format"
  | "double_count_risk"
  | "optional_scope_confusion"
  | "subtotal_selected"
  | "missing_summary"
  | "currency_gst_unclear"
  | "bad_numeric_candidate"
  | "low_data_quality"
  | "mixed_issue";

export type PassiveFireValidationChecks = {
  total_present: boolean;
  label_quality: boolean;
  summary_page_present: boolean;
  rollup_match: boolean;
  line_item_alignment: boolean;
  optional_separated: boolean;
  duplicates_handled: boolean;
  sanitizer_success: boolean;
};

export type PassiveFireValidationResult = {
  selected_total: number | null;
  confidence: number;
  requires_review: boolean;
  review_status: PassiveFireReviewStatus;
  comparison_safe: boolean;
  validation_checks: PassiveFireValidationChecks;
  warnings: string[];
  red_flags: string[];
  root_cause: PassiveFireRootCause;
  recommended_action: string;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const VALIDATOR_MODEL = "gpt-4.1";
const MAX_ITEM_SAMPLE = 40;

const REVIEW_STATUSES: PassiveFireReviewStatus[] = [
  "auto_trust",
  "trusted_with_monitoring",
  "manual_review_recommended",
  "manual_review_required",
];

const ROOT_CAUSES: PassiveFireRootCause[] = [
  "clean_parse",
  "ocr_noise",
  "supplier_weird_format",
  "double_count_risk",
  "optional_scope_confusion",
  "subtotal_selected",
  "missing_summary",
  "currency_gst_unclear",
  "bad_numeric_candidate",
  "low_data_quality",
  "mixed_issue",
];

export async function validatePassiveFireParse(ctx: {
  structure: PassiveFireStructure | null;
  authoritative: PassiveFireAuthoritativeTotal | null;
  sanitizer: PassiveFireSanitizerResult | null;
  items: ParsedLineItemV2[];
  supplier: string;
  openAIKey: string;
}): Promise<PassiveFireValidationResult> {
  const payload = buildPayload(ctx);

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.openAIKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VALIDATOR_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PASSIVE_FIRE_VALIDATION_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[pf_validate] HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
    return fallbackResult(ctx.authoritative);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) return fallbackResult(ctx.authoritative);

  try {
    return normaliseResult(
      JSON.parse(content) as Record<string, unknown>,
      ctx.authoritative,
    );
  } catch (err) {
    console.error("[pf_validate] JSON parse failed", err);
    return fallbackResult(ctx.authoritative);
  }
}

function buildPayload(ctx: {
  structure: PassiveFireStructure | null;
  authoritative: PassiveFireAuthoritativeTotal | null;
  sanitizer: PassiveFireSanitizerResult | null;
  items: ParsedLineItemV2[];
  supplier: string;
}) {
  const main = ctx.items.filter((i) => i.scope_category === "main");
  const optional = ctx.items.filter((i) => i.scope_category === "optional");
  const sum = (xs: ParsedLineItemV2[]) =>
    xs.reduce((acc, it) => acc + (it.total_price ?? 0), 0);

  return {
    supplier: ctx.supplier,
    selected_total: ctx.authoritative?.selected_main_total_ex_gst ?? null,
    selected_label: ctx.authoritative?.selected_label ?? null,
    selected_page: ctx.authoritative?.selected_page ?? null,
    gst_basis: ctx.authoritative?.gst_basis ?? null,
    optional_total: ctx.authoritative?.optional_total_ex_gst ?? null,
    ps3_qa_total: ctx.authoritative?.ps3_qa_total_ex_gst ?? null,
    site_setup_total: ctx.authoritative?.site_setup_total_ex_gst ?? null,
    selection_reason: ctx.authoritative?.selection_reason ?? null,
    rejected_candidates: ctx.authoritative?.rejected_candidates ?? [],
    support_checks: ctx.authoritative?.support_checks ?? null,
    requires_review_hint: ctx.authoritative?.requires_review ?? false,
    selector_confidence: ctx.authoritative?.confidence ?? null,
    structure: ctx.structure
      ? {
          document_type: ctx.structure.document_type ?? null,
          summary_exists: ctx.structure.summary_exists ?? null,
          detail_exists: ctx.structure.detail_exists ?? null,
          summary_vs_breakdown_exclusive:
            ctx.structure.summary_vs_breakdown_exclusive ?? null,
          main_scope_total: ctx.structure.main_scope_total ?? null,
          rollups: ctx.structure.rollups ?? [],
          duplicate_totals: ctx.structure.duplicate_totals ?? [],
          ambiguous_items: ctx.structure.ambiguous_items ?? [],
          authoritative_total_candidates:
            ctx.structure.authoritative_total_candidates ?? [],
          structure_confidence: ctx.structure.confidence ?? null,
        }
      : null,
    sanitizer: ctx.sanitizer
      ? {
          risk_score: ctx.sanitizer.risk_score,
          removed_count: ctx.sanitizer.removed_tokens.length,
          suspicious_count: ctx.sanitizer.suspicious_numerics.length,
          money_candidate_count: ctx.sanitizer.money_candidates.length,
          suspicious_sample: ctx.sanitizer.suspicious_numerics.slice(0, 10),
        }
      : null,
    line_items: {
      rows_extracted: ctx.items.length,
      main_count: main.length,
      optional_count: optional.length,
      main_total_sum: round2(sum(main)),
      optional_total_sum: round2(sum(optional)),
      sample: ctx.items.slice(0, MAX_ITEM_SAMPLE).map((it) => ({
        description: it.description.slice(0, 120),
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
        scope_category: it.scope_category,
      })),
    },
  };
}

function normaliseResult(
  raw: Record<string, unknown>,
  authoritative: PassiveFireAuthoritativeTotal | null,
): PassiveFireValidationResult {
  const checksRaw = (raw.validation_checks ?? {}) as Record<string, unknown>;
  const reviewStatusRaw = String(raw.review_status ?? "").toLowerCase();
  const rootCauseRaw = String(raw.root_cause ?? "").toLowerCase();

  return {
    selected_total:
      toNumberOrNull(raw.selected_total) ??
      authoritative?.selected_main_total_ex_gst ??
      null,
    confidence: clamp01(Number(raw.confidence ?? 0)),
    requires_review: toBool(raw.requires_review),
    review_status: (REVIEW_STATUSES as string[]).includes(reviewStatusRaw)
      ? (reviewStatusRaw as PassiveFireReviewStatus)
      : "manual_review_required",
    comparison_safe: toBool(raw.comparison_safe),
    validation_checks: {
      total_present: toBool(checksRaw.total_present),
      label_quality: toBool(checksRaw.label_quality),
      summary_page_present: toBool(checksRaw.summary_page_present),
      rollup_match: toBool(checksRaw.rollup_match),
      line_item_alignment: toBool(checksRaw.line_item_alignment),
      optional_separated: toBool(checksRaw.optional_separated),
      duplicates_handled: toBool(checksRaw.duplicates_handled),
      sanitizer_success: toBool(checksRaw.sanitizer_success),
    },
    warnings: Array.isArray(raw.warnings)
      ? (raw.warnings as unknown[]).map((w) => String(w)).filter(Boolean)
      : [],
    red_flags: Array.isArray(raw.red_flags)
      ? (raw.red_flags as unknown[]).map((w) => String(w)).filter(Boolean)
      : [],
    root_cause: (ROOT_CAUSES as string[]).includes(rootCauseRaw)
      ? (rootCauseRaw as PassiveFireRootCause)
      : "mixed_issue",
    recommended_action: String(raw.recommended_action ?? "review"),
  };
}

function fallbackResult(
  authoritative: PassiveFireAuthoritativeTotal | null,
): PassiveFireValidationResult {
  return {
    selected_total: authoritative?.selected_main_total_ex_gst ?? null,
    confidence: 0.5,
    requires_review: true,
    review_status: "manual_review_required",
    comparison_safe: false,
    validation_checks: {
      total_present: !!authoritative?.selected_main_total_ex_gst,
      label_quality: false,
      summary_page_present: false,
      rollup_match: false,
      line_item_alignment: false,
      optional_separated: false,
      duplicates_handled: false,
      sanitizer_success: false,
    },
    warnings: ["validator_unavailable"],
    red_flags: [],
    root_cause: "mixed_issue",
    recommended_action: "manual_review",
  };
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  const s = String(v).toLowerCase().trim();
  return s === "true" || s === "yes" || s === "1";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
