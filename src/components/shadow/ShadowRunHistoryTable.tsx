import { Clock, CheckCircle, XCircle, Loader, Ban } from 'lucide-react';
import type { ShadowRunRecord, RunStatus } from '../../types/shadow';

const STATUS_CONFIG: Record<RunStatus, { icon: typeof Clock; color: string; label: string }> = {
  queued:    { icon: Clock,        color: 'text-gray-400',  label: 'Queued' },
  running:   { icon: Loader,       color: 'text-blue-400',  label: 'Running' },
  completed: { icon: CheckCircle,  color: 'text-green-400', label: 'Completed' },
  failed:    { icon: XCircle,      color: 'text-red-400',   label: 'Failed' },
  cancelled: { icon: Ban,          color: 'text-gray-500',  label: 'Cancelled' },
};

const MODE_LABELS: Record<string, string> = {
  shadow_only:      'Shadow Only',
  live_vs_shadow:   'Live vs Shadow',
  regression_suite: 'Regression Suite',
};

interface Props {
  runs: ShadowRunRecord[];
  onSelect?: (run: ShadowRunRecord) => void;
}

export default function ShadowRunHistoryTable({ runs, onSelect }: Props) {
  if (runs.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500 text-sm">
        No shadow runs yet. Run a comparison to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Live Ver</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Shadow Ver</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Started</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {runs.map((run) => {
            const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.queued;
            const Icon = cfg.icon;
            return (
              <tr
                key={run.id}
                className="hover:bg-gray-800/40 transition-colors cursor-pointer"
                onClick={() => onSelect?.(run)}
              >
                <td className="px-4 py-3">
                  <div className={`flex items-center gap-1.5 ${cfg.color}`}>
                    <Icon className={`w-3.5 h-3.5 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                    <span className="text-xs font-medium">{cfg.label}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-300">{MODE_LABELS[run.run_mode] ?? run.run_mode}</td>
                <td className="px-4 py-3 text-xs text-gray-400 font-mono truncate max-w-[160px]">
                  {run.source_label ?? run.source_id.slice(0, 8) + '...'}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-gray-400">{run.live_version ?? '—'}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-400">{run.shadow_version ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {run.status === 'completed' && (
                    <span className="text-xs text-amber-400 hover:text-amber-300">View →</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
