/**
 * validateTotals — reconciles extracted line totals against labelled totals
 * in the document.
 *
 * Priority chain (first passing rule wins):
 *   1. labelled_grand_and_subtotal   grand ≈ subtotal + optional
 *   2. labelled_grand_minus_optional grand and optional present, derive main
 *   3. labelled_grand_match_rows     grand matches summed main rows
 *   4. lump_sum_direct               single-row lump sum
 *   5. inflation_guard               row sum >> labelled grand, trust labels
 *   6. summed_rows                   no labels, trust rows
 *   7. no_labels_available           nothing usable (ok=false)
 *
 * Phase 3 upgrades:
 *   - Collects every labelled grand-total candidate with its position so
 *     dual/multi-option quotes can be isolated instead of collapsing into
 *     one inflated sum.
 *   - Rejects per-section subtotals ("BUILDING 1 Total", "Basement Total",
 *     "Block A Sub-Total", etc.) from the grand pool.
 *   - Exposes variants / grand_candidates / dual_option_suspected so
 *     mapToQuotesTable can surface them to the UI.
 *
 * GST-aware: when a labelled total is "excl GST" and another labelled total
 * is "incl GST" they are both captured, and the higher is treated as the
 * grand total while the lower is exposed as sub_total.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";

export type GrandCandidate = {
  value: number;
  position: number;
  label: string;
  flavour: "incl_gst" | "excl_gst" | "generic";
};

export type TotalsValidation = {
  ok: boolean;
  main_total: number;
  optional_total: number;
  excluded_total: number;
  grand_total: number;
  resolution_source:
    | "labelled_grand_and_subtotal"
    | "labelled_grand_minus_optional"
    | "labelled_grand_match_rows"
    | "summed_rows"
    | "inflation_guard"
    | "lump_sum_direct"
    | "no_labels_available";
  labelled: {
    grand: number | null;
    subtotal: number | null;
    optional: number | null;
    excl_gst: number | null;
    incl_gst: number | null;
    gst: number | null;
  };
  anomalies: string[];
  grand_candidates: GrandCandidate[];
  variants: GrandCandidate[];
  dual_option_suspected: boolean;
  primary_variant_index: number | null;
};

const LABEL_RES = {
  grand_incl_gst:
    /\b(?:total\s+(?:incl|inc|including)\s*(?:\.?\s*gst|g\.s\.t)|grand\s+total\s+(?:incl|inc|including)\s*(?:\.?\s*gst)?)\s*[:\s$]*([\d,]+\.?\d*)/gi,
  grand_excl_gst:
    /\b(?:total\s+(?:excl|ex|excluding)\s*(?:\.?\s*gst|g\.s\.t)|grand\s+total\s+(?:excl|ex|excluding)\s*(?:\.?\s*gst)?|sub[-\s]?total\s+(?:excl|ex)\s*gst)\s*[:\s$]*([\d,]+\.?\d*)/gi,
  grand_generic:
    /\b(?:grand\s*total|quote\s*total|contract\s*total|tender\s*total|total\s*(?:price|amount)?)\s*[:\s$]*([\d,]+\.?\d*)/gi,
  subtotal: /\bsub[-\s]?total\s*[:\s$]*([\d,]+\.?\d*)/i,
  optional:
    /\b(?:optional\s*(?:scope|total|items?)|provisional\s*sum(?:s)?|alternate\s*pricing|separate\s*price|ps\s*allowance)\s*[:\s$]*([\d,]+\.?\d*)/i,
  gst_line: /\b(?:gst|g\.s\.t|goods\s*and\s*services\s*tax)\s*(?:\(?\s*1[05]\s*%\)?)?\s*[:\s$]*([\d,]+\.?\d*)/i,
};

// Phrases that indicate a per-section / per-building subtotal — NEVER a
// grand-total candidate even when followed by the word "total".
const SECTION_PREFIX_RE =
  /\b(?:building|block|level|basement|tower|stage|section|area|zone|floor|apartment|unit|lot|wing)\s*[\dA-Za-z]{0,3}\b[^\n]{0,30}$/i;

const VARIANT_DISTANCE = 1500; // chars between candidate positions to count as separate variants

export function validateTotals(
  items: ParsedLineItemV2[],
  rawText: string,
): TotalsValidation {
  const anomalies: string[] = [];

  const mainSum = round2(sum(items.filter((i) => i.scope_category === "main")));
  const optSum = round2(sum(items.filter((i) => i.scope_category === "optional")));
  const excSum = round2(sum(items.filter((i) => i.scope_category === "excluded")));

  const grand_candidates = collectGrandCandidates(rawText);
  const variants = clusterVariants(grand_candidates);
  const dual_option_suspected = variants.length >= 2;
  if (dual_option_suspected) anomalies.push("dual_option_suspected");

  const labelled = readLabelled(rawText, grand_candidates);

  const grand = pickGrandTotal(labelled, variants);
  const primary_variant_index = dual_option_suspected && grand != null
    ? variants.findIndex((v) => Math.abs(v.value - grand) < 0.01)
    : null;

  const subtotal = labelled.subtotal ?? labelled.excl_gst;
  const optional = labelled.optional;

  const tolerance = (n: number) => Math.max(1, Math.abs(n) * 0.01);

  const base = {
    labelled,
    grand_candidates,
    variants,
    dual_option_suspected,
    primary_variant_index,
  };

  // Rule 1: grand + subtotal + optional all present and consistent
  if (grand != null && subtotal != null && optional != null) {
    const reconstructed = subtotal + optional;
    if (Math.abs(reconstructed - grand) <= tolerance(grand)) {
      return {
        ...base,
        ok: true,
        main_total: subtotal,
        optional_total: optional,
        excluded_total: excSum,
        grand_total: grand,
        resolution_source: "labelled_grand_and_subtotal",
        anomalies,
      };
    }
    anomalies.push("labelled_grand_subtotal_optional_mismatch");
  }

  // Rule 2: grand + optional known, derive main
  if (grand != null && optional != null) {
    const main = round2(grand - optional);
    if (main >= 0) {
      return {
        ...base,
        ok: true,
        main_total: main,
        optional_total: optional,
        excluded_total: excSum,
        grand_total: grand,
        resolution_source: "labelled_grand_minus_optional",
        anomalies,
      };
    }
  }

  // Rule 3: grand ≈ summed main rows
  if (grand != null && mainSum > 0 && Math.abs(mainSum - grand) <= tolerance(grand)) {
    return {
      ...base,
      ok: true,
      main_total: mainSum,
      optional_total: optSum,
      excluded_total: excSum,
      grand_total: grand,
      resolution_source: "labelled_grand_match_rows",
      anomalies,
    };
  }

  // Rule 4: lump-sum single-row
  if (items.length === 1 && items[0].total_price != null) {
    const v = items[0].total_price;
    return {
      ...base,
      ok: true,
      main_total: v,
      optional_total: 0,
      excluded_total: 0,
      grand_total: v,
      resolution_source: "lump_sum_direct",
      anomalies,
    };
  }

  // Rule 5: inflation guard
  if (grand != null && mainSum > grand * 1.3) {
    anomalies.push("inflation_guard_triggered");
    return {
      ...base,
      ok: true,
      main_total: subtotal ?? grand,
      optional_total: optional ?? 0,
      excluded_total: excSum,
      grand_total: grand,
      resolution_source: "inflation_guard",
      anomalies,
    };
  }

  // Rule 6: fall back to summed rows
  if (mainSum > 0 || optSum > 0) {
    if (grand != null) {
      const delta = Math.abs(mainSum + optSum - grand);
      if (delta > tolerance(grand)) {
        anomalies.push(`summed_rows_vs_labelled_grand_delta_${delta.toFixed(2)}`);
      }
    }
    return {
      ...base,
      ok: true,
      main_total: mainSum,
      optional_total: optSum,
      excluded_total: excSum,
      grand_total: round2(mainSum + optSum),
      resolution_source: "summed_rows",
      anomalies,
    };
  }

  // Rule 7: nothing usable
  anomalies.push("no_totals_available");
  return {
    ...base,
    ok: false,
    main_total: 0,
    optional_total: 0,
    excluded_total: 0,
    grand_total: 0,
    resolution_source: "no_labels_available",
    anomalies,
  };
}

function collectGrandCandidates(text: string): GrandCandidate[] {
  const out: GrandCandidate[] = [];
  scanInto(text, LABEL_RES.grand_incl_gst, "incl_gst", out);
  scanInto(text, LABEL_RES.grand_excl_gst, "excl_gst", out);
  scanInto(text, LABEL_RES.grand_generic, "generic", out);
  return dedupeCandidates(out).sort((a, b) => a.position - b.position);
}

function scanInto(
  text: string,
  re: RegExp,
  flavour: GrandCandidate["flavour"],
  out: GrandCandidate[],
): void {
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    const value = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) continue;
    const precede = text.slice(Math.max(0, m.index - 60), m.index);
    if (SECTION_PREFIX_RE.test(precede)) continue;
    out.push({
      value: round2(value),
      position: m.index,
      label: m[0].slice(0, 80),
      flavour,
    });
  }
}

function dedupeCandidates(xs: GrandCandidate[]): GrandCandidate[] {
  const seen = new Map<string, GrandCandidate>();
  for (const c of xs) {
    const key = `${c.value.toFixed(2)}|${Math.round(c.position / 50)}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

function clusterVariants(candidates: GrandCandidate[]): GrandCandidate[] {
  const byValue = new Map<string, GrandCandidate>();
  for (const c of candidates) {
    const key = c.value.toFixed(2);
    const existing = byValue.get(key);
    if (!existing) byValue.set(key, c);
  }
  const unique = [...byValue.values()].sort((a, b) => a.position - b.position);
  if (unique.length < 2) return unique;

  const distinctlySpaced = unique.filter((c, i, arr) => {
    if (i === 0) return true;
    return c.position - arr[i - 1].position >= VARIANT_DISTANCE;
  });
  return distinctlySpaced.length >= 2 ? distinctlySpaced : unique;
}

function readLabelled(
  text: string,
  candidates: GrandCandidate[],
): TotalsValidation["labelled"] {
  const byFlavour = (f: GrandCandidate["flavour"]): number | null => {
    const hits = candidates.filter((c) => c.flavour === f);
    if (hits.length === 0) return null;
    return hits.reduce((max, c) => (c.value > max ? c.value : max), hits[0].value);
  };

  return {
    grand: byFlavour("generic"),
    subtotal: readLabel(text, LABEL_RES.subtotal),
    optional: readLabel(text, LABEL_RES.optional),
    excl_gst: byFlavour("excl_gst"),
    incl_gst: byFlavour("incl_gst"),
    gst: readLabel(text, LABEL_RES.gst_line),
  };
}

function pickGrandTotal(
  l: TotalsValidation["labelled"],
  variants: GrandCandidate[],
): number | null {
  if (variants.length >= 2) {
    return variants.reduce((max, c) => (c.value > max ? c.value : max), variants[0].value);
  }
  if (l.incl_gst != null && l.excl_gst != null) {
    return Math.max(l.incl_gst, l.excl_gst);
  }
  if (l.incl_gst != null) return l.incl_gst;
  if (l.excl_gst != null) return l.excl_gst;
  return l.grand;
}

function sum(items: ParsedLineItemV2[]): number {
  return items.reduce((a, i) => a + (i.total_price ?? 0), 0);
}

function readLabel(text: string, re: RegExp): number | null {
  const flags = re.flags.includes("g") ? re.flags : re.flags;
  const r = new RegExp(re.source, flags);
  const m = text.match(r);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
