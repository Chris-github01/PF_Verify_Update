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
 * Normalize a single line item, filling in missing fields intelligently
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

  // ✅ Preserve money even if qty/rate missing (LS style)
  let finalQty = Number.isFinite(qty) && qty > 0 ? qty : 0;
  let finalRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
  let finalTotal = Number.isFinite(total) ? total : 0;

  // Smart defaults for LS items
  if (finalTotal !== 0 && finalQty === 0) finalQty = 1;
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
 * Extract document total from full text
 */
export function extractDocumentTotal(text: string): number | null {
  // Normalize all types of spaces (non-breaking spaces, tabs, multiple spaces)
  const t = text
    .replace(/\u00A0/g, " ")  // non-breaking space
    .replace(/\s+/g, " ")      // normalize multiple spaces to single space
    .trim();

  // Try various patterns for Grand Total
  // Using \s+ to match one or more whitespace characters
  const patterns = [
    /Grand\s+Total\s*\(excluding\s+GST\)\s*:\s*\$\s*([\d,]+\.?\d*)/i,
    /Grand\s+Total\s*\(excl\.?\s*GST\)\s*:\s*\$\s*([\d,]+\.?\d*)/i,
    /Grand\s+Total\s*:\s*\$\s*([\d,]+\.?\d*)/i,
    /\bTOTAL\s*\(excluding\s+GST\)\s*:\s*\$\s*([\d,]+\.?\d*)/i,
    /\bTOTAL\s*:\s*\$\s*([\d,]+\.?\d*)/i,
    // Also try without dollar sign (some formats)
    /Grand\s+Total\s*\(excluding\s+GST\)\s*:\s*([\d,]+\.?\d*)/i,
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) {
      const amount = parseMoney(match[1]);
      // Only return if amount is reasonable (not zero, not tiny)
      if (amount > 100) {
        return amount;
      }
    }
  }

  return null;
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
