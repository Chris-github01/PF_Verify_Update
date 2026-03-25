import { dbCreateDraft } from '../../../db/shadowOutputs';
import { logAdminAction } from '../../../shadow/auditLogger';
import type { PlumbingDiff, PlumbingAdjudicationDraft, ReviewStatus } from '../../../../types/plumbingDiscrepancy';

export async function savePlumbingAdjudicationDraft(params: {
  runId: string;
  sourceType: string;
  sourceId: string;
  diff: PlumbingDiff;
  adminNote?: string;
  reviewStatus?: ReviewStatus;
}): Promise<string> {
  const { runId, sourceType, sourceId, diff, adminNote, reviewStatus = 'unreviewed' } = params;

  const payload: PlumbingAdjudicationDraft = {
    moduleKey: 'plumbing_parser',
    sourceType,
    sourceId,
    runId,
    compareSummary: diff.adjudicationSummary,
    totalsComparison: diff.totalsComparison,
    rowChanges: diff.rowClassificationChanges,
    excludedRows: diff.shadowExcludedRows,
    suspiciousRows: diff.shadowSuspiciousRows,
    riskFlags: diff.riskFlags,
    recommendedOutcome: diff.recommendedOutcome,
    reviewStatus,
    adminNote,
  };

  const draft = await dbCreateDraft({
    module_key: 'plumbing_parser',
    source_type: sourceType,
    source_id: sourceId,
    draft_name: `Plumbing Adjudication — Run ${runId.slice(0, 8)} — ${new Date().toLocaleDateString('en-NZ')}`,
    payload_json: payload as unknown as Record<string, unknown>,
  });

  await logAdminAction({
    action: 'save_plumbing_adjudication_draft',
    entityType: 'shadow_drafts',
    entityId: draft.id,
    moduleKey: 'plumbing_parser',
    after: {
      runId,
      recommendedOutcome: diff.recommendedOutcome,
      reviewStatus,
      riskFlagCount: diff.riskFlags.length,
    },
  });

  return draft.id;
}
