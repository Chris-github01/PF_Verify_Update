// =============================================================================
// FAMILY PARSER: hybrid_quote
//
// Handles two confirmed sub-modes:
//
//   hybrid_numbered_schedule
//     - Summary page with authoritative totals
//     - Later pages contain numbered schedule rows (1 desc qty unit rate total)
//     - Optional scope is a distinct section on schedule pages
//     - Non-passive-fire services are excluded
//
//   hybrid_table_breakdown
//     - Summary page with authoritative totals
//     - Later pages contain structured column tables WITHOUT numbered line IDs
//       (columns: Service | Size | FRR | Substrate | Qty | Rate | Wrap | Total)
//     - Optional scope appears on separate breakdown pages
//     - Exclusions / tags / rate schedule pages are skipped entirely
//
// RULES (both sub-modes):
//   - Summary page totals are AUTHORITATIVE — grand_total > subtotal+qa > row_sum
//   - Section boundaries drive scope classification (not keyword-only row matching)
//   - Non-scope pages (exclusions, tags, rate schedules, diagrams) are skipped
// =============================================================================

import type { PageData } from '../documentClassifier.ts';
import type { RawParserOutput, ParsedLineItem } from '../parseResolutionLayerV3.ts';
import { parseSummarySchedulePdf } from './parseSummarySchedulePdf.ts';
import { extractDocumentTotals } from '../documentTotalExtractor.ts';

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Section boundary patterns
// ---------------------------------------------------------------------------

// Optional scope section openers
const OPTIONAL_SECTION_RE =
  /\b(OPTIONAL\s+SCOPE|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS?|PROVISIONAL\s+ITEMS?|Items?\s+with\s+Confirmation)\b/i;

// Base scope reset markers
const BASE_SCOPE_RESET_RE =
  /^\s*(MAIN\s+SCOPE|BASE\s+SCOPE|SCOPE\s+OF\s+WORKS?|SCHEDULE\s+OF\s+(RATES?|QUANTITIES)|FIRE\s+STOPPING|PASSIVE\s+FIRE)\s*:?\s*$/i;

// Exclusion section openers (rows after this → excluded)
const EXCLUSION_SECTION_RE =
  /^\s*(EXCLUSIONS?|BY\s+OTHERS|NOT\s+IN\s+CONTRACT|SERVICES\s+IDENTIFIED\s+NOT\s+PART|ITEMS?\s+NOT\s+INCLUDED)\s*:?\s*$/i;

// Prelims / QA sections — still base scope
const PRELIMS_SECTION_RE =
  /^\s*(PRELIMS?|PRELIMINARIES|ALLOWANCES?|MOBILISATION|SITE\s+ESTABLISHMENT|OH\s*&\s*P|OVERHEADS?\s+(&|AND)\s+PROFIT|QUALITY\s+ASSURANCE|WARRANTY\s+(PERIOD|ALLOWANCE)|PS3\s*&\s*QA)\s*:?\s*$/i;

// Summary / grand total labels — skip these lines when not on numbered rows
const SUMMARY_LABEL_RE =
  /\b(Grand\s+Total|Sub[\s-]?Total|Contract\s+(?:Sum|Total)|Quote\s+Total|Net\s+Total|Total\s+excl)\b/i;

// By-others row exclusion
const BY_OTHERS_ROW_RE = /\bby\s+others\b|\bn\.?i\.?c\.?\b|\bnot\s+in\s+contract\b/i;

// Dash-price row ($ - or $- or price marked as excluded)
const DASH_PRICE_RE = /\$\s*-\s*$/;

const TRAILING_MONEY_RE = /\$?\s*([\d,]+\.\d{2})\s*$/;
const NUMBERED_ROW_RE = /^\d{1,3}\s/;

// ---------------------------------------------------------------------------
// Non-scope page detection — pages that should be skipped entirely
// ---------------------------------------------------------------------------

