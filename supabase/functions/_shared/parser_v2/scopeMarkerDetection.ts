/**
 * Stage 10 v7 — Row-only Deterministic Scope Marker Detection
 * (2026-04-28).
 *
 * Why v7: v5/v6 tried to inherit scope from section headings above a
 * row. That approach fails on PDFs where text extraction does not
 * preserve visual grouping (the "OPTIONAL SCOPE" banner lands at the
 * bottom of the page text instead of before the rows it applies to).
 *
 * v7 is pure row-level classification. Every row is labelled solely
 * from its own description, using a deterministic regex priority list.
 * No cross-row state. No text-stream walking. No LLM. No semantic
 * reasoning.
 *
 * Priority order (first match wins per row):
 *   1. Optional Extras / Architectural-Structural / beam encasement /
 *      cavity barrier / intumescent flush markers → optional
 *   2. Explicit "by others" / "excluded" / "not included" markers →
 *      excluded
 *   3. Provisional / TBC / if-required markers → optional
 *   4. Default → main
 *
 * Important business rule: "SERVICES IDENTIFIED NOT PART OF PASSIVE
 * FIRE SCHEDULE" is NOT treated as an excluded section. In quotes that
 * use that heading, the rows beneath it are provisional penetration
 * quantities still included in the main sub-total, so we leave them as
 * main. Only explicit row-level "by others" / "excluded" text makes a
 * row excluded.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";

export const SCOPE_MARKER_DETECTION_VERSION = "v7-row-only-2026-04-28";
console.log(
  `[scopeMarkerDetection] MODULE_LOAD version=${SCOPE_MARKER_DETECTION_VERSION}`,
);

export type ScopeMarkerLabel = "main" | "optional" | "excluded";

export type ScopeMarkerSource =
  | "row_description_optional"
  | "row_description_excluded"
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
  rawText?: string;
  pages?: { pageNum: number; text: string }[];
};

// --------------------------------------------------------------------------
// Row-level marker vocabularies. All patterns use word boundaries and
// are case-insensitive.
// --------------------------------------------------------------------------

const OPTIONAL_ROW_MARKERS: RegExp[] = [
  /\barchitectural[\s\/-]*structural\s+details?\b/i,
  /\boptional\s+extras?\b/i,
  /\boptional\s+scope\b/i,
  /\boptional\s+flush\s+box(?:es)?\b/i,
  /\bbeam\s+encasement\b/i,
  /\bcavity\s+barrier\b/i,
  /\bintumescent\s+flush\s+box\b/i,
  /\bryanlite\s+\d+mm\b/i,
  /\bsiderise\s+cw\/?fs\b/i,
  /\bitems?\s+with\s+confirmation\b/i,
  /\badd\s+to\s+scope\b/i,
  /\bestimate\s+items?\b/i,
  /\bnot\s+shown\s+on\s+drawings?\b/i,
  /\bextra\s+over\b/i,
  /\bclient\s+selection\b/i,
  /\btbc\b/i,
  /\bprovisional\s+sums?\b/i,
  /\bif\s+required\b/i,
  /\balternate\s+pricing\b/i,
  /\bupgrade\s+options?\b/i,
  /\bcan\s+be\s+removed\b/i,
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

  const sourceCounts: Record<ScopeMarkerSource, number> = {
    row_description_optional: 0,
    row_description_excluded: 0,
    default_main: 0,
  };

  const out: ScopeMarkerItem[] = items.map((it) => {
    const desc = (it.description ?? "").trim();
    const subScope = (it.sub_scope ?? "").trim();
    const haystack = `${desc} ${subScope}`;

    const optMatch = matchMarker(haystack, OPTIONAL_ROW_MARKERS);
    const excMatch = matchMarker(haystack, EXCLUDED_ROW_MARKERS);

    let label: ScopeMarkerLabel;
    let source: ScopeMarkerSource;
    let evidence: string | null;

    if (optMatch) {
      label = "optional";
      source = "row_description_optional";
      evidence = optMatch;
    } else if (excMatch) {
      label = "excluded";
      source = "row_description_excluded";
      evidence = excMatch;
    } else {
      label = "main";
      source = "default_main";
      evidence = null;
    }

    sourceCounts[source]++;

    return {
      ...it,
      scope_category: label,
      scope_marker_label: label,
      scope_marker_source: source,
      scope_marker_evidence: evidence,
    };
  });

  const summary = summarise(out, Date.now() - start, sourceCounts);
  console.log(
    `[scopeMarkerDetection] done items=${out.length} main=${summary.main_count} ` +
      `optional=${summary.optional_count} excluded=${summary.excluded_count} ` +
      `main_total=${summary.main_total} optional_total=${summary.optional_total} ` +
      `excluded_total=${summary.excluded_total} runtime_ms=${summary.runtime_ms}`,
  );
  return { items: out, summary };
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

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
      row_description_optional: 0,
      row_description_excluded: 0,
      default_main: 0,
    },
    runtime_ms,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
