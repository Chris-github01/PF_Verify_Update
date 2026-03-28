import { useState } from 'react';
import { PieChart, AlertCircle, DollarSign, ChevronDown, ShieldAlert, TrendingUp } from 'lucide-react';
import type { EnhancedSupplierMetrics } from '../../lib/reports/awardReportEnhancements';
import { formatCurrency } from '../../lib/reports/awardReportEnhancements';

interface CoverageBreakdownChartProps {
  supplier: EnhancedSupplierMetrics;
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function getCommercialInterpretation(
  coveragePercent: number,
  highCount: number,
  mediumCount: number,
  totalExposure: number
): { text: string; tone: 'critical' | 'caution' | 'acceptable' } {
  if (coveragePercent < 50) {
    return {
      tone: 'critical',
      text: `Partial scope coverage with identifiable commercial exposure of ${formatCurrency(totalExposure)}. Award acceptable subject to scope clarification and formal controls. Issue RFI for all high-risk gaps before contract execution.`,
    };
  }
  if (highCount >= 3) {
    return {
      tone: 'caution',
      text: `Scope coverage is adequate but ${highCount} high-risk gap${highCount > 1 ? 's' : ''} require formal resolution. Commercial exposure of ${formatCurrency(totalExposure)} should be provisioned. Recommend conditional award with gap clarification timeline.`,
    };
  }
  if (highCount >= 1 || mediumCount >= 3) {
    return {
      tone: 'caution',
      text: `Manageable scope gaps identified. Estimated add-on exposure of ${formatCurrency(totalExposure)} is within acceptable thresholds. Award is commercially viable with standard contract controls in place.`,
    };
  }
  return {
    tone: 'acceptable',
    text: `Scope coverage is strong. Identified gaps are typical for this trade and represent a low commercial risk. Award recommended without significant qualification.`,
  };
}

export default function CoverageBreakdownChart({ supplier }: CoverageBreakdownChartProps) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [showFullGapList, setShowFullGapList] = useState(false);

  const total = supplier.systemsBreakdown.reduce((sum, cat) => sum + cat.count, 0);
  let currentAngle = 0;

  const segments = supplier.systemsBreakdown.map((category) => {
    const percentage = (category.count / total) * 100;
    const angle = (category.count / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);

    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;

    const path = [`M 50 50`, `L ${x1} ${y1}`, `A 40 40 0 ${largeArc} 1 ${x2} ${y2}`, `Z`].join(' ');
    return { ...category, path, percentage };
  });

  const allGaps = supplier.scopeGaps
    ? [...supplier.scopeGaps].sort((a, b) => {
        const sevDiff = (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2);
        if (sevDiff !== 0) return sevDiff;
        return b.estimatedCost - a.estimatedCost;
      })
    : [];

  const significantGaps = allGaps.filter(g => g.severity !== 'low' && g.estimatedCost >= 1000);
  const top5Gaps = significantGaps.slice(0, 5);
  const hasMoreGaps = allGaps.length > 5;

  const totalExposure = allGaps.reduce((sum, g) => sum + g.estimatedCost, 0);
  const highCount = allGaps.filter(g => g.severity === 'high').length;
  const mediumCount = allGaps.filter(g => g.severity === 'medium').length;
  const lowCount = allGaps.filter(g => g.severity === 'low').length;
  const missingCount = (supplier.totalSystems || 0) - (supplier.itemsQuoted || 0);
  const adjustedTotal = supplier.totalPrice + totalExposure;

  const interpretation = getCommercialInterpretation(
    supplier.coveragePercent,
    highCount,
    mediumCount,
    totalExposure
  );

