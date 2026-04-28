/**
 * Stage 10 v5 — Deterministic Scope Marker Detection Engine.
 *
 * Replaces the LLM-driven scope segmentation engine with a pure
 * rule-based scan over document structure. No semantic reasoning, no
 * reconciliation rows, no total-based inference, no confidence guessing.
 *
 * Business logic:
 *   If an Optional marker appears in any of:
 *     - the row description itself
 *     - the nearest table/section heading above the row
 *     - the page heading/banner for the row's page
 *   -> row = optional
 *   Else if an Excluded marker appears in the same places
 *   -> row = excluded
 *   Else
 *   -> row = main
 *
 * Priority order (first match wins):
 *   1. Row description markers
 *   2. Nearest table heading above row
 *   3. Page heading/banner
 *   4. Excluded wording anywhere above
 *   5. Default: main
 *
 * Rows inherit section heading until the next heading is seen. Once an
 * Optional banner is active, every subsequent row on that page inherits
 * optional until a non-optional heading appears.
 *
 * Runs BEFORE totals calculation so the authoritative total selector
 * sees correctly-classified rows.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";

export const SCOPE_MARKER_DETECTION_VERSION = "v5-deterministic-2026-04-28";
console.log(
  `[scopeMarkerDetection] MODULE_LOAD version=${SCOPE_MARKER_DETECTION_VERSION}`,
);

export type ScopeMarkerLabel = "main" | "optional" | "excluded";

export type ScopeMarkerSource =
  | "row_description"
  | "table_heading"
  | "page_heading"
  | "section_inherit"
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
  runtime_ms: number;
};

export type ScopeMarkerResult = {
  items: ScopeMarkerItem[];
  summary: ScopeMarkerSummary;
};

export type ScopeMarkerInput = {
  items: ParsedLineItemV2[];
  pages: { pageNum: number; text: string }[];
};

// --------------------------------------------------------------------------
// Marker vocabularies. All patterns use word boundaries and are
// case-insensitive.
// --------------------------------------------------------------------------

const OPTIONAL_MARKERS = [
  /\boptional\s+scope\b/i,
  /\boptional\b(?!\s*extras?\s+included)/i,
  /\bitems?\s+with\s+confirmation\b/i,
  /\badd\s+to\s+scope\b/i,
  /\bestimate\s+items?\b/i,
  /\bnot\s+shown\s+on\s+drawings?\b/i,
  /\bextra\s+over\b/i,
  /\bclient\s+selection\b/i,
  /\btbc\b/i,
  /\bprovisional\s+sums?\b/i,
  /\bprovisional\s+items?\b/i,
  /\bprovisional\b/i,
  /\bif\s+required\b/i,
  /\balternate\s+pricing\b/i,
  /\bupgrade\s+options?\b/i,
  /\bcan\s+be\s+removed\b/i,
];

const EXCLUDED_MARKERS = [
  /\bby\s+others\b/i,
  /\bby\s+main\s+contractor\b/i,
  /\bby\s+client\b/i,
  /\bexclusions?\b/i,
  /\bexcluded\s+items?\b/i,
  /\bexcluded\b/i,
  /\bnic\b/i,
  /\bno\s+allowance\b/i,
  /\bnot\s+included\b/i,
];

const RESET_MARKERS = [
  /\b(?:BLOCK|BUILDING|LEVEL|UNIT|AREA|SECTION|LOT)\b\s*[:#-]?\s*[A-Za-z0-9][\w.-]*/i,
  /\b(?:main\s+scope|base\s+scope|included\s+scope|included\s+items)\b/i,
  /\bpassive\s+fire\s+schedule\b/i,
];

const SUBTOTAL_RE =
  /\b(sub\s*total|subtotal|section\s+total|block\s+total|building\s+total|page\s+total|grand\s+total|tender\s+total|total\s+ex|optional\s+total|estimate\s+subtotal|carried\s+forward)\b/i;

const HEADING_MAX_LEN = 160;

type LineKind = "reset" | "optional" | "excluded" | "plain_heading" | "row" | "noise";

type ClassifiedLine = {
  kind: LineKind;
  text: string;
  matched_marker: string | null;
};

// --------------------------------------------------------------------------
// Public entry
// --------------------------------------------------------------------------

