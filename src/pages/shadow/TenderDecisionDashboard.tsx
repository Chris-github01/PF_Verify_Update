import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { runCde } from '../../lib/shadow/cde/cdeRunner';
import { loadLatestDecisionSnapshot, loadDecisionHistory } from '../../lib/shadow/cde/decisionState';
import {
  RISK_TIER_COLORS,
  RISK_TIER_LABELS,
  BEHAVIOUR_CLASS_LABELS,
  BEHAVIOUR_CLASS_COLORS,
} from '../../lib/shadow/cde/constants';
import type { CdeDecisionState, CdeRankedSupplier, RecommendationStatus } from '../../lib/shadow/cde/types';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import {
  Trophy, AlertTriangle, TrendingUp, ChevronDown, ChevronUp,
  Play, RefreshCw, Clock, CheckCircle, Info, BarChart2, Shield,
  DollarSign, Target, History, ChevronRight, XCircle, MinusCircle,
} from 'lucide-react';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

const STATUS_CONFIG: Record<
  RecommendationStatus,
  {
    label: string;
    subLabel: string;
    badgeClass: string;
    icon: React.ElementType;
    borderClass: string;
    bgClass: string;
  }
> = {
  recommended: {
    label: 'Preferred Tenderer',
    subLabel: 'All gating conditions satisfied — final CDE recommendation',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    icon: Trophy,
    borderClass: 'border-emerald-500/40',
    bgClass: 'bg-emerald-500/8',
  },
  narrow_margin: {
    label: 'Commercial Leader — Narrow Margin',
    subLabel: 'Top-2 suppliers within 3-point composite margin. Scope validation advised before award.',
    badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    icon: MinusCircle,
    borderClass: 'border-amber-500/40',
    bgClass: 'bg-amber-500/8',
  },
  provisional: {
    label: 'Provisional Leader — Scope Validation Required',
    subLabel: 'One or more gating conditions not yet satisfied. Cannot issue final recommendation.',
    badgeClass: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
    icon: AlertTriangle,
    borderClass: 'border-slate-500/40',
    bgClass: 'bg-slate-800/40',
  },
  no_recommendation: {
    label: 'No Recommendation',
    subLabel: 'Insufficient data or critical conditions failed. Run CDE after resolving issues below.',
    badgeClass: 'bg-red-500/20 text-red-300 border border-red-500/30',
    icon: XCircle,
    borderClass: 'border-red-500/40',
    bgClass: 'bg-red-500/8',
  },
};

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 75
      ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
      : pct >= 50
      ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
      : 'text-red-400 bg-red-500/15 border-red-500/30';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      <CheckCircle className="w-3 h-3" />
      {pct}% confidence
    </span>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span className="font-medium text-slate-300">{pct}/100</span>
      </div>
      <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function GatingPanel({ state }: { state: CdeDecisionState }) {
  const { gating } = state;
  const allPassed = gating.passed && !gating.isNarrowMargin;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
        <Shield className="w-4 h-4 text-slate-400" />
        Recommendation Gating
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <GateItem
          label="Scope coverage"
          value={`${Math.round(gating.scopeCoverageScore * 100)}/100`}
          threshold="min 55"
          passed={gating.scopeCoverageScore >= 0.55}
        />
        <GateItem
          label="Variation resistance"
          value={`${Math.round(gating.variationResistanceScore * 100)}/100`}
          threshold="min 45"
          passed={gating.variationResistanceScore >= 0.45}
        />
        <GateItem
          label="Confidence"
          value={`${Math.round(gating.confidence * 100)}%`}
          threshold="min 50%"
          passed={gating.confidence >= 0.50}
        />
      </div>

      {gating.isNarrowMargin && (
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Top-2 composite scores are within the 3-point narrow margin threshold. Gating conditions
            passed, but the margin is insufficient for a hard final recommendation without additional validation.
          </span>
        </div>
      )}

      {gating.failedGates.length > 0 && (
        <div className="space-y-1">
          {gating.failedGates.map((g, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-slate-300 bg-slate-700/40 border border-slate-600/40 rounded-lg px-3 py-2"
            >
              <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              {g}
            </div>
          ))}
        </div>
      )}

      {allPassed && gating.failedGates.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2">
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
          All gating conditions satisfied. CDE recommendation is final.
        </div>
      )}
    </div>
  );
}

