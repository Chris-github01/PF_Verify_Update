import type { ReviewCase, ReviewPriority } from '../../../lib/modules/parsers/plumbing/review/reviewTypes';
import { isOverdue } from '../../../lib/modules/parsers/plumbing/review/calculateSlaDueAt';

interface WorkloadEntry {
  userId: string;
  activeCases: ReviewCase[];
  overdueCases: number;
  completedCases: number;
}

interface PlumbingReviewerWorkloadTableProps {
  cases: ReviewCase[];
  assignments: { review_case_id: string; assigned_to: string; active: boolean }[];
}

export default function PlumbingReviewerWorkloadTable({ cases, assignments }: PlumbingReviewerWorkloadTableProps) {
  const caseMap = new Map(cases.map((c) => [c.id, c]));
  const reviewerMap = new Map<string, WorkloadEntry>();

  for (const assignment of assignments) {
    if (!assignment.active) continue;
    const c = caseMap.get(assignment.review_case_id);
    if (!c) continue;
    const entry = reviewerMap.get(assignment.assigned_to) ?? {
      userId: assignment.assigned_to,
      activeCases: [],
      overdueCases: 0,
      completedCases: 0,
    };
    entry.activeCases.push(c);
    if (isOverdue(c.sla_due_at)) entry.overdueCases++;
    reviewerMap.set(assignment.assigned_to, entry);
  }

  const completedCases = cases.filter((c) => c.case_status === 'completed');
  for (const c of completedCases) {
    const assignment = assignments.find((a) => a.review_case_id === c.id);
    if (!assignment) continue;
    const entry = reviewerMap.get(assignment.assigned_to);
    if (entry) entry.completedCases++;
  }

  const workload = Array.from(reviewerMap.values()).sort((a, b) => b.activeCases.length - a.activeCases.length);

  if (workload.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No active reviewer assignments
      </div>
    );
  }

  const priorityBreakdown = (entry: WorkloadEntry): Record<ReviewPriority, number> => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<ReviewPriority, number>;
    for (const c of entry.activeCases) counts[c.priority]++;
    return counts;
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Reviewer Workload</h2>
      </div>
      <div className="divide-y divide-gray-800">
        {workload.map((entry) => {
          const breakdown = priorityBreakdown(entry);
          const hasOverdue = entry.overdueCases > 0;
          return (
            <div key={entry.userId} className="px-5 py-4 flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${hasOverdue ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-300'}`}>
                {entry.userId.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white font-mono">{entry.userId.slice(0, 12)}…</div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {breakdown.critical > 0 && <span className="text-[10px] text-red-400">{breakdown.critical} critical</span>}
                  {breakdown.high > 0 && <span className="text-[10px] text-orange-400">{breakdown.high} high</span>}
                  {breakdown.medium > 0 && <span className="text-[10px] text-amber-400">{breakdown.medium} medium</span>}
                  {breakdown.low > 0 && <span className="text-[10px] text-gray-500">{breakdown.low} low</span>}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0 text-right">
                <div>
                  <div className="text-[10px] text-gray-500">Active</div>
                  <div className="text-sm font-bold text-white">{entry.activeCases.length}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Overdue</div>
                  <div className={`text-sm font-bold ${hasOverdue ? 'text-red-400' : 'text-gray-600'}`}>{entry.overdueCases}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Completed</div>
                  <div className="text-sm font-bold text-teal-300">{entry.completedCases}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
