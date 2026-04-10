import { useState } from 'react';
import { FlaskConical, Plus, Trash2, Play, AlertTriangle, TrendingUp, TrendingDown, Zap, ShieldAlert, Eye } from 'lucide-react';
import { analyseQuote } from '../analysis';
import type { LineItem, QuoteAnalysisResult } from '../analysis';
import { executeShadowRun } from '../shadow/shadowExecutor';
import { isExperimentEnabled } from '../experiments';

const ROLE_OPTIONS = ['Labour', 'Concrete', 'Steel', 'Formwork', 'Excavation', 'Plumbing', 'Electrical', 'Painting', 'Tiling', 'Carpentry', 'Other'];

const DEFAULT_ITEMS: LineItem[] = [
  { description: 'Concrete footing supply and place', quantity: 45, unitRate: 210, total: 9450, trade: 'Concrete' },
  { description: 'Formwork to footings', quantity: 120, unitRate: 42, total: 5040, trade: 'Formwork' },
  { description: 'Labour - general', quantity: 80, unitRate: 95, total: 7600, trade: 'Labour' },
  { description: 'Provisional sum - services diversion', quantity: 1, unitRate: 8000, total: 8000, trade: 'Other' },
];

function RiskBadge({ score }: { score: number }) {
  const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  const styles = {
    high: 'bg-red-500/20 text-red-400 border-red-500/40',
    medium: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  };
  const labels = { high: 'High Risk', medium: 'Moderate Risk', low: 'Low Risk' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${styles[level]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {labels[level]}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: 'low' | 'medium' | 'high' }) {
  const styles = {
    high: 'bg-red-500/20 text-red-400',
    medium: 'bg-amber-500/20 text-amber-400',
    low: 'bg-slate-500/20 text-slate-400',
  };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${styles[severity]} uppercase tracking-wide`}>{severity}</span>;
}

function ConfidenceBadge({ confidence }: { confidence: 'low' | 'medium' | 'high' }) {
  const styles = {
    high: 'text-emerald-400',
    medium: 'text-amber-400',
    low: 'text-slate-500',
  };
  return <span className={`text-xs font-medium ${styles[confidence]}`}>{confidence} confidence</span>;
}

export default function QuoteIntelligenceDev() {
  const [items, setItems] = useState<LineItem[]>(DEFAULT_ITEMS);
  const [result, setResult] = useState<QuoteAnalysisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [shadowEnabled] = useState(() => isExperimentEnabled('SHADOW_LOGGING'));

  function addItem() {
    setItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unitRate: 0, total: 0, trade: 'Other' },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'unitRate') {
        item.total = Number(item.quantity) * Number(item.unitRate);
      }
      updated[index] = item;
      return updated;
    });
  }

  async function runAnalysis() {
    setRunning(true);
    setResult(null);

    try {
      const validItems = items.filter((li) => li.description.trim() && li.total > 0);

      if (shadowEnabled) {
        const shadowResult = await executeShadowRun(
          { runType: 'quote_intelligence', payload: { lineItems: validItems } },
          async (payload) => {
            const analysis = analyseQuote(payload.lineItems as LineItem[]);
            return analysis as unknown as Record<string, unknown>;
          }
        );
        if (shadowResult.success && shadowResult.output) {
          setResult(shadowResult.output as unknown as QuoteAnalysisResult);
        } else {
          setResult(analyseQuote(validItems));
        }
      } else {
        setResult(analyseQuote(validItems));
      }
    } finally {
      setRunning(false);
    }
  }

  const totalValue = items.reduce((s, li) => s + (li.total || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-2">
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
            Read-only experimental analysis. No data is written to the production system.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/50 rounded-lg px-4 py-2.5 mb-8 text-sm text-slate-400">
        <Eye className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span>Read-only mode — this page does not write to any database or modify any production data.</span>
        {shadowEnabled && (
          <span className="ml-auto text-xs text-amber-400 font-mono">shadow logging active</span>
        )}
      </div>

      <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl overflow-hidden mb-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
          <div>
            <h2 className="text-white font-semibold">Line Items</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Total: <span className="text-white font-medium">${totalValue.toLocaleString()}</span>
            </p>
          </div>
          <button
            onClick={addItem}
            className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left text-slate-400 font-medium px-5 py-3 w-[40%]">Description</th>
                <th className="text-left text-slate-400 font-medium px-3 py-3 w-[15%]">Trade</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3 w-[12%]">Qty</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3 w-[14%]">Unit Rate</th>
                <th className="text-right text-slate-400 font-medium px-3 py-3 w-[14%]">Total</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                  <td className="px-5 py-2.5">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      placeholder="Line item description"
                      className="w-full bg-transparent text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50 rounded px-1"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      value={item.trade ?? 'Other'}
                      onChange={(e) => updateItem(index, 'trade', e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500/50 w-full"
                    >
                      {ROLE_OPTIONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full bg-transparent text-white text-right focus:outline-none focus:ring-1 focus:ring-amber-500/50 rounded px-1"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      value={item.unitRate}
                      onChange={(e) => updateItem(index, 'unitRate', parseFloat(e.target.value) || 0)}
                      className="w-full bg-transparent text-white text-right focus:outline-none focus:ring-1 focus:ring-amber-500/50 rounded px-1"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300 font-mono text-xs">
                    ${item.total.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => removeItem(index)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end mb-8">
        <button
          onClick={runAnalysis}
          disabled={running || items.length === 0}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-amber-950 font-bold px-6 py-3 rounded-xl transition-colors"
        >
          {running ? (
            <>
              <span className="w-4 h-4 border-2 border-amber-950/40 border-t-amber-950 rounded-full animate-spin" />
              Analysing…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Analysis
            </>
          )}
        </button>
      </div>

      {result && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-6">
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-white font-semibold text-lg">Analysis Summary</h2>
              <RiskBadge score={result.overallRiskScore} />
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">{result.summary}</p>

            <div className="grid grid-cols-3 gap-4 mt-5">
              {[
                { label: 'Scope Gaps', value: result.scopeGaps.length, icon: AlertTriangle, color: 'text-red-400' },
                { label: 'Cost Anomalies', value: result.costAnomalies.length, icon: TrendingUp, color: 'text-amber-400' },
                { label: 'Weak Signals', value: result.weaknessIndicators.length, icon: Zap, color: 'text-blue-400' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-slate-800/60 rounded-xl p-4 flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
                  <div>
                    <div className="text-2xl font-bold text-white">{value}</div>
                    <div className="text-slate-400 text-xs">{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {result.scopeGaps.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700/50">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="text-white font-semibold">Scope Gaps</h3>
              </div>
              <div className="divide-y divide-slate-800/60">
                {result.scopeGaps.map((gap, i) => (
                  <div key={i} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-white font-medium text-sm mb-1">{gap.item}</div>
                      <div className="text-slate-400 text-sm">{gap.reason}</div>
                    </div>
                    <SeverityBadge severity={gap.severity} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.costAnomalies.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700/50">
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <h3 className="text-white font-semibold">Cost Anomalies</h3>
              </div>
              <div className="divide-y divide-slate-800/60">
                {result.costAnomalies.map((anomaly, i) => (
                  <div key={i} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-white font-medium text-sm mb-1">{anomaly.item}</div>
                      <div className="text-slate-400 text-xs">
                        Submitted: <span className="text-white">${anomaly.submittedRate}/unit</span>
                        {' '}&mdash;{' '}
                        Benchmark: <span className="text-white">${anomaly.benchmarkRate}/unit</span>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-semibold ${anomaly.direction === 'over' ? 'text-red-400' : 'text-emerald-400'}`}>
                      {anomaly.direction === 'over' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {anomaly.direction === 'over' ? '+' : ''}{anomaly.variancePct}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.weaknessIndicators.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700/50">
                <ShieldAlert className="w-4 h-4 text-blue-400" />
                <h3 className="text-white font-semibold">Weakness Indicators</h3>
              </div>
              <div className="divide-y divide-slate-800/60">
                {result.weaknessIndicators.map((w, i) => (
                  <div key={i} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-300 text-xs font-semibold uppercase tracking-wide">{w.category}</span>
                      <ConfidenceBadge confidence={w.confidence} />
                    </div>
                    <div className="text-slate-400 text-sm">{w.signal}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-600 font-mono text-center pb-2">
            [VERIFYTRADE NEXT] Analysis output is experimental and does not affect the production system.
          </p>
        </div>
      )}
    </div>
  );
}
