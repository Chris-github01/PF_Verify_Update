import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, Info } from 'lucide-react';
import type { DuplicationFlag } from '../../types/boqNormalisation.types';

interface Props {
  flags: DuplicationFlag[];
  supplierNames: Record<string, string>;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  low: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
};

function fmtCurrency(v: number) {
  if (v === 0) return '—';
  return '$' + v.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtQty(v: number) {
  if (v === 0) return '—';
  return v.toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

export default function DuplicationRiskTable({ flags, supplierNames }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'severity' | 'valueAtRisk'>('severity');

  const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

  const sorted = [...flags].sort((a, b) => {
    if (sortField === 'severity') return (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
    return b.valueAtRisk - a.valueAtRisk;
  });

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (flags.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700/60 p-8 text-center">
        <Info className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">No duplication flags detected for this run.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/60 border-b border-slate-700/60">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          Duplication Risk Flags ({flags.length})
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Sort:</span>
          {(['severity', 'valueAtRisk'] as const).map(f => (
            <button
              key={f}
              onClick={() => setSortField(f)}
              className={`text-xs px-2 py-1 rounded-md transition-colors ${
                sortField === f ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f === 'severity' ? 'Severity' : 'Value at Risk'}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-700/40">
        {sorted.map(flag => {
          const isOpen = expanded.has(flag.flagId);
          const supplierName = supplierNames[flag.supplierId] || flag.supplierId;
          return (
            <div key={flag.flagId}>
              <button
                className="w-full text-left px-4 py-3 hover:bg-slate-800/40 transition-colors"
                onClick={() => toggle(flag.flagId)}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_BADGE[flag.severity]}`}>
                    {flag.severity.toUpperCase()}
                  </span>
                  <span className="text-sm text-slate-200 flex-1 text-left font-medium">{flag.commercialTag}</span>
                  <span className="text-xs text-slate-400 hidden md:block">{supplierName}</span>
                  <span className={`text-sm font-medium ${flag.valueAtRisk > 0 ? 'text-red-400' : 'text-slate-400'} min-w-[80px] text-right`}>
                    {fmtCurrency(flag.valueAtRisk)}
                  </span>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                </div>
                <div className="mt-1 flex items-center gap-4 pl-1">
                  <span className="text-xs text-slate-500">{flag.flagType.replace(/_/g, ' ')}</span>
                  {flag.quantityAtRisk > 0 && (
                    <span className="text-xs text-orange-400">{fmtQty(flag.quantityAtRisk)} units at risk</span>
                  )}
                  <span className="text-xs text-slate-500">{flag.quoteItemIds.length} source line(s)</span>
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 bg-slate-900/40 border-t border-slate-700/30">
                  <div className="mt-3 space-y-2">
                    <div>
                      <span className="text-xs text-slate-400 font-medium block mb-1">Explanation</span>
                      <p className="text-sm text-slate-300">{flag.explanation}</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 font-medium block mb-1">Commercial Impact</span>
                      <p className="text-sm text-slate-300">{flag.commercialImpact}</p>
                    </div>
                    {flag.affectedSourceLines.length > 0 && (
                      <div>
                        <span className="text-xs text-slate-400 font-medium block mb-1">Affected Source Lines</span>
                        <div className="space-y-1">
                          {flag.affectedSourceLines.slice(0, 5).map((ref, i) => (
                            <div key={i} className="text-xs text-slate-400 bg-slate-800/60 rounded px-2 py-1">
                              <span className="text-slate-300">{ref.sourceDescription}</span>
                              {ref.sourceSection && <span className="text-slate-500 ml-2">§ {ref.sourceSection}</span>}
                              <span className="text-slate-500 ml-2">Qty: {ref.rawQuantity}</span>
                              <span className="text-slate-500 ml-2">${ref.rawTotal.toFixed(0)}</span>
                            </div>
                          ))}
                          {flag.affectedSourceLines.length > 5 && (
                            <p className="text-xs text-slate-500 italic">+ {flag.affectedSourceLines.length - 5} more lines</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
