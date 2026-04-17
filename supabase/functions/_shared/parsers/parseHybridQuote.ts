// =============================================================================
// REGEX RECOVERY PARSER: parseHybridQuote
// Role: fallback recovery when LLM primary parsing fails or is unavailable.
//
// Handles two confirmed sub-modes:
//
//   hybrid_numbered_schedule  (Optimal-style)
//     - Numbered rows: <id> <description> <qty> <unit> <rate> <total>
//     - Summary page with authoritative totals
//     - Optional scope is a distinct labelled section
//
//   hybrid_table_breakdown  (Global-style)
//     - Unnumbered table rows with columns:
//       Service | FRR | Substrate | Qty | Rate | Total
//     - Summary page with authoritative totals
//     - Optional scope on separate breakdown pages
//
// Section boundaries supported:
//   BASE_SCOPE / MAIN SCOPE / SCOPE OF WORKS
//   OPTIONAL SCOPE / ADD TO SCOPE / OPTIONAL EXTRAS / PROVISIONAL ITEMS
//   EXCLUSIONS / BY OTHERS / NIC / NOT IN CONTRACT
//
// Returns standard shape:
//   { items, confidence, parser_used, parser_mode, warnings }
// Plus backward-compat fields for existing callers (allItems, totals, …)
// =============================================================================

import type { PageData } from '../documentClassifier.ts';
import type { RawParserOutput, ParsedLineItem } from '../parseResolutionLayerV3.ts';
import { parseSummarySchedulePdf } from './parseSummarySchedulePdf.ts';
import { extractDocumentTotals } from '../documentTotalExtractor.ts';

// ---------------------------------------------------------------------------
// Standard output shape
// ---------------------------------------------------------------------------

export interface RegexRecoveryResult {
  items: ParsedLineItem[];
  confidence: number;
  parser_used: 'parseHybridQuote';
  parser_mode: 'regex_recovery';
  warnings: string[];

