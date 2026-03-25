import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { ReadinessScoreResult } from '../../../lib/modules/release/readinessScore';
import { getReadinessLabel } from '../../../lib/modules/release/readinessScore';

const LEVEL_COLORS = {
  ready: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-300', bar: 'bg-teal-500' },
  nearly_ready: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', bar: 'bg-amber-500' },
  not_ready: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', bar: 'bg-red-500' },
};

interface PlumbingReadinessScoreCardProps {
  result: ReadinessScoreResult;
}

export default function PlumbingReadinessScoreCard({ result }: PlumbingReadinessScoreCardProps) {
  const c = LEVEL_COLORS[result.level];

  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-6`}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">Release Readiness</div>

      <div className="flex items-end gap-3 mb-4">
        <span className={`text-5xl font-bold ${c.text}`}>{result.score}</span>
        <span className="text-gray-600 text-lg mb-1">/100</span>
        <span className={`ml-auto text-xs font-semibold px-3 py-1.5 rounded-full border ${c.bg} ${c.border} ${c.text}`}>
          {getReadinessLabel(result.level)}
        </span>
      </div>

      <div className="h-1.5 bg-gray-800 rounded-full mb-5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${c.bar}`}
          style={{ width: `${result.score}%` }}
        />
      </div>

      <div className="space-y-2 mb-4">
        {result.breakdown.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-xs gap-3">
            <span className="text-gray-400 truncate">{item.label}</span>
            <span className={`shrink-0 font-semibold tabular-nums ${item.points === item.maxPoints ? 'text-teal-400' : item.points === 0 ? 'text-red-400' : 'text-amber-400'}`}>
              {item.points}/{item.maxPoints}
            </span>
          </div>
        ))}
      </div>

      {result.topReasons.length > 0 && (
        <div className="border-t border-white/5 pt-4">
          <div className="text-[10px] text-gray-500 mb-2">Blocking factors</div>
          <ul className="space-y-1">
            {result.topReasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ReadinessIcon({ level }: { level: string }) {
  if (level === 'ready') return <CheckCircle2 className="w-4 h-4 text-teal-400" />;
  if (level === 'nearly_ready') return <Clock className="w-4 h-4 text-amber-400" />;
  return <XCircle className="w-4 h-4 text-red-400" />;
}
