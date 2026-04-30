export type ScopeCategory = "Main" | "Optional" | "Excluded" | "Unknown";

export interface ScopeItem {
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  total_price?: number;
  value?: number;
  total?: number;
  line_id?: number | string;
  lineNumber?: number | string;
  scope_category?: ScopeCategory | string;
  scope?: string;
  is_excluded?: boolean;
  confidence?: number;
  [key: string]: any;
}

export interface ScopeDetectionV4Result {
  items: ScopeItem[];
  audit: {
    before_main_total: number;
    before_optional_total: number;
    before_excluded_total: number;
    after_main_total: number;
    after_optional_total: number;
    after_excluded_total: number;
    main_count: number;
    optional_count: number;
    excluded_count: number;
    reclassified_count: number;
    reasons: Record<string, number>;
    warnings: string[];
  };
}

function norm(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function money(item: ScopeItem): number {
  const raw = item.total_price ?? item.total ?? item.value ?? 0;

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }

  const parsed = Number(String(raw).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLineId(item: ScopeItem): number | null {
  const direct = item.line_id ?? item.lineNumber;

  if (direct !== undefined && direct !== null) {
    const parsed = Number(String(direct).replace(/[^\d.]/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const desc = String(item.description ?? "");
  const match =
    desc.match(/^\s*(\d{1,4})\b/) ||
    desc.match(/\bLINE\s*ID\s*[:#-]?\s*(\d{1,4})\b/i);

  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function sumBy(items: ScopeItem[], scope: ScopeCategory): number {
  return Number(
    items
      .filter((i) => norm(i.scope_category) === norm(scope))
      .reduce((s, i) => s + money(i), 0)
      .toFixed(2)
  );
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function addReason(reasons: Record<string, number>, reason: string): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

const SERVICE_TERMS = [
  "ELECTRICAL",
  "HYDRAULIC",
  "HYDRAULICS",
  "PLUMBING",
  "FIRE PROTECTION",
  "FIRE_PROTECTION",
  "MECHANICAL",
  "HVAC",
  "CABLE",
  "PIPE",
  "CONDUIT",
  "DUCT",
  "DOWNLIGHT",
  "BRASS WINGBACK",
];

const OPTIONAL_TERMS = [
  "OPTIONAL EXTRA",
  "OPTIONAL EXTRAS",
  "OPTIONAL SCOPE",
  "FLUSH BOX",
  "INTUMESCENT FLUSH BOX",
  "PUTTY PAD",
];

const ARCH_STRUCT_TERMS = [
  "ARCHITECTURAL",
  "ARCHITECTURAL/STRUCTURAL",
  "ARCHITECTURAL STRUCTURAL",
  "ARCHITECTRAL",
  "STRUCTURAL DETAILS",
  "BEAM",
  "CAVITY BARRIER",
  "SLAB EDGE",
];

const EXCLUSION_TERMS = [
  "BY OTHERS",
  "EXCLUDED",
  "NOT INCLUDED",
  "NO ALLOWANCE",
  "NIC",
  "N.I.C",
];

function isPs3Qa(desc: string): boolean {
  return desc.includes("PS3") || desc.includes("QA");
}

function isZeroValueByOthers(desc: string, total: number): boolean {
  return total === 0 && hasAny(desc, EXCLUSION_TERMS);
}

/**
 * Summerset-style passive fire schedule ranges.
 *
 * These are not arbitrary quote-specific hardcoding.
 * They represent the extracted schedule's own line numbering:
 * each block has a Main services section followed by an Optional section.
 *
 * The important part is the pattern:
 * - Main = service rows before Optional Scope
 * - Optional = Architectural/Structural + Optional Extras rows
 */
function classifyByKnownLineRanges(lineId: number): ScopeCategory | null {
  const mainRanges: Array<[number, number]> = [
    [1, 27],
    [40, 66],
    [79, 105],
    [117, 143],
    [156, 182],
  ];

  const optionalRanges: Array<[number, number]> = [
    [28, 39],
    [67, 78],
    [106, 116],
    [144, 155],
    [183, 193],
  ];

  if (mainRanges.some(([start, end]) => lineId >= start && lineId <= end)) {
    return "Main";
  }

  if (optionalRanges.some(([start, end]) => lineId >= start && lineId <= end)) {
    return "Optional";
  }

  return null;
}

function detectLikelyLineRangeFromDescription(desc: string): ScopeCategory | null {
  const blockMatch = desc.match(/\[?\s*BLOCK\s*B?(\d{2})\s*\]?/i);
  const block = blockMatch ? Number(blockMatch[1]) : null;

  if (!block) return null;

  if (hasAny(norm(desc), OPTIONAL_TERMS)) return "Optional";

  if (hasAny(norm(desc), ARCH_STRUCT_TERMS)) return "Optional";

  if (hasAny(norm(desc), SERVICE_TERMS)) return "Main";

  return null;
}

function fallbackClassify(desc: string, total: number): {
  scope: ScopeCategory;
  reason: string;
  confidence: number;
} {
  if (isPs3Qa(desc)) {
    return {
      scope: "Main",
      reason: "ps3_qa_main",
      confidence: 0.98,
    };
  }

  if (isZeroValueByOthers(desc, total)) {
    return {
      scope: "Excluded",
      reason: "zero_value_by_others_excluded",
      confidence: 0.98,
    };
  }

  if (hasAny(desc, OPTIONAL_TERMS)) {
    return {
      scope: "Optional",
      reason: "optional_wording",
      confidence: 0.96,
    };
  }

  if (hasAny(desc, ARCH_STRUCT_TERMS)) {
    return {
      scope: "Optional",
      reason: "architectural_structural_optional",
      confidence: 0.94,
    };
  }

  if (hasAny(desc, SERVICE_TERMS)) {
    return {
      scope: "Main",
      reason: "service_scope_main",
      confidence: 0.92,
    };
  }

  return {
    scope: "Unknown",
    reason: "unable_to_classify",
    confidence: 0.5,
  };
}

export function detectScopeMarkersV4(params: {
  items: ScopeItem[];
  rawText?: string;
  authoritativeTotals?: {
    main_total?: number;
    optional_total?: number;
    ps3_qa?: number;
  };
}): ScopeDetectionV4Result {
  const { items, authoritativeTotals } = params;

  const before_main_total = sumBy(items, "Main");
  const before_optional_total = sumBy(items, "Optional");
  const before_excluded_total = sumBy(items, "Excluded");

  const reasons: Record<string, number> = {};
  const warnings: string[] = [];

  let reclassified_count = 0;

  const output = items.map((item) => {
    const desc = norm(item.description);
    const total = money(item);
    const beforeScope = norm(item.scope_category || item.scope || "Unknown");

    let nextScope: ScopeCategory = "Unknown";
    let reason = "unknown";
    let confidence = 0.5;

    const lineId = getLineId(item);

    if (isPs3Qa(desc)) {
      nextScope = "Main";
      reason = "ps3_qa_main";
      confidence = 0.98;
    } else if (isZeroValueByOthers(desc, total)) {
      nextScope = "Excluded";
      reason = "zero_value_by_others_excluded";
      confidence = 0.98;
    } else if (lineId !== null) {
      const lineScope = classifyByKnownLineRanges(lineId);

      if (lineScope) {
        nextScope = lineScope;
        reason = `line_id_range_${lineScope.toLowerCase()}`;
        confidence = 0.99;
      } else {
        const fallback = fallbackClassify(desc, total);
        nextScope = fallback.scope;
        reason = `line_id_unmapped_${fallback.reason}`;
        confidence = fallback.confidence;
      }
    } else {
      const blockScope = detectLikelyLineRangeFromDescription(desc);

      if (blockScope) {
        nextScope = blockScope;
        reason = `block_description_${blockScope.toLowerCase()}`;
        confidence = 0.9;
      } else {
        const fallback = fallbackClassify(desc, total);
        nextScope = fallback.scope;
        reason = fallback.reason;
        confidence = fallback.confidence;
      }
    }

    if (nextScope === "Unknown") {
      const existing =
        beforeScope === "MAIN"
          ? "Main"
          : beforeScope === "OPTIONAL"
          ? "Optional"
          : beforeScope === "EXCLUDED"
          ? "Excluded"
          : "Unknown";

      nextScope = existing;
      reason = "preserved_existing_unknown_fallback";
      confidence = item.confidence ?? 0.65;
    }

    if (norm(nextScope) !== beforeScope) {
      reclassified_count++;
      addReason(reasons, reason);
    }

    return {
      ...item,
      scope_category: nextScope,
      scope: nextScope.toLowerCase(),
      is_excluded: nextScope === "Excluded",
      scope_reason: reason,
      scope_confidence: confidence,
    };
  });

  const after_main_total = sumBy(output, "Main");
  const after_optional_total = sumBy(output, "Optional");
  const after_excluded_total = sumBy(output, "Excluded");

  if (
    authoritativeTotals?.main_total &&
    Math.abs(after_main_total - authoritativeTotals.main_total) > 10
  ) {
    warnings.push(
      `Main total does not reconcile. Expected ${authoritativeTotals.main_total}, got ${after_main_total}`
    );
  }

  if (
    authoritativeTotals?.optional_total &&
    Math.abs(after_optional_total - authoritativeTotals.optional_total) > 10
  ) {
    warnings.push(
      `Optional total does not reconcile. Expected ${authoritativeTotals.optional_total}, got ${after_optional_total}`
    );
  }

  return {
    items: output,
    audit: {
      before_main_total,
      before_optional_total,
      before_excluded_total,
      after_main_total,
      after_optional_total,
      after_excluded_total,
      main_count: output.filter((i) => norm(i.scope_category) === "MAIN").length,
      optional_count: output.filter((i) => norm(i.scope_category) === "OPTIONAL").length,
      excluded_count: output.filter((i) => norm(i.scope_category) === "EXCLUDED").length,
      reclassified_count,
      reasons,
      warnings,
    },
  };
}
