const SUMMARY_LABEL_REGEX =
  /^(total|sub\s*total|subtotal|grand\s*total|estimated\s*grand\s*total|total\s*\(.*\)|total\s*excl\.?\s*gst|total\s*excl\s*gst|total\s*including\s*gst|total\s*plus\s*gst|net\s*total|project\s*total|quote\s*total|tender\s*total|tender\s*sum|contract\s*sum|contract\s*total|contract\s*value|contract\s*price|price\s*total|total\s*price|total\s*cost|total\s*amount|overall\s*total|lump\s*sum\s*total|gst)$/i;

const NARRATIVE_HEADING_REGEX =
  /^(documents\s*used|scope\s*of\s*works|general\s*inclusions|general\s*exclusions|commercial\s*terms|tender\s*qualifications|tender\s*exclusions|notes|assumptions|qualifications|exclusions|inclusions)$/i;

function normaliseLabel(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[:\-\u2013\u2014]+$/g, "")
    .trim();
}

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSummaryLabel(description: string | null | undefined): boolean {
  return SUMMARY_LABEL_REGEX.test(normaliseLabel(description));
}

function isNarrativeHeading(description: string | null | undefined): boolean {
  return NARRATIVE_HEADING_REGEX.test(normaliseLabel(description));
}

function roughlyEqual(a: number | null, b: number | null, tol = 1): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tol;
}

function inferTotalFromItems(items: Record<string, unknown>[]): number | null {
  for (const item of items) {
    const desc = String(item.description ?? item.desc ?? item.item ?? "");
    if (isSummaryLabel(desc)) {
      const t = toNum(item.total) ?? toNum(item.total_price);
      if (t != null && t > 0) return t;
    }
  }
  return null;
}

export function sanitizePlumbingItems(
  items: Record<string, unknown>[],
  knownQuoteTotal?: number | null
): { cleanedItems: Record<string, unknown>[]; quoteTotalFound: number | null } {
  const inferredTotal = inferTotalFromItems(items);
  const resolvedTotal = knownQuoteTotal ?? inferredTotal ?? null;

  const cleaned: Record<string, unknown>[] = [];

  for (const item of items) {
    const rawDesc = String(item.description ?? item.desc ?? item.item ?? "");
    const description = normaliseLabel(rawDesc);
    const itemTotal = toNum(item.total) ?? toNum(item.total_price);
    const itemRate = toNum(item.rate ?? item.unit_rate);

    if (!description) continue;
    if (isNarrativeHeading(description)) continue;
    if (isSummaryLabel(description)) continue;

    if (resolvedTotal != null) {
      const descLower = description.toLowerCase();
      if (
        (roughlyEqual(itemTotal, resolvedTotal) || roughlyEqual(itemRate, resolvedTotal)) &&
        (descLower.includes("total") ||
          descLower.includes("grand") ||
          descLower.includes("subtotal") ||
          descLower.includes("sub total") ||
          descLower.includes("contract sum"))
      ) {
        continue;
      }
    }

    cleaned.push(item);
  }

  return {
    cleanedItems: cleaned,
    quoteTotalFound: resolvedTotal,
  };
}

export const PLUMBING_SYSTEM_PROMPT = `You are extracting structured commercial line items from a NEW ZEALAND PLUMBING quote.

Your task:
- extract ONLY genuine priced scope line items,
- extract quote-level totals separately as metadata,
- NEVER treat summary totals or narrative sections as line items.

INCLUDE as line items only:
- genuine priced scope/package lines (e.g. Sanitary Sewer Above ground, Hot & Cold-Water Main, Gas System, Plant & Valve, Acoustic Lagging, Rainwater Harvesting System, Installation of Sanitary Fittings)

NEVER INCLUDE as line items — these are summary rows, capture in quoteTotal instead:
- Total, Totals, Sub Total, Subtotal, Grand Total, Estimated Grand Total
- Total (excl. GST), Total excl. GST, Total excl GST, Total including GST, Total plus GST
- Net Total, Project Total, Quote Total, Tender Total, Contract Sum, Contract Total, Contract Value
- GST, P&G, Margin, price rollups, page totals, section totals

NEVER extract narrative/heading sections as line items:
- Documents Used, Scope of Works, General Inclusions, General Exclusions
- Commercial Terms, Tender Qualifications, Tender Exclusions, Notes, Assumptions

If a cover-page has breakdown rows followed by a final Total row:
- extract the breakdown rows as line items
- place the Total value in quoteTotal
- DO NOT include Total as a line item

Return JSON:
{
  "items": [{"description": "string", "qty": number, "unit": "string", "rate": number, "total": number, "section": "string", "frr": "string"}],
  "quoteTotal": number | null,
  "confidence": number,
  "warnings": ["string"]
}

Critical: Never include Total/Sub Total/Grand Total rows inside items. When in doubt, exclude a summary row from items and place its value in quoteTotal.`;
