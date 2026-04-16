// =============================================================================
// PAGE-FIRST STRUCTURED PARSER  (Parser Mode A: StructuredPageParser)
//
// ARCHITECTURE (new source-of-truth priority):
//
//   1. Page 2 summary labels  → canonical totals (Main Scope, Optional Scope)
//   2. Schedule rows (p4–8)   → item counts, block breakdown, validation only
//
// Main Scope card  = Grand Total (excl. GST) from page 2 summary
// Optional Scope   = ADD TO SCOPE from page 2 summary
// NEVER derive Main Scope from row summation when page summary exists.
// =============================================================================

import { extractPage2Summary } from './page2SummaryExtractor';
export type { Page2Summary } from './page2SummaryExtractor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StructuredPageItem {
  line_id: string;
  block_id: string;
  service: string;
  service_type: string;
  size: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  scope_category: 'base' | 'optional';
  page_number: number;
  source: 'structured_page_parser';
}

export interface PageParseResult {
  mode: 'structured_page_parser';
  items: StructuredPageItem[];
  // SOURCE-OF-TRUTH totals (from page 2 summary when available)
  base_total: number;
  optional_total: number;
  subtotal: number | null;
  ps3_qa: number | null;
  document_total: number | null;
  block_totals: Record<string, number>;
  validation: {
    matches_document: boolean;
    variance: number;
    risk: 'OK' | 'HIGH';
    message?: string;
  };
  page_count: number;
  structured_pages: number;
  diagnostics: {
    rows_detected: number;
    rows_parsed: number;
    rows_failed: number;
    rows_excluded_by_others: number;
    summary_detected: boolean;
    used_source: 'page2_summary' | 'row_fallback';
  };
  fallback_triggered: boolean;
}

// ---------------------------------------------------------------------------
// Step 1 — Document qualification
// ---------------------------------------------------------------------------

const SCHEDULE_SIGNALS = [
  /Firestopping\s+Schedule/i,
  /BLOCK\s+B?\d+/i,
  /PASSIVE\s+FIRE/i,
  /Fire\s+Resistance\s+Rating/i,
  /FRR\s*\d/i,
];

export function isStructuredSchedulePage(pageText: string): boolean {
  return SCHEDULE_SIGNALS.some(re => re.test(pageText));
}

