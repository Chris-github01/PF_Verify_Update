import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface TrendPoint { date: string; value: number; count: number }

interface PlumbingRiskTrendChartProps {
  data: TrendPoint[];
  title?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' });
}

function nzd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

export default function PlumbingRiskTrendChart({ data, title = 'Risk Prevention Trend' }: PlumbingRiskTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No trend data available. Impact events will appear here as the system detects risks.
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const totalValue = data.reduce((s, d) => s + d.value, 0);
  const totalCount = data.reduce((s, d) => s + d.count, 0);

  const firstHalf = data.slice(0, Math.floor(data.length / 2));
  const secondHalf = data.slice(Math.floor(data.length / 2));
  const firstAvg = firstHalf.reduce((s, d) => s + d.value, 0) / (firstHalf.length || 1);
  const secondAvg = secondHalf.reduce((s, d) => s + d.value, 0) / (secondHalf.length || 1);
  const trend = secondAvg > firstAvg * 1.1 ? 'up' : secondAvg < firstAvg * 0.9 ? 'down' : 'stable';

  const trendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const TrendIcon = trendIcon;
  const trendColor = trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-teal-400' : 'text-gray-400';
  const trendLabel = trend === 'up' ? 'Increasing risk detection' : trend === 'down' ? 'Decreasing risk detection' : 'Stable';

  const showLabels = data.length <= 14;
  const step = Math.max(1, Math.floor(data.length / 7));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <div className={`flex items-center gap-1.5 text-xs ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" />
          {trendLabel}
        </div>
      </div>

      <div className="px-5 py-3 grid grid-cols-2 gap-4 border-b border-gray-800">
        <div>
          <div className="text-[10px] text-gray-500">Total value in period</div>
          <div className="text-lg font-bold text-teal-300">{nzd(totalValue)}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-500">Total events</div>
          <div className="text-lg font-bold text-white">{totalCount}</div>
        </div>
      </div>

      <div className="px-5 pt-4 pb-3">
        <div className="flex items-end gap-0.5 h-28">
          {data.map((point, i) => {
            const heightPct = maxValue > 0 ? (point.value / maxValue) * 100 : 0;
            const showLabel = showLabels || i % step === 0;
            return (
              <div key={point.date} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${formatDate(point.date)}: ${nzd(point.value)} (${point.count} events)`}>
                <div className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${Math.max(heightPct, point.value > 0 ? 4 : 0)}%`,
                    backgroundColor: point.value > 0 ? '#0d9488' : '#1f2937',
                  }}
                />
                {showLabel && (
                  <div className="text-[8px] text-gray-600 truncate w-full text-center">
                    {formatDate(point.date).split(' ')[1]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-5 pb-3">
        <div className="text-[10px] text-gray-600">
          Each bar = one day. Height proportional to estimated financial risk prevented. Hover for details.
        </div>
      </div>
    </div>
  );
}
