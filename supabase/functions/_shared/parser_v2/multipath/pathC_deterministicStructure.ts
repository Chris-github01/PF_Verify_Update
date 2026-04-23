/**
 * Path C — Deterministic Structure.
 *
 * Zero-LLM regex + heuristics. Works on any document by:
 *   1. Enumerating every currency-like token.
 *   2. Clustering values that plausibly form a SUBTOTAL + GST = TOTAL
 *      relationship (GST in AU/NZ is 10% / 15%).
 *   3. Detecting rollup patterns: the largest value that is
 *      approximately the sum of other values on the same page.
 *   4. Scoring building-level / section rollup totals.
 *
 * Produces a best-guess total with confidence, along with ALL detected
 * currency values so downstream components can explain the decision.
 */

export type CurrencyHit = {
  value: number;
  raw: string;
  pageNum: number | null;
  char_offset: number;
  context: string;
};

export type GstRelation = {
  subtotal: number;
  gst: number;
  total: number;
  rate: number;
  confidence: number;
};

export type RollupMatch = {
  total: number;
  components: number[];
  confidence: number;
};

export type PathCResult = {
  all_currency: CurrencyHit[];
  gst_relations: GstRelation[];
  rollups: RollupMatch[];
  best_total: number | null;
  best_source: "gst_relation" | "rollup" | "max_value" | null;
  confidence: number;
  succeeded: boolean;
};

const CURRENCY_RE = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2}|\d{4,})/g;
const GST_RATES = [0.1, 0.15];
const TOLERANCE = 0.015; // 1.5% match tolerance
const MIN_VALUE = 100;

export function runPathC(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
}): PathCResult {
  const hits = extractCurrencyHits(ctx);
  if (hits.length === 0) {
    return {
      all_currency: [],
      gst_relations: [],
      rollups: [],
      best_total: null,
      best_source: null,
      confidence: 0,
      succeeded: false,
    };
  }

  const gstRelations = detectGstRelations(hits);
  const rollups = detectRollups(hits);

  let best_total: number | null = null;
  let best_source: PathCResult["best_source"] = null;
  let confidence = 0;

  // Cross-corroborate GST relations with rollups: a GST total that also
  // appears as a rollup total is far more likely to be the grand total.
  const rollupTotals = new Set(rollups.map((r) => r.total.toFixed(2)));
  const corroboratedGst = gstRelations.map((r) => ({
    ...r,
    confidence: rollupTotals.has(r.total.toFixed(2)) ? Math.min(1, r.confidence + 0.06) : r.confidence,
    corroborated: rollupTotals.has(r.total.toFixed(2)),
  }));

  if (corroboratedGst.length > 0) {
    // Rank by: corroborated first, then confidence, then total size
    // (larger totals are more likely to be the actual grand total).
    const top = corroboratedGst.sort((a, b) => {
      if (a.corroborated !== b.corroborated) return a.corroborated ? -1 : 1;
      if (Math.abs(a.confidence - b.confidence) > 0.001) return b.confidence - a.confidence;
      return b.total - a.total;
    })[0];
    best_total = top.total;
    best_source = "gst_relation";
    confidence = top.confidence;
  } else if (rollups.length > 0) {
    // Prefer larger rollups when confidences tie — grand totals dominate.
    const top = rollups.sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) > 0.001) return b.confidence - a.confidence;
      return b.total - a.total;
    })[0];
    best_total = top.total;
    best_source = "rollup";
    confidence = top.confidence;
  } else {
    // fallback: largest currency value with moderate confidence
    const max = hits.reduce((a, b) => (a.value > b.value ? a : b));
    if (max.value >= MIN_VALUE) {
      best_total = max.value;
      best_source = "max_value";
      confidence = 0.35;
    }
  }

  return {
    all_currency: hits,
    gst_relations: gstRelations,
    rollups,
    best_total,
    best_source,
    confidence,
    succeeded: best_total != null,
  };
}

