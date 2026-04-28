/**
 * Scope Segmentation Engine — Parser V2 Stage 10 (deterministic-first, LLM-assist).
 *
 * Hardened against parser_v2 outer-timeout regressions: the deterministic
 * classifier always produces the baseline result. The LLM is invoked ONLY on
 * ambiguous rows under a single 8s wall-clock budget. If the LLM does not
 * complete within that window, the deterministic result is preserved in full.
 *
 * Pipeline:
 *   1. Deterministic baseline classification on all rows.
 *   2. Identify ambiguous rows (Unknown, low confidence, or
 *      mismatched-anchor heuristics).
 *   3. If openAI key present and ambiguous rows > 0, call LLM with an 8s
 *      wall-clock deadline on those rows only.
 *   4. Replace ambiguous rows whose LLM confidence >= 0.70.
 *   5. Apply Excluded keyword override at conf >= 0.80.
 *   6. Reconcile sums to authoritative totals (1.5% tolerance) and report.
 *
 * Public types (`ScopeSegmentationItem`, `ScopeSegmentationResult`,
 * `ScopeSegmentationInput`) are stable — downstream is unchanged.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";
import {
  classifyRowsLLM,
  PER_REQUEST_BUDGET_MS,
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
  llm_timed_out: boolean;
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
const OVERWRITE_THRESHOLD = 0.7;
const EXCLUDED_OVERRIDE_THRESHOLD = 0.8;
const CONTEXT_PAGE_BUDGET = 3000;
/** Wall-clock cap for the entire LLM-assist step. */
const LLM_STAGE_BUDGET_MS = 8_000;
/** Rows considered "ambiguous" enough to send to the LLM. */
const AMBIGUOUS_CONFIDENCE_THRESHOLD = 0.7;
/** Hard cap on rows we will hand to the LLM in this stage. */
const MAX_AMBIGUOUS_ROWS_FOR_LLM = 80;

const EXCLUDED_OVERRIDE_RE =
  /\b(by\s+others|no\s+allowance|excluded|not\s+included|rate\s+only)\b/i;

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

const DETERMINISTIC_OPTIONAL_DESC_RE =
  /\b(optional|add\s+to\s+scope|not\s+shown\s+on\s+drawings|extra\s+over|TBC|alternate|upgrade)\b/i;
const DETERMINISTIC_EXCLUDED_DESC_RE =
  /\b(by\s+others|provisional\s+only|no\s+tested\s+solution|rate\s+only|not\s+included)\b/i;

// --------------------------------------------------------------------------
// Public entry point
// --------------------------------------------------------------------------

export async function runScopeSegmentationEngine(
  input: ScopeSegmentationInput,
): Promise<ScopeSegmentationResult> {
  const layers: string[] = [];
  const headings = extractHeadings(input.allPages ?? []);

  // Step 1 — deterministic baseline (always runs; no LLM).
  const working = buildDeterministicBaseline(input.extracted_items, headings);
  layers.push("deterministic_baseline");

  // Step 2 — pick ambiguous rows for an LLM-assist pass.
  const ambiguous = pickAmbiguousRows(working).slice(0, MAX_AMBIGUOUS_ROWS_FOR_LLM);

  let llmUsed = false;
  let llmTimedOut = false;
  let resolvedByLLM = 0;
  const llmErrors: string[] = [];

  if (ambiguous.length > 0 && input.openAIKey) {
    const importantContext = buildDocumentContext(
      input.allPages ?? [],
      input.rawText,
      input.authoritative_totals,
    );
    const llmRows: ScopeSegmentationLLMRow[] = ambiguous.map((w) =>
      llmRowFor(w, headings),
    );
    try {
      const deadlineEpochMs = Date.now() + LLM_STAGE_BUDGET_MS;
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
        rows: llmRows,
        deadlineEpochMs,
      });
      llmUsed = result.items.length > 0;
      llmTimedOut = result.timedOut;
      llmErrors.push(...result.errors);
      if (result.items.length > 0) {
        const byId = new Map(result.items.map((it) => [it.row_id, it] as const));
        for (const w of working) {
          const upd = byId.get(w.row_id);
          if (!upd) continue;
          if (applyLLMResult(w, upd)) resolvedByLLM++;
        }
        layers.push("llm_assist_applied");
      } else {
        layers.push(llmTimedOut ? "llm_assist_timed_out" : "llm_assist_no_items");
      }
    } catch (err) {
      llmErrors.push(`unexpected:${(err as Error)?.message ?? String(err)}`.slice(0, 200));
      layers.push("llm_assist_error");
    }
  } else if (ambiguous.length === 0) {
    layers.push("llm_assist_skipped_no_ambiguous");
  } else {
    layers.push("llm_assist_skipped_no_key");
  }

  // Step 3 — Excluded keyword override.
  let excludedOverrides = 0;
  for (const w of working) {
    if (
      EXCLUDED_OVERRIDE_RE.test(w.item.description ?? "") &&
      w.confidence >= EXCLUDED_OVERRIDE_THRESHOLD &&
      w.label !== "Excluded"
    ) {
      w.label = "Excluded";
      w.reason = `keyword_override:excluded:${w.reason}`.slice(0, 200);
      excludedOverrides++;
    }
  }
  if (excludedOverrides > 0) layers.push("excluded_keyword_override");

  // Step 4 — totals reconciliation.
  const sums = computeSums(working);
  const mainTarget = input.authoritative_totals.main_total;
  const optTarget = input.authoritative_totals.optional_total;
  const matched_main =
    mainTarget != null ? withinTolerance(sums.main, mainTarget) : false;
  const matched_optional =
    optTarget != null ? withinTolerance(sums.optional, optTarget) : false;
  const delta_main = mainTarget != null ? round2(sums.main - mainTarget) : null;
  const delta_optional = optTarget != null ? round2(sums.optional - optTarget) : null;

  // Confidence rollup.
  const avgConfidence =
    working.length > 0 ? working.reduce((s, w) => s + w.confidence, 0) / working.length : 0;
  let confidence: "HIGH" | "MEDIUM" | "LOW";
  if (
    (matched_main || mainTarget == null) &&
    (matched_optional || optTarget == null) &&
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
      main_sum: round2(sums.main),
      optional_sum: round2(sums.optional),
      excluded_sum: round2(sums.excluded),
      unknown_sum: round2(sums.unknown),
      matched_main_total: matched_main,
      matched_optional_total: matched_optional,
      delta_main,
      delta_optional,
      confidence,
      llm_used: llmUsed,
      llm_review_used: false,
      llm_timed_out: llmTimedOut,
      model_used: llmUsed ? SCOPE_SEGMENTATION_MODEL : null,
      rows_sent_to_llm: ambiguous.length,
      rows_classified_main: counts.Main,
      rows_classified_optional: counts.Optional,
      rows_classified_excluded: counts.Excluded,
      rows_classified_unknown: counts.Unknown,
      llm_resolved_rows: resolvedByLLM,
      headings_detected: headings.length,
      layers_applied: layers,
      fallback_used: llmTimedOut || llmErrors.length > 0 ? "deterministic_baseline_preserved" : null,
      llm_errors: llmErrors,
      examples,
      requires_scope_review:
        confidence === "LOW" ||
        (!matched_main && mainTarget != null) ||
        (!matched_optional && optTarget != null) ||
        counts.Unknown > 0,
    },
  };
}