  // Backward-compat (existing callers)
  parserUsed: string;
  allItems: ParsedLineItem[];
  totals: {
    grandTotal: number;
    optionalTotal: number;
    subTotal: number | null;
    rowSum: number;
    source: 'summary_page' | 'row_sum';
  };
  summaryDetected: boolean;
  optionalScopeDetected: boolean;
  parserReasons: string[];
  rawSummary: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Money / unit helpers
// ---------------------------------------------------------------------------

function parseMoney(raw: string | number): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const v = parseFloat(
    String(raw)
      .replace(/[$\s\u00A0\u202F\u2009'`]/g, '')
      .replace(/,(\d{3})/g, '$1')
      .replace(/[^\d.\-]/g, ''),
  );
  return isNaN(v) ? 0 : v;
}

function normaliseUnit(raw: string): string {
  const u = (raw ?? '').toLowerCase().trim().replace(/\.$/, '');
  const map: Record<string, string> = {
    no: 'ea', ea: 'ea', each: 'ea', nr: 'ea', item: 'ea', items: 'ea',
    set: 'ea', lot: 'ea', ls: 'ea', sum: 'ea', allow: 'ea',
    m: 'lm', lm: 'lm', 'lin.m': 'lm', 'lin m': 'lm',
    m2: 'm2', sqm: 'm2',
    hr: 'hr', hrs: 'hr', day: 'day', days: 'day',
  };
  return map[u] ?? (u || 'item');
}

// ---------------------------------------------------------------------------
// Section boundary patterns
// ---------------------------------------------------------------------------

const OPTIONAL_SECTION_RE =
  /\b(OPTIONAL\s+SCOPE|ADD\s+(?:TO\s+)?SCOPE|OPTIONAL\s+EXTRAS?|PROVISIONAL\s+ITEMS?|ITEMS?\s+WITH\s+CONFIRMATION|PC\s+ITEMS?|PRIME\s+COST\s+ITEMS?)\b/i;

const BASE_SCOPE_RESET_RE =
  /^\s*(MAIN\s+SCOPE|BASE\s+SCOPE|SCOPE\s+OF\s+WORKS?|SCHEDULE\s+OF\s+(?:RATES?|QUANTITIES)|FIRE\s+STOPPING|PASSIVE\s+FIRE|BASE\s+CONTRACT)\s*:?\s*$/i;

const EXCLUSION_SECTION_RE =
  /^\s*(EXCLUSIONS?|BY\s+OTHERS|NOT\s+IN\s+CONTRACT|N\.?I\.?C\.?|SERVICES?\s+(?:IDENTIFIED\s+)?NOT\s+(?:IN\s+|PART\s+OF\s+)?(?:SCOPE|CONTRACT)|ITEMS?\s+NOT\s+INCLUDED|NOT\s+INCLUDED\s+IN\s+SCOPE)\s*:?\s*$/i;

const BY_OTHERS_INLINE_RE = /\bby\s+others\b|\bn\.?i\.?c\.?\b|\bnot\s+in\s+contract\b|\bnot\s+included\b/i;

const PRELIMS_SECTION_RE =
  /^\s*(PRELIMS?|PRELIMINARIES|ALLOWANCES?|MOBILISATION|SITE\s+ESTABLISHMENT|OH\s*&\s*P|OVERHEADS?\s+(?:&|AND)\s+PROFIT|QUALITY\s+ASSURANCE|WARRANTY\s+(?:PERIOD|ALLOWANCE)|PS3\s*&\s*QA|INSURANCES?|SUPERVISION)\s*:?\s*$/i;

const SUMMARY_LABEL_RE =
  /\b(Grand\s+Total|Sub[\s-]?Total|Contract\s+(?:Sum|Total|Value)|Quote\s+Total|Net\s+Total|Total\s+(?:excl|incl)|Estimated\s+Total|Lump\s+Sum\s+Total)\b/i;

const DASH_PRICE_RE = /\$\s*-\s*$/;
const TRAILING_MONEY_RE = /\$?\s*([\d,]+\.\d{2})\s*$/;
const NUMBERED_ROW_RE = /^\d{1,3}\s/;
const MONEY_RE_GLOBAL = /\$?\s*(\d[\d,]*\.\d{2})/g;

// ---------------------------------------------------------------------------
// Page classification
// ---------------------------------------------------------------------------

const SKIP_PAGE_STRONG: RegExp[] = [
  /^EXCLUSIONS?\s*$/im,
  /\bRATE\s+SCHEDULE\b/i,
  /\bSCHEDULE\s+OF\s+RATES?\b/i,
  /\bTERMS\s+AND\s+CONDITIONS\b/i,
];

const SKIP_PAGE_WEAK: RegExp[] = [
  /\bEXCLUSIONS?\b.*\bBY\s+OTHERS\b/i,
  /\bTAGS?\s+(?:AND\s+)?NOTES?\b/i,
  /\bCLARIFICATIONS?\b.*\bNOTES?\b/i,
  /\bDRAWING\s+(?:NO|NUMBER|REF)\b/i,
  /\bDIAGRAM\b/i,
  /\bSCOPE\s+EXCLUSIONS?\b/i,
];

function isNonScopePage(text: string): boolean {
  if (SKIP_PAGE_STRONG.some(r => r.test(text))) return true;
  return SKIP_PAGE_WEAK.filter(r => r.test(text)).length >= 2;
}

const TOTAL_LABEL_RE =
  /\b(Grand\s+Total|Sub[\s-]?Total|Contract\s+(?:Sum|Total)|Quote\s+Total|Net\s+Total|Total\s+excl|Add\s+to\s+Scope|Optional\s+Scope|PS3\s*&\s*QA)\b/i;

function isSummaryPage(text: string): boolean {
  const totalLabelCount = (text.match(TOTAL_LABEL_RE) ?? []).length;
  const numberedRows = (text.match(/^\d{1,3}\s/gm) ?? []).length;
  const pricedRows = (text.match(/\$[\d,]+\.\d{2}/g) ?? []).length;
  return totalLabelCount >= 2 && numberedRows < 5 && pricedRows >= 2;
}

// ---------------------------------------------------------------------------
// Sub-mode detection
// ---------------------------------------------------------------------------

type HybridSubMode = 'hybrid_numbered_schedule' | 'hybrid_table_breakdown' | 'unknown';

const TABLE_HEADER_COL_RE =
  /\b(Service|FRR|Substrate|Fire\s+Rating|Wrap|Base\s+Rate|Insulation|System)\b/gi;

const TABLE_HEADER_LINE_RE =
  /\b(Service|System|Description)\b.{0,120}\b(Total|Amount|Rate)\b/i;

function detectSubMode(pages: PageData[]): HybridSubMode {
  const fullText = pages.map(p => p.text).join('\n');
  const numberedRows = (fullText.match(/^\d{1,3}\s+\S/gm) ?? []).length;
  const tableColHits = (fullText.match(TABLE_HEADER_COL_RE) ?? []).length;
  const hasTableHeader = TABLE_HEADER_LINE_RE.test(fullText);

  if (numberedRows >= 5) return 'hybrid_numbered_schedule';
  if (tableColHits >= 3 || hasTableHeader) return 'hybrid_table_breakdown';
  if (numberedRows > 0) return 'hybrid_numbered_schedule';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Multiline row joiner
// ---------------------------------------------------------------------------

/**
 * Join continuation lines onto their parent numbered row.
 * A continuation line is one that:
 *   - Does not start with a number (not a new row)
 *   - Is not a section boundary or skip pattern
 *   - Doesn't contain its own terminal money amount when joined
 */
function joinContinuationLines(rawLines: string[]): string[] {
  const result: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const current = rawLines[i].trim();
    if (!current) continue;

    if (!NUMBERED_ROW_RE.test(current)) {
      result.push(current);
      continue;
    }

    // This is a numbered row — check if it's incomplete (no trailing money)
    if (TRAILING_MONEY_RE.test(current)) {
      result.push(current);
      continue;
    }

    let joined = current;
    let j = i + 1;

    while (j < rawLines.length) {
      const next = rawLines[j].trim();

      // Stop at blank lines (section boundaries usually follow)
      if (!next) { j++; break; }

      // Stop if the next line starts a new numbered row
      if (NUMBERED_ROW_RE.test(next)) break;

      // Stop if the next line is a section boundary
      if (
        EXCLUSION_SECTION_RE.test(next) ||
        OPTIONAL_SECTION_RE.test(next) ||
        BASE_SCOPE_RESET_RE.test(next) ||
        PRELIMS_SECTION_RE.test(next)
      ) break;

      joined = `${joined} ${next}`;
      j++;

      if (TRAILING_MONEY_RE.test(joined)) break;
    }

    result.push(joined);
    // Skip lines we consumed
    if (j > i + 1) i = j - 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// NUMBERED SCHEDULE ROW PARSER (Pattern A — Optimal style)
// ---------------------------------------------------------------------------

const UNIT_TOKENS =
  'no\\.?|nr|m2|sqm|lm|lin\\.?m|each|ea|item|items|set|lot|hrs|hr|days|day|allow|sum|ls|m';

const ROW_FULL_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d]+(?:\\.\\d+)?)\\s+(${UNIT_TOKENS})\\s+\\$?\\s*([\\d,]+\\.\\d{2})\\s+\\$?\\s*([\\d,]+\\.\\d{2})$`,
  'i',
);
const ROW_NO_RATE_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d]+(?:\\.\\d+)?)\\s+(${UNIT_TOKENS})\\s+\\$?\\s*([\\d,]+\\.\\d{2})$`,
  'i',
);
const ROW_TOTAL_ONLY_RE = /^(\d{1,3})\s+(.{3,}?)\s+\$?\s*([\d,]+\.\d{2})$/i;

const HEADER_SKIP_RE =
  /^(Page\s+\d|Description|Item\s+No\.?|Qty|Quantity|Unit|Rate|Total|Amount|Ref|Notes?|Prepared\s+by|Date:|Project:|Revision|Rev\.?)/i;

function tryParseNumberedRow(
  line: string,
  section: string,
  scopeCategory: 'base' | 'optional',
  pageNum: number,
): ParsedLineItem | null {
  const flat = line.replace(/\s+/g, ' ').trim();
  if (!NUMBERED_ROW_RE.test(flat)) return null;
  if (BY_OTHERS_INLINE_RE.test(flat)) return null;
  if (SUMMARY_LABEL_RE.test(flat)) return null;
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
      rate: qty > 0 ? parseFloat((total / qty).toFixed(4)) : total,
      total, scopeCategory, pageNum,
      confidence: 0.90, source: 'hybrid_numbered',
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
      confidence: 0.72, source: 'hybrid_numbered',
    };
  }

  return null;
}

