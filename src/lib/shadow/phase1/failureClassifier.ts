import { supabase } from '../../supabase';
import type { ResolvedDataset } from './sourceAdapters';
import type { DiagnosticsProfile } from './runDiagnosticsBuilder';

export type FailureCode =
  | 'total_extraction_failure'
  | 'systemic_failure'
  | 'parser_disagreement'
  | 'line_item_merge_failure'
  | 'line_item_split_failure'
  | 'duplicate_line_extraction'
  | 'underparse'
  | 'overparse'
  | 'optional_item_inclusion_error'
  | 'qualification_detection_failure'
  | 'section_boundary_error'
  | 'gst_misclassification'
  | 'provisional_sum_misclassification'
  | 'rate_vs_lump_sum_misread'
  | 'document_extraction_failure'
  | 'confidence_misalignment';

export type FailureSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_WEIGHTS: Record<FailureSeverity, number> = {
  info: 1,
  low: 2,
  medium: 5,
  high: 10,
  critical: 20,
};

export interface ClassifiedFailure {
  failureCode: FailureCode;
  severity: FailureSeverity;
  confidence: number;
  financialImpactEstimate: number | null;
  notes: string;
}

function classifyFailures(
  dataset: ResolvedDataset,
  liveOutput: Record<string, unknown>,
  shadowOutput: Record<string, unknown> | null,
  diagnostics: DiagnosticsProfile,
): ClassifiedFailure[] {
  const failures: ClassifiedFailure[] = [];
  const liveVal = typeof liveOutput.parsedValue === 'number' ? liveOutput.parsedValue : 0;
  const docTotal = dataset.documentTotal ?? 0;

  if (liveOutput.detectedDocumentTotal == null && docTotal === 0) {
    failures.push({
      failureCode: 'total_extraction_failure',
      severity: 'critical',
      confidence: 0.9,
      financialImpactEstimate: null,
      notes: 'No document total detected and no reference total available.',
    });
  }

  if (dataset.itemCount > 0 && liveVal > 0 && docTotal > 0) {
    const missPct = (docTotal - liveVal) / docTotal;
    if (missPct > 0.25) {
      failures.push({
        failureCode: 'systemic_failure',
        severity: 'critical',
        confidence: Math.min(0.95, missPct),
        financialImpactEstimate: docTotal - liveVal,
        notes: `Parser captured only ${((1 - missPct) * 100).toFixed(1)}% of document total (${missPct > 0.5 ? 'severe' : 'significant'} systemic miss).`,
      });
    }
  }

  if (shadowOutput && liveOutput.parsedValue != null) {
    const shadowVal = typeof shadowOutput.parsedValue === 'number' ? shadowOutput.parsedValue : 0;
    const delta = Math.abs(liveVal - shadowVal);
    const pct = liveVal > 0 ? delta / liveVal : 0;
    if (pct > 0.05) {
      failures.push({
        failureCode: 'parser_disagreement',
        severity: pct > 0.15 ? 'high' : 'medium',
        confidence: Math.min(0.99, pct * 2),
        financialImpactEstimate: delta,
        notes: `Live parsed $${liveVal.toFixed(0)}, shadow parsed $${shadowVal.toFixed(0)} — delta ${(pct * 100).toFixed(1)}%.`,
      });
    }
  }

  if (Boolean(liveOutput.hasDuplicateValueRisk)) {
    failures.push({
      failureCode: 'duplicate_line_extraction',
      severity: 'high',
      confidence: 0.7,
      financialImpactEstimate: null,
      notes: 'Parser flagged duplicate value risk — likely repeated line extraction.',
    });
  }

  if (Boolean(liveOutput.hasLikelyFinalTotalAsLineItem)) {
    failures.push({
      failureCode: 'overparse',
      severity: 'high',
      confidence: 0.8,
      financialImpactEstimate: null,
      notes: 'Document total row appears to have been included as a line item.',
    });
  }

  if (docTotal > 0 && liveVal > 0) {
    const overPct = (liveVal - docTotal) / docTotal;
    if (overPct > 0.10 && !failures.some((f) => f.failureCode === 'overparse')) {
      failures.push({
        failureCode: 'overparse',
        severity: 'medium',
        confidence: Math.min(0.9, overPct),
        financialImpactEstimate: liveVal - docTotal,
        notes: `Parsed total (${liveVal.toFixed(0)}) exceeds document total (${docTotal.toFixed(0)}) by ${(overPct * 100).toFixed(1)}%.`,
      });
    }
    const underPct = (docTotal - liveVal) / docTotal;
    if (underPct > 0.10 && !failures.some((f) => f.failureCode === 'systemic_failure')) {
      failures.push({
        failureCode: 'underparse',
        severity: underPct > 0.25 ? 'high' : 'medium',
        confidence: Math.min(0.9, underPct),
        financialImpactEstimate: docTotal - liveVal,
        notes: `Parsed total (${liveVal.toFixed(0)}) is ${(underPct * 100).toFixed(1)}% below document total (${docTotal.toFixed(0)}).`,
      });
    }
  }

  if (diagnostics.gstMode === 'mixed_signals') {
    failures.push({
      failureCode: 'gst_misclassification',
      severity: 'high',
      confidence: 0.65,
      financialImpactEstimate: null,
      notes: 'Mixed GST signals detected in parser warnings. GST treatment may be inconsistent.',
    });
  }

  const warnings = Array.isArray(liveOutput.parserWarnings)
    ? (liveOutput.parserWarnings as string[])
    : [];
  const hasPsWarning = warnings.some(
    (w) => w.toLowerCase().includes('provisional') || w.toLowerCase().includes('prime cost'),
  );
  if (hasPsWarning) {
    failures.push({
      failureCode: 'provisional_sum_misclassification',
      severity: 'medium',
      confidence: 0.6,
      financialImpactEstimate: null,
      notes: 'Parser warning references provisional sums or prime cost items.',
    });
  }

  const hasDocumentTotal =
    dataset.documentTotal != null ||
    typeof liveOutput.detectedDocumentTotal === 'number';
  const hasParsedValue = liveVal > 0;

  if (!hasDocumentTotal && hasParsedValue) {
    failures.push({
      failureCode: 'document_extraction_failure',
      severity: 'high',
      confidence: 0.85,
      financialImpactEstimate: null,
      notes: 'No document-level total anchor was found. Parser produced line items but could not locate a reference total from the source document.',
    });
  }

  if (diagnostics.confidenceScore >= 80 && docTotal > 0 && liveVal > 0) {
    const delta = Math.abs(liveVal - docTotal) / docTotal;
    if (delta > 0.15) {
      failures.push({
        failureCode: 'confidence_misalignment',
        severity: 'medium',
        confidence: 0.75,
        financialImpactEstimate: Math.abs(liveVal - docTotal),
        notes: `High diagnostics confidence (${diagnostics.confidenceScore}) but parsed total deviates ${(delta * 100).toFixed(1)}% from document total. Possible structural parse error masked by clean document format.`,
      });
    }
  }

  return failures;
}

