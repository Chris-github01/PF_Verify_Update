import { PLUMBING_RULE_CONFIG } from './ruleConfig';
import type { TotalRowDetectionResult, RowClassification } from '../../../../types/plumbingDiscrepancy';

export interface RowInput {
  rowIndex: number;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  amount: number | null;
  totalRows: number;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[:\-–—*#+_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectPhraseSignals(normalized: string): string[] {
  const signals: string[] = [];
  for (const phrase of PLUMBING_RULE_CONFIG.summaryPhrases) {
    if (normalized.includes(phrase)) {
      signals.push(`phrase_match:${phrase}`);
    }
  }
  return signals;
}

function detectPositionSignals(rowIndex: number, totalRows: number): string[] {
  const signals: string[] = [];
  const windowSize = PLUMBING_RULE_CONFIG.lastRowsWindowSize;
  const windowPercent = Math.floor(totalRows * PLUMBING_RULE_CONFIG.lastRowsWindowPercent);
  const windowThreshold = Math.max(windowSize, windowPercent);

  if (rowIndex >= totalRows - windowThreshold) {
    signals.push('position:near_end_of_document');
  }
  if (rowIndex >= totalRows - 3) {
    signals.push('position:last_3_rows');
  }
  return signals;
}

function detectValueSignals(
  amount: number | null,
  quantity: number | null,
  unit: string | null,
  rate: number | null,
  documentTotal: number | null,
  priorRowsSum: number,
  allAmounts: number[]
): string[] {
  const signals: string[] = [];

  if (amount === null || amount === 0) return signals;

  if (!quantity && !rate && amount > 0) {
    signals.push('value:amount_only_row');
  }

  if (!unit || unit.trim() === '') {
    signals.push('value:missing_unit');
  }

  if (!quantity) {
    signals.push('value:missing_quantity');
  }

  if (documentTotal !== null) {
    const tolerance = Math.max(
      documentTotal * PLUMBING_RULE_CONFIG.nearMatchTolerancePercent,
      PLUMBING_RULE_CONFIG.nearMatchToleranceAbsolute
    );
    if (Math.abs(amount - documentTotal) <= tolerance) {
      signals.push('value:matches_document_total');
    }
  }

  if (priorRowsSum > 0) {
    const tolerance = Math.max(
      priorRowsSum * PLUMBING_RULE_CONFIG.nearMatchTolerancePercent,
      PLUMBING_RULE_CONFIG.nearMatchToleranceAbsolute
    );
    if (Math.abs(amount - priorRowsSum) <= tolerance) {
      signals.push('value:equals_sum_of_prior_rows');
    }
  }

  const validAmounts = allAmounts.filter((a) => a > 0 && a !== amount);
  if (validAmounts.length > 0) {
    const median = validAmounts.sort((a, b) => a - b)[Math.floor(validAmounts.length / 2)];
    if (median > 0 && amount > median * PLUMBING_RULE_CONFIG.highAmountMultiplierThreshold) {
      signals.push('value:much_larger_than_typical_line_item');
    }
  }

  return signals;
}

function detectStructureSignals(
  normalized: string,
  quantity: number | null,
  unit: string | null,
  rate: number | null,
  amount: number | null
): string[] {
  const signals: string[] = [];

  if (!quantity && !rate && amount !== null) {
    signals.push('structure:amount_only_no_qty_rate');
  }

  if (normalized.length < 25 && (normalized.includes('total') || normalized.includes('sum'))) {
    signals.push('structure:short_summary_description');
  }

  if (quantity === 1 && !unit && !rate && amount !== null) {
    signals.push('structure:lump_sum_pattern');
  }

  const wordCount = normalized.split(' ').filter(Boolean).length;
  if (wordCount <= 4 && (signals.length > 0 || normalized.includes('total'))) {
    signals.push('structure:minimal_description');
  }

  return signals;
}

function computeConfidence(signals: string[]): number {
  let score = 0;

  for (const signal of signals) {
    if (signal.startsWith('phrase_match:')) {
      const phrase = signal.replace('phrase_match:', '');
      const isStrongPhrase = [
        'grand total', 'contract sum', 'contract total', 'tender sum', 'quote total',
        'project total', 'total excl gst', 'total incl gst', 'total including gst',
        'total carried forward', 'carried forward', 'final total', 'net total',
      ].some((p) => phrase.includes(p));
      score += isStrongPhrase
        ? PLUMBING_RULE_CONFIG.phraseMatchWeighting
        : PLUMBING_RULE_CONFIG.phraseMatchWeighting * 0.6;
    }
    if (signal === 'value:matches_document_total') {
      score += PLUMBING_RULE_CONFIG.valueMatchesDocumentTotalWeighting;
    }
    if (signal === 'value:equals_sum_of_prior_rows') {
      score += PLUMBING_RULE_CONFIG.valueSumsPriorRowsWeighting;
    }
    if (signal === 'value:amount_only_row') {
      score += PLUMBING_RULE_CONFIG.amountOnlyWeighting;
    }
    if (signal === 'value:missing_quantity') {
      score += PLUMBING_RULE_CONFIG.missingQtyWeighting;
    }
    if (signal === 'value:missing_unit') {
      score += PLUMBING_RULE_CONFIG.missingUnitWeighting;
    }
    if (signal === 'position:last_3_rows' || signal === 'position:near_end_of_document') {
      score += PLUMBING_RULE_CONFIG.lastRowPositionWeighting;
    }
    if (signal === 'structure:amount_only_no_qty_rate') {
      score += 0.3;
    }
    if (signal === 'value:much_larger_than_typical_line_item') {
      score += 0.2;
    }
  }

  return Math.min(1.0, score);
}

function deriveClassification(
  signals: string[],
  confidence: number
): RowClassification {
  const hasPhraseMatch = signals.some((s) => s.startsWith('phrase_match:'));

  if (hasPhraseMatch && confidence >= PLUMBING_RULE_CONFIG.classifyConfidenceThresholdHigh) {
    const phrase = signals.find((s) => s.startsWith('phrase_match:'))?.replace('phrase_match:', '') ?? '';
    if (phrase.includes('sub') || phrase.includes('section') || phrase.includes('page') || phrase.includes('floor') || phrase.includes('level')) {
      return 'subtotal';
    }
    return 'summary_total';
  }

  if (!hasPhraseMatch && confidence >= PLUMBING_RULE_CONFIG.classifyConfidenceThresholdMedium) {
    return 'unclassified';
  }

  return 'line_item';
}

function buildExclusionReason(signals: string[], classification: RowClassification): string | null {
  if (classification === 'line_item') return null;

  const reasons: string[] = [];

  const phraseMatches = signals.filter((s) => s.startsWith('phrase_match:')).map((s) => s.replace('phrase_match:', ''));
  if (phraseMatches.length > 0) {
    reasons.push(`Matched summary phrase: "${phraseMatches[0]}"`);
  }
  if (signals.includes('value:matches_document_total')) {
    reasons.push('Amount matches detected document total');
  }
  if (signals.includes('value:equals_sum_of_prior_rows')) {
    reasons.push('Amount equals sum of prior rows');
  }
  if (signals.includes('value:amount_only_row')) {
    reasons.push('Amount-only row (no quantity or rate)');
  }
  if (signals.includes('position:last_3_rows')) {
    reasons.push('Positioned in final rows of document');
  }

  return reasons.length > 0 ? reasons.join('; ') : 'Summary/total pattern detected';
}

export function detectTotalRow(
  row: RowInput,
  options: {
    documentTotal?: number | null;
    priorRowsAmounts?: number[];
    allAmounts?: number[];
  } = {}
): TotalRowDetectionResult {
  const normalized = normalize(row.rawText);
  const priorSum = (options.priorRowsAmounts ?? []).reduce((sum, v) => sum + (v ?? 0), 0);

  const phraseSignals = detectPhraseSignals(normalized);
  const positionSignals = detectPositionSignals(row.rowIndex, row.totalRows);
  const valueSignals = detectValueSignals(
    row.amount,
    row.quantity,
    row.unit,
    row.rate,
    options.documentTotal ?? null,
    priorSum,
    options.allAmounts ?? []
  );
  const structureSignals = detectStructureSignals(normalized, row.quantity, row.unit, row.rate, row.amount);

  const allSignals = [...phraseSignals, ...positionSignals, ...valueSignals, ...structureSignals];
  const confidenceScore = computeConfidence(allSignals);
  const classification = deriveClassification(allSignals, confidenceScore);
  const exclusionReason = buildExclusionReason(allSignals, classification);
  const shouldExclude = classification !== 'line_item';

  const matchesDocumentTotal = allSignals.includes('value:matches_document_total');
  const sumsPriorRows = allSignals.includes('value:equals_sum_of_prior_rows');

  return {
    classification,
    exclusionReason,
    detectionSignals: allSignals,
    confidenceScore,
    shouldExcludeFromItems: shouldExclude,
    shouldExcludeFromParsedTotal: false,
    matchesDocumentTotal,
    sumsPriorRows,
  };
}

export function classifyAllRows(
  rows: Array<{
    rowIndex: number;
    rawText: string;
    quantity: number | null;
    unit: string | null;
    rate: number | null;
    amount: number | null;
  }>,
  documentTotal?: number | null
): Array<TotalRowDetectionResult & { rowIndex: number }> {
  const allAmounts = rows.map((r) => r.amount ?? 0).filter((a) => a > 0);
  const totalRows = rows.length;
  const results: Array<TotalRowDetectionResult & { rowIndex: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const priorRowsAmounts = rows.slice(0, i).map((r) => r.amount ?? 0).filter((a) => a > 0);

    const result = detectTotalRow(
      { ...row, totalRows },
      { documentTotal, priorRowsAmounts, allAmounts }
    );

    results.push({ ...result, rowIndex: row.rowIndex });
  }

  return results;
}
