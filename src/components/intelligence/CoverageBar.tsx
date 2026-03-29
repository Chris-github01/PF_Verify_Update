interface Props {
  label: string;
  pct: number;
  colorClass?: string;
  showValue?: boolean;
}

function colorForPct(pct: number): string {
  if (pct >= 85) return 'bg-emerald-500';
  if (pct >= 70) return 'bg-amber-500';
  if (pct >= 50) return 'bg-orange-500';
  return 'bg-red-500';
}

export default function CoverageBar({ label, pct, colorClass, showValue = true }: Props) {
  const barColor = colorClass ?? colorForPct(pct);
  const displayPct = Math.max(0, Math.min(100, pct));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        {showValue && (
          <span className="text-xs font-semibold text-slate-200">{displayPct.toFixed(0)}%</span>
        )}
      </div>
      <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${displayPct}%` }}
        />
      </div>
    </div>
  );
}