interface NumberedScheduleResult {
  items: ParsedLineItem[];
  skippedPages: number;
  mainCount: number;
  optionalCount: number;
  excludedCount: number;
}

function parseNumberedSchedulePages(pages: PageData[]): NumberedScheduleResult {
  const items: ParsedLineItem[] = [];
  let skippedPages = 0;
  let excludedCount = 0;
  let currentSection = 'MAIN';
  let scopeCategory: 'base' | 'optional' = 'base';
  let inExclusionSection = false;

  for (const page of pages) {
    if (isSummaryPage(page.text)) continue;
    if (isNonScopePage(page.text)) { skippedPages++; continue; }

    const rawLines = page.text.split('\n');
    const lines = joinContinuationLines(rawLines);

    for (const line of lines) {
      const norm = line.replace(/\s+/g, ' ').trim();
      if (!norm) continue;
      if (HEADER_SKIP_RE.test(norm)) continue;

      // --- Section boundary detection (order matters) ---

      if (EXCLUSION_SECTION_RE.test(norm)) {
        inExclusionSection = true;
        currentSection = norm.replace(/:?\s*$/, '').trim().toUpperCase();
        continue;
      }

      if (OPTIONAL_SECTION_RE.test(norm) && !NUMBERED_ROW_RE.test(norm)) {
        inExclusionSection = false;
        scopeCategory = 'optional';
        currentSection = norm.replace(/:?\s*$/, '').trim().toUpperCase();
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
        scopeCategory = 'base';
        currentSection = norm.replace(/:?\s*$/, '').trim().toUpperCase();
        continue;
      }

      // Inline NIC / by-others on a numbered row
      if (NUMBERED_ROW_RE.test(norm) && BY_OTHERS_INLINE_RE.test(norm)) {
        excludedCount++;
        continue;
      }

      if (inExclusionSection) { excludedCount++; continue; }
      if (!NUMBERED_ROW_RE.test(norm)) continue;
      if (SUMMARY_LABEL_RE.test(norm)) continue;
      if (DASH_PRICE_RE.test(norm)) continue;

      const item = tryParseNumberedRow(norm, currentSection, scopeCategory, page.pageNum);
      if (item) items.push(item);
    }
  }

  return {
    items,
    skippedPages,
    mainCount: items.filter(i => i.scopeCategory === 'base').length,
    optionalCount: items.filter(i => i.scopeCategory === 'optional').length,
    excludedCount,
  };
}

