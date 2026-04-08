/**
 * Item Normalization Utilities
 *
 * This module provides functions to normalize parsed quote items,
 * ensuring that items with empty descriptions but valid financial data
 * are preserved and normalized rather than being filtered out.
 */

/**
 * Clean text by normalizing whitespace and removing control characters
 */
export function cleanText(s: any): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001F]/g, "")
    .trim();
}

/**
 * Check if a number is non-zero and finite
 */
export function isNonZero(n: any): boolean {
  const x = Number(n);
  return Number.isFinite(x) && Math.abs(x) > 0;
}

/**
 * Check if a line has meaningful monetary values
 */
export function hasMoney(line: any): boolean {
  return isNonZero(line.total ?? line.total_price ?? line.amount ?? line.line_total)
      || isNonZero(line.rate ?? line.unit_price ?? line.unitPrice)
      || isNonZero(line.qty ?? line.quantity);
}

/**
 * Check if a line has a non-empty description
 */
export function hasDesc(line: any): boolean {
  const d = String(line.description ?? "").trim();
  return d.length > 0;
}

/**
 * Extract description from raw text by removing monetary patterns
 */
export function extractDescFromRawText(raw: string): string {
  // Remove money patterns and common qty/unit patterns to isolate description-ish parts
  let t = cleanText(raw);

  // Remove currency amounts e.g. $1,234.56
  t = t.replace(/\$[\d,]+(\.\d{2})?/g, " ");

  // Remove common qty/unit tokens e.g. "12 ea", "1 LS", "5 m"
  t = t.replace(/\b\d+(\.\d+)?\s*(ea|each|ls|lump\s*sum|m|lm|hr|hrs|day|days)\b/gi, " ");

  // Remove repeated spaces again
  t = cleanText(t);

  // If still too long, keep first 120 chars
  if (t.length > 120) t = t.slice(0, 120).trim();

  return t;
}

/**
 * V5 Line Item Validator
 * Two valid item types:
 * A) Itemised: description + qty + total (rate/unit optional)
 * B) Lump sum: description + total (qty defaults to 1, rate/unit optional)
 */
export function isValidLineItem(line: any): boolean {
  const desc = cleanText(line.description);
  const total = Number(line.total ?? line.total_price ?? line.amount ?? 0);
  const qty = Number(line.qty ?? line.quantity ?? 0);

  // Must have description and total
  if (!desc || desc.length === 0) return false;
  if (!Number.isFinite(total) || total === 0) return false;

  // Type A: Itemised (has qty)
  if (Number.isFinite(qty) && qty > 0) return true;

  // Type B: Lump sum (no qty, but has total)
  if (total > 0) return true;

  return false;
}

/**
 * Normalize a single line item, filling in missing fields intelligently
 * V5 Update: Support two valid item types
 */
export function normalizeLine(line: any, index: number): any {
  const desc = cleanText(line.description);
  const rawText = cleanText(line.raw_text ?? line.rawText ?? line.source_text ?? "");

  const qty = Number(line.qty ?? line.quantity ?? 0);
  const rate = Number(line.rate ?? line.unit_price ?? line.unitPrice ?? 0);
  const total = Number(line.total ?? line.total_price ?? line.amount ?? 0);

  const hasTotals = Number.isFinite(total) && total !== 0;

  // ✅ Fill empty description if row has money
  let finalDesc = desc;
  if (!finalDesc && (hasTotals || (qty > 0 && rate > 0))) {
    const fromRaw = extractDescFromRawText(rawText);
    finalDesc = fromRaw || `Unlabeled line item ${index + 1}`;
  }

  // ✅ V5: Preserve money even if qty/rate missing (LS/service style)
  let finalQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  let finalRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  let finalTotal = Number.isFinite(total) ? total : 0;

  // V5 Type B (Lump sum): Default qty to 1 if we have total but no qty
  if (finalTotal !== 0 && finalQty === 0) finalQty = 1;

  // Calculate missing values where possible
  if (finalTotal !== 0 && finalRate === 0 && finalQty > 0) finalRate = finalTotal / finalQty;
  if (finalTotal === 0 && finalQty > 0 && finalRate > 0) finalTotal = finalQty * finalRate;

  return {
    ...line,
    description: finalDesc,
    qty: finalQty,
    rate: finalRate,
    total: finalTotal,
  };
}

/**
 * Parse monetary string to number
 */
export function parseMoney(raw: string): number {
  return Number(raw.replace(/[^0-9.]/g, ""));
}

