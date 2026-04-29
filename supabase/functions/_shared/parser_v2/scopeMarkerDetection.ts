/**
 * Stage 10 v11 — Sequential Heading Scope Classifier (2026-04-29).
 *
 * Algorithm (exactly as specified):
 *
 *   1. Concatenate every page of the document in reading order.
 *   2. Scan that text top-to-bottom for HEADING lines. A heading is a
 *      page-header line or an in-table banner line that matches one of
 *      the known phrases. Each heading carries a type: Optional or Main.
 *   3. Walk the document linearly. Everything from an Optional heading
 *      onwards is Optional, until the NEXT heading is encountered.
 *      That next heading is evaluated and applied in turn (Optional
 *      keeps Optional, Main flips back to Main).
 *   4. Items whose position precedes the first heading default to Main.
 *   5. Excluded is a separate dimension handled only at the row level
 *      via explicit "by others" / "not included" / "excluded" text.
 *
 * Deterministic. No material-name heuristics. No row-description
 * optional matching. Only page- and in-table headings drive the scope.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";

export const SCOPE_MARKER_DETECTION_VERSION =
  "v11-sequential-headings-2026-04-29";
console.log(
  `[scopeMarkerDetection] MODULE_LOAD version=${SCOPE_MARKER_DETECTION_VERSION}`,
);

export type ScopeMarkerLabel = "main" | "optional" | "excluded";

export type ScopeMarkerSource =
  | "row_description_excluded"
  | "heading_optional"
  | "heading_main"
  | "default_main";

export type ScopeMarkerItem = ParsedLineItemV2 & {
  scope_marker_label?: ScopeMarkerLabel;
  scope_marker_source?: ScopeMarkerSource;
  scope_marker_evidence?: string | null;
};

export type ScopeMarkerSummary = {
  version: string;
  main_count: number;
  optional_count: number;
  excluded_count: number;
  main_total: number;
  optional_total: number;
  excluded_total: number;
  source_counts: Record<ScopeMarkerSource, number>;
  heading_events: { offset: number; type: "optional" | "main"; text: string }[];
  runtime_ms: number;
};

export type ScopeMarkerResult = {
  items: ScopeMarkerItem[];
  summary: ScopeMarkerSummary;
};

export type ScopeMarkerInput = {
  items: ParsedLineItemV2[];
  rawText?: string;
  pages?: { pageNum: number; text: string }[];
};

// --------------------------------------------------------------------------
// Heading vocabulary. Case-insensitive.
// --------------------------------------------------------------------------

const OPTIONAL_HEADING_PATTERNS: RegExp[] = [
  /optional\s+scope/i,
  /optional\s+extras?/i,
  /items?\s+with\s+confirmation/i,
  /not\s+shown\s+on\s+drawings?/i,
  /optional\s+items?/i,
];

const MAIN_HEADING_PATTERNS: RegExp[] = [
  /items?\s+identified\s+on\s+drawings?/i,
  /passive\s+fire\s+schedule/i,
  /fire\s+rated\s+penetrations?/i,
  /^\s*block\s+[a-z0-9]+\s*$/i,
  /main\s+scope/i,
];

const EXCLUDED_ROW_MARKERS: RegExp[] = [
  /\bby\s+others\b/i,
  /\bby\s+main\s+contractor\b/i,
  /\bby\s+client\b/i,
  /\bexcluded\s+items?\b/i,
  /\bexclusions?\b/i,
  /\b(?:^|[^a-z])excluded(?:[^a-z]|$)/i,
  /\bnic\b/i,
  /\bno\s+allowance\b/i,
  /\bnot\s+included\b/i,
];

type HeadingEvent = {
  offset: number;
  type: "optional" | "main";
  text: string;
};

// --------------------------------------------------------------------------
// Public entry
// --------------------------------------------------------------------------

export function runScopeMarkerDetection(
  input: ScopeMarkerInput,
): ScopeMarkerResult {
  const start = Date.now();
  const { items, pages, rawText } = input;

  if (items.length === 0) {
    return { items: [], summary: emptySummary(Date.now() - start) };
  }

  // Build one linear document string, tracking page boundaries.
  const { flat, pageStarts } = buildFlatDocument(pages ?? [], rawText ?? "");

  // Extract all heading events in reading order.
  const headings = extractHeadings(flat);

  const sourceCounts: Record<ScopeMarkerSource, number> = {
    row_description_excluded: 0,
    heading_optional: 0,
    heading_main: 0,
    default_main: 0,
  };

  // Walk items in order, resolving each to a document offset and then
  // picking up the state from the most recent heading at or before that
  // offset.
  let searchCursor = 0;
  let carriedState: "main" | "optional" = "main";

  const out: ScopeMarkerItem[] = items.map((it) => {
    const desc = (it.description ?? "").trim();
    const subScope = (it.sub_scope ?? "").trim();
    const haystack = `${desc} ${subScope}`;

    // Excluded is independent of headings.
    const excMatch = matchMarker(haystack, EXCLUDED_ROW_MARKERS);
    if (excMatch) {
      sourceCounts.row_description_excluded++;
      return {
        ...it,
        scope_category: "excluded" as const,
        scope_marker_label: "excluded" as const,
        scope_marker_source: "row_description_excluded" as const,
        scope_marker_evidence: excMatch,
      };
    }

    const offset = locateItemOffset(
      it,
      flat,
      pageStarts,
      desc,
      searchCursor,
    );

    let state = carriedState;
    let evidence: string | null = null;

    if (offset >= 0) {
      searchCursor = offset + Math.max(desc.length, 1);
      const h = mostRecentHeading(headings, offset);
      if (h) {
        state = h.type;
        evidence = h.text;
      } else {
        state = "main";
        evidence = null;
      }
      carriedState = state;
    } else {
      // Description not found in raw text (LLM normalized). Inherit
      // the state of the previous resolved item.
      evidence = state === "optional" ? "carried_optional" : null;
    }

    if (state === "optional") {
      sourceCounts.heading_optional++;
      return {
        ...it,
        scope_category: "optional" as const,
        scope_marker_label: "optional" as const,
        scope_marker_source: "heading_optional" as const,
        scope_marker_evidence: evidence,
      };
    }

    if (evidence) {
      sourceCounts.heading_main++;
    } else {
      sourceCounts.default_main++;
    }
    return {
      ...it,
      scope_category: "main" as const,
      scope_marker_label: "main" as const,
      scope_marker_source: evidence ? "heading_main" as const : "default_main" as const,
      scope_marker_evidence: evidence,
    };
  });

  const summary = summarise(
    out,
    Date.now() - start,
    sourceCounts,
    headings,
  );
  console.log(
    `[scopeMarkerDetection] done items=${out.length} main=${summary.main_count} ` +
      `optional=${summary.optional_count} excluded=${summary.excluded_count} ` +
      `main_total=${summary.main_total} optional_total=${summary.optional_total} ` +
      `excluded_total=${summary.excluded_total} ` +
      `headings=${headings.length} ` +
      `runtime_ms=${summary.runtime_ms}`,
  );
  return { items: out, summary };
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function buildFlatDocument(
  pages: { pageNum: number; text: string }[],
  rawText: string,
): { flat: string; pageStarts: Map<number, number> } {
  const pageStarts = new Map<number, number>();
  if (pages.length === 0) {
    return { flat: rawText, pageStarts };
  }
  const ordered = [...pages].sort((a, b) => a.pageNum - b.pageNum);
  const parts: string[] = [];
  let offset = 0;
  for (const p of ordered) {
    pageStarts.set(p.pageNum, offset);
    const t = p.text ?? "";
    parts.push(t);
    offset += t.length + 2; // matches the "\n\n" separator below
    parts.push("\n\n");
  }
  return { flat: parts.join(""), pageStarts };
}

function extractHeadings(flat: string): HeadingEvent[] {
  const events: HeadingEvent[] = [];
  if (!flat) return events;
  // Walk line-by-line so a heading is only recognised when it is the
  // dominant content of its line (avoids matching phrases buried inside
  // normal prose).
  const lineRegex = /[^\n]*/g;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(flat)) !== null) {
    const line = m[0];
    const trimmed = line.trim();
    if (!trimmed) {
      if (m.index === lineRegex.lastIndex) lineRegex.lastIndex++;
      continue;
    }
    // A "heading" is a short-ish line. Long narrative lines are ignored.
    if (trimmed.length <= 120) {
      const optMatch = matchMarker(trimmed, OPTIONAL_HEADING_PATTERNS);
      const mainMatch = matchMarker(trimmed, MAIN_HEADING_PATTERNS);
      if (optMatch && !mainMatch) {
        events.push({ offset: m.index, type: "optional", text: trimmed });
      } else if (mainMatch && !optMatch) {
        events.push({ offset: m.index, type: "main", text: trimmed });
      }
    }
    if (m.index === lineRegex.lastIndex) lineRegex.lastIndex++;
  }
  return events;
}

