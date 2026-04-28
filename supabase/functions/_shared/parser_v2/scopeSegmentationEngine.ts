/**
 * Scope Segmentation Engine — Stage 10 v4 (Document-Structure Aware LLM).
 *
 * The LLM is the SOLE classifier. There is NO deterministic baseline,
 * NO rule-based fallback, NO reconciliation, NO balancing rows, and NO
 * synthetic totals patching. v4 adds richer document-structure signals
 * to the row packets so the LLM can classify by layout rather than by
 * row wording alone:
 *
 *   - table_title detection (the most recent table-header-style line
 *     above the row, distinct from broad section banners)
 *   - page continuation tracking (rows on a new page with no new
 *     heading inherit the prior section via headers_above)
 *   - subtotal-ownership awareness (subtotal lines are presented near
 *     the rows they own so the model can attribute them correctly)
 *   - multiple previous_rows[] / next_rows[] neighbours instead of a
 *     single summary blob
 *
 * Pipeline:
 *   1. Build compact row packets from extracted_items + page text.
 *   2. Send packets to the LLM (single pass ≤220 rows; otherwise
 *      chunks of 90 with 12-row overlap).
 *   3. Apply the LLM's scope to every input row. Map Main → "main",
 *      Optional → "optional", Excluded → "excluded", Metadata →
 *      "excluded" (kept out of all scope totals; flagged for audit).
 *   4. On failure, return items unmodified + summary status="failed"
 *      with structured error_type and debug_hint. No fallback.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";
import {
  classifyRowsLLMV4,
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
  main_total: number;
  optional_total: number;
  overall_confidence: "HIGH" | "MEDIUM" | "LOW";
  warnings: string[];
  error: string | null;
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
  /** Authoritative totals are NOT used by v4 (LLM is sole classifier),
   * accepted for caller compatibility only. */
  authoritative_totals: {
    main_total: number | null;
    optional_total: number | null;
  };
  openAIKey?: string;
};

const RESET_HEADING_RE =
  /\b(BLOCK|LOT|LEVEL|UNIT|BUILDING|AREA|SECTION)\b\s*[:#-]?\s*[A-Za-z0-9][\w.-]*/i;

const HEADING_LINE_MAX_LEN = 160;
const ROW_NEIGHBOUR_MAX_LEN = 80;
const HEADERS_ABOVE_MAX = 5;
const PREV_ROWS_MAX = 3;
const NEXT_ROWS_MAX = 3;

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

  const totalsByRow = new Map<number, number | null>();
  for (let i = 0; i < items.length; i++) {
    totalsByRow.set(i, items[i].total_price ?? null);
  }

  const llm: LLMClassifyResult = await classifyRowsLLMV4({
    openAIKey: input.openAIKey ?? "",
    supplier: input.supplier,
    trade: input.trade,
    quote_type: input.quote_type,
    page_count: input.allPages?.length ?? 0,
    rows: packets,
    totals_by_row: totalsByRow,
  });

  if (llm.status === "failed") {
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
        main_total: 0,
        optional_total: 0,
        overall_confidence: "LOW",
        warnings: llm.warnings,
        error: llm.error,
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
      scope_section_id: llmRow.detected_section || null,
      scope_group_id: null,
      scope_heading_basis: llmRow.basis,
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
      main_total: llm.summary.main_total,
      optional_total: llm.summary.optional_total,
      overall_confidence: llm.summary.overall_confidence,
      warnings: llm.warnings,
      error: null,
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
  is_table_title: boolean;
  is_subtotal: boolean;
};

function buildRowPackets(
  items: ParsedLineItemV2[],
  pages: { pageNum: number; text: string }[],
): ScopeRowPacket[] {
  const headings = extractAllHeadings(pages);
  const pageTitles = new Map<number, string | null>();
  for (const p of pages) pageTitles.set(p.pageNum, firstNonBlankLine(p.text));

  const itemsWithMeta = items.map((it, i) => ({
    item: it,
    row_index: i,
    page: it.source_page ?? null,
    description: (it.description ?? "").trim(),
  }));

  // Track page transitions so we can carry the prior section via
  // headers_above when the new page has no fresh heading at the top.
  const pageSequence = collectPageSequence(itemsWithMeta);

  const packets: ScopeRowPacket[] = itemsWithMeta.map((m, idx) => {
    const headersAbove = pickHeadersAbove(
      m.page,
      headings,
      HEADERS_ABOVE_MAX,
      pageSequence,
    );
    const tableTitle = pickTableTitle(m.page, headings);
    const prevRows = collectNeighbourRows(itemsWithMeta, idx, -1, PREV_ROWS_MAX);
    const nextRows = collectNeighbourRows(itemsWithMeta, idx, 1, NEXT_ROWS_MAX);
    return {
      row_index: m.row_index,
      page: m.page,
      description: truncate(m.description, 200),
      qty: m.item.quantity ?? null,
      unit_price: m.item.unit_price ?? null,
      total_price: m.item.total_price ?? null,
      headers_above: headersAbove,
      page_title: m.page != null ? pageTitles.get(m.page) ?? null : null,
      table_title: tableTitle,
      previous_rows: prevRows,
      next_rows: nextRows,
    };
  });

  return packets;
}

function collectPageSequence(
  itemsWithMeta: { page: number | null }[],
): number[] {
  const seq: number[] = [];
  for (const m of itemsWithMeta) {
    const p = m.page;
    if (p == null) continue;
    if (seq.length === 0 || seq[seq.length - 1] !== p) seq.push(p);
  }
  return seq;
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
        is_table_title: looksLikeTableTitle(raw),
        is_subtotal: looksLikeSubtotal(raw),
      });
    }
  }
  return out;
}