const SKIP_PAGE_PATTERNS: RegExp[] = [
  /\bEXCLUSIONS?\b.*\bBY\s+OTHERS\b/i,
  /^EXCLUSIONS?\s*$/im,
  /\bRATE\s+SCHEDULE\b/i,
  /\bSCHEDULE\s+OF\s+RATES?\b/i,
  /\bTAGS?\s+(AND\s+)?NOTES?\b/i,
  /\bCLARIFICATIONS?\b.*\bNOTES?\b/i,
  /\bDRAWING\s+(NO|NUMBER|REF)\b/i,
  /\bDIAGRAM\b/i,
  /\bTERMS\s+AND\s+CONDITIONS\b/i,
  /\bSCOPE\s+EXCLUSIONS?\b/i,
];

function isNonScopePage(pageText: string): boolean {
  const upper = pageText.toUpperCase();
  // Skip page if 3+ non-scope signals present, or any single strong one
  const strongSignals = [
    /^EXCLUSIONS?\s*$/im,
    /RATE\s+SCHEDULE/i,
    /SCHEDULE\s+OF\s+RATES?/i,
    /TERMS\s+AND\s+CONDITIONS/i,
  ];
  if (strongSignals.some(r => r.test(pageText))) return true;

  const weakCount = SKIP_PAGE_PATTERNS.filter(r => r.test(pageText)).length;
  return weakCount >= 2;
}

// ---------------------------------------------------------------------------
// Summary page detection — a page is a "summary page" if it has multiple
// total-like labels but very few (or no) numbered rows.
// ---------------------------------------------------------------------------

const TOTAL_LABEL_RE =
  /\b(Grand\s+Total|Sub[\s-]?Total|Contract\s+(Sum|Total)|Quote\s+Total|Net\s+Total|Total\s+excl|Add\s+to\s+Scope|Optional\s+Scope|PS3\s*&\s*QA)\b/i;

function isSummaryPage(pageText: string): boolean {
  const totalLabelCount = (pageText.match(TOTAL_LABEL_RE) ?? []).length;
  const numberedRows = (pageText.match(/^\d{1,3}\s/gm) ?? []).length;
  const pricedRows = (pageText.match(/\$[\d,]+\.\d{2}/g) ?? []).length;
  // A page is a summary page if it has multiple total labels and few numbered data rows
  return totalLabelCount >= 2 && numberedRows < 5 && pricedRows >= 2;
}

// ---------------------------------------------------------------------------
// Sub-mode detection
// ---------------------------------------------------------------------------

type HybridSubMode = 'hybrid_numbered_schedule' | 'hybrid_table_breakdown' | 'unknown';

function detectSubMode(pages: PageData[]): HybridSubMode {
  const fullText = pages.map(p => p.text).join('\n');
  const numberedRows = (fullText.match(/^\d{1,3}\s+\S/gm) ?? []).length;

  // Detect unnumbered table columns (Service/Size/FRR/Substrate/Qty/Rate columns)
  const tableColRe =
    /\b(Service|FRR|Substrate|Fire\s+Rating|Wrap|Base\s+Rate|Insulation)\b/gi;
  const tableColMatches = (fullText.match(tableColRe) ?? []).length;
  const hasUnnumberedPricedRows = detectUnnumberedTableRows(pages).length > 0;

  if (numberedRows >= 5) return 'hybrid_numbered_schedule';
  if (tableColMatches >= 3 || hasUnnumberedPricedRows) return 'hybrid_table_breakdown';
  if (numberedRows > 0) return 'hybrid_numbered_schedule';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// NUMBERED SCHEDULE ROW PARSER (Pattern A)
// ---------------------------------------------------------------------------

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

const SKIP_LINE_RE =
  /^(Page\s+\d|Description|Item\s+No|Qty|Quantity|Unit|Rate|Total|Amount|Ref|Notes?|Prepared\s+by|Date:|Project:)/i;

function tryParseNumberedRow(
  line: string,
  section: string,
  scopeCategory: 'base' | 'optional',
  pageNum: number,
): ParsedLineItem | null {
  const flat = line.replace(/\s+/g, ' ').trim();
  if (!NUMBERED_ROW_RE.test(flat)) return null;
  if (BY_OTHERS_ROW_RE.test(flat)) return null;
  if (SUMMARY_LABEL_RE.test(flat) && !NUMBERED_ROW_RE.test(flat)) return null;
  if (DASH_PRICE_RE.test(flat)) return null;

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
      confidence: 1.0, source: 'hybrid_numbered',
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
      confidence: 0.92, source: 'hybrid_numbered',
    };
  }

  m = flat.match(ROW_TOTAL_ONLY_RE);
  if (m) {
    const [, lineId, desc, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0 || desc.trim().length < 3) return null;
    return {
      lineId, section, description: desc.trim(),
      qty: 1, unit: 'item', rate: total, total,
      scopeCategory, pageNum,
      confidence: 0.75, source: 'hybrid_numbered',
    };
  }

  return null;
}

