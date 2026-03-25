import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import type { ReleaseConfidenceRecord } from '../../../lib/modules/parsers/plumbing/analytics/analyticsTypes';
import { calculateReleaseConfidence } from '../../../lib/modules/parsers/plumbing/analytics/calculateReleaseConfidence';

interface PlumbingReleaseConfidencePanelProps {
  record: ReleaseConfidenceRecord | null;
  onRecalculate?: () => void;
  loading?: boolean;
}

const VERDICT_CONFIG = {
  READY:   { icon: CheckCircle2, color: 'text-teal-300', bg: 'bg-teal-900/20 border-teal-700/40', label: 'READY' },
  CAUTION: { icon: AlertTriangle, color: 'text-amber-300', bg: 'bg-amber-900/20 border-amber-700/40', label: 'CAUTION' },
  BLOCKED: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/20 border-red-700/40', label: 'BLOCKED' },
};

function scoreColor(score: number): string {
  if (score >= 95) return 'text-teal-300';
  if (score >= 85) return 'text-amber-300';
  return 'text-red-400';
}

function statusStyle(status: 'pass' | 'warn' | 'fail'): string {
  return status === 'pass' ? 'text-teal-400' : status === 'warn' ? 'text-amber-400' : 'text-red-400';
}

export default function PlumbingReleaseConfidencePanel({ record, onRecalculate, loading }: PlumbingReleaseConfidencePanelProps) {
  if (!record) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center space-y-3">
        <p className="text-sm text-gray-500">No release confidence data available.</p>
        {onRecalculate && (
          <button onClick={onRecalculate} disabled={loading} className="text-xs font-medium px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40">
            {loading ? 'Calculating...' : 'Calculate now'}
          </button>
        )}
      </div>
    );
  }

  const result = calculateReleaseConfidence({
    regressionPassRate: record.regression_pass_rate,
    anomalyRate: record.anomaly_rate,
    reviewFailureRate: record.review_failure_rate,
    predictiveAccuracy: record.predictive_accuracy,
  });

  const verdictCfg = VERDICT_CONFIG[result.verdict];
  const VerdictIcon = verdictCfg.icon;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Release Confidence</h2>
        {onRecalculate && (
          <button onClick={onRecalculate} disabled={loading} className="text-[10px] text-gray-400 hover:text-white border border-gray-700 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40">
            {loading ? 'Calculating...' : 'Recalculate'}
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Verdict */}
        <div className={`flex items-center gap-4 rounded-xl border px-5 py-4 ${verdictCfg.bg}`}>
          <VerdictIcon className={`w-8 h-8 ${verdictCfg.color} shrink-0`} />
          <div className="flex-1">
            <div className={`text-2xl font-bold tracking-wide ${verdictCfg.color}`}>{verdictCfg.label}</div>
            <p className="text-xs text-gray-400 mt-0.5">{result.recommendation}</p>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-3xl font-black ${scoreColor(result.confidenceScore)}`}>{result.confidenceScore}</div>
            <div className="text-[10px] text-gray-500">/ 100</div>
          </div>
        </div>

        {/* Score gauge */}
        <div>
          <div className="flex justify-between text-[10px] text-gray-600 mb-1">
            <span>0 — Blocked</span>
            <span>85 — Caution</span>
            <span>95 — Ready</span>
            <span>100</span>
          </div>
          <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
              style={{
                width: `${result.confidenceScore}%`,
                background: result.confidenceScore >= 95 ? '#0d9488' : result.confidenceScore >= 85 ? '#f59e0b' : '#ef4444',
              }}
            />
            <div className="absolute top-0 h-full w-px bg-amber-600/50" style={{ left: '85%' }} />
            <div className="absolute top-0 h-full w-px bg-teal-600/50" style={{ left: '95%' }} />
          </div>
        </div>

        {/* Signal breakdown */}
        <div className="space-y-2">
          <div className="text-[10px] text-gray-500 font-medium">Signal breakdown</div>
          {result.breakdown.map((signal) => (
            <div key={signal.signal} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-300">{signal.signal}</span>
                  <span className={`text-xs font-bold ${statusStyle(signal.status)}`}>
                    {signal.value.toFixed(1)}{signal.signal.includes('rate') ? '%' : ''}
                  </span>
                </div>
                <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                  <div className={`h-full rounded-full ${signal.status === 'pass' ? 'bg-teal-600' : signal.status === 'warn' ? 'bg-amber-600' : 'bg-red-600'}`}
                    style={{ width: `${signal.contribution / signal.weight}%` }} />
                </div>
              </div>
              <div className="text-[10px] text-gray-600 w-16 text-right">
                Weight: {Math.round(signal.weight * 100)}%
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-[10px] text-gray-600">
          <Info className="w-3 h-3" />
          Last calculated: {new Date(record.created_at).toLocaleString()} · Version: {record.version}
        </div>
      </div>
    </div>
  );
}
