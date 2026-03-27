import { supabase } from '../../supabase';
import type { ResolvedDataset } from './sourceAdapters';

export type AnchorType =
  | 'explicit_total_price'
  | 'explicit_grand_total'
  | 'explicit_contract_total'
  | 'explicit_final_total'
  | 'final_total_row'
  | 'strong_summary_row'
  | 'max_summary_fallback'
  | 'detected_fallback';

const ANCHOR_BASE_SCORES: Record<AnchorType, number> = {
  explicit_total_price:    1000,
  explicit_grand_total:    990,
  explicit_contract_total: 980,
  explicit_final_total:    970,
  final_total_row:         900,
  strong_summary_row:      750,
  max_summary_fallback:    500,
  detected_fallback:       100,
};

export interface TotalCandidate {
  value: number;
  anchorType: AnchorType;
  sourceText: string | null;
  normalizedSourceText: string | null;
  confidence: number;
  rankingScore: number;
  page: number | null;
  lineIndex: number | null;
  selected: boolean;
  rejectedReason: string | null;
}

export interface DocumentTruthResult {
  candidates: TotalCandidate[];
  validatedDocumentTotal: number | null;
  detectedDocumentTotal: number | null;
  selectedAnchorType: AnchorType | null;
  extractionMismatch: boolean;
  mismatchReason: string | null;
  trueMissingValue: number | null;
  extractionFailure: boolean;
}

