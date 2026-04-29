export type ScopeClassification = "main" | "optional" | "excluded" | "unknown";

export interface ScopeMarkerInputItem {
  line_id?: string | number;
  lineNumber?: string | number;
  description?: string;
  service?: string;
  service_type?: string;
  block?: string;
  section_title?: string;
  page?: number;
  value?: number;
  total?: number;
  [key: string]: any;
}

export interface ScopeMarkerOutputItem extends ScopeMarkerInputItem {
  scope: ScopeClassification;
  scope_reason: string;
  scope_confidence: number;
  scope_marker?: string;
  scope_section?: string;
}

export interface ScopeMarkerDetectionResult {
  items: ScopeMarkerOutputItem[];
  summary: {
    main_count: number;
    optional_count: number;
    excluded_count: number;
    unknown_count: number;
    main_total: number;
    optional_total: number;
    excluded_total: number;
  };
  markers_found: string[];
  warnings: string[];
}

const OPTIONAL_MARKERS = [
  "OPTIONAL SCOPE",
  "OPTIONAL EXTRA",
  "OPTIONAL EXTRAS",
  "ADD TO SCOPE",
  "CONFIRMATION REQUIRED",
  "PROVISIONAL OPTIONAL",
];

const MAIN_RESET_MARKERS = [
  "FIRE STOPPING PENETRATION SCHEDULE",
  "SERVICES IDENTIFIED NOT PART OF PASSIVE FIRE SCHEDULE",
  "MAIN SCOPE",
  "BASE SCOPE",
  "INCLUDED SCOPE",
  "SCOPE OF WORKS",
];

const EXCLUSION_MARKERS = [
  "EXCLUDED",
  "EXCLUSIONS",
  "BY OTHERS",
  "NOT INCLUDED",
  "NO ALLOWANCE",
  "N.I.C",
  "NIC",
];

function normaliseText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function moneyValue(item: ScopeMarkerInputItem): number {
  const raw = item.value ?? item.total ?? (item as any).total_price ?? 0;
  if (typeof raw === "number") return raw;
  const parsed = Number(String(raw).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function itemText(item: ScopeMarkerInputItem): string {
  return normaliseText([
    item.section_title,
    item.block,
    item.service,
    item.service_type,
    item.description,
  ].filter(Boolean).join(" "));
}

function hasAny(text: string, markers: string[]): string | null {
  return markers.find((m) => text.includes(m)) ?? null;
}

/**
 * Replacement for Stage 10: Scope Marker Detection.
 *
 * Purpose:
 * - Classify every extracted line item as main / optional / excluded / unknown.
 * - Uses document section markers, not only item wording.
 * - Critical rule:
 *   Once OPTIONAL SCOPE appears inside a block/table, all following rows remain optional
 *   until a new block/table/main reset marker appears.
 */
export function detectScopeMarkersV2(params: {
  items: ScopeMarkerInputItem[];
  rawText?: string;
  pageTexts?: Array<{ page: number; text: string }>;
}): ScopeMarkerDetectionResult {
  const { items } = params;

  const warnings: string[] = [];
  const markers_found: string[] = [];

  let activeScope: ScopeClassification = "main";
  let activeSection = "Default Main Scope";
  let activeBlock = "";

  const sortedItems = [...items].sort((a, b) => {
    const ap = Number(a.page ?? 0);
    const bp = Number(b.page ?? 0);
    const al = Number(a.line_id ?? a.lineNumber ?? 0);
    const bl = Number(b.line_id ?? b.lineNumber ?? 0);
    return ap - bp || al - bl;
  });

  const output: ScopeMarkerOutputItem[] = [];

  for (const item of sortedItems) {
    const text = itemText(item);
    const sectionTitle = normaliseText(item.section_title);
    const desc = normaliseText(item.description);
    const service = normaliseText(item.service);
    const block = normaliseText(item.block);

    if (block && block !== activeBlock) {
      activeBlock = block;
      activeScope = "main";
      activeSection = `${block} Main Scope`;
      markers_found.push(`BLOCK_RESET:${block}`);
    }

    const optionalMarker =
      hasAny(sectionTitle, OPTIONAL_MARKERS) ||
      hasAny(text, OPTIONAL_MARKERS);

    const mainResetMarker =
      hasAny(sectionTitle, MAIN_RESET_MARKERS) ||
      hasAny(text, MAIN_RESET_MARKERS);

    const exclusionMarker =
      hasAny(sectionTitle, EXCLUSION_MARKERS) ||
      hasAny(desc, EXCLUSION_MARKERS) ||
      hasAny(service, EXCLUSION_MARKERS);

    if (mainResetMarker && !optionalMarker) {
      activeScope = "main";
      activeSection = mainResetMarker;
      markers_found.push(mainResetMarker);
    }

    if (optionalMarker) {
      activeScope = "optional";
      activeSection = optionalMarker;
      markers_found.push(optionalMarker);
    }

    let scope: ScopeClassification = activeScope;
    let reason = `Inherited from active section: ${activeSection}`;
    let confidence = 0.82;
    let scope_marker = activeSection;

    if (exclusionMarker) {
      scope = "excluded";
      reason = `Exclusion marker found: ${exclusionMarker}`;
      confidence = 0.95;
      scope_marker = exclusionMarker;
    }

    if (
      text.includes("OPTIONAL EXTRAS") ||
      desc.includes("FLUSH BOX") ||
      service.includes("OPTIONAL")
    ) {
      scope = "optional";
      reason = "Line item contains optional wording or belongs to optional extras section.";
      confidence = 0.96;
      scope_marker = "OPTIONAL LINE WORDING";
    }

    if (
      service.includes("ARCHITECTURAL/STRUCTURAL") &&
      activeScope === "optional"
    ) {
      scope = "optional";
      reason = "Architectural/Structural item appears under OPTIONAL SCOPE section.";
      confidence = 0.96;
      scope_marker = "OPTIONAL SCOPE";
    }

    output.push({
      ...item,
      scope,
      scope_reason: reason,
      scope_confidence: confidence,
      scope_marker,
      scope_section: activeSection,
    });
  }

  const main_total = output
    .filter((i) => i.scope === "main")
    .reduce((sum, i) => sum + moneyValue(i), 0);

  const optional_total = output
    .filter((i) => i.scope === "optional")
    .reduce((sum, i) => sum + moneyValue(i), 0);

  const excluded_total = output
    .filter((i) => i.scope === "excluded")
    .reduce((sum, i) => sum + moneyValue(i), 0);

  if (!output.some((i) => i.scope === "optional")) {
    warnings.push("No optional line items detected.");
  }

  return {
    items: output,
    summary: {
      main_count: output.filter((i) => i.scope === "main").length,
      optional_count: output.filter((i) => i.scope === "optional").length,
      excluded_count: output.filter((i) => i.scope === "excluded").length,
      unknown_count: output.filter((i) => i.scope === "unknown").length,
      main_total: Number(main_total.toFixed(2)),
      optional_total: Number(optional_total.toFixed(2)),
      excluded_total: Number(excluded_total.toFixed(2)),
    },
    markers_found: [...new Set(markers_found)],
    warnings,
  };
}
