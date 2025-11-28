const TOTAL_PATTERNS = [
  /\b(sub[-\s]?total|subtotal)\b/i,
  /\b(grand[-\s]?total)\b/i,
  /\b(section[-\s]?total)\b/i,
  /\b(block[-\s]?total)\b/i,
  /\b(page[-\s]?total)\b/i,
  /\b(summary)\b/i,
  /\b(cumulative)\b/i,
  /\b(sum[-\s]?of|total[-\s]?for)\b/i,
  /\b(carried[-\s]?forward)\b/i,
  /\b(brought[-\s]?forward)\b/i,
  /\b(c\/f|b\/f)\b/i,
  /^total$/i,
  /^totals$/i,
  /\btotal\s*:\s*\$/i,
];

const HEADER_PATTERNS = [
  /\b(item|description|qty|quantity|rate|unit|price|amount|total)\b/i,
  /\b(service|size|substrate|section)\b/i,
  /^$/,
];

const EXCLUSION_PATTERNS = [
  /\b(excluded|omitted|not[-\s]?included)\b/i,
  /\b(alternate|alternative|option)\b/i,
];

const CONTINGENCY_PATTERNS = [
  /\b(contingency|allowance|provisional)\b/i,
  /\b(provisional[-\s]?sum)\b/i,
  /\b(cost[-\s]?increase|escalation)\b/i,
  /\b(price[-\s]?adjustment)\b/i,
];

export interface RawLineItem {
  description: string;
  qty?: number | string;
  unit?: string;
  rate?: number | string;
  total?: number | string;
  line_total?: number | string;
  section?: string;
  block?: string;
  service?: string;
  size?: string;
  substrate?: string;
  page_ref?: number;
}

export function normalizeString(s: string | undefined | null): string {
  if (!s) return '';
  return s.toString().replace(/\s+/g, ' ').trim().toLowerCase();
}

export function parseMoney(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;

  let s = value.toString().trim();

  s = s.replace(/\u00a0/g, '');
  s = s.replace(/[$NZD]/gi, '');
  s = s.trim();

  if (!s || s === '-' || s === '') return 0;

  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,(?=\d{3}\b)/g, '');
    s = s.replace(/,/g, '');
  }

  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
}

export function parseQuantity(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;

  let s = value.toString().trim();
  s = s.replace(/\u00a0/g, '');
  s = s.replace(/,/g, '');

  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
}

export function isTotalRow(row: RawLineItem): boolean {
  const desc = normalizeString(row.description);

  return TOTAL_PATTERNS.some(pattern => pattern.test(desc));
}

export function isHeaderRow(row: RawLineItem): boolean {
  const desc = normalizeString(row.description);

  if (desc.length < 3) return true;

  if (HEADER_PATTERNS.some(pattern => pattern.test(desc))) {
    const qty = parseQuantity(row.qty);
    const rate = parseMoney(row.rate);
    const total = parseMoney(row.total || row.line_total);

    if (qty === 0 && rate === 0 && total === 0) {
      return true;
    }
  }

  return false;
}

export function isExclusionRow(row: RawLineItem): boolean {
  const desc = normalizeString(row.description);
  return EXCLUSION_PATTERNS.some(pattern => pattern.test(desc));
}

export function isContingencyRow(row: RawLineItem): boolean {
  const desc = normalizeString(row.description);
  return CONTINGENCY_PATTERNS.some(pattern => pattern.test(desc));
}

export function hasNegativeIndicator(row: RawLineItem): boolean {
  const desc = normalizeString(row.description);
  return /\b(minus|less|discount|credit|deduct|allowance)\b/i.test(desc);
}

export function shouldExcludeRow(row: RawLineItem): boolean {
  if (isTotalRow(row)) {
    console.log(`Excluding total row: "${row.description}"`);
    return true;
  }

  if (isHeaderRow(row)) {
    console.log(`Excluding header row: "${row.description}"`);
    return true;
  }

  if (isExclusionRow(row)) {
    console.log(`Excluding marked exclusion: "${row.description}"`);
    return true;
  }

  if (isContingencyRow(row)) {
    console.log(`Excluding contingency/allowance: "${row.description}"`);
    return true;
  }

  const desc = normalizeString(row.description);
  if (desc.length === 0) {
    console.log('Excluding empty description');
    return true;
  }

  return false;
}