export async function classifyAndSaveFailures(
  runId: string,
  dataset: ResolvedDataset,
  liveOutput: Record<string, unknown>,
  shadowOutput: Record<string, unknown> | null,
  diagnostics: DiagnosticsProfile,
): Promise<ClassifiedFailure[]> {
  if (!runId) {
    throw new Error('[classifyAndSaveFailures] runId is required');
  }
  if (!dataset) {
    throw new Error('[classifyAndSaveFailures] dataset is required');
  }
  if (!liveOutput || typeof liveOutput !== 'object') {
    throw new Error('[classifyAndSaveFailures] liveOutput must be a non-null object');
  }
  if (!diagnostics) {
    throw new Error('[classifyAndSaveFailures] diagnostics profile is required');
  }

  const failures = classifyFailures(dataset, liveOutput, shadowOutput, diagnostics);
  if (failures.length === 0) return [];

  const rows = failures.map((f) => ({
    run_id: runId,
    failure_code: f.failureCode,
    severity: f.severity,
    confidence: f.confidence,
    financial_impact_estimate: f.financialImpactEstimate,
    notes: f.notes,
  }));

  const { error } = await supabase.from('shadow_run_failures').insert(rows);
  if (error && import.meta.env.DEV) {
    console.warn('[classifyAndSaveFailures] insert failed:', error.message);
  }

  return failures;
}

export async function getRunFailures(runId: string): Promise<
  Array<{
    id: string;
    run_id: string;
    failure_code: string;
    severity: string;
    confidence: number;
    financial_impact_estimate: number | null;
    notes: string | null;
    created_at: string;
  }>
> {
  const { data, error } = await supabase
    .from('shadow_run_failures')
    .select('*')
    .eq('run_id', runId)
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function getAllFailureTypes(): Promise<
  Array<{
    id: string;
    failure_code: string;
    title: string;
    description: string;
    severity: string;
    business_impact_type: string;
    active: boolean;
  }>
> {
  const { data, error } = await supabase
    .from('shadow_failure_types')
    .select('*')
    .eq('active', true)
    .order('severity', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
