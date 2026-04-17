// =============================================================================
// PARSER: summary_schedule_pdf
//
// For documents that have BOTH:
//   A) An authoritative summary totals page (Grand Total, Sub-Total, etc.)
//   B) Numbered schedule rows (pages with line items)
//
// RULE: Summary page totals are SOURCE OF TRUTH for grand total.
//       Schedule rows are parsed for itemization (count, block, unit analysis).
//       NEVER derive main quote total from row summation if summary exists.
// =============================================================================

import type { PageData } from '../documentClassifier.ts';
import type { RawParserOutput, ParsedLineItem } from '../parseResolutionLayerV3.ts';

// ---------------------------------------------------------------------------
// Summary extraction — generic label patterns
// ---------------------------------------------------------------------------

interface SummaryTotals {
  grandTotal: number | null;
  subTotal: number | null;
  optionalTotal: number | null;
  otherTotals: Array<{ label: string; value: number }>;
  rawMatches: Record<string, string>;
  foundOnPage: number | null;
}

const GRAND_TOTAL_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'grand_total_excl_gst', re: /Grand\s+Total\s*\(excl(?:uding)?\.?\s*(?:of\s+)?GST\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'grand_total', re: /Grand\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'contract_total', re: /Contract\s+(?:Sum|Total|Price)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'quote_total', re: /Quote\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'total_excl_gst', re: /Total\s*\(excl(?:uding)?\.?\s*(?:of\s+)?GST\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'net_total', re: /Net\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'lump_sum_total', re: /Lump\s+Sum\s+Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'total_price', re: /Total\s+Price\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
];

const SUBTOTAL_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'subtotal_incl', re: /Sub[\s-]?Total\s*\([^)]{0,80}\)\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'subtotal', re: /Sub[\s-]?Total\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
];

const OPTIONAL_TOTAL_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'add_to_scope', re: /Add\s+to\s+Scope\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'optional_scope', re: /Optional\s+Scope\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'optional_extras', re: /Optional\s+Extras\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'provisional_sum', re: /Provisional\s+Sum\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
  { key: 'pc_sum', re: /PC\s+Sum\s*:?\s*\$?\s*([\d,]+\.\d{2})/i },
];

const OTHER_TOTAL_RE = /([A-Z][A-Za-z0-9\s&+/]{2,40}(?:Total|Subtotal|Sum))\s*:?\s*\$?\s*([\d,]+\.\d{2})/gi;

function parseMoney(raw: string): number {
  const v = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(v) ? 0 : v;
}

function scanPageForTotals(pageText: string, pageNum: number, result: SummaryTotals): void {
  const flat = pageText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

  // Grand total
  if (result.grandTotal === null) {
    for (const { key, re } of GRAND_TOTAL_PATTERNS) {
      const m = flat.match(re);
      if (m) {
        const val = parseMoney(m[1]);
        if (val > 0) {
          result.grandTotal = val;
          result.rawMatches[key] = m[0].trim();
          result.foundOnPage = pageNum;
          break;
        }
      }
    }
  }

  // Subtotal
  if (result.subTotal === null) {
    for (const { key, re } of SUBTOTAL_PATTERNS) {
      const m = flat.match(re);
      if (m) {
        const val = parseMoney(m[1]);
        if (val > 0) {
          result.subTotal = val;
          result.rawMatches[key] = m[0].trim();
          break;
        }
      }
    }
  }

  // Optional total
  if (result.optionalTotal === null) {
    for (const { key, re } of OPTIONAL_TOTAL_PATTERNS) {
      const m = flat.match(re);
      if (m) {
        const val = parseMoney(m[1]);
        if (val > 0) {
          result.optionalTotal = val;
          result.rawMatches[key] = m[0].trim();
          break;
        }
      }
    }
  }

  // Other named totals
  let om: RegExpExecArray | null;
  OTHER_TOTAL_RE.lastIndex = 0;
  while ((om = OTHER_TOTAL_RE.exec(flat)) !== null) {
    const label = om[1].trim();
    const val = parseMoney(om[2]);
    if (val > 0 && !result.otherTotals.find(t => Math.abs(t.value - val) < 0.01)) {
      result.otherTotals.push({ label, value: val });
    }
  }
}

