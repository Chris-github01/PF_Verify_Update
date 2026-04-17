// =============================================================================
// FAMILY PARSER: hybrid_quote
//
// Entry point for documents classified as hybrid_quote:
//   - Itemized rows (base scope) + summary totals page
//   - Separate prelims / QA / mobilisation / allowances buckets
//   - Optional extras / add-to-scope sections
//
// RULES:
//   - Parse all numbered rows as base scope items
//   - Detect and tag prelims rows separately (scopeCategory stays 'base',
//     section label identifies them as prelims)
//   - Detect optional scope sections and tag those rows as 'optional'
//   - Use summary page grand total as authoritative if present
//   - Fall back to row summation if no summary detected
// =============================================================================

import type { PageData } from '../documentClassifier.ts';
import type { RawParserOutput, ParsedLineItem } from '../parseResolutionLayerV3.ts';
import { parseSummarySchedulePdf } from './parseSummarySchedulePdf.ts';

const GRAND_TOTAL_PATTERNS: RegExp[] = [
  /Grand\s+Total\s*\(excl(?:uding)?\.?\s*(?:of\s+)?GST\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Grand\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Contract\s+(?:Sum|Total|Price)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Quote\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Total\s*\(excl(?:uding)?\.?\s*(?:of\s+)?GST\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Net\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
];

const OPTIONAL_TOTAL_PATTERNS: RegExp[] = [
  /Add\s+to\s+Scope\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Optional\s+(?:Scope|Extras?)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /Provisional\s+Sum\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
  /PC\s+Sum\s*:?\s*\$?\s*([\d,]+\.\d{2})/i,
];

// Prelims section header patterns — rows following these headers are tagged prelims
const PRELIMS_SECTION_RE = /^\s*(PRELIMS?|PRELIMINARIES|ALLOWANCES?|MOBILISATION|SITE\s+ESTABLISHMENT|OH\s*&\s*P|OVERHEADS?\s+(&|AND)\s+PROFIT|QUALITY\s+ASSURANCE|WARRANTY\s+(PERIOD|ALLOWANCE))\s*:?\s*$/i;

// Optional scope section markers
const OPTIONAL_SECTION_RE = /\b(OPTIONAL\s+SCOPE|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS|PROVISIONAL\s+ITEMS?)\b/i;

// Base scope reset markers
const BASE_SCOPE_RESET_RE = /^\s*(MAIN\s+SCOPE|BASE\s+SCOPE|SCOPE\s+OF\s+WORKS?|SCHEDULE\s+OF\s+(RATES?|QUANTITIES))\s*$/i;

const SUMMARY_LABEL_RE = /\b(Grand\s+Total|Sub[\s-]?Total|Contract\s+(?:Sum|Total)|Quote\s+Total|Net\s+Total)\b/i;
const BY_OTHERS_RE = /\bby\s+others\b/i;
const TRAILING_MONEY_RE = /\$?\s*([\d,]+\.\d{2})\s*$/;
const NUMBERED_ROW_RE = /^\d{1,3}\s/;
const SKIP_LINE_RE = /^(Page\s+\d|Description|Item\s+No|Qty|Quantity|Unit|Rate|Total|Amount|Ref|Notes?|Prepared\s+by|Date:|Project:)/i;

function parseMoney(raw: string): number {
  const v = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(v) ? 0 : v;
}

function normaliseUnit(raw: string): string {
  const u = (raw || '').toLowerCase().trim().replace(/\.$/, '');
  const map: Record<string, string> = {
    no: 'ea', ea: 'ea', each: 'ea', nr: 'ea', item: 'ea', items: 'ea',
    set: 'ea', lot: 'ea', ls: 'ea', sum: 'ea', allow: 'ea',
    m: 'lm', lm: 'lm', 'lin.m': 'lm',
    m2: 'm2', sqm: 'm2',
    hr: 'hr', hrs: 'hr', day: 'day', days: 'day',
  };
  return map[u] ?? (u || 'item');
}

function extractDocTotal(fullText: string, patterns: RegExp[]): number | null {
  const flat = fullText.replace(/[\r\n]+/g, ' ');
  for (const re of patterns) {
    const m = flat.match(re);
    if (m) {
      const val = parseMoney(m[1]);
      if (val > 0) return val;
    }
  }
  return null;
}

const UNIT_TOKENS = 'no\\.|no|nr|m2|sqm|lm|lin\\.?m|each|ea|item|items|set|lot|hrs|hr|days|day|allow|sum|ls|m';
const ROW_FULL_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d]+(?:\\.\\d+)?)\\s+(${UNIT_TOKENS})\\s+\\$?\\s*([\\d,]+\\.\\d{2})\\s+\\$?\\s*([\\d,]+\\.\\d{2})$`,
  'i',
);
const ROW_NO_RATE_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d]+(?:\\.\\d+)?)\\s+(${UNIT_TOKENS})\\s+\\$?\\s*([\\d,]+\\.\\d{2})$`,
  'i',
);
const ROW_TOTAL_ONLY_RE = /^(\d{1,3})\s+(.{3,}?)\s+\$?\s*([\d,]+\.\d{2})$/i;

