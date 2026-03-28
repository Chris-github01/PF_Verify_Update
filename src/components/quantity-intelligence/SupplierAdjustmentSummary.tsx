import { TrendingDown, TrendingUp, ShieldAlert, CheckCircle2, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { ScoredSupplier } from '../../lib/quantity-intelligence/quantityScoring';

interface Props {
  suppliers: ScoredSupplier[];
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}k`;
  if (v === 0) return '$0';
  return `$${Math.abs(v).toFixed(0)}`;
}

function RankBadge({ rank, total, label }: { rank: number; total: number; label: string }) {
  const isBest = rank === 1;
  const isWorst = rank === total;
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${isBest ? 'text-teal-400' : isWorst ? 'text-red-400' : 'text-white'}`}>
        #{rank}
      </div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}

function RankChangeIndicator({ rawRank, normRank }: { rawRank: number; normRank: number }) {
  const delta = rawRank - normRank;
  if (delta === 0) return <span className="flex items-center gap-1 text-xs text-gray-600"><Minus className="w-3 h-3" />No change</span>;
  if (delta > 0) return <span className="flex items-center gap-1 text-xs text-red-400"><TrendingDown className="w-3 h-3" />Drops {delta} place{delta !== 1 ? 's' : ''} normalized</span>;
  return <span className="flex items-center gap-1 text-xs text-teal-400"><TrendingUp className="w-3 h-3" />Rises {Math.abs(delta)} place{Math.abs(delta) !== 1 ? 's' : ''} normalized</span>;
}

function CompletenessBar({ score }: { score: number }) {
  const color = score >= 85 ? 'bg-teal-500' : score >= 65 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Completeness</span>
        <span className={`font-semibold ${score >= 85 ? 'text-teal-400' : score >= 65 ? 'text-amber-400' : 'text-red-400'}`}>
          {score.toFixed(0)}/100
        </span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function SupplierAdjustmentSummary({ suppliers }: Props) {
  const sorted = [...suppliers].sort((a, b) => a.rawRank - b.rawRank);
  const total = suppliers.length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="text-sm font-semibold text-white">Supplier Adjustment Summary</div>
        <div className="text-xs text-gray-500 mt-0.5">
          Raw vs quantity-normalized totals — advisory only
        </div>
      </div>

      <div className="divide-y divide-gray-800">
        {sorted.map((s) => {
          const gapAbs = Math.abs(s.quantityGapValue);
          const gapSign = s.quantityGapValue > 0 ? '+' : s.quantityGapValue < 0 ? '-' : '';
          const gapLabel = gapSign === '+' ? 'under-allowed (hidden cost)' : gapSign === '-' ? 'over-allowed' : 'no gap';

          return (
            <div key={s.quoteId} className={`p-4 ${s.underallowanceFlag ? 'bg-red-500/3' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-white">{s.supplierName}</div>
                  {s.underallowanceFlag && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300">
                      <ShieldAlert className="w-3 h-3" />
                      Under-allowance risk
                    </span>
                  )}
                  {!s.underallowanceFlag && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400">
                      <CheckCircle2 className="w-3 h-3" />
                      Quantities complete
                    </span>
                  )}
                </div>
                <RankChangeIndicator rawRank={s.rawRank} normRank={s.normalizedRank} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Raw Quoted Total</div>
                  <div className="text-base font-bold text-white">{formatCurrency(s.rawTotal)}</div>
                </div>
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Normalized Total</div>
                  <div className={`text-base font-bold ${s.normalizedTotal > s.rawTotal ? 'text-amber-300' : s.normalizedTotal < s.rawTotal ? 'text-teal-300' : 'text-white'}`}>
                    {formatCurrency(s.normalizedTotal)}
                  </div>
                </div>
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Quantity Gap</div>
                  {gapAbs === 0 ? (
                    <div className="text-base font-bold text-gray-500">—</div>
                  ) : (
                    <div className={`text-base font-bold ${gapSign === '+' ? 'text-red-400' : 'text-teal-400'}`}>
                      {gapSign}{formatCurrency(gapAbs)}
                    </div>
                  )}
                  {gapAbs > 0 && <div className="text-xs text-gray-600 mt-0.5">{gapLabel}</div>}
                </div>
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <div className="flex gap-4">
                    <RankBadge rank={s.rawRank} total={total} label="Raw rank" />
                    <RankBadge rank={s.normalizedRank} total={total} label="Norm rank" />
                  </div>
                </div>
              </div>

              <CompletenessBar score={s.completenessScore} />

              <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
                <span>{s.matchedLinesCount} matched lines · {s.underallowedLinesCount} under-allowed</span>
                <span>Raw competitiveness: {s.competitivenessScoreRaw.toFixed(0)}/100 · Normalized: {s.competitivenessScoreNormalized.toFixed(0)}/100</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
