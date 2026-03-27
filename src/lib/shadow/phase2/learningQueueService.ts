import { supabase } from '../../supabase';

export type QueueStatus = 'pending' | 'in_review' | 'resolved' | 'dismissed';

export interface LearningQueueEntry {
  id: string;
  run_id: string;
  module_key: string;
  priority_score: number;
  learning_reason: string;
  status: QueueStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningQueueEntryWithRun extends LearningQueueEntry {
  run: {
    source_label: string | null;
    source_id: string;
    run_mode: string;
    status: string;
    started_at: string | null;
  } | null;
}

interface ScoringInput {
  runId: string;
  moduleKey: string;
  failureCodes: string[];
  isNewFingerprint: boolean;
  diagnosticConfidenceScore: number;
  trueMissingValue: number | null;
  documentTotal: number | null;
  parsedValue: number | null;
  shadowOutput: Record<string, unknown> | null;
}

function computePriorityScore(input: ScoringInput): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const hasCriticalFailure = input.failureCodes.some(
    (c) => c === 'systemic_failure' || c === 'total_extraction_failure',
  );
  const hasDocExtractionFailure = input.failureCodes.includes('document_extraction_failure');
  const hasParserDisagreement = input.failureCodes.includes('parser_disagreement');
  const hasConfidenceMisalignment = input.failureCodes.includes('confidence_misalignment');
  const hasDuplicateRisk = input.failureCodes.includes('duplicate_line_extraction');
  const hasMultipleCritical = input.failureCodes.filter(
    (c) => ['systemic_failure', 'total_extraction_failure', 'document_extraction_failure'].includes(c),
  ).length >= 2;

  const docTotal = input.documentTotal ?? 0;
  const parsedVal = input.parsedValue ?? 0;
  const missingVal = input.trueMissingValue ?? 0;

  const isHighConfidenceWrongResult =
    input.diagnosticConfidenceScore >= 80 &&
    docTotal > 0 &&
    Math.abs(parsedVal - docTotal) / docTotal > 0.10;

  const isMaterialMiss = docTotal > 0 && Math.abs(missingVal) / docTotal > 0.15;

  if (isHighConfidenceWrongResult) {
    score += 30;
    reasons.push('High-confidence wrong result');
  }
  if (isMaterialMiss && hasCriticalFailure) {
    score += 40;
    reasons.push('Critical financial mismatch with material missing value');
  } else if (isMaterialMiss) {
    score += 20;
    reasons.push('Material missing value');
  }
  if (hasCriticalFailure) {
    score += 35;
    reasons.push('Systemic failure detected');
  }
  if (hasDocExtractionFailure) {
    score += 25;
    reasons.push('Document extraction failure');
  }
  if (hasParserDisagreement) {
    score += 20;
    reasons.push('Parser disagreement');
  }
  if (input.isNewFingerprint) {
    score += 20;
    reasons.push('New unseen supplier/template family');
  }
  if (hasConfidenceMisalignment || hasDuplicateRisk) {
    score += 15;
    reasons.push('Repeated failure family signals');
  }
  if (hasMultipleCritical) {
    score += 20;
    reasons.push('Multiple critical failures');
  }

  const clampedScore = Math.max(0, Math.min(100, score));

  return { score: clampedScore, reasons };
}

function buildLearningReason(reasons: string[], score: number): string {
  if (reasons.length === 0) return 'Low-priority shadow run for baseline review';
  if (score >= 70) return reasons.slice(0, 2).join(' + ');
  if (score >= 40) return reasons[0];
  return reasons[0] ?? 'Queued for review';
}

export async function evaluateAndEnqueueRun(
  runId: string,
  moduleKey: string,
  isNewFingerprint: boolean,
): Promise<LearningQueueEntry | null> {
  const existing = await supabase
    .from('learning_queue')
    .select('id')
    .eq('run_id', runId)
    .maybeSingle();

  if (existing.data) return null;

  const [failureRes, diagnosticsRes, truthRes, resultsRes] = await Promise.all([
    supabase.from('shadow_run_failures').select('failure_code').eq('run_id', runId),
    supabase.from('shadow_run_diagnostics').select('confidence_score').eq('run_id', runId).maybeSingle(),
    supabase.from('document_truth_validations').select('true_missing_value, validated_document_total').eq('run_id', runId).maybeSingle(),
    supabase.from('shadow_run_results').select('metrics_json').eq('shadow_run_id', runId).eq('result_type', 'live').maybeSingle(),
  ]);

  const failureCodes = (failureRes.data ?? []).map((r) => String(r.failure_code));
  const diagnosticConfidenceScore =
    typeof diagnosticsRes.data?.confidence_score === 'number'
      ? diagnosticsRes.data.confidence_score
      : 50;
  const trueMissingValue =
    typeof truthRes.data?.true_missing_value === 'number'
      ? truthRes.data.true_missing_value
      : null;
  const documentTotal =
    typeof truthRes.data?.validated_document_total === 'number'
      ? truthRes.data.validated_document_total
      : null;

  const metricsJson = (resultsRes.data?.metrics_json ?? {}) as Record<string, unknown>;
  const parsedValue =
    typeof metricsJson.parsedValue === 'number' ? metricsJson.parsedValue : null;

  const { score, reasons } = computePriorityScore({
    runId,
    moduleKey,
    failureCodes,
    isNewFingerprint,
    diagnosticConfidenceScore,
    trueMissingValue,
    documentTotal,
    parsedValue,
    shadowOutput: null,
  });

  if (score < 15) return null;

  const learningReason = buildLearningReason(reasons, score);

  const { data, error } = await supabase
    .from('learning_queue')
    .insert({
      run_id: runId,
      module_key: moduleKey,
      priority_score: score,
      learning_reason: learningReason,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error) {
    if (import.meta.env.DEV) {
      console.warn('[learningQueueService] insert failed:', error.message);
    }
    return null;
  }

  return data as LearningQueueEntry;
}

export async function getLearningQueue(
  status?: QueueStatus,
  limit = 100,
): Promise<LearningQueueEntryWithRun[]> {
  let query = supabase
    .from('learning_queue')
    .select(`
      *,
      run:shadow_runs!learning_queue_run_id_fkey(
        source_label, source_id, run_mode, status, started_at
      )
    `)
    .order('priority_score', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[learningQueueService] getLearningQueue failed: ${error.message}`);
  return (data ?? []) as unknown as LearningQueueEntryWithRun[];
}

export async function getQueueEntryForRun(runId: string): Promise<LearningQueueEntry | null> {
  const { data, error } = await supabase
    .from('learning_queue')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();

  if (error) return null;
  return data as LearningQueueEntry | null;
}

export async function updateQueueStatus(
  entryId: string,
  status: QueueStatus,
  assignedTo?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('learning_queue')
    .update({
      status,
      assigned_to: assignedTo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId);

  if (error) throw new Error(`[learningQueueService] updateQueueStatus failed: ${error.message}`);
}

export async function getQueueStats(): Promise<{
  pending: number;
  inReview: number;
  resolved: number;
  dismissed: number;
  total: number;
}> {
  const { data, error } = await supabase
    .from('learning_queue')
    .select('status');

  if (error) return { pending: 0, inReview: 0, resolved: 0, dismissed: 0, total: 0 };

  const rows = data ?? [];
  return {
    pending: rows.filter((r) => r.status === 'pending').length,
    inReview: rows.filter((r) => r.status === 'in_review').length,
    resolved: rows.filter((r) => r.status === 'resolved').length,
    dismissed: rows.filter((r) => r.status === 'dismissed').length,
    total: rows.length,
  };
}
