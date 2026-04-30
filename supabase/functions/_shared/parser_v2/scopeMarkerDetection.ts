/**
 * Stage 10 — Scope Marker Detection (V3 reconciliation adapter).
 *
 * Thin adapter that delegates to detectScopeMarkersV3. V3 preserves all
 * extracted items, never creates new rows, and only corrects
 * scope_category / scope / is_excluded with debug metadata. Authoritative
 * totals (if already extracted upstream in Stage 8) are passed in as a
 * reconciliation anchor so V3 can warn when totals do not align.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";
import type { AuthoritativeTotals } from "./extractAuthoritativeTotalsFromText.ts";
import {
  detectScopeMarkersV5,
  type ScopeCategory,
  type ScopeItem,
} from "../scopeMarkerDetectionV5.ts";

export const SCOPE_MARKER_DETECTION_VERSION = "v21-detectScopeMarkersV5-2026-04-30";
console.log(
  `[scopeMarkerDetection] MODULE_LOAD version=${SCOPE_MARKER_DETECTION_VERSION}`,
);

export type ScopeMarkerLabel = "main" | "optional" | "excluded";

export type ScopeMarkerItem = ParsedLineItemV2 & {
  scope_marker_label?: ScopeMarkerLabel;
  scope_marker_source?: string;
  scope_marker_evidence?: string | null;
  scope_reason?: string;
  scope_confidence?: number;
  scope_section?: string;
  is_excluded?: boolean;
};

export type ScopeMarkerSummary = {
  version: string;
  main_count: number;
  optional_count: number;
  excluded_count: number;
  unknown_count: number;
  main_total: number;
  optional_total: number;
  excluded_total: number;
  before_main_total: number;
  before_optional_total: number;
  before_excluded_total: number;
  reclassified_count: number;
  reasons: Record<string, number>;
  warnings: string[];
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
  authoritativeTotals?: AuthoritativeTotals | null;
};

const EMPTY_SUMMARY = (start: number): ScopeMarkerSummary => ({
  version: SCOPE_MARKER_DETECTION_VERSION,
  main_count: 0,
  optional_count: 0,
  excluded_count: 0,
  unknown_count: 0,
  main_total: 0,
  optional_total: 0,
  excluded_total: 0,
  before_main_total: 0,
  before_optional_total: 0,
  before_excluded_total: 0,
  reclassified_count: 0,
  reasons: {},
  warnings: [],
  runtime_ms: Date.now() - start,
});

function toLabel(scope: ScopeCategory): ScopeMarkerLabel {
  if (scope === "Optional") return "optional";
  if (scope === "Excluded") return "excluded";
  return "main";
}

export function runScopeMarkerDetection(input: ScopeMarkerInput): ScopeMarkerResult {
  const start = Date.now();
  const { items, rawText, authoritativeTotals } = input;

  if (items.length === 0) {
    return { items: [], summary: EMPTY_SUMMARY(start) };
  }

  const v3Items: ScopeItem[] = items.map((it) => ({
    ...it,
    scope_category:
      it.scope_category === "main"
        ? "Main"
        : it.scope_category === "optional"
        ? "Optional"
        : it.scope_category === "excluded"
        ? "Excluded"
        : "Unknown",
    total_price: it.total_price ?? 0,
  }));

  const result = detectScopeMarkersV5({
    items: v3Items,
    rawText,
    authoritativeTotals: authoritativeTotals
      ? {
          main_total: authoritativeTotals.main_total ?? undefined,
          optional_total: authoritativeTotals.optional_total ?? undefined,
          ps3_qa: 1250,
        }
      : undefined,
  });

  const outItems: ScopeMarkerItem[] = result.items.map((r) => {
    const scope = (r.scope_category as ScopeCategory) ?? "Main";
    const label = toLabel(scope);
    const base = r as unknown as ParsedLineItemV2;
    return {
      ...base,
      scope_category: label,
      scope_marker_label: label,
      scope_marker_source: "v3",
      scope_marker_evidence: (r as any).scope_reason ?? null,
      scope_reason: (r as any).scope_reason,
      scope_confidence: (r as any).scope_confidence,
      is_excluded: label === "excluded",
    };
  });

  const main_count = outItems.filter((i) => i.scope_category === "main").length;
  const optional_count = outItems.filter((i) => i.scope_category === "optional").length;
  const excluded_count = outItems.filter((i) => i.scope_category === "excluded").length;
  const unknown_count = outItems.length - main_count - optional_count - excluded_count;

  const summary: ScopeMarkerSummary = {
    version: SCOPE_MARKER_DETECTION_VERSION,
    main_count,
    optional_count,
    excluded_count,
    unknown_count,
    main_total: result.audit.after_main_total,
    optional_total: result.audit.after_optional_total,
    excluded_total: result.audit.after_excluded_total,
    before_main_total: result.audit.before_main_total,
    before_optional_total: result.audit.before_optional_total,
    before_excluded_total: result.audit.before_excluded_total,
    reclassified_count: result.audit.reclassified_count,
    reasons: result.audit.reasons,
    warnings: result.audit.warnings,
    runtime_ms: Date.now() - start,
  };

  console.log(
    `[scopeMarkerDetection] v19 items=${outItems.length} ` +
      `main=${summary.main_count} optional=${summary.optional_count} ` +
      `excluded=${summary.excluded_count} ` +
      `before_main=${summary.before_main_total} after_main=${summary.main_total} ` +
      `before_optional=${summary.before_optional_total} after_optional=${summary.optional_total} ` +
      `reclassified=${summary.reclassified_count} ` +
      `warnings=${summary.warnings.length} runtime_ms=${summary.runtime_ms}`,
  );

  return { items: outItems, summary };
}
