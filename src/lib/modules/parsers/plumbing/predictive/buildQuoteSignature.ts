import type { QuoteSignature } from './riskTypes';

const TOTAL_PHRASES = [
  'grand total', 'contract sum', 'contract total', 'tender sum', 'quote total',
  'project total', 'total excl gst', 'total incl gst', 'total including gst',
  'final total', 'net total', 'total carried forward', 'invoice total',
  'total amount', 'amount due', 'balance due',
];

const SUBTOTAL_PHRASES = [
  'sub total', 'subtotal', 'section total', 'level total', 'floor total',
  'page total', 'group total', 'trade total',
];

const CARRY_PHRASES = ['carried forward', 'carry forward', 'c/f', 'b/f', 'brought forward'];

const GST_PHRASES = ['gst', 'tax', 'incl gst', 'excl gst', 'plus gst', 'including gst', 'excluding gst'];

interface RowData {
  rawText: string;
  quantity?: number | null;
  unit?: string | null;
  rate?: number | null;
  amount?: number | null;
  rowIndex?: number;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function countPhraseMatches(rows: RowData[], phrases: string[]): number {
  let count = 0;
  for (const row of rows) {
    const normalized = normalizeText(row.rawText);
    for (const phrase of phrases) {
      if (normalized.includes(phrase)) { count++; break; }
    }
  }
  return count;
}

function computeHighValueOutliers(rows: RowData[]): { outliers: number; repeated: number } {
  const amounts = rows.map((r) => r.amount ?? 0).filter((a) => a > 0);
  if (amounts.length === 0) return { outliers: 0, repeated: 0 };

  const sorted = [...amounts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const outlierThreshold = median * 5;

  const outliers = amounts.filter((a) => a > outlierThreshold).length;

  const valueCounts = new Map<number, number>();
  for (const a of amounts) {
    const rounded = Math.round(a / 100) * 100;
    valueCounts.set(rounded, (valueCounts.get(rounded) ?? 0) + 1);
  }
  const repeated = [...valueCounts.values()].filter((c) => c > 1).length;

  return { outliers, repeated };
}

function computeEndOfDocumentRatio(rows: RowData[]): number {
  if (rows.length === 0) return 0;
  const windowSize = Math.max(3, Math.floor(rows.length * 0.10));
  const endRows = rows.slice(-windowSize);
  const endSummaryCount = endRows.filter((r) => {
    const n = normalizeText(r.rawText);
    return TOTAL_PHRASES.some((p) => n.includes(p)) || CARRY_PHRASES.some((p) => n.includes(p));
  }).length;
  return endSummaryCount / windowSize;
}

function computeKeywordComplexity(rows: RowData[]): number {
  let score = 0;
  const allText = rows.map((r) => r.rawText).join(' ');
  const wordCount = allText.split(/\s+/).filter(Boolean).length;
  const uniqueWords = new Set(allText.toLowerCase().split(/\s+/).filter(Boolean)).size;
  const diversityRatio = wordCount > 0 ? uniqueWords / wordCount : 0;
  score += diversityRatio > 0.8 ? 30 : diversityRatio > 0.6 ? 20 : 10;

  const avgDescLen = rows.reduce((sum, r) => sum + r.rawText.length, 0) / Math.max(rows.length, 1);
  score += avgDescLen > 60 ? 20 : avgDescLen > 30 ? 10 : 5;

  return Math.min(100, score);
}

function computeFormattingIrregularity(rows: RowData[]): number {
  let irregularCount = 0;
  for (const row of rows) {
    const hasAmount = row.amount != null && row.amount > 0;
    const hasQty = row.quantity != null && row.quantity > 0;
    const hasRate = row.rate != null && row.rate > 0;
    const hasUnit = !!row.unit?.trim();

    if (hasAmount && !hasQty && !hasRate) irregularCount++;
    else if (hasQty && hasRate && !hasAmount) irregularCount++;
    else if (hasQty && !hasUnit && hasRate) irregularCount += 0.5;
  }
  return rows.length > 0 ? Math.min(100, (irregularCount / rows.length) * 100) : 0;
}

function computeHeaderFooterDensity(rows: RowData[]): number {
  const headerFooterCount = rows.filter((r) => {
    const n = normalizeText(r.rawText);
    const isHeader = r.amount == null && r.quantity == null && r.rate == null && n.length > 5;
    return isHeader;
  }).length;
  return rows.length > 0 ? headerFooterCount / rows.length : 0;
}

export function buildQuoteSignature(
  rows: RowData[],
  opts: {
    orgRecentAnomalyCount?: number;
    priorHighRiskCount?: number;
    knownBadPatternMatches?: string[];
    rawTextSample?: string;
  } = {}
): QuoteSignature {
  const totalRows = rows.length;

  const amountOnlyRows = rows.filter(
    (r) => (r.amount ?? 0) > 0 && !r.quantity && !r.rate
  ).length;

  const missingQtyRows = rows.filter(
    (r) => (r.amount ?? 0) > 0 && !r.quantity
  ).length;

  const missingUnitRows = rows.filter(
    (r) => (r.amount ?? 0) > 0 && !r.unit?.trim()
  ).length;

  const { outliers, repeated } = computeHighValueOutliers(rows);

  return {
    rowCount: totalRows,
    amountOnlyRowCount: amountOnlyRows,
    amountOnlyRatio: totalRows > 0 ? amountOnlyRows / totalRows : 0,
    missingQtyCount: missingQtyRows,
    missingQtyRatio: totalRows > 0 ? missingQtyRows / totalRows : 0,
    missingUnitCount: missingUnitRows,
    missingUnitRatio: totalRows > 0 ? missingUnitRows / totalRows : 0,
    totalPhraseCount: countPhraseMatches(rows, TOTAL_PHRASES),
    subtotalPhraseCount: countPhraseMatches(rows, SUBTOTAL_PHRASES),
    carriedForwardPhraseCount: countPhraseMatches(rows, CARRY_PHRASES),
    highValueOutlierCount: outliers,
    repeatedHighValueCount: repeated,
    gstPhraseCount: countPhraseMatches(rows, GST_PHRASES),
    endOfDocumentSummaryRatio: computeEndOfDocumentRatio(rows),
    headerFooterDensity: computeHeaderFooterDensity(rows),
    keywordComplexityScore: computeKeywordComplexity(rows),
    formattingIrregularityScore: computeFormattingIrregularity(rows),
    knownBadPatternMatches: opts.knownBadPatternMatches ?? [],
    orgRecentAnomalyCount: opts.orgRecentAnomalyCount ?? 0,
    priorHighRiskCount: opts.priorHighRiskCount ?? 0,
    rawTextSample: opts.rawTextSample?.slice(0, 200),
  };
}

export function buildSignatureFromRawText(rawText: string): QuoteSignature {
  const lines = rawText.split('\n').filter((l) => l.trim().length > 0);
  const rows: RowData[] = lines.map((line, i) => {
    const amountMatch = line.match(/[\$]?\s*([\d,]+\.?\d{0,2})\s*$/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    return { rawText: line.trim(), amount, rowIndex: i };
  });
  return buildQuoteSignature(rows);
}
