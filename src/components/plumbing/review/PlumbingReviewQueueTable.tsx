import { useState } from 'react';
import { ChevronRight, AlertOctagon, AlertTriangle, User } from 'lucide-react';
import type { ReviewCase, CaseStatus, ReviewPriority } from '../../../lib/modules/parsers/plumbing/review/reviewTypes';
import { isOverdue } from '../../../lib/modules/parsers/plumbing/review/calculateSlaDueAt';
import PlumbingReviewSlaBadge from './PlumbingReviewSlaBadge';

interface PlumbingReviewQueueTableProps {
  cases: ReviewCase[];
  onSelectCase: (id: string) => void;
  onAssign?: (id: string) => void;
}

type FilterKey = 'all' | 'unassigned' | 'overdue' | 'critical';

const STATUS_STYLE: Record<CaseStatus, string> = {
  new:               'bg-gray-700 text-gray-300',
  queued:            'bg-blue-900/50 text-blue-300',
  assigned:          'bg-teal-900/50 text-teal-300',
  in_review:         'bg-amber-900/50 text-amber-300',
  awaiting_approval: 'bg-orange-900/50 text-orange-300',
  completed:         'bg-green-900/50 text-green-300',
  dismissed:         'bg-gray-800 text-gray-500',
};

const PRIORITY_ICON: Record<ReviewPriority, React.ReactNode> = {
  critical: <AlertOctagon className="w-3.5 h-3.5 text-red-400" />,
  high:     <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />,
  medium:   <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  low:      <AlertTriangle className="w-3.5 h-3.5 text-gray-600" />,
};

const ORIGIN_LABELS: Record<string, string> = {
  predictive: 'Predictive',
  anomaly:    'Anomaly',
  regression: 'Regression',
  manual:     'Manual',
};

export default function PlumbingReviewQueueTable({
  cases,
  onSelectCase,
}: PlumbingReviewQueueTableProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = cases.filter((c) => {
    if (filter === 'overdue') return isOverdue(c.sla_due_at);
    if (filter === 'critical') return c.priority === 'critical';
    if (filter === 'unassigned') return c.case_status === 'queued' || c.case_status === 'new';
    return true;
  });

  if (cases.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
        <div className="text-sm text-gray-500">No review cases in queue</div>
        <div className="text-xs text-gray-600 mt-1">Cases appear here from anomaly detection, regression failures, or predictive risk scoring.</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Review Queue</h2>
        <div className="flex gap-1">
          {(['all', 'critical', 'overdue', 'unassigned'] as FilterKey[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] px-2.5 py-1 rounded-md capitalize transition-colors ${
                filter === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              {f} {f !== 'all' && <span className="ml-0.5 text-gray-600">
                ({cases.filter((c) =>
                  f === 'overdue' ? isOverdue(c.sla_due_at)
                  : f === 'critical' ? c.priority === 'critical'
                  : f === 'unassigned' ? (c.case_status === 'new' || c.case_status === 'queued')
                  : true
                ).length})
              </span>}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-gray-800">
        {filtered.slice(0, 100).map((c) => (
          <button
            key={c.id}
            onClick={() => onSelectCase(c.id)}
            className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/40 transition-colors text-left group"
          >
            <div className="shrink-0">{PRIORITY_ICON[c.priority]}</div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{c.context_summary}</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] text-gray-600 font-mono">{c.source_id.slice(0, 14)}…</span>
                {c.org_id && <span className="text-[10px] text-gray-600">Org {c.org_id.slice(0, 8)}…</span>}
                <span className="text-[10px] text-gray-600">{ORIGIN_LABELS[c.case_origin]}</span>
                {c.release_impact_note && (
                  <span className="text-[10px] text-amber-400">Release impact</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <PlumbingReviewSlaBadge slaDueAt={c.sla_due_at} priority={c.priority} compact />
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${STATUS_STYLE[c.case_status]}`}>
                {c.case_status.replace(/_/g, ' ')}
              </span>
              <span className={`text-[10px] capitalize font-semibold ${
                c.priority === 'critical' ? 'text-red-400'
                : c.priority === 'high' ? 'text-orange-400'
                : c.priority === 'medium' ? 'text-amber-400'
                : 'text-gray-500'
              }`}>{c.priority}</span>
              <ChevronRight className="w-4 h-4 text-gray-700 group-hover:text-gray-400 transition-colors" />
            </div>
          </button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-600">No cases match this filter</div>
      )}
    </div>
  );
}
