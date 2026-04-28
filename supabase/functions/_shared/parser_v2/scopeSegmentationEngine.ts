/**
 * Scope Segmentation Engine — Stage 10 v3 (LLM Native).
 *
 * The LLM is the SOLE classifier. There is NO deterministic baseline,
 * NO rule-based fallback, NO reconciliation, NO balancing rows, and NO
 * synthetic totals patching. If the LLM fails, the failure is surfaced
 * to the caller via the result summary; the caller decides what to do.
 *
 * Pipeline:
 *   1. Build compact row packets from extracted_items + page text.
 *      Each packet carries headers_above / headers_below / page_title /
 *      previous_row_summary / next_row_summary so the model can anchor
 *      classification on local context (BLOCK / LOT / LEVEL / UNIT /
 *      BUILDING / AREA / SECTION resets).
 *   2. Send packets to the LLM (single pass ≤220 rows, otherwise chunks
 *      of 90 rows with 12-row overlap).
 *   3. Apply the LLM's scope to every input row. Map Main → "main",
 *      Optional → "optional", Excluded → "excluded", Metadata →
 *      "excluded" (kept out of all scope totals; flagged for audit).
 *   4. On failure, return items unmodified + summary status="failed"
 *      with structured error_type and debug_hint. No fallback.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";
import {
  classifyRowsLLMV3,
  SCOPE_SEGMENTATION_MODEL,
  STAGE10_VERSION,
  STAGE_BUDGET_MS,
  type LLMClassifyResult,
  type LLMRowResult,
  type LLMScope,
} from "./scopeSegmentationLLM.ts";
import type { ScopeRowPacket } from "./scopeSegmentationPrompt.ts";

// --------------------------------------------------------------------------
// Public types — kept stable for runParserV2 caller.
// --------------------------------------------------------------------------

export type ScopeLabel = "Main" | "Optional" | "Excluded" | "Metadata" | "Unknown";

export type ScopeSegmentationItem = ParsedLineItemV2 & {
  scope_segmentation_label?: ScopeLabel;
  scope_confidence?: number;
  scope_reason?: string;
  scope_section_id?: string | null;
  scope_group_id?: string | null;
  scope_heading_basis?: string | null;
};

export type ScopeSegmentationSummary = {
  stage10_version: string;
  status: "ok" | "failed";
  runtime_ms: number;
  model_used: string | null;
  rows_classified_main: number;
  rows_classified_optional: number;
  rows_classified_excluded: number;
  rows_classified_metadata: number;
  rows_classified_unknown: number;
  block_resets_seen: number;
  overall_confidence: "HIGH" | "MEDIUM" | "LOW";
  warnings: string[];
  error_type: string | null;
  debug_hint: string | null;
  chunks_used: number;
  rows_sent: number;
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
  /** Authoritative totals are NOT used by v3 (LLM is sole classifier),
   * accepted for caller compatibility only. */
  authoritative_totals: {
    main_total: number | null;
    optional_total: number | null;
  };
  openAIKey?: string;
};

