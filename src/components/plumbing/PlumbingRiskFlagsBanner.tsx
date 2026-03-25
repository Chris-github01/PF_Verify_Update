import { AlertTriangle, XCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { RiskFlag, RiskLevel } from '../../types/plumbingDiscrepancy';

interface Props {
  flags: RiskFlag[];
}

const SEVERITY_CONFIG: Record<RiskLevel, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  low:      { icon: Info,          color: 'text-teal-400',   bg: 'bg-teal-950/30',   border: 'border-teal-800/50' },
  medium:   { icon: Info,          color: 'text-amber-400',  bg: 'bg-amber-950/30',  border: 'border-amber-800/50' },
  high:     { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-950/30', border: 'border-orange-800/50' },
  critical: { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-950/30',    border: 'border-red-800/50' },
};

export default function PlumbingRiskFlagsBanner({ flags }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (flags.length === 0) return null;

  const sorted = [...flags].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-semibold text-white">
            Risk Flags
          </span>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-orange-950/50 text-orange-400 border border-orange-800/50">
            {flags.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {expanded && (
        <div className="divide-y divide-gray-800/60 border-t border-gray-800">
          {sorted.map((flag) => {
            const cfg = SEVERITY_CONFIG[flag.severity];
            const Icon = cfg.icon;
            return (
              <div key={flag.id} className={`px-4 py-3 ${cfg.bg} border-l-2 ${cfg.border}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>
                        {flag.severity}
                      </span>
                      <span className="text-sm font-medium text-white">{flag.title}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{flag.explanation}</p>
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="text-[10px] text-gray-600 uppercase tracking-wider">Action:</span>
                      <span className="text-xs text-gray-400">{flag.suggestedAction}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
