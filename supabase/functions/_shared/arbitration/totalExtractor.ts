/**
 * Universal Total Extractor
 *
 * Extracts commercial totals from any supplier document and ranks by label priority.
 * Company-agnostic. No vendor-specific regex.
 *
 * Priority (highest to lowest):
 *   1. Grand Total
 *   2. Total Ex GST
 *   3. Contract Sum
 *   4. Lump Sum
 *   5. Subtotal + QA
 *   6. Row Sum (only when no labelled total is found, or labelled confidence is very low)
 */

export type TotalLabel =
  | "grand_total"
  | "total_ex_gst"
  | "contract_sum"
  | "lump_sum"
  | "subtotal_qa"
  | "row_sum";

export interface LabelledTotal {
  label: TotalLabel;
  value: number;
  priority: number;
  confidence: number;
  raw_match: string;
  line_number?: number;
}

export interface TotalExtractionResult {
  resolved_total: number | null;
  resolved_label: TotalLabel | null;
  candidates: LabelledTotal[];
  total_confidence: number;
  warnings: string[];
}

const LABEL_PRIORITY: Record<TotalLabel, number> = {
  grand_total: 100,
  total_ex_gst: 95,
  contract_sum: 90,
  lump_sum: 85,
  subtotal_qa: 70,
  row_sum: 10,
};

const MONEY = `\\$?\\s*([\\d,]+\\.?\\d*)`;

const LABEL_PATTERNS: Array<{ label: TotalLabel; regex: RegExp; confidence: number }> = [
  { label: "grand_total", regex: new RegExp(`\\bGrand\\s+Total\\b[^\\n$]*?${MONEY}`, "i"), confidence: 0.97 },
  { label: "total_ex_gst", regex: new RegExp(`\\bTotal\\b[^\\n$]*?\\b(?:Ex|Excl(?:uding)?)\\.?\\s*GST\\b[^\\n$]*?${MONEY}`, "i"), confidence: 0.95 },
  { label: "total_ex_gst", regex: new RegExp(`\\bTotal\\b[^\\n$]*?\\b(?:Ex|Excl(?:uding)?)\\.?\\s*Tax\\b[^\\n$]*?${MONEY}`, "i"), confidence: 0.92 },
  { label: "contract_sum", regex: new RegExp(`\\bContract\\s+Sum\\b[^\\n$]*?${MONEY}`, "i"), confidence: 0.94 },
  { label: "lump_sum", regex: new RegExp(`\\bLump\\s+Sum\\b[^\\n$]*?${MONEY}`, "i"), confidence: 0.90 },
  { label: "lump_sum", regex: new RegExp(`\\bFixed\\s+Price\\b[^\\n$]*?${MONEY}`, "i"), confidence: 0.85 },
  { label: "subtotal_qa", regex: new RegExp(`\\b(?:Sub\\s*-?\\s*total|Subtotal)\\b[^\\n$]*?${MONEY}`, "i"), confidence: 0.75 },
];

const parseMoney = (raw: string): number => {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

export function extractLabelledTotals(text: string): LabelledTotal[] {
  const candidates: LabelledTotal[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of LABEL_PATTERNS) {
      const m = line.match(pattern.regex);
      if (m) {
        const value = parseMoney(m[1]);
        if (value <= 0) continue;
        candidates.push({
          label: pattern.label,
          value,
          priority: LABEL_PRIORITY[pattern.label],
          confidence: pattern.confidence,
          raw_match: m[0].slice(0, 120),
          line_number: i + 1,
        });
      }
    }
  }

  const bestPerLabel = new Map<TotalLabel, LabelledTotal>();
  for (const c of candidates) {
    const existing = bestPerLabel.get(c.label);
    if (!existing || c.confidence > existing.confidence || (c.confidence === existing.confidence && c.value > existing.value)) {
      bestPerLabel.set(c.label, c);
    }
  }

  return [...bestPerLabel.values()].sort((a, b) => b.priority - a.priority);
}

/**
 * Resolve the commercial total using label priority.
 * Row-sum fallback is ONLY used when no labelled total exists,
 * or when the highest labelled candidate's confidence is extremely low (<0.5).
 */
export function resolveTotal(
  text: string,
  rowSum: number | null,
  rowSumConfidence: number = 0.6,
): TotalExtractionResult {
  const candidates = extractLabelledTotals(text);
  const warnings: string[] = [];

  if (rowSum !== null && rowSum > 0) {
    candidates.push({
      label: "row_sum",
      value: rowSum,
      priority: LABEL_PRIORITY.row_sum,
      confidence: rowSumConfidence,
      raw_match: "computed_sum_of_rows",
    });
  }

  if (candidates.length === 0) {
    return {
      resolved_total: null,
      resolved_label: null,
      candidates: [],
      total_confidence: 0,
      warnings: ["No total found in document"],
    };
  }

  candidates.sort((a, b) => b.priority - a.priority);

  const topLabelled = candidates.find((c) => c.label !== "row_sum");
  const rowCandidate = candidates.find((c) => c.label === "row_sum");

  let chosen: LabelledTotal;
  if (topLabelled && topLabelled.confidence >= 0.5) {
    chosen = topLabelled;
    if (rowCandidate && Math.abs(rowCandidate.value - topLabelled.value) / topLabelled.value > 0.05) {
      warnings.push(
        `Row sum ($${rowCandidate.value.toFixed(2)}) diverges >5% from labelled ${topLabelled.label} ($${topLabelled.value.toFixed(2)})`,
      );
    }
  } else if (rowCandidate) {
    chosen = rowCandidate;
    warnings.push("No labelled commercial total found; falling back to row sum");
  } else {
    chosen = candidates[0];
    warnings.push(`Using low-confidence labelled total: ${chosen.label}`);
  }

  const total_confidence = chosen.label === "row_sum" ? Math.min(chosen.confidence, 0.6) : chosen.confidence;

  return {
    resolved_total: chosen.value,
    resolved_label: chosen.label,
    candidates,
    total_confidence,
    warnings,
  };
}
