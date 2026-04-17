// =============================================================================
// PARSER: summary_schedule_pdf / multi_page_boq_summary_pdf
//
// For documents that have BOTH:
//   A) An authoritative summary totals page (Grand Total, Sub-Total, etc.)
//   B) Numbered schedule rows (pages with line items)
//
// RULE: Summary page totals are SOURCE OF TRUTH for grand total.
//       Schedule rows are parsed for itemization.
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
  const cleaned = raw.replace(/[$,\s]/g, '');
  const v = parseFloat(cleaned);
  return isNaN(v) ? 0 : v;
}

function scanPageForTotals(pageText: string, pageNum: number, result: SummaryTotals): void {
  const flat = pageText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

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

  // Scan page 2 first (index 1) — most common location for cover/summary
  const scanOrder = pages.length >= 2
    ? [pages[1], pages[0], ...pages.slice(2)]
    : pages;

  for (const page of scanOrder) {
    scanPageForTotals(page.text, page.pageNum, result);
    if (result.grandTotal !== null) break;
  }

  if (result.grandTotal === null) {
    for (const page of pages) {
      scanPageForTotals(page.text, page.pageNum, result);
      if (result.grandTotal !== null) break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Schedule row parser — tolerant of OCR/PDF spacing variation
// ---------------------------------------------------------------------------

// Recognised unit tokens — order matters (longer first to avoid partial match)
const UNIT_TOKENS = [
  'no\\.', 'no', 'nr', 'm2', 'sqm', 'lm', 'lin\\.?m', 'each', 'ea', 'item', 'items',
  'set', 'lot', 'hrs', 'hr', 'days', 'day', 'allow', 'sum', 'ls', 'm',
];
const UNIT_RE_SRC = UNIT_TOKENS.join('|');

// Monetary value — $ optional, commas optional, must have cents
const MONEY_RE_SRC = '\\$?\\s*([\\d,]+\\.\\d{2})';

// Full row: ID  description  qty  unit  rate  total
// All separators are flexible whitespace (handles tabs, multiple spaces)
const ROW_FULL_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d]+(?:\\.\\d+)?)\\s+(${UNIT_RE_SRC})\\s+${MONEY_RE_SRC}\\s+${MONEY_RE_SRC}$`,
  'i',
);

// Without rate: ID  description  qty  unit  total
const ROW_NO_RATE_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d]+(?:\\.\\d+)?)\\s+(${UNIT_RE_SRC})\\s+${MONEY_RE_SRC}$`,
  'i',
);

// Minimal: ID  description  total   (lump-sum / allow items)
const ROW_TOTAL_ONLY_RE = /^(\d{1,3})\s+(.+?)\s+\$?\s*([\d,]+\.\d{2})$/i;

// Detect a money value anywhere at the end of a line
const TRAILING_MONEY_RE = /\$?\s*([\d,]+\.\d{2})\s*$/;

const BY_OTHERS_RE = /\bby\s+others\b/i;
const NULL_VALUE_RE = /^\$?\s*[-–0]$|^-{2,}$|^n\/?a$/i;

const EXCLUDE_DESC_RE = [
  /not\s+in\s+contract/i,
  /not\s+part\s+of\s+(passive\s+fire|this\s+contract|scope)/i,
];

// Section heading patterns — reset to named section
const SECTION_RE = /\bBLOCK\s*B?(\d+)\b|\bLEVEL\s+(\d+)\b|\bZONE\s+([A-Z0-9]+)\b|\bSTAGE\s+(\d+)\b/i;

// Optional scope heading — ONLY flip if the line is NOT a numbered row
const OPTIONAL_SECTION_START_RE = /\b(OPTIONAL\s+SCOPE|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS)\b/i;

// Base scope reset heading
const BASE_SECTION_RESET_RE = /^\s*(MAIN\s+SCOPE|BASE\s+SCOPE|SCOPE\s+OF\s+WORKS?|SCHEDULE\s+OF\s+(RATES?|QUANTITIES))\s*$/i;

// Lines that are definitely not rows (headers, footers, labels)
const SKIP_LINE_RE = /^(Page\s+\d|Description|Item\s+No|Qty|Quantity|Unit|Rate|Total|Amount|Ref|Notes?|Prepared\s+by|Date:|Project:)/i;

function normaliseUnit(raw: string): string {
  const u = raw.toLowerCase().trim().replace(/\.$/, '');
  const map: Record<string, string> = {
    no: 'ea', ea: 'ea', each: 'ea', nr: 'ea', item: 'ea', items: 'ea',
    set: 'ea', lot: 'ea', ls: 'ea', sum: 'ea', allow: 'ea',
    m: 'lm', lm: 'lm', 'lin.m': 'lm', 'linm': 'lm',
    m2: 'm2', sqm: 'm2',
    hr: 'hr', hrs: 'hr', day: 'day', days: 'day',
  };
  return map[u] ?? u;
}

