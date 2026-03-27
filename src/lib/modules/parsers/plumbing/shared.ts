import { classifyAllRows } from './totalRowDetection';
import type { PlumbingSourceRow, PlumbingNormalizedRow } from './types';

export const LIVE_PARSER_VERSION = 'v1';
export const SHADOW_PARSER_VERSION = 'v2-shadow';
export const MODULE_KEY = 'plumbing_parser';

export function toNum(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : null;
  }
  return null;
}

export function normalizeSourceRow(row: PlumbingSourceRow, index: number) {
  return {
    rowIndex: index,
    rawText: String(row.description ?? row.desc ?? row.item ?? ''),
    quantity: toNum(row.qty ?? row.quantity),
    unit: (row.unit as string | null) ?? null,
    rate: toNum(row.rate ?? row.unit_rate),
    amount: toNum(row.total ?? row.total_price ?? row.amount),
  };
}

export function classifyRows(
  rows: PlumbingSourceRow[],
  documentTotal?: number | null
): PlumbingNormalizedRow[] {
  const normalized = rows.map((r, i) => normalizeSourceRow(r, i));
  const classified = classifyAllRows(normalized, documentTotal ?? undefined);

  return normalized.map((r, i) => {
    const c = classified[i];
    return {
      rowIndex: r.rowIndex,
      description: r.rawText,
      qty: r.quantity,
      unit: r.unit,
      rate: r.rate,
      amount: r.amount,
      classification: c.classification,
      includedInParsedTotal: !c.shouldExcludeFromItems,
      exclusionReason: c.exclusionReason ?? null,
      detectionSignals: c.detectionSignals ?? [],
      confidenceScore: c.confidenceScore ?? 0,
      matchesDocumentTotal: c.matchesDocumentTotal ?? false,
      sumsPriorRows: c.sumsPriorRows ?? false,
    };
  });
}

export function computeParserWarnings(
  rows: PlumbingNormalizedRow[],
  parsedValue: number,
  detectedDocumentTotal: number | null
): string[] {
  const warnings: string[] = [];

  if (detectedDocumentTotal && Math.abs(parsedValue - detectedDocumentTotal) > 1) {
    warnings.push(
      `Parsed total ($${parsedValue.toFixed(2)}) differs from detected document total ($${detectedDocumentTotal.toFixed(2)})`
    );
  }

  const highConfidenceSummaryRows = rows.filter(
    (r) => !r.includedInParsedTotal && r.confidenceScore >= 0.7
  );
  if (highConfidenceSummaryRows.length > 3) {
    warnings.push(`${highConfidenceSummaryRows.length} high-confidence summary rows excluded`);
  }

  const includedWithPhraseMatch = rows.filter(
    (r) => r.includedInParsedTotal && r.detectionSignals.some((s) => s.startsWith('phrase:'))
  );
  if (includedWithPhraseMatch.length > 0) {
    warnings.push(`${includedWithPhraseMatch.length} included rows have summary-like phrase signals`);
  }

  return warnings;
}
