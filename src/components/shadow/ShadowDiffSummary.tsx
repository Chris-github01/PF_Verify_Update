import { CheckCircle, AlertTriangle, XCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ModuleDiff } from '../../types/shadow';

interface Props {
  diff: ModuleDiff;
}

export default function ShadowDiffSummary({ diff }: Props) {
  const rating = diff.passRating;

  const ratingConfig = {
    pass: { icon: CheckCircle,   color: 'text-green-400', bg: 'bg-green-950/60 border-green-800', label: 'PASS' },
    warn: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-950/60 border-amber-800', label: 'WARN' },
    fail: { icon: XCircle,       color: 'text-red-400',   bg: 'bg-red-950/60 border-red-800',     label: 'FAIL' },
  }[rating];
  const Icon = ratingConfig.icon;

  const deltaSign = (diff.totalsDelta ?? 0) >= 0 ? '+' : '';
  const deltaAbs = Math.abs(diff.totalsDelta ?? 0);

  return (
    <div className="space-y-4">
      {/* Rating pill */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${ratingConfig.bg}`}>
        <Icon className={`w-5 h-5 ${ratingConfig.color}`} />
        <div>
          <span className={`text-sm font-bold ${ratingConfig.color}`}>{ratingConfig.label}</span>
          <span className="text-xs text-gray-400 ml-2">
            {rating === 'pass' && 'Shadow output matches live within tolerance'}
            {rating === 'warn' && 'Minor differences detected — review before promoting'}
            {rating === 'fail' && 'Significant discrepancy — do not promote without review'}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Totals Match"
          value={diff.totalsMatch ? 'Yes' : 'No'}
          ok={diff.totalsMatch}
        />
        <StatCard
          label="Total Delta"
          value={`${deltaSign}$${deltaAbs.toLocaleString()}`}
          ok={deltaAbs === 0}
          Icon={deltaAbs > 0 ? TrendingUp : deltaAbs < 0 ? TrendingDown : Minus}
        />
        <StatCard
          label="Item Count Δ"
          value={`${diff.itemCountDelta >= 0 ? '+' : ''}${diff.itemCountDelta}`}
          ok={diff.itemCountDelta === 0}
        />
        <StatCard
          label="Changed Items"
          value={String(diff.changedItems.length)}
          ok={diff.changedItems.length === 0}
        />
      </div>

      {/* Added / Removed items */}
      {diff.addedItems.length > 0 && (
        <ItemList title={`Added in Shadow (${diff.addedItems.length})`} items={diff.addedItems} color="green" />
      )}
      {diff.removedItems.length > 0 && (
        <ItemList title={`Removed in Shadow (${diff.removedItems.length})`} items={diff.removedItems} color="red" />
      )}

      {/* Warning diffs */}
      {diff.addedWarnings.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-800/40 rounded-lg p-3">
          <div className="text-xs font-medium text-amber-400 mb-2">New Warnings in Shadow</div>
          {diff.addedWarnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-300 py-0.5">• {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, ok, Icon: Ic }: {
  label: string; value: string; ok: boolean; Icon?: React.ElementType;
}) {
  return (
    <div className={`rounded-xl border p-3 ${ok ? 'bg-green-950/30 border-green-800/40' : 'bg-red-950/30 border-red-800/40'}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-sm font-bold flex items-center gap-1 ${ok ? 'text-green-400' : 'text-red-400'}`}>
        {Ic && <Ic className="w-3.5 h-3.5" />}
        {value}
      </div>
    </div>
  );
}

function ItemList({ title, items, color }: {
  title: string; items: Array<Record<string, unknown>>; color: 'green' | 'red';
}) {
  const cls = color === 'green'
    ? 'bg-green-950/30 border-green-800/40 text-green-300'
    : 'bg-red-950/30 border-red-800/40 text-red-300';
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-xs font-medium mb-2">{title}</div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {items.slice(0, 20).map((item, i) => (
          <div key={i} className="text-xs py-0.5 opacity-90">
            • {String(item.description ?? item.id ?? JSON.stringify(item)).slice(0, 80)}
          </div>
        ))}
        {items.length > 20 && (
          <div className="text-xs opacity-60 pt-1">... and {items.length - 20} more</div>
        )}
      </div>
    </div>
  );
}