function tryParseRow(
  line: string,
  section: string,
  scopeCategory: 'base' | 'optional',
  pageNum: number,
): ParsedLineItem | null {
  // Collapse all whitespace to single space
  const flat = line.replace(/\s+/g, ' ').trim();

  if (!/^\d{1,3}\s/.test(flat)) return null;
  if (BY_OTHERS_RE.test(flat)) return null;
  if (EXCLUDE_DESC_RE.some(re => re.test(flat))) return null;

  // Check null value indicator at end
  const lastToken = flat.split(' ').pop() ?? '';
  if (NULL_VALUE_RE.test(lastToken)) return null;

  // Attempt 1: full row with rate + total
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
      total,
      scopeCategory,
      pageNum,
      confidence: 1.0,
      source: 'parseSummarySchedulePdf',
    };
  }

  // Attempt 2: row with qty + unit + total only (no rate column)
  m = flat.match(ROW_NO_RATE_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    const qty = parseFloat(qtyRaw) || 1;
    if (total === 0) return null;
    return {
      lineId, section, description: desc.trim(),
      qty,
      unit: normaliseUnit(unitRaw),
      rate: qty > 0 ? total / qty : total,
      total,
      scopeCategory,
      pageNum,
      confidence: 0.92,
      source: 'parseSummarySchedulePdf',
    };
  }

  // Attempt 3: minimal row — ID + description + trailing money total
  // Only accept if total > 0 and description is non-trivial
  m = flat.match(ROW_TOTAL_ONLY_RE);
  if (m) {
    const [, lineId, desc, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return null;
    if (desc.trim().length < 3) return null;
    return {
      lineId, section, description: desc.trim(),
      qty: 1, unit: 'item', rate: total, total,
      scopeCategory,
      pageNum,
      confidence: 0.75,
      source: 'parseSummarySchedulePdf',
    };
  }

  return null;
}

interface ScheduleParseDebug {
  rowsSeen: number;
  rowsValid: number;
  rowsFailed: number;
  sampleFailedLines: string[];
}

function parseSchedulePages(
  pages: PageData[],
  debug: ScheduleParseDebug,
): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];
  let currentSection = 'UNKNOWN';
  let scopeCategory: 'base' | 'optional' = 'base';

  for (const page of pages) {
    // Scope resets to base at each new page — optional scope does not bleed across pages
    scopeCategory = 'base';

    const rawLines = page.text.split('\n');
    const lines: string[] = [];

    // First pass: join continuation lines.
    // A continuation line is a non-empty line that does NOT start with a digit
    // and the previous line started with a digit but had no monetary total yet.
    for (let i = 0; i < rawLines.length; i++) {
      const current = rawLines[i].trim();
      if (!current) continue;

      // If this line starts with a number, it is a fresh candidate row
      if (/^\d{1,3}\s/.test(current)) {
        // Check if it already ends with a money value — if not, peek ahead for continuation
        if (!TRAILING_MONEY_RE.test(current)) {
          let joined = current;
          let j = i + 1;
          while (j < rawLines.length) {
            const next = rawLines[j].trim();
            if (!next) { j++; continue; }
            // Stop if the next line itself starts a new numbered row
            if (/^\d{1,3}\s/.test(next)) break;
            joined = joined + ' ' + next;
            j++;
            // Stop once we see a trailing money value
            if (TRAILING_MONEY_RE.test(joined)) break;
          }
          lines.push(joined);
        } else {
          lines.push(current);
        }
      } else {
        // Non-numbered lines go through for section/scope detection only
        lines.push(current);
      }
    }

    // Second pass: parse
    for (const line of lines) {
      const normalized = line.replace(/\s+/g, ' ').trim();
      if (!normalized) continue;
      if (SKIP_LINE_RE.test(normalized)) continue;

      // Section heading detection — always resets to base
      const secMatch = normalized.match(SECTION_RE);
      if (secMatch) {
        const id = secMatch[1] ?? secMatch[2] ?? secMatch[3] ?? secMatch[4];
        currentSection = `SEC${id}`;
        scopeCategory = 'base';
      }

      // Optional scope heading (non-numbered lines only)
      if (OPTIONAL_SECTION_START_RE.test(normalized) && !/^\d{1,3}\s/.test(normalized)) {
        scopeCategory = 'optional';
      }

      // Base scope reset heading
      if (BASE_SECTION_RESET_RE.test(normalized)) {
        scopeCategory = 'base';
      }

      // Only attempt row parse for lines starting with a digit
      if (!/^\d{1,3}\s/.test(normalized)) continue;

      debug.rowsSeen++;

      const item = tryParseRow(normalized, currentSection, scopeCategory, page.pageNum);
      if (item) {
        debug.rowsValid++;
        items.push(item);
      } else {
        debug.rowsFailed++;
        if (debug.sampleFailedLines.length < 10) {
          debug.sampleFailedLines.push(normalized.slice(0, 120));
        }
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseSummarySchedulePdf(pages: PageData[]): RawParserOutput {
  const summary = extractSummaryTotals(pages);

  const debug: ScheduleParseDebug = {
    rowsSeen: 0,
    rowsValid: 0,
    rowsFailed: 0,
    sampleFailedLines: [],
  };

  const scheduleItems = parseSchedulePages(pages, debug);

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
    `rows_seen=${debug.rowsSeen}`,
    `rows_valid=${debug.rowsValid}`,
    `rows_failed=${debug.rowsFailed}`,
    `base_items=${baseItems.length}`,
    `optional_items=${optionalItems.length}`,
  ];

  if (debug.sampleFailedLines.length > 0) {
    parserReasons.push(`sample_failed_lines: ${JSON.stringify(debug.sampleFailedLines)}`);
  }

  // Explicit failure signal when extraction produced nothing
  if (debug.rowsValid === 0 && summary.grandTotal !== null) {
    parserReasons.push('parser_failed_row_detection: summary found but 0 rows parsed');
  }

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
    rawSummary: {
      ...summary,
      parseDebug: debug,
    },
  };
}
