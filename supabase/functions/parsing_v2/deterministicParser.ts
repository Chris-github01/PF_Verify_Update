import type { RawLineItem, SmartChunk } from "./types.ts";
import {
  extractFRR,
  isLumpSumPattern,
  isSummaryLine,
  parseMoney,
  roundTo2,
} from "./utils.ts";

const UNIT_TOKENS = /\b(ea|each|no\.?|nr|m2|m²|sqm|lm|rm|m3|m|mm|kg|t\b|tonne|ls|l\.s\.|lump\s*sum|item|kit|set|pair|hr|hour|day|week|allow|pc|pcs|box|bag|roll|length|lot|asm|assy)\b/i;

const MONEY_PATTERN = /\$?\s*([\d,\s]{1,15}\.\d{2})\b/g;
const NUMBER_PATTERN = /\b(\d{1,6}(?:\.\d{1,4})?)\b/g;

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

interface ParsedNumbers {
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
}

function inferFields(line: string): ParsedNumbers {
  const moneyValues = extractAllMoneyValues(line);
  const plainNumbers = extractAllNumbers(line);
  const unit = extractUnit(line);

  if (moneyValues.length === 0 && plainNumbers.length === 0) {
    return { qty: null, unit: null, rate: null, total: null };
  }

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

    return { qty: 1, unit: unit ?? "ls", rate: total, total };
  }

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

function tryParseFullRow(line: string, lineIndex: number): RawLineItem | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length < 5) return null;
  if (isSummaryLine(trimmed)) return null;

  const hasMoney = /\$?\s*[\d,]+\.\d{2}/.test(trimmed);
  const hasDescription = /[A-Za-z]{3,}/.test(trimmed);

  if (!hasMoney && !hasDescription) return null;
  if (!hasDescription) return null;

  const fields = inferFields(trimmed);

  if (fields.total === null && fields.qty === null) return null;
  if (fields.total !== null && fields.total <= 0) return null;

  const descRaw = stripNumbers(trimmed);
  const desc = cleanDescription(descRaw);

  if (desc.length < 3) return null;

  const hasQtyAndRate = fields.qty !== null && fields.rate !== null;
  const confidence: "high" | "medium" | "low" = hasQtyAndRate && hasMoney
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
  };
}

function tryParseMultiLine(
  lines: string[],
  startIndex: number
): { item: RawLineItem; linesConsumed: number } | null {
  const firstLine = lines[startIndex]?.trim() ?? "";
  if (!firstLine || firstLine.length < 5) return null;

  const firstHasDesc = /[A-Za-z]{3,}/.test(firstLine);
  const firstHasNumbers = /\d/.test(firstLine);
  const firstHasMoney = /\$?\s*[\d,]+\.\d{2}/.test(firstLine);

  if (!firstHasDesc) return null;
  if (firstHasMoney || (firstHasNumbers && firstHasDesc)) return null;

  const secondLine = lines[startIndex + 1]?.trim() ?? "";
  if (!secondLine) return null;

  const secondHasMoney = /\$?\s*[\d,]+\.\d{2}/.test(secondLine);
  const secondHasNumbers = /\b\d+\.?\d*\b/.test(secondLine);

  if (!secondHasMoney && !secondHasNumbers) return null;

  const combined = firstLine + " " + secondLine;
  const fields = inferFields(combined);

  if (fields.total === null) return null;

  const desc = cleanDescription(firstLine);
  if (desc.length < 3) return null;

  return {
    item: {
      description: desc,
      qty: fields.qty,
      unit: fields.unit,
      rate: fields.rate,
      total: fields.total,
      sourceLineIndex: startIndex,
      rawLine: combined,
      confidence: "medium",
      parseMethod: "deterministic",
    },
    linesConsumed: 2,
  };
}

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

    const multiResult = tryParseMultiLine(lines, i);
    if (multiResult) {
      items.push(multiResult.item);
      for (let j = i; j < i + multiResult.linesConsumed; j++) usedLines.add(j);
      i += multiResult.linesConsumed - 1;
    }
  }

  return items;
}
