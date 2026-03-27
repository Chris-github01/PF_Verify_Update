import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle, Clock, XCircle, Eye, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import {
  getLearningQueue,
  updateQueueStatus,
  getQueueStats,
  type LearningQueueEntryWithRun,
  type QueueStatus,
} from '../../../lib/shadow/phase2/learningQueueService';

const STATUS_LABELS: Record<QueueStatus, string> = {
  pending: 'Pending',
  in_review: 'In Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

function statusBadgeClass(status: QueueStatus): string {
  if (status === 'pending') return 'bg-amber-900/40 text-amber-300 border-amber-700';
  if (status === 'in_review') return 'bg-blue-900/40 text-blue-300 border-blue-700';
  if (status === 'resolved') return 'bg-teal-900/40 text-teal-300 border-teal-700';
  if (status === 'dismissed') return 'bg-gray-800 text-gray-500 border-gray-700';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

function priorityColor(score: number): string {
  if (score >= 70) return 'text-red-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-blue-400';
}

function priorityLabel(score: number): string {
  if (score >= 70) return 'Critical';
  if (score >= 40) return 'High';
  if (score >= 20) return 'Medium';
  return 'Low';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NZ', { dateStyle: 'short' });
}

interface Props {
  onSelectRun?: (runId: string) => void;
  filterStatus?: QueueStatus;
}

export default function LearningQueueTable({ onSelectRun, filterStatus }: Props) {
  const [entries, setEntries] = useState<LearningQueueEntryWithRun[]>([]);
  const [stats, setStats] = useState({ pending: 0, inReview: 0, resolved: 0, dismissed: 0, total: 0 });
  const [activeFilter, setActiveFilter] = useState<QueueStatus | undefined>(filterStatus ?? 'pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [activeFilter]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [data, s] = await Promise.all([
        getLearningQueue(activeFilter, 200),
        getQueueStats(),
      ]);
      setEntries(data);
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(entryId: string, status: QueueStatus) {
    setUpdatingId(entryId);
    try {
      await updateQueueStatus(entryId, status);
      await load();
    } catch {
      // silent
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {([
          { key: 'pending' as QueueStatus, label: 'Pending', value: stats.pending, color: 'text-amber-400' },
          { key: 'in_review' as QueueStatus, label: 'In Review', value: stats.inReview, color: 'text-blue-400' },
          { key: 'resolved' as QueueStatus, label: 'Resolved', value: stats.resolved, color: 'text-teal-400' },
          { key: 'dismissed' as QueueStatus, label: 'Dismissed', value: stats.dismissed, color: 'text-gray-500' },
        ]).map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveFilter(activeFilter === s.key ? undefined : s.key)}
            className={`bg-gray-900 rounded-xl p-3 text-left border transition-all ${activeFilter === s.key ? 'border-amber-500/40' : 'border-gray-800 hover:border-gray-700'}`}
          >
            <div className="text-[10px] text-gray-600 mb-1">{s.label}</div>
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
          </button>
        ))}
      </div>

      {/* Filter tabs + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveFilter(undefined)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${!activeFilter ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
          >
            All ({stats.total})
          </button>
          {(Object.keys(STATUS_LABELS) as QueueStatus[]).map((key) => (
            <button
              key={key}
              onClick={() => setActiveFilter(activeFilter === key ? undefined : key)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${activeFilter === key ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
            >
              {STATUS_LABELS[key]}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
      )}

      {loading && entries.length === 0 ? (
        <div className="py-10 text-center">
          <Loader2 className="w-5 h-5 text-gray-600 animate-spin mx-auto mb-2" />
          <div className="text-sm text-gray-600">Loading queue...</div>
        </div>
      ) : entries.length === 0 ? (
        <div className="py-10 text-center bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
          <BookOpen className="w-6 h-6 text-gray-700 mx-auto mb-2" />
          <div className="text-sm text-gray-500">No entries in this queue state.</div>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Learning Reason</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Run</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-800/40 transition-colors group">
                  <td className="px-4 py-3">
                    <div className={`text-lg font-bold ${priorityColor(entry.priority_score)}`}>
                      {entry.priority_score}
                    </div>
                    <div className={`text-[10px] ${priorityColor(entry.priority_score)}`}>
                      {priorityLabel(entry.priority_score)}
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="text-xs text-gray-300 line-clamp-2">{entry.learning_reason}</div>
                    <div className="text-[10px] text-gray-600 font-mono mt-0.5">{entry.module_key}</div>
                  </td>
                  <td className="px-4 py-3">
                    {entry.run ? (
                      <div>
                        <div className="text-xs text-gray-300 font-mono truncate max-w-[120px]">
                          {entry.run.source_label ?? entry.run.source_id.slice(0, 8) + '…'}
                        </div>
                        <div className="text-[10px] text-gray-600">{entry.run.run_mode} • {formatDate(entry.run.started_at)}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600 font-mono">{entry.run_id.slice(0, 12)}…</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide ${statusBadgeClass(entry.status as QueueStatus)}`}>
                      {STATUS_LABELS[entry.status as QueueStatus] ?? entry.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {formatDate(entry.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {entry.status === 'pending' && (
                        <button
                          onClick={() => handleStatusChange(entry.id, 'in_review')}
                          disabled={updatingId === entry.id}
                          className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                          title="Start Review"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {entry.status === 'in_review' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(entry.id, 'resolved')}
                            disabled={updatingId === entry.id}
                            className="p-1.5 rounded hover:bg-teal-500/20 text-teal-400 transition-colors"
                            title="Mark Resolved"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleStatusChange(entry.id, 'dismissed')}
                            disabled={updatingId === entry.id}
                            className="p-1.5 rounded hover:bg-gray-700 text-gray-500 transition-colors"
                            title="Dismiss"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {onSelectRun && (
                        <button
                          onClick={() => onSelectRun(entry.run_id)}
                          className="p-1.5 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
                          title="View Run"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {updatingId === entry.id && <Loader2 className="w-3.5 h-3.5 text-gray-600 animate-spin ml-1" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