function extractSummaryTotals(pages: PageData[]): SummaryTotals {
  const result: SummaryTotals = {
    grandTotal: null,
    subTotal: null,
    optionalTotal: null,
    otherTotals: [],
    rawMatches: {},
    foundOnPage: null,
  };

  // Scan page 2 first (index 1), then page 1, then rest
  const scanOrder = pages.length >= 2
    ? [pages[1], pages[0], ...pages.slice(2)]
    : pages;

  for (const page of scanOrder) {
    scanPageForTotals(page.text, page.pageNum, result);
    if (result.grandTotal !== null) break;
  }

  // If still no grand total, scan all pages
  if (result.grandTotal === null) {
    for (const page of pages) {
      scanPageForTotals(page.text, page.pageNum, result);
      if (result.grandTotal !== null) break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Schedule row parser — structural, generic
// ---------------------------------------------------------------------------

const UNIT_ALT = 'No\\.|No|m2|lm|ea|each|item|nr|m';
const ROW_FULL_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d.]+)\\s+(${UNIT_ALT})\\s+\\$\\s*([\\d,]+\\.\\d{2})\\s+\\$\\s*([\\d,]+\\.\\d{2})$`,
  'i',
);
const ROW_NO_RATE_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d.]+)\\s+(${UNIT_ALT})\\s+\\$\\s*([\\d,]+\\.\\d{2})$`,
  'i',
);
const ROW_TOTAL_ONLY_RE = /^(\d{1,3})\s+(.+?)\s+\$\s*([\d,]+\.\d{2})$/i;

const BY_OTHERS_RE = /\bby\s+others\b/i;

// A line is ONLY optional if it is an explicit section heading — not a row keyword.
// This prevents "Beam", "Structural", "Flush Box" etc from flipping scope globally.
const OPTIONAL_SECTION_HEADER_RE = /^\s*OPTIONAL\s+SCOPE\s*$/i;
const OPTIONAL_SECTION_START_RE = /\b(OPTIONAL\s+SCOPE|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS)\b/i;

// A new non-optional section heading resets scope back to base
const BASE_SECTION_RESET_RE = /^\s*(MAIN\s+SCOPE|BASE\s+SCOPE|SCOPE\s+OF\s+WORKS?|SCHEDULE\s+OF\s+(RATES?|QUANTITIES))\s*$/i;

const EXCLUDE_RE = [
  /^\$\s*[-–]$/, /^-+$/, /^n\/?a$/i,
  /not\s+in\s+contract/i,
  /not\s+part\s+of\s+passive\s+fire/i,
];

const SECTION_RE = /\bBLOCK\s*B?(\d+)\b|\bLEVEL\s+(\d+)\b|\bZONE\s+([A-Z0-9]+)\b|\bSTAGE\s+(\d+)\b/i;

function normaliseUnit(raw: string): string {
  const u = raw.toLowerCase().trim().replace(/\.$/, '');
  const map: Record<string, string> = {
    no: 'ea', ea: 'ea', each: 'ea', nr: 'ea', item: 'ea',
    m: 'lm', lm: 'lm', m2: 'm2', sqm: 'm2',
  };
  return map[u] ?? u;
}

