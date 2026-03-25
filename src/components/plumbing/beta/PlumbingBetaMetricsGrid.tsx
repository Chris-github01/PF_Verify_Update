import type { BetaHealthSummary } from '../../../lib/modules/parsers/plumbing/beta/buildBetaHealthSummary';

interface PlumbingBetaMetricsGridProps {
  summary: BetaHealthSummary;
}

interface MetricCard {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  borderColor?: string;
}

export default function PlumbingBetaMetricsGrid({ summary }: PlumbingBetaMetricsGridProps) {
  const cards: MetricCard[] = [
    {
      label: 'Total Beta Runs',
      value: summary.totalRuns.toString(),
      sub: `${summary.periodDays}d window`,
      color: 'text-white',
      borderColor: 'border-gray-700',
    },
    {
      label: 'Failed Runs',
      value: summary.failedRuns.toString(),
      sub: `${(summary.failureRate * 100).toFixed(1)}% rate`,
      color: summary.failedRuns > 0 ? 'text-red-300' : 'text-gray-300',
      borderColor: summary.failedRuns > 0 ? 'border-red-500/30' : 'border-gray-700',
    },
    {
      label: 'Anomaly Count',
      value: summary.anomalyCount.toString(),
      sub: `${(summary.anomalyRate * 100).toFixed(1)}% rate`,
      color: summary.anomalyCount > 0 ? 'text-amber-300' : 'text-gray-300',
      borderColor: summary.anomalyCount > 0 ? 'border-amber-500/30' : 'border-gray-700',
    },
    {
      label: 'Critical Anomalies',
      value: summary.criticalAnomalyCount.toString(),
      sub: `${summary.unresolvedCriticalCount} unresolved`,
      color: summary.criticalAnomalyCount > 0 ? 'text-red-300' : 'text-gray-300',
      borderColor: summary.criticalAnomalyCount > 0 ? 'border-red-500/30' : 'border-gray-700',
    },
    {
      label: 'Avg Total Delta',
      value: `$${Math.abs(summary.avgTotalDelta).toLocaleString('en-AU', { minimumFractionDigits: 0 })}`,
      sub: summary.avgTotalDelta >= 0 ? 'shadow higher' : 'shadow lower',
      color: Math.abs(summary.avgTotalDelta) > 5000 ? 'text-amber-300' : 'text-gray-300',
      borderColor: Math.abs(summary.avgTotalDelta) > 5000 ? 'border-amber-500/30' : 'border-gray-700',
    },
    {
      label: 'Avg Confidence',
      value: `${(summary.avgConfidence * 100).toFixed(0)}%`,
      sub: summary.avgConfidence < 0.5 ? 'below threshold' : 'acceptable',
      color: summary.avgConfidence < 0.5 ? 'text-amber-300' : 'text-teal-300',
      borderColor: summary.avgConfidence < 0.5 ? 'border-amber-500/30' : 'border-gray-700',
    },
    {
      label: 'Shadow Better',
      value: summary.shadowBetterCount.toString(),
      sub: `vs ${summary.liveBetterCount} live better`,
      color: 'text-cyan-300',
      borderColor: 'border-gray-700',
    },
    {
      label: 'Inconclusive',
      value: summary.inconclusiveCount.toString(),
      sub: 'no clear winner',
      color: 'text-gray-400',
      borderColor: 'border-gray-700',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <div key={i} className={`bg-gray-900 border ${c.borderColor} rounded-xl p-4`}>
          <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">{c.label}</div>
          <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
          {c.sub && <div className="text-[10px] text-gray-600 mt-0.5">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}
