/**
 * Scope Segmentation Engine — Parser V2 Stage 10 (LLM-primary).
 *
 * Pipeline:
 *   1. Build compact document context (page 1 + totals pages + scope-keyword
 *      pages) and structural heading list.
 *   2. Send all extracted rows to the LLM in one call (<=120 rows) or in
 *      80-row batches (>120 rows). Same context + totals per batch.
 *   3. Apply confidence-tiered overwrite:
 *        >= 0.70  -> overwrite scope_category
 *        0.50-0.69 -> preserve original scope_category but record label/reason
 *        <  0.50  -> set scope_segmentation_label = "Unknown"
 *   4. Excluded keyword override at confidence >= 0.80 ("by others",
 *      "no allowance", "excluded", "not included", "rate only").
 *   5. Reconcile sums to authoritative totals (1.5% tolerance). If uncertain
 *      rows < 60, run a second LLM review pass on uncertain rows only.
 *   6. On any LLM failure, fall back to the deterministic section-anchored
 *      classifier preserved at the bottom of this file.
 *
 * Public types (`ScopeSegmentationItem`, `ScopeSegmentationResult`,
 * `ScopeSegmentationInput`) are stable — downstream stages and edge functions
 * are unchanged.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";
import {
  classifyRowsLLM,
  classifyRowsLLMReview,
  SCOPE_SEGMENTATION_MODEL,
  type LLMItemResult,
} from "./scopeSegmentationLLM.ts";
import type {
  ScopeSegmentationLLMHeading,
  ScopeSegmentationLLMRow,
} from "./scopeSegmentationPrompt.ts";

// --------------------------------------------------------------------------
// Public types (stable)
// --------------------------------------------------------------------------

export type ScopeLabel = "Main" | "Optional" | "Excluded" | "Unknown";

export type ScopeSegmentationItem = ParsedLineItemV2 & {
  scope_segmentation_label?: ScopeLabel;
  scope_confidence?: number;
  scope_reason?: string;
};

export type ScopeSegmentationSummary = {
  main_sum: number;
  optional_sum: number;
  excluded_sum: number;
  unknown_sum: number;
  matched_main_total: boolean;
  matched_optional_total: boolean;
  delta_main: number | null;
  delta_optional: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  llm_used: boolean;
  llm_review_used: boolean;
  model_used: string | null;
  rows_sent_to_llm: number;
  rows_classified_main: number;
  rows_classified_optional: number;
  rows_classified_excluded: number;
  rows_classified_unknown: number;
  llm_resolved_rows: number;
  headings_detected: number;
  layers_applied: string[];
  fallback_used: string | null;
  llm_errors: string[];
  examples: Array<{
    row_id: string;
    description: string;
    scope_category: ScopeLabel;
    confidence: number;
    reason: string;
  }>;
  requires_scope_review: boolean;
};

export type ScopeSegmentationResult = {
  items: ScopeSegmentationItem[];
  summary: ScopeSegmentationSummary;
};

export type ScopeSegmentationInput = {
  extracted_items: ParsedLineItemV2[];
  rawText: string;
  allPages: { pageNum: number; text: string }[];
  quote_type: string;
  trade: string;
  supplier: string;
  authoritative_totals: {
    main_total: number | null;
    optional_total: number | null;
  };
  openAIKey?: string;
};

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const TOTALS_TOLERANCE = 0.015;
const REVIEW_PASS_MAX_UNCERTAIN = 60;
const OVERWRITE_THRESHOLD = 0.7;
const PRESERVE_THRESHOLD = 0.5;
const EXCLUDED_OVERRIDE_THRESHOLD = 0.8;
const CONTEXT_PAGE_BUDGET = 4500;

const EXCLUDED_OVERRIDE_RE =
  /\b(by\s+others|no\s+allowance|excluded|not\s+included|rate\s+only)\b/i;

// Heading detection (used to feed structural cues to the LLM and to support
// the deterministic fallback path).
const MAIN_HEADER_PATTERNS: RegExp[] = [
  /^\s*main\s+scope\s*:?\s*$/i,
  /^\s*included\s+scope\s*:?\s*$/i,
  /^\s*base\s+scope\s*:?\s*$/i,
  /^\s*contract\s+works\s*:?\s*$/i,
  /^\s*main\s+works\s*:?\s*$/i,
  /^\s*schedule\s+of\s+works\s*:?\s*$/i,
  /^\s*included\s+items?\s*:?\s*$/i,
  /^\s*items?\s+identified\s+on\s+drawings\s*:?\s*$/i,
  /^\s*identified\s+on\s+drawings\s*:?\s*$/i,
  /^\s*penetration\s+works\s*:?\s*$/i,
  /^\s*quote\s+breakdown\s*:?\s*$/i,
  /^\s*estimate\s+summary\s*:?\s*$/i,
  /^\s*quote\s+summary\s*:?\s*$/i,
  /^\s*tender\s+summary\s*:?\s*$/i,
  /\bsub[\s-]?total\b/i,
];

const OPTIONAL_HEADER_PATTERNS: RegExp[] = [
  /^\s*optional\s+scope\s*:?\s*$/i,
  /^\s*optional\s+extras?\s*:?\s*$/i,
  /^\s*optional\s+items?\s*:?\s*$/i,
  /^\s*optional\s*:?\s*$/i,
  /^\s*add\s+to\s+scope\s*:?\s*$/i,
  /^\s*additional\s+items?\s*:?\s*$/i,
  /^\s*confirmation\s+required\s*:?\s*$/i,
  /^\s*items?\s+requiring\s+confirmation\s*:?\s*$/i,
  /^\s*items?\s+not\s+shown\s+on\s+drawings\s*:?\s*$/i,
  /^\s*not\s+shown\s+on\s+drawings\s*:?\s*$/i,
  /^\s*estimate\s+items?\s+not\s+shown\s+on\s+drawings\s*:?\s*$/i,
  /^\s*extras?\s+over\s*:?\s*$/i,
  /^\s*alternates?\s*:?\s*$/i,
  /^\s*upgrade\s+options?\s*:?\s*$/i,
  /^\s*can\s+be\s+removed\s*:?\s*$/i,
  /^\s*tbc\s+breakdown\s*:?\s*$/i,
  /^\s*items?\s+for\s+confirmation\s*:?\s*$/i,
];

const EXCLUDED_HEADER_PATTERNS: RegExp[] = [
  /^\s*exclusions?\s*:?\s*$/i,
  /^\s*excluded\s+items?\s*:?\s*$/i,
  /^\s*excluded\s*:?\s*$/i,
  /^\s*not\s+included\s*:?\s*$/i,
  /^\s*items?\s+not\s+included\s*:?\s*$/i,
  /^\s*services?\s+not\s+part\s+of\b/i,
  /^\s*clarifications?\s*:?\s*$/i,
];

const CONTEXT_KEYWORDS_RE =
  /\b(quote\s+summary|estimate\s+summary|quote\s+breakdown|sub[\s-]?total|optional\s+scope|add\s+to\s+scope|not\s+shown\s+on\s+drawings|items?\s+with\s+confirmation|by\s+others|no\s+allowance|exclud|not\s+included|rate\s+only|tbc|provisional|grand\s+total|total\s+ex\s+gst|main\s+total|optional\s+total)\b/i;

// --------------------------------------------------------------------------
// Public entry point
// --------------------------------------------------------------------------

export async function runScopeSegmentationEngine(
  input: ScopeSegmentationInput,
): Promise<ScopeSegmentationResult> {
  const layers: string[] = [];
  const headings = extractHeadings(input.allPages ?? []);
  const importantContext = buildDocumentContext(
    input.allPages ?? [],
    input.rawText,
    input.authoritative_totals,
  );

  const llmRows: ScopeSegmentationLLMRow[] = input.extracted_items.map(
    (item, idx) => ({
      row_id: `r${idx}`,
      description: item.description ?? "",
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      unit_price: item.unit_price ?? null,
      total_price: item.total_price ?? null,
      source_page: item.source_page ?? null,
      current_scope_category: String(item.scope_category ?? "main"),
      existing_confidence: typeof item.confidence === "number" ? item.confidence : null,
      parent_section: (item as { parent_section?: string | null }).parent_section ?? null,
      nearby_heading: nearestHeadingForPage(item.source_page ?? null, headings),
    }),
  );

  // Layer 1 — LLM-primary classification.
  const llmAttempt = await tryLLMPrimary(input, llmRows, headings, importantContext);

  if (!llmAttempt.ok) {
    layers.push("llm_failed_fallback_deterministic");
    console.warn(
      `[scopeSegmentationEngine] LLM-primary failed (${llmAttempt.error}) — falling back to deterministic segmentation`,
    );
    const fallback = await runDeterministicFallback(input);
    fallback.summary.layers_applied = ["llm_failed", ...fallback.summary.layers_applied];
    fallback.summary.fallback_used = "deterministic_existing";
    fallback.summary.llm_errors = llmAttempt.errors;
    fallback.summary.model_used = SCOPE_SEGMENTATION_MODEL;
    return fallback;
  }

  layers.push("llm_primary");

  // Layer 2 — apply LLM classifications via confidence tiers.
  const working = applyLLMResults(input.extracted_items, llmAttempt.itemsById);
  layers.push("confidence_tier_apply");

  // Layer 3 — Excluded keyword override.
  let excludedOverrides = 0;
  for (const w of working) {
    if (
      EXCLUDED_OVERRIDE_RE.test(w.item.description ?? "") &&
      w.confidence >= EXCLUDED_OVERRIDE_THRESHOLD
    ) {
      if (w.label !== "Excluded") {
        w.label = "Excluded";
        w.reason = `keyword_override:excluded:${w.reason}`.slice(0, 200);
        excludedOverrides++;
      }
    }
  }
  if (excludedOverrides > 0) layers.push("excluded_keyword_override");

  // Layer 4 — totals reconciliation; trigger review pass only if necessary.
  const sums = computeSums(working);
  const mainTarget = input.authoritative_totals.main_total;
  const optTarget = input.authoritative_totals.optional_total;
  const matched_main = mainTarget != null ? withinTolerance(sums.main, mainTarget) : false;
  const matched_optional = optTarget != null ? withinTolerance(sums.optional, optTarget) : false;
  const needsReview =
    !matched_main && (mainTarget != null) ||
    !matched_optional && (optTarget != null);

  let llmReviewUsed = false;
  let resolvedByReview = 0;
  if (needsReview && input.openAIKey) {
    const uncertain = working.filter((w) => w.confidence < 0.85);
    if (uncertain.length > 0 && uncertain.length < REVIEW_PASS_MAX_UNCERTAIN) {
      const reviewRows = uncertain.map((w) => llmRowFor(w, headings));
      const review = await classifyRowsLLMReview({
        openAIKey: input.openAIKey,
        main_total: mainTarget,
        optional_total: optTarget,
        main_sum: sums.main,
        optional_sum: sums.optional,
        important_document_context: importantContext,
        headings,
        rows: reviewRows,
      });
      llmReviewUsed = true;
      layers.push("llm_review_pass");
      const byId = new Map(review.items.map((it) => [it.row_id, it] as const));
      for (const w of working) {
        const upd = byId.get(w.row_id);
        if (!upd) continue;
        const newLabel = mapLabel(upd.scope_category);
        const newConf = upd.confidence;
        if (newConf >= OVERWRITE_THRESHOLD && newLabel !== w.label) {
          w.label = newLabel;
          w.confidence = Math.max(w.confidence, newConf);
          w.reason = `review:${(upd.reason ?? "").slice(0, 80) || "structural"}`;
          resolvedByReview++;
        }
      }
    }
  }

  // Recompute final sums + match flags.
  const finalSums = computeSums(working);
  const final_matched_main =
    mainTarget != null ? withinTolerance(finalSums.main, mainTarget) : false;
  const final_matched_optional =
    optTarget != null ? withinTolerance(finalSums.optional, optTarget) : false;
  const delta_main = mainTarget != null ? round2(finalSums.main - mainTarget) : null;
  const delta_optional = optTarget != null ? round2(finalSums.optional - optTarget) : null;

  // Confidence rollup.
  const avgConfidence =
    working.length > 0 ? working.reduce((s, w) => s + w.confidence, 0) / working.length : 0;
  let confidence: "HIGH" | "MEDIUM" | "LOW";
  if (
    (final_matched_main || mainTarget == null) &&
    (final_matched_optional || optTarget == null) &&
    avgConfidence >= 0.85
  ) {
    confidence = "HIGH";
  } else if (avgConfidence >= 0.65) {
    confidence = "MEDIUM";
  } else {
    confidence = "LOW";
  }

  const items = composeOutputItems(working);
  const counts = countLabels(working);
  const examples = working.slice(0, 10).map((w) => ({
    row_id: w.row_id,
    description: (w.item.description ?? "").slice(0, 140),
    scope_category: w.label,
    confidence: round3(w.confidence),
    reason: w.reason,
  }));

  return {
    items,
    summary: {
      main_sum: round2(finalSums.main),
      optional_sum: round2(finalSums.optional),
      excluded_sum: round2(finalSums.excluded),
      unknown_sum: round2(finalSums.unknown),
      matched_main_total: final_matched_main,
      matched_optional_total: final_matched_optional,
      delta_main,
      delta_optional,
      confidence,
      llm_used: true,
      llm_review_used: llmReviewUsed,
      model_used: SCOPE_SEGMENTATION_MODEL,
      rows_sent_to_llm: llmAttempt.rowsSent,
      rows_classified_main: counts.Main,
      rows_classified_optional: counts.Optional,
      rows_classified_excluded: counts.Excluded,
      rows_classified_unknown: counts.Unknown,
      llm_resolved_rows: resolvedByReview,
      headings_detected: headings.length,
      layers_applied: layers,
      fallback_used: null,
      llm_errors: llmAttempt.errors,
      examples,
      requires_scope_review:
        confidence === "LOW" ||
        (!final_matched_main && mainTarget != null) ||
        (!final_matched_optional && optTarget != null) ||
        counts.Unknown > 0,
    },
  };
}

// --------------------------------------------------------------------------
// LLM-primary helpers
// --------------------------------------------------------------------------

type WorkingRow = {
  row_id: string;
  index: number;
  item: ParsedLineItemV2;
  label: ScopeLabel;
  confidence: number;
  reason: string;
  llmLabel: ScopeLabel | null;
  llmConfidence: number;
};

type LLMAttempt =
  | {
      ok: true;
      itemsById: Map<string, LLMItemResult>;
      errors: string[];
      rowsSent: number;
    }
  | { ok: false; error: string; errors: string[] };

async function tryLLMPrimary(
  input: ScopeSegmentationInput,
  rows: ScopeSegmentationLLMRow[],
  headings: ScopeSegmentationLLMHeading[],
  importantContext: string,
): Promise<LLMAttempt> {
  if (!input.openAIKey) {
    return { ok: false, error: "missing_openai_key", errors: ["missing_openai_key"] };
  }
  if (rows.length === 0) {
    return { ok: true, itemsById: new Map(), errors: [], rowsSent: 0 };
  }
  try {
    const result = await classifyRowsLLM({
      openAIKey: input.openAIKey,
      supplier: input.supplier,
      trade: input.trade,
      quote_type: input.quote_type,
      main_total: input.authoritative_totals.main_total,
      optional_total: input.authoritative_totals.optional_total,
      grand_total: null,
      page_count: input.allPages?.length ?? 0,
      important_document_context: importantContext,
      headings,
      rows,
    });
    if (result.items.length === 0) {
      return {
        ok: false,
        error: result.errors[0] ?? "llm_no_items",
        errors: result.errors,
      };
    }
    const itemsById = new Map<string, LLMItemResult>();
    for (const it of result.items) itemsById.set(it.row_id, it);
    return { ok: true, itemsById, errors: result.errors, rowsSent: rows.length };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error)?.message ?? "llm_unexpected_error",
      errors: [(err as Error)?.message ?? "llm_unexpected_error"],
    };
  }
}

function applyLLMResults(
  extracted: ParsedLineItemV2[],
  itemsById: Map<string, LLMItemResult>,
): WorkingRow[] {
  const out: WorkingRow[] = [];
  for (let i = 0; i < extracted.length; i++) {
    const item = extracted[i];
    const row_id = `r${i}`;
    const llm = itemsById.get(row_id) ?? null;
    const initialLabel: ScopeLabel = mapLabel(item.scope_category);
    let label: ScopeLabel = initialLabel;
    let confidence = typeof item.confidence === "number" ? item.confidence : 0.5;
    let reason = "preserved:no_llm_result";
    let llmLabel: ScopeLabel | null = null;
    let llmConfidence = 0;
    if (llm) {
      llmLabel = llm.scope_category;
      llmConfidence = llm.confidence;
      const llmReason = (llm.reason ?? "").slice(0, 160);
      if (llm.confidence >= OVERWRITE_THRESHOLD) {
        label = llm.scope_category;
        confidence = llm.confidence;
        reason = `llm_overwrite:${llmReason}`;
      } else if (llm.confidence >= PRESERVE_THRESHOLD) {
        // preserve original scope_category; record LLM label/reason for audit
        label = initialLabel;
        confidence = Math.max(confidence, llm.confidence);
        reason = `llm_low_conf_preserved:${llm.scope_category.toLowerCase()}:${llmReason}`;
      } else {
        label = "Unknown";
        confidence = llm.confidence;
        reason = `llm_low_conf_unknown:${llm.scope_category.toLowerCase()}:${llmReason}`;
      }
    }
    out.push({
      row_id,
      index: i,
      item,
      label,
      confidence,
      reason,
      llmLabel,
      llmConfidence,
    });
  }
  return out;
}

function llmRowFor(
  w: WorkingRow,
  headings: ScopeSegmentationLLMHeading[],
): ScopeSegmentationLLMRow {
  return {
    row_id: w.row_id,
    description: w.item.description ?? "",
    quantity: w.item.quantity ?? null,
    unit: w.item.unit ?? null,
    unit_price: w.item.unit_price ?? null,
    total_price: w.item.total_price ?? null,
    source_page: w.item.source_page ?? null,
    current_scope_category: w.label,
    existing_confidence: w.confidence,
    parent_section: (w.item as { parent_section?: string | null }).parent_section ?? null,
    nearby_heading: nearestHeadingForPage(w.item.source_page ?? null, headings),
  };
}

function composeOutputItems(rows: WorkingRow[]): ScopeSegmentationItem[] {
  return rows.map((w) => {
    const downstream =
      w.label === "Main"
        ? "main"
        : w.label === "Optional"
        ? "optional"
        : w.label === "Excluded"
        ? "excluded"
        : null;
    const next: ScopeSegmentationItem = {
      ...w.item,
      scope_segmentation_label: w.label,
      scope_confidence: round3(w.confidence),
      scope_reason: w.reason,
    };
    if (downstream && w.confidence >= OVERWRITE_THRESHOLD) {
      next.scope_category = downstream as ParsedLineItemV2["scope_category"];
    }
    return next;
  });
}

function computeSums(rows: WorkingRow[]): {
  main: number;
  optional: number;
  excluded: number;
  unknown: number;
} {
  let main = 0;
  let optional = 0;
  let excluded = 0;
  let unknown = 0;
  for (const r of rows) {
    const v = r.item.total_price ?? 0;
    if (r.label === "Main") main += v;
    else if (r.label === "Optional") optional += v;
    else if (r.label === "Excluded") excluded += v;
    else unknown += v;
  }
  return { main, optional, excluded, unknown };
}

function countLabels(rows: WorkingRow[]): Record<ScopeLabel, number> {
  const out: Record<ScopeLabel, number> = { Main: 0, Optional: 0, Excluded: 0, Unknown: 0 };
  for (const r of rows) out[r.label]++;
  return out;
}

function withinTolerance(actual: number, target: number): boolean {
  if (target <= 0) return Math.abs(actual) <= 0.01;
  return Math.abs(actual - target) / Math.abs(target) <= TOTALS_TOLERANCE;
}

function mapLabel(v: unknown): ScopeLabel {
  const s = String(v ?? "").toLowerCase();
  if (s === "main") return "Main";
  if (s === "optional" || s === "provisional") return "Optional";
  if (s === "excluded" || s === "exclusion") return "Excluded";
  if (s === "unknown") return "Unknown";
  return "Main";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// --------------------------------------------------------------------------
// Document context builders
// --------------------------------------------------------------------------

function extractHeadings(
  pages: { pageNum: number; text: string }[],
): ScopeSegmentationLLMHeading[] {
  const out: ScopeSegmentationLLMHeading[] = [];
  for (const p of pages) {
    const lines = (p.text ?? "").split(/\r?\n/);
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed || trimmed.length > 200) continue;
      if (/\$|\d[\d,]*\.\d{2}/.test(trimmed) && !/\bsub[\s-]?total\b/i.test(trimmed)) continue;
      let inferred: ScopeSegmentationLLMHeading["inferred_type"] | null = null;
      if (matchesAny(trimmed, EXCLUDED_HEADER_PATTERNS)) inferred = "Excluded";
      else if (matchesAny(trimmed, OPTIONAL_HEADER_PATTERNS)) inferred = "Optional";
      else if (matchesAny(trimmed, MAIN_HEADER_PATTERNS)) inferred = "Main";
      if (!inferred) continue;
      out.push({ page: p.pageNum, heading: trimmed.slice(0, 160), inferred_type: inferred });
      if (out.length >= 80) return out;
    }
  }
  return out;
}

function nearestHeadingForPage(
  page: number | null,
  headings: ScopeSegmentationLLMHeading[],
): string | null {
  if (page == null || headings.length === 0) return null;
  let best: ScopeSegmentationLLMHeading | null = null;
  for (const h of headings) {
    if (h.page == null) continue;
    if (h.page <= page && (!best || (best.page ?? 0) <= h.page)) best = h;
  }
  return best ? `[${best.inferred_type}] ${best.heading}` : null;
}

function buildDocumentContext(
  pages: { pageNum: number; text: string }[],
  rawText: string,
  totals: { main_total: number | null; optional_total: number | null },
): string {
  if (!pages || pages.length === 0) {
    return rawText.slice(0, CONTEXT_PAGE_BUDGET);
  }
  const parts: string[] = [];
  let used = 0;
  const pushPage = (p: { pageNum: number; text: string }, label: string) => {
    if (used >= CONTEXT_PAGE_BUDGET) return;
    const remaining = CONTEXT_PAGE_BUDGET - used;
    const text = (p.text ?? "").slice(0, Math.min(900, remaining));
    if (!text) return;
    parts.push(`--- ${label} (page ${p.pageNum}) ---\n${text}`);
    used += text.length + 40;
  };

  // Page 1 is always useful (cover/summary).
  pushPage(pages[0], "PAGE 1");

  // Pages mentioning totals or "summary".
  for (const p of pages.slice(1)) {
    if (used >= CONTEXT_PAGE_BUDGET) break;
    const lower = (p.text ?? "").toLowerCase();
    const totalHit =
      (totals.main_total != null && lower.includes(formatTotalToken(totals.main_total))) ||
      (totals.optional_total != null && lower.includes(formatTotalToken(totals.optional_total))) ||
      /\b(quote\s+summary|estimate\s+summary|grand\s+total)\b/i.test(p.text ?? "");
    if (totalHit) pushPage(p, "TOTALS PAGE");
  }

  // Pages with strong scope-keyword density.
  for (const p of pages) {
    if (used >= CONTEXT_PAGE_BUDGET) break;
    if (CONTEXT_KEYWORDS_RE.test(p.text ?? "")) pushPage(p, "SCOPE KEYWORDS");
  }

  return parts.join("\n\n").slice(0, CONTEXT_PAGE_BUDGET);
}

function formatTotalToken(n: number): string {
  return n.toFixed(2);
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  for (const re of patterns) if (re.test(text)) return true;
  return false;
}

// --------------------------------------------------------------------------
// Deterministic fallback (only used when LLM-primary fails)
// --------------------------------------------------------------------------

const FALLBACK_OPTIONAL_DESC_RE =
  /\b(optional|add\s+to\s+scope|not\s+shown\s+on\s+drawings|extra\s+over|TBC|alternate|upgrade)\b/i;
const FALLBACK_EXCLUDED_DESC_RE =
  /\b(by\s+others|provisional\s+only|no\s+tested\s+solution|rate\s+only|not\s+included)\b/i;

async function runDeterministicFallback(
  input: ScopeSegmentationInput,
): Promise<ScopeSegmentationResult> {
  const layers: string[] = ["fallback_keyword_initial"];
  const headings = extractHeadings(input.allPages ?? []);
  const rows: WorkingRow[] = input.extracted_items.map((item, idx) => ({
    row_id: `r${idx}`,
    index: idx,
    item,
    label: mapLabel(item.scope_category),
    confidence: typeof item.confidence === "number" ? item.confidence : 0.55,
    reason: `fallback:preserved:${item.scope_category}`,
    llmLabel: null,
    llmConfidence: 0,
  }));

  // Description-based hints for rows still labelled Main/Unknown.
  for (const r of rows) {
    const desc = r.item.description ?? "";
    if (FALLBACK_EXCLUDED_DESC_RE.test(desc)) {
      r.label = "Excluded";
      r.confidence = Math.max(r.confidence, 0.7);
      r.reason = "fallback:keyword_excluded";
    } else if (FALLBACK_OPTIONAL_DESC_RE.test(desc) && r.label !== "Excluded") {
      r.label = "Optional";
      r.confidence = Math.max(r.confidence, 0.6);
      r.reason = "fallback:keyword_optional";
    }
  }

  const sums = computeSums(rows);
  const mainTarget = input.authoritative_totals.main_total;
  const optTarget = input.authoritative_totals.optional_total;
  const matched_main = mainTarget != null ? withinTolerance(sums.main, mainTarget) : false;
  const matched_optional = optTarget != null ? withinTolerance(sums.optional, optTarget) : false;

  const items = composeOutputItems(rows);
  const counts = countLabels(rows);
  const avgConf =
    rows.length > 0 ? rows.reduce((s, r) => s + r.confidence, 0) / rows.length : 0;
  const confidence: "HIGH" | "MEDIUM" | "LOW" =
    avgConf >= 0.8 ? "HIGH" : avgConf >= 0.6 ? "MEDIUM" : "LOW";

  return {
    items,
    summary: {
      main_sum: round2(sums.main),
      optional_sum: round2(sums.optional),
      excluded_sum: round2(sums.excluded),
      unknown_sum: round2(sums.unknown),
      matched_main_total: matched_main,
      matched_optional_total: matched_optional,
      delta_main: mainTarget != null ? round2(sums.main - mainTarget) : null,
      delta_optional: optTarget != null ? round2(sums.optional - optTarget) : null,
      confidence,
      llm_used: false,
      llm_review_used: false,
      model_used: null,
      rows_sent_to_llm: 0,
      rows_classified_main: counts.Main,
      rows_classified_optional: counts.Optional,
      rows_classified_excluded: counts.Excluded,
      rows_classified_unknown: counts.Unknown,
      llm_resolved_rows: 0,
      headings_detected: headings.length,
      layers_applied: layers,
      fallback_used: "deterministic_existing",
      llm_errors: [],
      examples: rows.slice(0, 10).map((w) => ({
        row_id: w.row_id,
        description: (w.item.description ?? "").slice(0, 140),
        scope_category: w.label,
        confidence: round3(w.confidence),
        reason: w.reason,
      })),
      requires_scope_review: true,
    },
  };
}
