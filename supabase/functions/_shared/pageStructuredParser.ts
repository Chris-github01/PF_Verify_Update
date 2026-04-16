// =============================================================================
// PAGE-FIRST STRUCTURED PARSER  (Parser Mode A: StructuredPageParser)
//
// Designed for structured schedule PDFs where each page contains a properly
// formatted pricing table (e.g. Summerset Milldale firestopping schedules).
//
// Pipeline position: BEFORE chunking — replaces chunked LLM parsing entirely
// for qualifying documents.
// =============================================================================

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
}

// ---------------------------------------------------------------------------
// Step 1 — Detect structured schedule pages
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

export function classifyPages(pages: string[]): boolean[] {
  return pages.map(p => isStructuredSchedulePage(p));
}

/**
 * Returns true if the document qualifies for the structured parser:
 * at least 50% of pages (or at least 2) look like schedule pages.
 */
export function documentQualifiesForStructuredParser(pages: string[]): boolean {
  if (pages.length === 0) return false;
  const classifications = classifyPages(pages);
  const structuredCount = classifications.filter(Boolean).length;
  return structuredCount >= 2 || structuredCount / pages.length >= 0.5;
}

// ---------------------------------------------------------------------------
// Step 3 — Detect block header on a page
// ---------------------------------------------------------------------------

const BLOCK_HEADER_RE = /\bBLOCK\s*B?(\d+)\b/i;

function extractPageBlockId(pageText: string): string | null {
  const m = pageText.match(BLOCK_HEADER_RE);
  return m ? `B${m[1]}` : null;
}

// ---------------------------------------------------------------------------
// Step 7 — Detect optional scope section transition
// ---------------------------------------------------------------------------

const OPTIONAL_SECTION_RE = /\b(OPTIONAL\s+SCOPE|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS)\b/i;

function lineIsOptionalHeader(line: string): boolean {
  return OPTIONAL_SECTION_RE.test(line);
}

// ---------------------------------------------------------------------------
// Step 6 — Non-priced row exclusion patterns
// ---------------------------------------------------------------------------

const EXCLUDE_DESC_RE = [
  /^by\s+others\b/i,
  /^\$\s*[-–]\s*$/,
  /^-+$/,
  /^n\/?a$/i,
  /not\s+in\s+contract/i,
  /not\s+part\s+of\s+passive\s+fire/i,
  /services\s+identified\s+not\s+part/i,
];

function isExcludedRow(description: string, total: number): boolean {
  if (total === 0 && description.trim() === '') return true;
  return EXCLUDE_DESC_RE.some(re => re.test(description.trim()));
}

// ---------------------------------------------------------------------------
// Column parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a monetary string: "$1,234.56" / "1234.56" / "1 234.56" → number
 */
function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[,$\s]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * Parse a quantity — may be integer or decimal
 */
