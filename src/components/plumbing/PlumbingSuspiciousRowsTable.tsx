import type { ClassifiedRow } from '../../types/plumbingDiscrepancy';
import PlumbingDetectionSignalsBadges from './PlumbingDetectionSignalsBadges';

interface Props {
  rows: ClassifiedRow[];
}

function getSuspicionReason(row: ClassifiedRow): string {
  if (row.classification === 'unclassified') return 'Could not be confidently classified as line item or summary row';
  if (row.includedInParsedTotal && row.detectionSignals.some((s) => s.startsWith('phrase_match:'))) {
    return 'Included in total despite matching summary phrase — possible false negative';
  }
  if (row.includedInParsedTotal && row.detectionSignals.includes('value:much_larger_than_typical_line_item')) {
    return 'Unusually large amount — possible total row included as line item';
  }
  if (!row.includedInParsedTotal && row.confidenceScore < 0.5) {
    return 'Excluded with low confidence — possible false positive exclusion';
  }
  if (row.detectionSignals.includes('position:last_3_rows') && row.includedInParsedTotal) {
    return 'Located in final rows — verify this is a genuine line item';
  }
  return 'Ambiguous signals require manual review';
}

export default function PlumbingSuspiciousRowsTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-8 text-center text-xs text-gray-500">
        No suspicious rows detected — all rows classified with reasonable confidence
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Suspicious Rows</h3>
        <span className="text-xs font-mono text-amber-400">{rows.length} need review</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/60">
              {['#', 'Raw Text', 'Amount', 'Classification', 'Included', 'Suspicion Reason', 'Confidence', 'Signals'].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {rows.map((row) => (
              <tr key={row.rowIndex} className="bg-amber-950/5 hover:bg-amber-950/10 transition-colors">
                <td className="px-3 py-2.5 font-mono text-gray-600">{row.rowIndex}</td>
                <td className="px-3 py-2.5 max-w-xs">
                  <div className="text-gray-200 truncate" title={row.rawText}>{row.rawText || '—'}</div>
                </td>
                <td className="px-3 py-2.5 font-mono text-gray-300 whitespace-nowrap">
                  {row.amount != null ? `$${row.amount.toLocaleString('en-NZ', { minimumFractionDigits: 2 })}` : '—'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className={`font-mono ${
                    row.classification === 'summary_total' ? 'text-red-400' :
                    row.classification === 'line_item' ? 'text-green-400' :
                    'text-amber-400'
                  }`}>{row.classification}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={row.includedInParsedTotal ? 'text-green-400' : 'text-red-400'}>
                    {row.includedInParsedTotal ? '✓' : '✗'}
                  </span>
                </td>
                <td className="px-3 py-2.5 max-w-xs">
                  <span className="text-amber-300/80">{getSuspicionReason(row)}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="text-amber-400">{Math.round(row.confidenceScore * 100)}%</span>
                </td>
                <td className="px-3 py-2.5 min-w-48">
                  <PlumbingDetectionSignalsBadges signals={row.detectionSignals} confidenceScore={row.confidenceScore} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
