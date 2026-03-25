import { Clock, AlertTriangle } from 'lucide-react';
import { formatTimeRemaining, isOverdue } from '../../../lib/modules/parsers/plumbing/review/calculateSlaDueAt';
import type { ReviewPriority } from '../../../lib/modules/parsers/plumbing/review/reviewTypes';

interface PlumbingReviewSlaBadgeProps {
  slaDueAt?: string;
  priority: ReviewPriority;
  compact?: boolean;
}

const PRIORITY_COLOR: Record<ReviewPriority, string> = {
  critical: 'text-red-300',
  high:     'text-orange-300',
  medium:   'text-amber-300',
  low:      'text-gray-400',
};

export default function PlumbingReviewSlaBadge({ slaDueAt, priority, compact }: PlumbingReviewSlaBadgeProps) {
  const overdue = isOverdue(slaDueAt);
  const remaining = formatTimeRemaining(slaDueAt);

  if (!slaDueAt) {
    return <span className="text-[10px] text-gray-600">No SLA set</span>;
  }

  if (compact) {
    return (
      <span className={`flex items-center gap-1 text-[10px] font-medium ${overdue ? 'text-red-400' : PRIORITY_COLOR[priority]}`}>
        {overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
        {remaining}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium ${
      overdue
        ? 'bg-red-500/10 border-red-500/30 text-red-300'
        : priority === 'critical'
        ? 'bg-red-500/10 border-red-500/20 text-red-300'
        : priority === 'high'
        ? 'bg-orange-500/10 border-orange-500/20 text-orange-300'
        : 'bg-gray-800 border-gray-700 text-gray-400'
    }`}>
      {overdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {remaining}
    </div>
  );
}
