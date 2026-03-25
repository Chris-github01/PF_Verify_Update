import { useState } from 'react';
import { Search, Star } from 'lucide-react';
import type { CaseEvalResult, PassStatus } from '../../lib/modules/parsers/plumbing/regression/types';

interface Props {
  results: CaseEvalResult[];
  onSelectCase?: (result: CaseEvalResult) => void;
}

type Filter = 'all' | 'failed' | 'shadow_better' | 'must_pass';

const PASS_CONFIG: Record<PassStatus, { label: string; color: string; bg: string }> = {
  pass:           { label: 'PASS',     color: 'text-green-400',  bg: 'bg-green-950/40 border-green-800/50' },
  fail_minor:     { label: 'MINOR',    color: 'text-amber-400',  bg: 'bg-amber-950/40 border-amber-800/50' },
  fail_major:     { label: 'MAJOR',    color: 'text-orange-400', bg: 'bg-orange-950/40 border-orange-800/50' },
  fail_critical:  { label: 'CRITICAL', color: 'text-red-400',    bg: 'bg-red-950/40 border-red-800/50' },
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;
}
function fmtDelta(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const sign = n >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;
}

export default function PlumbingRegressionCaseTable({ results, onSelectCase }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = results.filter((r) => {
    if (search && !r.caseLabel.toLowerCase().includes(search.toLowerCase()) &&
        !r.sourceId.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'failed') return r.passStatus !== 'pass';
    if (filter === 'shadow_better') return r.shadowBetterThanLive;
    if (filter === 'must_pass') return r.isMustPass;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cases..."
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        {(['all', 'failed', 'shadow_better', 'must_pass'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              filter === f
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : f === 'failed' ? 'Failed only' : f === 'shadow_better' ? 'Shadow better' : 'Must-pass'}
          </button>
        ))}
        <span className="text-xs text-gray-600">{filtered.length} cases</span>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                {['Case', 'Status', 'Live Total', 'Shadow Total', 'Live Δ', 'Shadow Δ', 'Class.Δ', 'Shadow Better', 'Verdict'].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filtered.map((r) => {
                const pc = PASS_CONFIG[r.passStatus];
                return (
                  <tr
                    key={r.caseId}
                    className={`hover:bg-gray-800/30 transition-colors ${onSelectCase ? 'cursor-pointer' : ''} ${r.isMustPass ? 'bg-amber-950/5' : ''}`}
                    onClick={() => onSelectCase?.(r)}
                  >
                    <td className="px-3 py-2.5 max-w-xs">
                      <div className="flex items-center gap-1.5">
                        {r.isMustPass && <Star className="w-3 h-3 text-amber-500 shrink-0" />}
                        <div>
                          <div className="text-gray-200 font-medium truncate">{r.caseLabel}</div>
                          <div className="text-gray-600 font-mono text-[10px] truncate">{r.sourceId.slice(0, 20)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${pc.bg} ${pc.color}`}>
                        {pc.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-300 whitespace-nowrap">{fmt(r.liveOutput.parsedTotal)}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-300 whitespace-nowrap">{fmt(r.shadowOutput.parsedTotal)}</td>
                    <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                      <span className={r.metrics.liveTotalDelta === null ? 'text-gray-600' : Math.abs(r.metrics.liveTotalDelta ?? 0) < 1 ? 'text-green-400' : 'text-red-400'}>
                        {fmtDelta(r.metrics.liveTotalDelta)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                      <span className={r.metrics.shadowTotalDelta === null ? 'text-gray-600' : Math.abs(r.metrics.shadowTotalDelta ?? 0) < 1 ? 'text-green-400' : 'text-amber-400'}>
                        {fmtDelta(r.metrics.shadowTotalDelta)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={r.metrics.classificationMismatchCount > 0 ? 'text-amber-400' : 'text-gray-600'}>
                        {r.metrics.classificationMismatchCount > 0 ? r.metrics.classificationMismatchCount : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={r.shadowBetterThanLive ? 'text-green-400' : 'text-gray-600'}>
                        {r.shadowBetterThanLive ? '✓' : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.failureReasons.length === 0 ? (
                        <span className="text-green-400 text-[10px]">All assertions passed</span>
                      ) : (
                        <span className="text-gray-400 text-[10px] truncate max-w-[160px] block">
                          {r.failureReasons[0].replace(/^\[[A-Z]+\] /, '').slice(0, 60)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-500 text-xs">No cases match current filter</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
