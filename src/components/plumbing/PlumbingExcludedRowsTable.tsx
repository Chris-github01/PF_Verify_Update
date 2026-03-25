import PlumbingDetectionSignalsBadges from './PlumbingDetectionSignalsBadges';
import type { ClassifiedRow } from '../../types/plumbingDiscrepancy';

interface Props {
  rows: ClassifiedRow[];
  title: string;
  emptyMessage?: string;
}

export default function PlumbingExcludedRowsTable({ rows, title, emptyMessage }: Props) {
  if (rows.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
        <p className="text-xs text-gray-500 text-center py-4">{emptyMessage ?? 'No excluded rows'}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-xs font-mono text-gray-500">{rows.length} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/60">
              {['#', 'Raw Text', 'Amount', 'Classification', 'Exclusion Reason', 'Matches Doc Total', 'Confidence', 'Signals'].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {rows.map((row) => (
              <tr key={row.rowIndex} className="hover:bg-gray-800/20 transition-colors">
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
                    row.classification === 'subtotal' ? 'text-orange-400' :
                    'text-gray-400'
                  }`}>{row.classification}</span>
                </td>
                <td className="px-3 py-2.5 max-w-xs">
                  <span className="text-gray-400">{row.exclusionReason ?? '—'}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={row.matchesDocumentTotal ? 'text-amber-400 font-bold' : 'text-gray-700'}>
                    {row.matchesDocumentTotal ? 'YES' : '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className={
                    row.confidenceScore >= 0.7 ? 'text-green-400' :
                    row.confidenceScore >= 0.4 ? 'text-amber-400' : 'text-red-400'
                  }>
                    {Math.round(row.confidenceScore * 100)}%
                  </span>
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
