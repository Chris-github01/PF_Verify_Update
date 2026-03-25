import { Lightbulb, GitBranch, Brain, Eye, UserCheck, Check, X } from 'lucide-react';
import type { OptimizationCandidate, CandidateSource } from '../../../lib/modules/parsers/plumbing/optimization/optimizationTypes';

interface PlumbingCandidateTableProps {
  candidates: OptimizationCandidate[];
  onReject?: (id: string) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}

const SOURCE_CONFIG: Record<CandidateSource, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  learning:   { icon: Brain,     label: 'Learning',   color: 'text-cyan-300' },
  review:     { icon: UserCheck, label: 'Review',     color: 'text-teal-300' },
  predictive: { icon: Eye,       label: 'Predictive', color: 'text-amber-300' },
  manual:     { icon: Lightbulb, label: 'Manual',     color: 'text-gray-300' },
};

const STATUS_STYLE: Record<string, string> = {
  pending:    'text-white bg-gray-800',
  bundled:    'text-teal-300 bg-teal-900/30',
  rejected:   'text-red-400 bg-red-900/20',
  superseded: 'text-gray-500 bg-gray-900',
};

function ConfidenceBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 7 ? 'bg-teal-600' : score >= 5 ? 'bg-amber-600' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400 tabular-nums">{score.toFixed(1)}</span>
    </div>
  );
}

export default function PlumbingCandidateTable({ candidates, onReject, selectable, selectedIds = [], onToggleSelect }: PlumbingCandidateTableProps) {
  if (candidates.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-gray-600">
        No candidates yet. Candidates are generated from learning patterns, review feedback, and predictive signals.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-800">
            {selectable && <th className="pb-2 px-2 text-left text-gray-600 w-8" />}
            <th className="pb-2 px-3 text-left text-gray-500 font-medium">Source</th>
            <th className="pb-2 px-3 text-left text-gray-500 font-medium">Description</th>
            <th className="pb-2 px-3 text-left text-gray-500 font-medium">Patterns</th>
            <th className="pb-2 px-3 text-left text-gray-500 font-medium">Changes</th>
            <th className="pb-2 px-3 text-left text-gray-500 font-medium">Confidence</th>
            <th className="pb-2 px-3 text-left text-gray-500 font-medium">Status</th>
            {onReject && <th className="pb-2 px-3 w-8" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {candidates.map((c) => {
            const src = SOURCE_CONFIG[c.source];
            const SrcIcon = src.icon;
            const isSelected = selectedIds.includes(c.id);
            return (
              <tr key={c.id} className={`hover:bg-gray-800/30 transition-colors ${isSelected ? 'bg-teal-900/10' : ''}`}>
                {selectable && (
                  <td className="py-2.5 px-2">
                    <button
                      onClick={() => onToggleSelect?.(c.id)}
                      disabled={c.status !== 'pending'}
                      className={`w-4 h-4 rounded border ${isSelected ? 'bg-teal-600 border-teal-500' : 'border-gray-600'} flex items-center justify-center transition-colors disabled:opacity-30`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                    </button>
                  </td>
                )}
                <td className="py-2.5 px-3">
                  <div className={`flex items-center gap-1.5 ${src.color}`}>
                    <SrcIcon className="w-3 h-3" />
                    <span className="text-[10px]">{src.label}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 max-w-xs">
                  <div className="text-gray-200 leading-relaxed">{c.description}</div>
                  {c.rejection_reason && (
                    <div className="text-[10px] text-red-400 mt-0.5">{c.rejection_reason}</div>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex flex-wrap gap-1">
                    {c.originating_pattern_keys.slice(0, 3).map((p) => (
                      <span key={p} className="text-[10px] px-1.5 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400 font-mono">
                        {p.slice(0, 20)}
                      </span>
                    ))}
                    {c.originating_pattern_keys.length > 3 && (
                      <span className="text-[10px] text-gray-600">+{c.originating_pattern_keys.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="w-3 h-3 text-gray-600" />
                    <span className="text-gray-400">{c.rule_changes_json.changes.length}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <ConfidenceBar score={c.confidence_score} />
                </td>
                <td className="py-2.5 px-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[c.status] ?? 'text-gray-400'}`}>
                    {c.status}
                  </span>
                </td>
                {onReject && (
                  <td className="py-2.5 px-3">
                    {c.status === 'pending' && (
                      <button onClick={() => onReject(c.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