function looksLikeHeading(line: string): boolean {
  if (/\$\s*\d/.test(line) && !looksLikeSubtotal(line)) return false;
  if (/^\s*\d[\d,]*\.\d{2}\s*$/.test(line)) return false;
  if (RESET_HEADING_RE.test(line)) return true;
  if (
    /\b(optional|excluded|exclusions?|inclusions?|scope|summary|breakdown|estimate|tender|subtotal|sub[-\s]?total|grand\s+total|total\s+ex|by\s+others|not\s+included|alternates?|extras?|tbc|confirmation|drawings?|schedule|provisional|allowance|nic|by\s+main|by\s+client|reference\s+only|rate\s+only|add\s+to\s+scope|items\s+with\s+confirmation|carried\s+forward)\b/i
      .test(line)
  ) return true;
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 5) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length >= 0.8) return true;
  }
  if (/:\s*$/.test(line) && line.length <= 80) return true;
  return false;
}

function looksLikeTableTitle(line: string): boolean {
  // Table titles tend to be short, named "X Schedule", "X Pricing",
  // "X Items", "X Estimate", or end with "Schedule"/"Pricing"/"Items".
  if (line.length > 90) return false;
  return /\b(schedule|pricing|items|estimate|breakdown|summary|allowance|provisional|optional|exclusions?)\b/i
    .test(line);
}

function looksLikeSubtotal(line: string): boolean {
  return /\b(sub\s*total|subtotal|section\s+total|block\s+total|building\s+total|page\s+total|grand\s+total|tender\s+total|total\s+ex|optional\s+total|estimate\s+subtotal|carried\s+forward)\b/i
    .test(line);
}

function pickHeadersAbove(
  page: number | null,
  headings: PageHeading[],
  max: number,
  pageSequence: number[],
): string[] {
  if (page == null) return [];
  // We want headings on or before this page, biased toward the most
  // recent reset and the nearest table title. To support continuation,
  // also include headings from the immediately previous page if this
  // page has no heading of its own.
  const onOrBefore = headings.filter((h) => h.page <= page);
  const onThisPage = headings.filter((h) => h.page === page);

  // Prefer the trailing window so the LLM sees the closest signals.
  const collected: string[] = [];
  const pushUnique = (text: string) => {
    if (!collected.includes(text)) collected.push(text);
  };

  // Most recent reset on or before this page (high signal).
  const lastReset = [...onOrBefore].reverse().find((h) => h.is_reset);
  if (lastReset) pushUnique(`[reset] ${lastReset.text}`);

  // Most recent table title on or before this page.
  const lastTable = [...onOrBefore].reverse().find((h) => h.is_table_title);
  if (lastTable) pushUnique(`[table] ${lastTable.text}`);

  // Most recent subtotal — anchors ownership boundary above.
  const lastSubtotal = [...onOrBefore].reverse().find((h) => h.is_subtotal);
  if (lastSubtotal) pushUnique(`[subtotal] ${lastSubtotal.text}`);

  // If this page has no heading of its own, mark continuation from prior page.
  if (onThisPage.length === 0 && pageSequence.length > 0) {
    const idx = pageSequence.indexOf(page);
    if (idx > 0) {
      const prevPage = pageSequence[idx - 1];
      const prevPageHeadings = headings
        .filter((h) => h.page === prevPage)
        .slice(-2);
      for (const h of prevPageHeadings) pushUnique(`[carryover p${prevPage}] ${h.text}`);
    }
  }

  // Fill remaining slots with the nearest plain headings.
  const tailPlain = onOrBefore
    .filter((h) => !h.is_reset && !h.is_table_title && !h.is_subtotal)
    .slice(-max);
  for (const h of tailPlain) pushUnique(h.text);

  return collected.slice(0, max);
}

function pickTableTitle(
  page: number | null,
  headings: PageHeading[],
): string | null {
  if (page == null) return null;
  // Most recent table-title heading on or before this page.
  const onOrBefore = headings.filter((h) => h.page <= page && h.is_table_title);
  if (onOrBefore.length === 0) return null;
  return onOrBefore[onOrBefore.length - 1].text;
}

function collectNeighbourRows(
  itemsWithMeta: { item: ParsedLineItemV2 }[],
  idx: number,
  direction: 1 | -1,
  max: number,
): string[] {
  const out: string[] = [];
  let cursor = idx + direction;
  while (
    cursor >= 0 &&
    cursor < itemsWithMeta.length &&
    out.length < max
  ) {
    out.push(summariseRow(itemsWithMeta[cursor].item));
    cursor += direction;
  }
  return direction === -1 ? out.reverse() : out;
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
  const desc = (it.description ?? "").trim().slice(0, ROW_NEIGHBOUR_MAX_LEN);
  const total = it.total_price ?? 0;
  return `${desc} | ${total}`.slice(0, ROW_NEIGHBOUR_MAX_LEN);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function mapToDownstream(scope: LLMScope): ParsedLineItemV2["scope_category"] {
  if (scope === "Main") return "main";
  if (scope === "Optional") return "optional";
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
    main_total: 0,
    optional_total: 0,
    overall_confidence: "HIGH",
    warnings: [hint],
    error: null,
    error_type: null,
    debug_hint: hint,
    chunks_used: 0,
    rows_sent: 0,
    requires_scope_review: false,
  };
}

export const SCOPE_SEGMENTATION_LLM_BUDGET_MS = STAGE_BUDGET_MS;
export { SCOPE_SEGMENTATION_MODEL };
