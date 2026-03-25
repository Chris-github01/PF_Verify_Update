import type { RolloutStatus } from '../../types/shadow';

const STATUS_STYLES: Record<RolloutStatus, { bg: string; text: string; label: string }> = {
  live_only:       { bg: 'bg-gray-800',   text: 'text-gray-400',  label: 'Live Only' },
  shadow_only:     { bg: 'bg-blue-950',   text: 'text-blue-400',  label: 'Shadow Only' },
  internal_beta:   { bg: 'bg-cyan-950',   text: 'text-cyan-400',  label: 'Internal Beta' },
  org_beta:        { bg: 'bg-teal-950',   text: 'text-teal-400',  label: 'Org Beta' },
  partial_rollout: { bg: 'bg-amber-950',  text: 'text-amber-400', label: 'Partial Rollout' },
  global_live:     { bg: 'bg-green-950',  text: 'text-green-400', label: 'Global Live' },
  rolled_back:     { bg: 'bg-red-950',    text: 'text-red-400',   label: 'Rolled Back' },
};

interface Props {
  status: RolloutStatus;
  size?: 'sm' | 'md';
}

export default function ModuleVersionBadge({ status, size = 'sm' }: Props) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.live_only;
  return (
    <span className={`
      inline-flex items-center rounded-full font-medium border
      ${s.bg} ${s.text}
      ${size === 'sm' ? 'text-xs px-2 py-0.5 border-current/20' : 'text-sm px-3 py-1 border-current/20'}
    `}>
      {s.label}
    </span>
  );
}
