import { useState, useEffect, useCallback } from 'react';
import { Cpu, RefreshCw, Plus, Layers, Play, BarChart2, Trophy, Rocket, Info } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import PlumbingCandidateTable from '../../components/plumbing/optimization/PlumbingCandidateTable';
import PlumbingBundleBuilder from '../../components/plumbing/optimization/PlumbingBundleBuilder';
import PlumbingSimulationResultsPanel from '../../components/plumbing/optimization/PlumbingSimulationResultsPanel';
import PlumbingOptimizationRankingTable from '../../components/plumbing/optimization/PlumbingOptimizationRankingTable';
import PlumbingDeploymentRecommendationPanel from '../../components/plumbing/optimization/PlumbingDeploymentRecommendationPanel';
import {
  dbGetCandidates,
  dbGetBundles,
  dbGetRankings,
  dbGetAllBundlesWithDetails,
  dbGetBundleWithDetails,
  dbGenerateAndSaveBundles,
  dbRunAndScoreBundle,
  dbRunFullRankingPass,
  dbUpdateCandidateStatus,
  dbUpdateRankingPromotion,
  dbCreateCandidate,
} from '../../lib/db/optimizationDb';
import { generateManualCandidate } from '../../lib/modules/parsers/plumbing/optimization/generateCandidates';
import type {
  OptimizationCandidate,
  OptimizationBundle,
  OptimizationRun,
  OptimizationRanking,
  BundleWithRun,
} from '../../lib/modules/parsers/plumbing/optimization/optimizationTypes';

type Tab = 'candidates' | 'bundles' | 'simulation' | 'rankings' | 'recommendations';

const DEFAULT_BASELINE = { regressionPassRate: 92, anomalyRate: 4.5, predictiveAccuracy: 85 };

