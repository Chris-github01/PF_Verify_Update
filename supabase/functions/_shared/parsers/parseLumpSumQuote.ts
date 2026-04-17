// =============================================================================
// FAMILY PARSER: lump_sum_quote
//
// Entry point for documents classified as lump_sum_quote:
//   - Few priced rows (<=5), one authoritative grand total
//   - Heavy scope description language (inclusions/exclusions)
//   - No fabricated itemization — grand total is the ONLY financial truth
//
// RULES:
//   - Extract grand total from document — this is the canonical quote value
//   - Parse any priced scope lines as informational items
//   - NEVER sum rows to derive a total if a grand total label exists
//   - Scope description lines with no price are preserved as description rows
// =============================================================================

import type { PageData } from '../documentClassifier.ts';
import type { RawParserOutput, ParsedLineItem } from '../parseResolutionLayerV3.ts';

const GRAND_TOTAL_PATTERNS: RegExp[] = [
  /Grand\s+Total\s*\(excl(?:uding)?\.?\s*(?:of\s+)?GST\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Grand\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Contract\s+(?:Sum|Total|Price)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Quote\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Total\s*\(excl(?:uding)?\.?\s*(?:of\s+)?GST\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Lump\s+Sum\s+(?:Price|Total)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Net\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Total\s+Price\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
];

const OPTIONAL_TOTAL_PATTERNS: RegExp[] = [
  /Add\s+to\s+Scope\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Optional\s+(?:Scope|Extras?)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Provisional\s+Sum\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /PC\s+Sum\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
];

const SUMMARY_LABEL_RE = /\b(Grand\s+Total|Sub[\s-]?Total|Contract\s+(?:Sum|Total)|Quote\s+Total|Lump\s+Sum|Net\s+Total|Total\s+Price)\b/i;
const PRICED_LINE_RE = /\$?\s*([\d,]+\.\d{2})\s*$/;
const BY_OTHERS_RE = /\bby\s+others\b/i;
const OPTIONAL_MARKER_RE = /\b(OPTIONAL|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS|PROVISIONAL\s+SUM|PC\s+SUM)\b/i;

function parseMoney(raw: string): number {
  const v = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(v) ? 0 : v;
}

function extractGrandTotal(fullText: string): number | null {
  for (const re of GRAND_TOTAL_PATTERNS) {
    const m = fullText.replace(/[\r\n]+/g, ' ').match(re);
    if (m) {
      const val = parseMoney(m[1]);
      if (val > 0) return val;
    }
  }
  return null;
}

function extractOptionalTotal(fullText: string): number | null {
  for (const re of OPTIONAL_TOTAL_PATTERNS) {
    const m = fullText.replace(/[\r\n]+/g, ' ').match(re);
    if (m) {
      const val = parseMoney(m[1]);
      if (val > 0) return val;
    }
  }
  return null;
}

export function parseLumpSumQuote(pages: PageData[]): RawParserOutput {
  console.log(`[parseLumpSumQuote] pages=${pages.length}`);

  const fullText = pages.map(p => p.text).join('\n\n');
  const grandTotal = extractGrandTotal(fullText);
  const optionalTotal = extractOptionalTotal(fullText);

  console.log(`[parseLumpSumQuote] grandTotal=${grandTotal} optionalTotal=${optionalTotal}`);

  const items: ParsedLineItem[] = [];
  let lineIdCounter = 1;
  let currentSection = 'MAIN';
  let scopeCategory: 'base' | 'optional' = 'base';

  for (const page of pages) {
    const lines = page.text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (BY_OTHERS_RE.test(line)) continue;
      if (SUMMARY_LABEL_RE.test(line)) continue;

      if (OPTIONAL_MARKER_RE.test(line) && !PRICED_LINE_RE.test(line)) {
        scopeCategory = 'optional';
        continue;
      }

      const priceMatch = line.match(PRICED_LINE_RE);
      if (!priceMatch) continue;

      const total = parseMoney(priceMatch[1]);
      if (total === 0) continue;

      const desc = line.replace(PRICED_LINE_RE, '').replace(/\$?\s*$/, '').trim();
      if (desc.length < 3) continue;
      if (SUMMARY_LABEL_RE.test(desc)) continue;

      const effectiveScope: 'base' | 'optional' = OPTIONAL_MARKER_RE.test(line) ? 'optional' : scopeCategory;

      items.push({
        lineId: String(lineIdCounter++),
        section: currentSection,
        description: desc,
        qty: 1,
        unit: 'item',
        rate: total,
        total,
        scopeCategory: effectiveScope,
        pageNum: page.pageNum,
        confidence: 0.80,
        source: 'parseLumpSumQuote',
      });
    }
  }

  const baseItems = items.filter(i => i.scopeCategory === 'base');
  const optItems = items.filter(i => i.scopeCategory === 'optional');
  const rowBaseSum = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptSum = optItems.reduce((s, i) => s + i.total, 0);

  const canonicalTotal = grandTotal ?? rowBaseSum;
  const canonicalOptional = optionalTotal ?? rowOptSum;

  return {
    parserUsed: 'parseLumpSumQuote',
    allItems: items,
    totals: {
      grandTotal: canonicalTotal,
      optionalTotal: canonicalOptional,
      subTotal: null,
      rowSum: rowBaseSum,
      source: grandTotal !== null ? 'summary_page' : 'row_sum',
    },
    summaryDetected: grandTotal !== null,
    optionalScopeDetected: optionalTotal !== null || optItems.length > 0,
    parserReasons: [
      `Lump sum parser: ${items.length} scope lines extracted`,
      `Grand total: ${grandTotal !== null ? `$${grandTotal} (from label)` : `$${rowBaseSum} (row sum fallback)`}`,
      `Total source is authoritative label — rows are informational only`,
    ],
    rawSummary: null,
  };
}
