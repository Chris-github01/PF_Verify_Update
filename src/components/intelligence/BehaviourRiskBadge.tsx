import type { BehaviourRiskRating } from '../../lib/intelligence/types';

interface Props {
  rating: BehaviourRiskRating;
  size?: 'sm' | 'md';
}

const RATING_CONFIG: Record<BehaviourRiskRating, { label: string; bg: string; text: string }> = {
  green: { label: 'LOW RISK', bg: 'bg-emerald-500/15 border border-emerald-500/30', text: 'text-emerald-400' },
  amber: { label: 'MOD RISK', bg: 'bg-amber-500/15 border border-amber-500/30', text: 'text-amber-400' },
  red: { label: 'HIGH RISK', bg: 'bg-red-500/15 border border-red-500/30', text: 'text-red-400' },
  unknown: { label: 'UNKNOWN', bg: 'bg-slate-600/20 border border-slate-600/30', text: 'text-slate-400' },
};

export default function BehaviourRiskBadge({ rating, size = 'md' }: Props) {
  const cfg = RATING_CONFIG[rating];
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center rounded-full font-semibold tracking-wider ${cfg.bg} ${cfg.text} ${sizeClass}`}>
      {cfg.label}
    </span>
  );
}