function parseQty(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim();
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * Normalize common unit strings
 */
function normaliseUnit(raw: string): string {
  const u = raw.toLowerCase().trim();
  const map: Record<string, string> = {
    no: 'ea', 'no.': 'ea', ea: 'ea', each: 'ea', nr: 'ea', item: 'ea',
    m: 'lm', lm: 'lm',
    'm2': 'm2', sqm: 'm2',
  };
  return map[u] ?? u;
}

// ---------------------------------------------------------------------------
// Step 4 + 5 — Parse numbered line rows from a single page
//
// Firestopping schedule column layout (tab / large-space separated):
//   LINE_ID  SERVICE  SERVICE_TYPE  SIZE  DESCRIPTION  QTY  UNIT  RATE  TOTAL
//
// The extractor collapses PDF text items into lines using Y-position grouping.
// Columns are separated by variable whitespace (2+ spaces or tabs).
// ---------------------------------------------------------------------------

const LINE_ID_RE = /^(\d{1,3})\s+/;

// Matches a monetary total at the end of the row: e.g. "1,234.56" or "61490"
const TRAILING_MONEY_RE = /\$?([\d,]+(?:\.\d{2})?)$/;

// Rate pattern — a number that looks like a unit rate (may have decimals)
const RATE_RE = /\$?([\d,]+(?:\.\d+)?)$/;

/**
 * Split a line into tokens using 2+ consecutive spaces or tabs as delimiter.
 * Falls back to single-space split if fewer than 4 tokens produced.
 */
function tokenizeLine(line: string): string[] {
  let tokens = line.split(/\s{2,}|\t/).map(t => t.trim()).filter(Boolean);
  if (tokens.length < 3) {
    tokens = line.trim().split(/\s+/);
  }
  return tokens;
}

/**
 * Attempt to parse a structured row. Returns null if the line doesn't look
 * like a valid numbered line item.
 */
function parseStructuredRow(
  line: string,
  currentBlockId: string,
  scopeCategory: 'base' | 'optional',
  pageNum: number,
): StructuredPageItem | null {
  const lineMatch = line.match(LINE_ID_RE);
  if (!lineMatch) return null;

  const lineId = lineMatch[1];
  const rest = line.slice(lineMatch[0].length).trim();

  if (!rest) return null;

  const tokens = tokenizeLine(rest);

  if (tokens.length < 2) return null;

  // The total is always the last token that looks like money
  const lastToken = tokens[tokens.length - 1];
  const totalMatch = lastToken.match(TRAILING_MONEY_RE);
  if (!totalMatch) {
    // If last token doesn't look like money at all, skip
    const looksNumeric = /^[\d,]+(\.\d+)?$/.test(lastToken.replace(/\$/g, ''));
    if (!looksNumeric) return null;
  }
  const total = parseMoney(lastToken);

  // Rate is second-to-last if it looks like a number
  let rate = 0;
  let unit = 'ea';
  let qty = 0;
  let descTokens: string[] = [];

  if (tokens.length >= 4) {
    const rateRaw = tokens[tokens.length - 2];
    const unitRaw = tokens[tokens.length - 3];
    const qtyRaw = tokens[tokens.length - 4];

    const rateVal = parseMoney(rateRaw);
    const qtyVal = parseQty(qtyRaw);

    if (rateVal > 0 && qtyVal > 0) {
      rate = rateVal;
      qty = qtyVal;
      unit = normaliseUnit(unitRaw);
      descTokens = tokens.slice(0, tokens.length - 4);
    } else {
      // Fallback: treat whole middle section as description
      descTokens = tokens.slice(0, tokens.length - 1);
    }
  } else {
    descTokens = tokens.slice(0, tokens.length - 1);
  }

  const description = descTokens.join(' ').trim();
  if (!description && total === 0) return null;

  // Step 6: exclude non-priced rows
  if (isExcludedRow(description, total)) return null;

  // Extract service type and size from description heuristically
  const sizeMatch = description.match(/\b(\d{2,4}mm|\d+[Xx]\d+|DN\d+)\b/i);
  const size = sizeMatch ? sizeMatch[1] : '';

  const serviceTypeMatch = description.match(/\b(cable|pipe|duct|conduit|penetration|firestopping|intumescent|collar|wrap|pillow|seal)\b/i);
  const serviceType = serviceTypeMatch ? serviceTypeMatch[1].toLowerCase() : '';

  // Service = first meaningful word
  const service = descTokens[0] ?? '';

  return {
    line_id: lineId,
    block_id: currentBlockId,
    service,
    service_type: serviceType,
    size,
    description: description || `Line ${lineId}`,
    qty: qty || 1,
    unit,
    rate,
    total,
    scope_category: scopeCategory,
    page_number: pageNum,
    source: 'structured_page_parser',
  };
}

// ---------------------------------------------------------------------------
// Step 2 + 3 + 4 — Parse a single page independently
// ---------------------------------------------------------------------------

export function parsePage(
  pageText: string,
  pageNum: number,
  inheritedBlockId: string,
): { items: StructuredPageItem[]; lastBlockId: string } {
  const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);
  const items: StructuredPageItem[] = [];

  let currentBlockId = inheritedBlockId;
  let scopeCategory: 'base' | 'optional' = 'base';

  for (const line of lines) {
    // Step 3: detect block header — update current block for all following rows
    const blockMatch = line.match(BLOCK_HEADER_RE);
    if (blockMatch) {
      currentBlockId = `B${blockMatch[1]}`;
    }

    // Step 7: detect optional scope section transition
    if (lineIsOptionalHeader(line)) {
      scopeCategory = 'optional';
    }

    // Step 4: only attempt parsing of numbered line rows
    const item = parseStructuredRow(line, currentBlockId, scopeCategory, pageNum);
    if (item) {
      items.push(item);
    }
  }

  return { items, lastBlockId: currentBlockId };
}