// Headings that trigger context reset.
const RESET_HEADING_RE =
  /\b(BLOCK|LOT|LEVEL|UNIT|BUILDING|AREA|SECTION)\b\s*[:#-]?\s*[A-Za-z0-9][\w.-]*/i;

const HEADING_LINE_MAX_LEN = 160;
const ROW_SUMMARY_MAX_LEN = 80;
const HEADERS_ABOVE_MAX = 4;
const HEADERS_BELOW_MAX = 2;

// --------------------------------------------------------------------------
// Public entry
// --------------------------------------------------------------------------

export async function runScopeSegmentationEngine(
  input: ScopeSegmentationInput,
): Promise<ScopeSegmentationResult> {
  const start = Date.now();
  const items = input.extracted_items;

  if (items.length === 0) {
    return {
      items: [],
      summary: emptySummary(Date.now() - start, "no_items"),
    };
  }

  const packets = buildRowPackets(items, input.allPages ?? []);
  const llm: LLMClassifyResult = await classifyRowsLLMV3({
    openAIKey: input.openAIKey ?? "",
    supplier: input.supplier,
    trade: input.trade,
    quote_type: input.quote_type,
    page_count: input.allPages?.length ?? 0,
    rows: packets,
  });

  if (llm.status === "failed") {
    // Fail loud: return items unmodified, surface error_type + debug_hint.
    const passthrough = items.map((it, i) => ({
      ...it,
      scope_segmentation_label: "Unknown" as ScopeLabel,
      scope_confidence: 0,
      scope_reason: `stage10_failed:${llm.error_type}:${llm.debug_hint}`.slice(0, 200),
      scope_section_id: null,
      scope_group_id: null,
      scope_heading_basis: null,
      _row_index: i,
    })) as ScopeSegmentationItem[];
    return {
      items: passthrough,
      summary: {
        stage10_version: STAGE10_VERSION,
        status: "failed",
        runtime_ms: llm.runtime_ms,
        model_used: SCOPE_SEGMENTATION_MODEL,
        rows_classified_main: 0,
        rows_classified_optional: 0,
        rows_classified_excluded: 0,
        rows_classified_metadata: 0,
        rows_classified_unknown: items.length,
        block_resets_seen: 0,
        overall_confidence: "LOW",
        warnings: llm.warnings,
        error_type: llm.error_type,
        debug_hint: llm.debug_hint,
        chunks_used: llm.chunks_attempted,
        rows_sent: llm.rows_sent,
        requires_scope_review: true,
      },
    };
  }

  // Apply LLM classifications to items.
  const byIndex = new Map<number, LLMRowResult>();
  for (const r of llm.rows) byIndex.set(r.row_index, r);

  let unknownCount = 0;
  const out: ScopeSegmentationItem[] = items.map((it, i) => {
    const llmRow = byIndex.get(i);
    if (!llmRow) {
      unknownCount++;
      return {
        ...it,
        scope_segmentation_label: "Unknown" as ScopeLabel,
        scope_confidence: 0,
        scope_reason: "stage10:row_missing_from_llm_output",
        scope_section_id: null,
        scope_group_id: null,
        scope_heading_basis: null,
      };
    }
    const downstream = mapToDownstream(llmRow.scope);
    return {
      ...it,
      scope_category: downstream,
      scope_segmentation_label: llmRow.scope as ScopeLabel,
      scope_confidence: llmRow.confidence,
      scope_reason: llmRow.rationale_short,
      scope_section_id: llmRow.section_id,
      scope_group_id: llmRow.group_id,
      scope_heading_basis: llmRow.heading_basis,
    };
  });

  return {
    items: out,
    summary: {
      stage10_version: STAGE10_VERSION,
      status: "ok",
      runtime_ms: llm.runtime_ms,
      model_used: SCOPE_SEGMENTATION_MODEL,
      rows_classified_main: llm.summary.main_count,
      rows_classified_optional: llm.summary.optional_count,
      rows_classified_excluded: llm.summary.excluded_count,
      rows_classified_metadata: llm.summary.metadata_count,
      rows_classified_unknown: unknownCount,
      block_resets_seen: llm.summary.block_resets_seen,
      overall_confidence: llm.summary.overall_confidence,
      warnings: llm.warnings,
      error_type: null,
      debug_hint: null,
      chunks_used: llm.chunks_used,
      rows_sent: llm.rows_sent,
      requires_scope_review:
        llm.summary.overall_confidence === "LOW" || unknownCount > 0,
    },
  };
}

// --------------------------------------------------------------------------
// Row packet construction
// --------------------------------------------------------------------------

type PageHeading = {
  page: number;
  line_index: number;
  text: string;
  is_reset: boolean;
};

function buildRowPackets(
  items: ParsedLineItemV2[],
  pages: { pageNum: number; text: string }[],
): ScopeRowPacket[] {
  const headings = extractAllHeadings(pages);
  const pageTitles = new Map<number, string | null>();
  for (const p of pages) pageTitles.set(p.pageNum, firstNonBlankLine(p.text));

  // Each item gets a virtual ordering by source_page + array order.
  const itemsWithMeta = items.map((it, i) => ({
    item: it,
    row_index: i,
    page: it.source_page ?? null,
    description: (it.description ?? "").trim(),
  }));

  // Compute per-item local position on its page (1-based ordering of items
  // sharing the same page).
  const localPosByPage = new Map<number, number>();
  const localPositions: (number | null)[] = itemsWithMeta.map((m) => {
    if (m.page == null) return null;
    const cur = (localPosByPage.get(m.page) ?? 0) + 1;
    localPosByPage.set(m.page, cur);
    return cur;
  });

  const packets: ScopeRowPacket[] = itemsWithMeta.map((m, idx) => {
    const headersAbove = pickHeadersAbove(m.page, headings, HEADERS_ABOVE_MAX);
    const headersBelow = pickHeadersBelow(m.page, headings, HEADERS_BELOW_MAX);
    const prevSummary =
      idx > 0 ? summariseRow(itemsWithMeta[idx - 1].item) : null;
    const nextSummary =
      idx < itemsWithMeta.length - 1
        ? summariseRow(itemsWithMeta[idx + 1].item)
        : null;
    const total = m.item.total_price ?? null;
    return {
      row_index: m.row_index,
      page: m.page,
      local_position: localPositions[idx],
      description: truncate(m.description, 200),
      qty: m.item.quantity ?? null,
      unit: m.item.unit ?? null,
      unit_price: m.item.unit_price ?? null,
      total_price: total,
      zero_value_flag: total === 0 || total == null,
      headers_above: headersAbove,
      headers_below: headersBelow,
      page_title: m.page != null ? pageTitles.get(m.page) ?? null : null,
      previous_row_summary: prevSummary,
      next_row_summary: nextSummary,
    };
  });

  return packets;
}

function extractAllHeadings(
  pages: { pageNum: number; text: string }[],
): PageHeading[] {
  const out: PageHeading[] = [];
  for (const p of pages) {
    const lines = (p.text ?? "").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      if (raw.length > HEADING_LINE_MAX_LEN) continue;
      if (!looksLikeHeading(raw)) continue;
      out.push({
        page: p.pageNum,
        line_index: i,
        text: raw.slice(0, HEADING_LINE_MAX_LEN),
        is_reset: RESET_HEADING_RE.test(raw),
      });
    }
  }
  return out;
}

