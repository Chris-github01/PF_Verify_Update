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

// Money pattern: allows optional $, optional spaces/commas between digits, mandatory cents
// Handles both "59,278.75" and "59 278.75" (spaced thousands from OCR)
const MONEY_CAPTURE = '\\$?\\s*([\\d][\\d\\s,]*\\.\\d{2})';

const GRAND_TOTAL_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'grand_total_excl_gst', re: new RegExp(`Grand\\s+Total\\s*\\(excl(?:uding)?\\.?\\s*(?:of\\s+)?GST\\)\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
  { key: 'grand_total', re: new RegExp(`Grand\\s+Total\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
  { key: 'contract_total', re: new RegExp(`Contract\\s+(?:Sum|Total|Price)\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
  { key: 'quote_total', re: new RegExp(`Quote\\s+Total\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
  { key: 'total_excl_gst', re: new RegExp(`Total\\s*\\(excl(?:uding)?\\.?\\s*(?:of\\s+)?GST\\)\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
  { key: 'total_ex_gst', re: new RegExp(`Total\\s+Ex\\.?\\s*GST\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
  { key: 'total_excluding_gst', re: new RegExp(`Total\\s+Excluding\\s+GST\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
  { key: 'net_total', re: new RegExp(`Net\\s+Total\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
  { key: 'lump_sum_total', re: new RegExp(`Lump\\s+Sum\\s+Total\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
  { key: 'total_price', re: new RegExp(`Total\\s+Price\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
  { key: 'tender_total', re: new RegExp(`Tender\\s+(?:Sum|Total)\\s*:?\\s*${MONEY_CAPTURE}`, 'i') },
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

// Proximity scan: try matching a label regex against each line, then look at the
// same line and the next 1–2 lines for a money value.  This handles PDFs where
// the label and its dollar amount fall on separate lines.
function proximityMatch(
  lines: string[],
  labelRe: RegExp,
  moneyRe: RegExp,
): { matched: string; value: number } | null {
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i])) continue;
    // Try the current line first (label + amount on same line)
    const sameLine = lines[i].match(moneyRe);
    if (sameLine) {
      const val = parseMoney(sameLine[1]);
      if (val > 0) return { matched: lines[i].trim(), value: val };
    }
    // Try next two lines (label on one line, amount on subsequent line)
    for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
      const nextLine = lines[j].match(moneyRe);
      if (nextLine) {
        const val = parseMoney(nextLine[1]);
        if (val > 0) return { matched: `${lines[i].trim()} | ${lines[j].trim()}`, value: val };
      }
    }
  }
  return null;
}

// Standalone money pattern for proximity next-line extraction
const STANDALONE_MONEY_RE = /\$?\s*([\d][\d\s,]*\.\d{2})\s*$/;

function scanPageForTotals(pageText: string, pageNum: number, result: SummaryTotals): void {
  // Single-line flat scan — handles label + amount on same line
  const flat = pageText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
  // Per-line array — for proximity (multi-line) scanning
  const lines = pageText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (result.grandTotal === null) {
    // Pass 1: flat single-line match
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
    // Pass 2: proximity multi-line scan (label on one line, amount on next)
    if (result.grandTotal === null) {
      for (const { key, re } of GRAND_TOTAL_PATTERNS) {
        // Build a label-only regex by stripping the trailing money capture group
        const labelSource = re.source.replace(/\\s\*:?\?\\s\*\$\?.*$/, '').replace(/\\s\*\$\?\\s\*\$\?.*$/, '');
        const labelRe = new RegExp(labelSource, 'i');
        const hit = proximityMatch(lines, labelRe, STANDALONE_MONEY_RE);
        if (hit) {
          result.grandTotal = hit.value;
          result.rawMatches[key] = hit.matched;
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
    if (result.subTotal === null) {
      for (const { key, re } of SUBTOTAL_PATTERNS) {
        const labelSource = re.source.replace(/\\s\*:?\?\\s\*\$\?.*$/, '').replace(/\\s\*\$\?\\s\*\$\?.*$/, '');
        const labelRe = new RegExp(labelSource, 'i');
        const hit = proximityMatch(lines, labelRe, STANDALONE_MONEY_RE);
        if (hit) {
          result.subTotal = hit.value;
          result.rawMatches[key] = hit.matched;
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
    if (result.optionalTotal === null) {
      for (const { key, re } of OPTIONAL_TOTAL_PATTERNS) {
        const labelSource = re.source.replace(/\\s\*:?\?\\s\*\$\?.*$/, '').replace(/\\s\*\$\?\\s\*\$\?.*$/, '');
        const labelRe = new RegExp(labelSource, 'i');
        const hit = proximityMatch(lines, labelRe, STANDALONE_MONEY_RE);
        if (hit) {
          result.optionalTotal = hit.value;
          result.rawMatches[key] = hit.matched;
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
const ROW_FULL_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d]+(?:\\.\\d+)?)\\s+(${UNIT_RE_SRC})\\s+${MONEY_RE_SRC}\\s+${MONEY_RE_SRC}$`,
  'i',
);

// Without rate: ID  description  qty  unit  total
const ROW_NO_RATE_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d]+(?:\\.\\d+)?)\\s+(${UNIT_RE_SRC})\\s+${MONEY_RE_SRC}$`,
  'i',
);

// Minimal: ID  description  total
const ROW_TOTAL_ONLY_RE = /^(\d{1,3})\s+(.+?)\s+\$?\s*([\d,]+\.\d{2})$/i;

// Detect a money value at end of line
const TRAILING_MONEY_RE = /\$?\s*([\d,]+\.\d{2})\s*$/;

const BY_OTHERS_RE = /\bby\s+others\b/i;
const NULL_VALUE_RE = /^\$?\s*[-–0]$|^-{2,}$|^n\/?a$/i;

const EXCLUDE_DESC_RE = [
  /not\s+in\s+contract/i,
  /not\s+part\s+of\s+(passive\s+fire|this\s+contract|scope)/i,
];

const SECTION_RE = /\bBLOCK\s*B?(\d+)\b|\bLEVEL\s+(\d+)\b|\bZONE\s+([A-Z0-9]+)\b|\bSTAGE\s+(\d+)\b/i;
const OPTIONAL_SECTION_START_RE = /\b(OPTIONAL\s+SCOPE|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS)\b/i;
const BASE_SECTION_RESET_RE = /^\s*(MAIN\s+SCOPE|BASE\s+SCOPE|SCOPE\s+OF\s+WORKS?|SCHEDULE\s+OF\s+(RATES?|QUANTITIES))\s*$/i;
const SKIP_LINE_RE = /^(Page\s+\d|Description|Item\s+No|Qty|Quantity|Unit|Rate|Total|Amount|Ref|Notes?|Prepared\s+by|Date:|Project:)/i;

// Description-level trade prefixes that force Main scope regardless of section context
const FORCE_BASE_DESC_RE = /^(Electrical|Fire\s+Protection|Hydraulics|Mechanical)\b/i;
// Description-level prefixes that force Optional scope
const FORCE_OPTIONAL_DESC_RE = /^(Architectural\s*\/?\s*Structural\s+Details?|Optional\s+Extras?)\b/i;

function normaliseUnit(raw: string): string {
  const u = raw.toLowerCase().trim().replace(/\.$/, '');
  const map: Record<string, string> = {
    no: 'ea', ea: 'ea', each: 'ea', nr: 'ea', item: 'ea', items: 'ea',
    set: 'ea', lot: 'ea', ls: 'ea', sum: 'ea', allow: 'ea',
    m: 'lm', lm: 'lm', 'lin.m': 'lm', linm: 'lm',
    m2: 'm2', sqm: 'm2',
    hr: 'hr', hrs: 'hr', day: 'day', days: 'day',
  };
  return map[u] ?? u;
}

// ---------------------------------------------------------------------------
// Forensic trace structures
// ---------------------------------------------------------------------------

interface LineAttempt {
  page: number;
  raw_line: string;
  normalized_line: string;
  starts_with_number: boolean;
  regex_full_match: boolean;
  regex_no_rate_match: boolean;
  regex_minimal_match: boolean;
  excluded_reason: string | null;
  parsed_result: 'ok' | 'failed';
}

interface PageTrace {
  pageNum: number;
  pageChars: number;
  first300Chars: string;
  totalLinesRaw: number;
  totalLinesAfterTrim: number;
  numberedLinesDetected: number;
  continuationLinesJoined: number;
}

interface ScheduleParseDebug {
  rowsSeen: number;
  rowsValid: number;
  rowsFailed: number;
  sampleFailedLines: string[];
  lineAttempts: LineAttempt[];
  pageTraces: PageTrace[];
  failureCode: string | null;
}

function tryParseRow(
  line: string,
  section: string,
  scopeCategory: 'base' | 'optional',
  pageNum: number,
  trace: LineAttempt,
): ParsedLineItem | null {
  const flat = line.replace(/\s+/g, ' ').trim();
  trace.normalized_line = flat;
  trace.starts_with_number = /^\d{1,3}\s/.test(flat);

  if (!trace.starts_with_number) {
    trace.excluded_reason = 'no_leading_digit';
    return null;
  }
  if (BY_OTHERS_RE.test(flat)) {
    trace.excluded_reason = 'by_others';
    return null;
  }
  if (EXCLUDE_DESC_RE.some(re => re.test(flat))) {
    trace.excluded_reason = 'exclude_pattern';
    return null;
  }

  const lastToken = flat.split(' ').pop() ?? '';
  if (NULL_VALUE_RE.test(lastToken)) {
    trace.excluded_reason = 'null_value_token';
    return null;
  }

  // Attempt 1: full row with rate + total
  let m = flat.match(ROW_FULL_RE);
  trace.regex_full_match = !!m;
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, rateRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) { trace.excluded_reason = 'zero_total'; return null; }
    trace.parsed_result = 'ok';
    return {
      lineId, section, description: desc.trim(),
      qty: parseFloat(qtyRaw) || 1,
      unit: normaliseUnit(unitRaw),
      rate: parseMoney(rateRaw),
      total, scopeCategory, pageNum,
      confidence: 1.0, source: 'parseSummarySchedulePdf',
    };
  }

  // Attempt 2: qty + unit + total (no rate column)
  m = flat.match(ROW_NO_RATE_RE);
  trace.regex_no_rate_match = !!m;
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    const qty = parseFloat(qtyRaw) || 1;
    if (total === 0) { trace.excluded_reason = 'zero_total'; return null; }
    trace.parsed_result = 'ok';
    return {
      lineId, section, description: desc.trim(),
      qty, unit: normaliseUnit(unitRaw),
      rate: qty > 0 ? total / qty : total,
      total, scopeCategory, pageNum,
      confidence: 0.92, source: 'parseSummarySchedulePdf',
    };
  }

  // Attempt 3: minimal — ID + description + trailing money
  m = flat.match(ROW_TOTAL_ONLY_RE);
  trace.regex_minimal_match = !!m;
  if (m) {
    const [, lineId, desc, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) { trace.excluded_reason = 'zero_total'; return null; }
    if (desc.trim().length < 3) { trace.excluded_reason = 'desc_too_short'; return null; }
    trace.parsed_result = 'ok';
    return {
      lineId, section, description: desc.trim(),
      qty: 1, unit: 'item', rate: total, total,
      scopeCategory, pageNum,
      confidence: 0.75, source: 'parseSummarySchedulePdf',
    };
  }

  trace.excluded_reason = 'no_regex_match';
  return null;
}

function parseSchedulePages(
  pages: PageData[],
  debug: ScheduleParseDebug,
): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];
  let currentSection = 'UNKNOWN';
  let scopeCategory: 'base' | 'optional' = 'base';

  // --- TRACE: log input structure ---
  console.log(`[FORENSIC] pages_received=${pages.length}`);
  pages.forEach((p, idx) => {
    console.log(`[FORENSIC] page[${idx}] pageNum=${p.pageNum} chars=${p.text.length} first300=${JSON.stringify(p.text.slice(0, 300))}`);
  });

  for (const page of pages) {
    // Reset to base at every new page — optional scope never carries across page boundaries
    scopeCategory = 'base';

    const rawLines = page.text.split('\n');
    const trimmedLines = rawLines.map(l => l.trim()).filter(Boolean);
    const numberedBeforeJoin = trimmedLines.filter(l => /^\d{1,3}\s/.test(l)).length;
    let continuationJoined = 0;

    const lines: string[] = [];

    // First pass: join continuation lines
    for (let i = 0; i < rawLines.length; i++) {
      const current = rawLines[i].trim();
      if (!current) continue;

      if (/^\d{1,3}\s/.test(current)) {
        if (!TRAILING_MONEY_RE.test(current)) {
          let joined = current;
          let j = i + 1;
          while (j < rawLines.length) {
            const next = rawLines[j].trim();
            if (!next) { j++; continue; }
            if (/^\d{1,3}\s/.test(next)) break;
            joined = joined + ' ' + next;
            continuationJoined++;
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

    const pageTrace: PageTrace = {
      pageNum: page.pageNum,
      pageChars: page.text.length,
      first300Chars: page.text.slice(0, 300),
      totalLinesRaw: rawLines.length,
      totalLinesAfterTrim: trimmedLines.length,
      numberedLinesDetected: numberedBeforeJoin,
      continuationLinesJoined: continuationJoined,
    };
    debug.pageTraces.push(pageTrace);

    console.log(`[FORENSIC] page=${page.pageNum} raw_lines=${rawLines.length} trimmed=${trimmedLines.length} numbered=${numberedBeforeJoin} continuation_joins=${continuationJoined}`);

    // Second pass: parse
    for (const line of lines) {
      const normalized = line.replace(/\s+/g, ' ').trim();
      if (!normalized) continue;
      if (SKIP_LINE_RE.test(normalized)) continue;

      const secMatch = normalized.match(SECTION_RE);
      if (secMatch) {
        const id = secMatch[1] ?? secMatch[2] ?? secMatch[3] ?? secMatch[4];
        currentSection = `SEC${id}`;
        // BLOCK/LEVEL/ZONE/STAGE headers always reset scope back to base
        scopeCategory = 'base';
      }

      if (OPTIONAL_SECTION_START_RE.test(normalized) && !/^\d{1,3}\s/.test(normalized)) {
        scopeCategory = 'optional';
      }

      if (BASE_SECTION_RESET_RE.test(normalized)) {
        scopeCategory = 'base';
      }

      if (!/^\d{1,3}\s/.test(normalized)) continue;

      debug.rowsSeen++;

      const trace: LineAttempt = {
        page: page.pageNum,
        raw_line: line.slice(0, 200),
        normalized_line: '',
        starts_with_number: false,
        regex_full_match: false,
        regex_no_rate_match: false,
        regex_minimal_match: false,
        excluded_reason: null,
        parsed_result: 'failed',
      };

      // Description-level override: certain trade prefixes force the scope category
      // regardless of the current section heading state
      let effectiveScopeCategory = scopeCategory;
      if (FORCE_BASE_DESC_RE.test(normalized)) {
        effectiveScopeCategory = 'base';
      } else if (FORCE_OPTIONAL_DESC_RE.test(normalized)) {
        effectiveScopeCategory = 'optional';
      }

      const item = tryParseRow(normalized, currentSection, effectiveScopeCategory, page.pageNum, trace);

      // Collect first 25 line attempts for forensic output
      if (debug.lineAttempts.length < 25) {
        debug.lineAttempts.push(trace);
      }

      if (item) {
        debug.rowsValid++;
        items.push(item);
      } else {
        debug.rowsFailed++;
        if (debug.sampleFailedLines.length < 10) {
          debug.sampleFailedLines.push(normalized.slice(0, 150));
        }
        console.log(`[FORENSIC] ROW_FAIL page=${page.pageNum} reason=${trace.excluded_reason} line=${JSON.stringify(normalized.slice(0, 120))}`);
      }
    }
  }

  // Determine failure code
  const totalNumberedLines = debug.pageTraces.reduce((s, p) => s + p.numberedLinesDetected, 0);
  if (debug.pageTraces.length === 0) {
    debug.failureCode = 'no_schedule_pages_detected';
  } else if (totalNumberedLines === 0) {
    debug.failureCode = 'no_numbered_lines_found';
  } else if (debug.rowsSeen === 0) {
    debug.failureCode = 'schedule_pages_empty';
  } else if (debug.rowsValid === 0 && debug.rowsSeen > 0) {
    debug.failureCode = 'regex_no_matches';
  } else if (items.length === 0) {
    debug.failureCode = 'rows_filtered_out_post_parse';
  }

  return items;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseSummarySchedulePdf(pages: PageData[]): RawParserOutput {
  console.log(`[parseSummarySchedulePdf] ENTRY pages=${pages.length} total_chars=${pages.reduce((s, p) => s + p.text.length, 0)}`);

  const summary = extractSummaryTotals(pages);

  console.log(`[parseSummarySchedulePdf] summary_grand_total=${summary.grandTotal} found_on_page=${summary.foundOnPage} raw_matches=${JSON.stringify(summary.rawMatches)}`);

  const debug: ScheduleParseDebug = {
    rowsSeen: 0,
    rowsValid: 0,
    rowsFailed: 0,
    sampleFailedLines: [],
    lineAttempts: [],
    pageTraces: [],
    failureCode: null,
  };

  const scheduleItems = parseSchedulePages(pages, debug);

  const baseItems = scheduleItems.filter(i => i.scopeCategory === 'base');
  const optionalItems = scheduleItems.filter(i => i.scopeCategory === 'optional');
  const rowBaseSum = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptionalSum = optionalItems.reduce((s, i) => s + i.total, 0);

  const canonicalGrandTotal = summary.grandTotal ?? rowBaseSum;
  const canonicalOptionalTotal = summary.optionalTotal ?? rowOptionalSum;

  // Determine final failure code
  const failureCode = debug.failureCode
    ?? (scheduleItems.length === 0 ? 'parser_state_bug' : null);

  // derived_items_total = raw schedule row sum — kept for analytics only.
  // resolved_total will be summary.grandTotal when found (commercial truth).
  const derivedItemsTotal = rowBaseSum;

  console.log(
    `[parseSummarySchedulePdf] EXIT rows_seen=${debug.rowsSeen} rows_valid=${debug.rowsValid} rows_failed=${debug.rowsFailed} failure_code=${failureCode}` +
    ` | summary_grand_total=${summary.grandTotal} derived_items_total=${derivedItemsTotal} canonical_optional=${canonicalOptionalTotal}`
  );
  console.log(`[parseSummarySchedulePdf] LINE_ATTEMPTS sample: ${JSON.stringify(debug.lineAttempts.slice(0, 5))}`);

  const parserReasons: string[] = [
    `pages_received=${pages.length}`,
    `chars_per_page=${pages.map(p => p.text.length).join(',')}`,
    `summary_grand_total=${summary.grandTotal}`,
    `summary_found_on_page=${summary.foundOnPage ?? 'not_found'}`,
    `summary_raw_matches=${JSON.stringify(summary.rawMatches)}`,
    `derived_items_total=${derivedItemsTotal}`,
    `optional_scope_total=${canonicalOptionalTotal}`,
    ...debug.pageTraces.map(pt =>
      `page=${pt.pageNum} chars=${pt.pageChars} raw_lines=${pt.totalLinesRaw} trimmed=${pt.totalLinesAfterTrim} numbered=${pt.numberedLinesDetected} continuation_joins=${pt.continuationLinesJoined}`
    ),
    `rows_seen=${debug.rowsSeen}`,
    `rows_valid=${debug.rowsValid}`,
    `rows_failed=${debug.rowsFailed}`,
    `base_items=${baseItems.length}`,
    `optional_items=${optionalItems.length}`,
  ];

  if (debug.sampleFailedLines.length > 0) {
    parserReasons.push(`sample_failed_lines=${JSON.stringify(debug.sampleFailedLines)}`);
  }

  if (debug.lineAttempts.length > 0) {
    parserReasons.push(`line_attempts_sample=${JSON.stringify(debug.lineAttempts.slice(0, 10))}`);
  }

  if (failureCode) {
    parserReasons.push(`failure_code=${failureCode}`);
  }

  return {
    parserUsed: 'parseSummarySchedulePdf',
    allItems: scheduleItems,
    totals: {
      grandTotal: canonicalGrandTotal,
      optionalTotal: canonicalOptionalTotal,
      subTotal: summary.subTotal,
      // rowSum always reflects the raw schedule line-item sum (analytics layer)
      rowSum: rowBaseSum,
      source: summary.grandTotal !== null ? 'summary_page' : 'row_sum',
    },
    // derived_items_total: schedule row sum kept separately as analytics-only field.
    // Consumers MUST use totals.grandTotal (= resolved_total) as the commercial figure.
    derived_items_total: derivedItemsTotal,
    summaryDetected: summary.grandTotal !== null,
    optionalScopeDetected: summary.optionalTotal !== null || optionalItems.length > 0,
    parserReasons,
    rawSummary: {
      ...summary,
      parseDebug: {
        rowsSeen: debug.rowsSeen,
        rowsValid: debug.rowsValid,
        rowsFailed: debug.rowsFailed,
        failureCode,
        sampleFailedLines: debug.sampleFailedLines,
        lineAttempts: debug.lineAttempts,
        pageTraces: debug.pageTraces,
      },
    },
  };
}