export function runScopeMarkerDetection(
  input: ScopeMarkerInput,
): ScopeMarkerResult {
  const start = Date.now();
  const { items, pages } = input;

  if (items.length === 0) {
    return {
      items: [],
      summary: emptySummary(Date.now() - start),
    };
  }

  // Build per-page classified lines and a page-level optional banner flag.
  const pageClassified = new Map<number, ClassifiedLine[]>();
  const pageBanner = new Map<number, { label: ScopeMarkerLabel; evidence: string } | null>();
  for (const p of pages) {
    const lines = (p.text ?? "").split(/\r?\n/).map((l) => l.trim());
    const classified = lines.map(classifyLine);
    pageClassified.set(p.pageNum, classified);
    pageBanner.set(p.pageNum, detectPageBanner(classified));
  }

  // Walk rows in input order, maintaining state across pages.
  let activeSectionLabel: ScopeMarkerLabel = "main";
  let activeSectionEvidence: string | null = null;
  let activeSectionSource: ScopeMarkerSource = "default_main";
  let lastPage: number | null = null;
  // Cursor for locating each row inside its page's line array.
  const pageCursor = new Map<number, number>();

  const out: ScopeMarkerItem[] = [];
  const sourceCounts: Record<ScopeMarkerSource, number> = {
    row_description: 0,
    table_heading: 0,
    page_heading: 0,
    section_inherit: 0,
    default_main: 0,
  };

  for (const it of items) {
    const page = it.source_page ?? null;

    // New page: reset cursor and apply page banner if any.
    if (page != null && page !== lastPage) {
      pageCursor.set(page, 0);
      const banner = pageBanner.get(page);
      if (banner) {
        activeSectionLabel = banner.label;
        activeSectionEvidence = banner.evidence;
        activeSectionSource = "page_heading";
      }
      lastPage = page;
    }

    // Advance section state by scanning unread lines up to (and
    // including) this row's description line.
    if (page != null) {
      const classified = pageClassified.get(page) ?? [];
      const cursor = pageCursor.get(page) ?? 0;
      const rowLineIdx = locateRowLine(classified, it.description ?? "", cursor);
      const upTo = rowLineIdx >= 0 ? rowLineIdx : classified.length;
      for (let i = cursor; i < upTo; i++) {
        const cl = classified[i];
        if (cl.kind === "reset") {
          activeSectionLabel = "main";
          activeSectionEvidence = cl.text;
          activeSectionSource = "table_heading";
        } else if (cl.kind === "optional") {
          activeSectionLabel = "optional";
          activeSectionEvidence = cl.matched_marker ?? cl.text;
          activeSectionSource = "table_heading";
        } else if (cl.kind === "excluded") {
          activeSectionLabel = "excluded";
          activeSectionEvidence = cl.matched_marker ?? cl.text;
          activeSectionSource = "table_heading";
        } else if (cl.kind === "plain_heading") {
          // Plain heading doesn't change scope but can cancel an
          // inherited optional banner if it matches a reset pattern
          // loosely (new named block / section).
          // We keep current state otherwise.
        }
      }
      pageCursor.set(
        page,
        rowLineIdx >= 0 ? rowLineIdx + 1 : Math.min(classified.length, cursor + 1),
      );
    }

    // Priority 1: row description markers win over everything.
    const desc = it.description ?? "";
    const rowOpt = matchMarker(desc, OPTIONAL_MARKERS);
    const rowExc = matchMarker(desc, EXCLUDED_MARKERS);
    let label: ScopeMarkerLabel;
    let source: ScopeMarkerSource;
    let evidence: string | null;
    if (rowOpt) {
      label = "optional";
      source = "row_description";
      evidence = rowOpt;
    } else if (rowExc) {
      label = "excluded";
      source = "row_description";
      evidence = rowExc;
    } else {
      // Priority 2/3/4: use the active section/page state.
      label = activeSectionLabel;
      source = activeSectionLabel === "main" && activeSectionSource === "default_main"
        ? "default_main"
        : activeSectionSource === "page_heading"
          ? "page_heading"
          : activeSectionLabel === "main"
            ? "default_main"
            : "section_inherit";
      evidence = activeSectionEvidence;
    }

    sourceCounts[source]++;
    out.push({
      ...it,
      scope_category: label,
      scope_marker_label: label,
      scope_marker_source: source,
      scope_marker_evidence: evidence,
    });
  }

  const summary = summarise(out, Date.now() - start, sourceCounts);
  console.log(
    `[scopeMarkerDetection] done items=${out.length} main=${summary.main_count} ` +
      `optional=${summary.optional_count} excluded=${summary.excluded_count} ` +
      `main_total=${summary.main_total} optional_total=${summary.optional_total} ` +
      `runtime_ms=${summary.runtime_ms}`,
  );
  return { items: out, summary };
}

