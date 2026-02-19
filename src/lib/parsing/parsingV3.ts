/**
 * Parsing Pipeline v3.2 - 2026-02-20
 *
 * Goals:
 * - Never lose money due to filtering
 * - Single source of truth for totals and counts
 * - Reconcile to PDF Grand Total when possible
 * - Consistent counts across all UI pages
 */

export const PARSING_VERSION = "v3.2-2026-02-20";

/**
 * Parse money string to number
 */
export function parseMoney(raw: string): number {
  return Number(String(raw).replace(/[^0-9.]/g, ""));
}

/**
 * Extract document total from raw text (deterministic)
 */
export function extractDocumentTotal(text: string): number | null {
  const t = text.replace(/\u00A0/g, " ");

  const patterns = [
    /Grand\s+Total\s*\(excluding\s+GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /Grand\s+Total\s*\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /Grand\s+Total\s+excl\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /Grand\s+Total\s+ex\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i,
    /Grand\s+Total\s*:\s*\$?\s*([\d,]+\.?\d*)/i,
    /\bTOTAL\b\s*:\s*\$?\s*([\d,]+\.?\d*)/i,
  ];

  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match) {
      const value = parseMoney(match[1]);
      if (value > 0 && Number.isFinite(value)) {
        return value;
      }
    }
  }

  return null;
}

/**
 * Safe number conversion
 */
function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Get total from various field names
 */
