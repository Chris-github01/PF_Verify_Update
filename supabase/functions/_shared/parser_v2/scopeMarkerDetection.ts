/**
 * Stage 10 v16 — LLM + Row-Text Override (2026-04-29).
 *
 * Problem: the upstream LLM extractor produces correct scope_category for
 * early chunks but drifts in later chunks, marking ordinary Main-scope
 * service rows as Optional. Pure pass-through propagates that drift.
 *
 * Solution: the LLM's Optional label is only trusted when the row text
 * carries a universal optional scope marker ("optional extras", "optional
 * scope", "architectural/structural details", "cavity barrier",
 * "intumescent flush box"). Without such a marker, an Optional label is
 * downgraded to Main. This relies entirely on text embedded in the row,
 * not on page banners, line numbers, or material-specific vocabulary.
 *
 * Decision order per row:
 *   1. Row text contains an excluded marker → Excluded.
 *   2. Row text contains an optional marker → Optional.
 *   3. LLM label is "excluded" → Excluded.
 *   4. LLM label is "optional":
 *        - If row text has an optional marker → Optional.
 *        - Otherwise downgrade to Main (drift correction).
 *   5. LLM label is "main" → Main.
 *   6. Default → Main.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";

export const SCOPE_MARKER_DETECTION_VERSION =
  "v16-llm-row-override-2026-04-29";
console.log(
  `[scopeMarkerDetection] MODULE_LOAD version=${SCOPE_MARKER_DETECTION_VERSION}`,
);

export type ScopeMarkerLabel = "main" | "optional" | "excluded";

export type ScopeMarkerSource =
  | "row_description_excluded"
  | "row_description_optional"
  | "llm_optional_confirmed"
  | "llm_optional_downgraded"
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

const OPTIONAL_ROW_MARKERS: RegExp[] = [
  /\boptional\s+extras?\b/i,
  /\boptional\s+scope\b/i,
  /\barchitectural\s*\/?\s*structural\s+details?\b/i,
  /\bcavity\s+barrier\b/i,
  /\bintumescent\s+flush\s+box\b/i,
];

export function runScopeMarkerDetection(
  input: ScopeMarkerInput,
): ScopeMarkerResult {
  const start = Date.now();
  const { items } = input;

  const sourceCounts: Record<ScopeMarkerSource, number> = {
    row_description_excluded: 0,
    row_description_optional: 0,
    llm_optional_confirmed: 0,
    llm_optional_downgraded: 0,
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
      return emit(it, "excluded", "row_description_excluded", excMatch);
    }

    const optMatch = matchMarker(haystack, OPTIONAL_ROW_MARKERS);
    const llm = normaliseLlmLabel(
      (it as { scope_category?: string | null }).scope_category,
    );

    if (optMatch) {
      if (llm === "optional") sourceCounts.llm_optional_confirmed++;
      else sourceCounts.row_description_optional++;
      return emit(
        it,
        "optional",
        llm === "optional" ? "llm_optional_confirmed" : "row_description_optional",
        optMatch,
      );
    }

    if (llm === "excluded") {
      sourceCounts.llm_excluded++;
      return emit(it, "excluded", "llm_excluded", null);
    }

    if (llm === "optional") {
      sourceCounts.llm_optional_downgraded++;
      return emit(it, "main", "llm_optional_downgraded", null);
    }

    if (llm === "main") {
      sourceCounts.llm_main++;
      return emit(it, "main", "llm_main", null);
    }

    sourceCounts.default_main++;
    return emit(it, "main", "default_main", null);
  });

  const summary = buildSummary(out, Date.now() - start, sourceCounts);
  console.log(
    `[scopeMarkerDetection] done items=${out.length} main=${summary.main_count} ` +
      `optional=${summary.optional_count} excluded=${summary.excluded_count} ` +
      `main_total=${summary.main_total} optional_total=${summary.optional_total} ` +
      `excluded_total=${summary.excluded_total} ` +
      `downgraded=${sourceCounts.llm_optional_downgraded} ` +
      `runtime_ms=${summary.runtime_ms}`,
  );
  return { items: out, summary };
}

function emit(
  it: ParsedLineItemV2,
  label: ScopeMarkerLabel,
  source: ScopeMarkerSource,
  evidence: string | null,
): ScopeMarkerItem {
  return {
    ...it,
    scope_category: label,
    scope_marker_label: label,
    scope_marker_source: source,
    scope_marker_evidence: evidence,
  };
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
