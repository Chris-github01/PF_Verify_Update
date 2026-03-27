import { useEffect, useState } from 'react';
import { getScopeIntelligenceForRun } from '../../../lib/shadow/phase3/scopeIntelligenceService';
import { getRateIntelligenceForRun } from '../../../lib/shadow/phase3/rateIntelligenceService';
import { getRevenueLeakageForRun } from '../../../lib/shadow/phase3/revenueLeakageService';
import { computeCommercialRiskProfile } from '../../../lib/shadow/phase3/commercialRiskEngine';
import type { CommercialRiskProfile, CommercialRiskLevel } from '../../../lib/shadow/phase3/commercialRiskEngine';

interface Props {
  runId: string;
}

function levelColor(level: CommercialRiskLevel): string {
  if (level === 'critical') return 'text-red-400';
  if (level === 'high') return 'text-orange-400';
  if (level === 'medium') return 'text-amber-400';
  return 'text-teal-400';
}

function levelBg(level: CommercialRiskLevel): string {
  if (level === 'critical') return 'bg-red-950/40 border-red-800';
  if (level === 'high') return 'bg-orange-950/40 border-orange-800';
  if (level === 'medium') return 'bg-amber-950/40 border-amber-800';
  return 'bg-teal-950/40 border-teal-800';
}

function ScoreMeter({ score, label }: { score: number; label: string }) {
  const color =
    score >= 75 ? 'bg-red-500' :
    score >= 50 ? 'bg-orange-500' :
    score >= 25 ? 'bg-amber-500' :
    'bg-teal-500';

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span>{score}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export default function CommercialRiskPanel({ runId }: Props) {
  const [profile, setProfile] = useState<CommercialRiskProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [scope, rates, leakage] = await Promise.all([
          getScopeIntelligenceForRun(runId),
          getRateIntelligenceForRun(runId),
          getRevenueLeakageForRun(runId),
        ]);

        const parsedValue = rates.records.reduce(
          (sum, r) => sum + (r.rate != null ? r.rate : 0),
          0,
        );

        const computed = computeCommercialRiskProfile(runId, scope, rates, leakage, parsedValue);
        setProfile(computed);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to compute risk profile');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [runId]);

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Computing commercial risk profile...</div>;
  if (error) return <div className="text-red-400 text-sm py-4">{error}</div>;
  if (!profile) return null;

  const noRisk = profile.overallScore === 0 && profile.factors.length === 0;

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border px-5 py-4 ${levelBg(profile.riskLevel)}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wider font-medium">Overall Risk Level</div>
            <div className={`text-2xl font-bold mt-0.5 ${levelColor(profile.riskLevel)}`}>
              {profile.riskLevel.toUpperCase()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-white">{profile.overallScore}</div>
            <div className="text-xs text-gray-500">/ 100</div>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-300">{profile.recommendation}</div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 space-y-3">
        <div className="text-xs font-medium text-gray-400 mb-2">Score Breakdown</div>
        <ScoreMeter score={profile.scopeScore} label="Scope Risk" />
        <ScoreMeter score={profile.rateScore} label="Rate Risk" />
        <ScoreMeter score={profile.leakageScore} label="Leakage Risk" />
      </div>

      {noRisk ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-6 text-center">
          <div className="text-teal-400 text-sm font-medium">No commercial risk factors detected</div>
          <div className="text-gray-600 text-xs mt-1">
            This run produced no scope gaps, rate anomalies, or leakage events.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400">Risk Factors (highest impact first)</div>
          {profile.factors.map((factor, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-wider ${levelColor(factor.severity)}`}>
                    {factor.severity}
                  </div>
                  <div className="text-sm text-gray-200 mt-0.5">{factor.description}</div>
                </div>
                <div className={`text-sm font-bold shrink-0 ${levelColor(factor.severity)}`}>
                  +{factor.score}
                </div>
              </div>
              <div className="text-xs text-gray-600 mt-1">{factor.factor.replace(/_/g, ' ')}</div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-700 text-right">
        Generated: {new Date(profile.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}
