// =============================================================================
// PARSER: spreadsheet_boq
//
// For xlsx / csv structured columns.
// Deterministic column mapping — no OCR / PDF logic.
// Columns are identified by header row scanning.
// =============================================================================

import type { RawParserOutput, ParsedLineItem } from '../parseResolutionLayerV3.ts';

export interface SpreadsheetRow {
  [key: string]: string | number | null | undefined;
}

// ---------------------------------------------------------------------------
// Column header matching — generic, not vendor-specific
// ---------------------------------------------------------------------------

type ColType = 'description' | 'qty' | 'unit' | 'rate' | 'total' | 'section' | 'lineId' | 'skip';

const COL_PATTERNS: Array<{ type: ColType; patterns: RegExp[] }> = [
  {
    type: 'lineId',
    patterns: [/^(line\s*)?#?item\s*no\.?$/i, /^(line|item)\s*id$/i, /^no\.?$/i, /^#$/],
  },
  {
    type: 'description',
    patterns: [/description/i, /item\s*description/i, /scope/i, /work\s*item/i, /detail/i, /activity/i],
  },
  {
    type: 'qty',
    patterns: [/^qty$/i, /^quantity$/i, /^no\.\s*of/i, /^count$/i, /^amount$/i],
  },
  {
    type: 'unit',
    patterns: [/^unit$/i, /^uom$/i, /^measure$/i],
  },
  {
    type: 'rate',
    patterns: [/^rate$/i, /^unit\s*rate$/i, /^unit\s*price$/i, /^price\s*\/\s*unit$/i, /^cost\s*\/\s*unit$/i],
  },
  {
    type: 'total',
    patterns: [/^total$/i, /^total\s*price$/i, /^total\s*amount$/i, /^amount$/i, /^extended$/i, /^line\s*total$/i, /^value$/i],
  },
  {
    type: 'section',
    patterns: [/^section$/i, /^block$/i, /^zone$/i, /^level$/i, /^stage$/i, /^category$/i, /^trade$/i],
  },
];

function detectColumnType(header: string): ColType {
  const h = String(header).trim();
  for (const { type, patterns } of COL_PATTERNS) {
    if (patterns.some(re => re.test(h))) return type;
  }
  return 'skip';
}

interface ColumnMap {
  description: number | null;
  qty: number | null;
  unit: number | null;
  rate: number | null;
  total: number | null;
  section: number | null;
  lineId: number | null;
}

function buildColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {
    description: null, qty: null, unit: null,
    rate: null, total: null, section: null, lineId: null,
  };
  for (let i = 0; i < headers.length; i++) {
    const type = detectColumnType(headers[i]);
    if (type !== 'skip' && map[type] === null) {
      map[type] = i;
    }
  }
  return map;
}

function getCell(row: (string | number | null | undefined)[], idx: number | null): string {
  if (idx === null || idx >= row.length) return '';
  return String(row[idx] ?? '').trim();
}

function parseMoney(raw: string): number {
  const v = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(v) ? 0 : v;
}

const OPTIONAL_RE = /\b(OPTIONAL|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS|PROVISIONAL|PC\s+SUM)\b/i;
const BY_OTHERS_RE = /\bby\s+others\b/i;
const GRAND_TOTAL_DESC_RE = /^(grand\s+total|total\s+price|contract\s+total|quote\s+total)/i;

function normaliseUnit(raw: string): string {
  const u = raw.toLowerCase().trim().replace(/\.$/, '');
  const map: Record<string, string> = {
    no: 'ea', ea: 'ea', each: 'ea', nr: 'ea', item: 'ea',
    m: 'lm', lm: 'lm', m2: 'm2', sqm: 'm2',
    sum: 'sum', ls: 'sum', allow: 'allow', allowance: 'allow',
  };
  return (map[u] ?? u) || 'ea';
}

// ---------------------------------------------------------------------------
// Main parser — accepts raw 2D array (rows × cols)
// ---------------------------------------------------------------------------

export function parseSpreadsheetBoq(
  rawRows: (string | number | null | undefined)[][],
): RawParserOutput {
  const items: ParsedLineItem[] = [];
  let grandTotal: number | null = null;
  let optionalTotal: number | null = null;
  let currentSection = 'MAIN';
  let scopeCategory: 'base' | 'optional' = 'base';
  let lineIdCounter = 1;
  let colMap: ColumnMap | null = null;

  for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
    const row = rawRows[rowIdx];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] ?? '').trim().toLowerCase();

    // Detect header row (first row with "description" or "item" header)
    if (colMap === null) {
      const headers = row.map(c => String(c ?? ''));
      const mapped = buildColumnMap(headers);
      if (mapped.description !== null || mapped.total !== null) {
        colMap = mapped;
        continue;
      }
      // Skip non-header rows before we find a header
      continue;
    }

    const desc = getCell(row, colMap.description);
    if (!desc) continue;
    if (BY_OTHERS_RE.test(desc)) continue;

    // Detect scope transition row
    if (OPTIONAL_RE.test(desc) && !getCell(row, colMap.total)) {
      scopeCategory = 'optional';
      currentSection = desc;
      continue;
    }

    // Detect section header rows (non-priced)
    const totalRaw = getCell(row, colMap.total);
    const totalVal = parseMoney(totalRaw);

    if (GRAND_TOTAL_DESC_RE.test(desc)) {
      grandTotal = totalVal || grandTotal;
      continue;
    }
    if (/optional\s+(scope|total|extras)/i.test(desc) && totalVal > 0) {
      optionalTotal = totalVal;
      continue;
    }

    if (!totalRaw || totalVal === 0) {
      // May be a section header
      if (desc.length > 2) currentSection = desc;
      continue;
    }

    const qtyRaw = getCell(row, colMap.qty);
    const unitRaw = getCell(row, colMap.unit);
    const rateRaw = getCell(row, colMap.rate);
    const lineIdRaw = getCell(row, colMap.lineId);
    const sectionRaw = getCell(row, colMap.section);

    const qty = parseFloat(qtyRaw.replace(/,/g, '')) || 1;
    const rate = parseMoney(rateRaw) || (totalVal / qty);
    const effectiveScope: 'base' | 'optional' = OPTIONAL_RE.test(desc) ? 'optional' : scopeCategory;

    items.push({
      lineId: lineIdRaw || String(lineIdCounter++),
      section: sectionRaw || currentSection,
      description: desc,
      qty,
      unit: normaliseUnit(unitRaw),
      rate,
      total: totalVal,
      scopeCategory: effectiveScope,
      pageNum: 0,
      confidence: 1.0,
      source: 'spreadsheet_boq',
    });
  }

  const baseItems = items.filter(i => i.scopeCategory === 'base');
  const optItems = items.filter(i => i.scopeCategory === 'optional');
  const rowBaseSum = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptSum = optItems.reduce((s, i) => s + i.total, 0);

  return {
    parserUsed: 'parseSpreadsheetBoq',
    allItems: items,
    totals: {
      grandTotal: grandTotal ?? rowBaseSum,
      optionalTotal: optionalTotal ?? rowOptSum,
      subTotal: null,
      rowSum: rowBaseSum,
      source: grandTotal !== null ? 'summary_page' : 'row_sum',
    },
    summaryDetected: grandTotal !== null,
    optionalScopeDetected: optionalTotal !== null || optItems.length > 0,
    parserReasons: [
      `Spreadsheet parsed: ${items.length} items`,
      `Column map: desc=${colMap?.description} qty=${colMap?.qty} unit=${colMap?.unit} rate=${colMap?.rate} total=${colMap?.total}`,
    ],
    rawSummary: null,
  };
}
