// =============================================================================
// PAGE-FIRST STRUCTURED PARSER  (Parser Mode A: StructuredPageParser)
// HOTFIX: flexible regex with whitespace collapse, diagnostic counters,
//         auto-fallback when zero rows parsed.
// =============================================================================

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
  base_total: number;
  optional_total: number;
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
// Step 4 + 5 — Flexible structured row parser
//
// PDF text extraction is irregular; whitespace is collapsed before matching.
//
// Primary pattern (with rate):
//   ^(\d+) (.+?) ([\d.]+) (No\.|No|m2|lm|ea|each|item|nr) \$ ([\d,]+\.\d{2}) \$ ([\d,]+\.\d{2})$
//
// Secondary pattern (total only, no explicit rate):
//   ^(\d+) (.+?) ([\d.]+) (No\.|No|m2|lm|ea|each|item|nr) \$ ([\d,]+\.\d{2})$
//
// Tertiary pattern (just description + trailing dollar total):
//   ^(\d+) (.+?) \$ ([\d,]+\.\d{2})$
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

const EXCLUDE_TOTAL_LABELS = [
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
  // HOTFIX: collapse all whitespace sequences to single space before matching
  const line = rawLine.replace(/\s+/g, ' ').trim();

  // Must start with a line number
  if (!/^\d{1,3}\s/.test(line)) return { item: null, byOthers: false };

  // Check "By others" — keep informationally but exclude from priced rows
  if (BY_OTHERS_RE.test(line)) {
    return { item: null, byOthers: true };
  }

  // Exclude total label rows
  if (EXCLUDE_TOTAL_LABELS.some(re => re.test(line))) {
    return { item: null, byOthers: false };
  }

  const sizeMatch = line.match(/\b(\d{2,4}mm|\d+[Xx]\d+|DN\d+)\b/i);
  const size = sizeMatch ? sizeMatch[1] : '';
  const serviceTypeMatch = line.match(/\b(cable|pipe|duct|conduit|penetration|firestopping|intumescent|collar|wrap|pillow|seal)\b/i);
  const serviceType = serviceTypeMatch ? serviceTypeMatch[1].toLowerCase() : '';

  // --- Primary: full row with qty + unit + rate + total ---
  let m = line.match(ROW_FULL_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, rateRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return { item: null, byOthers: false };
    return {
      item: {
        line_id: lineId,
        block_id: blockId,
        service: desc.split(' ')[0] ?? '',
        service_type: serviceType,
        size,
        description: desc.trim(),
        qty: parseFloat(qtyRaw) || 1,
        unit: normaliseUnit(unitRaw),
        rate: parseMoney(rateRaw),
        total,
        scope_category: scopeCategory,
        page_number: pageNum,
        source: 'structured_page_parser',
      },
      byOthers: false,
    };
  }

  // --- Secondary: qty + unit + total (no separate rate column) ---
  m = line.match(ROW_NO_RATE_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    const qty = parseFloat(qtyRaw) || 1;
    if (total === 0) return { item: null, byOthers: false };
    return {
      item: {
        line_id: lineId,
        block_id: blockId,
        service: desc.split(' ')[0] ?? '',
        service_type: serviceType,
        size,
        description: desc.trim(),
        qty,
        unit: normaliseUnit(unitRaw),
        rate: total / qty,
        total,
        scope_category: scopeCategory,
        page_number: pageNum,
        source: 'structured_page_parser',
      },
      byOthers: false,
    };
  }

  // --- Tertiary: just description + trailing dollar total (lump sum) ---
  m = line.match(ROW_TOTAL_ONLY_RE);
  if (m) {
    const [, lineId, desc, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return { item: null, byOthers: false };
    return {
      item: {
        line_id: lineId,
        block_id: blockId,
        service: desc.split(' ')[0] ?? '',
        service_type: serviceType,
        size,
        description: desc.trim(),
        qty: 1,
        unit: 'item',
        rate: total,
        total,
        scope_category: scopeCategory,
        page_number: pageNum,
        source: 'structured_page_parser',
      },
      byOthers: false,
    };
  }

  return { item: null, byOthers: false };
}

// ---------------------------------------------------------------------------
// Parse single page
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
    if (blockMatch) {
      currentBlockId = `B${blockMatch[1]}`;
    }

    if (OPTIONAL_SECTION_RE.test(line)) {
      scopeCategory = 'optional';
    }

    // Only attempt rows that start with a digit
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
// Block + document totals
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

const GRAND_TOTAL_PATTERNS: RegExp[] = [
  /Grand\s+Total\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d][\d\s,]*\.\d{2})/i,
  /Grand\s+Total\s*:?\s*\$?\s*([\d][\d\s,]*\.\d{2})/i,
  /TOTAL\s*\(excl(?:uding)?\.?\s*GST\)\s*:?\s*\$?\s*([\d][\d\s,]*\.\d{2})/i,
  /Contract\s+(?:Sum|Total|Price)\s*:?\s*\$?\s*([\d][\d\s,]*\.\d{2})/i,
  /Quote\s+Total\s*:?\s*\$?\s*([\d][\d\s,]*\.\d{2})/i,
];

function extractGrandTotal(text: string): number | null {
  const flat = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
  let best: number | null = null;
  for (const re of GRAND_TOTAL_PATTERNS) {
    const m = flat.match(re);
    if (m) {
      const val = parseMoney(m[1]);
      if (val > 0 && (best === null || val > best)) best = val;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function runPageStructuredParser(pages: string[]): PageParseResult {
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

  // Step 8: fallback triggered when zero rows parsed
  const fallback_triggered = allItems.length === 0;

  console.log(`[StructuredPageParser] rows_detected=${total_rows_detected} rows_parsed=${total_rows_parsed} rows_failed=${total_rows_failed} rows_excluded_by_others=${total_rows_excluded_by_others}`);
  if (fallback_triggered) {
    console.warn('[StructuredPageParser] Zero rows parsed — fallback_triggered=true, delegating to LLM pipeline');
  }

  const baseItems = allItems.filter(i => i.scope_category === 'base');
  const optionalItems = allItems.filter(i => i.scope_category === 'optional');
  const baseTotal = baseItems.reduce((s, i) => s + i.total, 0);
  const optionalTotal = optionalItems.reduce((s, i) => s + i.total, 0);

  const combinedText = pages.join('\n\n');
  const documentTotal = extractGrandTotal(combinedText);
  const blockTotals = extractPageBlockTotals(pages);
  const structuredPages = pages.filter(p => isStructuredSchedulePage(p)).length;

  let matches_document = true;
  let variance = 0;
  let risk: 'OK' | 'HIGH' = 'OK';
  let message: string | undefined;

  if (documentTotal && documentTotal > 0 && baseTotal > 0) {
    variance = Math.abs(documentTotal - baseTotal) / documentTotal;
    matches_document = variance <= 0.02;
    if (!matches_document) {
      risk = 'HIGH';
      message = `Base total $${baseTotal.toFixed(2)} vs document total $${documentTotal.toFixed(2)} — ${(variance * 100).toFixed(1)}% variance`;
    }
  }

  return {
    mode: 'structured_page_parser',
    items: allItems,
    base_total: baseTotal,
    optional_total: optionalTotal,
    document_total: documentTotal,
    block_totals: blockTotals,
    validation: { matches_document, variance, risk, message },
    page_count: pages.length,
    structured_pages: structuredPages,
    diagnostics: {
      rows_detected: total_rows_detected,
      rows_parsed: total_rows_parsed,
      rows_failed: total_rows_failed,
      rows_excluded_by_others: total_rows_excluded_by_others,
    },
    fallback_triggered,
  };
}
