import { TrendingUp, Shield, Scale, DollarSign, TrendingDown } from 'lucide-react';
import type { EnhancedSupplierMetrics } from '../../lib/reports/awardReportEnhancements';
import { formatCurrency, formatPercent } from '../../lib/reports/awardReportEnhancements';

interface EnhancedRecommendationsCardProps {
  bestValue: EnhancedSupplierMetrics | null;
  lowestRisk: EnhancedSupplierMetrics | null;
  balanced: EnhancedSupplierMetrics | null;
  highestPrice: number;
  lowestPrice: number;
  onSelectSupplier?: (supplierName: string) => void;
}

export default function EnhancedRecommendationsCard({
  bestValue,
  lowestRisk,
  balanced,
  highestPrice,
  lowestPrice,
  onSelectSupplier,
}: EnhancedRecommendationsCardProps) {
  const potentialSavings = bestValue ? highestPrice - bestValue.totalPrice : 0;
  const savingsPercent = highestPrice > 0 ? ((potentialSavings / highestPrice) * 100) : 0;

  const renderRecommendationCard = (
    supplier: EnhancedSupplierMetrics | null,
    title: string,
    subtitle: string,
    icon: React.ElementType,
    colorClasses: string,
    iconBg: string
  ) => {
    if (!supplier) return null;

    // Estimate full-scope cost (add 15% for missing items)
    const fullScopeCost = supplier.coveragePercent < 100
      ? supplier.totalPrice + ((supplier.totalSystems - supplier.systemsCovered) * (supplier.totalPrice / supplier.systemsCovered) * 1.15)
      : supplier.totalPrice;

    const Icon = icon;

    return (
      <div
        onClick={() => onSelectSupplier?.(supplier.supplierName)}
        className={`${colorClasses} rounded-xl shadow-xl p-8 border-2 transition-all hover:scale-105 cursor-pointer`}
      >
        <div className={`flex items-center justify-center w-16 h-16 ${iconBg} rounded-xl mx-auto mb-4 shadow-lg`}>
          <Icon className="w-8 h-8 text-white" />
        </div>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-80">{title}</p>
          <p className="text-2xl font-bold text-white mb-4">
            {supplier.supplierName}
          </p>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="opacity-80">Current Quote</span>
              <span className="font-bold">{formatCurrency(supplier.totalPrice)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="opacity-80">Coverage</span>
              <span className="font-bold">{formatPercent(supplier.coveragePercent)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="opacity-80">Risk Score</span>
              <span className="font-bold">{supplier.riskMitigationScore.toFixed(1)}/10</span>
            </div>
            {supplier.coveragePercent < 100 && (
              <div className="flex justify-between items-center py-2 border-b border-white/10">
                <span className="opacity-80 text-xs">Est. Full-Scope Cost</span>
                <span className="font-bold text-xs">{formatCurrency(fullScopeCost)}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2">
              <span className="opacity-80">Weighted Score</span>
              <span className="font-bold text-lg">{supplier.weightedTotal.toFixed(1)}/100</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Savings */}
      {bestValue && potentialSavings > 0 && (
        <div className="bg-gradient-to-r from-green-900/40 to-green-800/20 rounded-xl p-6 border-2 border-green-600/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-green-600 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-sm text-green-300 font-semibold">Potential Savings</p>
                <p className="text-3xl font-bold text-white">{formatCurrency(potentialSavings)}</p>
                <p className="text-xs text-green-400 mt-1">
                  {savingsPercent.toFixed(1)}% below highest bid
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-green-300 mb-1">Price Range</p>
              <p className="text-sm text-white">
                {formatCurrency(lowestPrice)} - {formatCurrency(highestPrice)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Three Recommendation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {renderRecommendationCard(
          bestValue,
          'Best Value',
          'Optimal price-to-value ratio',
          TrendingUp,
          'bg-gradient-to-br from-green-900/40 to-green-800/20 border-green-600/30 hover:border-green-500/50',
          'bg-green-600'
        )}

        {renderRecommendationCard(
          lowestRisk,
          'Lowest Risk',
          'Highest compliance & coverage',
          Shield,
          'bg-gradient-to-br from-blue-900/40 to-blue-800/20 border-blue-600/30 hover:border-blue-500/50',
          'bg-blue-600'
        )}

        {renderRecommendationCard(
          balanced,
          'Balanced Choice',
          'Best overall weighted score',
          Scale,
          'bg-gradient-to-br from-orange-900/40 to-orange-800/20 border-orange-600/30 hover:border-orange-500/50',
          'bg-orange-600'
        )}
      </div>

      {/* Why This Recommendation Section */}
      <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 p-8">
        <h3 className="text-2xl font-bold text-white mb-6">Why This Recommendation?</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {bestValue && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <h4 className="font-bold text-green-400">Best Value</h4>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                <strong>{bestValue.supplierName}</strong> delivers the lowest price at{' '}
                {formatCurrency(bestValue.totalPrice)} while maintaining {formatPercent(bestValue.coveragePercent)} coverage.
                {bestValue.coveragePercent < 100 && (
                  <> Estimated full-scope cost with gaps: {formatCurrency(
                    bestValue.totalPrice + ((bestValue.totalSystems - bestValue.systemsCovered) * (bestValue.totalPrice / bestValue.systemsCovered) * 1.15)
                  )}.</>
                )}
              </p>
            </div>
          )}

          {lowestRisk && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <h4 className="font-bold text-blue-400">Lowest Risk</h4>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                <strong>{lowestRisk.supplierName}</strong> presents the lowest delivery and commercial risk with a score of{' '}
                {lowestRisk.riskMitigationScore.toFixed(1)}/10 and {formatPercent(lowestRisk.coveragePercent)} scope coverage.
                Minimal variation risk and highest compliance.
              </p>
            </div>
          )}

          {balanced && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
                  <Scale className="w-5 h-5 text-white" />
                </div>
                <h4 className="font-bold text-orange-400">Balanced Choice</h4>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                <strong>{balanced.supplierName}</strong> achieves the highest weighted score of{' '}
                {balanced.weightedTotal.toFixed(1)}/100 across all evaluation criteria, balancing price, compliance, coverage, and risk.
                Recommended for optimal procurement outcome.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
