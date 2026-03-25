import { useState } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import PlumbingDetectionSignalsBadges from './PlumbingDetectionSignalsBadges';
import type { RowClassificationChange } from '../../types/plumbingDiscrepancy';

interface Props {
  changes: RowClassificationChange[];
}

type FilterMode = 'all' | 'changed_classification' | 'newly_excluded' | 'suspicious';

export default function PlumbingRowDiffTable({ changes }: Props) {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortByAmount, setSortByAmount] = useState(false);
  const [expandedSignals, setExpandedSignals] = useState<Set<number>>(new Set());

  const filtered = changes
    .filter((r) => {
      if (search) {
        const s = search.toLowerCase();
        if (!r.rawText.toLowerCase().includes(s)) return false;
      }
      if (filterMode === 'changed_classification') return r.liveClassification !== r.shadowClassification;
      if (filterMode === 'newly_excluded') return r.liveIncluded && !r.shadowIncluded;
      if (filterMode === 'suspicious') return r.confidenceScore > 0.2 && r.confidenceScore < 0.7;
      return true;
    })
    .sort((a, b) => {
      if (sortByAmount) return (b.amount ?? 0) - (a.amount ?? 0);
      return a.rowIndex - b.rowIndex;
    });

  function toggleSignals(rowIndex: number) {
    setExpandedSignals((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }

  const classColor = (cls: string) => {
    if (cls === 'summary_total' || cls === 'subtotal') return 'text-red-400';
    if (cls === 'line_item') return 'text-green-400';
    if (cls === 'unclassified') return 'text-amber-400';
    return 'text-gray-400';
  };

  if (changes.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-8 text-center text-sm text-gray-500">
        No row classification differences between live and shadow
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by description..."
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <select
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value as FilterMode)}
          className="px-3 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
        >
          <option value="all">All rows ({changes.length})</option>
          <option value="changed_classification">Changed classification</option>
          <option value="newly_excluded">Newly excluded by shadow</option>
          <option value="suspicious">Suspicious (mid-confidence)</option>
        </select>
        <button
          onClick={() => setSortByAmount((v) => !v)}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            sortByAmount
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
          }`}
        >
          Sort by amount
        </button>
        <span className="text-xs text-gray-600">{filtered.length} rows</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                {['#', 'Description', 'Amount', 'Live Class.', 'Shadow Class.', 'Live ✓', 'Shadow ✓', 'Confidence', 'Signals'].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtered.map((row) => {
                const sigExpanded = expandedSignals.has(row.rowIndex);
                const changed = row.liveClassification !== row.shadowClassification || row.liveIncluded !== row.shadowIncluded;
                return (
                  <tr key={row.rowIndex} className={`${changed ? 'bg-amber-950/10' : ''} hover:bg-gray-800/20 transition-colors`}>
                    <td className="px-3 py-2.5 font-mono text-gray-600">{row.rowIndex}</td>
                    <td className="px-3 py-2.5 max-w-xs">
                      <div className="text-gray-200 truncate" title={row.rawText}>{row.rawText || '—'}</div>
                      {row.exclusionReason && (
                        <div className="text-[10px] text-gray-600 mt-0.5 truncate">{row.exclusionReason}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-300 whitespace-nowrap">
                      {row.amount != null ? `$${row.amount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`font-mono ${classColor(row.liveClassification)}`}>{row.liveClassification}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`font-mono ${classColor(row.shadowClassification)}`}>{row.shadowClassification}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={row.liveIncluded ? 'text-green-400' : 'text-red-400'}>{row.liveIncluded ? '✓' : '✗'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={row.shadowIncluded ? 'text-green-400' : 'text-red-400'}>{row.shadowIncluded ? '✓' : '✗'}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={
                        row.confidenceScore >= 0.7 ? 'text-green-400' :
                        row.confidenceScore >= 0.4 ? 'text-amber-400' : 'text-gray-500'
                      }>
                        {Math.round(row.confidenceScore * 100)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {row.detectionSignals.length > 0 ? (
                        <button
                          onClick={() => toggleSignals(row.rowIndex)}
                          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          {sigExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {row.detectionSignals.length} signal{row.detectionSignals.length !== 1 ? 's' : ''}
                        </button>
                      ) : (
                        <span className="text-gray-700">—</span>
                      )}
                      {sigExpanded && (
                        <div className="mt-1">
                          <PlumbingDetectionSignalsBadges signals={row.detectionSignals} confidenceScore={row.confidenceScore} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
