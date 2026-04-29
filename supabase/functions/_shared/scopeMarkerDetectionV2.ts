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
];

const MAIN_RESET_MARKERS = [
  "FIRE STOPPING PENETRATION SCHEDULE",
  "MAIN SCOPE",
  "BASE SCOPE",
  "INCLUDED SCOPE",
];

const EXCLUSION_MARKERS = [
  "EXCLUDED",
  "BY OTHERS",
  "NOT INCLUDED",
  "NO ALLOWANCE",
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

export function detectScopeMarkersV2(params: {
  items: ScopeMarkerInputItem[];
}): ScopeMarkerDetectionResult {
  const { items } = params;

  let activeScope: ScopeClassification = "main";
  let activeBlock = "";

  const output: ScopeMarkerOutputItem[] = [];

  for (const item of items) {
    const text = itemText(item);
    const desc = normaliseText(item.description);
    const block = normaliseText(item.block);

    if (block && block !== activeBlock) {
      activeBlock = block;
      activeScope = "main";
    }

    if (hasAny(text, OPTIONAL_MARKERS)) {
      activeScope = "optional";
    }

    if (hasAny(text, MAIN_RESET_MARKERS)) {
      activeScope = "main";
    }

    let scope: ScopeClassification = activeScope;
    let confidence = 0.85;
    let reason = `Inherited from section`;

    if (hasAny(desc, EXCLUSION_MARKERS)) {
      scope = "excluded";
      confidence = 0.95;
      reason = "Exclusion marker detected";
    }

    if (desc.includes("FLUSH BOX")) {
      scope = "optional";
      confidence = 0.95;
      reason = "Optional flush box detected";
    }

    output.push({
      ...item,
      scope,
      scope_reason: reason,
      scope_confidence: confidence,
      scope_section: activeScope,
    });
  }

  const main_total = output
    .filter((i) => i.scope === "main")
    .reduce((sum, i) => sum + moneyValue(i), 0);

  const optional_total = output
    .filter((i) => i.scope === "optional")
    .reduce((sum, i) => sum + moneyValue(i), 0);

  return {
    items: output,
    summary: {
      main_count: output.filter((i) => i.scope === "main").length,
      optional_count: output.filter((i) => i.scope === "optional").length,
      excluded_count: output.filter((i) => i.scope === "excluded").length,
      unknown_count: output.filter((i) => i.scope === "unknown").length,
      main_total,
      optional_total,
      excluded_total: 0,
    },
    markers_found: [],
    warnings: [],
  };
}