function mostRecentHeading(
  headings: HeadingEvent[],
  offset: number,
): HeadingEvent | null {
  let found: HeadingEvent | null = null;
  for (const h of headings) {
    if (h.offset <= offset) found = h;
    else break;
  }
  return found;
}

function locateItemOffset(
  item: ParsedLineItemV2,
  flat: string,
  pageStarts: Map<number, number>,
  desc: string,
  searchCursor: number,
): number {
  if (!flat || !desc) return -1;

  const page = (item as { source_page?: number | null }).source_page ?? null;
  const pageStart = page !== null ? (pageStarts.get(page) ?? -1) : -1;

  // Build a relaxed search token: first meaningful word + next token.
  const tokens = desc
    .toLowerCase()
    .replace(/[^a-z0-9\s\/\-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  const probe = tokens.slice(0, 3).join(" ");

  const lowerFlat = flat.toLowerCase();
  const startCursor = pageStart >= 0 ? Math.max(pageStart, searchCursor) : searchCursor;

  // Try exact (case-insensitive) description match first.
  const lowerDesc = desc.toLowerCase();
  let idx = lowerFlat.indexOf(lowerDesc, startCursor);
  if (idx === -1 && pageStart >= 0) {
    idx = lowerFlat.indexOf(lowerDesc, pageStart);
  }
  if (idx !== -1) return idx;

  if (probe) {
    idx = lowerFlat.indexOf(probe, startCursor);
    if (idx === -1 && pageStart >= 0) {
      idx = lowerFlat.indexOf(probe, pageStart);
    }
    if (idx !== -1) return idx;
  }

  // Fallback: at least anchor to the page start so heading-before-page
  // logic still applies.
  return pageStart;
}

function matchMarker(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

function summarise(
  items: ScopeMarkerItem[],
  runtime_ms: number,
  source_counts: Record<ScopeMarkerSource, number>,
  headings: HeadingEvent[],
): ScopeMarkerSummary {
  let main_count = 0;
  let optional_count = 0;
  let excluded_count = 0;
  let main_total = 0;
  let optional_total = 0;
  let excluded_total = 0;
  for (const it of items) {
    const v = it.total_price ?? 0;
    if (it.scope_marker_label === "optional") {
      optional_count++;
      optional_total += v;
    } else if (it.scope_marker_label === "excluded") {
      excluded_count++;
      excluded_total += v;
    } else {
      main_count++;
      main_total += v;
    }
  }
  return {
    version: SCOPE_MARKER_DETECTION_VERSION,
    main_count,
    optional_count,
    excluded_count,
    main_total: round2(main_total),
    optional_total: round2(optional_total),
    excluded_total: round2(excluded_total),
    source_counts,
    heading_events: headings.map((h) => ({
      offset: h.offset,
      type: h.type,
      text: h.text.slice(0, 120),
    })),
    runtime_ms,
  };
}

function emptySummary(runtime_ms: number): ScopeMarkerSummary {
  return {
    version: SCOPE_MARKER_DETECTION_VERSION,
    main_count: 0,
    optional_count: 0,
    excluded_count: 0,
    main_total: 0,
    optional_total: 0,
    excluded_total: 0,
    source_counts: {
      row_description_excluded: 0,
      heading_optional: 0,
      heading_main: 0,
      default_main: 0,
    },
    heading_events: [],
    runtime_ms,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
