import type { GateStatus } from '../../lib/intelligence/types';

interface Props {
  status: GateStatus;
  size?: 'sm' | 'md' | 'lg';
}

const STATUS_CONFIG: Record<GateStatus, { label: string; bg: string; text: string; dot: string }> = {
  pass: { label: 'PASS', bg: 'bg-emerald-500/15 border border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  warn: { label: 'WARN', bg: 'bg-amber-500/15 border border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-400' },
  fail: { label: 'FAIL', bg: 'bg-red-500/15 border border-red-500/30', text: 'text-red-400', dot: 'bg-red-400' },
  pending: { label: 'PENDING', bg: 'bg-slate-600/20 border border-slate-600/30', text: 'text-slate-400', dot: 'bg-slate-400' },
};

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-xs gap-1.5',
  md: 'px-2.5 py-1 text-xs gap-2',
  lg: 'px-3 py-1.5 text-sm gap-2',
};

export default function GateStatusBadge({ status, size = 'md' }: Props) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full font-semibold tracking-wider ${cfg.bg} ${cfg.text} ${SIZE_CLASSES[size]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}
