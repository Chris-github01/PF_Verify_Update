import { ExternalLink } from 'lucide-react';
import type { BetaEventRecord } from '../../../lib/modules/parsers/plumbing/beta/anomalyTypes';

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-teal-300 bg-teal-500/10',
  failed: 'text-red-300 bg-red-500/10',
  partial: 'text-amber-300 bg-amber-500/10',
};

const MODE_COLORS: Record<string, string> = {
  shadow: 'text-cyan-300 bg-cyan-500/10',
  live: 'text-gray-400 bg-gray-800',
};

interface PlumbingBetaRunsTableProps {
  events: BetaEventRecord[];
}

export default function PlumbingBetaRunsTable({ events }: PlumbingBetaRunsTableProps) {
  if (events.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No beta run events recorded yet
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Recent Beta Runs</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500">
              <th className="text-left px-5 py-3 font-medium">When</th>
              <th className="text-left px-3 py-3 font-medium">Mode</th>
              <th className="text-left px-3 py-3 font-medium">Context</th>
              <th className="text-left px-3 py-3 font-medium">Org</th>
              <th className="text-left px-3 py-3 font-medium">Status</th>
              <th className="text-right px-5 py-3 font-medium">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {events.map((e) => (
              <tr key={e.id} className="hover:bg-gray-800/20 transition-colors">
                <td className="px-5 py-3 text-gray-500 font-mono text-[10px] whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${MODE_COLORS[e.parser_mode_used] ?? ''}`}>
                    {e.parser_mode_used}
                  </span>
                </td>
                <td className="px-3 py-3 text-gray-500 text-[10px] font-mono">
                  {e.rollout_context ?? '—'}
                </td>
                <td className="px-3 py-3 text-gray-500 font-mono text-[10px]">
                  {e.org_id ? e.org_id.slice(0, 8) + '…' : '—'}
                </td>
                <td className="px-3 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[e.run_status] ?? ''}`}>
                    {e.run_status}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {e.run_id && (
                    <a
                      href={`/shadow/modules/plumbing_parser/runs/${e.run_id}`}
                      className="text-gray-500 hover:text-cyan-400 transition-colors"
                      title="View run"
                    >
                      <ExternalLink className="w-3.5 h-3.5 inline" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
