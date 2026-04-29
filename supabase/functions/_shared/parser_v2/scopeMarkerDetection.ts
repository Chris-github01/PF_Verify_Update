/**
 * Stage 10 v8 — Three-Tier Deterministic Scope Marker Detection
 * (2026-04-29).
 *
 * A row is Optional if the word "Optional" (or an equivalent marker)
 * appears in ANY of three places:
 *
 *   1. The page header above the table (e.g. Global Fire's
 *      "ITEMS WITH CONFIRMATION / OPTIONAL SCOPE" banner that covers an
 *      entire page).
 *   2. A table section banner row above the row (e.g. Optimal Fire's
 *      "OPTIONAL SCOPE" banner row preceding the optional items).
 *   3. The row's own description (e.g. "Optional Extras",
 *      "Architectural/Structural Details").
 *
 * Otherwise the row is Main.
 *
 * Excluded is a separate dimension: only explicit row-level "by others"
 * / "excluded" / "not included" text makes a row Excluded.
 *
 * Business rule: "SERVICES IDENTIFIED NOT PART OF PASSIVE FIRE
 * SCHEDULE" does NOT flip the scope — the rows beneath it are still
 * provisional penetration quantities inside the main sub-total, so
 * they stay Main unless they themselves match an Optional marker.
 *
 * Deterministic, regex-based, no LLM.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";

export const SCOPE_MARKER_DETECTION_VERSION = "v8-three-tier-2026-04-29";
console.log(
  `[scopeMarkerDetection] MODULE_LOAD version=${SCOPE_MARKER_DETECTION_VERSION}`,
);

export type ScopeMarkerLabel = "main" | "optional" | "excluded";

export type ScopeMarkerSource =
  | "row_description_optional"
  | "row_description_excluded"
  | "section_banner_optional"
  | "page_header_optional"
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
  optional_pages: number[];
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
// Marker vocabularies. Case-insensitive, word-boundary regexes.
// --------------------------------------------------------------------------

/**
 * Patterns that, when found in a row description, mark the row as
 * Optional directly.
 */
const OPTIONAL_ROW_MARKERS: RegExp[] = [
  /\barchitectural[\s\/\-]*structural\s+details?\b/i,
  /\boptional\s+extras?\b/i,
  /\boptional\s+scope\b/i,
  /\boptional\s+flush\s+box(?:es)?\b/i,
  /\bitems?\s+with\s+confirmation\b/i,
  /\bestimate\s+items?\b/i,
  /\bnot\s+shown\s+on\s+drawings?\b/i,
  /\badd\s+to\s+scope\b/i,
  /\bextra\s+over\b/i,
  /\bclient\s+selection\b/i,
  /\btbc\b/i,
  /\bprovisional\s+sums?\b/i,
  /\bif\s+required\b/i,
  /\balternate\s+pricing\b/i,
  /\bupgrade\s+options?\b/i,
  /\bcan\s+be\s+removed\b/i,
  /\boptional\b/i, // catch-all for "optional" appearing anywhere in description
];

/**
 * Patterns that identify a banner-row whose job is to announce a new
 * Optional section inside the table. Rows that follow this banner stay
 * Optional until a main-section banner resets the state.
 */
const OPTIONAL_SECTION_BANNER_MARKERS: RegExp[] = [
  /\boptional\s+scope\b/i,
  /\bitems?\s+with\s+confirmation\b/i,
  /\bnot\s+shown\s+on\s+drawings?\b/i,
  /\boptional\s+extras?\b/i,
  /\barchitectural[\s\/\-]*structural\s+details?\b/i,
  /\bestimate\s+items?\b/i,
];

/**
 * Patterns that identify a banner-row that resets the section back to
 * Main (e.g. a new block, or the "identified on drawings" page).
 */
const MAIN_SECTION_BANNER_MARKERS: RegExp[] = [
  /\bitems?\s+identified\s+on\s+drawings?\b/i,
  /\bpassive\s+fire\s+schedule\b/i,
  /^\s*block\s+[a-z0-9]+\b/i,
  /\bfire\s+rated\s+penetrations?\b/i,
];

/**
 * Patterns that look for an Optional signal in the header region of a
 * page (top ~600 chars).
 */
const OPTIONAL_PAGE_HEADER_MARKERS: RegExp[] = [
  /\bitems?\s+with\s+confirmation\b/i,
  /\boptional\s+scope\b/i,
  /\bnot\s+shown\s+on\s+drawings?\b/i,
];

/**
 * Patterns that declare a page as Main (takes precedence over Optional
 * page markers if both appear in the header).
 */
