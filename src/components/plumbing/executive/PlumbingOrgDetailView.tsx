import { ArrowLeft, Building2, Shield, AlertTriangle } from 'lucide-react';
import type { OrgRiskProfile, ImpactEvent } from '../../../lib/modules/parsers/plumbing/analytics/analyticsTypes';

interface PlumbingOrgDetailViewProps {
  org: OrgRiskProfile;
  events: ImpactEvent[];
  onBack: () => void;
}

function nzd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

const IMPACT_LABELS: Record<string, string> = {
  duplicate_total_prevented:    'Duplicate total prevented',
  incorrect_total_detected:     'Incorrect total detected',
  classification_error_prevented: 'Classification error prevented',
  manual_review_correction:     'Manual review correction',
  high_risk_flagged_pre_parse:  'High-risk flagged pre-parse',
};

const IMPACT_COLOR: Record<string, string> = {
  duplicate_total_prevented:    'text-orange-300',
  incorrect_total_detected:     'text-red-300',
  classification_error_prevented: 'text-amber-300',
  manual_review_correction:     'text-cyan-300',
  high_risk_flagged_pre_parse:  'text-teal-300',
};

const TIER_COLOR: Record<string, string> = {
  critical: 'text-red-300 bg-red-500/10 border-red-600/30',
  high:     'text-orange-300 bg-orange-500/10 border-orange-600/30',
  medium:   'text-amber-300 bg-amber-500/10 border-amber-600/30',
  low:      'text-teal-300 bg-teal-500/10 border-teal-600/30',
};

export default function PlumbingOrgDetailView({ org, events, onBack }: PlumbingOrgDetailViewProps) {
  const byType = events.reduce((acc, e) => {
    acc[e.impact_type] = (acc[e.impact_type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-500 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Building2 className="w-5 h-5 text-gray-400" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-white font-mono">{org.orgId}</div>
          <div className="text-[10px] text-gray-500">Org Risk Detail</div>
        </div>
        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border capitalize ${TIER_COLOR[org.riskTier]}`}>
          {org.riskTier} risk
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetaBox label="Total risk prevented" value={nzd(org.totalRiskPrevented)} color="text-teal-300" />
        <MetaBox label="Total impact events" value={`${org.reviewFrequency}`} color="text-white" />
        <MetaBox label="Avg risk / event" value={nzd(org.avgRiskScore)} color="text-amber-300" />
        <MetaBox label="Last activity" value={new Date(org.lastActivity).toLocaleDateString()} color="text-gray-300" />
      </div>

      {Object.keys(byType).length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-xs font-semibold text-white mb-3">Issue breakdown</div>
          <div className="space-y-2">
            {Object.entries(byType).sort(([, a], [, b]) => b - a).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <span className={`text-xs ${IMPACT_COLOR[type] ?? 'text-gray-400'}`}>{IMPACT_LABELS[type] ?? type}</span>
                <span className="text-xs font-bold text-white">{count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <div className="text-xs font-semibold text-white">Impact Event History</div>
        </div>
        <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
          {events.length === 0 && (
            <div className="py-6 text-center text-xs text-gray-600">No events for this org</div>
          )}
          {events.map((e) => (
            <div key={e.id} className="px-5 py-3 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-medium ${IMPACT_COLOR[e.impact_type] ?? 'text-gray-300'}`}>
                  {IMPACT_LABELS[e.impact_type] ?? e.impact_type}
                </div>
                <div className="text-[10px] text-gray-500 font-mono mt-0.5">{e.source_id.slice(0, 16)}…</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-white">{e.estimated_financial_value != null ? nzd(e.estimated_financial_value) : '—'}</div>
                <div className="text-[10px] text-gray-600">{new Date(e.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-3">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
