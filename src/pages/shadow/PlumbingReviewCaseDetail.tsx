import { useEffect, useState, useCallback } from 'react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import PlumbingReviewCaseHeader from '../../components/plumbing/review/PlumbingReviewCaseHeader';
import PlumbingReviewDecisionPanel from '../../components/plumbing/review/PlumbingReviewDecisionPanel';
import PlumbingReviewCommentsPanel from '../../components/plumbing/review/PlumbingReviewCommentsPanel';
import PlumbingReviewAssignmentPanel from '../../components/plumbing/review/PlumbingReviewAssignmentPanel';
import PlumbingReviewFeedbackPanel from '../../components/plumbing/review/PlumbingReviewFeedbackPanel';
import {
  dbGetReviewCase,
  dbGetDecisions,
  dbGetComments,
  dbGetAssignments,
  dbGetActiveAssignment,
  dbGetFeedback,
  dbRecordDecision,
  dbAddComment,
  dbAssignCase,
  dbUpdateCaseStatus,
} from '../../lib/db/reviewOpsDb';
import type {
  ReviewCase,
  ReviewDecision,
  ReviewComment,
  ReviewAssignment,
  ReviewFeedback,
  DecisionType,
  CaseStatus,
} from '../../lib/modules/parsers/plumbing/review/reviewTypes';
import type { CorrectionPayload } from '../../lib/modules/parsers/plumbing/review/reviewTypes';
import { supabase } from '../../lib/supabase';

interface PlumbingReviewCaseDetailProps {
  caseId: string;
  onBack: () => void;
}

export default function PlumbingReviewCaseDetail({ caseId, onBack }: PlumbingReviewCaseDetailProps) {
  const [reviewCase, setReviewCase] = useState<ReviewCase | null>(null);
  const [decisions, setDecisions] = useState<ReviewDecision[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [allAssignments, setAllAssignments] = useState<ReviewAssignment[]>([]);
  const [activeAssignment, setActiveAssignment] = useState<ReviewAssignment | null>(null);
  const [feedback, setFeedback] = useState<ReviewFeedback[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [caseData, decisionsData, commentsData, assignmentsData, activeAssignData, feedbackData, { data: { user } }] = await Promise.all([
      dbGetReviewCase(caseId),
      dbGetDecisions(caseId),
      dbGetComments(caseId),
      dbGetAssignments(caseId),
      dbGetActiveAssignment(caseId),
      dbGetFeedback(caseId),
      supabase.auth.getUser(),
    ]);
    setReviewCase(caseData);
    setDecisions(decisionsData);
    setComments(commentsData);
    setAllAssignments(assignmentsData);
    setActiveAssignment(activeAssignData);
    setFeedback(feedbackData);
    setCurrentUserId(user?.id);
  }, [caseId]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  async function handleStatusChange(status: string) {
    if (!reviewCase) return;
    setBusy(true);
    try {
      await dbUpdateCaseStatus(caseId, status as CaseStatus);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleDecision(params: {
    decisionType: DecisionType;
    decisionSummary: string;
    decisionDetails: Record<string, unknown>;
    correctionPayload?: CorrectionPayload;
    confidenceScore?: number;
  }) {
    setBusy(true);
    try {
      await dbRecordDecision({ caseId, ...params });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleComment(text: string) {
    await dbAddComment(caseId, text);
    await load();
  }

  async function handleAssign(userId: string, notes?: string) {
    setBusy(true);
    try {
      await dbAssignCase(caseId, userId, notes);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <ShadowLayout>
        <div className="text-center py-16 text-sm text-gray-500">Loading review case...</div>
      </ShadowLayout>
    );
  }

  if (!reviewCase) {
    return (
      <ShadowLayout>
        <div className="text-center py-16 text-sm text-red-400">Review case not found</div>
      </ShadowLayout>
    );
  }

  const isTerminal = reviewCase.case_status === 'completed' || reviewCase.case_status === 'dismissed';

  return (
    <ShadowLayout>
      <div className="max-w-5xl mx-auto space-y-5">
          <PlumbingReviewCaseHeader
            reviewCase={reviewCase}
            onBack={onBack}
            onStatusChange={handleStatusChange}
            busy={busy}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left column — decision + comments */}
            <div className="lg:col-span-2 space-y-5">
              {!isTerminal && (
                <PlumbingReviewDecisionPanel
                  caseId={caseId}
                  existingDecisions={decisions}
                  onSubmit={handleDecision}
                  disabled={busy}
                />
              )}
              {isTerminal && decisions.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="text-sm font-semibold text-white mb-3">Decision history</div>
                  <div className="space-y-2">
                    {decisions.map((d) => (
                      <div key={d.id} className="text-xs bg-gray-800 border border-gray-700 px-3 py-2 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white capitalize">{d.decision_type.replace(/_/g, ' ')}</span>
                          <span className="text-gray-500">{new Date(d.created_at).toLocaleDateString()}</span>
                          {d.confidence_score != null && <span className="text-gray-500">confidence: {d.confidence_score}/10</span>}
                        </div>
                        <p className="text-gray-400 mt-1">{d.decision_summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <PlumbingReviewCommentsPanel
                comments={comments}
                onAddComment={handleComment}
                currentUserId={currentUserId}
              />
              {feedback.length > 0 && <PlumbingReviewFeedbackPanel feedback={feedback} />}
            </div>

            {/* Right column — assignment + context */}
            <div className="space-y-5">
              <PlumbingReviewAssignmentPanel
                activeAssignment={activeAssignment}
                allAssignments={allAssignments}
                adminUsers={[]}
                currentUserId={currentUserId}
                onAssign={handleAssign}
                busy={busy}
              />

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-white">Case Context</div>
                {Object.keys(reviewCase.context_json ?? {}).length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(reviewCase.context_json).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-500 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                        <span className="text-gray-300 font-mono">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!Object.keys(reviewCase.context_json ?? {}).length && (
                  <div className="text-xs text-gray-600">No additional context</div>
                )}
              </div>
            </div>
          </div>
      </div>
    </ShadowLayout>
  );
}