function GateItem({
  label,
  value,
  threshold,
  passed,
}: {
  label: string;
  value: string;
  threshold: string;
  passed: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        passed
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-red-500/30 bg-red-500/10'
      }`}
    >
      <div className={`flex items-center gap-1 ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
        {passed ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        <span className="font-semibold text-xs">{value}</span>
      </div>
      <div className="text-slate-400 text-xs mt-0.5">{label}</div>
      <div className="text-slate-500 text-[10px]">threshold: {threshold}</div>
    </div>
  );
}

function SupplierCard({
  supplier,
  state,
}: {
  supplier: CdeRankedSupplier;
  state: CdeDecisionState;
}) {
  const [expanded, setExpanded] = useState(false);
  const riskColors = RISK_TIER_COLORS[supplier.riskTier];
  const behaviourColors = BEHAVIOUR_CLASS_COLORS[supplier.behaviourClass];

  const isTop = supplier.supplierName === state.recommendedSupplier;
  const isRunnerUp = supplier.supplierName === state.runnerUpSupplier;
  const status = state.recommendationStatus;

  const topBadgeLabel =
    status === 'recommended'
      ? 'Preferred Tenderer'
      : status === 'narrow_margin'
      ? 'Commercial Leader — Narrow Margin'
      : status === 'provisional'
      ? 'Provisional Leader'
      : null;

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        isTop
          ? 'border-amber-500/40 bg-amber-500/5 shadow-lg shadow-amber-500/5'
          : 'border-slate-700/60 bg-slate-800/20 hover:border-slate-600/60'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                isTop
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-slate-700/60 text-slate-400'
              }`}
            >
              {supplier.rank}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-white truncate">{supplier.supplierName}</h3>
                {isTop && topBadgeLabel && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CONFIG[status].badgeClass}`}>
                    {status === 'recommended' && <Trophy className="w-3 h-3" />}
                    {status === 'narrow_margin' && <MinusCircle className="w-3 h-3" />}
                    {status === 'provisional' && <AlertTriangle className="w-3 h-3" />}
                    {topBadgeLabel}
                  </span>
                )}
                {isRunnerUp && !isTop && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/60 text-slate-400 border border-slate-600/40">
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
            <div className="text-xl font-bold text-white">
              {Math.round(supplier.compositeScore * 100)}
              <span className="text-sm font-normal text-slate-500">/100</span>
            </div>
            <div className="text-xs text-slate-500">composite score</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'Quoted', value: fmt(supplier.quotedTotal) },
            { label: 'Projected', value: fmt(supplier.projectedTotal) },
            { label: 'Var. Exposure', value: fmt(supplier.variationExposure) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-700/30 rounded-lg p-2.5">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="text-sm font-semibold text-slate-200 mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {expanded
            ? <><ChevronUp className="w-3.5 h-3.5" /> Hide breakdown</>
            : <><ChevronDown className="w-3.5 h-3.5" /> Score breakdown</>
          }
        </button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-700/40 space-y-2">
            <ScoreBar label="Cost efficiency (35%)" value={supplier.scoreBreakdown.cost} />
            <ScoreBar label="Supplier behaviour (25%)" value={supplier.scoreBreakdown.behaviour} />
            <ScoreBar label="Scope coverage (20%)" value={supplier.scoreBreakdown.scope} />
            <ScoreBar label="Variation resistance (12%)" value={supplier.scoreBreakdown.variation} />
            <ScoreBar label="Programme risk (8%)" value={supplier.scoreBreakdown.programme} />
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectPicker({
  projectId,
  onChange,
}: {
  projectId: string;
  onChange: (id: string) => void;
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase
      .from('projects')
      .select('id, name')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setProjects(data ?? []));
  }, []);

  return (
    <select
      value={projectId}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-slate-600/60 rounded-lg px-3 py-2 bg-slate-800 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/40"
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
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-400" /> Decision History
      </h3>
      <div className="space-y-2">
        {history.map((snap, i) => {
          const cfg = STATUS_CONFIG[snap.recommendationStatus ?? 'provisional'];
          const StatusIcon = cfg.icon;
          return (
            <div
              key={snap.runId}
              className="flex items-center justify-between text-sm py-2 border-b border-slate-700/40 last:border-0"
            >
              <div>
                <span className="font-medium text-slate-200">
                  {snap.recommendedSupplier ?? 'No recommendation'}
                </span>
                <span className="text-slate-500 ml-2 text-xs">
                  {new Date(snap.generatedAt).toLocaleDateString('en-AU')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badgeClass}`}>
                  <StatusIcon className="w-3 h-3" />
                  {cfg.label}
                </span>
                {i === 0 && <span className="text-xs text-slate-500">Latest</span>}
              </div>
            </div>
          );
        })}
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

  const status = state?.recommendationStatus ?? 'no_recommendation';
  const cfg = STATUS_CONFIG[status];
  const StatusIcon = cfg.icon;
  const top = state?.suppliers[0];

  return (
    <ShadowLayout>
      <div className="space-y-6">

        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h1 className="text-xl font-bold text-white">Tender Decision Engine</h1>
            </div>
            <p className="text-slate-400 text-sm">
              The sole authority for preferred tenderer, runner-up, and no-recommendation status.
              Consumes cost, scope, behaviour, and variation risk inputs.
            </p>
          </div>
          <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700/60 text-slate-300 border border-slate-600/40">
              <Shield className="w-3 h-3 text-amber-400" /> Shadow Module
            </span>
            <span className="text-xs text-slate-500">CDE — Final Decision Authority</span>
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">Project:</span>
            </div>
            <ProjectPicker projectId={projectId} onChange={handleProjectChange} />
            <button
              onClick={handleRun}
              disabled={!projectId || running}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-900 text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Play className="w-4 h-4" />
              }
              {running ? 'Running analysis...' : 'Run CDE'}
            </button>
            {state && (
              <button
                onClick={() => projectId && loadData(projectId)}
                disabled={loading}
                className="inline-flex items-center gap-2 px-3 py-2 border border-slate-600/60 text-slate-400 text-sm rounded-lg hover:bg-slate-700/40 hover:text-slate-200 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
              {error}
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center py-12 text-slate-500 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-600" />
            Loading decision data...
          </div>
        )}

        {!loading && state && (
          <>
            {/* Decision Status Banner */}
            <div className={`rounded-xl border-2 p-5 ${cfg.borderClass} ${cfg.bgClass}`}>
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border ${cfg.borderClass} bg-slate-800/60`}>
                  <StatusIcon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-lg font-bold text-white">
                      {state.recommendedSupplier ?? 'No recommendation issued'}
                    </h2>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.badgeClass}`}>
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                    <ConfidenceBadge value={state.overallConfidence} />
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(state.generatedAt).toLocaleString('en-AU')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 italic">{cfg.subLabel}</p>
                  <p className="text-sm text-slate-300 mt-2 leading-relaxed">{state.justification}</p>
                </div>
              </div>
            </div>

            {/* Gating panel */}
            <GatingPanel state={state} />

            {/* Stats row */}
            {top && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: DollarSign, label: 'Quoted total', value: fmt(top.quotedTotal) },
                  { icon: TrendingUp, label: 'Projected total', value: fmt(top.projectedTotal) },
                  { icon: AlertTriangle, label: 'Variation exposure', value: fmt(top.variationExposure) },
                  { icon: BarChart2, label: 'Scope coverage', value: fmtPct(top.scopeCoverage) },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-4">
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="text-xs">{label}</span>
                    </div>
                    <div className="text-lg font-bold text-white">{value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Composite leader</div>
                  </div>
                ))}
              </div>
            )}

            {/* Ranked suppliers */}
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-slate-500" />
                Ranked Suppliers ({state.suppliers.length})
              </h2>
              <div className="space-y-3">
                {state.suppliers.map((supplier) => (
                  <SupplierCard key={supplier.supplierName} supplier={supplier} state={state} />
                ))}
              </div>
            </div>

            {/* CDE authority note */}
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-500 leading-relaxed space-y-1">
                <p>
                  <strong className="text-slate-400">CDE is the sole recommendation authority.</strong> Only this module may
                  output preferred tenderer, runner-up, narrow margin leader, or no-recommendation
                  status. Quantity Intelligence and other advisory modules inform inputs but do not
                  determine the outcome.
                </p>
                <p>
                  Composite scores use: cost efficiency (35%), supplier behaviour (25%), scope
                  coverage (20%), variation resistance (12%), programme risk (8%). Risk tier penalties
                  apply. Gating thresholds: scope &ge;55, variation &ge;45, confidence &ge;50%.
                  Narrow-margin suppression: &le;3 composite points.
                </p>
              </div>
            </div>

            <HistoryPanel history={history} />
          </>
        )}

        {!loading && !state && projectId && !running && (
          <div className="text-center py-16 space-y-3">
            <Target className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-slate-400 text-sm">No CDE analysis found for this project.</p>
            <p className="text-slate-500 text-xs">
              Click &ldquo;Run CDE&rdquo; to generate the first comparative decision analysis.
            </p>
          </div>
        )}

        {!projectId && (
          <div className="text-center py-16 space-y-3">
            <BarChart2 className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-slate-400 text-sm">Select a project to begin.</p>
          </div>
        )}
      </div>
    </ShadowLayout>
  );
}