function getTotal(item: any): number {
  const v = item.total ?? item.total_price ?? item.amount ?? item.line_total ?? item.extended;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Get description from various field names
 */
function getDesc(item: any): string {
  return String(item.description ?? item.desc ?? item.item ?? "").trim();
}

/**
 * Normalize item fields (preserve money, fill missing fields)
 */
export function normalizeItem(item: any): any {
  const desc = getDesc(item);
  const unit = String(item.unit ?? "ea").trim() || "ea";

  let qty = num(item.qty ?? item.quantity);
  let rate = num(item.rate ?? item.unit_price ?? item.unitPrice);
  let total = getTotal(item);

  // If total exists but qty/rate missing, preserve it as qty=1, rate=total
  if (total !== 0 && qty <= 0) {
    qty = 1;
  }
  if (total !== 0 && rate <= 0 && qty > 0) {
    rate = total / qty;
  }

  // If qty and rate exist but total missing, calculate total
  if (total === 0 && qty > 0 && rate > 0) {
    total = qty * rate;
  }

  return {
    ...item,
    description: desc,
    unit,
    qty,
    rate,
    total,
  };
}

/**
 * Safe filtering - only remove TRUE junk rows
 * Keep legitimate lump sum items, subtotals, etc.
 */
export function isJunkRow(item: any): boolean {
  const desc = String(item.description ?? "").trim();
  const total = Number(item.total ?? 0);

  // Keep if it has a description OR a non-zero total
  if (desc.length > 0) return false;
  if (Number.isFinite(total) && total !== 0) return false;

  // Only true junk: no description AND no money
  return true;
}

/**
 * Check if item is optional
 */
export function isOptional(desc: string): boolean {
  const d = desc.toLowerCase();
  return d.includes("optional") || d.includes("option ") || d.includes("(opt)");
}

/**
 * Sum totals from items array
 */
export function sumTotals(items: any[]): number {
  return items.reduce((sum, item) => sum + Number(item.total ?? 0), 0);
}

/**
 * Tag items with metadata flags
 */
export function tagItems(items: any[]): any[] {
  return items.map(item => ({
    ...item,
    is_optional: isOptional(item.description || ""),
    is_adjustment: false,
  }));
}

/**
 * Reconcile items to document total
 * Returns final items array with adjustment line if needed
 */
export interface ReconciliationResult {
  finalItems: any[];
  itemsTotal: number;
  documentTotal: number | null;
  remainderAmount: number;
  hasAdjustment: boolean;
}

export function reconcileToDocumentTotal(
  items: any[],
  documentTotal: number | null
): ReconciliationResult {
  const baseItems = items.filter(i => !i.is_optional);
  const optItems = items.filter(i => i.is_optional);

  const baseTotal = sumTotals(baseItems);
  const basePlusOptTotal = sumTotals([...baseItems, ...optItems]);

  let finalItems = baseItems;

  // If document total exists, choose which set matches better
  if (documentTotal !== null) {
    const diffBase = Math.abs(documentTotal - baseTotal);
    const diffWithOpt = Math.abs(documentTotal - basePlusOptTotal);

    finalItems = diffWithOpt < diffBase ? [...baseItems, ...optItems] : baseItems;
  } else {
    // No document total, include everything
    finalItems = [...baseItems, ...optItems];
  }

  const itemsTotal = sumTotals(finalItems);
  let remainderAmount = 0;
  let hasAdjustment = false;

  if (documentTotal !== null) {
    remainderAmount = Number((documentTotal - itemsTotal).toFixed(2));

    // Add adjustment line if difference is significant
    const tolerance = Math.max(5, documentTotal * 0.001); // $5 or 0.1%

    if (Math.abs(remainderAmount) > tolerance) {
      hasAdjustment = true;
      finalItems.push({
        description: "Unparsed remainder (auto-adjustment to match document total)",
        qty: 1,
        unit: "ea",
        rate: remainderAmount,
        total: remainderAmount,
        is_adjustment: true,
        is_optional: false,
      });
    }
  }

  return {
    finalItems,
    itemsTotal,
    documentTotal,
    remainderAmount,
    hasAdjustment,
  };
}

/**
 * Complete parsing pipeline
 */
export interface ParsingResult {
  rawItems: any[];
  normalizedItems: any[];
  cleanedItems: any[];
  taggedItems: any[];
  finalItems: any[];
  rawItemsCount: number;
  finalItemsCount: number;
  itemsTotal: number;
  documentTotal: number | null;
  remainderAmount: number;
  hasAdjustment: boolean;
  finalTotalAmount: number;
  parsingVersion: string;
}

export function processParsingPipeline(
  rawItems: any[],
  extractedText: string
): ParsingResult {
  console.log(`[Parsing v3] Starting with ${rawItems.length} raw items`);

  // Step 0: Extract document total
  const documentTotal = extractDocumentTotal(extractedText);
  console.log(`[Parsing v3] Document total: ${documentTotal ? `$${documentTotal.toFixed(2)}` : "N/A"}`);

  // Step 1: Normalize items (preserve money)
  const normalizedItems = rawItems.map(normalizeItem);
  console.log(`[Parsing v3] Normalized ${normalizedItems.length} items`);

  // Step 2: Safe filtering (only remove true junk)
  const cleanedItems = normalizedItems.filter(item => !isJunkRow(item));
  console.log(`[Parsing v3] Cleaned to ${cleanedItems.length} items (removed ${normalizedItems.length - cleanedItems.length} junk rows)`);

  // Step 3: Tag items (optional, etc.)
  const taggedItems = tagItems(cleanedItems);

  // Step 4: Reconcile to document total
  const reconciliation = reconcileToDocumentTotal(taggedItems, documentTotal);

  const finalTotalAmount = documentTotal ?? reconciliation.itemsTotal;

  console.log(`[Parsing v3] Final: ${reconciliation.finalItems.length} items, $${finalTotalAmount.toFixed(2)}`);
  console.log(`[Parsing v3] Items total: $${reconciliation.itemsTotal.toFixed(2)}`);
  if (documentTotal) {
    console.log(`[Parsing v3] Document total: $${documentTotal.toFixed(2)}`);
    console.log(`[Parsing v3] Remainder: $${reconciliation.remainderAmount.toFixed(2)}`);
    console.log(`[Parsing v3] Adjustment added: ${reconciliation.hasAdjustment}`);
  }

  return {
    rawItems,
    normalizedItems,
    cleanedItems,
    taggedItems,
    finalItems: reconciliation.finalItems,
    rawItemsCount: rawItems.length,
    finalItemsCount: reconciliation.finalItems.length,
    itemsTotal: reconciliation.itemsTotal,
    documentTotal,
    remainderAmount: reconciliation.remainderAmount,
    hasAdjustment: reconciliation.hasAdjustment,
    finalTotalAmount,
    parsingVersion: PARSING_VERSION,
  };
}