export function documentQualifiesForStructuredParser(pages: string[]): boolean {
  if (pages.length === 0) return false;
  const structuredCount = pages.filter(p => isStructuredSchedulePage(p)).length;
  return structuredCount >= 2 || structuredCount / pages.length >= 0.5;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BLOCK_HEADER_RE = /\bBLOCK\s*B?(\d+)\b/i;
const OPTIONAL_SECTION_RE = /\b(OPTIONAL\s+SCOPE|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS)\b/i;

function parseMoney(raw: string): number {
  const val = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(val) ? 0 : val;
}

function normaliseUnit(raw: string): string {
  const u = raw.toLowerCase().trim().replace(/\.$/, '');
  const map: Record<string, string> = {
    no: 'ea', ea: 'ea', each: 'ea', nr: 'ea', item: 'ea',
    m: 'lm', lm: 'lm', m2: 'm2', sqm: 'm2',
  };
  return map[u] ?? u;
}

// ---------------------------------------------------------------------------
// Flexible row regex patterns (whitespace-collapsed before matching)
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

const EXCLUDE_LABELS = [
  /^\$\s*[-–]$/, /^-+$/, /^n\/?a$/i,
  /not\s+in\s+contract/i,
  /not\s+part\s+of\s+passive\s+fire/i,
];

interface ParseAttempt {
  item: StructuredPageItem | null;
  byOthers: boolean;
}

function attemptParseRow(
  rawLine: string,
  blockId: string,
  scopeCategory: 'base' | 'optional',
  pageNum: number,
): ParseAttempt {
  const line = rawLine.replace(/\s+/g, ' ').trim();

  if (!/^\d{1,3}\s/.test(line)) return { item: null, byOthers: false };

  if (BY_OTHERS_RE.test(line)) return { item: null, byOthers: true };
  if (EXCLUDE_LABELS.some(re => re.test(line))) return { item: null, byOthers: false };

  const sizeMatch = line.match(/\b(\d{2,4}mm|\d+[Xx]\d+|DN\d+)\b/i);
  const size = sizeMatch ? sizeMatch[1] : '';
  const stMatch = line.match(/\b(cable|pipe|duct|conduit|penetration|firestopping|intumescent|collar|wrap|pillow|seal)\b/i);
  const serviceType = stMatch ? stMatch[1].toLowerCase() : '';

  let m = line.match(ROW_FULL_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, rateRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return { item: null, byOthers: false };
    return {
      item: {
        line_id: lineId, block_id: blockId,
        service: desc.split(' ')[0] ?? '', service_type: serviceType, size,
        description: desc.trim(),
        qty: parseFloat(qtyRaw) || 1, unit: normaliseUnit(unitRaw),
        rate: parseMoney(rateRaw), total,
        scope_category: scopeCategory, page_number: pageNum,
        source: 'structured_page_parser',
      },
      byOthers: false,
    };
  }

  m = line.match(ROW_NO_RATE_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    const qty = parseFloat(qtyRaw) || 1;
    if (total === 0) return { item: null, byOthers: false };
    return {
      item: {
        line_id: lineId, block_id: blockId,
        service: desc.split(' ')[0] ?? '', service_type: serviceType, size,
        description: desc.trim(),
        qty, unit: normaliseUnit(unitRaw),
        rate: total / qty, total,
        scope_category: scopeCategory, page_number: pageNum,
        source: 'structured_page_parser',
      },
      byOthers: false,
    };
  }

  m = line.match(ROW_TOTAL_ONLY_RE);
  if (m) {
    const [, lineId, desc, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return { item: null, byOthers: false };
    return {
      item: {
        line_id: lineId, block_id: blockId,
        service: desc.split(' ')[0] ?? '', service_type: serviceType, size,
        description: desc.trim(),
        qty: 1, unit: 'item', rate: total, total,
        scope_category: scopeCategory, page_number: pageNum,
        source: 'structured_page_parser',
      },
      byOthers: false,
    };
  }

  return { item: null, byOthers: false };
}

// ---------------------------------------------------------------------------
// Parse single page (for item counts + block breakdown only)
// ---------------------------------------------------------------------------

interface PageResult {
  items: StructuredPageItem[];
  lastBlockId: string;
  rows_detected: number;
  rows_parsed: number;
  rows_failed: number;
  rows_excluded_by_others: number;
}

export function parsePage(
  pageText: string,
  pageNum: number,
  inheritedBlockId: string,
): PageResult {
  const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);
  const items: StructuredPageItem[] = [];
  let currentBlockId = inheritedBlockId;
  let scopeCategory: 'base' | 'optional' = 'base';
  let rows_detected = 0;
  let rows_parsed = 0;
  let rows_failed = 0;
  let rows_excluded_by_others = 0;

  for (const line of lines) {
    const blockMatch = line.replace(/\s+/g, ' ').match(BLOCK_HEADER_RE);
    if (blockMatch) currentBlockId = `B${blockMatch[1]}`;

    if (OPTIONAL_SECTION_RE.test(line)) scopeCategory = 'optional';

    if (!/^\d{1,3}[\s]/.test(line.trimStart())) continue;

    rows_detected++;
    const { item, byOthers } = attemptParseRow(line, currentBlockId, scopeCategory, pageNum);
    if (byOthers) {
      rows_excluded_by_others++;
    } else if (item) {
      rows_parsed++;
      items.push(item);
    } else {
      rows_failed++;
    }
  }

  return { items, lastBlockId: currentBlockId, rows_detected, rows_parsed, rows_failed, rows_excluded_by_others };
}

// ---------------------------------------------------------------------------
// Block totals from page text (secondary — for breakdown only)
// ---------------------------------------------------------------------------

function extractPageBlockTotals(pages: string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  const BLOCK_TOTAL_RE = /BLOCK\s*B?(\d+)\s+(?:TOTAL|SUB[- ]?TOTAL)\s*:?\s*\$?([\d,]+(?:\.\d{2})?)/gi;
  for (const page of pages) {
    const flat = page.replace(/[\r\n]+/g, ' ');
    let m: RegExpExecArray | null;
    BLOCK_TOTAL_RE.lastIndex = 0;
    while ((m = BLOCK_TOTAL_RE.exec(flat)) !== null) {
      const key = `B${m[1]}`;
      const val = parseMoney(m[2]);
      if (val > 0) totals[key] = val;
    }
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function runPageStructuredParser(pages: string[]): PageParseResult {
  // =========================================================================
  // STEP 1: Extract page 2 summary — this is the SOURCE OF TRUTH for totals
  // =========================================================================
  const summary = extractPage2Summary(pages);

  // =========================================================================
  // STEP 2: Parse schedule rows (pages 4–8) for item counts + block breakdown
  // =========================================================================
  const allItems: StructuredPageItem[] = [];
  let lastBlockId = 'UNKNOWN';
  let total_rows_detected = 0;
  let total_rows_parsed = 0;
  let total_rows_failed = 0;
  let total_rows_excluded_by_others = 0;

  for (let i = 0; i < pages.length; i++) {
    if (!isStructuredSchedulePage(pages[i])) continue;

    const result = parsePage(pages[i], i + 1, lastBlockId);
    lastBlockId = result.lastBlockId;
    allItems.push(...result.items);
    total_rows_detected += result.rows_detected;
    total_rows_parsed += result.rows_parsed;
    total_rows_failed += result.rows_failed;
    total_rows_excluded_by_others += result.rows_excluded_by_others;
  }

  // =========================================================================
  // STEP 3: Determine canonical totals
  //
  //   SOURCE PRIORITY:
  //     A) Page 2 summary (grand_total / optional_total) — preferred
  //     B) Row summation — only if summary not found
  // =========================================================================
  const baseItems = allItems.filter(i => i.scope_category === 'base');
  const optionalItems = allItems.filter(i => i.scope_category === 'optional');
  const rowBaseTotal = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptionalTotal = optionalItems.reduce((s, i) => s + i.total, 0);

  const base_total = summary.summary_detected && summary.grand_total !== null
    ? summary.grand_total
    : rowBaseTotal;

  const optional_total = summary.summary_detected && summary.optional_total !== null
    ? summary.optional_total
    : rowOptionalTotal;

  const document_total = summary.grand_total;

  console.log(`[StructuredPageParser] used_source=${summary.used_source} summary_detected=${summary.summary_detected}`);
  console.log(`[StructuredPageParser] base_total=$${base_total.toFixed(2)} optional_total=$${optional_total.toFixed(2)}`);
  console.log(`[StructuredPageParser] rows_detected=${total_rows_detected} rows_parsed=${total_rows_parsed} rows_failed=${total_rows_failed} rows_excluded_by_others=${total_rows_excluded_by_others}`);

  // =========================================================================
  // STEP 4: Fallback logic
  //   fallback_triggered only when BOTH summary AND rows are empty
  // =========================================================================
  const fallback_triggered = !summary.summary_detected && allItems.length === 0;
  if (fallback_triggered) {
    console.warn('[StructuredPageParser] fallback_triggered=true — no summary and no rows, delegating to LLM pipeline');
  }

  // =========================================================================
  // STEP 5: Validation — compare row total vs summary total
  // =========================================================================
  let matches_document = true;
  let variance = 0;
  let risk: 'OK' | 'HIGH' = 'OK';
  let message: string | undefined;

  if (summary.summary_detected && rowBaseTotal > 0 && summary.grand_total !== null) {
    variance = Math.abs(summary.grand_total - rowBaseTotal) / summary.grand_total;
    if (variance > 0.15) {
      risk = 'HIGH';
      matches_document = false;
      message = `Row total $${rowBaseTotal.toFixed(2)} vs page2 summary $${summary.grand_total.toFixed(2)} — ${(variance * 100).toFixed(1)}% variance (rows used for count only)`;
    }
  }

  const blockTotals = extractPageBlockTotals(pages);
  const structuredPages = pages.filter(p => isStructuredSchedulePage(p)).length;

  return {
    mode: 'structured_page_parser',
    items: allItems,
    base_total,
    optional_total,
    subtotal: summary.subtotal,
    ps3_qa: summary.ps3_qa,
    document_total,
    block_totals: blockTotals,
    validation: { matches_document, variance, risk, message },
    page_count: pages.length,
    structured_pages: structuredPages,
    diagnostics: {
      rows_detected: total_rows_detected,
      rows_parsed: total_rows_parsed,
      rows_failed: total_rows_failed,
      rows_excluded_by_others: total_rows_excluded_by_others,
      summary_detected: summary.summary_detected,
      used_source: summary.used_source,
    },
    fallback_triggered,
  };
}
