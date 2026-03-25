import { Building2 } from 'lucide-react';
import type { OrgRiskEntry } from '../../../lib/modules/parsers/plumbing/beta/buildBetaHealthSummary';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  healthy: { label: 'Healthy', color: 'text-teal-300 bg-teal-500/10' },
  watch: { label: 'Watch', color: 'text-amber-300 bg-amber-500/10' },
  at_risk: { label: 'At Risk', color: 'text-orange-300 bg-orange-500/10' },
  critical: { label: 'Critical', color: 'text-red-300 bg-red-500/10' },
};

interface PlumbingOrgRiskTableProps {
  orgs: OrgRiskEntry[];
}

export default function PlumbingOrgRiskTable({ orgs }: PlumbingOrgRiskTableProps) {
  if (orgs.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No org-level data yet. Org beta traffic will appear here once enabled.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
        <Building2 className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-white">Org Risk Concentration</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500">
              <th className="text-left px-5 py-3 font-medium">Org ID</th>
              <th className="text-right px-3 py-3 font-medium">Runs</th>
              <th className="text-right px-3 py-3 font-medium">Failed</th>
              <th className="text-right px-3 py-3 font-medium">Anomalies</th>
              <th className="text-right px-3 py-3 font-medium">Critical</th>
              <th className="text-right px-3 py-3 font-medium">Avg Delta</th>
              <th className="text-right px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {orgs.map((o) => {
              const sc = STATUS_CONFIG[o.healthStatus];
              return (
                <tr key={o.orgId} className="hover:bg-gray-800/20 transition-colors">
                  <td className="px-5 py-3 font-mono text-gray-300 text-[10px]">
                    {o.orgId.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-3 text-right text-gray-200">{o.totalRuns}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={o.failedRuns > 0 ? 'text-red-400' : 'text-gray-500'}>{o.failedRuns}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={o.anomalyCount > 0 ? 'text-amber-400' : 'text-gray-500'}>{o.anomalyCount}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={o.criticalCount > 0 ? 'text-red-400 font-semibold' : 'text-gray-500'}>{o.criticalCount}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-400">
                    {o.avgDelta != null ? `$${Math.abs(o.avgDelta).toLocaleString('en-AU', { minimumFractionDigits: 0 })}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.color}`}>
                      {sc.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
