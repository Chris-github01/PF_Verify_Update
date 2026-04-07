import { ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { EnhancedSupplierMetrics } from '../../lib/reports/awardReportEnhancements';
import {
  formatCurrency,
  formatPercent,
  comparisonModeLabel,
  comparisonModeBadgeClasses,
} from '../../lib/reports/awardReportEnhancements';

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
    if (variance > 5)  return 'text-orange-400 bg-orange-900/20';
    if (variance < -5) return 'text-green-400 bg-green-900/20';
    return 'text-slate-400 bg-slate-700/30';
  };

  const getConfidenceDot = (score: number) => {
    if (score >= 9) return 'bg-green-500';
    if (score >= 6) return 'bg-amber-500';
    return 'bg-red-500';
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
          Apples-to-apples comparison using scope-adjusted pricing. Variance is measured against the median of fully itemised suppliers.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gradient-to-r from-slate-700 to-slate-800">
            <tr>
              <th className="text-left text-xs font-bold text-white uppercase tracking-wide px-3 py-4">Rank</th>
              <th className="text-left text-xs font-bold text-white uppercase tracking-wide px-3 py-4">Supplier</th>
              <th className="text-left text-xs font-bold text-white uppercase tracking-wide px-3 py-4">Quote Type</th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">Raw Price</th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">Comparable Price</th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">Variance %</th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">Coverage</th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">Confidence</th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">Risk Score</th>
              <th className="text-right text-xs font-bold text-white uppercase tracking-wide px-3 py-4">Weighted Score</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier, idx) => {
              const isTopChoice  = supplier.rank === 1;
              const isBestValue  = supplier.isBestValue;
              const isLowestRisk = supplier.isLowestRisk;
              const isLowConfidence  = supplier.confidenceScore <= 4;
              const isIncompleteScope = supplier.coveragePercent < 70 && supplier.comparisonMode !== 'LUMP_SUM';

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
                  {/* Rank */}
                  <td className="px-3 py-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm
                      ${isTopChoice ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                      {supplier.rank}
                    </div>
                  </td>

                  {/* Supplier name + badges */}
                  <td className="px-3 py-4">
                    <div>
                      <div className="font-semibold text-white flex flex-wrap items-center gap-2">
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
                      </div>
                      {/* Warning badges */}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {isLowConfidence && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-900/30 text-red-400 text-xs font-semibold rounded border border-red-700/50">
                            <AlertCircle className="w-3 h-3" />
                            Low Confidence Pricing
                          </span>
                        )}
                        {isIncompleteScope && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-900/30 text-amber-400 text-xs font-semibold rounded border border-amber-700/50">
                            <AlertTriangle className="w-3 h-3" />
                            Incomplete Scope
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {supplier.itemsQuoted != null ? supplier.itemsQuoted : supplier.systemsCovered} line items
                      </div>
                    </div>
                  </td>

                  {/* Quote type */}
                  <td className="px-3 py-4">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded border ${comparisonModeBadgeClasses(supplier.comparisonMode)}`}>
                      {comparisonModeLabel(supplier.comparisonMode)}
                    </span>
                  </td>

                  {/* Raw price */}
                  <td className="px-3 py-4 text-right">
                    <div className="font-semibold text-slate-300 text-sm">
                      {formatCurrency(supplier.totalPrice)}
                    </div>
                    {supplier.isMultiplierQuote && supplier.itemsTotal != null && (
                      <div className="text-xs text-amber-400/70 mt-0.5">
                        {formatCurrency(supplier.itemsTotal)} per level
                      </div>
                    )}
                  </td>

                  {/* Comparable price */}
                  <td className="px-3 py-4 text-right">
                    <div className="font-bold text-green-400 text-base">
                      {formatCurrency(supplier.comparablePrice)}
                    </div>
                    {supplier.comparisonMode !== 'FULLY_ITEMISED' && (
                      <div className="text-xs text-slate-500 mt-0.5">scope-adjusted</div>
                    )}
                  </td>

                  {/* Variance vs benchmark */}
                  <td className="px-3 py-4 text-right">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${getVarianceColor(supplier.variancePercent)}`}>
                      {getVarianceIcon(supplier.variancePercent)}
                      {supplier.variancePercent > 0 ? '+' : ''}{supplier.variancePercent.toFixed(1)}%
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">vs itemised median</div>
                  </td>

                  {/* Coverage */}
                  <td className="px-3 py-4 text-right">
                    {supplier.comparisonMode === 'LUMP_SUM' ? (
                      <div className="text-slate-500 text-sm font-medium">N/A</div>
                    ) : (
                      <>
                        <div className="text-slate-300 font-semibold">{formatPercent(supplier.coveragePercent)}</div>
                        <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              supplier.coveragePercent >= 85 ? 'bg-green-500' :
                              supplier.coveragePercent >= 70 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${supplier.coveragePercent}%` }}
                          />
                        </div>
                      </>
                    )}
                  </td>

                  {/* Confidence score */}
                  <td className="px-3 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getConfidenceDot(supplier.confidenceScore)}`} />
                      <span className="text-slate-300 font-semibold text-sm">
                        {supplier.confidenceScore.toFixed(0)}/10
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 text-right">
                      {supplier.comparisonMode === 'FULLY_ITEMISED' ? 'Full detail' :
                       supplier.comparisonMode === 'PARTIAL_BREAKDOWN' ? 'Partial' : 'Lump sum'}
                    </div>
                  </td>

                  {/* Risk score */}
                  <td className="px-3 py-4 text-right">
                    <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-bold ${
                      supplier.riskMitigationScore >= 8 ? 'bg-green-600/20 text-green-400 border border-green-600/50' :
                      supplier.riskMitigationScore >= 6 ? 'bg-blue-600/20 text-blue-400 border border-blue-600/50' :
                      supplier.riskMitigationScore >= 4 ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/50' :
                                                          'bg-red-600/20 text-red-400 border border-red-600/50'
                    }`}>
                      {supplier.riskMitigationScore.toFixed(1)}/10
                    </span>
                  </td>

                  {/* Weighted score */}
                  <td className="px-3 py-4 text-right">
                    <div className="text-orange-400 font-bold text-lg">{supplier.weightedTotal.toFixed(1)}</div>
                    <div className="text-xs text-slate-500">out of 100</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-4 bg-slate-800/40 border-t border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-600 rounded" />
              <span>Best Value</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-600 rounded" />
              <span>Lowest Risk</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-600 rounded" />
              <span>Top Ranked</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-green-600/20 text-green-400 text-xs rounded border border-green-600/50">Detailed</span>
              <span className="px-1.5 py-0.5 bg-amber-600/20 text-amber-400 text-xs rounded border border-amber-600/50">Partial</span>
              <span className="px-1.5 py-0.5 bg-slate-600/30 text-slate-400 text-xs rounded border border-slate-500/40">Lump Sum</span>
              <span>— Quote Type</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Comparable Price = scope-adjusted for apples-to-apples ranking. Click row for details.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
