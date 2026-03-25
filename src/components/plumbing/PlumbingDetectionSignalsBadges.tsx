interface Props {
  signals: string[];
  confidenceScore: number;
  compact?: boolean;
}

function signalLabel(signal: string): string {
  if (signal.startsWith('phrase_match:')) return signal.replace('phrase_match:', '');
  const labels: Record<string, string> = {
    'value:matches_document_total': 'matches doc total',
    'value:equals_sum_of_prior_rows': 'sums prior rows',
    'value:amount_only_row': 'amount only',
    'value:missing_quantity': 'no qty',
    'value:missing_unit': 'no unit',
    'value:much_larger_than_typical_line_item': 'unusually large',
    'position:last_3_rows': 'last 3 rows',
    'position:near_end_of_document': 'near end',
    'structure:amount_only_no_qty_rate': 'no qty/rate',
    'structure:short_summary_description': 'short description',
    'structure:lump_sum_pattern': 'lump sum pattern',
    'structure:minimal_description': 'minimal text',
  };
  return labels[signal] ?? signal;
}

function signalColor(signal: string): string {
  if (signal.startsWith('phrase_match:')) return 'bg-red-950/50 text-red-300 border-red-800/50';
  if (signal.startsWith('value:matches_document') || signal.startsWith('value:equals_sum')) return 'bg-orange-950/50 text-orange-300 border-orange-800/50';
  if (signal.startsWith('position:')) return 'bg-amber-950/50 text-amber-300 border-amber-800/50';
  if (signal.startsWith('value:')) return 'bg-yellow-950/50 text-yellow-300 border-yellow-800/50';
  if (signal.startsWith('structure:')) return 'bg-blue-950/50 text-blue-300 border-blue-800/50';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

function confidenceColor(score: number): string {
  if (score >= 0.7) return 'text-green-400';
  if (score >= 0.4) return 'text-amber-400';
  return 'text-gray-500';
}

export default function PlumbingDetectionSignalsBadges({ signals, confidenceScore, compact = false }: Props) {
  if (signals.length === 0) return <span className="text-xs text-gray-700">—</span>;

  const display = compact ? signals.slice(0, 3) : signals;
  const overflow = compact && signals.length > 3 ? signals.length - 3 : 0;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {display.map((s) => (
        <span
          key={s}
          className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${signalColor(s)}`}
        >
          {signalLabel(s)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-gray-600">+{overflow} more</span>
      )}
      <span className={`text-[10px] font-mono ${confidenceColor(confidenceScore)} ml-0.5`}>
        {Math.round(confidenceScore * 100)}%
      </span>
    </div>
  );
}