// ---------------------------------------------------------------------------
// Step 9 — Validate by block totals
// ---------------------------------------------------------------------------

function extractPageBlockTotals(pages: string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  // Pattern: "BLOCK B30 TOTAL   $12,345.67" or "Total Block 30   12345.67"
  const BLOCK_TOTAL_RE = /BLOCK\s*B?(\d+)\s+(?:TOTAL|SUB[- ]?TOTAL)\s*:?\s*\$?([\d,]+(?:\.\d{2})?)/gi;

  for (const page of pages) {
    const flat = page.replace(/[\r\n]+/g, ' ');
    let m: RegExpExecArray | null;
    while ((m = BLOCK_TOTAL_RE.exec(flat)) !== null) {
      const key = `B${m[1]}`;
      const val = parseMoney(m[2]);
      if (val > 0) totals[key] = val;
    }
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Step 9 (document total from raw text)
// ---------------------------------------------------------------------------

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
// Step 10 + 11 — Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the structured page parser against an array of per-page text strings.
 *
 * @param pages     Array of page text strings (one entry per PDF page)
 * @returns         PageParseResult with structured items and validation
 */
export function runPageStructuredParser(pages: string[]): PageParseResult {
  const allItems: StructuredPageItem[] = [];
  let lastBlockId = 'UNKNOWN';

  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    // Step 1: only parse structured schedule pages
    if (!isStructuredSchedulePage(pages[i])) {
      continue;
    }

    const { items, lastBlockId: newBlock } = parsePage(pages[i], pageNum, lastBlockId);
    lastBlockId = newBlock;
    allItems.push(...items);
  }

  // Split base / optional (Step 8 — no identity dedup here, raw rows preserved)
  const baseItems = allItems.filter(i => i.scope_category === 'base');
  const optionalItems = allItems.filter(i => i.scope_category === 'optional');

  const baseTotal = baseItems.reduce((s, i) => s + i.total, 0);
  const optionalTotal = optionalItems.reduce((s, i) => s + i.total, 0);

  // Document total (Step 10)
  const combinedText = pages.join('\n\n');
  const documentTotal = extractGrandTotal(combinedText);

  // Block totals from page summary rows (Step 9)
  const blockTotals = extractPageBlockTotals(pages);

  // Structured page count
  const structuredPages = pages.filter(p => isStructuredSchedulePage(p)).length;

  // Validation (Step 11)
  let matches_document = true;
  let variance = 0;
  let risk: 'OK' | 'HIGH' = 'OK';
  let message: string | undefined;

  if (documentTotal && documentTotal > 0 && baseTotal > 0) {
    variance = Math.abs(documentTotal - baseTotal) / documentTotal;
    matches_document = variance <= 0.02;
    if (!matches_document) {
      risk = 'HIGH';
      message = `Base total $${baseTotal.toFixed(2)} vs document total $${documentTotal.toFixed(2)} — ${(variance * 100).toFixed(1)}% variance (systemic_miss)`;
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
  };
}