function normalizeText(text: string | null): string | null {
  if (!text) return null;
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function detectAnchorType(sourceText: string | null): AnchorType {
  if (!sourceText) return 'detected_fallback';
  const t = sourceText.trim().toLowerCase();

  if (t.includes('total price') || t.includes('price total')) return 'explicit_total_price';
  if (t.includes('grand total')) return 'explicit_grand_total';
  if (t.includes('contract total') || t.includes('contract value')) return 'explicit_contract_total';
  if (t.includes('final total') || t.includes('total final')) return 'explicit_final_total';
  if (t.includes('total') && (t.includes('row') || t.includes('line'))) return 'final_total_row';
  if (t.includes('total') || t.includes('subtotal') || t.includes('sum')) return 'strong_summary_row';

  return 'detected_fallback';
}

function scoreCandidate(
  candidate: Omit<TotalCandidate, 'rankingScore' | 'selected' | 'rejectedReason'>,
  totalCandidates: number,
  index: number,
): number {
  let score = ANCHOR_BASE_SCORES[candidate.anchorType];

  if (totalCandidates > 0 && index >= totalCandidates - 3) {
    score += 50;
  }

  const text = candidate.normalizedSourceText ?? '';
  if (text.includes('grand total') || text.includes('total price')) score += 30;
  if (text === 'total' || text === 'grand total') score += 20;

  if (text.includes('subtotal')) score -= 100;
  if (text.includes('provisional')) score -= 80;
  if (text.includes('allowance')) score -= 60;
  if (text.includes('estimate')) score -= 40;
  if (text.includes('gst') || text.includes('tax')) score -= 30;

  return Math.max(0, score);
}

function extractCandidatesFromOutput(
  liveOutput: Record<string, unknown>,
  dataset: ResolvedDataset,
): Omit<TotalCandidate, 'rankingScore' | 'selected' | 'rejectedReason'>[] {
  const candidates: Omit<TotalCandidate, 'rankingScore' | 'selected' | 'rejectedReason'>[] = [];

  if (dataset.documentTotal != null && dataset.documentTotal > 0) {
    const sourceText = 'document_total (metadata)';
    candidates.push({
      value: dataset.documentTotal,
      anchorType: detectAnchorType(sourceText),
      sourceText,
      normalizedSourceText: normalizeText(sourceText),
      confidence: 0.9,
      page: null,
      lineIndex: null,
    });
  }

  if (typeof liveOutput.detectedDocumentTotal === 'number' && liveOutput.detectedDocumentTotal > 0) {
    const detectedVal = liveOutput.detectedDocumentTotal;
    if (!candidates.some((c) => c.value === detectedVal)) {
      candidates.push({
        value: detectedVal,
        anchorType: 'detected_fallback',
        sourceText: 'detected_document_total (parser)',
        normalizedSourceText: 'detected_document_total (parser)',
        confidence: 0.75,
        page: null,
        lineIndex: null,
      });
    }
  }

  if (typeof liveOutput.parsedValue === 'number' && liveOutput.parsedValue > 0) {
    const parsedVal = liveOutput.parsedValue;
    if (!candidates.some((c) => c.value === parsedVal)) {
      candidates.push({
        value: parsedVal,
        anchorType: 'max_summary_fallback',
        sourceText: 'sum_of_line_items (parser)',
        normalizedSourceText: 'sum_of_line_items (parser)',
        confidence: 0.6,
        page: null,
        lineIndex: null,
      });
    }
  }

  return candidates;
}

function selectBestCandidate(
  scored: TotalCandidate[],
): { selected: TotalCandidate | null; reason: string } {
  if (scored.length === 0) {
    return { selected: null, reason: 'No candidates available' };
  }

  const sorted = [...scored].sort((a, b) => b.rankingScore - a.rankingScore);
  const best = sorted[0];

  if (best.value <= 0) {
    return { selected: null, reason: 'Best candidate has non-positive value' };
  }

  return { selected: best, reason: 'Highest ranking score via anchor priority' };
}

function detectConflict(candidates: TotalCandidate[]): boolean {
  const strongCandidates = candidates.filter(
    (c) => ANCHOR_BASE_SCORES[c.anchorType] >= 900 && c.value > 0,
  );
  if (strongCandidates.length < 2) return false;
  const values = strongCandidates.map((c) => c.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max > 0 && (max - min) / max > 0.05;
}

export async function resolveDocumentTruth(
  runId: string,
  liveOutput: Record<string, unknown>,
  dataset: ResolvedDataset,
): Promise<DocumentTruthResult> {
  const rawCandidates = extractCandidatesFromOutput(liveOutput, dataset);
  const total = rawCandidates.length;

  const scored: TotalCandidate[] = rawCandidates.map((c, i) => ({
    ...c,
    rankingScore: scoreCandidate(c, total, i),
    selected: false,
    rejectedReason: null,
  }));

  const { selected: bestCandidate } = selectBestCandidate(scored);
  const hasConflict = detectConflict(scored);

  const candidates: TotalCandidate[] = scored.map((c) => {
    if (bestCandidate && c.value === bestCandidate.value && c.anchorType === bestCandidate.anchorType) {
      return { ...c, selected: true, rejectedReason: null };
    }
    let reason = 'Lower anchor priority score';
    if (bestCandidate && c.value !== bestCandidate.value) {
      reason = `Value differs from selected (${bestCandidate.value.toFixed(0)} vs ${c.value.toFixed(0)})`;
    }
    return { ...c, selected: false, rejectedReason: reason };
  });

  const validatedDocumentTotal = bestCandidate?.value ?? null;
  const detectedDocumentTotal =
    typeof liveOutput.detectedDocumentTotal === 'number' ? liveOutput.detectedDocumentTotal : dataset.documentTotal;

  const parsedTotal = typeof liveOutput.parsedValue === 'number' ? liveOutput.parsedValue : null;

  const extractionMismatch =
    validatedDocumentTotal != null &&
    detectedDocumentTotal != null &&
    Math.abs(validatedDocumentTotal - detectedDocumentTotal) / Math.max(validatedDocumentTotal, 1) > 0.01;

  const mismatchReason = extractionMismatch
    ? `Validated total (${validatedDocumentTotal?.toFixed(0)}) differs from detected total (${detectedDocumentTotal?.toFixed(0)}).`
    : null;

  const trueMissingValue =
    validatedDocumentTotal != null && parsedTotal != null
      ? validatedDocumentTotal - parsedTotal
      : null;

  const extractionFailure =
    validatedDocumentTotal == null ||
    (hasConflict && scored.filter((c) => ANCHOR_BASE_SCORES[c.anchorType] >= 900).length >= 2);

  const result: DocumentTruthResult = {
    candidates,
    validatedDocumentTotal,
    detectedDocumentTotal,
    selectedAnchorType: bestCandidate?.anchorType ?? null,
    extractionMismatch,
    mismatchReason,
    trueMissingValue,
    extractionFailure,
  };

  await supabase.from('document_total_candidates').insert(
    candidates.map((c, i) => ({
      run_id: runId,
      value: c.value,
      anchor_type: c.anchorType,
      source_text: c.sourceText,
      normalized_source_text: c.normalizedSourceText,
      confidence: c.confidence,
      ranking_score: c.rankingScore,
      selected: c.selected,
      rejected_reason: c.rejectedReason,
      page: c.page,
      line_index: i,
    }))
  );

  await supabase.from('document_truth_validations').upsert({
    run_id: runId,
    detected_document_total: detectedDocumentTotal,
    validated_document_total: validatedDocumentTotal,
    selected_anchor_type: bestCandidate?.anchorType ?? null,
    extraction_mismatch: extractionMismatch,
    mismatch_reason: mismatchReason,
    true_missing_value: trueMissingValue,
    extraction_failure: extractionFailure,
  }, { onConflict: 'run_id' });

  return result;
}

export async function getDocumentTruthValidation(runId: string): Promise<{
  validation: {
    id: string;
    run_id: string;
    detected_document_total: number | null;
    validated_document_total: number | null;
    selected_anchor_type: string | null;
    extraction_mismatch: boolean;
    mismatch_reason: string | null;
    true_missing_value: number | null;
    extraction_failure: boolean;
    created_at: string;
  } | null;
  candidates: Array<{
    id: string;
    run_id: string;
    value: number;
    anchor_type: string;
    source_text: string | null;
    normalized_source_text: string | null;
    confidence: number;
    ranking_score: number;
    selected: boolean;
    rejected_reason: string | null;
    page: number | null;
    line_index: number | null;
    created_at: string;
  }>;
}> {
  const [valRes, candRes] = await Promise.all([
    supabase
      .from('document_truth_validations')
      .select('*')
      .eq('run_id', runId)
      .maybeSingle(),
    supabase
      .from('document_total_candidates')
      .select('*')
      .eq('run_id', runId)
      .order('ranking_score', { ascending: false }),
  ]);

  return {
    validation: valRes.data ?? null,
    candidates: candRes.data ?? [],
  };
}
