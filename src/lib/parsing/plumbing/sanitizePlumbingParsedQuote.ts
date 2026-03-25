export interface ParsedLineItem {
  description?: string | null;
  qty?: number | null;
  unit?: string | null;
  rate?: number | null;
  total?: number | null;
  total_price?: number | null;
  attributes?: Record<string, unknown> | null;
  confidence?: number | null;
}

export interface ParsedPlumbingQuote {
  supplierName?: string | null;
  quoteNumber?: string | null;
  quoteDate?: string | null;
  currency?: string | null;
  quoteTotal?: number | null;
  totals?: {
    subTotal?: number | null;
    grandTotal?: number | null;
    gstIncluded?: boolean | null;
    gstNote?: string | null;
  } | null;
  lineItems?: ParsedLineItem[] | null;
}

const SUMMARY_LABEL_REGEX =
  /^(total|sub\s*total|subtotal|grand\s*total|estimated\s*grand\s*total|total\s*\(.*\)|total\s*excl\.?\s*gst|total\s*excl\s*gst|total\s*including\s*gst|total\s*plus\s*gst|net\s*total|project\s*total|quote\s*total|tender\s*total|tender\s*sum|contract\s*sum|contract\s*total|contract\s*value|contract\s*price|price\s*total|total\s*price|total\s*cost|total\s*amount|overall\s*total|lump\s*sum\s*total|gst)$/i;

const NARRATIVE_HEADING_REGEX =
  /^(documents\s*used|scope\s*of\s*works|general\s*inclusions|general\s*exclusions|commercial\s*terms|tender\s*qualifications|tender\s*exclusions|notes|assumptions|qualifications|exclusions|inclusions)$/i;

function normaliseLabel(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[:\-–—]+$/g, "")
    .trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSummaryLabel(description: string | null | undefined): boolean {
  const label = normaliseLabel(description);
  return SUMMARY_LABEL_REGEX.test(label);
}

function isNarrativeHeading(description: string | null | undefined): boolean {
  const label = normaliseLabel(description);
  return NARRATIVE_HEADING_REGEX.test(label);
}

function numbersRoughlyMatch(a: number | null, b: number | null, tolerance = 1): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}

function inferQuoteTotalFromItems(items: ParsedLineItem[]): number | null {
  for (const item of items) {
    const label = normaliseLabel(item.description);
    if (isSummaryLabel(label)) {
      const t = toNumber(item.total) ?? toNumber(item.total_price);
      if (t != null && t > 0) return t;
    }
  }
  return null;
}

export function sanitizePlumbingParsedQuote(input: ParsedPlumbingQuote): ParsedPlumbingQuote {
  const originalItems = Array.isArray(input.lineItems) ? input.lineItems : [];

  const existingQuoteTotal =
    toNumber(input.quoteTotal) ??
    toNumber(input.totals?.grandTotal) ??
    toNumber(input.totals?.subTotal);

  const inferredQuoteTotal = inferQuoteTotalFromItems(originalItems);
  const resolvedQuoteTotal = existingQuoteTotal ?? inferredQuoteTotal ?? null;

  const cleanedItems: ParsedLineItem[] = [];

  for (const item of originalItems) {
    const description = normaliseLabel(item.description);
    const itemTotal = toNumber(item.total) ?? toNumber(item.total_price);
    const itemRate = toNumber(item.rate);

    if (!description) continue;

    if (isNarrativeHeading(description)) continue;

    if (isSummaryLabel(description)) continue;

    if (
      resolvedQuoteTotal != null &&
      originalItems.length > 1 &&
      (numbersRoughlyMatch(itemTotal, resolvedQuoteTotal) ||
        numbersRoughlyMatch(itemRate, resolvedQuoteTotal))
    ) {
      const descLower = description.toLowerCase();
      if (
        descLower.includes("total") ||
        descLower.includes("grand") ||
        descLower.includes("subtotal") ||
        descLower.includes("sub total") ||
        descLower.includes("contract sum")
      ) {
        continue;
      }
    }

    cleanedItems.push(item);
  }

  return {
    ...input,
    quoteTotal: resolvedQuoteTotal,
    totals: {
      subTotal: toNumber(input.totals?.subTotal),
      grandTotal: toNumber(input.totals?.grandTotal) ?? resolvedQuoteTotal,
      gstIncluded: input.totals?.gstIncluded ?? null,
      gstNote: input.totals?.gstNote ?? null,
    },
    lineItems: cleanedItems,
  };
}

export function sanitizePlumbingLineItems(
  items: Array<Record<string, unknown>>,
  knownQuoteTotal?: number | null
): { cleanedItems: Array<Record<string, unknown>>; quoteTotalFound: number | null } {
  const wrapped = items.map((item) => ({
    description: String(item.description ?? item.desc ?? item.item ?? ""),
    qty: toNumber(item.qty),
    unit: item.unit as string | null,
    rate: toNumber(item.rate ?? item.unit_rate),
    total: toNumber(item.total ?? item.total_price),
    total_price: toNumber(item.total_price),
    ...item,
  }));

  const parsedResult = sanitizePlumbingParsedQuote({
    quoteTotal: knownQuoteTotal ?? null,
    lineItems: wrapped,
  });

  return {
    cleanedItems: (parsedResult.lineItems ?? []) as Array<Record<string, unknown>>,
    quoteTotalFound: parsedResult.quoteTotal ?? null,
  };
}
