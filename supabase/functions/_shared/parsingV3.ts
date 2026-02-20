/**
 * Parsing Pipeline v3.2 - 2026-02-20
 * Edge Function Compatible Version
 */

export const PARSING_VERSION = "v3.2-2026-02-20";

export function parseMoney(raw: string): number {
  // Remove currency symbols, spaces, and commas (thousands separator)
  // Keep only digits and decimal point
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  return Number(cleaned);
}

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

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getTotal(item: any): number {
  const v = item.total ?? item.total_price ?? item.amount ?? item.line_total ?? item.extended;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getDesc(item: any): string {
  return String(item.description ?? item.desc ?? item.item ?? "").trim();
}

export function normalizeItem(item: any): any {
  const desc = getDesc(item);

  // Handle unit field - default to "ea" if missing, empty, or "0"
  let unit = String(item.unit ?? "ea").trim();
  if (!unit || unit === "0" || unit === "N/A") {
    unit = "ea";
  }

  let qty = num(item.qty ?? item.quantity);
  let rate = num(item.rate ?? item.unit_price ?? item.unitPrice);
  let total = getTotal(item);

  if (total !== 0 && qty <= 0) qty = 1;
  if (total !== 0 && rate <= 0 && qty > 0) rate = total / qty;
  if (total === 0 && qty > 0 && rate > 0) total = qty * rate;

  return {
    ...item,
    description: desc,
    unit,
    qty,
    rate,
    total,
  };
}

export function isJunkRow(item: any): boolean {
  const desc = String(item.description ?? "").trim();
  const total = Number(item.total ?? 0);

  if (desc.length > 0) return false;
  if (Number.isFinite(total) && total !== 0) return false;

  return true;
}

export function isOptional(desc: string): boolean {
  const d = desc.toLowerCase();
  return d.includes("optional") || d.includes("option ") || d.includes("(opt)");
}

export function sumTotals(items: any[]): number {
  return items.reduce((sum, item) => sum + Number(item.total ?? 0), 0);
}

export function tagItems(items: any[]): any[] {
  return items.map(item => ({
    ...item,
    is_optional: isOptional(item.description || ""),
    is_adjustment: false,
  }));
}

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

  if (documentTotal !== null) {
    const diffBase = Math.abs(documentTotal - baseTotal);
    const diffWithOpt = Math.abs(documentTotal - basePlusOptTotal);
    finalItems = diffWithOpt < diffBase ? [...baseItems, ...optItems] : baseItems;
  } else {
    finalItems = [...baseItems, ...optItems];
  }

  const itemsTotal = sumTotals(finalItems);
  let remainderAmount = 0;
  let hasAdjustment = false;

  if (documentTotal !== null) {
    remainderAmount = Number((documentTotal - itemsTotal).toFixed(2));
    const tolerance = Math.max(5, documentTotal * 0.001);

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

export interface ParsingResult {
  rawItems: any[];
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

  const documentTotal = extractDocumentTotal(extractedText);
  console.log(`[Parsing v3] Document total: ${documentTotal ? `$${documentTotal.toFixed(2)}` : "N/A"}`);

  const normalizedItems = rawItems.map(normalizeItem);
  const cleanedItems = normalizedItems.filter(item => !isJunkRow(item));
  console.log(`[Parsing v3] Cleaned to ${cleanedItems.length} items`);

  const taggedItems = tagItems(cleanedItems);
  const reconciliation = reconcileToDocumentTotal(taggedItems, documentTotal);

  const finalTotalAmount = documentTotal ?? reconciliation.itemsTotal;

  console.log(`[Parsing v3] Final: ${reconciliation.finalItems.length} items, $${finalTotalAmount.toFixed(2)}`);
  if (documentTotal) {
    console.log(`[Parsing v3] Remainder: $${reconciliation.remainderAmount.toFixed(2)}, Adjustment: ${reconciliation.hasAdjustment}`);
  }

  return {
    rawItems,
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
