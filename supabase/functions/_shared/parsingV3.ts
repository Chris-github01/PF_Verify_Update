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

const SUMMARY_ROW_SET = new Set([
  'total', 'totals', 'grand total', 'grandtotal',
  'quote total', 'contract sum', 'lump sum total', 'overall total',
  'subtotal', 'sub-total', 'sub total', 'net total', 'project total',
  'tender total', 'tender sum', 'contract value', 'total price',
  'total cost', 'total amount', 'total sum', 'contract total',
  'contract price', 'price total',
]);

export function isSummaryRow(item: any): boolean {
  const raw = String(item.description ?? '').trim();
  const d = raw.replace(/[:\s]+$/, '').trim().toLowerCase();
  if (!d) return false;
  if (SUMMARY_ROW_SET.has(d)) return true;
  if (/^(grand\s+)?total(\s*(excl|incl|ex|inc)\.?.*)?$/i.test(d)) return true;
  if (/^sub[-\s]?total/i.test(d)) return true;
  if (/^contract\s+(sum|total|value|price)$/i.test(d)) return true;
  return false;
}

export function isArithmeticTotal(item: any, allItems: any[]): boolean {
  const itemTotal = Number(item.total ?? 0);
  if (itemTotal <= 0) return false;
  const othersSum = allItems.reduce((s, other) => {
    if (other === item) return s;
    return s + Number(other.total ?? 0);
  }, 0);
  if (othersSum <= 0) return false;
  const tolerance = Math.max(othersSum * 0.005, 1);
  return Math.abs(itemTotal - othersSum) <= tolerance;
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

  // Log what's being dropped
  const droppedItems = normalizedItems.filter(item => isJunkRow(item));
  if (droppedItems.length > 0) {
    console.log(`[Parsing v3] Dropping ${droppedItems.length} junk rows:`);
    droppedItems.forEach(item => {
      console.log(`  - "${item.description}" (qty=${item.qty}, rate=${item.rate}, total=${item.total})`);
    });
  }

  const cleanedItems = normalizedItems.filter(item => !isJunkRow(item));
  console.log(`[Parsing v3] Cleaned to ${cleanedItems.length} items`);

  // Remove labeled summary rows (Total, Grand Total, Contract Sum, etc.)
  const labelFiltered = cleanedItems.filter(item => {
    if (isSummaryRow(item)) {
      console.log(`[Parsing v3] Removed summary row: "${item.description}" ($${item.total})`);
      return false;
    }
    return true;
  });

  // If no label match removed anything, also try arithmetic total detection
  let afterSummaryFilter = labelFiltered;
  if (labelFiltered.length === cleanedItems.length && cleanedItems.length > 1) {
    const arithmeticTotals = cleanedItems.filter(item => isArithmeticTotal(item, cleanedItems));
    if (arithmeticTotals.length === 1) {
      console.log(`[Parsing v3] Removed arithmetic total row: "${arithmeticTotals[0].description}" ($${arithmeticTotals[0].total})`);
      afterSummaryFilter = cleanedItems.filter(item => item !== arithmeticTotals[0]);
    }
  }

  console.log(`[Parsing v3] After summary filter: ${afterSummaryFilter.length} items`);

  const taggedItems = tagItems(afterSummaryFilter);
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
