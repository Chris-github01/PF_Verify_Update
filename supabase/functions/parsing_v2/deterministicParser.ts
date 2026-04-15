import type { RawLineItem, SmartChunk } from "./types.ts";
import {
  extractFRR,
  isLumpSumPattern,
  isSummaryLine,
  mathCheck,
  parseMoney,
  roundTo2,
} from "./utils.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNIT_TOKENS = /\b(ea|each|no\.?|nr|m2|m²|sqm|lm|rm|m3|m|mm|kg|t\b|tonne|ls|l\.s\.|lump\s*sum|item|kit|set|pair|hr|hour|day|week|allow|pc|pcs|box|bag|roll|length|lot|asm|assy)\b/i;

const NOISE_TERMS = /\b(subtotal|sub\s*total|grand\s*total|contract\s*sum|margin|gst|tax|overhead|profit)\b/i;

const MONEY_RE = /\$?\s*([\d,\s]{1,15}\.\d{2})\b/g;
const PLAIN_NUM_RE = /\b(\d{1,6}(?:\.\d{1,4})?)\b/g;

// Minimum spacing to treat as column separator
const COL_SPLIT_RE = /  +/;

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function parseMonyRobust(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function extractAllMoneyValues(line: string): number[] {
  const values: number[] = [];
  const pattern = /\$?\s*([\d,\s]{1,15}\.\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(line)) !== null) {
    const v = parseMonyRobust(m[1]);
    if (v > 0) values.push(v);
  }
  return values;
}

function extractAllNumbers(line: string): number[] {
  const moneyPositions = new Set<number>();
  const moneyPat = /\$?\s*[\d,\s]{1,15}\.\d{2}\b/g;
  let mm: RegExpExecArray | null;
  while ((mm = moneyPat.exec(line)) !== null) {
    for (let i = mm.index; i < mm.index + mm[0].length; i++) moneyPositions.add(i);
  }

  const values: number[] = [];
  const numPat = /\b(\d{1,6}(?:\.\d{1,4})?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = numPat.exec(line)) !== null) {
    if (!moneyPositions.has(m.index)) {
      const v = parseFloat(m[1]);
      if (v > 0) values.push(v);
    }
  }
  return values;
}

function extractUnit(line: string): string | null {
  const m = line.match(UNIT_TOKENS);
  return m ? m[0].trim().toLowerCase() : null;
}

