import { useEffect, useState, useCallback } from 'react';
import {
  DollarSign, TrendingDown, AlertTriangle, Shield,
  RefreshCw, BarChart2, ArrowRight, Clock, Filter,
} from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import {
  getOrComputeAggregate,
  getTopRiskyRuns,
  computeRevenueProtectionAggregate,
} from '../../lib/phase6/revenueProtectionAggregator';
import type {
  RevenueProtectionAggregate,
  TimeWindow,
  LeakageCategory,
  RunRiskRow,
} from '../../lib/phase6/revenueProtectionAggregator';

const MODULE_OPTIONS = [
  { value: 'all', label: 'All Modules' },
  { value: 'plumbing_parser', label: 'Plumbing' },
  { value: 'passive_fire_parser', label: 'Passive Fire' },
  { value: 'hvac_parser', label: 'HVAC' },
  { value: 'active_fire_parser', label: 'Active Fire' },
];

const WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all_time', label: 'All time' },
];

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000).toLocaleString()}k`;
  return `$${value.toLocaleString()}`;
}

function RiskLevelBadge({ level }: { level: string }) {
  const map = {
    low: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border ${map[level as keyof typeof map] ?? map.low}`}>
      {level.toUpperCase()}
    </span>
  );
}

function MetricCard({
  label, value, sub, icon: Icon, color = 'text-white',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center">
          <Icon className="w-4.5 h-4.5 text-gray-400" />
        </div>
      </div>
      <div className={`text-2xl font-bold ${color} mb-1`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

function LeakageCategoryBar({ cat, maxValue }: { cat: LeakageCategory; maxValue: number }) {
  const pct = maxValue > 0 ? (cat.total_value / maxValue) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-300">{cat.label}</span>
        <div className="flex items-center gap-3">
          <span className="text-gray-500">{cat.count} event{cat.count !== 1 ? 's' : ''}</span>
          <span className="text-red-400 font-mono font-semibold">{formatCurrency(cat.total_value)}</span>
        </div>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function RevenueProtectionDashboard() {
  const [moduleKey, setModuleKey] = useState('all');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');
  const [aggregate, setAggregate] = useState<RevenueProtectionAggregate | null>(null);
  const [topRuns, setTopRuns] = useState<RunRiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [agg, runs] = await Promise.all([
      getOrComputeAggregate(moduleKey, timeWindow),
      getTopRiskyRuns(moduleKey, timeWindow, 10),
    ]);
    setAggregate(agg);
    setTopRuns(runs);
    setLoading(false);
  }, [moduleKey, timeWindow]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRecompute() {
    setRecomputing(true);
    const agg = await computeRevenueProtectionAggregate(moduleKey, timeWindow);
    setAggregate(agg);
    const runs = await getTopRiskyRuns(moduleKey, timeWindow, 10);
    setTopRuns(runs);
    setRecomputing(false);
  }

  const highRiskPct = aggregate && aggregate.total_quotes > 0
    ? Math.round((aggregate.high_risk_quote_count / aggregate.total_quotes) * 100)
    : 0;

  const cats = (aggregate?.top_leakage_categories_json ?? []) as LeakageCategory[];
  const maxCatValue = cats.reduce((m, c) => Math.max(m, c.total_value), 0);

  return (
    <ShadowLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-red-400" />
              Revenue Protection Dashboard
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Financial risk exposure across all quote runs — Phase 6
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRecompute}
              disabled={recomputing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${recomputing ? 'animate-spin' : ''}`} />
              {recomputing ? 'Recomputing...' : 'Recompute'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={moduleKey}
              onChange={(e) => setModuleKey(e.target.value)}
              className="bg-transparent text-sm text-gray-300 outline-none cursor-pointer"
            >
              {MODULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <select
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value as TimeWindow)}
              className="bg-transparent text-sm text-gray-300 outline-none cursor-pointer"
            >
              {WINDOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-gray-900">{o.label}</option>
              ))}
            </select>
          </div>
          {aggregate && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Clock className="w-3 h-3" />
              Last computed: {new Date(aggregate.computed_at).toLocaleString()}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-12 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Computing revenue protection metrics...
          </div>
        ) : !aggregate ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <BarChart2 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <div className="text-sm text-gray-500">No data found for this filter combination.</div>
            <div className="text-xs text-gray-600 mt-1">Shadow runs with commercial risk profiles are required.</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Total Revenue at Risk"
                value={formatCurrency(aggregate.total_estimated_leakage)}
                sub={`across ${aggregate.total_quotes} quote${aggregate.total_quotes !== 1 ? 's' : ''}`}
                icon={DollarSign}
                color="text-red-300"
              />
              <MetricCard
                label="Average Risk Score"
                value={`${aggregate.avg_risk_score}/100`}
                sub="across all runs in window"
                icon={Shield}
                color={aggregate.avg_risk_score >= 50 ? 'text-orange-300' : aggregate.avg_risk_score >= 25 ? 'text-amber-300' : 'text-teal-300'}
              />
              <MetricCard
                label="High Risk Quotes"
                value={`${aggregate.high_risk_quote_count}`}
                sub={`${highRiskPct}% of total quotes`}
                icon={AlertTriangle}
                color={highRiskPct >= 30 ? 'text-red-300' : highRiskPct >= 15 ? 'text-amber-300' : 'text-white'}
              />
              <MetricCard
                label="Total Quotes Analysed"
                value={`${aggregate.total_quotes}`}
                sub={`${WINDOW_OPTIONS.find((o) => o.value === timeWindow)?.label}`}
                icon={BarChart2}
              />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <h3 className="text-sm font-semibold text-white">Leakage by Category</h3>
                </div>
                {cats.length === 0 ? (
                  <div className="text-xs text-gray-600 py-4 text-center">No leakage events in this window</div>
                ) : (
                  <div className="space-y-4">
                    {cats.map((cat) => (
                      <LeakageCategoryBar key={cat.type} cat={cat} maxValue={maxCatValue} />
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  <h3 className="text-sm font-semibold text-white">Top Risky Quotes</h3>
                </div>
                {topRuns.length === 0 ? (
                  <div className="text-xs text-gray-600 py-4 text-center">No runs found</div>
                ) : (
                  <div className="space-y-2">
                    {topRuns.map((run) => (
                      <a
                        key={run.run_id}
                        href={`/shadow/runs/${run.run_id}/intelligence`}
                        className="flex items-center gap-3 px-3 py-2.5 bg-gray-800/60 hover:bg-gray-800 rounded-lg transition-colors group"
                      >
                        <RiskLevelBadge level={run.overall_risk_level} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-300 truncate">
                            {run.source_label ?? run.run_id.slice(0, 12)}
                          </div>
                          <div className="text-xs text-gray-600">{run.module_key}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs font-mono text-red-400">{formatCurrency(run.total_leakage)}</div>
                          <div className="text-xs text-gray-600">score: {run.overall_risk_score}</div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-700 group-hover:text-gray-400 transition-colors flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </ShadowLayout>
  );
}
