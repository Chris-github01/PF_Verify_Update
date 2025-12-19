import { X, Award, AlertTriangle, CheckCircle2, DollarSign, BarChart3, PieChart } from 'lucide-react';
import type { EnhancedSupplierMetrics } from '../../lib/reports/awardReportEnhancements';
import { formatCurrency, formatPercent } from '../../lib/reports/awardReportEnhancements';

interface SupplierDetailModalProps {
  supplier: EnhancedSupplierMetrics | null;
  onClose: () => void;
}

export default function SupplierDetailModal({ supplier, onClose }: SupplierDetailModalProps) {
  if (!supplier) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-900">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-600/20 rounded-xl flex items-center justify-center">
                  <Award className="w-7 h-7 text-orange-500" />
                </div>
                {supplier.supplierName}
              </h2>
              <div className="flex items-center gap-3 mt-3">
                {supplier.isBestValue && (
                  <span className="px-3 py-1 bg-green-600/20 text-green-400 text-xs font-bold rounded-full border border-green-600/50">
                    BEST VALUE
                  </span>
                )}
                {supplier.isLowestRisk && (
                  <span className="px-3 py-1 bg-blue-600/20 text-blue-400 text-xs font-bold rounded-full border border-blue-600/50">
                    LOWEST RISK
                  </span>
                )}
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                  supplier.rank === 1
                    ? 'bg-orange-600/20 text-orange-400 border border-orange-600/50'
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  RANK #{supplier.rank}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
              <div className="text-slate-400 text-xs font-medium mb-1">Total Price</div>
              <div className="text-green-400 text-2xl font-bold">{formatCurrency(supplier.totalPrice)}</div>
            </div>
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
              <div className="text-slate-400 text-xs font-medium mb-1">Coverage</div>
              <div className="text-blue-400 text-2xl font-bold">{formatPercent(supplier.coveragePercent)}</div>
              <div className="text-slate-500 text-xs mt-1">{supplier.systemsCovered}/{supplier.totalSystems} systems</div>
            </div>
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
              <div className="text-slate-400 text-xs font-medium mb-1">Risk Score</div>
              <div className={`text-2xl font-bold ${
                supplier.riskMitigationScore >= 8 ? 'text-green-400' :
                supplier.riskMitigationScore >= 6 ? 'text-blue-400' :
                supplier.riskMitigationScore >= 4 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {supplier.riskMitigationScore.toFixed(1)}/10
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
              <div className="text-slate-400 text-xs font-medium mb-1">Weighted Score</div>
              <div className="text-orange-400 text-2xl font-bold">{supplier.weightedTotal.toFixed(1)}</div>
              <div className="text-slate-500 text-xs mt-1">out of 100</div>
            </div>
          </div>

          {/* Pricing Analysis */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700 mb-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              Pricing Analysis
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-slate-400 text-sm mb-1">Price per System</div>
                <div className="text-white text-xl font-semibold">{formatCurrency(supplier.normalizedPricePerSystem)}</div>
              </div>
              <div>
                <div className="text-slate-400 text-sm mb-1">Variance from Average</div>
                <div className={`text-xl font-semibold ${
                  supplier.variancePercent > 0 ? 'text-red-400' : 'text-green-400'
                }`}>
                  {supplier.variancePercent > 0 ? '+' : ''}{supplier.variancePercent.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* System Coverage Breakdown */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700 mb-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-purple-500" />
              System Coverage by Category
            </h3>
            <div className="space-y-2">
              {supplier.systemsBreakdown.map((category, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: category.color }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-200 text-sm font-medium">{category.category}</span>
                      <span className="text-slate-400 text-sm">{category.count} systems ({category.percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${category.percentage}%`,
                          backgroundColor: category.color
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Assessment */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700 mb-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Risk Assessment
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-slate-800/50 rounded-lg">
                <div className={`text-3xl font-bold mb-2 ${
                  supplier.riskMitigationScore >= 8 ? 'text-green-400' :
                  supplier.riskMitigationScore >= 6 ? 'text-blue-400' :
                  supplier.riskMitigationScore >= 4 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {supplier.riskMitigationScore.toFixed(1)}/10
                </div>
                <div className="text-slate-400 text-sm">Risk Mitigation Score</div>
              </div>
              <div className="text-center p-4 bg-slate-800/50 rounded-lg">
                <div className="text-3xl font-bold text-orange-400 mb-2">
                  {supplier.scopeGaps?.length || 0}
                </div>
                <div className="text-slate-400 text-sm">Identified Gaps</div>
              </div>
              <div className="text-center p-4 bg-slate-800/50 rounded-lg">
                <div className="text-3xl font-bold text-blue-400 mb-2">
                  {supplier.complianceScore.toFixed(1)}/10
                </div>
                <div className="text-slate-400 text-sm">Compliance Score</div>
              </div>
            </div>
          </div>

          {/* Scope Gaps */}
          {supplier.scopeGaps && supplier.scopeGaps.length > 0 && (
            <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-orange-500" />
                Top Scope Gaps ({supplier.scopeGaps.length})
              </h3>
              <div className="space-y-3">
                {supplier.scopeGaps.map((gap, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border ${
                      gap.severity === 'high'
                        ? 'border-red-600/50 bg-red-900/20'
                        : gap.severity === 'medium'
                        ? 'border-yellow-600/50 bg-yellow-900/20'
                        : 'border-blue-600/50 bg-blue-900/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                              gap.severity === 'high'
                                ? 'bg-red-600/30 text-red-400'
                                : gap.severity === 'medium'
                                ? 'bg-yellow-600/30 text-yellow-400'
                                : 'bg-blue-600/30 text-blue-400'
                            }`}
                          >
                            {gap.severity.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed">{gap.description}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-slate-400 mb-1">Estimated Cost</div>
                        <div className="font-bold text-orange-400">{formatCurrency(gap.estimatedCost)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700 flex items-center justify-between">
                <span className="text-slate-400 text-sm">Total Gap Cost (with 20% markup):</span>
                <span className="text-orange-400 font-bold text-lg">
                  {formatCurrency(supplier.scopeGaps.reduce((sum, gap) => sum + gap.estimatedCost, 0))}
                </span>
              </div>
            </div>
          )}

          {/* Scoring Breakdown */}
          <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700 mt-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Weighted Scoring Breakdown
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-300 text-sm">Price Score (40%)</span>
                <span className="text-white font-semibold">{supplier.priceScore?.toFixed(1) || 'N/A'}/10</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-300 text-sm">Coverage Score (35%)</span>
                <span className="text-white font-semibold">{supplier.coverageScore?.toFixed(1) || 'N/A'}/10</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                <span className="text-slate-300 text-sm">Risk Mitigation Score (25%)</span>
                <span className="text-white font-semibold">{supplier.riskMitigationScore.toFixed(1)}/10</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-slate-700 bg-slate-900/50">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
