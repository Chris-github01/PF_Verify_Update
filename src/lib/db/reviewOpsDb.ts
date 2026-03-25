import { supabase } from '../supabase';
import { logAdminAction } from '../shadow/auditLogger';
import type {
  ReviewCase,
  ReviewAssignment,
  ReviewDecision,
  ReviewComment,
  ReviewFeedback,
  ReviewSlaEvent,
  CaseStatus,
  DecisionType,
  FeedbackType,
  ReviewPriority,
  ReviewMetrics,
  CorrectionPayload,
} from '../modules/parsers/plumbing/review/reviewTypes';
import type { ReviewCasePayload } from '../modules/parsers/plumbing/review/createReviewCase';
import { canTransition } from '../modules/parsers/plumbing/review/createReviewCase';
import { isOverdue } from '../modules/parsers/plumbing/review/calculateSlaDueAt';
import { generateReviewFeedback, shouldGenerateFeedback } from '../modules/parsers/plumbing/review/generateReviewFeedback';

// ─── Cases ────────────────────────────────────────────────────────────────────

export async function dbCreateReviewCase(payload: ReviewCasePayload): Promise<ReviewCase> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('parser_review_cases')
    .insert({ ...payload, created_by: user?.id ?? null })
    .select()
    .single();
  if (error) throw error;

  await dbInsertSlaEvent(data.id, 'created', { priority: payload.priority });
  await logAdminAction({
    action: 'review_case.created',
    entityType: 'parser_review_cases',
    entityId: data.id,
    moduleKey: 'plumbing_parser',
    after: { caseOrigin: payload.case_origin, priority: payload.priority, sourceId: payload.source_id },
  });

  return data as ReviewCase;
}

export async function dbGetReviewCases(opts: {
  status?: CaseStatus | CaseStatus[];
  priority?: ReviewPriority;
  orgId?: string;
  assignedTo?: string;
  origin?: string;
  overdueOnly?: boolean;
  limit?: number;
} = {}): Promise<ReviewCase[]> {
  let q = supabase
    .from('parser_review_cases')
    .select('*')
    .eq('module_key', 'plumbing_parser')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.status) {
    if (Array.isArray(opts.status)) {
      q = q.in('case_status', opts.status);
    } else {
      q = q.eq('case_status', opts.status);
    }
  }
  if (opts.priority) q = q.eq('priority', opts.priority);
  if (opts.orgId) q = q.eq('org_id', opts.orgId);

  const { data, error } = await q;
  if (error) throw error;
  let cases = (data ?? []) as ReviewCase[];

  if (opts.overdueOnly) {
    cases = cases.filter((c) => isOverdue(c.sla_due_at));
  }

  return cases;
}

