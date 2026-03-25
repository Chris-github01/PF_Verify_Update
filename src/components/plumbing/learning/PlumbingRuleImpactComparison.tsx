import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import type { RuleImpactComparisonResult } from '../../../lib/modules/parsers/plumbing/learning/analyzeRuleImpact';

interface PlumbingRuleImpactComparisonProps {
  result: RuleImpactComparisonResult;
}

export default function PlumbingRuleImpactComparison({ result }: PlumbingRuleImpactComparisonProps) {
  const verdictConfig = {
    improvement: { label: 'Improvement', color: 'text-teal-300 bg-teal-500/10 border-teal-500/30', Icon: TrendingUp },
    regression: { label: 'Regression Risk', color: 'text-red-300 bg-red-500/10 border-red-500/30', Icon: TrendingDown },
    neutral: { label: 'Neutral', color: 'text-gray-400 bg-gray-800 border-gray-700', Icon: Minus },
    unknown: { label: 'Unknown — run tests', color: 'text-amber-300 bg-amber-500/10 border-amber-500/30', Icon: AlertTriangle },
  };

  const vc = verdictConfig[result.verdict];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Impact Analysis</h2>
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${vc.color}`}>
            <vc.Icon className="w-3.5 h-3.5" />
            {vc.label}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500 font-mono">
          <span>{result.baselineVersion}</span>
          <span>→</span>
          <span className="text-cyan-400">{result.candidateVersion}</span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <p className="text-xs text-gray-400 leading-relaxed">{result.summary}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricBox
            label="Pass rate delta"
            value={result.regressionPassRateDelta !== 0
              ? `${result.regressionPassRateDelta > 0 ? '+' : ''}${(result.regressionPassRateDelta * 100).toFixed(1)}%`
              : '—'}
            positive={result.regressionPassRateDelta > 0}
            negative={result.regressionPassRateDelta < 0}
          />
          <MetricBox
            label="Est. anomaly reduction"
            value={`${(result.estimatedAnomalyReduction * 100).toFixed(0)}%`}
            positive={result.estimatedAnomalyReduction > 0}
          />
          <MetricBox
            label="Accuracy improvement"
            value={`${result.accuracyImprovementPct.toFixed(1)}%`}
            positive={result.accuracyImprovementPct > 0}
          />
          <MetricBox
            label="False positive risk"
            value={`+${(result.estimatedFalsePositiveDelta * 100).toFixed(1)}%`}
            negative={result.estimatedFalsePositiveDelta > 0.08}
          />
        </div>

        {result.changedFields.length > 0 && (
          <div>
            <div className="text-[10px] text-gray-500 mb-2">Changed fields ({result.changedFields.length})</div>
            <div className="space-y-1.5">
              {result.changedFields.map((f) => (
                <div key={f.field} className="flex items-start gap-3 text-xs">
                  <ImpactIcon impact={f.impact} />
                  <div className="flex-1">
                    <span className="font-mono text-gray-300">{f.field}</span>
                    {f.note && <span className="text-gray-600 ml-2">{f.note}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  const color = positive ? 'text-teal-300' : negative ? 'text-red-300' : 'text-gray-400';
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function ImpactIcon({ impact }: { impact: string }) {
  if (impact === 'positive') return <TrendingUp className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />;
  if (impact === 'negative') return <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />;
  if (impact === 'unknown') return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
  return <Minus className="w-3.5 h-3.5 text-gray-600 shrink-0 mt-0.5" />;
}