const MAIN_PAGE_HEADER_MARKERS: RegExp[] = [
  /\bitems?\s+identified\s+on\s+drawings?\b/i,
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

// Threshold for calling a row a "banner" (no meaningful price).
const BANNER_PRICE_THRESHOLD = 1; // total_price < $1 is treated as no price

// --------------------------------------------------------------------------
// Public entry
// --------------------------------------------------------------------------

export function runScopeMarkerDetection(
  input: ScopeMarkerInput,
): ScopeMarkerResult {
  const start = Date.now();
  const { items, pages } = input;

  if (items.length === 0) {
    return { items: [], summary: emptySummary(Date.now() - start) };
  }

  // Tier 1: page-level optional detection
  const optionalPages = detectOptionalPages(pages ?? []);

  const sourceCounts: Record<ScopeMarkerSource, number> = {
    row_description_optional: 0,
    row_description_excluded: 0,
    section_banner_optional: 0,
    page_header_optional: 0,
    default_main: 0,
  };

  // Tier 2: walk items in order, tracking in-table banner state.
  let sectionOptional = false;
  let lastPage: number | null = null;

  const out: ScopeMarkerItem[] = items.map((it) => {
    const desc = (it.description ?? "").trim();
    const subScope = (it.sub_scope ?? "").trim();
    const haystack = `${desc} ${subScope}`;
    const page = it.source_page ?? null;

    // Page change: if we enter a main page, reset the optional section
    // flag so prior in-table optional banners do not bleed across
    // pages. If we enter an optional page, keep the flag as-is (the
    // page-level tier will handle rows anyway).
    if (page !== null && page !== lastPage) {
      if (!optionalPages.has(page)) {
        sectionOptional = false;
      }
      lastPage = page;
    }

    const price = it.total_price ?? 0;
    const isBanner = Math.abs(price) < BANNER_PRICE_THRESHOLD &&
      (it.quantity === null || it.quantity === 0);

    // Banner-row detection: update section state, classify the banner
    // itself as optional so it does not inflate main totals, and move
    // on.
    if (isBanner) {
      const optBanner = matchMarker(haystack, OPTIONAL_SECTION_BANNER_MARKERS);
      const mainBanner = matchMarker(haystack, MAIN_SECTION_BANNER_MARKERS);
      if (mainBanner && !optBanner) {
        sectionOptional = false;
      } else if (optBanner) {
        sectionOptional = true;
      }
    }

    // Tier 3: row-level classification.
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

    const optMatch = matchMarker(haystack, OPTIONAL_ROW_MARKERS);
    if (optMatch) {
      sourceCounts.row_description_optional++;
      return {
        ...it,
        scope_category: "optional" as const,
        scope_marker_label: "optional" as const,
        scope_marker_source: "row_description_optional" as const,
        scope_marker_evidence: optMatch,
      };
    }

    if (sectionOptional) {
      sourceCounts.section_banner_optional++;
      return {
        ...it,
        scope_category: "optional" as const,
        scope_marker_label: "optional" as const,
        scope_marker_source: "section_banner_optional" as const,
        scope_marker_evidence: "in_optional_section",
      };
    }

    if (page !== null && optionalPages.has(page)) {
      sourceCounts.page_header_optional++;
      return {
        ...it,
        scope_category: "optional" as const,
        scope_marker_label: "optional" as const,
        scope_marker_source: "page_header_optional" as const,
        scope_marker_evidence: `page_${page}`,
      };
    }

    sourceCounts.default_main++;
    return {
      ...it,
      scope_category: "main" as const,
      scope_marker_label: "main" as const,
      scope_marker_source: "default_main" as const,
      scope_marker_evidence: null,
    };
  });

  const summary = summarise(
    out,
    Date.now() - start,
    sourceCounts,
    Array.from(optionalPages).sort((a, b) => a - b),
  );
  console.log(
    `[scopeMarkerDetection] done items=${out.length} main=${summary.main_count} ` +
      `optional=${summary.optional_count} excluded=${summary.excluded_count} ` +
      `main_total=${summary.main_total} optional_total=${summary.optional_total} ` +
      `excluded_total=${summary.excluded_total} ` +
      `optional_pages=${JSON.stringify(summary.optional_pages)} ` +
      `runtime_ms=${summary.runtime_ms}`,
  );
  return { items: out, summary };
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function detectOptionalPages(
  pages: { pageNum: number; text: string }[],
): Set<number> {
  const optional = new Set<number>();
  for (const p of pages) {
    const header = (p.text ?? "").slice(0, 600);
    const hasMain = MAIN_PAGE_HEADER_MARKERS.some((re) => re.test(header));
    if (hasMain) continue;
    const hasOptional = OPTIONAL_PAGE_HEADER_MARKERS.some((re) =>
      re.test(header)
    );
    if (hasOptional) optional.add(p.pageNum);
  }
  return optional;
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
  optional_pages: number[],
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
    optional_pages,
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
      section_banner_optional: 0,
      page_header_optional: 0,
      default_main: 0,
    },
    optional_pages: [],
    runtime_ms,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
