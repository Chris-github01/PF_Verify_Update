/**
 * Deterministic table parser — run BEFORE the LLM to cheaply extract
 * schedule rows when the document already has a clean columnar layout
 * (qty / unit / unit_rate / total).
 *
 * If this parser produces a non-empty set whose summed `total_price`
 * matches the authoritative total within tolerance, the caller SHOULD
 * skip the LLM extractor entirely.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";

export const TABLE_REGEX_PARSER_VERSION = "v1-deterministic-2026-04-23";

export type TableParseResult = {
  items: ParsedLineItemV2[];
  matched_total: number;
  row_count: number;
  matches_authoritative: boolean;
  strategy: "columnar" | "inline_currency" | "none";
};

const CURRENCY_RE = /-?\$?\s?\d[\d,]*(?:\.\d{1,2})?/;
const UNIT_RE = /\b(?:ea|each|no\.?|nr|lm|lin\.?m|m\b|m2|m²|sqm|sq\.?m|m3|cbm|kg|t|hr|hrs|hour|hours|day|days|wk|item|lot|ls|lump\s?sum|pc|pcs|pr|prs|set)\b/i;
const QTY_RE = /\b\d+(?:[.,]\d+)?\b/;

type ParsedRow = {
  item_number: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
};

/**
 * Parse a single line. Accepts two layouts:
 *  A. `{n} {description...} {qty} {unit} {rate} {total}` — qty/unit/rate/total at tail
 *  B. `{description...} {total}` — inline currency at tail (lump sum)
 */
function parseLine(line: string): ParsedRow | null {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (trimmed.length < 6) return null;

  // Find currency tokens (at least one, near the end)
  const currencyMatches = [...trimmed.matchAll(/-?\$?\s?\d[\d,]*\.\d{2}|\$\s?\d[\d,]*/g)];
  if (currencyMatches.length === 0) return null;

  const lastMatch = currencyMatches[currencyMatches.length - 1];
  if (typeof lastMatch.index !== "number") return null;
  // Total must sit in the last 30% of the line
  if (lastMatch.index < trimmed.length * 0.5) return null;

  const total = toNumberOrNull(lastMatch[0]);
  if (total == null) return null;

  const head = trimmed.slice(0, lastMatch.index).trim();

  // Columnar: try to pull `qty unit rate` before total
  // e.g. "12 ea 45.00"
  const tailTokens = head.split(/\s+/);
  let quantity: number | null = null;
  let unit: string | null = null;
  let unit_price: number | null = null;

  if (tailTokens.length >= 3) {
    const t3 = tailTokens.slice(-3);
    const maybeRate = toNumberOrNull(t3[2]);
    const maybeUnit = UNIT_RE.test(t3[1]) ? t3[1] : null;
    const maybeQty = toNumberOrNull(t3[0]);
    if (maybeRate != null && maybeUnit != null && maybeQty != null) {
      quantity = maybeQty;
      unit = maybeUnit;
      unit_price = maybeRate;
      tailTokens.splice(-3, 3);
    }
  }
  if (quantity == null && tailTokens.length >= 2) {
    const t2 = tailTokens.slice(-2);
    const maybeRate = toNumberOrNull(t2[1]);
    const maybeQty = toNumberOrNull(t2[0]);
    if (maybeRate != null && maybeQty != null) {
      quantity = maybeQty;
      unit_price = maybeRate;
      tailTokens.splice(-2, 2);
    }
  }

  const itemMatch = /^(\d+(?:\.\d+)?|[A-Z]\d+)\s+/.exec(tailTokens.join(" "));
  let item_number: string | null = null;
  let descriptionTokens = tailTokens;
  if (itemMatch) {
    item_number = itemMatch[1];
    descriptionTokens = tailTokens.slice(1);
  }
  const description = descriptionTokens.join(" ").trim();
  if (!description || description.length < 4) return null;

  return { item_number, description, quantity, unit, unit_price, total_price: total };
}

function toNumberOrNull(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[$,\s()]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Attempt to parse a document as a columnar schedule. Returns empty result
 * if the document is not well-formed enough to trust.
 */
export function tryDeterministicTableParse(args: {
  rawText: string;
  trade: string;
  authoritativeTotal?: number | null;
  tolerance?: number;
}): TableParseResult {
  const tolerance = args.tolerance ?? 0.02;
  const lines = (args.rawText ?? "").split(/\r?\n/);
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) rows.push(parsed);
  }

  if (rows.length < 3) {
    return {
      items: [],
      matched_total: 0,
      row_count: 0,
      matches_authoritative: false,
      strategy: "none",
    };
  }

  // Heuristic: require at least 50% of rows to have quantity+unit_price (columnar)
  const columnarCount = rows.filter((r) => r.quantity != null && r.unit_price != null).length;
  const strategy: "columnar" | "inline_currency" =
    columnarCount / rows.length >= 0.5 ? "columnar" : "inline_currency";

  const sum = rows.reduce((s, r) => s + (r.total_price ?? 0), 0);

  let matches_authoritative = false;
  if (args.authoritativeTotal != null && args.authoritativeTotal > 0) {
    const diff = Math.abs(sum - args.authoritativeTotal) / args.authoritativeTotal;
    matches_authoritative = diff <= tolerance;
  }

  const items: ParsedLineItemV2[] = rows.map((r) => ({
    item_number: r.item_number,
    description: r.description,
    quantity: r.quantity,
    unit: r.unit,
    unit_price: r.unit_price,
    total_price: r.total_price,
    scope_category: "main",
    trade: args.trade,
    sub_scope: null,
    frr: null,
    source: "deterministic_table",
    confidence: matches_authoritative ? 0.92 : 0.7,
  }));

  return {
    items,
    matched_total: sum,
    row_count: rows.length,
    matches_authoritative,
    strategy,
  };
}
