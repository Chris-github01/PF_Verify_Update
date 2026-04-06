import { ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown } from 'lucide-react';
import type { EnhancedSupplierMetrics } from '../../lib/reports/awardReportEnhancements';
import { formatCurrency, formatPercent } from '../../lib/reports/awardReportEnhancements';

interface EnhancedSupplierTableProps {
  suppliers: EnhancedSupplierMetrics[];
  onSupplierClick?: (supplierName: string) => void;
}

export default function EnhancedSupplierTable({ suppliers, onSupplierClick }: EnhancedSupplierTableProps) {
  const getVarianceIcon = (variance: number) => {
    if (variance > 5) return <TrendingUp className="w-4 h-4 text-red-400" />;
    if (variance < -5) return <TrendingDown className="w-4 h-4 text-green-400" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  const getVarianceColor = (variance: number): string => {
    if (variance > 10) return 'text-red-400 bg-red-900/20';
    if (variance > 5) return 'text-orange-400 bg-orange-900/20';
    if (variance < -5) return 'text-green-400 bg-green-900/20';
    return 'text-slate-400 bg-slate-700/30';
  };

  return (
    <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 overflow-hidden">
      <div className="px-5 py-5 border-b border-slate-700">
        <h3 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-600/20 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-orange-500" />
          </div>
          Enhanced Supplier Comparison
        </h3>
        <p className="text-slate-400 mt-2 text-sm">
          Comprehensive analysis with normalized pricing, variance metrics, and risk-adjusted scoring
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-slate-700 to-slate-800">
            <tr>
              <th className="text-left text-xs font-bold text-white uppercase tracking-wide px-3 py-4">
                Rank
              </th>
              <th className="text-left text-xs font-bold text-white uppercase tracking-wide px-3 py-4">
                Supplier
              </th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">
                Total Price
              </th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">
                Price/Unit
              </th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">
                Variance %
              </th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">
                Coverage
              </th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">
                Risk Score
              </th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">
                Weighted Score
              </th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier, idx) => {
              const isTopChoice = supplier.rank === 1;
              const isBestValue = supplier.isBestValue;
              const isLowestRisk = supplier.isLowestRisk;

              return (
                <tr
                  key={idx}
                  onClick={() => onSupplierClick?.(supplier.supplierName)}
                  className={`border-b border-slate-700 transition-all cursor-pointer
                    ${isTopChoice ? 'bg-gradient-to-r from-orange-900/30 to-transparent' : ''}
                    ${!isTopChoice && idx % 2 === 0 ? 'bg-slate-800/30' : ''}
                    hover:bg-slate-700/40
                  `}
                >
                  <td className="px-3 py-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm
                        ${isTopChoice ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300'}
                      `}
                    >
                      {supplier.rank}
                    </div>
                  </td>

                  <td className="px-3 py-4">
                    <div>
                      <div className="font-semibold text-white flex items-center gap-2">
                        {supplier.supplierName}
                          {isBestValue && (
                          <span className="px-2 py-0.5 bg-green-600/20 text-green-400 text-xs font-bold rounded border border-green-600/50">
                            BEST VALUE
                          </span>
                        )}
                        {isLowestRisk && (
                          <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-xs font-bold rounded border border-blue-600/50">
                            LOWEST RISK
                          </span>
                        )}
                        {supplier.isMultiplierQuote && (
                          <span className="px-2 py-0.5 bg-amber-600/20 text-amber-300 text-xs font-bold rounded border border-amber-500/40">
                            ×{supplier.levelsMultiplier} LEVELS
                          </span>
                        )}
                        {supplier.isLumpSumQuote && (
                          <span className="px-2 py-0.5 bg-slate-600/30 text-slate-400 text-xs font-bold rounded border border-slate-500/40">
                            LUMP SUM
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {supplier.systemsCovered} / {supplier.totalSystems} systems
                        {supplier.isMultiplierQuote && (
                          <span className="ml-1 text-amber-400/70">— per-level rate ×{supplier.levelsMultiplier}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-4 text-right">
                    <div className="font-bold text-green-400 text-base">
                      {formatCurrency(supplier.totalPrice)}
                    </div>
                    {supplier.isMultiplierQuote && supplier.itemsTotal != null && (
                      <div className="text-xs text-amber-400/70 mt-0.5">
                        {formatCurrency(supplier.itemsTotal)} per level
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-4 text-right">
                    <div className="font-semibold text-slate-300">
                      {formatCurrency(supplier.normalizedPricePerSystem)}
                    </div>
                    <div className="text-xs text-slate-500">
                      avg per unit ({supplier.systemsCovered.toLocaleString()} units)
                    </div>
                  </td>

                  <td className="px-3 py-4 text-right">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${getVarianceColor(supplier.variancePercent)}`}>
                      {getVarianceIcon(supplier.variancePercent)}
                      {supplier.variancePercent > 0 ? '+' : ''}
                      {supplier.variancePercent.toFixed(1)}%
                    </div>
                  </td>

                  <td className="px-3 py-4 text-right">
                    <div className="text-slate-300 font-semibold">
                      {formatPercent(supplier.coveragePercent)}
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
                      <div
                        className="bg-gradient-to-r from-blue-600 to-blue-400 h-1.5 rounded-full transition-all"
                        style={{ width: `${supplier.coveragePercent}%` }}
                      ></div>
                    </div>
                  </td>

                  <td className="px-3 py-4 text-right">
                    <span
                      className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ${
                        supplier.riskMitigationScore >= 8
                          ? 'bg-green-600/20 text-green-400 border border-green-600/50'
                          : supplier.riskMitigationScore >= 6
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-600/50'
                          : supplier.riskMitigationScore >= 4
                          ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/50'
                          : 'bg-red-600/20 text-red-400 border border-red-600/50'
                      }`}
                    >
                      {supplier.riskMitigationScore.toFixed(1)}/10
                    </span>
                  </td>

                  <td className="px-3 py-4 text-right">
                    <div className="text-orange-400 font-bold text-lg">
                      {supplier.weightedTotal.toFixed(1)}
                    </div>
                    <div className="text-xs text-slate-500">out of 100</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-4 bg-slate-800/40 border-t border-slate-700">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-600 rounded"></div>
              <span>Best Value</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-600 rounded"></div>
              <span>Lowest Risk</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-600 rounded"></div>
              <span>Top Ranked</span>
            </div>
          </div>
          <div className="text-slate-500">
            Click any row for detailed breakdown
          </div>
        </div>
      </div>
    </div>
  );
}
