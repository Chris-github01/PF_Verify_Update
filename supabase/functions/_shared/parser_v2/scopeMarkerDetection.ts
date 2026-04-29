/**
 * Stage 10 v12 — Sequential Heading Scope Classifier (2026-04-29).
 *
 * Algorithm:
 *
 *   1. Build a linear document from ONLY the schedule pages (pages that
 *      contain a "BLOCK <n>" banner). Cover pages, summary/total pages
 *      and T&Cs are excluded so their "OPTIONAL SCOPE" text can't
 *      pollute the scanner.
 *   2. Scan that text top-to-bottom for HEADING lines. A heading is a
 *      short dominant line (<=120 chars) matching one of the known
 *      Optional or Main phrases.
 *   3. Walk the parsed items in order. Resolve each item to a document
 *      offset (robust to LLM word-duplication prefixes) and apply the
 *      most recent heading at or before that offset. Optional keeps
 *      Optional until a Main heading is hit; Main keeps Main until an
 *      Optional heading is hit.
 *   4. Items whose position precedes the first heading default to Main.
 *   5. Excluded is a separate dimension handled only at the row level
 *      via explicit "by others" / "not included" / "excluded" text.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";

export const SCOPE_MARKER_DETECTION_VERSION =
  "v12-schedule-pages-only-2026-04-29";
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
  scanned_pages: number[];
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

// LLM normalization frequently prepends a category token (or two) before
// the canonical description. Strip these before searching raw text.
const LLM_PREFIX_TOKENS: RegExp[] = [
  /^\[block\s+[a-z0-9]+\]\s+/i,
  /^hvac\s+bundle\s+one\s+way\s+/i,
  /^hvac\s+bundle\s+/i,
  /^cable\s+bundle\s+/i,
  /^fire[_\s]protection\s+fire\s+alarm\s+cable\s+/i,
  /^pvc\s+pipe\s+/i,
  /^pex\s+pipe\s+/i,
  /^copper\s+pipe\s+/i,
  /^brass\s+wingback\s+/i,
  /^downlight\s+cover\s+/i,
  /^beam\s+encasement\s+/i,
  /^cavity\s+barrier\s+/i,
  /^architectural\s+flush\s+box\s+/i,
  /^flush\s+box\s+/i,
  /^pipe\s+wall\s+/i,
  /^acoustic\s+putty\s+pad\s+/i,
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

  // Build one linear document string from only schedule pages.
  const { flat, pageStarts, scannedPages } = buildFlatDocument(
    pages ?? [],
    rawText ?? "",
  );

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

    const { offset, probeLength } = locateItemOffset(
      it,
      flat,
      pageStarts,
      desc,
      searchCursor,
    );

    let state = carriedState;
    let evidence: string | null = null;
    let resolvedByOffset = false;

    if (offset >= 0) {
      // Always advance the cursor past the resolved position so later
      // items can cross in-page Optional/Main banners correctly.
      const advance = offset + Math.max(probeLength, 1);
      if (advance > searchCursor) searchCursor = advance;
      const h = mostRecentHeading(headings, offset);
      if (h) {
        state = h.type;
        evidence = h.text;
        resolvedByOffset = true;
      } else {
        state = "main";
        evidence = null;
        resolvedByOffset = true;
      }
      carriedState = state;
    } else {
      // Description not found in raw text. Inherit the carried state.
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

    if (evidence && resolvedByOffset) {
      sourceCounts.heading_main++;
    } else {
      sourceCounts.default_main++;
    }
    return {
      ...it,
      scope_category: "main" as const,
      scope_marker_label: "main" as const,
      scope_marker_source:
        evidence && resolvedByOffset
          ? ("heading_main" as const)
          : ("default_main" as const),
      scope_marker_evidence: evidence,
    };
  });

  const summary = summarise(
    out,
    Date.now() - start,
    sourceCounts,
    headings,
    scannedPages,
  );
  console.log(
    `[scopeMarkerDetection] done items=${out.length} main=${summary.main_count} ` +
      `optional=${summary.optional_count} excluded=${summary.excluded_count} ` +
      `main_total=${summary.main_total} optional_total=${summary.optional_total} ` +
      `excluded_total=${summary.excluded_total} ` +
      `headings=${headings.length} scanned_pages=${scannedPages.join(",")} ` +
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
): { flat: string; pageStarts: Map<number, number>; scannedPages: number[] } {
  const pageStarts = new Map<number, number>();
  const scannedPages: number[] = [];

  if (pages.length === 0) {
    return { flat: rawText, pageStarts, scannedPages };
  }

  const ordered = [...pages].sort((a, b) => a.pageNum - b.pageNum);

  // Only include schedule pages (pages that contain a BLOCK <n> banner).
  // This keeps summary/cover/T&Cs pages out of the heading scanner.
  const blockRegex = /(?:^|\n)\s*block\s+[a-z0-9]+\b/i;
  const filtered = ordered.filter((p) => blockRegex.test(p.text ?? ""));

  // If no page matches (edge case — degenerate input), fall back to
  // including all pages so we still classify something.
  const included = filtered.length > 0 ? filtered : ordered;

  const parts: string[] = [];
  let offset = 0;
  for (const p of included) {
    pageStarts.set(p.pageNum, offset);
    scannedPages.push(p.pageNum);
    const t = p.text ?? "";
    parts.push(t);
    offset += t.length + 2;
    parts.push("\n\n");
  }
  return { flat: parts.join(""), pageStarts, scannedPages };
}

function extractHeadings(flat: string): HeadingEvent[] {
  const events: HeadingEvent[] = [];
  if (!flat) return events;
  const lineRegex = /[^\n]*/g;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(flat)) !== null) {
    const line = m[0];
    const trimmed = line.trim();
    if (!trimmed) {
      if (m.index === lineRegex.lastIndex) lineRegex.lastIndex++;
      continue;
    }
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

function stripLlmPrefixes(desc: string): string {
  let out = desc;
  // Apply repeatedly; prefixes may stack ("[Block B30] cable bundle ...").
  for (let i = 0; i < 4; i++) {
    let changed = false;
    for (const re of LLM_PREFIX_TOKENS) {
      const next = out.replace(re, "");
      if (next !== out) {
        out = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out.trim();
}

function locateItemOffset(
  item: ParsedLineItemV2,
  flat: string,
  pageStarts: Map<number, number>,
  desc: string,
  searchCursor: number,
): { offset: number; probeLength: number } {
  if (!flat || !desc) return { offset: -1, probeLength: 0 };

  const page = (item as { source_page?: number | null }).source_page ?? null;
  const pageStart = page !== null ? (pageStarts.get(page) ?? -1) : -1;

  const lowerFlat = flat.toLowerCase();
  const startCursor =
    pageStart >= 0 ? Math.max(pageStart, searchCursor) : searchCursor;

  // Candidate 1: full description as-is.
  // Candidate 2: LLM-prefix-stripped canonical portion.
  const candidates: string[] = [];
  const lowerDesc = desc.toLowerCase();
  candidates.push(lowerDesc);

  const stripped = stripLlmPrefixes(desc).toLowerCase();
  if (stripped && stripped !== lowerDesc) candidates.push(stripped);

  // Candidate 3: relaxed probe — first 3 meaningful tokens of the stripped
  // description (drops trailing units/qty/noise and matches PDF text).
  const probeBase = stripped || lowerDesc;
  const tokens = probeBase
    .replace(/[^a-z0-9\s\/\-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  const probe = tokens.slice(0, 3).join(" ");
  if (probe && !candidates.includes(probe)) candidates.push(probe);

  // Candidate 4: two-token probe as last resort.
  const probe2 = tokens.slice(0, 2).join(" ");
  if (probe2 && probe2.length >= 6 && !candidates.includes(probe2)) {
    candidates.push(probe2);
  }

  for (const needle of candidates) {
    let idx = lowerFlat.indexOf(needle, startCursor);
    if (idx === -1 && pageStart >= 0) {
      idx = lowerFlat.indexOf(needle, pageStart);
    }
    if (idx !== -1) return { offset: idx, probeLength: needle.length };
  }

  return { offset: pageStart, probeLength: 0 };
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
  scannedPages: number[],
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
    scanned_pages: scannedPages,
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
    scanned_pages: [],
    runtime_ms,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