export async function dbGetReviewCase(id: string): Promise<ReviewCase | null> {
  const { data } = await supabase
    .from('parser_review_cases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data as ReviewCase | null;
}

export async function dbUpdateCaseStatus(caseId: string, newStatus: CaseStatus): Promise<void> {
  const existing = await dbGetReviewCase(caseId);
  if (!existing) throw new Error(`Review case ${caseId} not found`);
  if (!canTransition(existing.case_status, newStatus)) {
    throw new Error(`Cannot transition from ${existing.case_status} to ${newStatus}`);
  }

  await supabase
    .from('parser_review_cases')
    .update({ case_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', caseId);

  if (newStatus === 'completed') {
    await dbInsertSlaEvent(caseId, 'completed', { previousStatus: existing.case_status });
    await logAdminAction({
      action: 'review_case.completed',
      entityType: 'parser_review_cases',
      entityId: caseId,
      moduleKey: 'plumbing_parser',
      after: { case_status: newStatus },
    });
  } else {
    await logAdminAction({
      action: 'review_case.status_changed',
      entityType: 'parser_review_cases',
      entityId: caseId,
      moduleKey: 'plumbing_parser',
      after: { from: existing.case_status, to: newStatus },
    });
  }
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export async function dbAssignCase(
  caseId: string,
  assignedTo: string,
  notes = ''
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  await supabase
    .from('parser_review_assignments')
    .update({ active: false, unassigned_at: now })
    .eq('review_case_id', caseId)
    .eq('active', true);

  await supabase.from('parser_review_assignments').insert({
    review_case_id: caseId,
    assigned_to: assignedTo,
    assigned_by: user?.id ?? assignedTo,
    active: true,
    notes,
  });

  const existing = await dbGetReviewCase(caseId);
  const isReassign = existing?.case_status === 'assigned' || existing?.case_status === 'in_review';

  await dbUpdateCaseStatus(caseId, 'assigned');
  await dbInsertSlaEvent(caseId, isReassign ? 'reassigned' : 'assigned', { assignedTo, assignedBy: user?.id });

  await logAdminAction({
    action: isReassign ? 'review_case.reassigned' : 'review_case.assigned',
    entityType: 'parser_review_cases',
    entityId: caseId,
    moduleKey: 'plumbing_parser',
    after: { assignedTo },
  });
}

export async function dbGetAssignments(caseId: string): Promise<ReviewAssignment[]> {
  const { data } = await supabase
    .from('parser_review_assignments')
    .select('*')
    .eq('review_case_id', caseId)
    .order('assigned_at', { ascending: false });
  return (data ?? []) as ReviewAssignment[];
}

export async function dbGetActiveAssignment(caseId: string): Promise<ReviewAssignment | null> {
  const { data } = await supabase
    .from('parser_review_assignments')
    .select('*')
    .eq('review_case_id', caseId)
    .eq('active', true)
    .maybeSingle();
  return data as ReviewAssignment | null;
}

export async function dbGetCasesByReviewer(userId: string): Promise<ReviewCase[]> {
  const { data: assignments } = await supabase
    .from('parser_review_assignments')
    .select('review_case_id')
    .eq('assigned_to', userId)
    .eq('active', true);

  const ids = (assignments ?? []).map((a) => a.review_case_id);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from('parser_review_cases')
    .select('*')
    .in('id', ids)
    .not('case_status', 'in', '("completed","dismissed")')
    .order('sla_due_at', { ascending: true });
  return (data ?? []) as ReviewCase[];
}

// ─── Decisions ────────────────────────────────────────────────────────────────

export async function dbRecordDecision(params: {
  caseId: string;
  decisionType: DecisionType;
  decisionSummary: string;
  decisionDetails?: Record<string, unknown>;
  correctionPayload?: CorrectionPayload;
  confidenceScore?: number;
}): Promise<ReviewDecision> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('parser_review_decisions')
    .insert({
      review_case_id: params.caseId,
      decided_by: user?.id ?? '',
      decision_type: params.decisionType,
      decision_summary: params.decisionSummary,
      decision_details_json: params.decisionDetails ?? {},
      correction_payload_json: params.correctionPayload ?? null,
      confidence_score: params.confidenceScore ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const decision = data as ReviewDecision;

  if (shouldGenerateFeedback(params.decisionType)) {
    const feedbackItems = generateReviewFeedback(decision);
    for (const fb of feedbackItems) {
      await dbCreateFeedback({
        caseId: params.caseId,
        feedbackType: fb.feedbackType,
        payload: { ...fb.payload, explanation: fb.explanation },
      });
    }
  }

  if (params.decisionType === 'dismiss') {
    await dbUpdateCaseStatus(params.caseId, 'dismissed');
  } else if (params.decisionType !== 'escalate') {
    await dbUpdateCaseStatus(params.caseId, 'awaiting_approval');
  }

  await logAdminAction({
    action: 'review_case.decision_recorded',
    entityType: 'parser_review_decisions',
    entityId: decision.id,
    moduleKey: 'plumbing_parser',
    after: { caseId: params.caseId, decisionType: params.decisionType },
  });

  return decision;
}

export async function dbGetDecisions(caseId: string): Promise<ReviewDecision[]> {
  const { data } = await supabase
    .from('parser_review_decisions')
    .select('*')
    .eq('review_case_id', caseId)
    .order('created_at', { ascending: true });
  return (data ?? []) as ReviewDecision[];
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function dbAddComment(caseId: string, text: string): Promise<ReviewComment> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('parser_review_comments')
    .insert({ review_case_id: caseId, author_id: user?.id ?? '', comment_text: text })
    .select()
    .single();
  if (error) throw error;
  return data as ReviewComment;
}

export async function dbGetComments(caseId: string): Promise<ReviewComment[]> {
  const { data } = await supabase
    .from('parser_review_comments')
    .select('*')
    .eq('review_case_id', caseId)
    .order('created_at', { ascending: true });
  return (data ?? []) as ReviewComment[];
}

// ─── SLA Events ───────────────────────────────────────────────────────────────

export async function dbInsertSlaEvent(
  caseId: string,
  eventType: ReviewSlaEvent['event_type'],
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await supabase.from('parser_review_sla_events').insert({
    review_case_id: caseId,
    event_type: eventType,
    metadata_json: metadata,
  });
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export async function dbCreateFeedback(params: {
  caseId: string;
  feedbackType: FeedbackType;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('parser_review_feedback').insert({
    review_case_id: params.caseId,
    module_key: 'plumbing_parser',
    feedback_type: params.feedbackType,
    payload_json: params.payload,
    created_by: user?.id ?? null,
  });
  await logAdminAction({
    action: 'review_feedback.generated',
    entityType: 'parser_review_feedback',
    entityId: params.caseId,
    moduleKey: 'plumbing_parser',
    after: { feedbackType: params.feedbackType },
  });
}

export async function dbGetFeedback(caseId?: string): Promise<ReviewFeedback[]> {
  let q = supabase
    .from('parser_review_feedback')
    .select('*')
    .eq('module_key', 'plumbing_parser')
    .order('created_at', { ascending: false })
    .limit(200);
  if (caseId) q = q.eq('review_case_id', caseId);
  const { data } = await q;
  return (data ?? []) as ReviewFeedback[];
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export async function dbGetReviewMetrics(): Promise<ReviewMetrics> {
  const [casesRes, decisionsRes, feedbackRes] = await Promise.all([
    supabase.from('parser_review_cases').select('case_status, priority, case_origin, sla_due_at, created_at, updated_at').eq('module_key', 'plumbing_parser'),
    supabase.from('parser_review_decisions').select('decision_type, review_case_id, created_at'),
    supabase.from('parser_review_feedback').select('feedback_type').eq('module_key', 'plumbing_parser'),
  ]);

  const cases = (casesRes.data ?? []) as Array<{ case_status: CaseStatus; priority: ReviewPriority; case_origin: string; sla_due_at: string | null; created_at: string; updated_at: string }>;
  const decisions = (decisionsRes.data ?? []) as Array<{ decision_type: DecisionType }>;
  const feedbackRows = (feedbackRes.data ?? []) as Array<{ feedback_type: FeedbackType }>;

  const openStatuses: CaseStatus[] = ['new', 'queued', 'assigned', 'in_review', 'awaiting_approval'];
  const openCases = cases.filter((c) => openStatuses.includes(c.case_status as CaseStatus));
  const overdueCases = openCases.filter((c) => isOverdue(c.sla_due_at));

  const completedCases = cases.filter((c) => c.case_status === 'completed');
  const avgResolutionHours = completedCases.length > 0
    ? completedCases.reduce((sum, c) => {
        const created = new Date(c.created_at).getTime();
        const updated = new Date(c.updated_at).getTime();
        return sum + (updated - created) / 3600000;
      }, 0) / completedCases.length
    : null;

  const decisionDist = {} as Record<DecisionType, number>;
  for (const d of decisions) {
    decisionDist[d.decision_type] = (decisionDist[d.decision_type] ?? 0) + 1;
  }

  const casesByOrigin = {} as Record<string, number>;
  const casesByPriority = {} as Record<ReviewPriority, number>;
  for (const c of cases) {
    casesByOrigin[c.case_origin] = (casesByOrigin[c.case_origin] ?? 0) + 1;
    casesByPriority[c.priority] = (casesByPriority[c.priority] ?? 0) + 1;
  }

  return {
    totalCases: cases.length,
    openCases: openCases.length,
    overdueCases: overdueCases.length,
    completedCases: completedCases.length,
    dismissedCases: cases.filter((c) => c.case_status === 'dismissed').length,
    criticalCases: cases.filter((c) => c.priority === 'critical').length,
    avgResolutionHours: avgResolutionHours !== null ? Math.round(avgResolutionHours * 10) / 10 : null,
    decisionDistribution: decisionDist,
    feedbackGenerated: feedbackRows.length,
    regressionCandidates: feedbackRows.filter((f) => f.feedback_type === 'regression_case_candidate').length,
    casesByOrigin: casesByOrigin as Record<CaseOrigin, number>,
    casesByPriority,
  };
}
