import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Brain, Sparkles, Layers, GitCompare, PlusCircle } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import PlumbingPatternClusterTable from '../../components/plumbing/learning/PlumbingPatternClusterTable';
import PlumbingRuleSuggestionPanel from '../../components/plumbing/learning/PlumbingRuleSuggestionPanel';
import PlumbingRuleEditor from '../../components/plumbing/learning/PlumbingRuleEditor';
import PlumbingRuleVersionTable from '../../components/plumbing/learning/PlumbingRuleVersionTable';
import PlumbingRuleImpactComparison from '../../components/plumbing/learning/PlumbingRuleImpactComparison';
import {
  dbGetLearningEvents,
  dbGetPatternClusters,
  dbGetRuleSuggestions,
  dbGetRuleVersions,
  dbInsertRuleSuggestions,
  dbUpsertPatternCluster,
  getDefaultRuleVersionConfig,
} from '../../lib/db/learningDb';
import { buildClusterRecords } from '../../lib/modules/parsers/plumbing/learning/clusterPatterns';
import { generateAllSuggestions } from '../../lib/modules/parsers/plumbing/learning/generateRuleSuggestions';
import { compareRuleVersions } from '../../lib/modules/parsers/plumbing/learning/analyzeRuleImpact';
import type {
  PatternClusterRecord,
  RuleSuggestionRecord,
  RuleVersionRecord,
} from '../../lib/modules/parsers/plumbing/learning/learningTypes';
import type { RuleImpactComparisonResult } from '../../lib/modules/parsers/plumbing/learning/analyzeRuleImpact';

type ActiveTab = 'clusters' | 'suggestions' | 'rules' | 'compare';

const TABS: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
  { key: 'clusters', label: 'Pattern Clusters', icon: <Brain className="w-3.5 h-3.5" /> },
  { key: 'suggestions', label: 'Rule Suggestions', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { key: 'rules', label: 'Rule Versions', icon: <Layers className="w-3.5 h-3.5" /> },
  { key: 'compare', label: 'Impact Analysis', icon: <GitCompare className="w-3.5 h-3.5" /> },
];