  return (
    <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-700">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
            <PieChart className="w-6 h-6 text-blue-400" />
          </div>
          Coverage Breakdown: {supplier.supplierName}
        </h3>
        <div className="mt-2 space-y-0.5">
          <p className="text-slate-300 text-sm font-medium">
            {supplier.itemsQuoted || supplier.systemsCovered} of {supplier.totalSystems} line items quoted ({supplier.coveragePercent.toFixed(1)}%)
          </p>
          <p className="text-slate-400 text-sm">
            Average Unit Cost: {formatCurrency(supplier.normalizedPricePerSystem)} per unit
          </p>
        </div>
      </div>

      <div className="p-6">
        {/* Commercial Summary Panel */}
        {allGaps.length > 0 && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700 text-center">
              <div className="text-xs text-slate-400 mb-1">Coverage</div>
              <div className="text-lg font-bold text-blue-400">{supplier.coveragePercent.toFixed(1)}%</div>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700 text-center">
              <div className="text-xs text-slate-400 mb-1">Missing Items</div>
              <div className="text-lg font-bold text-slate-300">{missingCount}</div>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-3 border border-red-800/40 text-center">
              <div className="text-xs text-slate-400 mb-1">High Risk</div>
              <div className="text-lg font-bold text-red-400">{highCount}</div>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-3 border border-yellow-800/40 text-center">
              <div className="text-xs text-slate-400 mb-1">Medium Risk</div>
              <div className="text-lg font-bold text-yellow-400">{mediumCount}</div>
            </div>
            <div className="bg-orange-900/20 rounded-lg p-3 border border-orange-700/50 text-center">
              <div className="text-xs text-slate-400 mb-1">Gap Exposure</div>
              <div className="text-base font-bold text-orange-400">{formatCurrency(totalExposure)}</div>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-600 text-center">
              <div className="text-xs text-slate-400 mb-1">Adj. Total</div>
              <div className="text-base font-bold text-green-400">{formatCurrency(adjustedTotal)}</div>
            </div>
          </div>
        )}

