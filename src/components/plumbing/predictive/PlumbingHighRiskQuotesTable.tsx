import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertOctagon, AlertTriangle } from 'lucide-react';
import type { RiskProfileRecord, RiskTier } from '../../../lib/modules/parsers/plumbing/predictive/riskTypes';

interface PlumbingHighRiskQuotesTableProps {
  profiles: RiskProfileRecord[];
}

const TIER_STYLE: Record<RiskTier, string> = {
  low:      'text-teal-300 bg-teal-500/10 border-teal-500/30',
  medium:   'text-amber-300 bg-amber-500/10 border-amber-500/30',
  high:     'text-orange-300 bg-orange-500/10 border-orange-500/30',
  critical: 'text-red-300 bg-red-500/10 border-red-500/30',
};

const ROUTING_LABELS: Record<string, string> = {
  normal_live_path:           'Normal',
  shadow_compare_recommended: 'Shadow compare',
  shadow_only_recommended:    'Shadow only',
  manual_review_recommended:  'Manual review',
  org_watchlist_recommended:  'Watchlist',
};

export default function PlumbingHighRiskQuotesTable({ profiles }: PlumbingHighRiskQuotesTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<RiskTier | 'all'>('all');

  const filtered = tierFilter === 'all'
    ? profiles
    : profiles.filter((p) => p.risk_tier === tierFilter);

  if (profiles.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No risk profiles recorded yet. Risk assessments appear here after quotes are evaluated.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">High-Risk Quotes</h2>
        <div className="flex gap-1">
          {(['all', 'critical', 'high', 'medium'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`text-[10px] px-2.5 py-1 rounded-md capitalize transition-colors ${
                tierFilter === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-gray-800">
        {filtered.slice(0, 50).map((profile) => {
          const isOpen = expanded === profile.id;
          const topFactor = profile.risk_factors_json?.[0];
          return (
            <div key={profile.id}>
              <button
                onClick={() => setExpanded(isOpen ? null : profile.id)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-800/40 transition-colors text-left"
              >
                <div className="text-gray-600 shrink-0">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
                {profile.risk_tier === 'critical'
                  ? <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-gray-300 truncate">{profile.source_id}</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    {profile.org_id ? `Org: ${profile.org_id.slice(0, 8)}...` : 'Unknown org'}
                    {topFactor && ` · ${topFactor.key.replace(/_/g, ' ')}`}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <RiskScoreBar score={profile.risk_score} />
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TIER_STYLE[profile.risk_tier]}`}>
                    {profile.risk_tier}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {ROUTING_LABELS[profile.routing_recommendation] ?? profile.routing_recommendation}
                  </span>
                  <span className="text-[10px] text-gray-600 w-20 text-right">
                    {new Date(profile.created_at).toLocaleDateString()}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-4 pt-1 bg-gray-900/50 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <InfoBox label="Risk score" value={`${profile.risk_score.toFixed(1)} / 100`} />
                    <InfoBox label="Risk tier" value={profile.risk_tier} />
                    <InfoBox label="Enriched" value={profile.post_parse_enriched ? 'Yes' : 'Pre-parse only'} />
                  </div>
                  {profile.risk_factors_json?.length > 0 && (
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1.5">Active risk factors</div>
                      <div className="space-y-1.5">
                        {profile.risk_factors_json.slice(0, 5).map((f) => (
                          <div key={f.key} className="flex items-start gap-2 text-xs bg-gray-800 border border-gray-700 px-3 py-2 rounded-lg">
                            <div className="flex-1">
                              <span className="font-mono text-gray-300">{f.key.replace(/_/g, ' ')}</span>
                              <span className="text-gray-600 ml-2 text-[10px]">{f.evidence}</span>
                            </div>
                            <div className="text-[10px] font-semibold text-orange-300 shrink-0">
                              {f.score.toFixed(0)}pts
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {profile.actual_outcome && (
                    <div className={`text-xs px-3 py-2 rounded-lg border ${
                      profile.prediction_correct ? 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}>
                      Outcome: {profile.actual_outcome} — prediction was {profile.prediction_correct ? 'correct' : 'incorrect'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length > 50 && (
        <div className="px-5 py-3 text-[10px] text-gray-500 border-t border-gray-800">
          Showing 50 of {filtered.length} records
        </div>
      )}
    </div>
  );
}

function RiskScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, score);
  const color = score >= 70 ? 'bg-red-500' : score >= 45 ? 'bg-orange-500' : score >= 20 ? 'bg-amber-500' : 'bg-teal-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-gray-500">{score.toFixed(0)}</span>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-xs font-medium text-white capitalize">{value}</div>
    </div>
  );
}