export default function PlumbingOptimizationDashboard() {
  const [tab, setTab] = useState<Tab>('candidates');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<OptimizationCandidate[]>([]);
  const [bundles, setBundles] = useState<OptimizationBundle[]>([]);
  const [rankings, setRankings] = useState<OptimizationRanking[]>([]);
  const [allBundlesWithDetails, setAllBundlesWithDetails] = useState<BundleWithRun[]>([]);

  const [selectedBundleDetail, setSelectedBundleDetail] = useState<BundleWithRun | null>(null);
  const [runningBundleId, setRunningBundleId] = useState<string | null>(null);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [newCandidateDesc, setNewCandidateDesc] = useState('');
  const [newCandidateRuleKey, setNewCandidateRuleKey] = useState('');

  const load = useCallback(async () => {
    const [cands, bnds, ranks, details] = await Promise.all([
      dbGetCandidates({ limit: 200 }),
      dbGetBundles({ limit: 100 }),
      dbGetRankings({ limit: 50 }),
      dbGetAllBundlesWithDetails(),
    ]);
    setCandidates(cands);
    setBundles(bnds);
    setRankings(ranks);
    setAllBundlesWithDetails(details);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  async function handleRefresh() {
    setActionLoading('refresh');
    await load();
    setActionLoading(null);
  }

  async function handleGenerateBundles() {
    setActionLoading('generate-bundles');
    try {
      const pending = candidates.filter((c) => c.status === 'pending');
      if (pending.length === 0) return;
      await dbGenerateAndSaveBundles(pending);
      await load();
      setTab('bundles');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRunBundle(bundleId: string) {
    setRunningBundleId(bundleId);
    try {
      const bundle = bundles.find((b) => b.id === bundleId);
      if (!bundle) return;
      await dbRunAndScoreBundle(bundle, DEFAULT_BASELINE);
      await load();
      setTab('simulation');
      const detail = await dbGetBundleWithDetails(bundleId);
      setSelectedBundleDetail(detail);
    } finally {
      setRunningBundleId(null);
    }
  }

  async function handleSelectBundle(bundleId: string) {
    const detail = await dbGetBundleWithDetails(bundleId);
    setSelectedBundleDetail(detail);
    setTab('simulation');
  }

  async function handleRunAllRankings() {
    setActionLoading('rank');
    try {
      await dbRunFullRankingPass(DEFAULT_BASELINE);
      await load();
      setTab('rankings');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRejectCandidate(id: string) {
    await dbUpdateCandidateStatus(id, 'rejected', 'Manually rejected by admin');
    await load();
  }

  async function handlePromoteToShadow(bundleId: string, rankingId: string) {
    setActionLoading(bundleId);
    await dbUpdateRankingPromotion(rankingId, 'promoted_to_shadow');
    await load();
    setActionLoading(null);
  }

  async function handleMarkAsRelease(bundleId: string, rankingId: string) {
    setActionLoading(bundleId);
    await dbUpdateRankingPromotion(rankingId, 'promoted_to_release');
    await load();
    setActionLoading(null);
  }

  async function handleAddManualCandidate() {
    if (!newCandidateDesc.trim() || !newCandidateRuleKey.trim()) return;
    setActionLoading('add-candidate');
    try {
      const payload = generateManualCandidate({
        description: newCandidateDesc,
        ruleKey: newCandidateRuleKey,
        changeType: 'modify',
        rationale: 'Manual admin candidate',
      });
      await dbCreateCandidate(payload);
      setNewCandidateDesc('');
      setNewCandidateRuleKey('');
      setShowAddCandidate(false);
      await load();
    } finally {
      setActionLoading(null);
    }
  }

  const pendingCount = candidates.filter((c) => c.status === 'pending').length;
  const passedBundles = bundles.filter((b) => b.status === 'passed').length;
  const strongRankings = rankings.filter((r) => r.recommendation_level === 'strong').length;

  if (loading) {
    return (
      <ShadowLayout>
        <div className="text-center py-16 text-sm text-gray-500">Loading optimization engine...</div>
      </ShadowLayout>
    );
  }

  return (
    <ShadowLayout>
      <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-teal-400" />
                Controlled Optimization Engine — plumbing_parser
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Generates, tests, and ranks rule improvements. Nothing deploys without explicit admin approval.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={actionLoading === 'refresh'}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-white border border-gray-700 bg-gray-900 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === 'refresh' ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Safety notice */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-400">
            <Info className="w-4 h-4 text-gray-600 shrink-0" />
            All optimization runs are isolated simulations. No live parser code is modified. No changes deploy without explicit promotion through shadow testing and release gating.
          </div>

          {/* Top-line stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Pending candidates" value={pendingCount} color="text-white" />
            <StatCard label="Total bundles" value={bundles.length} color="text-cyan-300" />
            <StatCard label="Passed simulation" value={passedBundles} color="text-teal-300" />
            <StatCard label="Strong recommendations" value={strongRankings} color="text-amber-300" />
          </div>

          {/* Tabs */}
          <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-1 overflow-x-auto">
            {([
              { key: 'candidates' as Tab,      icon: Plus,      label: 'Candidates' },
              { key: 'bundles' as Tab,          icon: Layers,    label: 'Bundles' },
              { key: 'simulation' as Tab,       icon: Play,      label: 'Simulation' },
              { key: 'rankings' as Tab,         icon: Trophy,    label: 'Rankings' },
              { key: 'recommendations' as Tab,  icon: Rocket,    label: 'Deploy' },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 whitespace-nowrap text-xs px-3 py-2 rounded-lg transition-colors ${
                  tab === key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}

          {tab === 'candidates' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold text-white">Candidate Pool</h2>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {candidates.length} total · {pendingCount} pending
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddCandidate((v) => !v)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:text-white transition-colors"
                  >
                    + Add manual
                  </button>
                  {pendingCount > 0 && (
                    <button
                      onClick={handleGenerateBundles}
                      disabled={actionLoading === 'generate-bundles'}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 transition-colors"
                    >
                      {actionLoading === 'generate-bundles' ? 'Generating...' : `Generate bundles (${pendingCount})`}
                    </button>
                  )}
                </div>
              </div>

              {showAddCandidate && (
                <div className="px-5 py-4 border-b border-gray-800 bg-gray-950 space-y-3">
                  <div className="text-xs font-medium text-gray-300">Add manual candidate</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      value={newCandidateDesc}
                      onChange={(e) => setNewCandidateDesc(e.target.value)}
                      placeholder="Description (what does this change fix?)"
                      className="text-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-teal-600"
                    />
                    <input
                      value={newCandidateRuleKey}
                      onChange={(e) => setNewCandidateRuleKey(e.target.value)}
                      placeholder="Rule key (e.g. total_row_detection)"
                      className="text-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-teal-600 font-mono"
                    />
                  </div>
                  <button
                    onClick={handleAddManualCandidate}
                    disabled={!newCandidateDesc.trim() || !newCandidateRuleKey.trim() || actionLoading === 'add-candidate'}
                    className="text-xs font-medium px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 transition-colors"
                  >
                    {actionLoading === 'add-candidate' ? 'Adding...' : 'Add candidate'}
                  </button>
                </div>
              )}

              <div className="p-5">
                <PlumbingCandidateTable
                  candidates={candidates}
                  onReject={handleRejectCandidate}
                />
              </div>
            </div>
          )}

          {tab === 'bundles' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Optimization Bundles</h2>
                  <p className="text-[10px] text-gray-500 mt-0.5">{bundles.length} bundles assembled from candidates</p>
                </div>
                {passedBundles > 0 && (
                  <button
                    onClick={handleRunAllRankings}
                    disabled={actionLoading === 'rank'}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40 transition-colors"
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    {actionLoading === 'rank' ? 'Ranking...' : 'Run ranking pass'}
                  </button>
                )}
              </div>
              <div className="p-5">
                <PlumbingBundleBuilder
                  bundles={allBundlesWithDetails}
                  onRunBundle={handleRunBundle}
                  onSelectBundle={handleSelectBundle}
                  runningId={runningBundleId ?? undefined}
                />
              </div>
            </div>
          )}

          {tab === 'simulation' && (
            <div className="space-y-4">
              {selectedBundleDetail?.run && selectedBundleDetail?.bundle ? (
                <PlumbingSimulationResultsPanel
                  bundle={selectedBundleDetail.bundle}
                  run={selectedBundleDetail.run}
                />
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center space-y-3">
                  <Play className="w-8 h-8 text-gray-700 mx-auto" />
                  <p className="text-sm text-gray-500">Select a bundle from the Bundles tab and click Simulate.</p>
                </div>
              )}

              {/* Candidate details for selected bundle */}
              {selectedBundleDetail && selectedBundleDetail.candidates.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h3 className="text-sm font-semibold text-white">Contributing candidates</h3>
                  </div>
                  <div className="p-5">
                    <PlumbingCandidateTable candidates={selectedBundleDetail.candidates} />
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'rankings' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Bundle Rankings</h2>
                  <p className="text-[10px] text-gray-500 mt-0.5">Scored and ranked by regression improvement, anomaly reduction, financial impact, and predictive accuracy</p>
                </div>
              </div>
              <div className="p-5">
                <PlumbingOptimizationRankingTable
                  rankings={rankings}
                  bundles={bundles}
                  onSelectBundle={handleSelectBundle}
                />
              </div>
            </div>
          )}

          {tab === 'recommendations' && (
            <PlumbingDeploymentRecommendationPanel
              topBundles={allBundlesWithDetails}
              onPromoteToShadow={handlePromoteToShadow}
              onMarkAsReleaseCandidate={handleMarkAsRelease}
              promotingId={actionLoading ?? undefined}
            />
          )}

          {/* Footer links */}
          <div className="flex items-center gap-4 text-xs pt-2 border-t border-gray-800">
            <a href="/shadow/modules/plumbing_parser/executive" className="text-teal-400 hover:text-teal-300 transition-colors">Executive intelligence →</a>
            <a href="/shadow/modules/plumbing_parser/review" className="text-cyan-400 hover:text-cyan-300 transition-colors">Review ops →</a>
            <a href="/shadow/modules/plumbing_parser" className="text-gray-400 hover:text-white transition-colors">Module overview →</a>
          </div>
      </div>
    </ShadowLayout>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
