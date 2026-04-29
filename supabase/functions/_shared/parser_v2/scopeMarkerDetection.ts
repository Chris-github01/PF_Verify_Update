/**
 * Stage 10 v14 — Per-Page Banner Scope Classifier (2026-04-29).
 *
 * Generic, structural algorithm. No material-name heuristics. No
 * quote-tailored regexes.
 *
 * Per page:
 *   1. Starting state is Main.
 *   2. Scan the page text for banner lines: "OPTIONAL SCOPE",
 *      "OPTIONAL EXTRAS", "OPTIONAL ITEMS", "MAIN SCOPE",
 *      "ITEMS IDENTIFIED ON DRAWINGS". Each banner flips state at its
 *      offset within the page.
 *   3. Classify each item anchored to that page by its in-page offset
 *      relative to those banner events.
 *
 * Rules:
 *   - State does NOT carry across page boundaries. Every page starts
 *     Main unless it opens with an Optional banner before any item.
 *   - Items with an explicit row-level exclusion marker ("by others",
 *     "not included", "excluded", "nic") are Excluded regardless of
 *     banner state.
 *   - Items without a resolvable source_page default to Main.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";

export const SCOPE_MARKER_DETECTION_VERSION =
  "v14-per-page-banner-2026-04-29";
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
  heading_events: { page: number; offset: number; type: "optional" | "main"; text: string }[];
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
// Generic banner vocabulary. Applied per line within each page.
// --------------------------------------------------------------------------

const OPTIONAL_BANNER_PATTERNS: RegExp[] = [
  /\boptional\s+scope\b/i,
  /\boptional\s+extras?\b/i,
  /\boptional\s+items?\b/i,
];

const MAIN_BANNER_PATTERNS: RegExp[] = [
  /\bmain\s+scope\b/i,
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

type BannerEvent = {
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
  const { items, pages } = input;

  if (items.length === 0) {
    return { items: [], summary: emptySummary(Date.now() - start) };
  }

  // Per-page banner events.
  const pageBanners = new Map<number, BannerEvent[]>();
  const scannedPages: number[] = [];
  const allHeadings: { page: number; offset: number; type: "optional" | "main"; text: string }[] = [];

  for (const p of pages ?? []) {
    const banners = extractBanners(p.text ?? "");
    pageBanners.set(p.pageNum, banners);
    scannedPages.push(p.pageNum);
    for (const b of banners) {
      allHeadings.push({ page: p.pageNum, offset: b.offset, type: b.type, text: b.text });
    }
  }

  const sourceCounts: Record<ScopeMarkerSource, number> = {
    row_description_excluded: 0,
    heading_optional: 0,
    heading_main: 0,
    default_main: 0,
  };

  // Track a per-page in-page cursor so that multiple items on the same
  // page advance monotonically through the page text.
  const pageCursors = new Map<number, number>();

  const out: ScopeMarkerItem[] = items.map((it) => {
    const desc = (it.description ?? "").trim();
    const subScope = (it.sub_scope ?? "").trim();
    const haystack = `${desc} ${subScope}`;

    // Row-level exclusion overrides everything.
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

    const page = (it as { source_page?: number | null }).source_page ?? null;
    const pageText = page !== null
      ? (pages ?? []).find((p) => p.pageNum === page)?.text ?? ""
      : "";
    const banners = page !== null ? pageBanners.get(page) ?? [] : [];

    const cursor = page !== null ? pageCursors.get(page) ?? 0 : 0;
    const { offset, probeLength } = locateInPage(desc, pageText, cursor);

    let state: "main" | "optional" = "main";
    let evidence: string | null = null;
    let resolved = false;

    if (offset >= 0) {
      const banner = mostRecentBanner(banners, offset);
      if (banner) {
        state = banner.type;
        evidence = banner.text;
      }
      resolved = true;
      if (page !== null) {
        pageCursors.set(page, offset + Math.max(probeLength, 1));
      }
    } else if (banners.length > 0) {
      // Item not found in page text but page has banners. Fall back to
      // position-free heuristic: if page has only Optional banners and no
      // Main banner, treat as optional. Otherwise default to main.
      const hasOptional = banners.some((b) => b.type === "optional");
      const hasMain = banners.some((b) => b.type === "main");
      if (hasOptional && !hasMain) {
        state = "optional";
        evidence = banners.find((b) => b.type === "optional")?.text ?? null;
        resolved = true;
      }
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

    if (resolved && evidence) {
      sourceCounts.heading_main++;
    } else {
      sourceCounts.default_main++;
    }
    return {
      ...it,
      scope_category: "main" as const,
      scope_marker_label: "main" as const,
      scope_marker_source:
        resolved && evidence
          ? ("heading_main" as const)
          : ("default_main" as const),
      scope_marker_evidence: evidence,
    };
  });

  const summary = summarise(
    out,
    Date.now() - start,
    sourceCounts,
    allHeadings,
    scannedPages,
  );
  console.log(
    `[scopeMarkerDetection] done items=${out.length} main=${summary.main_count} ` +
      `optional=${summary.optional_count} excluded=${summary.excluded_count} ` +
      `main_total=${summary.main_total} optional_total=${summary.optional_total} ` +
      `excluded_total=${summary.excluded_total} ` +
      `banners=${allHeadings.length} scanned_pages=${scannedPages.join(",")} ` +
      `runtime_ms=${summary.runtime_ms}`,
  );
  return { items: out, summary };
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function extractBanners(pageText: string): BannerEvent[] {
  const events: BannerEvent[] = [];
  if (!pageText) return events;
  const lineRegex = /[^\n]*/g;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(pageText)) !== null) {
    const line = m[0];
    const trimmed = line.trim();
    if (!trimmed) {
      if (m.index === lineRegex.lastIndex) lineRegex.lastIndex++;
      continue;
    }
    // Banners are short dominant lines.
    if (trimmed.length <= 120) {
      const optMatch = matchMarker(trimmed, OPTIONAL_BANNER_PATTERNS);
      const mainMatch = matchMarker(trimmed, MAIN_BANNER_PATTERNS);
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

function mostRecentBanner(
  banners: BannerEvent[],
  offset: number,
): BannerEvent | null {
  let found: BannerEvent | null = null;
  for (const b of banners) {
    if (b.offset <= offset) found = b;
    else break;
  }
  return found;
}

function locateInPage(
  desc: string,
  pageText: string,
  cursor: number,
): { offset: number; probeLength: number } {
  if (!desc || !pageText) return { offset: -1, probeLength: 0 };

  const lowerText = pageText.toLowerCase();
  const lowerDesc = desc.toLowerCase();

  // Tokenise the description into meaningful words and try progressively
  // shorter probes. No material-specific prefix stripping.
  const tokens = lowerDesc
    .replace(/[^a-z0-9\s\/\-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const candidates: string[] = [];
  if (lowerDesc.length >= 6) candidates.push(lowerDesc);
  for (const n of [5, 4, 3, 2]) {
    const probe = tokens.slice(0, n).join(" ");
    if (probe.length >= 6 && !candidates.includes(probe)) {
      candidates.push(probe);
    }
  }

  for (const needle of candidates) {
    let idx = lowerText.indexOf(needle, cursor);
    if (idx === -1 && cursor > 0) idx = lowerText.indexOf(needle);
    if (idx !== -1) return { offset: idx, probeLength: needle.length };
  }

  return { offset: -1, probeLength: 0 };
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
  headings: { page: number; offset: number; type: "optional" | "main"; text: string }[],
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
      page: h.page,
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
