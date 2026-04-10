import { useState } from 'react';
import { FlaskConical, Eye, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { analyzeQuoteIntelligence } from '../analysis/quoteIntelligence';
import type { QuoteData, IntelligenceResult } from '../analysis/quoteIntelligence';
import QuoteIntelligencePanel from '../components/QuoteIntelligencePanel';

const MOCK_SCENARIOS: Record<string, { label: string; description: string; data: QuoteData }> = {
  weak: {
    label: 'Weak Quote',
    description: 'Lump-sum, no exclusions, no qualifications, above market.',
    data: {
      total: 125000,
      average: 110000,
      hasBreakdown: false,
      hasExclusions: false,
      hasQualifications: false,
      hasAssumptions: false,
      hasClarifications: false,
      hasSystemDetail: false,
      hasScopeBreakdown: false,
      tradeCount: 1,
      lineItemCount: 2,
    },
  },
  moderate: {
    label: 'Moderate Quote',
    description: 'Has some detail but missing exclusions and assumptions.',
    data: {
      total: 108000,
      average: 110000,
      hasBreakdown: true,
      hasExclusions: false,
      hasQualifications: true,
      hasAssumptions: false,
      hasClarifications: true,
      hasSystemDetail: false,
      hasScopeBreakdown: true,
      tradeCount: 2,
      lineItemCount: 12,
    },
  },
  strong: {
    label: 'Strong Quote',
    description: 'Fully scoped, competitive price, all qualifications present.',
    data: {
      total: 107000,
      average: 110000,
      hasBreakdown: true,
      hasExclusions: true,
      hasQualifications: true,
      hasAssumptions: true,
      hasClarifications: true,
      hasSystemDetail: true,
      hasScopeBreakdown: true,
      tradeCount: 3,
      lineItemCount: 28,
    },
  },
};

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer group">
      <span className="text-slate-300 text-sm group-hover:text-white transition-colors">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={[
          'relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0',
          value ? 'bg-amber-500' : 'bg-slate-700',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
            value ? 'translate-x-5' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    </label>
  );
}

export default function QuoteIntelligenceDev() {
  const [scenario, setScenario] = useState<keyof typeof MOCK_SCENARIOS>('weak');
  const [custom, setCustom] = useState<QuoteData>(MOCK_SCENARIOS.weak.data);
  const [useCustom, setUseCustom] = useState(false);
  const [result, setResult] = useState<IntelligenceResult | null>(null);
  const [running, setRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  function applyScenario(key: keyof typeof MOCK_SCENARIOS) {
    setScenario(key);
    setCustom(MOCK_SCENARIOS[key].data);
    setResult(null);
  }

  function runAnalysis() {
    setRunning(true);
    setResult(null);
    const data = useCustom ? custom : MOCK_SCENARIOS[scenario].data;
    setTimeout(() => {
      setResult(analyzeQuoteIntelligence(data));
      setRunning(false);
    }, 400);
  }

  const activeData = useCustom ? custom : MOCK_SCENARIOS[scenario].data;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Quote Intelligence</h1>
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded tracking-widest">
                DEV
              </span>
            </div>
            <p className="text-slate-400 text-sm">
              Analyse why a quote may win or lose. Advisory only — no data written.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowConfig((v) => !v)}
          className={[
            'flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors',
            showConfig
              ? 'bg-slate-700 border-slate-600 text-white'
              : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-600',
          ].join(' ')}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Configure
        </button>
      </div>

      <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/50 rounded-lg px-4 py-2.5 mb-6 text-sm text-slate-400">
        <Eye className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span>Read-only mode — no database writes, no production logic affected.</span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {(Object.keys(MOCK_SCENARIOS) as Array<keyof typeof MOCK_SCENARIOS>).map((key) => {
          const s = MOCK_SCENARIOS[key];
          const isActive = !useCustom && scenario === key;
          return (
            <button
              key={key}
              onClick={() => { setUseCustom(false); applyScenario(key); }}
              className={[
                'text-left rounded-xl border px-4 py-3.5 transition-all',
                isActive
                  ? 'bg-amber-500/15 border-amber-500/40 shadow-sm'
                  : 'bg-slate-800/50 border-slate-700/60 hover:border-slate-600',
              ].join(' ')}
            >
              <div className={`font-semibold text-sm mb-1 ${isActive ? 'text-amber-300' : 'text-white'}`}>
                {s.label}
              </div>
              <div className="text-slate-400 text-xs leading-relaxed">{s.description}</div>
            </button>
          );
        })}
      </div>

      {showConfig && (
        <div className="bg-slate-900/70 border border-slate-700/60 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold text-sm">Custom Quote Configuration</h3>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <span>Use custom</span>
              <button
                type="button"
                onClick={() => setUseCustom((v) => !v)}
                className={[
                  'relative w-10 h-5 rounded-full transition-colors flex-shrink-0',
                  useCustom ? 'bg-amber-500' : 'bg-slate-700',
                ].join(' ')}
              >
                <span className={['absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform', useCustom ? 'translate-x-5' : 'translate-x-0.5'].join(' ')} />
              </button>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-5">
            {[
              { key: 'total', label: 'Quote Total ($)' },
              { key: 'average', label: 'Market Average ($)' },
              { key: 'lineItemCount', label: 'Line Item Count' },
              { key: 'tradeCount', label: 'Trade Count' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-slate-400 text-xs mb-1 block">{label}</label>
                <input
                  type="number"
                  value={(custom as Record<string, unknown>)[key] as number ?? 0}
                  onChange={(e) => {
                    setUseCustom(true);
                    setCustom((prev) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }));
                  }}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {[
              { key: 'hasBreakdown', label: 'Has Breakdown' },
              { key: 'hasExclusions', label: 'Has Exclusions' },
              { key: 'hasQualifications', label: 'Has Qualifications' },
              { key: 'hasAssumptions', label: 'Has Assumptions' },
              { key: 'hasClarifications', label: 'Has Clarifications' },
              { key: 'hasSystemDetail', label: 'Has System Detail' },
              { key: 'hasScopeBreakdown', label: 'Has Scope Breakdown' },
            ].map(({ key, label }) => (
              <Toggle
                key={key}
                label={label}
                value={(custom as Record<string, unknown>)[key] as boolean ?? false}
                onChange={(v) => {
                  setUseCustom(true);
                  setCustom((prev) => ({ ...prev, [key]: v }));
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-white font-semibold">${activeData.total.toLocaleString()}</div>
            <div className="text-slate-500 text-xs">Quote Total</div>
          </div>
          <div>
            <div className="text-white font-semibold">${activeData.average.toLocaleString()}</div>
            <div className="text-slate-500 text-xs">Market Avg</div>
          </div>
          <div>
            <div className={`font-semibold ${activeData.total > activeData.average ? 'text-red-400' : 'text-emerald-400'}`}>
              {activeData.total > activeData.average ? '+' : ''}
              {Math.round(((activeData.total - activeData.average) / activeData.average) * 100)}%
            </div>
            <div className="text-slate-500 text-xs">vs Market</div>
          </div>
          <div>
            <div className="text-white font-semibold">{activeData.lineItemCount ?? '—'}</div>
            <div className="text-slate-500 text-xs">Line Items</div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-8">
        <button
          onClick={runAnalysis}
          disabled={running}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-amber-950 font-bold px-6 py-3 rounded-xl transition-colors"
        >
          {running ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Analysing…
            </>
          ) : (
            <>
              <FlaskConical className="w-4 h-4" />
              Run Analysis
            </>
          )}
        </button>
      </div>

      {result && <QuoteIntelligencePanel result={result} />}
    </div>
  );
}
