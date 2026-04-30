/**
 * Stage 10 V5 — Rule-based, context-aware scope classifier.
 *
 * Classifies each extracted line into MAIN / OPTIONAL / EXCLUDE using a
 * priority ordering so that noise never contaminates MAIN totals:
 *
 *   1. EXCLUDE  (rates-only, reference-only)
 *   2. OPTIONAL (explicit wording + hidden optional cues)
 *   3. Section-context override
 *   4. MAIN (default)
 *
 * Designed to generalise across Global Fire, Passive Fire NZ, lump sum,
 * hybrid and unknown future formats. No quote-specific hardcoding.
 */

export type ScopeClassification = "MAIN" | "OPTIONAL" | "EXCLUDE";
export type ScopeCategory = "Main" | "Optional" | "Excluded" | "Unknown";

export interface ClassificationResult {
  type: ScopeClassification;
  confidence: number;
  reason: string;
}

export interface LineItem {
  description: string;
  section?: string;
  pageContext?: string;
}

export interface ScopeItem {
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  total_price?: number;
  value?: number;
  total?: number;
  source_section?: string | null;
  section_path?: string[] | null;
  scope_category?: ScopeCategory | string;
  scope?: string;
  is_excluded?: boolean;
  confidence?: number;
  [key: string]: any;
}

export interface ScopeDetectionV5Result {
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

const HARD_EXCLUDE_TERMS = [
  "rate only",
  "rates only",
  "schedule of rates",
  "rates schedule",
  "unit rate",
  "for reference only",
  "budget rate",
  "indicative rate",
];

const EXPLICIT_OPTIONAL_TERMS = [
  "optional",
  "add to scope",
  "client to confirm",
  "confirmation required",
  "tick box",
  "if required",
  "by others (optional context)",
];

const HIDDEN_OPTIONAL_TERMS = [
  "not shown on drawings",
  "estimate items",
  "items not shown",
  "tbc",
  "to be confirmed",
  "provisional",
  "assumed",
  "allowance only",
  "subject to",
];

const OPTIONAL_SECTION_TERMS = [
  "optional scope",
  "items with confirmation",
  "add to scope",
  "confirmation",
];

const EXCLUDE_SECTION_TERMS = [
  "rates",
  "schedule",
  "rate only",
];

function includesAny(text: string, keywords: string[]): string | null {
  for (const k of keywords) {
    if (text.includes(k)) return k;
  }
  return null;
}

export function classifyScopeItem(item: LineItem): ClassificationResult {
  const desc = (item.description ?? "").toLowerCase();
  const section = (item.section ?? "").toLowerCase();
  const pageContext = (item.pageContext ?? "").toLowerCase();
  const text = `${desc} ${section} ${pageContext}`;

  const hardExclude = includesAny(text, HARD_EXCLUDE_TERMS);
  if (hardExclude) {
    return {
      type: "EXCLUDE",
      confidence: 0.98,
      reason: `hard_exclude:${hardExclude}`,
    };
  }

  const explicit = includesAny(text, EXPLICIT_OPTIONAL_TERMS);
  if (explicit) {
    return {
      type: "OPTIONAL",
      confidence: 0.95,
      reason: `explicit_optional:${explicit}`,
    };
  }

  const hidden = includesAny(text, HIDDEN_OPTIONAL_TERMS);
  if (hidden) {
    return {
      type: "OPTIONAL",
      confidence: 0.92,
      reason: `hidden_optional:${hidden}`,
    };
  }

  if (section) {
    const optSection = includesAny(section, OPTIONAL_SECTION_TERMS);
    if (optSection) {
      return {
        type: "OPTIONAL",
        confidence: 0.9,
        reason: `section_optional:${optSection}`,
      };
    }

    const excSection = includesAny(section, EXCLUDE_SECTION_TERMS);
    if (excSection) {
      return {
        type: "EXCLUDE",
        confidence: 0.9,
        reason: `section_exclude:${excSection}`,
      };
    }
  }

  return {
    type: "MAIN",
    confidence: 0.85,
    reason: "default_main",
  };
}

function norm(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
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

function toScopeCategory(t: ScopeClassification): ScopeCategory {
  if (t === "MAIN") return "Main";
  if (t === "OPTIONAL") return "Optional";
  return "Excluded";
}

function resolveSection(item: ScopeItem): string {
  if (item.source_section) return String(item.source_section);
  if (Array.isArray(item.section_path) && item.section_path.length > 0) {
    return item.section_path.join(" > ");
  }
  return "";
}

export function detectScopeMarkersV5(params: {
  items: ScopeItem[];
  rawText?: string;
  authoritativeTotals?: {
    main_total?: number;
    optional_total?: number;
    ps3_qa?: number;
  };
}): ScopeDetectionV5Result {
  const { items, authoritativeTotals } = params;

  const before_main_total = sumBy(items, "Main");
  const before_optional_total = sumBy(items, "Optional");
  const before_excluded_total = sumBy(items, "Excluded");

  const reasons: Record<string, number> = {};
  const warnings: string[] = [];
  let reclassified_count = 0;

  const output = items.map((item) => {
    const beforeScope = norm(item.scope_category ?? item.scope ?? "Unknown");

    const result = classifyScopeItem({
      description: String(item.description ?? ""),
      section: resolveSection(item),
      pageContext: typeof item.pageContext === "string" ? item.pageContext : undefined,
    });

    const nextScope = toScopeCategory(result.type);

    if (norm(nextScope) !== beforeScope) {
      reclassified_count++;
      reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
    }

    return {
      ...item,
      scope_category: nextScope,
      scope: nextScope.toLowerCase(),
      is_excluded: nextScope === "Excluded",
      scope_reason: result.reason,
      scope_confidence: result.confidence,
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
      `Main total does not reconcile. Expected ${authoritativeTotals.main_total}, got ${after_main_total}`,
    );
  }

  if (
    authoritativeTotals?.optional_total &&
    Math.abs(after_optional_total - authoritativeTotals.optional_total) > 10
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
      main_count: output.filter((i) => norm(i.scope_category) === "MAIN").length,
      optional_count: output.filter((i) => norm(i.scope_category) === "OPTIONAL").length,
      excluded_count: output.filter((i) => norm(i.scope_category) === "EXCLUDED").length,
      reclassified_count,
      reasons,
      warnings,
    },
  };
}
