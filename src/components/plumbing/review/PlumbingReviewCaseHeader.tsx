import { ArrowLeft, AlertOctagon, AlertTriangle, ExternalLink } from 'lucide-react';
import type { ReviewCase } from '../../../lib/modules/parsers/plumbing/review/reviewTypes';
import PlumbingReviewSlaBadge from './PlumbingReviewSlaBadge';

interface PlumbingReviewCaseHeaderProps {
  reviewCase: ReviewCase;
  onBack: () => void;
  onStatusChange: (status: string) => void;
  busy?: boolean;
}

const STATUS_TRANSITIONS: Record<string, { label: string; next: string }[]> = {
  new:               [{ label: 'Move to Queue', next: 'queued' }, { label: 'Dismiss', next: 'dismissed' }],
  queued:            [{ label: 'Dismiss', next: 'dismissed' }],
  assigned:          [{ label: 'Start Review', next: 'in_review' }, { label: 'Dismiss', next: 'dismissed' }],
  in_review:         [{ label: 'Send for Approval', next: 'awaiting_approval' }, { label: 'Dismiss', next: 'dismissed' }],
  awaiting_approval: [{ label: 'Complete', next: 'completed' }, { label: 'Re-open Review', next: 'in_review' }],
  completed:         [],
  dismissed:         [],
};

export default function PlumbingReviewCaseHeader({ reviewCase, onBack, onStatusChange, busy }: PlumbingReviewCaseHeaderProps) {
  const actions = STATUS_TRANSITIONS[reviewCase.case_status] ?? [];
  const Icon = reviewCase.priority === 'critical' ? AlertOctagon : AlertTriangle;
  const iconColor = reviewCase.priority === 'critical' ? 'text-red-400' : reviewCase.priority === 'high' ? 'text-orange-400' : 'text-amber-400';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Icon className={`w-5 h-5 ${iconColor} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">{reviewCase.context_summary}</div>
          <div className="text-[10px] text-gray-500 mt-0.5 font-mono">{reviewCase.source_id}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <PlumbingReviewSlaBadge slaDueAt={reviewCase.sla_due_at} priority={reviewCase.priority} />
          {actions.map((action) => (
            <button
              key={action.next}
              onClick={() => onStatusChange(action.next)}
              disabled={busy}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                action.next === 'dismissed'
                  ? 'border-gray-700 text-gray-400 hover:border-red-500/50 hover:text-red-400'
                  : action.next === 'completed'
                  ? 'border-teal-700/50 bg-teal-900/30 text-teal-300 hover:bg-teal-900/50'
                  : 'border-gray-700 text-gray-300 hover:border-teal-500/50 hover:text-teal-300'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetaBox label="Status" value={reviewCase.case_status.replace(/_/g, ' ')} />
        <MetaBox label="Priority" value={reviewCase.priority} />
        <MetaBox label="Origin" value={reviewCase.case_origin} />
        <MetaBox label="Created" value={new Date(reviewCase.created_at).toLocaleDateString()} />
      </div>

      {reviewCase.priority_explanation && (
        <p className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-3 py-2 rounded-lg">
          {reviewCase.priority_explanation}
        </p>
      )}

      {reviewCase.release_impact_note && (
        <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/30 rounded-lg px-3 py-2">
          <ExternalLink className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">{reviewCase.release_impact_note}</p>
        </div>
      )}

      {(reviewCase.anomaly_id || reviewCase.run_id || reviewCase.regression_case_result_id || reviewCase.risk_profile_id) && (
        <div className="flex flex-wrap gap-2">
          {reviewCase.anomaly_id && <RefChip label="Anomaly" value={reviewCase.anomaly_id} />}
          {reviewCase.run_id && <RefChip label="Run" value={reviewCase.run_id} />}
          {reviewCase.regression_case_result_id && <RefChip label="Regression result" value={reviewCase.regression_case_result_id} />}
          {reviewCase.risk_profile_id && <RefChip label="Risk profile" value={reviewCase.risk_profile_id} />}
        </div>
      )}
    </div>
  );
}

function MetaBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-xs font-medium text-white capitalize">{value}</div>
    </div>
  );
}

function RefChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-[10px] font-mono bg-gray-800 border border-gray-700 px-2 py-1 rounded-md text-gray-400">
      <span className="text-gray-600">{label}:</span>
      {value.slice(0, 12)}…
    </div>
  );
}