export function generateRowKey(row: RawLineItem): string {
  const parts = [
    normalizeString(row.block),
    normalizeString(row.section),
    normalizeString(row.service),
    normalizeString(row.description),
    normalizeString(row.size),
    normalizeString(row.substrate),
    normalizeString(row.unit),
    parseQuantity(row.qty).toFixed(6),
    parseMoney(row.rate).toFixed(4),
  ];

  return parts.join('|');
}

export function reconcileLineTotal(row: RawLineItem): number {
  const lineTotal = parseMoney(row.line_total || row.total);

  if (lineTotal !== 0) {
    const qty = parseQuantity(row.qty);
    const rate = parseMoney(row.rate);

    if (qty !== 0 && rate !== 0) {
      const calculated = qty * rate;
      const diff = Math.abs(lineTotal - calculated);
      const tolerance = Math.max(calculated * 0.01, 0.01);

      if (diff > tolerance) {
        console.warn(
          `Line total mismatch: "${row.description}" - ` +
          `calculated ${calculated.toFixed(2)} vs stated ${lineTotal.toFixed(2)}`
        );
      }
    }

    return lineTotal;
  }

  const qty = parseQuantity(row.qty);
  const rate = parseMoney(row.rate);
  return qty * rate;
}

export function deduplicateRows(rows: RawLineItem[]): RawLineItem[] {
  const seen = new Set<string>();
  const unique: RawLineItem[] = [];

  for (const row of rows) {
    const key = generateRowKey(row);

    if (seen.has(key)) {
      console.log(`Duplicate row detected (skipping): "${row.description}"`);
      continue;
    }

    seen.add(key);
    unique.push(row);
  }

  console.log(`Deduplicated: ${rows.length} rows → ${unique.length} unique rows`);
  return unique;
}

export interface FilteredResult {
  validRows: RawLineItem[];
  excludedRows: RawLineItem[];
  duplicateCount: number;
  totalExcluded: number;
}

export function filterAndDeduplicateRows(rows: RawLineItem[]): FilteredResult {
  console.log(`Starting with ${rows.length} raw rows`);

  const nonExcluded: RawLineItem[] = [];
  const excludedRows: RawLineItem[] = [];

  for (const row of rows) {
    if (shouldExcludeRow(row)) {
      excludedRows.push(row);
    } else {
      nonExcluded.push(row);
    }
  }

  console.log(`After filtering: ${nonExcluded.length} rows (excluded ${excludedRows.length})`);

  const initialCount = nonExcluded.length;
  const validRows = deduplicateRows(nonExcluded);
  const duplicateCount = initialCount - validRows.length;

  return {
    validRows,
    excludedRows,
    duplicateCount,
    totalExcluded: excludedRows.length,
  };
}

export function validateArithmetic(rows: RawLineItem[]): string[] {
  const warnings: string[] = [];

  for (const row of rows) {
    const qty = parseQuantity(row.qty);
    const rate = parseMoney(row.rate);
    const stated = parseMoney(row.total || row.line_total);

    if (qty === 0 || rate === 0) {
      if (stated === 0) continue;
      warnings.push(
        `"${row.description}": Has total ${stated.toFixed(2)} but qty or rate is zero`
      );
      continue;
    }

    const calculated = qty * rate;
    const diff = Math.abs(stated - calculated);
    const tolerance = Math.max(calculated * 0.01, 0.01);

    if (diff > tolerance) {
      warnings.push(
        `"${row.description}": qty(${qty}) × rate(${rate.toFixed(2)}) = ${calculated.toFixed(2)}, ` +
        `but stated total is ${stated.toFixed(2)} (diff: $${diff.toFixed(2)})`
      );
    }
  }

  return warnings;
}

export function calculateTotal(rows: RawLineItem[]): number {
  return rows.reduce((sum, row) => sum + reconcileLineTotal(row), 0);
}
