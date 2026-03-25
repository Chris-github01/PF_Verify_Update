import { Building2, ChevronRight } from 'lucide-react';
import type { OrgRiskProfile } from '../../../lib/modules/parsers/plumbing/analytics/analyticsTypes';

interface PlumbingOrgHeatmapProps {
  orgs: OrgRiskProfile[];
  onSelectOrg: (orgId: string) => void;
}

const TIER_CONFIG = {
  critical: { label: 'Critical',  bg: 'bg-red-500/10',    border: 'border-red-600/40',    text: 'text-red-300',    dot: 'bg-red-500' },
  high:     { label: 'High',      bg: 'bg-orange-500/10', border: 'border-orange-600/40', text: 'text-orange-300', dot: 'bg-orange-500' },
  medium:   { label: 'Medium',    bg: 'bg-amber-500/10',  border: 'border-amber-600/40',  text: 'text-amber-300',  dot: 'bg-amber-500' },
  low:      { label: 'Low',       bg: 'bg-teal-500/10',   border: 'border-teal-700/30',   text: 'text-teal-300',   dot: 'bg-teal-500' },
};

function nzd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

export default function PlumbingOrgHeatmap({ orgs, onSelectOrg }: PlumbingOrgHeatmapProps) {
  const tiers = (['critical', 'high', 'medium', 'low'] as const).map((tier) => ({
    tier,
    orgs: orgs.filter((o) => o.riskTier === tier),
  }));

  if (orgs.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-sm text-gray-600">
        No org risk data yet. Risk profiles appear as impact events are recorded per organisation.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          Org Risk Heatmap
        </h2>
        <p className="text-[10px] text-gray-500 mt-0.5">Ranked by total estimated financial risk</p>
      </div>

      <div className="p-5 space-y-5">
        {tiers.filter((t) => t.orgs.length > 0).map(({ tier, orgs: tierOrgs }) => {
          const cfg = TIER_CONFIG[tier];
          return (
            <div key={tier}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.text}`}>{cfg.label} Risk</span>
                <span className="text-[10px] text-gray-600">({tierOrgs.length})</span>
              </div>
              <div className="space-y-1.5">
                {tierOrgs.map((org) => (
                  <button
                    key={org.orgId}
                    onClick={() => onSelectOrg(org.orgId)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border ${cfg.bg} ${cfg.border} hover:opacity-80 transition-opacity group`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-white truncate">{org.orgId.slice(0, 16)}…</div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-gray-500">{org.reviewFrequency} events</span>
                        <span className="text-[10px] text-gray-500">{org.commonIssues.slice(0, 2).join(', ').replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-gray-600">{new Date(org.lastActivity).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className={`text-sm font-bold shrink-0 ${cfg.text}`}>{nzd(org.totalRiskPrevented)}</div>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