/**
 * Collapse space-split digit groups into a single number.
 * Handles PDF artifacts like "1,511, 33 8" → 1511338, "6 1490" → 61490,
 * "1511 33 8" → 1511338. Strategy: strip commas, split on spaces, join all
 * digit-only tokens that together form a plausible large number (>= 1000).
 */
function collapseSpaceSplitNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim();
  const tokens = cleaned.split(/\s+/);
  const merged = tokens.join('');
  const val = parseFloat(merged);
  return Number.isFinite(val) ? val : 0;
}

/**
 * Extract document total from full text
 */
export function extractDocumentTotal(text: string): number | null {
  // Normalize non-breaking spaces but keep internal spaces for split-number handling
  const t = text
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, " ")
    .trim();

  // Helper: parse a raw match group that may have spaces inside the number
  // e.g. "1,511, 33 8" or "1 511 338"
  const parseSpacedAmount = (raw: string): number => {
    const noCommas = raw.replace(/,/g, '');
    const tokens = noCommas.trim().split(/\s+/).filter(t => /^\d+$/.test(t));
    if (tokens.length === 0) return 0;
    const merged = tokens.join('');
    const val = parseFloat(merged);
    return Number.isFinite(val) ? val : 0;
  };

  // Flatten text to single line for pattern matching (needed for multi-word patterns)
  const flat = t.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

  // Pattern set: label followed by optional $ and a number that may contain spaces/commas
  // The number capture group allows digits, commas, and spaces (for space-split artifacts)
  const labelPatterns: RegExp[] = [
    // "Total Price: 1,511, 33 8" or "Tota l Price: 1,511,338"
    /[Tt]ota\s*l\s+[Pp]rice\s*:?\s*\$?\s*([\d][\d\s,]{3,}[\d])/,
    /Grand\s+Total\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d][\d\s,]{3,}[\d])/i,
    /Grand\s+Total\s*:?\s*\$?\s*([\d][\d\s,]{3,}[\d])/i,
    /\bTOTAL\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d][\d\s,]{3,}[\d])/i,
    /\bTOTAL\s*:?\s*\$?\s*([\d][\d\s,]{3,}[\d])/i,
    /Contract\s+(?:Sum|Total|Price|Value)\s*:?\s*\$?\s*([\d][\d\s,]{3,}[\d])/i,
    /Quote\s+Total\s*:?\s*\$?\s*([\d][\d\s,]{3,}[\d])/i,
    /Lump\s+Sum\s+(?:Total\s+)?:?\s*\$?\s*([\d][\d\s,]{3,}[\d])/i,
  ];

  // Collect all matches and return the largest one.
  // This avoids picking up a section subtotal (e.g. $15,940 for optional items)
  // instead of the real grand total when multiple patterns fire on the same text.
  let best: number | null = null;
  for (const pattern of labelPatterns) {
    const match = flat.match(pattern);
    if (match) {
      const amount = parseSpacedAmount(match[1]);
      if (amount > 1000 && (best === null || amount > best)) {
        best = amount;
      }
    }
  }

  return best;
}

/**
 * Create deduplication key for a line item
 */
export function dedupeKey(line: any): string {
  const qty = Number(line.qty ?? 0).toFixed(4);
  const total = Number(line.total ?? 0).toFixed(2);
  const unit = String(line.unit ?? "ea").toLowerCase().trim();

  // Use raw_text (if available) as a better "identity"
  const raw = cleanText(line.raw_text ?? "");
  const rawPart = raw
    ? raw.slice(0, 80).toLowerCase()
    : cleanText(line.description).slice(0, 80).toLowerCase();

  return `${rawPart}__${qty}__${unit}__${total}`;
}

/**
 * Extract FRR (Fire Resistance Rating) from a description string.
 * Handles formats like (60)/60/-, (90)/90/-, 90/90/90, -/60/60, FRL 90/90/90 etc.
 */
export function extractFRRFromDescription(text: string): string | null {
  if (!text) return null;

  const patterns = [
    /\((\d+)\)\s*\/\s*(\d+|-)\s*\/\s*(\d+|-)/g,
    /(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+|-)/g,
    /-\s*\/\s*(\d+)\s*\/\s*(\d+)/g,
    /FRL\s*[-:]?\s*(\d+)(?:\s*\/\s*(\d+)(?:\s*\/\s*(\d+))?)?/gi,
    /(\d+)\s*min(?:ute)?s?\s*fire\s*resist/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      return match[0].trim();
    }
  }

  return null;
}

