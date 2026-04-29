/**
 * Stage 10 — Scope Marker Detection.
 *
 * Thin adapter that delegates to detectScopeMarkersV2. V2 receives the
 * structured line items only (no raw OCR re-scans), classifies each row
 * as main / optional / excluded / unknown using section markers, and
 * returns summary totals + counts for debug output.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";
import {
  detectScopeMarkersV2,
  type ScopeClassification,
  type ScopeMarkerOutputItem,
} from "../scopeMarkerDetectionV2.ts";

export const SCOPE_MARKER_DETECTION_VERSION = "v18-detectScopeMarkersV2-stable-2026-04-29";
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

function toOutputLabel(scope: ScopeClassification): ScopeMarkerLabel {
  if (scope === "optional") return "optional";
  if (scope === "excluded") return "excluded";
  return "main";
}

export function runScopeMarkerDetection(input: ScopeMarkerInput): ScopeMarkerResult {
  const start = Date.now();
  const { items } = input;

  if (items.length === 0) {
    return {
      items: [],
      summary: {
        version: SCOPE_MARKER_DETECTION_VERSION,
        main_count: 0,
        optional_count: 0,
        excluded_count: 0,
        unknown_count: 0,
        main_total: 0,
        optional_total: 0,
        excluded_total: 0,
        runtime_ms: Date.now() - start,
      },
    };
  }

  const mapped = items.map((it, idx) => ({
    ...it,
    line_id: idx + 1,
    section_title: it.source_section ?? undefined,
    block: it.building_or_block ?? undefined,
    service: it.sub_scope ?? undefined,
    service_type: it.sub_scope ?? undefined,
    value: it.total_price ?? 0,
  }));

  const result = detectScopeMarkersV2({ items: mapped });

  const outItems: ScopeMarkerItem[] = result.items.map((r: ScopeMarkerOutputItem) => {
    const label = toOutputLabel(r.scope);
    const original = r as unknown as ParsedLineItemV2 & ScopeMarkerOutputItem;
    return {
      ...(original as ParsedLineItemV2),
      scope_category: label,
      scope_marker_label: label,
      scope_marker_source: r.scope_section,
      scope_marker_evidence: r.scope_reason ?? null,
      scope_reason: r.scope_reason,
      scope_confidence: r.scope_confidence,
      scope_section: r.scope_section,
    };
  });

  const summary: ScopeMarkerSummary = {
    version: SCOPE_MARKER_DETECTION_VERSION,
    main_count: result.summary.main_count,
    optional_count: result.summary.optional_count,
    excluded_count: result.summary.excluded_count,
    unknown_count: result.summary.unknown_count,
    main_total: Number(result.summary.main_total.toFixed(2)),
    optional_total: Number(result.summary.optional_total.toFixed(2)),
    excluded_total: Number(result.summary.excluded_total.toFixed(2)),
    runtime_ms: Date.now() - start,
  };

  console.log(
    `[scopeMarkerDetection] v18 stable items=${outItems.length} ` +
      `main=${summary.main_count} optional=${summary.optional_count} ` +
      `excluded=${summary.excluded_count} main_total=${summary.main_total} ` +
      `optional_total=${summary.optional_total} runtime_ms=${summary.runtime_ms}`,
  );

  return { items: outItems, summary };
}