function looksLikeHeading(line: string): boolean {
  // Heading-ish heuristic: short line, not a price/numeric line, contains
  // either a reset marker, a known scope marker, or is mostly uppercase /
  // ends with colon.
  if (/\$\s*\d/.test(line)) return false;
  if (/^\s*\d[\d,]*\.\d{2}\s*$/.test(line)) return false;
  if (RESET_HEADING_RE.test(line)) return true;
  if (
    /\b(optional|excluded|exclusions?|inclusions?|scope|summary|breakdown|estimate|tender|subtotal|sub[-\s]?total|grand\s+total|total\s+ex|by\s+others|not\s+included|alternates?|extras?|tbc|confirmation|drawings?|schedule)\b/i
      .test(line)
  ) return true;
  // Mostly uppercase short line (5+ chars) → likely a heading.
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 5) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length >= 0.8) return true;
  }
  if (/:\s*$/.test(line) && line.length <= 80) return true;
  return false;
}

function pickHeadersAbove(
  page: number | null,
  headings: PageHeading[],
  max: number,
): string[] {
  if (page == null) return [];
  const candidates = headings
    .filter((h) => h.page <= page)
    .slice(-max * 3); // last few headings before page
  // We want the closest N headings on or before this page, including the
  // most recent reset (BLOCK XX, etc.) since classification depends on it.
  const tail = candidates.slice(-max);
  return tail.map((h) => h.text);
}

function pickHeadersBelow(
  page: number | null,
  headings: PageHeading[],
  max: number,
): string[] {
  if (page == null) return [];
  const after = headings.filter((h) => h.page > page);
  return after.slice(0, max).map((h) => h.text);
}

function firstNonBlankLine(text: string): string | null {
  if (!text) return null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t) return t.slice(0, HEADING_LINE_MAX_LEN);
  }
  return null;
}

function summariseRow(it: ParsedLineItemV2): string {
  const desc = (it.description ?? "").trim().slice(0, ROW_SUMMARY_MAX_LEN);
  const total = it.total_price ?? 0;
  return `${desc} | ${total}`.slice(0, ROW_SUMMARY_MAX_LEN);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function mapToDownstream(scope: LLMScope): ParsedLineItemV2["scope_category"] {
  if (scope === "Main") return "main";
  if (scope === "Optional") return "optional";
  // Excluded and Metadata both map to "excluded" downstream so they are
  // kept out of main/optional totals. The original LLM scope is preserved
  // in scope_segmentation_label for audit.
  return "excluded";
}

function emptySummary(runtime_ms: number, hint: string): ScopeSegmentationSummary {
  return {
    stage10_version: STAGE10_VERSION,
    status: "ok",
    runtime_ms,
    model_used: null,
    rows_classified_main: 0,
    rows_classified_optional: 0,
    rows_classified_excluded: 0,
    rows_classified_metadata: 0,
    rows_classified_unknown: 0,
    block_resets_seen: 0,
    overall_confidence: "HIGH",
    warnings: [hint],
    error_type: null,
    debug_hint: hint,
    chunks_used: 0,
    rows_sent: 0,
    requires_scope_review: false,
  };
}

// Diagnostics exports — referenced by tests / monitoring.
export const SCOPE_SEGMENTATION_LLM_BUDGET_MS = STAGE_BUDGET_MS;
export { SCOPE_SEGMENTATION_MODEL };