export default function PlumbingLearningDashboard() {
  const [tab, setTab] = useState<ActiveTab>('clusters');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [clusters, setClusters] = useState<PatternClusterRecord[]>([]);
  const [suggestions, setSuggestions] = useState<RuleSuggestionRecord[]>([]);
  const [versions, setVersions] = useState<RuleVersionRecord[]>([]);
  const [comparison, setComparison] = useState<RuleImpactComparisonResult | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const load = useCallback(async () => {
    const [clusterData, suggestionData, versionData] = await Promise.all([
      dbGetPatternClusters(),
      dbGetRuleSuggestions(),
      dbGetRuleVersions(),
    ]);
    setClusters(clusterData);
    setSuggestions(suggestionData);
    setVersions(versionData);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleRunAnalysis() {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const events = await dbGetLearningEvents({ periodDays: 30 });
      const existingClusters = await dbGetPatternClusters();
      const newClusterData = buildClusterRecords('plumbing_parser', events, existingClusters);

      for (const cluster of newClusterData ?? []) {
        await dbUpsertPatternCluster(cluster);
      }

      const freshClusters = await dbGetPatternClusters();
      const existingSuggestions = await dbGetRuleSuggestions();
      const newSuggestions = generateAllSuggestions(freshClusters ?? [], existingSuggestions ?? []);
      await dbInsertRuleSuggestions(newSuggestions);

      await load();
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  function handleVersionCreated(v: RuleVersionRecord) {
    setVersions((prev) => [v, ...prev]);
    setShowEditor(false);
    setTab('rules');
  }

  function handleCompare(a: RuleVersionRecord, b: RuleVersionRecord) {
    const result = compareRuleVersions(a, b);
    setComparison(result);
    setTab('compare');
  }

  const activeVersion = versions.find((v) => v.is_active_shadow);
  const defaultConfig = getDefaultRuleVersionConfig();

  if (loading) {
    return (
      <ShadowLayout>
        <div className="text-center py-16 text-sm text-gray-500">Loading learning system...</div>
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
                <Brain className="w-5 h-5 text-amber-400" />
                Learning System — plumbing_parser
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Controlled self-improvement. Suggestions only — no auto-deploy.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRunAnalysis}
                disabled={analyzing || refreshing}
                className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors"
              >
                <Sparkles className={`w-3.5 h-3.5 ${analyzing ? 'animate-pulse' : ''}`} />
                {analyzing ? 'Analyzing...' : 'Run Pattern Analysis'}
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing || analyzing}
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-white border border-gray-700 bg-gray-900 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {analysisError && (
            <div className="rounded-lg bg-red-900/20 border border-red-800/40 px-4 py-2 text-sm text-red-400">
              Analysis failed: {analysisError}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Pattern clusters" value={clusters.length} color="text-amber-300" />
            <StatCard label="Pending suggestions" value={suggestions.filter((s) => s.status === 'pending').length} color="text-cyan-300" />
            <StatCard label="Approved suggestions" value={suggestions.filter((s) => s.status === 'approved').length} color="text-teal-300" />
            <StatCard label="Rule versions" value={versions.length} color="text-gray-300" />
          </div>

          {/* Tab bar */}
          <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg capitalize flex-1 justify-center transition-colors ${
                  tab === t.key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'clusters' && (
            <PlumbingPatternClusterTable clusters={clusters} />
          )}

          {tab === 'suggestions' && (
            <PlumbingRuleSuggestionPanel
              suggestions={suggestions}
              onRefresh={handleRefresh}
            />
          )}

          {tab === 'rules' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  {activeVersion && (
                    <p className="text-xs text-gray-500">
                      Active shadow version: <code className="text-cyan-400">{activeVersion.version}</code> — {activeVersion.label}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowEditor((v) => !v)}
                  className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-gray-700 hover:border-teal-500/50 text-gray-400 hover:text-teal-300 transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  {showEditor ? 'Hide editor' : 'New version'}
                </button>
              </div>

              {showEditor && (
                <PlumbingRuleEditor
                  baseVersion={activeVersion ?? null}
                  onVersionCreated={handleVersionCreated}
                />
              )}

              <PlumbingRuleVersionTable
                versions={versions}
                onRefresh={handleRefresh}
                onSelectForComparison={handleCompare}
              />
            </div>
          )}

          {tab === 'compare' && (
            <div className="space-y-4">
              {comparison ? (
                <PlumbingRuleImpactComparison result={comparison} />
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                  <GitCompare className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                  <div className="text-sm text-gray-500">Select two versions in the Rule Versions tab to compare impact.</div>
                  <button
                    onClick={() => setTab('rules')}
                    className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    Go to Rule Versions →
                  </button>
                </div>
              )}

              {/* Quick compare: active vs default */}
              {versions.length >= 2 && (
                <div className="text-center">
                  <button
                    onClick={() => {
                      const a = versions[versions.length - 1];
                      const b = versions[0];
                      handleCompare(a, b);
                    }}
                    className="text-xs text-gray-500 hover:text-white transition-colors"
                  >
                    Compare oldest vs. latest version →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick links */}
          <div className="flex items-center gap-4 text-xs pt-2 border-t border-gray-800">
            <a href="/shadow/modules/plumbing_parser/release" className="text-teal-400 hover:text-teal-300 transition-colors">
              Release system →
            </a>
            <a href="/shadow/modules/plumbing_parser/beta" className="text-gray-400 hover:text-white transition-colors">
              Beta intelligence →
            </a>
            <a href="/shadow/modules/plumbing_parser/regression" className="text-gray-400 hover:text-white transition-colors">
              Regression suites →
            </a>
          </div>
      </div>
    </ShadowLayout>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
