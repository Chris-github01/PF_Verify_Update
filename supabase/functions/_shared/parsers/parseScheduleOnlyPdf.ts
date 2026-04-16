// =============================================================================
// PARSER: schedule_only_pdf
//
// For documents with numbered schedule rows but NO authoritative summary page.
// Totals are derived from row summation — no summary dependency.
// =============================================================================

import type { PageData } from '../documentClassifier.ts';
import type { RawParserOutput, ParsedLineItem } from '../parseResolutionLayerV3.ts';

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
const ROW_NO_DOLLAR_RE = new RegExp(
  `^(\\d{1,3})\\s+(.+?)\\s+([\\d.]+)\\s+(${UNIT_ALT})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})$`,
  'i',
);

const BY_OTHERS_RE = /\bby\s+others\b/i;
const OPTIONAL_RE = /\b(OPTIONAL|ADD\s+TO\s+SCOPE|OPTIONAL\s+EXTRAS|PROVISIONAL\s+SUM|PC\s+SUM)\b/i;
const EXCLUDE_RE = [
  /^\$\s*[-–]$/, /^-+$/, /^n\/?a$/i,
  /not\s+in\s+contract/i,
];
const SECTION_RE = /\bBLOCK\s*B?(\d+)\b|\bLEVEL\s+(\d+)\b|\bZONE\s+([A-Z0-9]+)\b|\bSTAGE\s+(\d+)\b|\bSECTION\s+([A-Z0-9]+)\b/i;

function parseMoney(raw: string): number {
  const v = parseFloat(raw.replace(/[$,\s]/g, ''));
  return isNaN(v) ? 0 : v;
}

function normaliseUnit(raw: string): string {
  const u = raw.toLowerCase().trim().replace(/\.$/, '');
  const map: Record<string, string> = {
    no: 'ea', ea: 'ea', each: 'ea', nr: 'ea', item: 'ea',
    m: 'lm', lm: 'lm', m2: 'm2', sqm: 'm2',
  };
  return map[u] ?? u;
}

function parseRow(rawLine: string, section: string, scope: 'base' | 'optional', pageNum: number): ParsedLineItem | null {
  const line = rawLine.replace(/\s+/g, ' ').trim();
  if (!/^\d{1,3}\s/.test(line)) return null;
  if (BY_OTHERS_RE.test(line)) return null;
  if (EXCLUDE_RE.some(re => re.test(line))) return null;

  const effectiveScope = OPTIONAL_RE.test(line) ? 'optional' : scope;

  let m = line.match(ROW_FULL_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, rateRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return null;
    return { lineId, section, description: desc.trim(), qty: parseFloat(qtyRaw) || 1, unit: normaliseUnit(unitRaw), rate: parseMoney(rateRaw), total, scopeCategory: effectiveScope, pageNum, confidence: 1.0, source: 'schedule_only_pdf' };
  }

  m = line.match(ROW_NO_DOLLAR_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, rateRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return null;
    return { lineId, section, description: desc.trim(), qty: parseFloat(qtyRaw) || 1, unit: normaliseUnit(unitRaw), rate: parseMoney(rateRaw), total, scopeCategory: effectiveScope, pageNum, confidence: 0.95, source: 'schedule_only_pdf' };
  }

  m = line.match(ROW_NO_RATE_RE);
  if (m) {
    const [, lineId, desc, qtyRaw, unitRaw, totalRaw] = m;
    const total = parseMoney(totalRaw);
    const qty = parseFloat(qtyRaw) || 1;
    if (total === 0) return null;
    return { lineId, section, description: desc.trim(), qty, unit: normaliseUnit(unitRaw), rate: total / qty, total, scopeCategory: effectiveScope, pageNum, confidence: 0.90, source: 'schedule_only_pdf' };
  }

  m = line.match(ROW_TOTAL_ONLY_RE);
  if (m) {
    const [, lineId, desc, totalRaw] = m;
    const total = parseMoney(totalRaw);
    if (total === 0) return null;
    return { lineId, section, description: desc.trim(), qty: 1, unit: 'item', rate: total, total, scopeCategory: effectiveScope, pageNum, confidence: 0.75, source: 'schedule_only_pdf' };
  }

  return null;
}

export function parseScheduleOnlyPdf(pages: PageData[]): RawParserOutput {
  const items: ParsedLineItem[] = [];
  let currentSection = 'UNKNOWN';
  let scopeCategory: 'base' | 'optional' = 'base';
  let rowsDetected = 0;
  let rowsParsed = 0;
  let rowsFailed = 0;
  let rowsByOthers = 0;

  for (const page of pages) {
    const lines = page.text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const sec = line.replace(/\s+/g, ' ').match(SECTION_RE);
      if (sec) {
        const id = sec[1] ?? sec[2] ?? sec[3] ?? sec[4] ?? sec[5];
        currentSection = `SEC${id}`;
      }
      if (OPTIONAL_RE.test(line)) scopeCategory = 'optional';
      if (!/^\d{1,3}[\s]/.test(line.trimStart())) continue;

      rowsDetected++;
      if (BY_OTHERS_RE.test(line)) { rowsByOthers++; continue; }

      const item = parseRow(line, currentSection, scopeCategory, page.pageNum);
      if (item) { items.push(item); rowsParsed++; }
      else rowsFailed++;
    }
  }

  const baseItems = items.filter(i => i.scopeCategory === 'base');
  const optionalItems = items.filter(i => i.scopeCategory === 'optional');
  const rowBaseSum = baseItems.reduce((s, i) => s + i.total, 0);
  const rowOptionalSum = optionalItems.reduce((s, i) => s + i.total, 0);

  return {
    parserUsed: 'parseScheduleOnlyPdf',
    allItems: items,
    totals: {
      grandTotal: rowBaseSum,
      optionalTotal: rowOptionalSum,
      subTotal: null,
      rowSum: rowBaseSum,
      source: 'row_sum',
    },
    summaryDetected: false,
    optionalScopeDetected: optionalItems.length > 0,
    parserReasons: [
      `Rows detected: ${rowsDetected}`,
      `Rows parsed: ${rowsParsed}`,
      `Rows failed: ${rowsFailed}`,
      `By others excluded: ${rowsByOthers}`,
      `Total derived from row summation`,
    ],
    rawSummary: null,
  };
}
