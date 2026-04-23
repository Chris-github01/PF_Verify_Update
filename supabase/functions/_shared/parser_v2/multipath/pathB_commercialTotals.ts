/**
 * Path B — Commercial Totals.
 *
 * Deterministic search for explicitly-labelled totals such as
 * "Grand Total", "Total Ex GST", "Quote Summary", "Submitted Price",
 * "Lump Sum", "Contract Value". Works even when Path A (line items)
 * extracts zero rows — many quotes are lump-sum or summary-only.
 *
 * Produces ranked candidates with a confidence score based on label
 * specificity, presence of currency symbol, proximity to other
 * rollup signals, and position in document.
 */

export type CommercialTotalCandidate = {
  label: string;
  value: number;
  raw_match: string;
  pageNum: number | null;
  char_offset: number;
  confidence: number;
  label_class:
    | "grand_total"
    | "total_ex_gst"
    | "total_inc_gst"
    | "submitted_price"
    | "lump_sum"
    | "contract_value"
    | "quote_summary"
    | "subtotal"
    | "other";
};

export type PathBResult = {
  candidates: CommercialTotalCandidate[];
  best: CommercialTotalCandidate | null;
  succeeded: boolean;
};

const LABEL_PATTERNS: {
  re: RegExp;
  class: CommercialTotalCandidate["label_class"];
  weight: number;
}[] = [
  {
    re: /(?:grand\s*total|total\s*amount\s*payable|total\s*payable)\s*(?:\(?\s*(?:ex(?:cl)?\.?\s*gst|including\s*gst|inc(?:l)?\.?\s*gst)?\s*\)?)?[\s:.\-–—]*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    class: "grand_total",
    weight: 0.95,
  },
  {
    re: /total\s*(?:price\s*)?(?:ex(?:cl)?\.?|excluding)\s*gst[\s:.\-–—]*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    class: "total_ex_gst",
    weight: 0.92,
  },
  {
    re: /total\s*(?:price\s*)?(?:inc(?:l)?\.?|including)\s*gst[\s:.\-–—]*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    class: "total_inc_gst",
    weight: 0.9,
  },
  {
    re: /submitted\s*price[\s:.\-–—]*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    class: "submitted_price",
    weight: 0.88,
  },
  {
    re: /lump\s*sum\s*(?:price|amount|total)?[\s:.\-–—]*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    class: "lump_sum",
    weight: 0.85,
  },
  {
    re: /contract\s*(?:sum|value|price|amount)[\s:.\-–—]*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    class: "contract_value",
    weight: 0.85,
  },
  {
    re: /quote\s*(?:summary|total|amount|price)[\s:.\-–—]*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    class: "quote_summary",
    weight: 0.8,
  },
  {
    re: /(?:sub\s*total|subtotal|net\s*total)[\s:.\-–—]*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    class: "subtotal",
    weight: 0.6,
  },
  {
    re: /(?:total\s*fee|fee\s*total|fee\s*proposal|total\s*cost)[\s:.\-–—]*\$?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    class: "other",
    weight: 0.7,
  },
];

const MIN_REASONABLE_TOTAL = 50; // quote under $50 is almost certainly a fragment

export function runPathB(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
}): PathBResult {
  const candidates: CommercialTotalCandidate[] = [];

  const sources: { text: string; pageNum: number | null }[] =
    ctx.pages && ctx.pages.length > 0
      ? ctx.pages.map((p) => ({ text: p.text, pageNum: p.pageNum }))
      : [{ text: ctx.rawText, pageNum: null }];

  for (const src of sources) {
    for (const { re, class: labelClass, weight } of LABEL_PATTERNS) {
      const pattern = new RegExp(re.source, re.flags);
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(src.text)) !== null) {
        const value = parseMoney(m[1]);
        if (value == null || value < MIN_REASONABLE_TOTAL) continue;
        const contextStart = Math.max(0, m.index - 40);
        const contextEnd = Math.min(src.text.length, m.index + m[0].length + 40);
        const context = src.text.slice(contextStart, contextEnd);
        candidates.push({
          label: labelFromMatch(m[0]),
          value,
          raw_match: m[0],
          pageNum: src.pageNum,
          char_offset: m.index,
          label_class: labelClass,
          confidence: scoreCandidate(weight, context, src.pageNum, sources.length),
        });
      }
    }
  }

  const deduped = dedupeByValueAndLabel(candidates);
  deduped.sort((a, b) => b.confidence - a.confidence);

  const best = deduped.length > 0 ? deduped[0] : null;

  return {
    candidates: deduped,
    best,
    succeeded: best != null,
  };
}

function parseMoney(raw: string): number | null {
  if (!raw) return null;
  const clean = raw.replace(/[,\s$]/g, "");
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function labelFromMatch(raw: string): string {
  return raw
    .replace(/\$?\s*[\d,]+(?:\.\d{1,2})?.*$/, "")
    .replace(/[\s:.\-–—]+$/, "")
    .trim();
}

function scoreCandidate(
  weight: number,
  context: string,
  pageNum: number | null,
  totalPages: number,
): number {
  let score = weight;

  if (/\$/.test(context)) score += 0.05;
  if (/\b(?:ex|excl|excluding)\s*gst\b/i.test(context)) score += 0.03;
  if (/\bgst\b/i.test(context)) score += 0.02;

  // totals near end of document are more authoritative
  if (pageNum != null && totalPages > 1) {
    const positional = pageNum / totalPages;
    if (positional > 0.6) score += 0.05;
    if (positional > 0.9) score += 0.03;
  }

  return Math.min(1, Math.max(0, score));
}

function dedupeByValueAndLabel(
  candidates: CommercialTotalCandidate[],
): CommercialTotalCandidate[] {
  const seen = new Map<string, CommercialTotalCandidate>();
  for (const c of candidates) {
    const key = `${c.label_class}|${c.value.toFixed(2)}`;
    const existing = seen.get(key);
    if (!existing || c.confidence > existing.confidence) {
      seen.set(key, c);
    }
  }
  return [...seen.values()];
}