// ---------------------------------------------------------------------------
// UNNUMBERED TABLE ROW PARSER (Pattern B — Global style)
// Columns: Service | FRR | Substrate | Qty | Rate | Total
// ---------------------------------------------------------------------------

const TABLE_SKIP_ROW_RE =
  /^(Service|System|FRR|Fire\s*Rating|Substrate|Qty|Quantity|Unit|Rate|Total|Amount|Description|Solution|Size|Wrap|Insulation|Page\s+\d|Ref|Notes?|Spec|Drawing)/i;

const TABLE_TOTAL_ROW_RE =
  /\b(Sub[-\s]?Total|Grand\s+Total|Section\s+Total|Total\s+excl|Total\s+incl)\b/i;

const MIN_DESCRIPTION_LEN = 4;

/**
 * Parse a structured table row from a Global-style quote.
 *
 * Column order: Service | FRR | Substrate | Qty | Rate | Total
 * The FRR field (e.g. "FRL 120/120/120", "-/120/120", "N/A") is extracted
 * and preserved. The final money amount is the Total column.
 */
function parseTableRow(
  line: string,
  section: string,
  scopeCategory: 'base' | 'optional',
  pageNum: number,
  itemIndex: number,
): ParsedLineItem | null {
  // Must have at least one $ amount
  MONEY_RE_GLOBAL.lastIndex = 0;
  const moneyAmounts: number[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = MONEY_RE_GLOBAL.exec(line)) !== null) {
    const v = parseMoney(mm[1]);
    if (v > 0) moneyAmounts.push(v);
  }
  if (moneyAmounts.length === 0) return null;

  const total = moneyAmounts[moneyAmounts.length - 1];
  if (total <= 0) return null;

  // Extract FRR field — patterns like FRL 120/120/120, -/120/120, 60/60/60, N/A
  const frrMatch = line.match(/\b(?:FRL\s*)?(-|[0-9]{1,3})\/(-|[0-9]{1,3})\/(-|[0-9]{1,3})\b/);
  const frr = frrMatch ? frrMatch[0].trim() : '';

  // Strip money, FRR tokens, and numeric-only tokens to isolate description
  const stripped = line
    .replace(/\$?\s*\d[\d,]*\.\d{2}/g, '')
    .replace(/\b(?:FRL\s*)?(?:-|[0-9]{1,3})\/(?:-|[0-9]{1,3})\/(?:-|[0-9]{1,3})\b/g, '')
    .replace(/\b\d+(?:\.\d+)?\s*(?:no\.?|nr|ea|each|m2|sqm|lm|lin\.?m|item|items|set|ls|allow)\b/gi, '')
    .replace(/\b\d+(?:\.\d+)?\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (stripped.length < MIN_DESCRIPTION_LEN) return null;

  // Extract qty — standalone number before money values
  const qtyMatch = line.match(/\b(\d+(?:\.\d+)?)\s+(?:\$|\d[\d,]+\.\d{2})/);
  const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;

  // Rate is second-to-last money if multiple amounts
  const rate = moneyAmounts.length >= 2
    ? moneyAmounts[moneyAmounts.length - 2]
    : total;

  return {
    lineId: `T${pageNum}_${itemIndex}`,
    section,
    description: stripped,
    qty: qty > 0 ? qty : 1,
    unit: 'ea',
    rate,
    total,
    scopeCategory,
    pageNum,
    confidence: 0.80,
    source: 'hybrid_table',
    ...(frr ? { frr } : {}),
  };
}

