import { TrendingUp, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PredictionValidationMetrics } from '../../../lib/modules/parsers/plumbing/predictive/riskTypes';
import { getValidationVerdict } from '../../../lib/modules/parsers/plumbing/predictive/validatePredictions';

interface PlumbingPredictionValidationPanelProps {
  metrics: PredictionValidationMetrics;
}

const VERDICT_STYLES = {
  excellent: 'text-teal-300 bg-teal-500/10 border-teal-500/30',
  good:      'text-green-300 bg-green-500/10 border-green-500/30',
  fair:      'text-amber-300 bg-amber-500/10 border-amber-500/30',
  poor:      'text-red-300 bg-red-500/10 border-red-500/30',
  no_data:   'text-gray-400 bg-gray-800 border-gray-700',
};

export default function PlumbingPredictionValidationPanel({ metrics }: PlumbingPredictionValidationPanelProps) {
  const verdict = getValidationVerdict(metrics);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-gray-500" />
            Prediction Validation
          </h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {metrics.totalPredictions} total predictions, {metrics.anomaliesTotal} confirmed anomalies
          </p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${VERDICT_STYLES[verdict.status]}`}>
          {verdict.status === 'no_data' ? 'No outcome data' : verdict.status}
        </span>
      </div>

      <div className="p-5 space-y-5">
        <p className="text-xs text-gray-400 leading-relaxed">{verdict.message}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricBox label="Precision" value={`${(metrics.precision * 100).toFixed(0)}%`}
            sub="High-risk predictions that were real"
            good={metrics.precision >= 0.7} warn={metrics.precision < 0.4} />
          <MetricBox label="Recall" value={`${(metrics.recall * 100).toFixed(0)}%`}
            sub="Anomalies caught by high-risk flag"
            good={metrics.recall >= 0.7} warn={metrics.recall < 0.4} />
          <MetricBox label="F1 Score" value={metrics.f1Score.toFixed(2)}
            sub="Harmonic mean of precision & recall"
            good={metrics.f1Score >= 0.65} warn={metrics.f1Score < 0.35} />
          <MetricBox label="Coverage" value={`${(metrics.coverageRate * 100).toFixed(0)}%`}
            sub="Anomalies preceded by high-risk score"
            good={metrics.coverageRate >= 0.7} warn={metrics.coverageRate < 0.4} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <div className="text-[10px] text-gray-500">Critical tier correlation</div>
            <CorrelationBar value={metrics.criticalTierCorrelation} label="critical predictions → anomalies" />
            <div className="text-[10px] text-gray-500 mt-3">High tier correlation</div>
            <CorrelationBar value={metrics.highTierCorrelation} label="high predictions → anomalies" />
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <ConfusionEntry icon={CheckCircle2} color="text-teal-400" label="True positives" value={metrics.truePositives} />
            <ConfusionEntry icon={AlertTriangle} color="text-amber-400" label="False positives" value={metrics.falsePositives} />
            <ConfusionEntry icon={AlertTriangle} color="text-orange-400" label="False negatives" value={metrics.falseNegatives} />
            <ConfusionEntry icon={CheckCircle2} color="text-gray-500" label="True negatives" value={metrics.trueNegatives} />
          </div>
        </div>

        {metrics.anomaliesTotal === 0 && (
          <div className="text-xs text-gray-500 italic text-center">
            Outcome data is required to validate predictions. Record actual outcomes using dbRecordPredictionOutcome.
          </div>
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value, sub, good, warn }: {
  label: string; value: string; sub: string; good: boolean; warn: boolean;
}) {
  const color = good ? 'text-teal-300' : warn ? 'text-red-300' : 'text-amber-300';
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-600 mt-0.5 leading-tight">{sub}</div>
    </div>
  );
}

function CorrelationBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'bg-teal-500' : pct >= 45 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">{label}</span>
        <span className="text-[10px] font-bold text-white">{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ConfusionEntry({ icon: Icon, color, label, value }: {
  icon: React.ComponentType<{ className?: string }>; color: string; label: string; value: number;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
      <span className="text-gray-400 flex-1">{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}
