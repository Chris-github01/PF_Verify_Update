/**
 * Consensus Totals Engine
 *
 * After final row classification (Main / Optional / Excluded), compute a single
 * authoritative set of totals that combines:
 *   - summed row totals per scope
 *   - explicit labelled totals parsed from the raw document text
 *
 * Priority (consensus):
 *   1. If document grand_total AND optional_total are both labelled,
 *      main_total = grand_total - optional_total
 *   2. Else if document main_total / subtotal is explicitly labelled, use it
 *   3. Else use the summed Main rows
 *
 * grand_total priority: labelled > (main + optional) > summed rows
 */

export type ConsensusScope = "Main" | "Optional" | "Excluded";

export interface ScopedRow {
  description?: string;
  qty?: number | null;
  unit?: string | null;
  rate?: number | null;
  total?: number | null;
  scope?: ConsensusScope | "main" | "optional" | "excluded" | null;
}

export interface LabelledTotals {
  grand_total: number | null;
  main_total: number | null;
  optional_total: number | null;
  excluded_total: number | null;
  subtotal: number | null;
  labels_found: Array<{ label: string; value: number; kind: "grand" | "main" | "optional" | "excluded" | "subtotal"; position: number }>;
}

export interface TotalsEvidenceSnapshot {
  resolution_source: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  tolerance_applied: { absolute: number; percent: number; effective: number };
  labelled: LabelledTotals;
  summed: { main: number; optional: number; excluded: number };
  final: { main: number; optional: number; excluded: number; grand: number };
  delta_vs_labelled_grand: number | null;
  within_tolerance: boolean | null;
  dual_option_suspected: boolean;
  dual_option_reasons: string[];
  distinct_grand_totals: number[];
  page_footer_totals_found: boolean;
  notes: string[];
  decided_at: string;
}

export interface ConsensusTotalsResult {
  main_total: number;
  optional_total: number;
  excluded_total: number;
  grand_total: number;
  resolution_source:
    | "consensus[grand-optional]"
    | "consensus[labelled-main]"
    | "consensus[main+optional]"
    | "labelled_grand_total"
    | "summed_main_rows"
    | "summed_rows_fallback";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  summed_main: number;
  summed_optional: number;
  summed_excluded: number;
  labelled: LabelledTotals;
  notes: string[];
  requires_review: boolean;
  review_reason: string | null;
  evidence: TotalsEvidenceSnapshot;
}

/**
 * Compute the reconciliation tolerance for a labelled grand total.
 * Per product spec: tolerance = max(1% of value, $1).
 */
export function computeTotalsTolerance(value: number): { absolute: number; percent: number; effective: number } {
  const absolute = 1;
  const percent = Math.abs(value) * 0.01;
  const effective = Math.max(absolute, percent);
  return { absolute, percent, effective };
}

/** Parse a currency-ish number from raw text, tolerating $, commas, and trailing decimals. */
function parseCurrency(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.\-]/g, "").replace(/(\..*)\./g, "$1");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

