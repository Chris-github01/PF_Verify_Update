import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { runCde } from '../../lib/shadow/cde/cdeRunner';
import { loadLatestDecisionSnapshot, loadDecisionHistory } from '../../lib/shadow/cde/decisionState';
import { RISK_TIER_COLORS, RISK_TIER_LABELS, BEHAVIOUR_CLASS_LABELS, BEHAVIOUR_CLASS_COLORS } from '../../lib/shadow/cde/constants';
import type { CdeDecisionState, CdeRankedSupplier } from '../../lib/shadow/cde/types';
import {
  Trophy, AlertTriangle, TrendingUp, ChevronDown, ChevronUp,
  Play, RefreshCw, Clock, CheckCircle, Info, BarChart2, Shield,
  DollarSign, Target, History, ChevronRight
} from 'lucide-react';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : pct >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      <CheckCircle className="w-3 h-3" />
      {pct}% confidence
    </span>
  );
}

function ScoreBar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-medium text-slate-700">{pct}/100</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-slate-700 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SupplierCard({ supplier, isTop, isRunnerUp }: { supplier: CdeRankedSupplier; isTop: boolean; isRunnerUp: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const riskColors = RISK_TIER_COLORS[supplier.riskTier];
  const behaviourColors = BEHAVIOUR_CLASS_COLORS[supplier.behaviourClass];

  return (
    <div className={`rounded-xl border bg-white transition-all duration-200 ${isTop ? 'border-slate-700 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isTop ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {supplier.rank}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-slate-800 truncate">{supplier.supplierName}</h3>
                {isTop && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-white">
                    <Trophy className="w-3 h-3" /> Recommended
                  </span>
                )}
                {isRunnerUp && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                    Runner-up
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${riskColors}`}>
                  {RISK_TIER_LABELS[supplier.riskTier]}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${behaviourColors}`}>
                  {BEHAVIOUR_CLASS_LABELS[supplier.behaviourClass]}
                </span>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-lg font-bold text-slate-800">{Math.round(supplier.compositeScore * 100)}<span className="text-sm font-normal text-slate-500">/100</span></div>
            <div className="text-xs text-slate-500">composite score</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-slate-50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">Quoted</div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">{fmt(supplier.quotedTotal)}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">Projected</div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">{fmt(supplier.projectedTotal)}</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <div className="text-xs text-slate-500">Var. Exposure</div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">{fmt(supplier.variationExposure)}</div>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide breakdown</> : <><ChevronDown className="w-3.5 h-3.5" /> Score breakdown</>}
        </button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <ScoreBar label="Cost score" value={supplier.scoreBreakdown.cost} />
            <ScoreBar label="Behaviour score" value={supplier.scoreBreakdown.behaviour} />
            <ScoreBar label="Scope coverage" value={supplier.scoreBreakdown.scope} />
            <ScoreBar label="Variation resistance" value={supplier.scoreBreakdown.variation} />
            <ScoreBar label="Programme risk" value={supplier.scoreBreakdown.programme} />
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectPicker({ projectId, onChange }: { projectId: string; onChange: (id: string) => void }) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase.from('projects').select('id, name').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setProjects(data ?? []));
  }, []);

  return (
    <select
      value={projectId}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
    >
      <option value="">-- Select a project --</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

function HistoryPanel({ history }: { history: CdeDecisionState[] }) {
  if (history.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-400" /> Decision History
      </h3>
      <div className="space-y-2">
        {history.map((snap, i) => (
          <div key={snap.runId} className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0">
            <div>
              <span className="font-medium text-slate-700">{snap.recommendedSupplier ?? 'No recommendation'}</span>
              <span className="text-slate-400 ml-2 text-xs">{new Date(snap.generatedAt).toLocaleDateString('en-AU')}</span>
            </div>
            <div className="flex items-center gap-2">
              <ConfidenceBadge value={snap.overallConfidence} />
              {i === 0 && <span className="text-xs text-slate-400">Latest</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TenderDecisionDashboard() {
  const [projectId, setProjectId] = useState('');
  const [state, setState] = useState<CdeDecisionState | null>(null);
  const [history, setHistory] = useState<CdeDecisionState[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    setError(null);
    try {
      const [latest, hist] = await Promise.all([
        loadLatestDecisionSnapshot(pid),
        loadDecisionHistory(pid, 5),
      ]);
      setState(latest);
      setHistory(hist);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleProjectChange = (pid: string) => {
    setProjectId(pid);
    setState(null);
    setHistory([]);
    if (pid) loadData(pid);
  };

  const handleRun = async () => {
    if (!projectId) return;
    setRunning(true);
    setError(null);
    try {
      const result = await runCde(projectId);
      setState(result);
      const hist = await loadDecisionHistory(projectId, 5);
      setHistory(hist);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'CDE run failed');
    } finally {
      setRunning(false);
    }
  };

  const top = state?.suppliers[0];
  const runnerUp = state?.suppliers[1];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tender Decision Engine</h1>
            <p className="text-slate-500 text-sm mt-1">
              Comparative decision analysis across supplier profiles, variation exposure, and projected cost.
            </p>
          </div>
          <div className="flex-shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
              <Shield className="w-3 h-3" /> Shadow Module
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Project:</span>
            </div>
            <ProjectPicker projectId={projectId} onChange={handleProjectChange} />
            <button
              onClick={handleRun}
              disabled={!projectId || running}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Running analysis...' : 'Run CDE'}
            </button>
            {state && (
              <button
                onClick={() => projectId && loadData(projectId)}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center py-12 text-slate-400 text-sm">Loading decision data...</div>
        )}

        {!loading && state && (
          <>
            {/* Decision Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900">
                      {state.recommendedSupplier ?? 'No recommendation'}
                    </h2>
                    <ConfidenceBadge value={state.overallConfidence} />
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(state.generatedAt).toLocaleString('en-AU')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2 leading-relaxed">{state.justification}</p>
                </div>
              </div>
            </div>

            {/* Stats row */}
            {top && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: DollarSign, label: 'Quoted total', value: fmt(top.quotedTotal) },
                  { icon: TrendingUp, label: 'Projected total', value: fmt(top.projectedTotal) },
                  { icon: AlertTriangle, label: 'Variation exposure', value: fmt(top.variationExposure) },
                  { icon: BarChart2, label: 'Scope coverage', value: fmtPct(top.scopeCoverage) },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="text-xs">{label}</span>
                    </div>
                    <div className="text-lg font-bold text-slate-800">{value}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Recommended supplier</div>
                  </div>
                ))}
              </div>
            )}

            {/* Ranked suppliers */}
            <div>
              <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-slate-400" />
                Ranked Suppliers ({state.suppliers.length})
              </h2>
              <div className="space-y-3">
                {state.suppliers.map((supplier) => (
                  <SupplierCard
                    key={supplier.supplierName}
                    supplier={supplier}
                    isTop={supplier.supplierName === state.recommendedSupplier}
                    isRunnerUp={supplier.supplierName === state.runnerUpSupplier}
                  />
                ))}
              </div>
            </div>

            {/* Methodology note */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Composite scores are calculated using weighted dimensions: cost efficiency (35%), supplier behaviour (25%),
                scope coverage (20%), variation resistance (12%), and programme risk (8%). Risk tier penalties
                are applied to reduce scores for high-risk suppliers. Projected totals incorporate historical variation rates
                and risk premiums on top of quoted figures.
              </p>
            </div>

            <HistoryPanel history={history} />
          </>
        )}

        {!loading && !state && projectId && !running && (
          <div className="text-center py-16 space-y-3">
            <Target className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-slate-500 text-sm">No CDE analysis found for this project.</p>
            <p className="text-slate-400 text-xs">Click "Run CDE" to generate the first comparative decision analysis.</p>
          </div>
        )}

        {!projectId && (
          <div className="text-center py-16 space-y-3">
            <BarChart2 className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-slate-500 text-sm">Select a project to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