function parseTableBreakdownPages(pages: PageData[]): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];

  for (const page of pages) {
    if (isSummaryPage(page.text)) continue;
    if (isNonScopePage(page.text)) continue;
    if (!TABLE_HEADER_LINE_RE.test(page.text)) continue;

    const lines = page.text.split('\n').map(l => l.trim()).filter(Boolean);
    let inTable = false;
    let scopeCategory: 'base' | 'optional' = 'base';
    let currentSection = 'MAIN';
    let inExclusionSection = false;
    let pageItemIndex = 0;

    for (const line of lines) {
      const norm = line.replace(/\s+/g, ' ').trim();

      // --- Section boundaries ---
      if (EXCLUSION_SECTION_RE.test(norm)) {
        inExclusionSection = true;
        currentSection = norm.replace(/:?\s*$/, '').trim().toUpperCase();
        continue;
      }
      if (OPTIONAL_SECTION_RE.test(norm) && !/\$[\d,]+\.\d{2}/.test(norm)) {
        inExclusionSection = false;
        scopeCategory = 'optional';
        currentSection = norm.replace(/:?\s*$/, '').trim().toUpperCase();
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
        scopeCategory = 'base';
        currentSection = norm.replace(/:?\s*$/, '').trim().toUpperCase();
        continue;
      }

      if (inExclusionSection) continue;
      if (BY_OTHERS_INLINE_RE.test(norm)) continue;
      if (DASH_PRICE_RE.test(norm)) continue;
      if (TABLE_TOTAL_ROW_RE.test(norm)) continue;
      if (SUMMARY_LABEL_RE.test(norm)) continue;

      // Detect table header line
      if (TABLE_HEADER_LINE_RE.test(norm)) {
        inTable = true;
        continue;
      }
      if (!inTable) continue;
      if (TABLE_SKIP_ROW_RE.test(norm)) continue;

      pageItemIndex++;
      const item = parseTableRow(norm, currentSection, scopeCategory, page.pageNum, pageItemIndex);
      if (item) items.push(item);
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

interface ConfidenceInput {
  items: ParsedLineItem[];
  subMode: HybridSubMode;
  grandTotal: number | null;
  rowSum: number;
  warnings: string[];
}

function scoreConfidence(input: ConfidenceInput): number {
  const { items, subMode, grandTotal, rowSum, warnings } = input;
  let score = 1.0;

  // Unknown sub-mode is a bad sign
  if (subMode === 'unknown') score -= 0.15;

  // Penalise low item count
  if (items.length === 0) return 0.0;
  if (items.length < 3) score -= 0.2;
  else if (items.length < 8) score -= 0.08;

  // Numeric completeness: fraction of items with qty, rate, AND total all > 0
  const complete = items.filter(i => i.qty > 0 && i.rate > 0 && i.total > 0).length;
  const completeness = complete / items.length;
  if (completeness < 0.5) score -= 0.2;
  else if (completeness < 0.75) score -= 0.1;

  // Section consistency: all base vs mixed is good
  const sections = new Set(items.map(i => i.scopeCategory));
  if (sections.size > 2) score -= 0.05;

  // Total variance vs document grand total
  if (grandTotal && grandTotal > 0 && rowSum > 0) {
    const variance = Math.abs(rowSum - grandTotal) / grandTotal;
    if (variance > 0.1) score -= 0.2;
    else if (variance > 0.03) score -= 0.1;
  }

  // Penalise per warning
  score -= warnings.length * 0.03;

  return parseFloat(Math.max(0.05, Math.min(1.0, score)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseHybridQuote(pages: PageData[]): RegexRecoveryResult {
  console.log(`[parseHybridQuote] pages=${pages.length} mode=regex_recovery`);

  const warnings: string[] = [];
  const fullText = pages.map(p => p.text).join('\n\n');
  const docTotals = extractDocumentTotals(fullText);

  let grandTotal: number | null = docTotals.grandTotal;
  if (!grandTotal && docTotals.subTotal && docTotals.subTotal > 0) {
    grandTotal = docTotals.subTotal + (docTotals.qaTotal ?? 0);
  }
  const optionalTotal: number | null = docTotals.optionalTotal;

  console.log(`[parseHybridQuote] grandTotal=${grandTotal} optionalTotal=${optionalTotal}`);

  const subMode = detectSubMode(pages);
  console.log(`[parseHybridQuote] subMode=${subMode}`);

  if (subMode === 'unknown') {
    warnings.push('Sub-mode could not be determined; attempting both parsers');
  }

  let items: ParsedLineItem[] = [];
  let skippedPages = 0;
  let mainCount = 0;
  let optionalCount = 0;
  let excludedCount = 0;
  const summaryPageDetected = pages.some(p => isSummaryPage(p.text));

  if (subMode === 'hybrid_numbered_schedule') {
    const r = parseNumberedSchedulePages(pages);
    items = r.items;
    skippedPages = r.skippedPages;
    mainCount = r.mainCount;
    optionalCount = r.optionalCount;
    excludedCount = r.excludedCount;

  } else if (subMode === 'hybrid_table_breakdown') {
    items = parseTableBreakdownPages(pages);
    mainCount = items.filter(i => i.scopeCategory === 'base').length;
    optionalCount = items.filter(i => i.scopeCategory === 'optional').length;

  } else {
    // Unknown: try numbered first, then table
    const numbered = parseNumberedSchedulePages(pages);
    if (numbered.items.length > 0) {
      items = numbered.items;
      skippedPages = numbered.skippedPages;
      mainCount = numbered.mainCount;
      optionalCount = numbered.optionalCount;
      excludedCount = numbered.excludedCount;
      warnings.push('Sub-mode unknown; recovered via numbered schedule parser');
    } else {
      items = parseTableBreakdownPages(pages);
      mainCount = items.filter(i => i.scopeCategory === 'base').length;
      optionalCount = items.filter(i => i.scopeCategory === 'optional').length;
      if (items.length > 0) {
        warnings.push('Sub-mode unknown; recovered via table breakdown parser');
      }
    }
  }

  // Last resort: delegate to parseSummarySchedulePdf
  if (items.length === 0) {
    warnings.push(`No rows recovered (subMode=${subMode}); delegating to parseSummarySchedulePdf`);
    console.log(`[parseHybridQuote] Delegating to parseSummarySchedulePdf`);
    const fallback = parseSummarySchedulePdf(pages);
    const fallbackItems = (fallback.allItems ?? []) as ParsedLineItem[];
    const fallbackRowSum = fallbackItems.reduce((s, i) => s + i.total, 0);
    const confidence = scoreConfidence({
      items: fallbackItems,
      subMode,
      grandTotal,
      rowSum: fallbackRowSum,
      warnings,
    });

    return {
      items: fallbackItems,
      confidence,
      parser_used: 'parseHybridQuote',
      parser_mode: 'regex_recovery',
      warnings,
      // backward-compat
      parserUsed: `parseHybridQuote(fallback:parseSummarySchedulePdf)`,
      allItems: fallbackItems,
      totals: {
        grandTotal: grandTotal ?? fallbackRowSum,
        optionalTotal: optionalTotal ?? 0,
        subTotal: docTotals.subTotal,
        rowSum: fallbackRowSum,
        source: grandTotal !== null ? 'summary_page' : 'row_sum',
      },
      summaryDetected: grandTotal !== null,
      optionalScopeDetected: optionalTotal !== null,
      parserReasons: [`Delegated to parseSummarySchedulePdf after zero rows`],
      rawSummary: {
        hybrid_submode: subMode,
        delegated_to_fallback: true,
        document_grand_total: docTotals.grandTotal,
      },
    };
  }

  const baseItems = items.filter(i => i.scopeCategory === 'base');
  const optItems = items.filter(i => i.scopeCategory === 'optional');
  const rowBaseSum = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptSum = optItems.reduce((s, i) => s + i.total, 0);
  const rowSum = rowBaseSum;

  const canonicalTotal = grandTotal ?? rowBaseSum;
  const canonicalOptional = optionalTotal ?? rowOptSum;

  // Warn if total divergence is large
  if (grandTotal && rowBaseSum > 0) {
    const pct = Math.abs(rowBaseSum - grandTotal) / grandTotal;
    if (pct > 0.05) {
      warnings.push(
        `Row sum $${rowBaseSum.toFixed(2)} diverges ${(pct * 100).toFixed(1)}% from document total $${grandTotal.toFixed(2)}`,
      );
    }
  }

  if (excludedCount > 0) {
    warnings.push(`${excludedCount} row(s) excluded (BY OTHERS / NIC / EXCLUSIONS section)`);
  }

  const confidence = scoreConfidence({ items, subMode, grandTotal, rowSum, warnings });

  const parserReasons = [
    `Regex recovery sub-mode: ${subMode}`,
    `Summary page detected: ${summaryPageDetected}`,
    `Pages: ${pages.length} | Skipped: ${skippedPages}`,
    `Main rows: ${mainCount} | Optional rows: ${optionalCount} | Excluded: ${excludedCount}`,
    `Grand total: ${grandTotal !== null ? `$${grandTotal.toFixed(2)} (document)` : `$${rowBaseSum.toFixed(2)} (row sum)`}`,
    `Optional total: ${optionalTotal !== null ? `$${optionalTotal.toFixed(2)} (document)` : `$${rowOptSum.toFixed(2)} (row sum)`}`,
    `Confidence: ${confidence}`,
  ];

  console.log(`[parseHybridQuote] items=${items.length} confidence=${confidence} warnings=${warnings.length}`);

  return {
    // Standard shape
    items,
    confidence,
    parser_used: 'parseHybridQuote',
    parser_mode: 'regex_recovery',
    warnings,

    // Backward-compat
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
    parserReasons,
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
