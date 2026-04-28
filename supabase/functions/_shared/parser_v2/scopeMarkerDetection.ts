/**
 * Stage 10 v6 — Deterministic Scope Marker Detection Engine
 * (text-stream edition, 2026-04-28).
 *
 * Why v6: v5 keyed off per-item `source_page` values. When extractors
 * don't populate pages for every row, the page cursor never advances
 * and state becomes sticky across the whole document (Block N Optional
 * banner bleeds into Block N+1 Main items).
 *
 * v6 scans the whole `rawText` once into an ordered array of classified
 * lines. For each parsed item we locate its description inside that
 * stream (stripping `[Block X]` and similar enrichment prefixes added by
 * extractors) and read back the active (label, evidence, source)
 * computed at that line position. No per-page state. No LLM. No
 * semantic reasoning.
 *
 * Priority order (first match wins) per row:
 *   1. Row description markers (rowOpt/rowExc)
 *   2. Active section state (optional / excluded from the most recent
 *      marker line above the row)
 *   3. Default: main
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";

export const SCOPE_MARKER_DETECTION_VERSION = "v6-text-stream-2026-04-28";
console.log(
  `[scopeMarkerDetection] MODULE_LOAD version=${SCOPE_MARKER_DETECTION_VERSION}`,
);

export type ScopeMarkerLabel = "main" | "optional" | "excluded";

export type ScopeMarkerSource =
  | "row_description"
  | "section_heading"
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
  unlocated_rows: number;
  runtime_ms: number;
};

export type ScopeMarkerResult = {
  items: ScopeMarkerItem[];
  summary: ScopeMarkerSummary;
};

export type ScopeMarkerInput = {
  items: ParsedLineItemV2[];
  rawText: string;
  pages?: { pageNum: number; text: string }[];
};

// --------------------------------------------------------------------------
// Marker vocabularies.
// --------------------------------------------------------------------------

const OPTIONAL_MARKERS = [
  /\boptional\s+scope\b/i,
  /\boptional\s+items?\b/i,
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
  /\bservices?\s+identified\s+not\s+part\s+of\s+passive\s+fire\s+schedule\b/i,
  /\bnot\s+part\s+of\s+(?:passive\s+fire\s+)?schedule\b/i,
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

// Reset markers re-anchor section state back to "main". These are
// typically new block/section headings that appear between optional or
// excluded regions and subsequent main work.
const RESET_MARKERS = [
  /\b(?:BLOCK|BUILDING|LEVEL|UNIT|AREA|LOT)\b\s*[:#-]?\s*[A-Za-z0-9][\w.-]*/,
  /\b(?:main\s+scope|base\s+scope|included\s+scope|included\s+items)\b/i,
  /\bpassive\s+fire\s+schedule\b/i,
  /\bfire\s*stopping\s+schedule\b/i,
  /\bscope\s+of\s+works?\b/i,
];

const SUBTOTAL_RE =
  /\b(sub\s*total|subtotal|section\s+total|block\s+total|building\s+total|page\s+total|grand\s+total|tender\s+total|total\s+ex|optional\s+total|estimate\s+subtotal|carried\s+forward)\b/i;

const HEADING_MAX_LEN = 200;

type LineKind = "reset" | "optional" | "excluded" | "row" | "noise";

type ClassifiedLine = {
  idx: number;
  kind: LineKind;
  text: string;
  matched_marker: string | null;
  label_at_line: ScopeMarkerLabel;
  evidence_at_line: string | null;
};

// --------------------------------------------------------------------------
// Public entry
// --------------------------------------------------------------------------

