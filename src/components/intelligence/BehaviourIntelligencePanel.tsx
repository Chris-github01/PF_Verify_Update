import type { BehaviourProfile, BehaviourEvent } from '../../lib/intelligence/types';
import BehaviourRiskBadge from './BehaviourRiskBadge';

interface Props {
  profile: BehaviourProfile | null;
  recentEvents?: BehaviourEvent[];
}

const EVENT_SEVERITY_STYLES = {
  info: 'text-slate-400',
  warning: 'text-amber-400',
  critical: 'text-red-400',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  low_core_scope_coverage: 'Low Core Scope Coverage',
  high_exclusion_density: 'High Exclusion Density',
  high_risk_scope_density: 'High Risk Scope Density',
  failed_decision_gate: 'Failed Decision Gate',
  document_total_mismatch: 'Document Total Mismatch',
  award_confirmed: 'Award Confirmed',
};

function TrendIndicator({ direction }: { direction: string }) {
  if (direction === 'improving') return <span className="text-emerald-400 text-xs font-medium">Improving</span>;
  if (direction === 'deteriorating') return <span className="text-red-400 text-xs font-medium">Deteriorating</span>;
  if (direction === 'stable') return <span className="text-slate-400 text-xs font-medium">Stable</span>;
  return <span className="text-slate-500 text-xs font-medium">Unknown</span>;
}

export default function BehaviourIntelligencePanel({ profile, recentEvents = [] }: Props) {
  if (!profile || profile.totalTendersSeen === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-10 h-10 bg-slate-700/50 rounded-full flex items-center justify-center mb-3">
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p className="text-sm text-slate-400">No historical data</p>
        <p className="text-xs text-slate-500 mt-1">Behaviour profile will build across future tenders</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">Behaviour Risk</p>
          <BehaviourRiskBadge rating={profile.behaviourRiskRating} />
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Trend</p>
          <TrendIndicator direction={profile.trendDirection} />
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Tenders Seen</p>
          <p className="text-sm font-semibold text-slate-200">{profile.totalTendersSeen}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800/50 rounded-lg p-2.5">
          <p className="text-xs text-slate-500 mb-0.5">Avg Core Coverage</p>
          <p className={`text-base font-bold ${
            profile.avgCoreScopeCoveragePct >= 80 ? 'text-emerald-400' :
            profile.avgCoreScopeCoveragePct >= 65 ? 'text-amber-400' : 'text-red-400'
          }`}>
            {profile.avgCoreScopeCoveragePct.toFixed(0)}%
          </p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2.5">
          <p className="text-xs text-slate-500 mb-0.5">Avg Exclusions</p>
          <p className={`text-base font-bold ${
            profile.avgExcludedScopeCount <= 2 ? 'text-emerald-400' :
            profile.avgExcludedScopeCount <= 4 ? 'text-amber-400' : 'text-red-400'
          }`}>
            {profile.avgExcludedScopeCount.toFixed(1)}
          </p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-2.5">
          <p className="text-xs text-slate-500 mb-0.5">Red Flags</p>
          <p className={`text-base font-bold ${profile.historicalRedFlagCount === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {profile.historicalRedFlagCount}
          </p>
        </div>
      </div>

      {profile.trendSummary && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3">
          <p className="text-xs text-slate-300 leading-relaxed">{profile.trendSummary}</p>
        </div>
      )}

      {recentEvents.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Recent Events</h4>
          <div className="space-y-1.5">
            {recentEvents.slice(0, 4).map((event, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 flex-shrink-0 ${EVENT_SEVERITY_STYLES[event.severity]}`}>•</span>
                <span className={EVENT_SEVERITY_STYLES[event.severity]}>
                  {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
