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

function detectLeadingDigitClip(
  items: Record<string, unknown>[],
  resolvedTotal: number
): Record<string, unknown>[] {
  const itemsWithTotals = items.map(item => ({
    item,
    t: toNum(item.total) ?? toNum(item.total_price) ?? toNum(item.rate ?? item.unit_rate) ?? 0,
  }));

  const currentSum = itemsWithTotals.reduce((s, x) => s + x.t, 0);
  const shortfall = resolvedTotal - currentSum;

  if (shortfall <= 0 || shortfall / resolvedTotal < 0.001) return items;

  const medianTotal =
    [...itemsWithTotals]
      .map(x => x.t)
      .filter(t => t > 0)
      .sort((a, b) => a - b)
      [Math.floor(itemsWithTotals.length / 2)] ?? 0;

  return itemsWithTotals.map(({ item, t }) => {
    if (t <= 0) return item;

    const candidates: number[] = [];
    let multiplier = 10;
    while (multiplier <= 100) {
      const candidate = t + (Math.floor(t / multiplier) === 0 ? shortfall : 0);
      const withLeadingDigit = Number(`${Math.round(shortfall / multiplier)}${String(t).padStart(String(Math.round(t * multiplier)).length - 1, '0')}`);
      if (Math.abs(withLeadingDigit - medianTotal) / medianTotal < 0.8) {
        candidates.push(withLeadingDigit);
      }
      multiplier *= 10;
    }

    const powerOf10 = Math.pow(10, Math.floor(Math.log10(shortfall)));
    const corrected = t + powerOf10;
    const newSum = currentSum - t + corrected;

    if (
      Math.abs(newSum - resolvedTotal) / resolvedTotal < 0.001 &&
      corrected > t &&
      corrected < medianTotal * 3
    ) {
      return {
        ...item,
        total: corrected,
        total_price: corrected,
        validation_flags: [
          ...(Array.isArray(item.validation_flags) ? item.validation_flags : []),
          `leading_digit_recovered:original=${t},corrected=${corrected},shortfall=${Math.round(shortfall)}`,
        ],
      };
    }

    return item;
  });
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

    if (resolvedTotal != null && items.length > 1) {
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

  const reconciled =
    resolvedTotal != null && resolvedTotal > 0
      ? detectLeadingDigitClip(cleaned, resolvedTotal)
      : cleaned;

  return {
    cleanedItems: reconciled,
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
- floor/level breakdown rows from a pricing table (e.g. "Lower Ground Level", "Level 1", "Level 2", "Roof") — use the SUM column as the total value

IMPORTANT — numbers without dollar signs are still prices:
- NZ plumbing quotes often use plain numbers in tables (e.g. 70535, 128875) without $ symbols
- If a table has a SUM or TOTAL column, use that column's value as the line item total
- If a row has "Lower Ground Level ... 70535", extract total = 70535
- NEVER output "Included" or text strings as a rate or total — only numbers

CRITICAL — MULTI-COLUMN LEVEL TABLE ARITHMETIC VALIDATION:
- Level-based tables have multiple sub-columns (e.g. Plumbing & sanitary, Water supply & GAS, SS and Vents, Storm Water, Equipment) that add up to the SUM column
- The SUM column is ALWAYS the last numeric column before any NOTE/comment column
- You MUST verify: sub-column values sum to the SUM value for EVERY row
- Example: if a row shows 21600 + 20540 + 10490 + 8860 = 61490, the total must be 61490, NOT 1490
- If any row's sub-columns sum to a value that does not match what you extracted as the total, correct the total to match the arithmetic
- This arithmetic self-check is MANDATORY for every level row — never skip it

NEVER INCLUDE as line items — these are summary rows, capture in quoteTotal instead:
- Total, Totals, Sub Total, Subtotal, Grand Total, Estimated Grand Total
- Total (excl. GST), Total excl. GST, Total excl GST, Total including GST, Total plus GST
- Net Total, Project Total, Quote Total, Tender Total, Contract Sum, Contract Total, Contract Value
- GST, P&G, Margin, price rollups, page totals, section totals

NEVER extract narrative/heading sections as line items:
- Documents Used, Scope of Works, General Inclusions, General Exclusions, Price included, Price not included
- Commercial Terms, Tender Qualifications, Tender Exclusions, Notes, Assumptions
- Item NO.X descriptions without prices — these are scope clarifications, not priced line items

If a quote has BOTH a level-by-level pricing table AND item description pages:
- extract the PRICING TABLE rows as line items (these have numeric values)
- IGNORE the "Item NO.X / Price included / Price not included" description pages (these have no prices)
- place the TOTAL row value in quoteTotal

Return JSON:
{
  "items": [{"description": "string", "qty": number, "unit": "string", "rate": number, "total": number, "section": "string", "frr": "string"}],
  "quoteTotal": number | null,
  "confidence": number,
  "warnings": ["string"]
}

Critical: Never include Total/Sub Total/Grand Total rows inside items. When in doubt, exclude a summary row from items and place its value in quoteTotal. Never use text like "Included" as a numeric value — if no price is found, omit the item.`;
