import { useState } from 'react';
import { PieChart, AlertCircle, DollarSign } from 'lucide-react';
import type { EnhancedSupplierMetrics } from '../../lib/reports/awardReportEnhancements';
import { formatCurrency } from '../../lib/reports/awardReportEnhancements';

interface CoverageBreakdownChartProps {
  supplier: EnhancedSupplierMetrics;
}

export default function CoverageBreakdownChart({ supplier }: CoverageBreakdownChartProps) {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  // Simple SVG pie chart calculation
  const total = supplier.systemsBreakdown.reduce((sum, cat) => sum + cat.count, 0);
  let currentAngle = 0;

  const segments = supplier.systemsBreakdown.map((category) => {
    const percentage = (category.count / total) * 100;
    const angle = (category.count / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;

    currentAngle = endAngle;

    // Convert to radians
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);

    // Calculate path
    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    const path = [
      `M 50 50`,
      `L ${x1} ${y1}`,
      `A 40 40 0 ${largeArc} 1 ${x2} ${y2}`,
      `Z`,
    ].join(' ');

    return {
      ...category,
      path,
      percentage,
    };
  });

  return (
    <div className="bg-slate-800/60 rounded-xl shadow-xl border border-slate-700 overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-700">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
            <PieChart className="w-6 h-6 text-purple-500" />
          </div>
          Coverage Breakdown: {supplier.supplierName}
        </h3>
        <p className="text-slate-400 mt-2 text-sm">
          Systems covered by major category ({supplier.systemsCovered} of {supplier.totalSystems} total)
        </p>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Pie Chart */}
          <div className="relative max-w-xs mx-auto lg:mx-0">
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
              {/* Center circle for donut effect */}
              <circle cx="50" cy="50" r="20" fill="#1e293b" />
              <text
                x="50"
                y="48"
                textAnchor="middle"
                className="text-2xl font-bold"
                fill="white"
                fontSize="8"
              >
                {supplier.coveragePercent.toFixed(0)}%
              </text>
              <text
                x="50"
                y="56"
                textAnchor="middle"
                className="text-xs"
                fill="#94a3b8"
                fontSize="4"
              >
                Coverage
              </text>
            </svg>
          </div>

          {/* Legend */}
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
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: category.color }}
                  ></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-200 truncate">{category.category}</div>
                    <div className="text-xs text-slate-400">{category.count} systems</div>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="font-bold text-white">{category.percentage.toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Scope Gaps */}
        {supplier.scopeGaps && supplier.scopeGaps.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h4 className="text-base font-bold text-white mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              Top 5 Scope Gaps
            </h4>
            <div className="space-y-2">
              {supplier.scopeGaps.map((gap, idx) => (
                <div
                  key={idx}
                  className={`flex items-start justify-between p-3 rounded-lg border ${
                    gap.severity === 'high'
                      ? 'border-red-600/50 bg-red-900/20'
                      : gap.severity === 'medium'
                      ? 'border-yellow-600/50 bg-yellow-900/20'
                      : 'border-blue-600/50 bg-blue-900/20'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-0.5">
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
                    <div className="text-xs text-slate-400 mb-1">Est. Add-On</div>
                    <div className="font-bold text-orange-400 flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      {formatCurrency(gap.estimatedCost)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-slate-700/30 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Total Estimated Gap Cost (20% markup):</span>
                <span className="font-bold text-orange-400 text-base">
                  {formatCurrency(supplier.scopeGaps.reduce((sum, gap) => sum + gap.estimatedCost, 0))}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