export function runScopeMarkerDetection(
  input: ScopeMarkerInput,
): ScopeMarkerResult {
  const start = Date.now();
  const { items } = input;

  if (items.length === 0) {
    return { items: [], summary: emptySummary(Date.now() - start) };
  }

  const rawText = input.rawText && input.rawText.trim().length > 0
    ? input.rawText
    : (input.pages ?? []).map((p) => p.text ?? "").join("\n");

  const classified = classifyTextStream(rawText);
  const lowerLines = classified.map((c) => c.text.toLowerCase());

  const sourceCounts: Record<ScopeMarkerSource, number> = {
    row_description: 0,
    section_heading: 0,
    default_main: 0,
  };

  let searchStart = 0;
  let unlocatedRows = 0;
  const out: ScopeMarkerItem[] = [];

  for (const it of items) {
    const desc = (it.description ?? "").trim();

    // Priority 1: marker directly in row description.
    const rowOpt = matchMarker(desc, OPTIONAL_MARKERS);
    const rowExc = matchMarker(desc, EXCLUDED_MARKERS);

    let label: ScopeMarkerLabel;
    let source: ScopeMarkerSource;
    let evidence: string | null;

    if (rowExc) {
      label = "excluded";
      source = "row_description";
      evidence = rowExc;
    } else if (rowOpt) {
      label = "optional";
      source = "row_description";
      evidence = rowOpt;
    } else {
      // Priority 2: locate the row in the stream and inherit the
      // section state that's active at (or just before) that line.
      const located = locateRow(lowerLines, desc, searchStart);
      if (located >= 0) {
        searchStart = located + 1;
        const line = classified[located];
        label = line.label_at_line;
        evidence = line.evidence_at_line;
        source = label === "main" && evidence == null
          ? "default_main"
          : "section_heading";
      } else {
        // Fall back to the most recent known state without advancing.
        unlocatedRows++;
        const anchor = searchStart > 0 ? classified[searchStart - 1] : null;
        label = anchor?.label_at_line ?? "main";
        evidence = anchor?.evidence_at_line ?? null;
        source = label === "main" && evidence == null
          ? "default_main"
          : "section_heading";
      }
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

  const summary = summarise(out, Date.now() - start, sourceCounts, unlocatedRows);
  console.log(
    `[scopeMarkerDetection] done items=${out.length} main=${summary.main_count} ` +
      `optional=${summary.optional_count} excluded=${summary.excluded_count} ` +
      `main_total=${summary.main_total} optional_total=${summary.optional_total} ` +
      `excluded_total=${summary.excluded_total} unlocated=${summary.unlocated_rows} ` +
      `runtime_ms=${summary.runtime_ms}`,
  );
  return { items: out, summary };
}

// --------------------------------------------------------------------------
// Text stream classification
// --------------------------------------------------------------------------

function classifyTextStream(rawText: string): ClassifiedLine[] {
  const lines = (rawText ?? "").split(/\r?\n/).map((l) => l.trim());
  const out: ClassifiedLine[] = [];

  let activeLabel: ScopeMarkerLabel = "main";
  let activeEvidence: string | null = null;

  lines.forEach((text, idx) => {
    const kind = classifyLineKind(text);
    const matched = kind === "reset"
      ? matchMarker(text, RESET_MARKERS)
      : kind === "optional"
        ? matchMarker(text, OPTIONAL_MARKERS)
        : kind === "excluded"
          ? matchMarker(text, EXCLUDED_MARKERS)
          : null;

    // Update state BEFORE stamping the line, so the heading line itself
    // carries the new label (useful when a row sits on the same line).
    if (kind === "reset") {
      activeLabel = "main";
      activeEvidence = null;
    } else if (kind === "optional") {
      activeLabel = "optional";
      activeEvidence = matched;
    } else if (kind === "excluded") {
      activeLabel = "excluded";
      activeEvidence = matched;
    }

    out.push({
      idx,
      kind,
      text,
      matched_marker: matched,
      label_at_line: activeLabel,
      evidence_at_line: activeEvidence,
    });
  });

  return out;
}

function classifyLineKind(raw: string): LineKind {
  if (!raw) return "noise";
  if (raw.length > HEADING_MAX_LEN) return "row";
  if (SUBTOTAL_RE.test(raw)) return "noise";

  if (matchMarker(raw, RESET_MARKERS)) return "reset";
  if (matchMarker(raw, OPTIONAL_MARKERS)) return "optional";
  if (matchMarker(raw, EXCLUDED_MARKERS)) return "excluded";
  return "row";
}

function matchMarker(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

// --------------------------------------------------------------------------
// Row locator — finds the classified-line index for a row's description.
// Strips extractor enrichment prefixes like "[Block 30] " so we match
// against the text as it appears in the source document.
// --------------------------------------------------------------------------

function locateRow(
  lowerLines: string[],
  description: string,
  fromIdx: number,
): number {
  if (!description) return -1;
  const stripped = description.replace(/^\s*\[[^\]]+\]\s*/, "").trim();
  const candidate = (stripped.length >= 4 ? stripped : description).toLowerCase();

  const n40 = candidate.slice(0, 40);
  if (n40.length >= 8) {
    for (let i = fromIdx; i < lowerLines.length; i++) {
      if (lowerLines[i].includes(n40)) return i;
    }
  }
  const n24 = candidate.slice(0, 24);
  if (n24.length >= 6) {
    for (let i = fromIdx; i < lowerLines.length; i++) {
      if (lowerLines[i].includes(n24)) return i;
    }
  }
  // Secondary global search (wrap back) for items that appeared out of
  // extractor order.
  const n40global = candidate.slice(0, 40);
  if (n40global.length >= 8) {
    for (let i = 0; i < lowerLines.length; i++) {
      if (lowerLines[i].includes(n40global)) return i;
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
  unlocated_rows: number,
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
    unlocated_rows,
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
      section_heading: 0,
      default_main: 0,
    },
    unlocated_rows: 0,
    runtime_ms,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