// --------------------------------------------------------------------------
// Deterministic baseline + ambiguity selection
// --------------------------------------------------------------------------

type WorkingRow = {
  row_id: string;
  index: number;
  item: ParsedLineItemV2;
  label: ScopeLabel;
  confidence: number;
  reason: string;
  source: "preserved" | "keyword_excluded" | "keyword_optional";
};

function buildDeterministicBaseline(
  extracted: ParsedLineItemV2[],
  _headings: ScopeSegmentationLLMHeading[],
): WorkingRow[] {
  const out: WorkingRow[] = [];
  for (let i = 0; i < extracted.length; i++) {
    const item = extracted[i];
    let label: ScopeLabel = mapLabel(item.scope_category);
    let confidence =
      typeof item.confidence === "number" && item.confidence > 0 ? item.confidence : 0.55;
    let reason = `preserved:${String(item.scope_category ?? "main")}`;
    let source: WorkingRow["source"] = "preserved";

    const desc = item.description ?? "";
    if (DETERMINISTIC_EXCLUDED_DESC_RE.test(desc)) {
      label = "Excluded";
      confidence = Math.max(confidence, 0.7);
      reason = "deterministic:keyword_excluded";
      source = "keyword_excluded";
    } else if (DETERMINISTIC_OPTIONAL_DESC_RE.test(desc) && label !== "Excluded") {
      label = "Optional";
      confidence = Math.max(confidence, 0.6);
      reason = "deterministic:keyword_optional";
      source = "keyword_optional";
    }

    out.push({
      row_id: `r${i}`,
      index: i,
      item,
      label,
      confidence,
      reason,
      source,
    });
  }
  return out;
}

function pickAmbiguousRows(rows: WorkingRow[]): WorkingRow[] {
  return rows.filter(
    (w) => w.label === "Unknown" || w.confidence < AMBIGUOUS_CONFIDENCE_THRESHOLD,
  );
}

function applyLLMResult(target: WorkingRow, llm: LLMItemResult): boolean {
  const newLabel = mapLabel(llm.scope_category);
  if (llm.confidence < OVERWRITE_THRESHOLD) {
    // Record the LLM hint for audit but do not change deterministic label.
    target.reason =
      `${target.reason}|llm_low_conf:${newLabel}:${(llm.reason ?? "").slice(0, 80)}`.slice(0, 200);
    return false;
  }
  if (newLabel === target.label) {
    target.confidence = Math.max(target.confidence, llm.confidence);
    target.reason = `llm_confirms:${(llm.reason ?? "").slice(0, 120)}`;
    return false;
  }
  target.label = newLabel;
  target.confidence = llm.confidence;
  target.reason = `llm_overwrite:${(llm.reason ?? "").slice(0, 140)}`;
  return true;
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
    const text = (p.text ?? "").slice(0, Math.min(700, remaining));
    if (!text) return;
    parts.push(`--- ${label} (page ${p.pageNum}) ---\n${text}`);
    used += text.length + 40;
  };

  pushPage(pages[0], "PAGE 1");

  for (const p of pages.slice(1)) {
    if (used >= CONTEXT_PAGE_BUDGET) break;
    const lower = (p.text ?? "").toLowerCase();
    const totalHit =
      (totals.main_total != null && lower.includes(formatTotalToken(totals.main_total))) ||
      (totals.optional_total != null && lower.includes(formatTotalToken(totals.optional_total))) ||
      /\b(quote\s+summary|estimate\s+summary|grand\s+total)\b/i.test(p.text ?? "");
    if (totalHit) pushPage(p, "TOTALS PAGE");
  }

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

// Stage 10 budget exposed for diagnostics/tests.
export const SCOPE_SEGMENTATION_LLM_BUDGET_MS = LLM_STAGE_BUDGET_MS;
export const SCOPE_SEGMENTATION_PER_REQUEST_MS = PER_REQUEST_BUDGET_MS;