function parseRow(rawLine: string, section: string, scopeCategory: 'base' | 'optional', pageNum: number): ParsedLineItem | null {
  const line = rawLine.replace(/\s+/g, ' ').trim();
  if (!/^\d{1,3}\s/.test(line)) return null;
  if (BY_OTHERS_RE.test(line)) return null;
  if (EXCLUDE_RE.some(re => re.test(line))) return null;

  // Scope is determined by the current section context, not by row keywords
  const scope = scopeCategory;

  let m = line.match(ROW_FULL_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, rateRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return null;
    return {
      lineId, section, description: desc.trim(),
      qty: parseFloat(qtyRaw) || 1, unit: normaliseUnit(unitRaw),
      rate: parseMoney(rateRaw), total, scopeCategory: scope,
      pageNum, confidence: 1.0, source: 'summary_schedule_pdf',
    };
  }

  m = line.match(ROW_NO_RATE_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    const qty = parseFloat(qtyRaw) || 1;
    if (total === 0) return null;
    return {
      lineId, section, description: desc.trim(),
      qty, unit: normaliseUnit(unitRaw),
      rate: total / qty, total, scopeCategory: scope,
      pageNum, confidence: 0.95, source: 'summary_schedule_pdf',
    };
  }

  m = line.match(ROW_TOTAL_ONLY_RE);
  if (m) {
    const [, lineId, desc, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return null;
    return {
      lineId, section, description: desc.trim(),
      qty: 1, unit: 'item', rate: total, total, scopeCategory: scope,
      pageNum, confidence: 0.80, source: 'summary_schedule_pdf',
    };
  }

  return null;
}

function parseSchedulePages(pages: PageData[]): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];
  let currentSection = 'UNKNOWN';
  let scopeCategory: 'base' | 'optional' = 'base';

  for (const page of pages) {
    // Reset to base scope at each new page — optional scope does not bleed across pages
    scopeCategory = 'base';
    const lines = page.text.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      const normalized = line.replace(/\s+/g, ' ');

      // Detect new named section (BLOCK, LEVEL, ZONE, STAGE) — always resets to base
      const secMatch = normalized.match(SECTION_RE);
      if (secMatch) {
        const id = secMatch[1] ?? secMatch[2] ?? secMatch[3] ?? secMatch[4];
        currentSection = `SEC${id}`;
        scopeCategory = 'base';
      }

      // Only flip to optional on an explicit section heading line (not a row keyword)
      if (OPTIONAL_SECTION_START_RE.test(normalized) && !/^\d{1,3}\s/.test(normalized)) {
        scopeCategory = 'optional';
      }

      // Explicit base scope reset heading
      if (BASE_SECTION_RESET_RE.test(normalized)) {
        scopeCategory = 'base';
      }

      if (!/^\d{1,3}[\s]/.test(line.trimStart())) continue;

      const item = parseRow(line, currentSection, scopeCategory, page.pageNum);
      if (item) items.push(item);
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseSummarySchedulePdf(pages: PageData[]): RawParserOutput {
  const summary = extractSummaryTotals(pages);
  const scheduleItems = parseSchedulePages(pages);

  const baseItems = scheduleItems.filter(i => i.scopeCategory === 'base');
  const optionalItems = scheduleItems.filter(i => i.scopeCategory === 'optional');
  const rowBaseSum = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptionalSum = optionalItems.reduce((s, i) => s + i.total, 0);

  // SOURCE OF TRUTH: summary takes priority over row summation
  const canonicalGrandTotal = summary.grandTotal ?? rowBaseSum;
  const canonicalOptionalTotal = summary.optionalTotal ?? rowOptionalSum;

  const parserReasons: string[] = [
    `Summary page found: page ${summary.foundOnPage ?? 'unknown'}`,
    `Grand total source: ${summary.grandTotal !== null ? 'page_summary' : 'row_sum'}`,
    `Schedule rows parsed: ${scheduleItems.length}`,
    `Base items: ${baseItems.length}, Optional items: ${optionalItems.length}`,
  ];

  return {
    parserUsed: 'parseSummarySchedulePdf',
    allItems: scheduleItems,
    totals: {
      grandTotal: canonicalGrandTotal,
      optionalTotal: canonicalOptionalTotal,
      subTotal: summary.subTotal,
      rowSum: rowBaseSum,
      source: summary.grandTotal !== null ? 'summary_page' : 'row_sum',
    },
    summaryDetected: summary.grandTotal !== null,
    optionalScopeDetected: summary.optionalTotal !== null || optionalItems.length > 0,
    parserReasons,
    rawSummary: summary,
  };
}