/**
 * Detect if a line item is a total/summary row that should be excluded.
 * Handles labeled totals ("Total:", "Grand Total:", etc.) AND
 * arithmetic totals (value equals sum of all other items).
 */
const TOTAL_ROW_PATTERNS = [
  /\b(sub[-\s]?total|subtotal)\b/i,
  /\b(grand[-\s]?total)\b/i,
  /\b(section[-\s]?total)\b/i,
  /\b(block[-\s]?total)\b/i,
  /\b(page[-\s]?total)\b/i,
  /\b(carried[-\s]?forward)\b/i,
  /\b(brought[-\s]?forward)\b/i,
  /\b(c\/f|b\/f)\b/i,
  /^total$/i,
  /^totals$/i,
  /\btotal\s*:/i,
  /^total\s+\(excl/i,
  /^total\s+\(inc/i,
  /^total\s+price$/i,
  /^total\s+cost$/i,
  /^total\s+amount$/i,
  /^total\s+sum$/i,
  /^quote\s+total$/i,
  /^contract\s+(sum|total|price)$/i,
  /^lump\s+sum\s+total$/i,
  /^overall\s+total$/i,
  /^net\s+total$/i,
  /^project\s+total$/i,
  /^tender\s+total$/i,
  /^tender\s+sum$/i,
  /^contract\s+value$/i,
];

export function isTotalRow(item: any): boolean {
  const desc = cleanText(String(item.description ?? "")).toLowerCase();
  if (!desc) return false;
  return TOTAL_ROW_PATTERNS.some(p => p.test(desc));
}

/**
 * Detect if one item is an arithmetic total of the others.
 * Returns true if item.total ≈ sum of all other items' totals (within 0.5%).
 * This catches unlabeled total rows where the LLM didn't flag them as "Total:".
 */
export function isArithmeticTotalRow(item: any, allItems: any[]): boolean {
  const itemTotal = Number(item.total ?? item.total_price ?? item.amount ?? 0);
  if (itemTotal <= 0) return false;

  const othersSum = allItems.reduce((sum: number, other: any) => {
    if (other === item) return sum;
    return sum + Number(other.total ?? other.total_price ?? other.amount ?? 0);
  }, 0);

  if (othersSum <= 0) return false;

  const diff = Math.abs(itemTotal - othersSum);
  const tolerance = Math.max(othersSum * 0.005, 1);
  return diff <= tolerance;
}

/**
 * Filter total/summary rows from a list of parsed items.
 * Uses both label detection AND arithmetic sum detection.
 * Safe to call on any trade without breaking passive fire or other quote types.
 */
export function filterTotalRows(items: any[]): { kept: any[]; removedCount: number; removedDescriptions: string[] } {
  if (!items || items.length === 0) return { kept: [], removedCount: 0, removedDescriptions: [] };

  const removedDescriptions: string[] = [];

  const labelFiltered = items.filter(item => {
    if (isTotalRow(item)) {
      removedDescriptions.push(cleanText(String(item.description ?? "")));
      return false;
    }
    return true;
  });

  if (labelFiltered.length === items.length) {
    const arithmeticRemoved: any[] = [];
    const arithmeticKept = labelFiltered.filter(item => {
      if (isArithmeticTotalRow(item, labelFiltered)) {
        arithmeticRemoved.push(item);
        return false;
      }
      return true;
    });

    if (arithmeticRemoved.length === 1) {
      const desc = cleanText(String(arithmeticRemoved[0].description ?? ""));
      removedDescriptions.push(`${desc} [arithmetic total detected]`);
      return {
        kept: arithmeticKept,
        removedCount: arithmeticRemoved.length,
        removedDescriptions,
      };
    }
  }

  return {
    kept: labelFiltered,
    removedCount: items.length - labelFiltered.length,
    removedDescriptions,
  };
}

/**
 * Add remainder adjustment item if document total doesn't match items sum
 */
export function addRemainderIfNeeded(
  lines: any[],
  documentTotal: number | null
): any[] {
  if (documentTotal == null) return lines;

  const itemsSum = lines.reduce((s: number, l: any) =>
    s + Number(l.total ?? 0), 0
  );

  const diff = Number((documentTotal - itemsSum).toFixed(2));
  const tolerance = Math.max(5, documentTotal * 0.001);

  if (Math.abs(diff) > tolerance) {
    return [
      ...lines,
      {
        description: "Unparsed remainder (auto-adjustment to match document total)",
        qty: 1,
        unit: "ea",
        rate: diff,
        total: diff,
        is_adjustment: true,
        raw_text: "",
      }
    ];
  }

  return lines;
}
