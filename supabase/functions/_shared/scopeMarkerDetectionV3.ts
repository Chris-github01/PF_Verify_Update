/**
 * Stage 10 — Scope Marker Detection V3.
 *
 * Reclassification + reconciliation engine. Never creates rows. Only
 * corrects scope_category / scope / is_excluded and attaches debug
 * metadata, then emits an audit with before/after totals, reclassified
 * count, keyed reasons, and reconciliation warnings.
 */

export type ScopeCategory = "Main" | "Optional" | "Excluded" | "Unknown";

export interface ScopeItem {
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  total_price?: number;
  value?: number;
  total?: number;
  scope_category?: ScopeCategory | string;
  scope?: string;
  is_excluded?: boolean;
  confidence?: number;
  [key: string]: any;
}

export interface ScopeDetectionV3Result {
  items: ScopeItem[];
  audit: {
    before_main_total: number;
    before_optional_total: number;
    before_excluded_total: number;
    after_main_total: number;
    after_optional_total: number;
    after_excluded_total: number;
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
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const parsed = Number(String(raw).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumBy(items: ScopeItem[], scope: ScopeCategory): number {
  return Number(
    items
      .filter((i) => norm(i.scope_category) === norm(scope))
      .reduce((s, i) => s + money(i), 0)
      .toFixed(2),
  );
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function addReason(reasons: Record<string, number>, reason: string) {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

const SERVICE_WORDS = [
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
];

const OPTIONAL_WORDS = [
  "OPTIONAL EXTRA",
  "OPTIONAL EXTRAS",
  "OPTIONAL SCOPE",
  "FLUSH BOX",
  "INTUMESCENT FLUSH BOX",
  "PUTTY PAD",
];

const ARCH_STRUCT_WORDS = [
  "ARCHITECTURAL",
  "ARCHITECTURAL/STRUCTURAL",
  "ARCHITECTURAL STRUCTURAL",
  "STRUCTURAL DETAILS",
  "BEAM",
  "CAVITY BARRIER",
  "SLAB EDGE",
];

const EXCLUSION_WORDS = [
  "BY OTHERS",
  "EXCLUDED",
  "NOT INCLUDED",
  "NO ALLOWANCE",
  "NIC",
  "N.I.C",
];

function detectOptionalArchitecturalFromRawText(rawText?: string): boolean {
  const t = norm(rawText);

  if (!t.includes("OPTIONAL SCOPE") && !t.includes("ADD TO SCOPE")) {
    return false;
  }

  return (
    t.includes("ARCHITECTRAL / STRUCTURAL") ||
    t.includes("ARCHITECTURAL / STRUCTURAL") ||
    t.includes("ARCHITECTURAL/STRUCTURAL") ||
    t.includes("ARCHITECTRAL") ||
    t.includes("STRUCTURAL DETAILS")
  );
}

export function detectScopeMarkersV3(params: {
  items: ScopeItem[];
  rawText?: string;
  authoritativeTotals?: {
    main_total?: number;
    optional_total?: number;
    ps3_qa?: number;
  };
}): ScopeDetectionV3Result {
  const { items, rawText, authoritativeTotals } = params;

  const before_main_total = sumBy(items, "Main");
  const before_optional_total = sumBy(items, "Optional");
  const before_excluded_total = sumBy(items, "Excluded");

  const reasons: Record<string, number> = {};
  const warnings: string[] = [];

  const architecturalIsOptional = detectOptionalArchitecturalFromRawText(rawText);

  let reclassified_count = 0;

  const output = items.map((item) => {
    const beforeScope = norm(item.scope_category || item.scope || "Unknown");
    const desc = norm(item.description);
    const total = money(item);

    let nextScope: ScopeCategory =
      beforeScope === "OPTIONAL"
        ? "Optional"
        : beforeScope === "EXCLUDED"
        ? "Excluded"
        : beforeScope === "MAIN"
        ? "Main"
        : "Unknown";

    let reason = "preserved_existing_scope";

    // Rule 1: PS3 is always Main
    if (desc.includes("PS3") || desc.includes("QA")) {
      nextScope = "Main";
      reason = "ps3_qa_main";
    }

    // Rule 2: Zero-value By Others rows are Excluded
    else if (total === 0 && hasAny(desc, EXCLUSION_WORDS)) {
      nextScope = "Excluded";
      reason = "zero_value_by_others_excluded";
    }

    // Rule 3: Priced rows must not be Excluded unless clearly excluded
    else if (total > 0 && nextScope === "Excluded") {
      if (hasAny(desc, SERVICE_WORDS)) {
        nextScope = "Main";
        reason = "priced_service_not_excluded";
      }
    }

    // Rule 4: Flush boxes / Optional Extras are Optional
    if (hasAny(desc, OPTIONAL_WORDS)) {
      nextScope = "Optional";
      reason = "optional_wording_or_flush_box";
    }

    // Rule 5: Architectural/Structural optional when quote summary says so
    if (
      total > 0 &&
      architecturalIsOptional &&
      hasAny(desc, ARCH_STRUCT_WORDS)
    ) {
      nextScope = "Optional";
      reason = "architectural_structural_under_optional_summary";
    }

    // Rule 6: If still Unknown but looks like service, default Main
    if (nextScope === "Unknown" && hasAny(desc, SERVICE_WORDS)) {
      nextScope = "Main";
      reason = "unknown_service_default_main";
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
      scope_confidence:
        reason === "preserved_existing_scope"
          ? item.confidence ?? 0.85
          : 0.96,
    };
  });

  const after_main_total = sumBy(output, "Main");
  const after_optional_total = sumBy(output, "Optional");
  const after_excluded_total = sumBy(output, "Excluded");

  if (
    authoritativeTotals?.main_total &&
    Math.abs(after_main_total - authoritativeTotals.main_total) > 5
  ) {
    warnings.push(
      `Main total does not reconcile. Expected ${authoritativeTotals.main_total}, got ${after_main_total}`,
    );
  }

  if (
    authoritativeTotals?.optional_total &&
    Math.abs(after_optional_total - authoritativeTotals.optional_total) > 5
  ) {
    warnings.push(
      `Optional total does not reconcile. Expected ${authoritativeTotals.optional_total}, got ${after_optional_total}`,
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
      reclassified_count,
      reasons,
      warnings,
    },
  };
}