// --------------------------------------------------------------------------
// Line classification
// --------------------------------------------------------------------------

function classifyLine(raw: string): ClassifiedLine {
  if (!raw) return { kind: "noise", text: raw, matched_marker: null };
  if (raw.length > HEADING_MAX_LEN) return { kind: "row", text: raw, matched_marker: null };

  // Subtotal lines are metadata — treat as noise so they don't
  // propagate optional state.
  if (SUBTOTAL_RE.test(raw)) {
    return { kind: "noise", text: raw, matched_marker: null };
  }

  // Reset markers first — they re-anchor section state to main.
  const resetMatch = matchMarker(raw, RESET_MARKERS);
  if (resetMatch) return { kind: "reset", text: raw, matched_marker: resetMatch };

  const optMatch = matchMarker(raw, OPTIONAL_MARKERS);
  if (optMatch) return { kind: "optional", text: raw, matched_marker: optMatch };

  const excMatch = matchMarker(raw, EXCLUDED_MARKERS);
  if (excMatch) return { kind: "excluded", text: raw, matched_marker: excMatch };

  // Heading-ish: short, title-case, no currency.
  if (looksLikePlainHeading(raw)) {
    return { kind: "plain_heading", text: raw, matched_marker: null };
  }

  return { kind: "row", text: raw, matched_marker: null };
}

function looksLikePlainHeading(line: string): boolean {
  if (/\$\s*\d/.test(line)) return false;
  if (/^\s*\d[\d,]*\.\d{2}\s*$/.test(line)) return false;
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 5) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length >= 0.75) return true;
  }
  if (/:\s*$/.test(line) && line.length <= 80) return true;
  return false;
}

function matchMarker(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

// --------------------------------------------------------------------------
// Page banner detection — if the top of a page contains an Optional or
// Excluded marker (e.g. "OPTIONAL SCOPE" centred as a page title), every
// row on that page inherits it until a reset heading appears.
// --------------------------------------------------------------------------

function detectPageBanner(
  lines: ClassifiedLine[],
): { label: ScopeMarkerLabel; evidence: string } | null {
  // Look at the first 6 non-noise lines.
  const head: ClassifiedLine[] = [];
  for (const l of lines) {
    if (head.length >= 6) break;
    if (l.kind === "noise") continue;
    if (!l.text) continue;
    head.push(l);
  }
  for (const l of head) {
    if (l.kind === "optional") return { label: "optional", evidence: l.matched_marker ?? l.text };
    if (l.kind === "excluded") return { label: "excluded", evidence: l.matched_marker ?? l.text };
    if (l.kind === "reset") return null;
  }
  return null;
}

// --------------------------------------------------------------------------
// Row-to-line anchoring — locate the line that contains the row's
// description so the section walker knows how far to advance.
// --------------------------------------------------------------------------

function locateRowLine(
  lines: ClassifiedLine[],
  description: string,
  start: number,
): number {
  if (!description) return -1;
  // Strip common enrichment prefixes added by extractors (e.g. "[Block 10] ")
  const stripped = description.replace(/^\s*\[[^\]]+\]\s*/, "").trim();
  const candidate = stripped.length >= 4 ? stripped : description;
  const needle40 = candidate.slice(0, 40).toLowerCase();
  if (needle40.length >= 6) {
    for (let i = start; i < lines.length; i++) {
      if (lines[i].text.toLowerCase().includes(needle40)) return i;
    }
  }
  const needle20 = candidate.slice(0, 20).toLowerCase();
  if (needle20.length >= 5) {
    for (let i = start; i < lines.length; i++) {
      if (lines[i].text.toLowerCase().includes(needle20)) return i;
    }
  }
  return -1;
}

// --------------------------------------------------------------------------
// Summaries
// --------------------------------------------------------------------------

function summarise(
  items: ScopeMarkerItem[],
  runtime_ms: number,
  source_counts: Record<ScopeMarkerSource, number>,
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
      row_description: 0,
      table_heading: 0,
      page_heading: 0,
      section_inherit: 0,
      default_main: 0,
    },
    runtime_ms,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
