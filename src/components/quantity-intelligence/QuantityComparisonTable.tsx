import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Info, CheckCircle2, XCircle } from 'lucide-react';
import type { MatchedLineGroup } from '../../lib/quantity-intelligence/lineMatcher';
import type { ReferenceQuantityResult } from '../../lib/quantity-intelligence/referenceQuantityEngine';
import type { ScoredSupplier } from '../../lib/quantity-intelligence/quantityScoring';

interface Props {
  matchedGroups: MatchedLineGroup[];
  referenceResults: Map<string, ReferenceQuantityResult>;
  suppliers: ScoredSupplier[];
  onSelectLine?: (group: MatchedLineGroup) => void;
}

function SpreadBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-600 text-xs">—</span>;
  if (pct >= 30) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400"><AlertTriangle className="w-3 h-3" />{pct.toFixed(1)}%</span>;
  if (pct >= 15) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400"><AlertTriangle className="w-3 h-3" />{pct.toFixed(1)}%</span>;
  return <span className="text-xs text-teal-400">{pct.toFixed(1)}%</span>;
}

function QtyCell({ qty, refQty }: { qty: number | null; refQty: number | null }) {
  if (qty === null) return <span className="text-gray-600 text-xs italic">—</span>;
  if (refQty === null) return <span className="text-xs text-gray-300">{fmtQty(qty)}</span>;

  const ratio = qty / refQty;
  const isUnder = ratio < 0.85;
  const isOver = ratio > 1.20;

  return (
    <div className="flex items-center gap-1">
      <span className={`text-xs font-mono ${isUnder ? 'text-red-400 font-semibold' : isOver ? 'text-blue-400' : 'text-gray-200'}`}>
        {fmtQty(qty)}
      </span>
      {isUnder && <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />}
      {isOver && <Info className="w-3 h-3 text-blue-400 flex-shrink-0" />}
    </div>
  );
}

function fmtQty(v: number): string {
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
}

export default function QuantityComparisonTable({ matchedGroups, referenceResults, suppliers, onSelectLine }: Props) {
  const [sortBy, setSortBy] = useState<'spread' | 'description'>('spread');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showOnlyVariances, setShowOnlyVariances] = useState(false);

  function toggleSort(col: 'spread' | 'description') {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  }

  const sorted = [...matchedGroups].sort((a, b) => {
    if (sortBy === 'spread') {
      const refA = referenceResults.get(a.normalizedKey);
      const refB = referenceResults.get(b.normalizedKey);
      const spreadA = refA?.quantitySpreadPercent ?? 0;
      const spreadB = refB?.quantitySpreadPercent ?? 0;
      return sortDir === 'desc' ? spreadB - spreadA : spreadA - spreadB;
    }
    return sortDir === 'desc'
      ? b.canonicalDescription.localeCompare(a.canonicalDescription)
      : a.canonicalDescription.localeCompare(b.canonicalDescription);
  });

  const filtered = showOnlyVariances
    ? sorted.filter((g) => (referenceResults.get(g.normalizedKey)?.quantitySpreadPercent ?? 0) >= 15)
    : sorted;

  const SortIcon = ({ col }: { col: string }) => (
    sortBy === col
      ? sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline ml-1" /> : <ChevronUp className="w-3 h-3 inline ml-1" />
      : null
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="text-sm font-semibold text-white">Line-by-Line Quantity Comparison</div>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyVariances}
            onChange={(e) => setShowOnlyVariances(e.target.checked)}
            className="accent-amber-500"
          />
          Show variances only
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 p-6 justify-center">
          <CheckCircle2 className="w-4 h-4 text-teal-500" />
          No quantity variances detected in matched lines.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500">
                <th
                  className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-gray-300 min-w-48"
                  onClick={() => toggleSort('description')}
                >
                  Description <SortIcon col="description" />
                </th>
                <th className="text-center px-2 py-2.5 font-medium w-12">Unit</th>
                {suppliers.map((s) => (
                  <th key={s.quoteId} className="text-center px-3 py-2.5 font-medium whitespace-nowrap">
                    {s.supplierName.length > 14 ? `${s.supplierName.slice(0, 13)}…` : s.supplierName}
                  </th>
                ))}
                <th className="text-center px-2 py-2.5 font-medium text-teal-600 whitespace-nowrap">Ref Qty</th>
                <th className="text-center px-2 py-2.5 font-medium">High</th>
                <th className="text-center px-2 py-2.5 font-medium">Low</th>
                <th
                  className="text-center px-2 py-2.5 font-medium cursor-pointer hover:text-gray-300 whitespace-nowrap"
                  onClick={() => toggleSort('spread')}
                >
                  Spread <SortIcon col="spread" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtered.map((group) => {
                const ref = referenceResults.get(group.normalizedKey);
                const refQty = ref?.referenceQuantity ?? null;

                return (
                  <tr
                    key={group.normalizedKey}
                    className="hover:bg-gray-800/40 transition-colors cursor-pointer"
                    onClick={() => onSelectLine?.(group)}
                  >
                    <td className="px-4 py-2.5 text-gray-200 max-w-xs">
                      <div className="truncate" title={group.canonicalDescription}>
                        {group.canonicalDescription}
                      </div>
                      {group.matchMethod === 'description_fuzzy' && (
                        <div className="text-gray-600 mt-0.5">fuzzy match · {(group.matchConfidence * 100).toFixed(0)}%</div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center text-gray-500">{group.unit}</td>
                    {suppliers.map((s) => {
                      const sv = group.supplierValues.find((v) => v.quoteId === s.quoteId);
                      return (
                        <td key={s.quoteId} className="px-3 py-2.5 text-center">
                          <QtyCell qty={sv?.quantity ?? null} refQty={refQty} />
                        </td>
                      );
                    })}
                    <td className="px-2 py-2.5 text-center">
                      {refQty !== null ? (
                        <span className="text-xs font-mono font-semibold text-teal-400">{fmtQty(refQty)}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-center text-gray-400 font-mono">
                      {ref?.highestQuantity !== null && ref?.highestQuantity !== undefined ? fmtQty(ref.highestQuantity) : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-center text-gray-400 font-mono">
                      {ref?.lowestQuantity !== null && ref?.lowestQuantity !== undefined ? fmtQty(ref.lowestQuantity) : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <SpreadBadge pct={ref?.quantitySpreadPercent ?? null} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
