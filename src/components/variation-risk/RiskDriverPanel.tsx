import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { RiskDriver, RiskSeverity } from '../../lib/variation-risk/variationRiskTypes';

interface Props {
  supplierName: string;
  drivers: RiskDriver[];
}

const SEVERITY_CONFIG: Record<RiskSeverity, { badge: string; bar: string; label: string }> = {
  minimal: { badge: 'bg-slate-700/60 text-slate-400 border border-slate-600/40', bar: 'bg-slate-600', label: 'Minimal' },
  low: { badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', bar: 'bg-emerald-500', label: 'Low' },
  moderate: { badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30', bar: 'bg-amber-500', label: 'Moderate' },
  high: { badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/30', bar: 'bg-orange-500', label: 'High' },
  critical: { badge: 'bg-red-500/20 text-red-300 border border-red-500/30', bar: 'bg-red-500', label: 'Critical' },
};

function formatCategory(cat: string) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DriverRow({ driver, maxContribution }: { driver: RiskDriver; maxContribution: number }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[driver.severity];
  const barWidth = maxContribution > 0 ? (driver.weighted_contribution / maxContribution) * 100 : 0;

  return (
    <div className="rounded-lg bg-slate-800/40 border border-slate-700/40 overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors text-left"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
            {cfg.label}
          </span>
          <span className="text-sm text-slate-200 truncate">{formatCategory(driver.category)}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${cfg.bar} rounded-full transition-all duration-300`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 w-8 text-right">
              {Math.round(driver.score)}
            </span>
          </div>
          {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-slate-700/40">
          <p className="text-xs text-slate-400 leading-relaxed">{driver.reason}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            <span>Score: <span className="text-slate-300">{Math.round(driver.score)}/100</span></span>
            <span>Weight: <span className="text-slate-300">{(driver.weight * 100).toFixed(0)}%</span></span>
            <span>Contribution: <span className="text-slate-300">{(driver.weighted_contribution * 100).toFixed(1)}%</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RiskDriverPanel({ supplierName, drivers }: Props) {
  const sorted = [...drivers].sort((a, b) => b.weighted_contribution - a.weighted_contribution);
  const maxContribution = sorted[0]?.weighted_contribution ?? 1;

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-200">
        Risk Drivers — {supplierName}
      </div>
      <div className="space-y-2">
        {sorted.map((d) => (
          <DriverRow key={d.category} driver={d} maxContribution={maxContribution} />
        ))}
      </div>
      <div className="text-xs text-slate-500">
        Each driver is weighted by commercial significance. Click any driver to see the reasoning.
      </div>
    </div>
  );
}
