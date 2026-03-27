import { useEffect, useState } from 'react';
import {
  BarChart2, RefreshCw, GitCompare, ChevronRight,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
} from 'lucide-react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import {
  computeVersionBenchmarkSummary, compareVersions, evaluateRunForVersion,
  type BenchmarkVersionSummary,
} from '../../../lib/shadow/phase4/benchmarkEvaluationEngine';
import { getShadowVersions, getVersionRuns, type ShadowVersion } from '../../../lib/shadow/phase4/shadowVersioningService';

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#fbbf24' : '#f87171';

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1f2937" strokeWidth="6" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize="14" fontWeight="bold"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}
      >
        {score}
      </text>
    </svg>
  );
}

function SummaryCard({ summary }: { summary: BenchmarkVersionSummary }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">{summary.versionName}</h3>
          <p className="text-xs text-gray-500 font-mono mt-0.5">{summary.moduleKey}</p>
        </div>
        <ScoreRing score={summary.compositeScore} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          { label: 'Avg Financial Acc.', value: `${summary.avgFinancialAccuracy.toFixed(0)}%`, w: 40 },
          { label: 'Avg Pass Rate', value: `${summary.avgPassRate.toFixed(0)}%`, w: 30 },
          { label: 'Avg Line Accuracy', value: `${summary.avgLineAccuracy.toFixed(0)}%`, w: 20 },
          { label: 'Regression Count', value: String(summary.regressionCount), w: 10 },
        ].map((m) => (
          <div key={m.label} className="bg-gray-800/50 rounded-lg p-2">
            <div className="text-gray-500">{m.label} <span className="text-gray-700">({m.w}%)</span></div>
            <div className="text-white font-bold mt-0.5">{m.value}</div>
          </div>
        ))}
      </div>

      <div className="text-xs text-gray-500">
        Based on <span className="text-white">{summary.runCount}</span> benchmark run{summary.runCount !== 1 ? 's' : ''}
        {' '}· Status: <span className="text-gray-300 capitalize">{summary.status}</span>
      </div>
    </div>
  );
}

interface CompareResult {
  a: BenchmarkVersionSummary | null;
  b: BenchmarkVersionSummary | null;
  winner: 'a' | 'b' | 'tie' | 'insufficient_data';
  financialDelta: number;
  regressionDelta: number;
  recommendation: string;
}