        {/* Commercial Interpretation */}
        {allGaps.length > 0 && (
          <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${
            interpretation.tone === 'critical'
              ? 'bg-red-900/20 border-red-700/50'
              : interpretation.tone === 'caution'
              ? 'bg-yellow-900/20 border-yellow-700/50'
              : 'bg-green-900/20 border-green-700/50'
          }`}>
            {interpretation.tone === 'critical' ? (
              <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            ) : interpretation.tone === 'caution' ? (
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            ) : (
              <TrendingUp className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm leading-relaxed ${
              interpretation.tone === 'critical'
                ? 'text-red-200'
                : interpretation.tone === 'caution'
                ? 'text-yellow-200'
                : 'text-green-200'
            }`}>
              {interpretation.text}
            </p>
          </div>
        )}

        {/* Pie chart + legend */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-slate-300 mb-1">Line Item Coverage by Category</h4>
          <p className="text-xs text-slate-500">Breakdown of quoted items across system categories</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="relative max-w-[200px] mx-auto lg:mx-0">
            <svg
              viewBox="0 0 100 100"
              className="w-full drop-shadow-lg"
              style={{ filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))' }}
            >
              {segments.map((segment, idx) => (
                <path
                  key={idx}
                  d={segment.path}
                  fill={segment.color}
                  opacity={hoveredSegment === null || hoveredSegment === segment.category ? 1 : 0.4}
                  className="transition-opacity cursor-pointer"
                  onMouseEnter={() => setHoveredSegment(segment.category)}
                  onMouseLeave={() => setHoveredSegment(null)}
                  strokeWidth="0.5"
                  stroke="#1e293b"
                />
              ))}
              <circle cx="50" cy="50" r="20" fill="#1e293b" />
              <text x="50" y="48" textAnchor="middle" fill="white" fontSize="7">
                {supplier.coveragePercent.toFixed(0)}%
              </text>
              <text x="50" y="55" textAnchor="middle" fill="#94a3b8" fontSize="3.5">
                Coverage
              </text>
            </svg>
          </div>

          <div className="space-y-2">
            {supplier.systemsBreakdown.map((category, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between p-2.5 rounded-lg transition-all cursor-pointer ${
                  hoveredSegment === category.category
                    ? 'bg-slate-700/60 scale-105'
                    : 'bg-slate-700/30 hover:bg-slate-700/50'
                }`}
                onMouseEnter={() => setHoveredSegment(category.category)}
                onMouseLeave={() => setHoveredSegment(null)}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }}></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-200 truncate">{category.category}</div>
                    <div className="text-xs text-slate-400">{category.count} line items</div>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="font-bold text-white">{category.percentage.toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Scope Gaps — HIGH + MEDIUM only, sorted by risk then cost */}
        {top5Gaps.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h4 className="text-base font-bold text-white mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              Top {top5Gaps.length} Scope Gaps
              <span className="text-xs font-normal text-slate-400 ml-1">High &amp; Medium risk only</span>
            </h4>
            <div className="space-y-2">
              {top5Gaps.map((gap, idx) => (
                <div
                  key={idx}
                  className={`flex items-start justify-between p-3 rounded-lg border ${
                    gap.severity === 'high'
                      ? 'border-red-600/50 bg-red-900/20'
                      : 'border-yellow-600/50 bg-yellow-900/20'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                          gap.severity === 'high'
                            ? 'bg-red-600/30 text-red-400'
                            : 'bg-yellow-600/30 text-yellow-400'
                        }`}
                      >
                        {gap.severity.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed">{gap.description}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-slate-400 mb-1">Est. Add-On</div>
                    <div className="font-bold text-orange-400 flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      {formatCurrency(gap.estimatedCost)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-3 p-4 bg-orange-900/20 border border-orange-600/30 rounded-lg">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-semibold text-orange-300">Estimated Add-On Cost to Fill Gaps</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Calculated using market rates from other suppliers with a 20% markup for procurement and risk.
                  </p>
                </div>
                <span className="font-bold text-orange-400 text-xl flex-shrink-0">
                  {formatCurrency(totalExposure)}
                </span>
              </div>
              <div className="mt-3 pt-3 border-t border-orange-600/20">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Adjusted Total Price (Quote + Gaps):</span>
                  <span className="font-semibold text-white">{formatCurrency(adjustedTotal)}</span>
                </div>
              </div>
            </div>

            {/* Full gap list — collapsible */}
            {hasMoreGaps && (
              <div className="mt-4">
                <button
                  onClick={() => setShowFullGapList(!showFullGapList)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/40 hover:bg-slate-700/60 rounded-lg border border-slate-600/50 transition-colors text-sm text-slate-300 font-medium"
                >
                  <span>
                    View Full Scope Gap Breakdown ({allGaps.length} total, including {lowCount} low-risk)
                  </span>
                  <ChevronDown
                    size={18}
                    className={`transition-transform flex-shrink-0 ml-2 ${showFullGapList ? 'rotate-180' : ''}`}
                  />
                </button>

                {showFullGapList && (
                  <div className="mt-3 space-y-2 max-h-96 overflow-y-auto pr-1">
                    {allGaps.map((gap, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start justify-between p-3 rounded-lg border ${
                          gap.severity === 'high'
                            ? 'border-red-600/40 bg-red-900/10'
                            : gap.severity === 'medium'
                            ? 'border-yellow-600/40 bg-yellow-900/10'
                            : 'border-slate-600/30 bg-slate-800/30'
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full mb-1 ${
                              gap.severity === 'high'
                                ? 'bg-red-600/30 text-red-400'
                                : gap.severity === 'medium'
                                ? 'bg-yellow-600/30 text-yellow-400'
                                : 'bg-slate-600/40 text-slate-400'
                            }`}
                          >
                            {gap.severity.toUpperCase()}
                          </span>
                          <p className="text-sm text-slate-300 leading-relaxed">{gap.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0 text-sm font-semibold text-orange-400">
                          {formatCurrency(gap.estimatedCost)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
