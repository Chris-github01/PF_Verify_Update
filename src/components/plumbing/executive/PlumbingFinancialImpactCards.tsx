import { DollarSign, ShieldCheck, AlertTriangle, TrendingUp, Zap } from 'lucide-react';
import type { AggregatedMetrics, MetricPeriod } from '../../../lib/modules/parsers/plumbing/analytics/analyticsTypes';

type Props = {
  metrics: AggregatedMetrics;
  highestSingleRisk: number;
  period: MetricPeriod;
  onPeriodChange: (p: MetricPeriod) => void;
};

function nzd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

const PERIODS: { key: MetricPeriod; label: string }[] = [
  { key: 'daily',      label: '24h' },
  { key: 'weekly',     label: '7d' },
  { key: 'rolling_30', label: '30d' },
  { key: 'monthly',    label: 'Month' },
];

export default function PlumbingFinancialImpactCards({ metrics, highestSingleRisk, period, onPeriodChange }: Props) {
  const dupeValue  = metrics.impactByType['duplicate_total_prevented']?.totalValue ?? 0;
  const dupeCount  = metrics.impactByType['duplicate_total_prevented']?.count ?? 0;
  const incorrectCount = metrics.impactByType['incorrect_total_detected']?.count ?? 0;
  const reviewCount    = metrics.impactByType['manual_review_correction']?.count ?? 0;
  const reviewValue    = metrics.impactByType['manual_review_correction']?.totalValue ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-white">
          Financial Impact — {metrics.totalQuotesProcessed} quotes
        </h2>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPeriodChange(p.key)}
              className={`text-[10px] px-2.5 py-1 rounded-md transition-colors ${
                period === p.key ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <FinCard icon={DollarSign} label="Total Risk Prevented" value={nzd(metrics.totalFinancialRiskPrevented)} sub="Conservative estimate" color="text-teal-300" accent="border-teal-700/30" />
        <FinCard icon={ShieldCheck} label="Duplicate Totals" value={`${dupeCount}×`} sub={dupeValue > 0 ? `${nzd(dupeValue)} prevented` : 'No value data'} color="text-cyan-300" accent="border-cyan-700/30" />
        <FinCard icon={AlertTriangle} label="Incorrect Totals" value={`${incorrectCount}`} sub="Mismatches flagged" color="text-orange-300" accent="border-orange-700/30" />
        <FinCard icon={TrendingUp} label="Avg Risk / Quote" value={nzd(metrics.averageRiskPerQuote)} sub="Across period" color="text-white" accent="border-gray-700" />
        <FinCard icon={Zap} label="Highest Single Risk" value={nzd(highestSingleRisk)} sub={`${reviewCount} review corrections (${nzd(reviewValue)})`} color="text-red-300" accent="border-red-800/30" />
      </div>
    </div>
  );
}

function FinCard({ icon: Icon, label, value, sub, color, accent }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub: string; color: string; accent: string;
}) {
  return (
    <div className={`bg-gray-900 border ${accent} rounded-xl px-4 py-4`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-600 mt-1">{sub}</div>
    </div>
  );
}
