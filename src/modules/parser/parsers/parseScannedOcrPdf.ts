// =============================================================================
// PARSER: scanned_ocr_pdf
//
// For poor-quality scanned PDFs with irregular spacing and broken lines.
// Uses tolerant matching — wide character class patterns, flexible spacing.
// LLM normalization may be applied in the edge function layer.
// LLM must NEVER invent totals — totals must be found in text.
// =============================================================================

import type { PageData } from '../documentClassifier';
import type { RawParserOutput, ParsedLineItem } from '../parseResolutionLayer';

// Tolerant money: "$1,234.56" or "1234.56" or "1 234.56"
const MONEY_RE = /\$?\s*([\d][\d\s,]*\.\d{2})/;

// Tolerant line item: anything ending in a money amount, optionally preceded by qty+unit
const TOLERANT_ROW_RE = /^(.{3,100}?)\s+([\d,.]+)\s*$/;
const TOLERANT_FULL_ROW_RE = /^(.{3,100}?)\s+([\d.]+)\s+(ea|no\.?|nr|each|item|lm|m2|m)\s+\$?\s*([\d,\s]+\.\d{2})\s+\$?\s*([\d,\s]+\.\d{2})\s*$/i;

const MONEY_AT_END_RE = /\$?\s*([\d][\d\s,]*\.\d{2})\s*$/;

const GRAND_TOTAL_PATTERNS: RegExp[] = [
  /Grand\s+Total\s*[\s:]+\$?\s*([\d][\d\s,]*\.\d{2})/i,
  /Total\s*[\s:]+\$?\s*([\d][\d\s,]*\.\d{2})/i,
  /Contract\s+(?:Sum|Total)\s*[\s:]+\$?\s*([\d][\d\s,]*\.\d{2})/i,
];
const OPTIONAL_TOTAL_PATTERNS: RegExp[] = [
  /(?:Optional|Add\s+to\s+Scope|Provisional)\s*[\s:]+\$?\s*([\d][\d\s,]*\.\d{2})/i,
];

const SKIP_RE = [
  /^\s*$/, /^[-=]{3,}$/, /^page\s+\d/i,
  /\bby\s+others\b/i, /not\s+in\s+contract/i,
];

const OPTIONAL_MARKER_RE = /\b(OPTIONAL|ADD\s+TO\s+SCOPE|PROVISIONAL|PC\s+SUM)\b/i;

function parseMoney(raw: string): number {
  const v = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(v) ? 0 : v;
}

export function parseScannedOcrPdf(pages: PageData[]): RawParserOutput {
  const items: ParsedLineItem[] = [];
  let lineIdCounter = 1;
  let scopeCategory: 'base' | 'optional' = 'base';
  let grandTotal: number | null = null;
  let optionalTotal: number | null = null;

  const fullFlat = pages.map(p => p.text).join('\n').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

  // Extract totals from full text first (OCR may have split labels across lines)
  for (const re of GRAND_TOTAL_PATTERNS) {
    const m = fullFlat.match(re);
    if (m) { grandTotal = parseMoney(m[1]); break; }
  }
  for (const re of OPTIONAL_TOTAL_PATTERNS) {
    const m = fullFlat.match(re);
    if (m) { optionalTotal = parseMoney(m[1]); break; }
  }

  for (const page of pages) {
    const lines = page.text.split('\n').map(l => l.trim()).filter(Boolean);

    for (const rawLine of lines) {
      if (SKIP_RE.some(re => re.test(rawLine))) continue;

      // Collapse irregular spacing
      const line = rawLine.replace(/\s+/g, ' ').trim();

      if (OPTIONAL_MARKER_RE.test(line)) { scopeCategory = 'optional'; continue; }
      if (/Grand\s+Total|Contract\s+Total|Quote\s+Total/i.test(line)) continue;

      const effectiveScope = OPTIONAL_MARKER_RE.test(line) ? 'optional' : scopeCategory;

      // Try full row
      let m = line.match(TOLERANT_FULL_ROW_RE);
      if (m) {
        const [, desc, qtyRaw, unitRaw, rateRaw, totalRaw] = m;
        const total = parseMoney(totalRaw);
        if (total > 0) {
          items.push({
            lineId: String(lineIdCounter++),
            section: 'MAIN',
            description: desc.trim(),
            qty: parseFloat(qtyRaw) || 1,
            unit: unitRaw.toLowerCase(),
            rate: parseMoney(rateRaw),
            total,
            scopeCategory: effectiveScope,
            pageNum: page.pageNum,
            confidence: 0.70,
            source: 'scanned_ocr_pdf',
          });
          continue;
        }
      }

      // Try: anything ending in a dollar amount
      const endMoney = line.match(MONEY_AT_END_RE);
      if (endMoney && line.length > 8) {
        const total = parseMoney(endMoney[1]);
        const desc = line.slice(0, line.lastIndexOf(endMoney[0])).trim();
        if (total > 0 && desc.length > 2 && !/Grand|Total|Sub.?total|Contract/i.test(desc)) {
          items.push({
            lineId: String(lineIdCounter++),
            section: 'MAIN',
            description: desc,
            qty: 1, unit: 'item',
            rate: total, total,
            scopeCategory: effectiveScope,
            pageNum: page.pageNum,
            confidence: 0.55,
            source: 'scanned_ocr_pdf',
          });
        }
      }
    }
  }

  const baseItems = items.filter(i => i.scopeCategory === 'base');
  const optItems = items.filter(i => i.scopeCategory === 'optional');
  const rowBaseSum = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptSum = optItems.reduce((s, i) => s + i.total, 0);

  return {
    parserUsed: 'parseScannedOcrPdf',
    allItems: items,
    totals: {
      grandTotal: grandTotal ?? rowBaseSum,
      optionalTotal: optionalTotal ?? rowOptSum,
      subTotal: null,
      rowSum: rowBaseSum,
      source: grandTotal !== null ? 'summary_page' : 'row_sum',
    },
    summaryDetected: grandTotal !== null,
    optionalScopeDetected: optionalTotal !== null || optItems.length > 0,
    parserReasons: [
      `OCR-tolerant parsing used`,
      `Items extracted: ${items.length}`,
      `Low confidence — LLM normalization recommended`,
      `Grand total: ${grandTotal !== null ? `$${grandTotal} (from text)` : `$${rowBaseSum} (row sum)`}`,
    ],
    rawSummary: null,
  };
}
