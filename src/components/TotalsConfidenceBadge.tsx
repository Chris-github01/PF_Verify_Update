import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { TotalsResolution } from '../lib/quoteTotals';

interface Props {
  resolution: TotalsResolution;
  size?: 'sm' | 'md';
  className?: string;
}

export default function TotalsConfidenceBadge({ resolution, size = 'sm', className = '' }: Props) {
  const isVerified = resolution.verified;
  const iconSize = size === 'sm' ? 11 : 13;

  const palette = isVerified
    ? 'bg-green-500/15 text-green-300 border-green-500/40'
    : 'bg-amber-500/15 text-amber-300 border-amber-500/40';

  const text = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const pad = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border font-medium ${pad} ${text} ${palette} ${className}`}
      title={resolution.source === 'labelled' ? 'Extracted from explicit labelled quote total' : 'Computed from row sums — verify before awarding'}
    >
      {isVerified ? <CheckCircle2 size={iconSize} /> : <AlertTriangle size={iconSize} />}
      {resolution.label}
    </span>
  );
}
