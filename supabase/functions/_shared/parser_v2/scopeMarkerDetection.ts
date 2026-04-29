/**
 * Stage 10 v15 — Trust-LLM Pass-Through Scope Classifier (2026-04-29).
 *
 * The upstream LLM extractor (extractPassiveFire.ts) is already prompted to
 * emit a per-row scope_category using the quote's own page banners, block
 * headers and "By others" markers. Re-deriving that downstream from raw
 * page text produced brittle results tailored to individual quotes.
 *
 * This module is now a generic pass-through:
 *
 *   1. If the row text contains a universal exclusion marker
 *      ("by others", "not included", "excluded", "nic", "no allowance",
 *      "by main contractor", "by client"), classify as Excluded.
 *   2. Otherwise, normalise the LLM-provided scope_category verbatim:
 *        "optional"  -> optional
 *        "excluded"  -> excluded
 *        anything else / missing -> main
 *
 * No banner scanning, no page offsets, no material vocabulary.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";

export const SCOPE_MARKER_DETECTION_VERSION =
  "v15-trust-llm-passthrough-2026-04-29";
console.log(
  `[scopeMarkerDetection] MODULE_LOAD version=${SCOPE_MARKER_DETECTION_VERSION}`,
);

export type ScopeMarkerLabel = "main" | "optional" | "excluded";

export type ScopeMarkerSource =
  | "row_description_excluded"
  | "llm_optional"
  | "llm_excluded"
  | "llm_main"
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

const EXCLUDED_ROW_MARKERS: RegExp[] = [
  /\bby\s+others\b/i,
  /\bby\s+main\s+contractor\b/i,
  /\bby\s+client\b/i,
  /\bnot\s+included\b/i,
  /\bno\s+allowance\b/i,
  /\bexcluded\s+items?\b/i,
  /\bexclusions?\b/i,
  /(?:^|[^a-z])excluded(?:[^a-z]|$)/i,
  /(?:^|[^a-z])nic(?:[^a-z]|$)/i,
];

export function runScopeMarkerDetection(
  input: ScopeMarkerInput,
): ScopeMarkerResult {
  const start = Date.now();
  const { items } = input;

  const sourceCounts: Record<ScopeMarkerSource, number> = {
    row_description_excluded: 0,
    llm_optional: 0,
    llm_excluded: 0,
    llm_main: 0,
    default_main: 0,
  };

  if (items.length === 0) {
    return {
      items: [],
      summary: buildSummary([], Date.now() - start, sourceCounts),
    };
  }

  const out: ScopeMarkerItem[] = items.map((it) => {
    const desc = (it.description ?? "").trim();
    const subScope = (it.sub_scope ?? "").trim();
    const haystack = `${desc} ${subScope}`;

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

    const llm = normaliseLlmLabel(
      (it as { scope_category?: string | null }).scope_category,
    );

    if (llm === "optional") {
      sourceCounts.llm_optional++;
      return {
        ...it,
        scope_category: "optional" as const,
        scope_marker_label: "optional" as const,
        scope_marker_source: "llm_optional" as const,
        scope_marker_evidence: null,
      };
    }

    if (llm === "excluded") {
      sourceCounts.llm_excluded++;
      return {
        ...it,
        scope_category: "excluded" as const,
        scope_marker_label: "excluded" as const,
        scope_marker_source: "llm_excluded" as const,
        scope_marker_evidence: null,
      };
    }

    if (llm === "main") {
      sourceCounts.llm_main++;
      return {
        ...it,
        scope_category: "main" as const,
        scope_marker_label: "main" as const,
        scope_marker_source: "llm_main" as const,
        scope_marker_evidence: null,
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

  const summary = buildSummary(out, Date.now() - start, sourceCounts);
  console.log(
    `[scopeMarkerDetection] done items=${out.length} main=${summary.main_count} ` +
      `optional=${summary.optional_count} excluded=${summary.excluded_count} ` +
      `main_total=${summary.main_total} optional_total=${summary.optional_total} ` +
      `excluded_total=${summary.excluded_total} runtime_ms=${summary.runtime_ms}`,
  );
  return { items: out, summary };
}

function normaliseLlmLabel(
  raw: string | null | undefined,
): "main" | "optional" | "excluded" | null {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  if (v === "optional" || v.startsWith("optional")) return "optional";
  if (v === "excluded" || v.startsWith("exclud") || v === "nic") {
    return "excluded";
  }
  if (v === "main" || v.startsWith("main") || v === "included") return "main";
  return null;
}

function matchMarker(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

function buildSummary(
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
