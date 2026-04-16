/**
 * Document Total Extractor
 *
 * Extracts authoritative totals from raw PDF text BEFORE any row filtering.
 * Distinguishes grand total, subtotals, optional scope totals, and block totals.
 *
 * IMPORTANT: Must be called on raw text, not on parsed items.
 */

export interface DocumentTotals {
  grandTotal: number | null;
  subTotal: number | null;
  optionalTotal: number | null;
  blockTotals: Array<{ label: string; value: number }>;
}

function parseSpacedAmount(raw: string): number {
  const noCommas = raw.replace(/,/g, '');
  const tokens = noCommas.trim().split(/\s+/).filter(t => /^\d+(\.\d+)?$/.test(t));
  if (tokens.length === 0) return 0;
  const merged = tokens.join('');
  const val = parseFloat(merged);
  return Number.isFinite(val) ? val : 0;
}

function flattenText(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const GRAND_TOTAL_PATTERNS: RegExp[] = [
  /Grand\s+Total\s*\(\s*excl(?:uding)?\.?\s*GST\s*\)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Grand\s+Total\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /TOTAL\s*\(\s*excl(?:uding)?\.?\s*GST\s*\)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Total\s+Price\s*\(\s*excl(?:uding)?\.?\s*GST\s*\)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Contract\s+(?:Sum|Total|Price|Value)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Quote\s+Total\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Lump\s+Sum\s+(?:Total\s+)?:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Net\s+Total\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Tender\s+(?:Sum|Total)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
];

const SUB_TOTAL_PATTERNS: RegExp[] = [
  /Sub[-\s]?Total\s*\([^)]{0,80}\)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Sub[-\s]?Total\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /Section\s+Total\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
];

const OPTIONAL_SCOPE_PATTERNS: RegExp[] = [
  /OPTIONAL\s+SCOPE\s+TOTAL\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /ADD\s+TO\s+SCOPE\s+TOTAL\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /OPTIONAL\s+ITEMS?\s+TOTAL\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
  /OPTIONAL\s+(?:ITEMS?|WORKS?|SCOPE)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
];

const BLOCK_TOTAL_PATTERNS: RegExp[] = [
  /((?:BLOCK|LEVEL|ZONE|STAGE|BUILDING|AREA|LOT)\s+[A-Z0-9]{1,5})\s+(?:TOTAL|SUB[-\s]?TOTAL)\s*:?\s*\$?\s*([\d][\d\s,]*(?:\.\d{1,2})?)/i,
];

function firstMatch(flat: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = flat.match(pattern);
    if (match) {
      const captureIdx = match.length - 1;
      const amount = parseSpacedAmount(match[captureIdx]);
      if (amount > 100) return amount;
    }
  }
  return null;
}

function allMatches(flat: string, patterns: RegExp[]): number[] {
  const results: number[] = [];
  for (const pattern of patterns) {
    const match = flat.match(pattern);
    if (match) {
      const captureIdx = match.length - 1;
      const amount = parseSpacedAmount(match[captureIdx]);
      if (amount > 100) results.push(amount);
    }
  }
  return results;
}

export function extractDocumentTotals(rawText: string): DocumentTotals {
  const flat = flattenText(rawText);

  const grandTotal = firstMatch(flat, GRAND_TOTAL_PATTERNS);

  const subTotalMatches = allMatches(flat, SUB_TOTAL_PATTERNS);
  const subTotal = subTotalMatches.length > 0
    ? subTotalMatches.reduce((a, b) => a > b ? a : b, 0)
    : null;

  const optionalTotal = firstMatch(flat, OPTIONAL_SCOPE_PATTERNS);

  const blockTotals: Array<{ label: string; value: number }> = [];
  for (const pattern of BLOCK_TOTAL_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = globalPattern.exec(flat)) !== null) {
      const label = match[1].trim();
      const value = parseSpacedAmount(match[2]);
      if (value > 100) blockTotals.push({ label, value });
    }
  }

  console.log(`[DocTotalExtractor] grandTotal=${grandTotal} subTotal=${subTotal} optionalTotal=${optionalTotal} blockTotals=${blockTotals.length}`);

  return { grandTotal, subTotal, optionalTotal, blockTotals };
}