function CompareSection() {
  const [versions, setVersions] = useState<ShadowVersion[]>([]);
  const [vIdA, setVIdA] = useState('');
  const [vIdB, setVIdB] = useState('');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getShadowVersions().then(setVersions); }, []);

  async function runCompare() {
    if (!vIdA || !vIdB || vIdA === vIdB) return;
    setLoading(true);
    const r = await compareVersions(vIdA, vIdB);
    setResult(r as CompareResult);
    setLoading(false);
  }

  function WinnerIcon({ side }: { side: 'a' | 'b' }) {
    if (!result) return null;
    if (result.winner === side) return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (result.winner === 'tie') return <Minus className="w-4 h-4 text-gray-400" />;
    return <TrendingDown className="w-4 h-4 text-red-400" />;
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <GitCompare className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-white">Side-by-Side Comparison</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[{ label: 'Version A', state: vIdA, set: setVIdA }, { label: 'Version B', state: vIdB, set: setVIdB }].map((s) => (
          <div key={s.label}>
            <label className="block text-xs text-gray-500 mb-1">{s.label}</label>
            <select
              value={s.state}
              onChange={(e) => s.set(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              <option value="">— select —</option>
              {versions.map((v) => <option key={v.id} value={v.id}>{v.version_name}</option>)}
            </select>
          </div>
        ))}
      </div>

      <button
        onClick={runCompare}
        disabled={loading || !vIdA || !vIdB || vIdA === vIdB}
        className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors"
      >
        {loading ? 'Comparing…' : 'Compare Versions'}
      </button>

      {result && (
        <div className="space-y-3 pt-2">
          {result.winner === 'insufficient_data' ? (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <p className="text-xs text-amber-300">{result.recommendation}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {([['a', result.a], ['b', result.b]] as const).map(([side, s]) => s && (
                  <div key={side} className={`rounded-lg p-3 border ${result.winner === side ? 'border-green-700 bg-green-900/20' : 'border-gray-800 bg-gray-800/30'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-300">{s.versionName}</span>
                      <WinnerIcon side={side} />
                    </div>
                    <div className="text-2xl font-bold text-white">{s.compositeScore}</div>
                    <div className="text-xs text-gray-500 mt-0.5">composite</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-800/40 rounded p-2">
                  <span className="text-gray-500">Financial delta</span>
                  <span className={`ml-2 font-bold ${result.financialDelta > 0 ? 'text-green-400' : result.financialDelta < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    {result.financialDelta > 0 ? '+' : ''}{result.financialDelta.toFixed(1)}%
                  </span>
                </div>
                <div className="bg-gray-800/40 rounded p-2">
                  <span className="text-gray-500">Regression delta</span>
                  <span className={`ml-2 font-bold ${result.regressionDelta < 0 ? 'text-green-400' : result.regressionDelta > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    {result.regressionDelta > 0 ? '+' : ''}{result.regressionDelta}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-300 bg-gray-800/50 rounded-lg p-3 border-l-2 border-amber-500/50">
                {result.recommendation}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface EvaluateRunModalProps {
  versions: ShadowVersion[];
  onClose: () => void;
  onDone: () => void;
}

function EvaluateRunModal({ versions, onClose, onDone }: EvaluateRunModalProps) {
  const [versionId, setVersionId] = useState('');
  const [runs, setRuns] = useState<{ id: string; run_id: string }[]>([]);
  const [runId, setRunId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!versionId) { setRuns([]); setRunId(''); return; }
    getVersionRuns(versionId).then((r) => {
      setRuns(r.map((x) => ({ id: x.id, run_id: x.run_id })));
    });
  }, [versionId]);

  async function handleEvaluate() {
    if (!versionId || !runId) { setError('Select version and run.'); return; }
    setLoading(true);
    setError(null);
    try {
      await evaluateRunForVersion(runId, versionId);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evaluation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold text-white">Evaluate Run for Version</h2>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Version</label>
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500">
            <option value="">— select version —</option>
            {versions.map((v) => <option key={v.id} value={v.id}>{v.version_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Linked Run</label>
          <select value={runId} onChange={(e) => setRunId(e.target.value)} disabled={runs.length === 0}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 disabled:opacity-40">
            <option value="">— {runs.length === 0 ? 'no runs linked' : 'select run'} —</option>
            {runs.map((r) => <option key={r.id} value={r.run_id}>{r.run_id.slice(0, 12)}…</option>)}
          </select>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={handleEvaluate} disabled={loading}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg disabled:opacity-50">
            {loading ? 'Evaluating…' : 'Evaluate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShadowBenchmarkEvaluationPage() {
  const [versions, setVersions] = useState<ShadowVersion[]>([]);
  const [summaries, setSummaries] = useState<BenchmarkVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEvaluate, setShowEvaluate] = useState(false);

  async function load() {
    setLoading(true);
    const v = await getShadowVersions();
    setVersions(v);
    const results = await Promise.all(
      v.slice(0, 20).map((ver) => computeVersionBenchmarkSummary(ver.id))
    );
    setSummaries(results.filter(Boolean).filter((s) => s!.runCount > 0) as BenchmarkVersionSummary[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <ShadowLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart2 className="w-6 h-6 text-amber-400" />
            <div>
              <h1 className="text-xl font-bold text-white">Benchmark Evaluation</h1>
              <p className="text-xs text-gray-500 mt-0.5">Weighted scoring across financial accuracy, pass rate, and line accuracy</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowEvaluate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg"
            >
              <BarChart2 className="w-4 h-4" /> Evaluate Run
            </button>
          </div>
        </div>

        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-6 text-xs text-gray-400">
            <span><span className="text-white font-bold">40%</span> Financial Accuracy</span>
            <span><span className="text-white font-bold">30%</span> Failure Reduction</span>
            <span><span className="text-white font-bold">20%</span> Line Accuracy</span>
            <span><span className="text-white font-bold">10%</span> Consistency</span>
            <span className="ml-auto text-gray-600">Promotion threshold: <span className="text-green-400 font-bold">70</span></span>
            <span className="text-gray-600">Rejection threshold: <span className="text-red-400 font-bold">40</span></span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-300">Version Summaries</h2>
            {loading ? (
              <div className="text-center py-8 text-gray-600">Loading…</div>
            ) : summaries.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-800 rounded-xl">
                <BarChart2 className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">No versions with benchmark data yet.</p>
                <p className="text-gray-600 text-xs mt-1">Link runs to versions and evaluate them.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {summaries.map((s) => <SummaryCard key={s.versionId} summary={s} />)}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-300 mb-4">A/B Comparison</h2>
            <CompareSection />
          </div>
        </div>
      </div>

      {showEvaluate && (
        <EvaluateRunModal
          versions={versions}
          onClose={() => setShowEvaluate(false)}
          onDone={load}
        />
      )}
    </ShadowLayout>
  );
}