const LABEL_GROUPS: Array<{ kind: LabelledTotals["labels_found"][number]["kind"]; patterns: RegExp[] }> = [
  {
    kind: "grand",
    patterns: [
      /\b(grand\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(quote\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(total\s*(?:\(ex|excl\.?|excluding)\s*gst\)?)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(contract\s*sum)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(total\s*(?:price|amount|contract|tender))\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ],
  },
  {
    kind: "optional",
    patterns: [
      /\b(optional\s*(?:extras?|items?|scope)\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(total\s*optional(?:\s*extras?)?)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(add\s*alternates?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(provisional\s*sums?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ],
  },
  {
    kind: "main",
    patterns: [
      /\b(base\s*scope\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(main\s*scope\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(scope\s*of\s*works\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ],
  },
  {
    kind: "excluded",
    patterns: [
      /\b(excluded\s*(?:items?|scope)?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(exclusions?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ],
  },
  {
    kind: "subtotal",
    patterns: [
      /\b(sub\s*-?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ],
  },
];

export function parseLabelledTotals(rawText: string): LabelledTotals {
  const out: LabelledTotals = {
    grand_total: null,
    main_total: null,
    optional_total: null,
    excluded_total: null,
    subtotal: null,
    labels_found: [],
  };
  if (!rawText) return out;

  for (const group of LABEL_GROUPS) {
    for (const pattern of group.patterns) {
      const g = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = g.exec(rawText)) !== null) {
        const label = m[1];
        const value = parseCurrency(m[2] ?? "");
        if (value === null || value <= 0) continue;
        out.labels_found.push({ label, value, kind: group.kind, position: m.index });
      }
    }
  }

  // Prefer the LAST-OCCURRING labelled total per kind (footer bias).
  // Suppliers typically state the authoritative total at the bottom of the
  // document; earlier occurrences are usually running subtotals or per-section
  // breakdowns that should not be treated as the canonical value. Falling back
  // to "largest" previously caused inflated optional totals and incorrect main
  // resolution when a section subtotal happened to exceed the true footer total.
  const pickLastOccurring = (kind: LabelledTotals["labels_found"][number]["kind"]): number | null => {
    const hits = out.labels_found.filter((l) => l.kind === kind);
    if (hits.length === 0) return null;
    // Already in match-emit order (forward scan per pattern), but patterns are
    // scanned in declared order per kind — sort by position to guarantee
    // document-order selection regardless of pattern iteration.
    hits.sort((a, b) => a.position - b.position);
    return hits[hits.length - 1].value;
  };

  out.grand_total = pickLastOccurring("grand");
  out.main_total = pickLastOccurring("main");
  out.optional_total = pickLastOccurring("optional");
  out.excluded_total = pickLastOccurring("excluded");
  out.subtotal = pickLastOccurring("subtotal");
  return out;
}

function normalizeScope(s: ScopedRow["scope"]): ConsensusScope {
  if (!s) return "Main";
  const v = String(s).toLowerCase();
  if (v === "optional") return "Optional";
  if (v === "excluded") return "Excluded";
  return "Main";
}

function sumBy(rows: ScopedRow[], scope: ConsensusScope): number {
  return rows.reduce((acc, r) => {
    if (normalizeScope(r.scope) !== scope) return acc;
    const t = Number(r.total ?? 0);
    return acc + (Number.isFinite(t) ? t : 0);
  }, 0);
}

/**
 * Run consensus total resolution.
 * Produces final main/optional/excluded/grand totals and a resolution_source tag.
 */
export function resolveConsensusTotals(
  rows: ScopedRow[],
  rawText: string,
): ConsensusTotalsResult {
  const labelled = parseLabelledTotals(rawText);
  const summed_main = round2(sumBy(rows, "Main"));
  const summed_optional = round2(sumBy(rows, "Optional"));
  const summed_excluded = round2(sumBy(rows, "Excluded"));
  const notes: string[] = [];

  let main_total: number;
  let optional_total: number;
  let excluded_total: number;
  let grand_total: number;
  let resolution_source: ConsensusTotalsResult["resolution_source"];
  let confidence: ConsensusTotalsResult["confidence"];

  const hasLabelledGrand = labelled.grand_total !== null && labelled.grand_total > 0;
  const hasLabelledOptional = labelled.optional_total !== null && labelled.optional_total > 0;
  const hasLabelledMain = labelled.main_total !== null && labelled.main_total > 0;
  const hasLabelledSubtotal = labelled.subtotal !== null && labelled.subtotal > 0;
  const hasLabelledExcluded = labelled.excluded_total !== null && labelled.excluded_total > 0;

  // Strict precedence per product spec:
  //   1. Explicit labelled totals (labelled main / subtotal)
  //   2. Grand total minus optionals (both labelled)
  //   3. Classified row sums (Main + Optional)
  //   4. Raw row_sum fallback
  const raw_row_sum = round2(summed_main + summed_optional + summed_excluded);

  if (hasLabelledMain || hasLabelledSubtotal) {
    // Priority 1: explicit labelled main total
    main_total = round2((hasLabelledMain ? labelled.main_total : labelled.subtotal) as number);
    optional_total = hasLabelledOptional ? round2(labelled.optional_total as number) : summed_optional;
    excluded_total = hasLabelledExcluded ? round2(labelled.excluded_total as number) : summed_excluded;
    grand_total = hasLabelledGrand ? round2(labelled.grand_total as number) : round2(main_total + optional_total);
    resolution_source = "consensus[labelled-main]";
    confidence = "HIGH";
    notes.push(`P1: main = labelled ${hasLabelledMain ? "main_total" : "subtotal"}(${main_total})`);
  } else if (hasLabelledGrand && hasLabelledOptional) {
    // Priority 2: grand - optional
    grand_total = round2(labelled.grand_total as number);
    optional_total = round2(labelled.optional_total as number);
    main_total = round2(Math.max(0, grand_total - optional_total));
    excluded_total = hasLabelledExcluded ? round2(labelled.excluded_total as number) : summed_excluded;
    resolution_source = "consensus[grand-optional]";
    confidence = "HIGH";
    notes.push(`P2: main = labelled grand(${grand_total}) - labelled optional(${optional_total})`);
  } else if (hasLabelledGrand) {
    // Priority 2 (partial): labelled grand only
    grand_total = round2(labelled.grand_total as number);
    optional_total = summed_optional;
    excluded_total = hasLabelledExcluded ? round2(labelled.excluded_total as number) : summed_excluded;
    main_total = summed_optional > 0 ? round2(Math.max(0, grand_total - summed_optional)) : round2(grand_total);
    resolution_source = "labelled_grand_total";
    confidence = "MEDIUM";
    notes.push(`P2-partial: main = labelled grand(${grand_total}) - summed optional(${summed_optional})`);
  } else if (summed_main > 0 || summed_optional > 0) {
    // Priority 3: classified row sums
    main_total = summed_main;
    optional_total = summed_optional;
    excluded_total = summed_excluded;
    grand_total = round2(summed_main + summed_optional);
    resolution_source = "consensus[main+optional]";
    confidence = summed_main > 0 ? "MEDIUM" : "LOW";
    notes.push(`P3: grand = summed main(${summed_main}) + summed optional(${summed_optional})`);
  } else if (raw_row_sum > 0) {
    // Priority 4: raw row_sum fallback
    main_total = raw_row_sum;
    optional_total = 0;
    excluded_total = summed_excluded;
    grand_total = raw_row_sum;
    resolution_source = "summed_rows_fallback";
    confidence = "LOW";
    notes.push(`P4: raw_row_sum(${raw_row_sum}) — no labels, no classification`);
  } else {
    main_total = 0;
    optional_total = 0;
    excluded_total = summed_excluded;
    grand_total = 0;
    resolution_source = "summed_rows_fallback";
    confidence = "LOW";
    notes.push("no labelled totals and no priced rows — review required");
  }

  // Sanity: reconcile labelled grand vs main+optional using tolerance = max(1%, $1).
  // Was previously a flat 2% which caused false-positive HIGH on small-value quotes.
  const tolerance = computeTotalsTolerance(labelled.grand_total ?? grand_total);
  let deltaVsLabelled: number | null = null;
  let withinTolerance: boolean | null = null;
  if (hasLabelledGrand && resolution_source !== "consensus[grand-optional]") {
    const calc = main_total + optional_total;
    const labelledGrand = labelled.grand_total as number;
    if (labelledGrand > 0) {
      const absDelta = Math.abs(calc - labelledGrand);
      deltaVsLabelled = round2(absDelta);
      withinTolerance = absDelta <= tolerance.effective;
      if (!withinTolerance) {
        confidence = confidence === "HIGH" ? "MEDIUM" : "LOW";
        notes.push(
          `labelled grand(${labelledGrand}) disagrees with main+optional(${round2(calc)}) by $${round2(absDelta)} ` +
          `(tolerance max(1%,$1) = $${round2(tolerance.effective)})`
        );
      } else {
        notes.push(`within tolerance: delta $${round2(absDelta)} <= $${round2(tolerance.effective)}`);
      }
    }
  }

  // Dual-option PDF detection (generic, no supplier rules).
  // Signal A: >=2 distinct labelled grand totals at distant positions.
  // Signal B: summed_main exceeds labelled_grand by >=40% with optional scope
  //           not accounting for the overflow (rows from 2 options collapsed).
  // Signal C: >=2 subtotal labels each ~= a separate grand value (option blocks).
  const dual_option_reasons: string[] = [];
  const grandLabels = labelled.labels_found.filter((l) => l.kind === "grand");
  const distinctGrands = Array.from(
    new Set(grandLabels.map((l) => round2(l.value))),
  ).filter((v) => v > 0);
  if (distinctGrands.length >= 2) {
    const minPos = Math.min(...grandLabels.map((l) => l.position));
    const maxPos = Math.max(...grandLabels.map((l) => l.position));
    if (maxPos - minPos > 1000) {
      dual_option_reasons.push(
        `multiple distinct grand totals at distant positions: [${distinctGrands.join(", ")}] spread=${maxPos - minPos}`,
      );
    }
  }
  if (hasLabelledGrand) {
    const lg = labelled.grand_total as number;
    const mainOverflowRatio = lg > 0 ? summed_main / lg : 0;
    const uncoveredOverflow = summed_main - (lg + summed_optional);
    if (mainOverflowRatio >= 1.4 && uncoveredOverflow > tolerance.effective) {
      dual_option_reasons.push(
        `summed_main(${summed_main}) exceeds labelled_grand(${lg}) by ${(mainOverflowRatio * 100 - 100).toFixed(0)}% — suggests two options merged`,
      );
    }
  }
  const subtotalLabels = labelled.labels_found.filter((l) => l.kind === "subtotal");
  const distinctSubtotals = Array.from(
    new Set(subtotalLabels.map((l) => round2(l.value))),
  ).filter((v) => v > 0);
  if (
    distinctSubtotals.length >= 2 &&
    distinctGrands.length >= 2 &&
    Math.min(...distinctSubtotals) > 0
  ) {
    const ratio = Math.max(...distinctSubtotals) / Math.min(...distinctSubtotals);
    if (ratio >= 1.15 && ratio <= 3) {
      dual_option_reasons.push(
        `multiple subtotals of different magnitudes alongside multiple grand totals — option blocks suspected`,
      );
    }
  }
  const dual_option_suspected = dual_option_reasons.length > 0;
  if (dual_option_suspected) {
    notes.push(`dual-option PDF suspected: ${dual_option_reasons.join("; ")}`);
  }

  const page_footer_totals_found = grandLabels.length > 0 || labelled.subtotal !== null;

  // No negative main totals ever (Priority rule 4).
  if (main_total < 0) {
    notes.push(`main_total clamp: raw ${main_total} < 0 — forced to 0`);
    main_total = 0;
  }
  if (optional_total < 0) optional_total = 0;
  if (excluded_total < 0) excluded_total = 0;

  // Review gate: raw-row-sum fallback is explicitly untrusted.
  let requires_review = false;
  let review_reason: string | null = null;
  if (resolution_source === "summed_rows_fallback") {
    requires_review = true;
    review_reason = "totals resolved via raw row-sum fallback — no labelled totals and no classified rows";
  } else if (confidence === "LOW") {
    requires_review = true;
    review_reason = "totals confidence LOW";
  } else if (!(grand_total > 0)) {
    requires_review = true;
    review_reason = "zero grand total";
  } else if (withinTolerance === false) {
    // Priority rule 6: if uncertain -> review_required.
    requires_review = true;
    review_reason = `labelled grand vs main+optional outside tolerance (delta $${deltaVsLabelled})`;
    confidence = confidence === "HIGH" ? "MEDIUM" : confidence;
  } else if (dual_option_suspected) {
    requires_review = true;
    review_reason = `dual-option quote suspected — ${dual_option_reasons[0]}`;
    confidence = confidence === "HIGH" ? "MEDIUM" : confidence;
  } else if (
    !hasLabelledGrand &&
    !hasLabelledMain &&
    !hasLabelledSubtotal &&
    summed_main + summed_optional > 0
  ) {
    // No labelled evidence whatsoever — uncertain by definition.
    requires_review = true;
    review_reason = "no labelled totals found in document — totals inferred from row sums only";
    confidence = "LOW";
  }

  const evidence: TotalsEvidenceSnapshot = {
    resolution_source,
    confidence,
    tolerance_applied: tolerance,
    labelled,
    summed: { main: summed_main, optional: summed_optional, excluded: summed_excluded },
    final: { main: main_total, optional: optional_total, excluded: excluded_total, grand: grand_total },
    delta_vs_labelled_grand: deltaVsLabelled,
    within_tolerance: withinTolerance,
    dual_option_suspected,
    dual_option_reasons,
    distinct_grand_totals: distinctGrands,
    page_footer_totals_found,
    notes: [...notes],
    decided_at: new Date().toISOString(),
  };

  return {
    main_total,
    optional_total,
    excluded_total,
    grand_total,
    resolution_source,
    confidence,
    summed_main,
    summed_optional,
    summed_excluded,
    labelled,
    notes,
    requires_review,
    review_reason,
    evidence,
  };
}

/**
 * Confidence ordering helper. HIGH > MEDIUM > LOW.
 * Used by the writer to prevent lower-confidence reparses from overwriting
 * a previously-stored HIGH confidence totals decision.
 */
export function confidenceRank(c: string | null | undefined): number {
  if (c === "HIGH") return 3;
  if (c === "MEDIUM") return 2;
  if (c === "LOW") return 1;
  return 0;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