function extractCurrencyHits(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
}): CurrencyHit[] {
  const hits: CurrencyHit[] = [];
  const sources =
    ctx.pages && ctx.pages.length > 0
      ? ctx.pages.map((p) => ({ text: p.text, pageNum: p.pageNum as number | null }))
      : [{ text: ctx.rawText, pageNum: null as number | null }];
  for (const src of sources) {
    const pattern = new RegExp(CURRENCY_RE.source, CURRENCY_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(src.text)) !== null) {
      const value = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(value) || value < MIN_VALUE) continue;
      const ctxStart = Math.max(0, m.index - 40);
      const ctxEnd = Math.min(src.text.length, m.index + m[0].length + 40);
      hits.push({
        value,
        raw: m[0],
        pageNum: src.pageNum,
        char_offset: m.index,
        context: src.text.slice(ctxStart, ctxEnd),
      });
    }
  }
  return hits;
}

function detectGstRelations(hits: CurrencyHit[]): GstRelation[] {
  const relations: GstRelation[] = [];
  const values = hits.map((h) => h.value);
  const valueSet = new Set(values);

  for (const subtotal of values) {
    for (const rate of GST_RATES) {
      const expectedGst = subtotal * rate;
      const expectedTotal = subtotal * (1 + rate);
      const matchedGst = findCloseValue(values, expectedGst, TOLERANCE);
      const matchedTotal = findCloseValue(values, expectedTotal, TOLERANCE);
      if (matchedGst != null && matchedTotal != null && valueSet.has(matchedTotal)) {
        const confidence = 0.88 + (rate === 0.1 ? 0.04 : 0); // AU GST slight boost
        relations.push({
          subtotal,
          gst: matchedGst,
          total: matchedTotal,
          rate,
          confidence,
        });
      }
    }
  }

  // dedupe by (subtotal,total,rate)
  const seen = new Map<string, GstRelation>();
  for (const r of relations) {
    const key = `${r.subtotal.toFixed(2)}|${r.total.toFixed(2)}|${r.rate}`;
    const existing = seen.get(key);
    if (!existing || r.confidence > existing.confidence) seen.set(key, r);
  }
  return [...seen.values()];
}

function findCloseValue(values: number[], target: number, tol: number): number | null {
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const v of values) {
    if (v <= 0) continue;
    const rel = Math.abs(v - target) / target;
    if (rel <= tol && rel < bestDiff) {
      best = v;
      bestDiff = rel;
    }
  }
  return best;
}

function detectRollups(hits: CurrencyHit[]): RollupMatch[] {
  const results: RollupMatch[] = [];
  if (hits.length < 3) return results;

  // For each candidate total, see if there exists a subset of other
  // values whose sum approximates it. Restrict subset size to 2..6 for
  // tractability. This finds "building A + B + C = grand total" style
  // rollups without exhaustive 2^N search.
  const sorted = [...hits].sort((a, b) => b.value - a.value);
  const largest = sorted.slice(0, 5); // candidates for "total"
  const components = sorted.slice(1).map((h) => h.value);

  for (const cand of largest) {
    const match = findSubsetSum(components, cand.value, TOLERANCE);
    if (match) {
      const confidence = match.length >= 3 ? 0.75 : 0.6;
      results.push({
        total: cand.value,
        components: match,
        confidence,
      });
    }
  }
  return results;
}

function findSubsetSum(
  values: number[],
  target: number,
  tol: number,
): number[] | null {
  // Greedy descending then pairwise refinement — bounded and predictable.
  const sorted = [...values].filter((v) => v > 0 && v < target).sort((a, b) => b - a);
  for (let start = 0; start < Math.min(sorted.length, 10); start++) {
    const picked: number[] = [];
    let remaining = target;
    for (let i = start; i < sorted.length && picked.length < 8; i++) {
      if (sorted[i] <= remaining + target * tol) {
        picked.push(sorted[i]);
        remaining -= sorted[i];
        if (Math.abs(remaining) <= target * tol) return picked;
      }
    }
  }
  return null;
}
