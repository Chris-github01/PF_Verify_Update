/**
 * validateTotals — reconciles extracted line totals against labelled totals
 * in the document. Mirrors the priority chain used by legacy consensusTotals
 * but trimmed to the fields parser_v2 cares about.
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
    | "summed_rows"
    | "inflation_guard"
    | "lump_sum_direct"
    | "no_labels_available";
  labelled: {
    grand: number | null;
    subtotal: number | null;
    optional: number | null;
  };
  anomalies: string[];
};

const LABEL_RES = {
  grand: /\b(?:grand\s*total|quote\s*total|contract\s*total|total\s*(?:price|amount|excl|inc)?)\s*[:\s$]*([\d,]+\.?\d*)/i,
  subtotal: /\bsub[-\s]?total\s*[:\s$]*([\d,]+\.?\d*)/i,
  optional: /\b(?:optional\s*scope|optional\s*total|provisional\s*sum)\s*[:\s$]*([\d,]+\.?\d*)/i,
};

export function validateTotals(
  items: ParsedLineItemV2[],
  rawText: string,
): TotalsValidation {
  const anomalies: string[] = [];

  const mainSum = sum(items.filter((i) => i.scope_category === "main"));
  const optSum = sum(items.filter((i) => i.scope_category === "optional"));
  const excSum = sum(items.filter((i) => i.scope_category === "excluded"));

  const labelled = {
    grand: readLabel(rawText, LABEL_RES.grand),
    subtotal: readLabel(rawText, LABEL_RES.subtotal),
    optional: readLabel(rawText, LABEL_RES.optional),
  };

  const tolerance = (n: number) => Math.max(1, n * 0.01);

  if (labelled.grand != null && labelled.subtotal != null && labelled.optional != null) {
    const reconstructed = labelled.subtotal + labelled.optional;
    if (Math.abs(reconstructed - labelled.grand) <= tolerance(labelled.grand)) {
      return {
        ok: true,
        main_total: labelled.subtotal,
        optional_total: labelled.optional,
        excluded_total: excSum,
        grand_total: labelled.grand,
        resolution_source: "labelled_grand_and_subtotal",
        labelled,
        anomalies,
      };
    }
    anomalies.push("labelled_grand_subtotal_optional_mismatch");
  }

  if (labelled.grand != null && labelled.optional != null) {
    const main = labelled.grand - labelled.optional;
    if (main >= 0) {
      return {
        ok: true,
        main_total: main,
        optional_total: labelled.optional,
        excluded_total: excSum,
        grand_total: labelled.grand,
        resolution_source: "labelled_grand_minus_optional",
        labelled,
        anomalies,
      };
    }
  }

  if (mainSum > 0 && labelled.grand != null && mainSum > labelled.grand * 1.3) {
    anomalies.push("inflation_guard_triggered");
    return {
      ok: true,
      main_total: labelled.subtotal ?? labelled.grand,
      optional_total: labelled.optional ?? 0,
      excluded_total: excSum,
      grand_total: labelled.grand,
      resolution_source: "inflation_guard",
      labelled,
      anomalies,
    };
  }

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

  if (mainSum > 0 || optSum > 0) {
    return {
      ok: true,
      main_total: mainSum,
      optional_total: optSum,
      excluded_total: excSum,
      grand_total: mainSum + optSum,
      resolution_source: "summed_rows",
      labelled,
      anomalies,
    };
  }

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

function sum(items: ParsedLineItemV2[]): number {
  return items.reduce((a, i) => a + (i.total_price ?? 0), 0);
}

function readLabel(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
