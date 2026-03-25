import { Shield, AlertTriangle, AlertOctagon, Activity, Eye, FlaskConical } from 'lucide-react';

interface Distribution {
  total: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
  shadowRecommended: number;
  reviewRecommended: number;
}

interface PlumbingRiskDistributionCardsProps {
  distribution: Distribution;
  periodDays: number;
  onPeriodChange: (days: number) => void;
}

export default function PlumbingRiskDistributionCards({
  distribution,
  periodDays,
  onPeriodChange,
}: PlumbingRiskDistributionCardsProps) {
  const pct = (n: number) =>
    distribution.total > 0 ? `${((n / distribution.total) * 100).toFixed(0)}%` : '—';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Risk Distribution</h2>
        <div className="flex gap-1">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              onClick={() => onPeriodChange(d)}
              className={`text-[10px] px-2.5 py-1 rounded-md transition-colors ${
                periodDays === d ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              {d === 1 ? 'Today' : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TierCard label="Low Risk" value={distribution.low} pct={pct(distribution.low)} color="teal" icon={Shield} />
        <TierCard label="Medium Risk" value={distribution.medium} pct={pct(distribution.medium)} color="amber" icon={Activity} />
        <TierCard label="High Risk" value={distribution.high} pct={pct(distribution.high)} color="orange" icon={AlertTriangle} />
        <TierCard label="Critical Risk" value={distribution.critical} pct={pct(distribution.critical)} color="red" icon={AlertOctagon} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4">
          <FlaskConical className="w-5 h-5 text-cyan-400 shrink-0" />
          <div className="flex-1">
            <div className="text-[10px] text-gray-500">Shadow compare recommended</div>
            <div className="text-xl font-bold text-cyan-300">{distribution.shadowRecommended}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">{pct(distribution.shadowRecommended)} of assessed</div>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4">
          <Eye className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="flex-1">
            <div className="text-[10px] text-gray-500">Manual review recommended</div>
            <div className="text-xl font-bold text-amber-300">{distribution.reviewRecommended}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">{pct(distribution.reviewRecommended)} of assessed</div>
          </div>
        </div>
      </div>

      {distribution.total > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3">
          <div className="text-[10px] text-gray-500 mb-2">Risk tier breakdown — {distribution.total} assessed</div>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            <Bar width={(distribution.low / distribution.total) * 100} color="bg-teal-600" />
            <Bar width={(distribution.medium / distribution.total) * 100} color="bg-amber-600" />
            <Bar width={(distribution.high / distribution.total) * 100} color="bg-orange-600" />
            <Bar width={(distribution.critical / distribution.total) * 100} color="bg-red-600" />
          </div>
          <div className="flex items-center gap-4 mt-1.5">
            {[['teal-600', 'Low'], ['amber-600', 'Medium'], ['orange-600', 'High'], ['red-600', 'Critical']].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full bg-${c}`} />
                <span className="text-[10px] text-gray-500">{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TierCard({ label, value, pct, color, icon: Icon }: {
  label: string; value: number; pct: string; color: string; icon: React.ComponentType<{ className?: string }>;
}) {
  const colorMap: Record<string, string> = {
    teal: 'text-teal-300',
    amber: 'text-amber-300',
    orange: 'text-orange-300',
    red: 'text-red-300',
  };
  const borderMap: Record<string, string> = {
    teal: 'border-teal-900/60',
    amber: 'border-amber-900/60',
    orange: 'border-orange-900/60',
    red: 'border-red-900/60',
  };
  return (
    <div className={`bg-gray-900 border ${borderMap[color]} rounded-xl px-5 py-4`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${colorMap[color]}`} />
        <div className="text-[10px] text-gray-500">{label}</div>
      </div>
      <div className={`text-2xl font-bold ${colorMap[color]}`}>{value}</div>
      <div className="text-[10px] text-gray-600 mt-0.5">{pct}</div>
    </div>
  );
}

function Bar({ width, color }: { width: number; color: string }) {
  if (width <= 0) return null;
  return <div className={`${color} rounded-sm`} style={{ width: `${width}%`, minWidth: 2 }} />;
}
