import { TrendingUp, DollarSign, Shield, CheckCircle, AlertTriangle, Star } from 'lucide-react';
import type { EnhancedSupplierMetrics, ScoringWeights } from '../../lib/reports/awardReportEnhancements';
import { getScoreColor, comparisonModeLabel, comparisonModeBadgeClasses } from '../../lib/reports/awardReportEnhancements';

interface WeightedScoringBreakdownProps {
  suppliers: EnhancedSupplierMetrics[];
  weights: ScoringWeights;
}

export default function WeightedScoringBreakdown({ suppliers, weights }: WeightedScoringBreakdownProps) {
  const renderScoreBar = (score: number, color: string) => {
    return (
      <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full transition-all"
          style={{
            width: `${(score / 10) * 100}%`,
            background: color,
          }}
        ></div>
      </div>
    );
  };

  const getCriterionIcon = (criterion: string) => {
    switch (criterion) {
      case 'Price':
        return <DollarSign className="w-5 h-5" />;
      case 'Compliance':
        return <CheckCircle className="w-5 h-5" />;
      case 'Coverage':
        return <TrendingUp className="w-5 h-5" />;
      case 'Risk Mitigation':
        return <Shield className="w-5 h-5" />;
      case 'Confidence':
        return <Star className="w-5 h-5" />;
      default:
        return <TrendingUp className="w-5 h-5" />;
    }
  };

  return (
    <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-700">
        <h3 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-blue-500" />
          </div>
          Weighted Scoring Breakdown
        </h3>
        <p className="text-slate-400 mt-2 text-sm">
          Multi-criteria decision analysis (MCDA) with transparent weighting per criterion
        </p>
      </div>

      <div className="p-8 space-y-8">
        {suppliers.map((supplier, idx) => {
          const criteria = [
            {
              name: 'Price',
              score: supplier.priceScore,
              weight: weights.price,
              description: 'Scope-adjusted comparable price vs. field',
            },
            {
              name: 'Compliance',
              score: supplier.complianceScore,
              weight: weights.compliance,
              description: 'Technical adherence & scope completeness',
            },
            {
              name: 'Coverage',
              score: supplier.coverageScore,
              weight: weights.coverage,
              description: 'Itemised scope coverage (N/A for lump sum)',
            },
            {
              name: 'Risk Mitigation',
              score: supplier.riskScore,
              weight: weights.risk,
              description: 'Delivery & commercial risk (missing items)',
            },
            {
              name: 'Confidence',
              score: supplier.confidenceScore ?? 0,
              weight: weights.confidence ?? 15,
              description: 'Pricing confidence: Detailed=10, Partial=7, Lump Sum=4',
            },
          ];

          const isTopRanked = supplier.rank === 1;

          return (
            <div
              key={idx}
              className={`border rounded-xl p-6 transition-all ${
                isTopRanked
                  ? 'border-orange-600 bg-orange-900/10'
                  : 'border-slate-600 bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg ${
                      isTopRanked
                        ? 'bg-orange-600 text-white'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {supplier.rank}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xl font-bold text-white">{supplier.supplierName}</h4>
                      {supplier.comparisonMode && (
                        <span className={`px-2 py-0.5 text-xs font-bold rounded border ${comparisonModeBadgeClasses(supplier.comparisonMode)}`}>
                          {comparisonModeLabel(supplier.comparisonMode)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {supplier.systemsCovered} of {supplier.totalSystems} systems ({supplier.coveragePercent.toFixed(1)}%)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-400 font-medium">Weighted Total</div>
                  <div className={`text-3xl font-bold ${isTopRanked ? 'text-orange-400' : 'text-blue-400'}`}>
                    {supplier.weightedTotal.toFixed(1)}
                    <span className="text-base text-slate-500 ml-1">/100</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {criteria.map((criterion, cidx) => {
                  const color = getScoreColor(criterion.score);
                  const weightedContribution = ((criterion.score / 10) * criterion.weight).toFixed(1);

                  return (
                    <div
                      key={cidx}
                      className="bg-slate-700/30 rounded-lg p-4 hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: `${color}20`, color }}
                          >
                            {getCriterionIcon(criterion.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200">{criterion.name}</span>
                              <span className="text-xs px-2 py-0.5 bg-slate-600 text-slate-300 rounded-full font-bold">
                                {criterion.weight}%
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">{criterion.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-white text-lg">
                            {criterion.score.toFixed(1)}
                            <span className="text-sm text-slate-400">/10</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            = {weightedContribution} pts
                          </div>
                        </div>
                      </div>
                      {renderScoreBar(criterion.score, color)}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 pt-5 border-t border-slate-600">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-400">
                    Formula: (Price × {weights.price}%) + (Compliance × {weights.compliance}%) + (Coverage × {weights.coverage}%) + (Risk × {weights.risk}%) + (Confidence × {weights.confidence ?? 15}%)
                  </div>
                  <div className="flex items-center gap-2">
                    {supplier.rank === 1 && (
                      <span className="px-3 py-1 bg-orange-600/20 text-orange-400 text-xs font-bold rounded-full border border-orange-600/50">
                        RECOMMENDED
                      </span>
                    )}
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
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-8 py-4 bg-slate-800/40 border-t border-slate-700">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <AlertTriangle className="w-4 h-4" />
          <span>
            Scores are normalized to 0-10 scale. Higher scores indicate better performance.
            Risk Mitigation Score: 10 = minimal risk, 0 = high risk.
          </span>
        </div>
      </div>
    </div>
  );
}