function stripNumbers(line: string): string {
  return line
    .replace(/\$?\s*[\d,\s]{1,15}\.\d{2}\b/g, "")
    .replace(/\b\d+\.?\d*\s*(ea|each|no\.?|nr|m2|m²|sqm|lm|rm|m|ls|item|kit|set|hr|allow)\b/gi, "")
    .replace(/\b\d+\.?\d*\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDescription(raw: string): string {
  return raw
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–•·*]+\s*/, "")
    .replace(/\s+$/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// 4. NOISE FILTER
// Returns true if the line should be skipped entirely
// ---------------------------------------------------------------------------

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (isSummaryLine(trimmed)) return true;
  if (NOISE_TERMS.test(trimmed)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 2. COLUMN DETECTION — split by 2+ spaces, detect numeric columns RTL
// last numeric = total, second-last = rate, first numeric = qty
// ---------------------------------------------------------------------------

interface ColumnParseResult {
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  method: "column" | "fallback";
}

function tryColumnParse(line: string): ColumnParseResult | null {
  const cols = line.split(COL_SPLIT_RE).map((c) => c.trim()).filter(Boolean);
  if (cols.length < 2) return null;

  // Collect numeric column indexes from right to left
  const numericCols: Array<{ idx: number; value: number }> = [];
  for (let i = cols.length - 1; i >= 0; i--) {
    const stripped = cols[i].replace(/[$,\s]/g, "");
    const n = parseFloat(stripped);
    if (Number.isFinite(n) && n > 0) {
      numericCols.push({ idx: i, value: n });
    }
  }

  if (numericCols.length === 0) return null;

  // RTL assignment: last = total, second-last = rate, earlier = qty
  const total = numericCols[0]?.value ?? null;
  const rate = numericCols[1]?.value ?? null;
  const qty = numericCols[2]?.value ?? null;

  // Description columns = everything that isn't a numeric column
  const numericIdxs = new Set(numericCols.map((n) => n.idx));
  const descParts = cols.filter((_, i) => !numericIdxs.has(i));
  const rawDesc = descParts.join(" ").trim();

  if (!rawDesc || rawDesc.length < 3) return null;

  const unit = extractUnit(rawDesc);
  const description = cleanDescription(rawDesc);

  return { description, qty, unit, rate, total, method: "column" };
}

// ---------------------------------------------------------------------------
// Fallback: infer fields from raw numeric values in the line
// ---------------------------------------------------------------------------

interface ParsedNumbers {
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
}

function inferFieldsFallback(line: string): ParsedNumbers {
  const moneyValues = extractAllMoneyValues(line);
  const plainNumbers = extractAllNumbers(line);
  const unit = extractUnit(line);

  if (moneyValues.length === 0 && plainNumbers.length === 0) {
    return { qty: null, unit: null, rate: null, total: null };
  }

  // 3. LUMP SUM DETECTION — explicit pattern OR only 1 price and no qty
  if (isLumpSumPattern(line)) {
    const total = moneyValues[moneyValues.length - 1] ?? null;
    return { qty: 1, unit: "ls", rate: total, total };
  }

  if (moneyValues.length >= 2) {
    const total = moneyValues[moneyValues.length - 1];
    const rate = moneyValues[moneyValues.length - 2];

    if (plainNumbers.length > 0) {
      const qty = plainNumbers[0];
      return { qty, unit: unit ?? "ea", rate, total };
    }

    const impliedQty = rate > 0 ? roundTo2(total / rate) : null;
    const qtyIsClean = impliedQty !== null && Math.abs(impliedQty - Math.round(impliedQty)) < 0.05;
    return {
      qty: qtyIsClean ? Math.round(impliedQty) : impliedQty,
      unit: unit ?? "ea",
      rate,
      total,
    };
  }

  if (moneyValues.length === 1) {
    const total = moneyValues[0];

    if (plainNumbers.length >= 2) {
      const qty = plainNumbers[0];
      const rate = plainNumbers[1];
      const computed = roundTo2(qty * rate);
      const diff = Math.abs(computed - total);
      if (diff < Math.max(1, total * 0.02)) {
        return { qty, unit: unit ?? "ea", rate, total };
      }
    }

    if (plainNumbers.length === 1) {
      const qty = plainNumbers[0];
      const rate = qty > 0 ? roundTo2(total / qty) : total;
      return { qty, unit: unit ?? "ea", rate, total };
    }

    // 3. LUMP SUM: only 1 price, no qty
    return { qty: 1, unit: unit ?? "ls", rate: total, total };
  }

  // No money values — use plain numbers RTL
  if (plainNumbers.length >= 3) {
    const total = plainNumbers[plainNumbers.length - 1];
    const rate = plainNumbers[plainNumbers.length - 2];
    const qty = plainNumbers[plainNumbers.length - 3];
    return { qty, unit: unit ?? "ea", rate, total };
  }

  if (plainNumbers.length === 2) {
    const total = plainNumbers[plainNumbers.length - 1];
    const rate = plainNumbers[plainNumbers.length - 2];
    return { qty: 1, unit: unit ?? "ls", rate, total };
  }

  if (plainNumbers.length === 1) {
    const total = plainNumbers[0];
    return { qty: 1, unit: unit ?? "ls", rate: total, total };
  }

  return { qty: null, unit: null, rate: null, total: null };
}

// ---------------------------------------------------------------------------
// 5. PARSE CONFIDENCE scoring
// ---------------------------------------------------------------------------

function scoreParseConfidence(params: {
  hasMoney: boolean;
  hasQty: boolean;
  hasRate: boolean;
  hasTotal: boolean;
  mathChecksOut: boolean;
  descLength: number;
  method: "column" | "fallback" | "multiline";
}): number {
  let score = 0;

  // Base: description quality
  if (params.descLength >= 10) score += 0.15;
  else if (params.descLength >= 5) score += 0.08;

  // Numeric field presence
  if (params.hasTotal) score += 0.25;
  if (params.hasRate) score += 0.15;
  if (params.hasQty) score += 0.15;

  // Money vs plain numbers
  if (params.hasMoney) score += 0.10;

  // Math consistency
  if (params.mathChecksOut) score += 0.20;

  // Method bonus
  if (params.method === "column") score += 0.10;
  else if (params.method === "multiline") score += 0.05;

  return Math.min(1, roundTo2(score));
}

// ---------------------------------------------------------------------------
// Single-line parse
// ---------------------------------------------------------------------------

function tryParseFullRow(line: string, lineIndex: number): RawLineItem | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length < 5) return null;
  if (isNoiseLine(trimmed)) return null;

  const hasMoney = /\$?\s*[\d,]+\.\d{2}/.test(trimmed);
  const hasDescription = /[A-Za-z]{3,}/.test(trimmed);

  if (!hasDescription) return null;

  // Try column-split first (more reliable)
  const colResult = tryColumnParse(trimmed);
  if (colResult && colResult.total !== null && colResult.total > 0 && colResult.description.length >= 3) {
    const mathOk = colResult.qty !== null && colResult.rate !== null
      ? mathCheck(colResult.qty, colResult.rate, colResult.total)
      : false;

    const parseConfidence = scoreParseConfidence({
      hasMoney,
      hasQty: colResult.qty !== null,
      hasRate: colResult.rate !== null,
      hasTotal: colResult.total !== null,
      mathChecksOut: mathOk,
      descLength: colResult.description.length,
      method: "column",
    });

    const hasQtyAndRate = colResult.qty !== null && colResult.rate !== null;
    const confidence: "high" | "medium" | "low" = hasQtyAndRate && hasMoney && mathOk
      ? "high"
      : hasQtyAndRate && hasMoney
      ? "medium"
      : hasMoney
      ? "medium"
      : "low";

    return {
      description: colResult.description,
      qty: colResult.qty,
      unit: colResult.unit,
      rate: colResult.rate,
      total: colResult.total,
      sourceLineIndex: lineIndex,
      rawLine: trimmed,
      confidence,
      parseMethod: "deterministic",
      parseConfidence,
    };
  }

  // Fallback: regex-based inference
  const fields = inferFieldsFallback(trimmed);

  if (fields.total === null && fields.qty === null) return null;
  if (fields.total !== null && fields.total <= 0) return null;

  const descRaw = stripNumbers(trimmed);
  const desc = cleanDescription(descRaw);
  if (desc.length < 3) return null;

  const mathOk = fields.qty !== null && fields.rate !== null && fields.total !== null
    ? mathCheck(fields.qty, fields.rate, fields.total)
    : false;

  const parseConfidence = scoreParseConfidence({
    hasMoney,
    hasQty: fields.qty !== null,
    hasRate: fields.rate !== null,
    hasTotal: fields.total !== null,
    mathChecksOut: mathOk,
    descLength: desc.length,
    method: "fallback",
  });

  const hasQtyAndRate = fields.qty !== null && fields.rate !== null;
  const confidence: "high" | "medium" | "low" = hasQtyAndRate && hasMoney && mathOk
    ? "high"
    : hasMoney
    ? "medium"
    : "low";

  return {
    description: desc,
    qty: fields.qty,
    unit: fields.unit,
    rate: fields.rate,
    total: fields.total,
    sourceLineIndex: lineIndex,
    rawLine: trimmed,
    confidence,
    parseMethod: "deterministic",
    parseConfidence,
  };
}

// ---------------------------------------------------------------------------
// 1. MULTI-LINE ROW JOINING
// Detects: line ends without a price, next line starts with numbers → join
// ---------------------------------------------------------------------------

function lineEndsWithoutPrice(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Has description text but no money/number at the end
  const hasDesc = /[A-Za-z]{3,}/.test(trimmed);
  const hasMoney = /\$?\s*[\d,]+\.\d{2}\s*$/.test(trimmed);
  const hasTrailingNumber = /\d\s*$/.test(trimmed);
  return hasDesc && !hasMoney && !hasTrailingNumber;
}

function nextLineStartsWithNumbers(line: string): boolean {
  const trimmed = line.trim();
  // Starts with a digit, currency, or common qty patterns
  return /^[\d$]/.test(trimmed) || /^\d+\s+(ea|m|m2|lm|ls|nr|each)\b/i.test(trimmed);
}

function tryParseMultiLine(
  lines: string[],
  startIndex: number
): { item: RawLineItem; linesConsumed: number } | null {
  const firstLine = lines[startIndex]?.trim() ?? "";
  if (!firstLine || firstLine.length < 5) return null;
  if (isNoiseLine(firstLine)) return null;

  const firstHasDesc = /[A-Za-z]{3,}/.test(firstLine);
  if (!firstHasDesc) return null;

  // Check if first line genuinely lacks a price
  const firstHasMoney = /\$?\s*[\d,]+\.\d{2}/.test(firstLine);
  if (firstHasMoney) return null;

  // Scan up to 2 continuation lines
  let combined = firstLine;
  let linesConsumed = 1;

  for (let offset = 1; offset <= 2 && startIndex + offset < lines.length; offset++) {
    const nextLine = lines[startIndex + offset]?.trim() ?? "";
    if (!nextLine) break;
    if (isNoiseLine(nextLine)) break;

    const nextHasMoney = /\$?\s*[\d,]+\.\d{2}/.test(nextLine);
    const nextHasNumbers = /\b\d+\.?\d*\b/.test(nextLine);

    if (!nextHasMoney && !nextHasNumbers) break;

    combined = combined + " " + nextLine;
    linesConsumed = offset + 1;

    // Stop once we have a price — that's our complete row
    if (nextHasMoney) break;
  }

  if (linesConsumed === 1) return null;

  // Try column parse on the combined line first
  const colResult = tryColumnParse(combined);
  let fields: ParsedNumbers;
  let method: "column" | "fallback" | "multiline" = "multiline";

  if (colResult && colResult.total !== null && colResult.total > 0) {
    fields = {
      qty: colResult.qty,
      unit: colResult.unit,
      rate: colResult.rate,
      total: colResult.total,
    };
    method = "column";
  } else {
    fields = inferFieldsFallback(combined);
  }

  if (fields.total === null) return null;

  const desc = cleanDescription(firstLine);
  if (desc.length < 3) return null;

  const hasMoney = /\$?\s*[\d,]+\.\d{2}/.test(combined);
  const mathOk = fields.qty !== null && fields.rate !== null && fields.total !== null
    ? mathCheck(fields.qty, fields.rate, fields.total)
    : false;

  const parseConfidence = scoreParseConfidence({
    hasMoney,
    hasQty: fields.qty !== null,
    hasRate: fields.rate !== null,
    hasTotal: fields.total !== null,
    mathChecksOut: mathOk,
    descLength: desc.length,
    method,
  });

  return {
    item: {
      description: desc,
      qty: fields.qty,
      unit: fields.unit,
      rate: fields.rate,
      total: fields.total,
      sourceLineIndex: startIndex,
      rawLine: combined,
      confidence: hasMoney && mathOk ? "high" : hasMoney ? "medium" : "low",
      parseMethod: "deterministic",
      parseConfidence,
    },
    linesConsumed,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseDeterministic(chunk: SmartChunk): RawLineItem[] {
  const lines = chunk.chunkText.split("\n");
  const items: RawLineItem[] = [];
  const usedLines = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (usedLines.has(i)) continue;

    const singleResult = tryParseFullRow(lines[i], i);
    if (singleResult) {
      items.push(singleResult);
      usedLines.add(i);
      continue;
    }

    // 1. Try multi-line join when single-line parse fails
    const multiResult = tryParseMultiLine(lines, i);
    if (multiResult) {
      items.push(multiResult.item);
      for (let j = i; j < i + multiResult.linesConsumed; j++) usedLines.add(j);
      i += multiResult.linesConsumed - 1;
    }
  }

  return items;
}