function tryParseRow(
  line: string,
  section: string,
  scopeCategory: 'base' | 'optional',
  pageNum: number,
  source: string,
): ParsedLineItem | null {
  const flat = line.replace(/\s+/g, ' ').trim();
  if (!NUMBERED_ROW_RE.test(flat)) return null;
  if (BY_OTHERS_RE.test(flat)) return null;
  if (SUMMARY_LABEL_RE.test(flat)) return null;

  let m = flat.match(ROW_FULL_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, rateRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return null;
    return {
      lineId, section, description: desc.trim(),
      qty: parseFloat(qtyRaw) || 1,
      unit: normaliseUnit(unitRaw),
      rate: parseMoney(rateRaw),
      total, scopeCategory, pageNum,
      confidence: 1.0, source,
    };
  }

  m = flat.match(ROW_NO_RATE_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    const qty = parseFloat(qtyRaw) || 1;
    if (total === 0) return null;
    return {
      lineId, section, description: desc.trim(),
      qty, unit: normaliseUnit(unitRaw),
      rate: qty > 0 ? total / qty : total,
      total, scopeCategory, pageNum,
      confidence: 0.92, source,
    };
  }

  m = flat.match(ROW_TOTAL_ONLY_RE);
  if (m) {
    const [, lineId, desc, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return null;
    if (desc.trim().length < 3) return null;
    return {
      lineId, section: section, description: desc.trim(),
      qty: 1, unit: 'item', rate: total, total,
      scopeCategory, pageNum,
      confidence: 0.75, source,
    };
  }

  return null;
}

export function parseHybridQuote(pages: PageData[]): RawParserOutput {
  console.log(`[parseHybridQuote] pages=${pages.length}`);

  const fullText = pages.map(p => p.text).join('\n\n');
  const grandTotal = extractDocTotal(fullText, GRAND_TOTAL_PATTERNS);
  const optionalTotal = extractDocTotal(fullText, OPTIONAL_TOTAL_PATTERNS);

  console.log(`[parseHybridQuote] grandTotal=${grandTotal} optionalTotal=${optionalTotal}`);

  const items: ParsedLineItem[] = [];
  let currentSection = 'MAIN';
  let scopeCategory: 'base' | 'optional' = 'base';
  let rowsSeen = 0;
  let rowsParsed = 0;

  for (const page of pages) {
    const rawLines = page.text.split('\n');
    const lines: string[] = [];

    // Join continuation lines (same as itemized parser)
    for (let i = 0; i < rawLines.length; i++) {
      const current = rawLines[i].trim();
      if (!current) continue;
      if (NUMBERED_ROW_RE.test(current)) {
        if (!TRAILING_MONEY_RE.test(current)) {
          let joined = current;
          let j = i + 1;
          while (j < rawLines.length) {
            const next = rawLines[j].trim();
            if (!next) { j++; continue; }
            if (NUMBERED_ROW_RE.test(next)) break;
            joined = joined + ' ' + next;
            j++;
            if (TRAILING_MONEY_RE.test(joined)) break;
          }
          lines.push(joined);
        } else {
          lines.push(current);
        }
      } else {
        lines.push(current);
      }
    }

    for (const line of lines) {
      const normalized = line.replace(/\s+/g, ' ').trim();
      if (!normalized) continue;
      if (SKIP_LINE_RE.test(normalized)) continue;
      if (SUMMARY_LABEL_RE.test(normalized) && !NUMBERED_ROW_RE.test(normalized)) continue;

      // Section detection
      if (PRELIMS_SECTION_RE.test(normalized)) {
        currentSection = normalized.replace(/:?\s*$/, '').trim().toUpperCase();
        scopeCategory = 'base';
        continue;
      }

      if (OPTIONAL_SECTION_RE.test(normalized) && !NUMBERED_ROW_RE.test(normalized)) {
        scopeCategory = 'optional';
        currentSection = normalized.trim().toUpperCase();
        continue;
      }

      if (BASE_SCOPE_RESET_RE.test(normalized)) {
        scopeCategory = 'base';
        currentSection = 'MAIN';
        continue;
      }

      if (!NUMBERED_ROW_RE.test(normalized)) continue;

      rowsSeen++;
      const item = tryParseRow(normalized, currentSection, scopeCategory, page.pageNum, 'parseHybridQuote');
      if (item) {
        items.push(item);
        rowsParsed++;
      }
    }
  }

  // If no rows parsed at all, fall back to the summary schedule parser
  // which has more tolerant regex and forensic tracing
  if (rowsParsed === 0 && pages.length > 0) {
    console.log(`[parseHybridQuote] No rows parsed, delegating to parseSummarySchedulePdf`);
    const fallback = parseSummarySchedulePdf(pages);
    return { ...fallback, parserUsed: 'parseHybridQuote(summary_fallback)' };
  }

  const baseItems = items.filter(i => i.scopeCategory === 'base');
  const optItems = items.filter(i => i.scopeCategory === 'optional');
  const rowBaseSum = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptSum = optItems.reduce((s, i) => s + i.total, 0);

  const canonicalTotal = grandTotal ?? rowBaseSum;
  const canonicalOptional = optionalTotal ?? rowOptSum;

  return {
    parserUsed: 'parseHybridQuote',
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
      `Hybrid parser: rows_seen=${rowsSeen} rows_parsed=${rowsParsed}`,
      `Base items=${baseItems.length} optional_items=${optItems.length}`,
      `Grand total: ${grandTotal !== null ? `$${grandTotal} (from summary)` : `$${rowBaseSum} (row sum)`}`,
    ],
    rawSummary: null,
  };
}
