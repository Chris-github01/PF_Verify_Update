import { Sparkles, Package, BarChart2, Route } from 'lucide-react';
import type { ReviewFeedback, FeedbackType } from '../../../lib/modules/parsers/plumbing/review/reviewTypes';

interface PlumbingReviewFeedbackPanelProps {
  feedback: ReviewFeedback[];
}

const FEEDBACK_ICON: Record<FeedbackType, React.ComponentType<{ className?: string }>> = {
  rule_training:            Sparkles,
  pattern_training:         Package,
  regression_case_candidate: BarChart2,
  routing_policy_candidate: Route,
};

const FEEDBACK_STYLE: Record<FeedbackType, string> = {
  rule_training:            'text-teal-300 bg-teal-500/10 border-teal-500/30',
  pattern_training:         'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  regression_case_candidate:'text-amber-300 bg-amber-500/10 border-amber-500/30',
  routing_policy_candidate: 'text-orange-300 bg-orange-500/10 border-orange-500/30',
};

const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  rule_training:            'Rule training candidate',
  pattern_training:         'Pattern training candidate',
  regression_case_candidate:'Regression case candidate',
  routing_policy_candidate: 'Routing policy candidate',
};

export default function PlumbingReviewFeedbackPanel({ feedback }: PlumbingReviewFeedbackPanelProps) {
  if (feedback.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center text-xs text-gray-600">
        No feedback generated yet. Feedback is created when reviewer records structured decisions.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-400" />
          Feedback Generated
        </h2>
        <p className="text-[10px] text-gray-500 mt-0.5">Advisory only — not auto-applied to production</p>
      </div>
      <div className="divide-y divide-gray-800">
        {feedback.map((fb) => {
          const Icon = FEEDBACK_ICON[fb.feedback_type];
          const style = FEEDBACK_STYLE[fb.feedback_type];
          return (
            <div key={fb.id} className="px-5 py-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${style}`}>
                  <Icon className="w-3 h-3" />
                  {FEEDBACK_LABELS[fb.feedback_type]}
                </span>
                {fb.applied && (
                  <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300">Applied</span>
                )}
                <span className="text-[10px] text-gray-600 ml-auto">{new Date(fb.created_at).toLocaleDateString()}</span>
              </div>
              {fb.payload_json.explanation && (
                <p className="text-xs text-gray-400 leading-relaxed">{String(fb.payload_json.explanation)}</p>
              )}
              {fb.payload_json.rationale && (
                <p className="text-[10px] text-gray-500 font-mono bg-gray-800 px-2 py-1 rounded">{String(fb.payload_json.rationale)}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