function parseNumberedSchedulePages(
  pages: PageData[],
): { items: ParsedLineItem[]; skippedPages: number; mainCount: number; optionalCount: number; excludedCount: number } {
  const items: ParsedLineItem[] = [];
  let skippedPages = 0;
  let currentSection = 'MAIN';
  let scopeCategory: 'base' | 'optional' = 'base';
  let inExclusionSection = false;

  for (const page of pages) {
    if (isSummaryPage(page.text)) continue;
    if (isNonScopePage(page.text)) { skippedPages++; continue; }

    const rawLines = page.text.split('\n');
    const lines: string[] = [];

    // Join continuation lines
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
      const norm = line.replace(/\s+/g, ' ').trim();
      if (!norm) continue;
      if (SKIP_LINE_RE.test(norm)) continue;

      // Section boundary detection
      if (EXCLUSION_SECTION_RE.test(norm)) {
        inExclusionSection = true;
        currentSection = norm.replace(/:?\s*$/, '').trim().toUpperCase();
        continue;
      }

      if (OPTIONAL_SECTION_RE.test(norm) && !NUMBERED_ROW_RE.test(norm)) {
        inExclusionSection = false;
        scopeCategory = 'optional';
        currentSection = norm.trim().toUpperCase();
        continue;
      }

      if (BASE_SCOPE_RESET_RE.test(norm)) {
        inExclusionSection = false;
        scopeCategory = 'base';
        currentSection = 'MAIN';
        continue;
      }

      if (PRELIMS_SECTION_RE.test(norm)) {
        inExclusionSection = false;
        currentSection = norm.replace(/:?\s*$/, '').trim().toUpperCase();
        scopeCategory = 'base';
        continue;
      }

      if (!NUMBERED_ROW_RE.test(norm)) continue;
      if (SUMMARY_LABEL_RE.test(norm)) continue;

      // Skip exclusion section rows and by-others rows
      if (inExclusionSection) continue;
      if (BY_OTHERS_ROW_RE.test(norm)) continue;
      if (DASH_PRICE_RE.test(norm)) continue;

      const item = tryParseNumberedRow(norm, currentSection, scopeCategory, page.pageNum);
      if (item) items.push(item);
    }
  }

  const mainCount = items.filter(i => i.scopeCategory === 'base').length;
  const optionalCount = items.filter(i => i.scopeCategory === 'optional').length;
  return { items, skippedPages, mainCount, optionalCount, excludedCount: 0 };
}

// ---------------------------------------------------------------------------
// UNNUMBERED TABLE ROW PARSER (Pattern B)
// ---------------------------------------------------------------------------
//
// Handles table rows without a leading line ID number.
// Expected columns (variable order): Description | Size | FRR | Substrate |
//                                    Qty | Base Rate | Insulation Wrap | Total | Solution
//
// Strategy:
//   1. Detect table header line to understand column order
//   2. Parse each subsequent data row by splitting on whitespace/tabs
//   3. Required: description segment + qty + final Total column value
//   4. Use final Total column as line total (not base rate or wrap columns)

// Patterns that indicate we're in an unnumbered breakdown table
const TABLE_HEADER_RE =
  /\b(Service|System|Description)\b.{0,80}\b(Total|Amount|Rate)\b/i;

// Matches a money amount at any position
const MONEY_RE = /\$?\s*(\d[\d,]*\.\d{2})/g;

// A data row in an unnumbered table must have at least one $ amount and a non-trivial description
const MIN_DESCRIPTION_LEN = 4;

// Non-data rows to skip within table pages
const TABLE_SKIP_RE =
  /^(Service|System|FRR|Substrate|Qty|Quantity|Unit|Rate|Total|Amount|Description|Solution|Size|Wrap|Insulation|Page\s+\d|Ref|Notes?|Spec|Drawing)/i;

