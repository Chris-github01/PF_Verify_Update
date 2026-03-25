import type { RiskProfileRecord } from '../../../lib/modules/parsers/plumbing/predictive/riskTypes';

interface PlumbingOrgRiskProfileProps {
  orgId: string;
  profiles: RiskProfileRecord[];
}

export default function PlumbingOrgRiskProfile({ orgId, profiles }: PlumbingOrgRiskProfileProps) {
  const orgProfiles = profiles.filter((p) => p.org_id === orgId);

  if (orgProfiles.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No risk data for org {orgId}
      </div>
    );
  }

  const avgScore = orgProfiles.reduce((sum, p) => sum + p.risk_score, 0) / orgProfiles.length;
  const criticalCount = orgProfiles.filter((p) => p.risk_tier === 'critical').length;
  const highCount = orgProfiles.filter((p) => p.risk_tier === 'high').length;
  const anomalyCount = orgProfiles.filter((p) => p.actual_outcome === 'anomaly' || p.actual_outcome === 'failure').length;

  const factorFreq = new Map<string, number>();
  for (const p of orgProfiles) {
    for (const f of p.risk_factors_json ?? []) {
      factorFreq.set(f.key, (factorFreq.get(f.key) ?? 0) + 1);
    }
  }
  const topFactors = [...factorFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const shouldWatchlist = avgScore > 40 || criticalCount >= 2 || anomalyCount >= 3;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Org Risk Profile</h2>
          <div className="text-[10px] font-mono text-gray-500 mt-0.5">{orgId}</div>
        </div>
        {shouldWatchlist && (
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-300">
            Watchlist candidate
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="Assessed quotes" value={orgProfiles.length} color="text-white" />
          <StatBox label="Avg risk score" value={avgScore.toFixed(1)} color={avgScore > 50 ? 'text-red-300' : avgScore > 30 ? 'text-amber-300' : 'text-teal-300'} />
          <StatBox label="High/critical" value={criticalCount + highCount} color={criticalCount > 0 ? 'text-red-300' : 'text-orange-300'} />
          <StatBox label="Confirmed anomalies" value={anomalyCount} color={anomalyCount > 0 ? 'text-red-300' : 'text-gray-400'} />
        </div>

        {topFactors.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-500 mb-1.5">Common risk factors for this org</div>
            <div className="space-y-1">
              {topFactors.map(([key, count]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 capitalize">{key.replace(/_/g, ' ')}</span>
                  <span className="text-gray-500">{count}× detected</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] text-gray-500 mb-1.5">Recent assessments</div>
          <div className="space-y-1.5">
            {orgProfiles.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-3 text-xs bg-gray-800 border border-gray-700 px-3 py-2 rounded-lg">
                <span className="font-mono text-gray-400 truncate flex-1">{p.source_id}</span>
                <span className={`font-semibold ${p.risk_tier === 'critical' ? 'text-red-400' : p.risk_tier === 'high' ? 'text-orange-400' : 'text-gray-400'}`}>
                  {p.risk_score.toFixed(0)}
                </span>
                <span className="text-gray-600 capitalize">{p.risk_tier}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
