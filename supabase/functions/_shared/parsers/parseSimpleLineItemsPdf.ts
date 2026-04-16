// =============================================================================
// PARSER: simple_line_items_pdf
//
// For short quotes with a standard item / qty / rate / total layout.
// No repeated multi-page schedule, no chunking required.
// Summary totals override row summation when present.
// =============================================================================

import type { PageData } from '../documentClassifier.ts';
import type { RawParserOutput, ParsedLineItem } from '../parseResolutionLayerV3.ts';

// Any line with a dollar amount that could be a line item
const ITEM_LINE_RE = /\$\s*([\d,]+\.\d{2})/;

// Unit patterns
const INLINE_ROW_RE = /^(.{3,80}?)\s+([\d.]+)\s+(ea|no\.?|nr|each|item|lm|m2|sqm|m|sum|ls|allow(?:ance)?)\s+\$?\s*([\d,]+\.\d{2})\s+\$?\s*([\d,]+\.\d{2})/i;
const INLINE_TOTAL_ONLY_RE = /^(.{3,80}?)\s+\$?\s*([\d,]+\.\d{2})$/;

const OPTIONAL_RE = /\b(OPTIONAL|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS|PROVISIONAL\s+SUM|PC\s+SUM)\b/i;
const BY_OTHERS_RE = /\bby\s+others\b/i;
const SUMMARY_LABEL_RE = /\b(Grand\s+Total|Sub[\s-]?Total|Contract\s+(?:Sum|Total)|Quote\s+Total|Total\s+(?:incl|excl|ex))\b/i;
const SECTION_RE = /^([A-Z][A-Za-z\s]{2,40}):?\s*$/;

const GRAND_TOTAL_PATTERNS: RegExp[] = [
  /Grand\s+Total\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Grand\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Contract\s+(?:Sum|Total|Price)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Quote\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Total\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
];

const OPTIONAL_TOTAL_PATTERNS: RegExp[] = [
  /Add\s+to\s+Scope\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Optional\s+Scope\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Optional\s+Extras\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
];

function parseMoney(raw: string): number {
  const v = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(v) ? 0 : v;
}

function normaliseUnit(raw: string): string {
  const u = raw.toLowerCase().trim().replace(/\.$/, '');
  const map: Record<string, string> = {
    no: 'ea', ea: 'ea', each: 'ea', nr: 'ea', item: 'ea',
    m: 'lm', lm: 'lm', m2: 'm2', sqm: 'm2',
    sum: 'sum', ls: 'sum', allow: 'allow', allowance: 'allow',
  };
  return map[u] ?? u;
}

export function parseSimpleLineItemsPdf(pages: PageData[]): RawParserOutput {
  const fullText = pages.map(p => p.text).join('\n\n');
  const flat = fullText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

  // Extract summary totals first
  let grandTotal: number | null = null;
  for (const re of GRAND_TOTAL_PATTERNS) {
    const m = flat.match(re);
    if (m) { grandTotal = parseMoney(m[1]); break; }
  }

  let optionalTotal: number | null = null;
  for (const re of OPTIONAL_TOTAL_PATTERNS) {
    const m = flat.match(re);
    if (m) { optionalTotal = parseMoney(m[1]); break; }
  }

  // Parse line items from all pages
  const items: ParsedLineItem[] = [];
  let currentSection = 'MAIN';
  let scopeCategory: 'base' | 'optional' = 'base';
  let lineIdCounter = 1;

  for (const page of pages) {
    const lines = page.text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (BY_OTHERS_RE.test(line)) continue;
      if (SUMMARY_LABEL_RE.test(line)) continue;

      const secMatch = line.match(SECTION_RE);
      if (secMatch && !ITEM_LINE_RE.test(line)) {
        currentSection = secMatch[1].trim();
      }
      if (OPTIONAL_RE.test(line)) {
        scopeCategory = 'optional';
        continue;
      }

      const effectiveScope = OPTIONAL_RE.test(line) ? 'optional' : scopeCategory;

      // Full row: description qty unit rate total
      let m = line.match(INLINE_ROW_RE);
      if (m) {
        const [, desc, qtyRaw, unitRaw, rateRaw, totalRaw] = m;
        const total = parseMoney(totalRaw);
        if (total > 0) {
          const qty = parseFloat(qtyRaw) || 1;
          items.push({
            lineId: String(lineIdCounter++),
            section: currentSection,
            description: desc.trim(),
            qty, unit: normaliseUnit(unitRaw),
            rate: parseMoney(rateRaw),
            total, scopeCategory: effectiveScope,
            pageNum: page.pageNum, confidence: 0.90,
            source: 'simple_line_items_pdf',
          });
          continue;
        }
      }

      // Fallback: description + total only
      m = line.match(INLINE_TOTAL_ONLY_RE);
      if (m && ITEM_LINE_RE.test(line)) {
        const [, desc, totalRaw] = m;
        const total = parseMoney(totalRaw);
        if (total > 0 && !SUMMARY_LABEL_RE.test(desc)) {
          items.push({
            lineId: String(lineIdCounter++),
            section: currentSection,
            description: desc.trim(),
            qty: 1, unit: 'item', rate: total, total,
            scopeCategory: effectiveScope,
            pageNum: page.pageNum, confidence: 0.75,
            source: 'simple_line_items_pdf',
          });
        }
      }
    }
  }

  const baseItems = items.filter(i => i.scopeCategory === 'base');
  const optItems = items.filter(i => i.scopeCategory === 'optional');
  const rowBaseSum = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptSum = optItems.reduce((s, i) => s + i.total, 0);

  const canonicalTotal = grandTotal ?? rowBaseSum;
  const canonicalOptional = optionalTotal ?? rowOptSum;

  return {
    parserUsed: 'parseSimpleLineItemsPdf',
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
      `Items parsed: ${items.length}`,
      `Grand total: ${grandTotal !== null ? `$${grandTotal} (from summary)` : `$${rowBaseSum} (row sum)`}`,
    ],
    rawSummary: null,
  };
}
