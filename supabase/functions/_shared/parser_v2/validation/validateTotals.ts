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
 * GST-aware: when a labelled total is "excl GST" and another labelled total
 * is "incl GST" they are both captured, and the higher is treated as the
 * grand total while the lower is exposed as sub_total.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";

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
};

const LABEL_RES = {
  grand_incl_gst:
    /\b(?:total\s+(?:incl|inc|including)\s*(?:\.?\s*gst|g\.s\.t)|grand\s+total\s+(?:incl|inc|including)\s*(?:\.?\s*gst)?)\s*[:\s$]*([\d,]+\.?\d*)/i,
  grand_excl_gst:
    /\b(?:total\s+(?:excl|ex|excluding)\s*(?:\.?\s*gst|g\.s\.t)|grand\s+total\s+(?:excl|ex|excluding)\s*(?:\.?\s*gst)?|sub[-\s]?total\s+(?:excl|ex)\s*gst)\s*[:\s$]*([\d,]+\.?\d*)/i,
  grand_generic:
    /\b(?:grand\s*total|quote\s*total|contract\s*total|tender\s*total|total\s*(?:price|amount)?)\s*[:\s$]*([\d,]+\.?\d*)/i,
  subtotal: /\bsub[-\s]?total\s*[:\s$]*([\d,]+\.?\d*)/i,
  optional:
    /\b(?:optional\s*(?:scope|total|items?)|provisional\s*sum(?:s)?|alternate\s*pricing|separate\s*price|ps\s*allowance)\s*[:\s$]*([\d,]+\.?\d*)/i,
  gst_line: /\b(?:gst|g\.s\.t|goods\s*and\s*services\s*tax)\s*(?:\(?\s*1[05]\s*%\)?)?\s*[:\s$]*([\d,]+\.?\d*)/i,
};

export function validateTotals(
  items: ParsedLineItemV2[],
  rawText: string,
): TotalsValidation {
  const anomalies: string[] = [];

  const mainSum = round2(sum(items.filter((i) => i.scope_category === "main")));
  const optSum = round2(sum(items.filter((i) => i.scope_category === "optional")));
  const excSum = round2(sum(items.filter((i) => i.scope_category === "excluded")));

  const labelled = readLabelled(rawText);

  const grand = pickGrandTotal(labelled);
  const subtotal = labelled.subtotal ?? labelled.excl_gst;
  const optional = labelled.optional;

  const tolerance = (n: number) => Math.max(1, Math.abs(n) * 0.01);

  // Rule 1: grand + subtotal + optional all present and consistent
  if (grand != null && subtotal != null && optional != null) {
    const reconstructed = subtotal + optional;
    if (Math.abs(reconstructed - grand) <= tolerance(grand)) {
      return {
        ok: true,
        main_total: subtotal,
        optional_total: optional,
        excluded_total: excSum,
        grand_total: grand,
        resolution_source: "labelled_grand_and_subtotal",
        labelled,
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
        ok: true,
        main_total: main,
        optional_total: optional,
        excluded_total: excSum,
        grand_total: grand,
        resolution_source: "labelled_grand_minus_optional",
        labelled,
        anomalies,
      };
    }
  }

  // Rule 3: grand ≈ summed main rows
  if (grand != null && mainSum > 0 && Math.abs(mainSum - grand) <= tolerance(grand)) {
    return {
      ok: true,
      main_total: mainSum,
      optional_total: optSum,
      excluded_total: excSum,
      grand_total: grand,
      resolution_source: "labelled_grand_match_rows",
      labelled,
      anomalies,
    };
  }

  // Rule 4: lump-sum single-row
  if (items.length === 1 && items[0].total_price != null) {
    const v = items[0].total_price;
    return {
      ok: true,
      main_total: v,
      optional_total: 0,
      excluded_total: 0,
      grand_total: v,
      resolution_source: "lump_sum_direct",
      labelled,
      anomalies,
    };
  }

  // Rule 5: inflation guard
  if (grand != null && mainSum > grand * 1.3) {
    anomalies.push("inflation_guard_triggered");
    return {
      ok: true,
      main_total: subtotal ?? grand,
      optional_total: optional ?? 0,
      excluded_total: excSum,
      grand_total: grand,
      resolution_source: "inflation_guard",
      labelled,
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
      ok: true,
      main_total: mainSum,
      optional_total: optSum,
      excluded_total: excSum,
      grand_total: round2(mainSum + optSum),
      resolution_source: "summed_rows",
      labelled,
      anomalies,
    };
  }

  // Rule 7: nothing usable
  anomalies.push("no_totals_available");
  return {
    ok: false,
    main_total: 0,
    optional_total: 0,
    excluded_total: 0,
    grand_total: 0,
    resolution_source: "no_labels_available",
    labelled,
    anomalies,
  };
}

function readLabelled(text: string): TotalsValidation["labelled"] {
  return {
    grand: readLabel(text, LABEL_RES.grand_generic),
    subtotal: readLabel(text, LABEL_RES.subtotal),
    optional: readLabel(text, LABEL_RES.optional),
    excl_gst: readLabel(text, LABEL_RES.grand_excl_gst),
    incl_gst: readLabel(text, LABEL_RES.grand_incl_gst),
    gst: readLabel(text, LABEL_RES.gst_line),
  };
}

function pickGrandTotal(l: TotalsValidation["labelled"]): number | null {
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
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}


export { validateTotals }