// Aggregate total rows to skip (they'd double count)
const TABLE_TOTAL_ROW_RE =
  /\b(Sub[-\s]?Total|Grand\s+Total|Section\s+Total|Total\s+excl)\b/i;

function detectUnnumberedTableRows(pages: PageData[]): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];

  for (const page of pages) {
    if (isSummaryPage(page.text)) continue;
    if (isNonScopePage(page.text)) continue;
    if (!TABLE_HEADER_RE.test(page.text)) continue;

    const lines = page.text.split('\n').map(l => l.trim()).filter(Boolean);
    let inTable = false;
    let scopeCategory: 'base' | 'optional' = 'base';
    let currentSection = 'MAIN';
    let inExclusionSection = false;

    for (const line of lines) {
      // Detect section boundaries
      if (EXCLUSION_SECTION_RE.test(line)) { inExclusionSection = true; currentSection = line.toUpperCase(); continue; }
      if (OPTIONAL_SECTION_RE.test(line) && !MONEY_RE.test(line)) { inExclusionSection = false; scopeCategory = 'optional'; currentSection = line.toUpperCase(); MONEY_RE.lastIndex = 0; continue; }
      if (BASE_SCOPE_RESET_RE.test(line)) { inExclusionSection = false; scopeCategory = 'base'; currentSection = 'MAIN'; continue; }
      MONEY_RE.lastIndex = 0;

      if (inExclusionSection) continue;
      if (BY_OTHERS_ROW_RE.test(line)) continue;
      if (DASH_PRICE_RE.test(line)) continue;
      if (TABLE_TOTAL_ROW_RE.test(line)) continue;
      if (SUMMARY_LABEL_RE.test(line)) continue;

      // Detect table header
      if (TABLE_HEADER_RE.test(line)) { inTable = true; continue; }
      if (!inTable) continue;
      if (TABLE_SKIP_RE.test(line)) continue;

      // Extract all money amounts from this line
      const moneyAmounts: number[] = [];
      MONEY_RE.lastIndex = 0;
      let mm: RegExpExecArray | null;
      while ((mm = MONEY_RE.exec(line)) !== null) {
        const v = parseMoney(mm[1]);
        if (v > 0) moneyAmounts.push(v);
      }

      if (moneyAmounts.length === 0) continue;

      // The final money value on the line is the Total column
      const total = moneyAmounts[moneyAmounts.length - 1];
      if (total <= 0) continue;

      // Extract description: strip all money amounts and known column tokens from the line
      const stripped = line
        .replace(/\$?\s*\d[\d,]*\.\d{2}/g, '')
        .replace(/\b\d+(?:\.\d+)?\s*(no\.?|nr|ea|each|m2|sqm|lm|lin\.?m|item|items|set|ls|allow)\b/gi, '')
        .replace(/\b\d+(?:\.\d+)?\b/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (stripped.length < MIN_DESCRIPTION_LEN) continue;

      // Try to extract qty — look for a standalone integer or decimal before the money values
      // Pattern: a number token not adjacent to a $ that's followed by money tokens
      const qtyMatch = line.match(/\b(\d+(?:\.\d+)?)\s+(?:\$|\d[\d,]+\.\d{2})/);
      const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;

      // Rate: second to last money if multiple amounts exist
      const rate = moneyAmounts.length >= 2
        ? moneyAmounts[moneyAmounts.length - 2]
        : total;

      // Generate a lineId from the page + position
      const lineId = `T${page.pageNum}_${items.length + 1}`;

      items.push({
        lineId,
        section: currentSection,
        description: stripped,
        qty: qty > 0 ? qty : 1,
        unit: 'ea',
        rate,
        total,
        scopeCategory,
        pageNum: page.pageNum,
        confidence: 0.82,
        source: 'hybrid_table',
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseHybridQuote(pages: PageData[]): RawParserOutput {
  console.log(`[parseHybridQuote] pages=${pages.length}`);

  const fullText = pages.map(p => p.text).join('\n\n');
  const docTotals = extractDocumentTotals(fullText);

  // Determine grand total using priority: grand > subtotal+qa > null
  let grandTotal: number | null = docTotals.grandTotal;
  if (!grandTotal && docTotals.subTotal && docTotals.subTotal > 0) {
    grandTotal = docTotals.subTotal + (docTotals.qaTotal ?? 0);
  }
  const optionalTotal: number | null = docTotals.optionalTotal;

  console.log(`[parseHybridQuote] grandTotal=${grandTotal} optionalTotal=${optionalTotal}`);

  const subMode = detectSubMode(pages);
  console.log(`[parseHybridQuote] subMode=${subMode}`);

  let items: ParsedLineItem[] = [];
  let skippedPages = 0;
  let mainCount = 0;
  let optionalCount = 0;
  let excludedCount = 0;
  const summaryPageDetected = isSummaryPage(pages[0]?.text ?? '') || pages.some(p => isSummaryPage(p.text));

  if (subMode === 'hybrid_numbered_schedule') {
    const result = parseNumberedSchedulePages(pages);
    items = result.items;
    skippedPages = result.skippedPages;
    mainCount = result.mainCount;
    optionalCount = result.optionalCount;
    excludedCount = result.excludedCount;
  } else if (subMode === 'hybrid_table_breakdown') {
    items = detectUnnumberedTableRows(pages);
    mainCount = items.filter(i => i.scopeCategory === 'base').length;
    optionalCount = items.filter(i => i.scopeCategory === 'optional').length;
  } else {
    // Try numbered first, then table
    const numbered = parseNumberedSchedulePages(pages);
    if (numbered.items.length > 0) {
      items = numbered.items;
      skippedPages = numbered.skippedPages;
      mainCount = numbered.mainCount;
      optionalCount = numbered.optionalCount;
    } else {
      items = detectUnnumberedTableRows(pages);
      mainCount = items.filter(i => i.scopeCategory === 'base').length;
      optionalCount = items.filter(i => i.scopeCategory === 'optional').length;
    }
  }

  // If still nothing parsed, fall back to summary schedule parser
  if (items.length === 0) {
    console.log(`[parseHybridQuote] No rows parsed (subMode=${subMode}), falling back to parseSummarySchedulePdf`);
    const fallback = parseSummarySchedulePdf(pages);
    return {
      ...fallback,
      parserUsed: `parseHybridQuote(fallback:${subMode})`,
    };
  }

  const baseItems = items.filter(i => i.scopeCategory === 'base');
  const optItems = items.filter(i => i.scopeCategory === 'optional');
  const rowBaseSum = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptSum = optItems.reduce((s, i) => s + i.total, 0);

  const canonicalTotal = grandTotal ?? rowBaseSum;
  const canonicalOptional = optionalTotal ?? rowOptSum;

  const reasons = [
    `Hybrid sub-mode: ${subMode}`,
    `Summary page detected: ${summaryPageDetected}`,
    `Pages: ${pages.length} | Skipped: ${skippedPages}`,
    `Main rows: ${mainCount} | Optional rows: ${optionalCount} | Excluded: ${excludedCount}`,
    `Grand total: ${grandTotal !== null ? `$${grandTotal} (summary)` : `$${rowBaseSum} (row sum)`}`,
    `Optional total: ${optionalTotal !== null ? `$${optionalTotal} (summary)` : `$${rowOptSum} (row sum)`}`,
    `Total source: ${grandTotal !== null ? 'summary_page' : 'row_sum'}`,
  ];

  return {
    parserUsed: `parseHybridQuote:${subMode}`,
    allItems: items,
    totals: {
      grandTotal: canonicalTotal,
      optionalTotal: canonicalOptional,
      subTotal: docTotals.subTotal,
      rowSum: rowBaseSum,
      source: grandTotal !== null ? 'summary_page' : 'row_sum',
    },
    summaryDetected: grandTotal !== null,
    optionalScopeDetected: optionalTotal !== null || optItems.length > 0,
    parserReasons: reasons,
    rawSummary: {
      hybrid_submode: subMode,
      summary_page_detected: summaryPageDetected,
      main_rows_count: mainCount,
      optional_rows_count: optionalCount,
      excluded_rows_count: excludedCount,
      skipped_pages_count: skippedPages,
      total_source: grandTotal !== null ? 'summary_page' : 'row_sum',
      document_grand_total: docTotals.grandTotal,
      document_sub_total: docTotals.subTotal,
      document_qa_total: docTotals.qaTotal,
      document_optional_total: docTotals.optionalTotal,
    },
  };
}
