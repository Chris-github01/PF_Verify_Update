import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Brain, Shield, AlertTriangle, FileSearch, Settings, TrendingUp } from 'lucide-react';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import PlumbingRiskDistributionCards from '../../components/plumbing/predictive/PlumbingRiskDistributionCards';
import PlumbingHighRiskQuotesTable from '../../components/plumbing/predictive/PlumbingHighRiskQuotesTable';
import PlumbingRiskFactorFrequencyPanel from '../../components/plumbing/predictive/PlumbingRiskFactorFrequencyPanel';
import PlumbingPredictivePolicyEditor from '../../components/plumbing/predictive/PlumbingPredictivePolicyEditor';
import PlumbingOrgRiskProfile from '../../components/plumbing/predictive/PlumbingOrgRiskProfile';
import PlumbingPredictionValidationPanel from '../../components/plumbing/predictive/PlumbingPredictionValidationPanel';
import {
  dbGetRiskProfiles,
  dbGetRiskDistribution,
  dbGetRiskPolicies,
} from '../../lib/db/predictiveDb';
import { computeValidationMetrics } from '../../lib/modules/parsers/plumbing/predictive/validatePredictions';
import type {
  RiskProfileRecord,
  RiskPolicyRecord,
  PredictionValidationMetrics,
} from '../../lib/modules/parsers/plumbing/predictive/riskTypes';

type ActiveTab = 'overview' | 'quotes' | 'factors' | 'orgs' | 'policies' | 'validation';

const TABS: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview',    label: 'Risk Overview',  icon: <Shield className="w-3.5 h-3.5" /> },
  { key: 'quotes',      label: 'High-Risk Quotes', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { key: 'factors',     label: 'Risk Factors',   icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { key: 'orgs',        label: 'Org Profiles',   icon: <FileSearch className="w-3.5 h-3.5" /> },
  { key: 'policies',    label: 'Policies',        icon: <Settings className="w-3.5 h-3.5" /> },
  { key: 'validation',  label: 'Validation',      icon: <Brain className="w-3.5 h-3.5" /> },
];

export default function PlumbingPredictiveDashboard() {
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodDays, setPeriodDays] = useState(7);

  const [profiles, setProfiles] = useState<RiskProfileRecord[]>([]);
  const [policies, setPolicies] = useState<RiskPolicyRecord[]>([]);
  const [distribution, setDistribution] = useState({
    total: 0, low: 0, medium: 0, high: 0, critical: 0,
    shadowRecommended: 0, reviewRecommended: 0,
  });
  const [validationMetrics, setValidationMetrics] = useState<PredictionValidationMetrics | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [profileData, policyData, distData] = await Promise.all([
      dbGetRiskProfiles({ limit: 200, periodDays }),
      dbGetRiskPolicies(),
      dbGetRiskDistribution(periodDays),
    ]);
    setProfiles(profileData);
    setPolicies(policyData);
    setDistribution(distData);
    const enriched = profileData.filter((p) => p.actual_outcome != null);
    if (enriched.length > 0) {
      setValidationMetrics(computeValidationMetrics(profileData));
    }
  }, [periodDays]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const highRiskProfiles = profiles.filter(
    (p) => p.risk_tier === 'high' || p.risk_tier === 'critical'
  );

  const orgIds = Array.from(new Set(profiles.map((p) => p.org_id).filter(Boolean) as string[]));

  const activePolicy = policies.find((p) => p.is_active);

  if (loading) {
    return (
      <ShadowGuard>
        <ShadowLayout>
          <div className="text-center py-16 text-sm text-gray-500">Loading predictive intelligence...</div>
        </ShadowLayout>
      </ShadowGuard>
    );
  }

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-cyan-400" />
                Predictive Intelligence — plumbing_parser
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Pre-parse risk scoring. All routing is advisory. No automatic production changes.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-white border border-gray-700 bg-gray-900 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Active policy banner */}
          {activePolicy && (
            <div className="bg-teal-900/20 border border-teal-800/40 rounded-xl px-5 py-3 flex items-center justify-between">
              <div>
                <span className="text-xs text-teal-300 font-medium">Active policy: </span>
                <span className="text-xs text-white">{activePolicy.policy_name}</span>
                <span className="text-[10px] text-gray-500 ml-2">{activePolicy.description}</span>
              </div>
              <div className="text-[10px] text-gray-500">
                Auto-shadow: {activePolicy.policy_json.autoShadowRouteEnabled ? <span className="text-cyan-400">ON</span> : 'off'} ·
                Review queue: {activePolicy.policy_json.autoReviewQueueEnabled ? <span className="text-amber-400">ON</span> : 'off'}
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <QuickStat label="Total assessed" value={distribution.total} />
            <QuickStat label="High + critical" value={distribution.high + distribution.critical} highlight />
            <QuickStat label="Shadow recommended" value={distribution.shadowRecommended} />
            <QuickStat label="Review recommended" value={distribution.reviewRecommended} />
          </div>

          {/* Tab bar */}
          <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-1 flex-wrap">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg flex-1 justify-center transition-colors ${
                  tab === t.key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'overview' && (
            <PlumbingRiskDistributionCards
              distribution={distribution}
              periodDays={periodDays}
              onPeriodChange={(d) => { setPeriodDays(d); }}
            />
          )}

          {tab === 'quotes' && (
            <PlumbingHighRiskQuotesTable profiles={highRiskProfiles} />
          )}

          {tab === 'factors' && (
            <PlumbingRiskFactorFrequencyPanel profiles={profiles} />
          )}

          {tab === 'orgs' && (
            <div className="space-y-4">
              {orgIds.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
                  No org risk data yet
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {orgIds.map((orgId) => (
                      <button
                        key={orgId}
                        onClick={() => setSelectedOrgId(orgId)}
                        className={`text-[10px] font-mono px-3 py-1.5 rounded-lg border transition-colors ${
                          selectedOrgId === orgId ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-800 text-gray-500 hover:text-white'
                        }`}
                      >
                        {orgId.slice(0, 12)}...
                      </button>
                    ))}
                  </div>
                  {selectedOrgId ? (
                    <PlumbingOrgRiskProfile orgId={selectedOrgId} profiles={profiles} />
                  ) : (
                    <div className="text-xs text-gray-600 text-center">Select an org above</div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'policies' && (
            <PlumbingPredictivePolicyEditor
              policies={policies}
              onRefresh={handleRefresh}
            />
          )}

          {tab === 'validation' && (
            validationMetrics ? (
              <PlumbingPredictionValidationPanel metrics={validationMetrics} />
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                <Brain className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                <div className="text-sm text-gray-500">No validated outcomes yet.</div>
                <div className="text-xs text-gray-600 mt-1">
                  Prediction validation requires actual outcome data recorded against risk profiles.
                </div>
              </div>
            )
          )}

          {/* Quick links */}
          <div className="flex items-center gap-4 text-xs pt-2 border-t border-gray-800">
            <a href="/shadow/modules/plumbing_parser/learning" className="text-amber-400 hover:text-amber-300 transition-colors">
              Learning system →
            </a>
            <a href="/shadow/modules/plumbing_parser/beta" className="text-gray-400 hover:text-white transition-colors">
              Beta intelligence →
            </a>
            <a href="/shadow/modules/plumbing_parser/release" className="text-gray-400 hover:text-white transition-colors">
              Release system →
            </a>
          </div>
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}

function QuickStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${highlight && value > 0 ? 'text-orange-300' : 'text-white'}`}>{value}</div>
    </div>
  );
}
