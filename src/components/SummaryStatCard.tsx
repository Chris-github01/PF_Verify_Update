import { LucideIcon } from 'lucide-react';

interface SummaryStatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone: 'navy' | 'success' | 'orange';
  statusDot?: boolean;
}

export default function SummaryStatCard({
  label,
  value,
  icon: Icon,
  tone,
  statusDot = false,
}: SummaryStatCardProps) {
  const toneClasses = {
    navy: {
      border: 'border-blue-500/50',
      bg: 'bg-blue-900/20',
      icon: 'text-blue-400',
    },
    success: {
      border: 'border-green-500/50',
      bg: 'bg-green-900/20',
      icon: 'text-green-400',
    },
    orange: {
      border: 'border-orange-500/50',
      bg: 'bg-orange-900/20',
      icon: 'text-orange-400',
    },
  };

  const classes = toneClasses[tone];

  return (
    <div className={`rounded-lg border ${classes.border} ${classes.bg} p-6 transition-all`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-400 mb-2">{label}</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-white">{value}</p>
            {statusDot && (
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
            )}
          </div>
        </div>
        <div className={`p-3 rounded-lg bg-slate-800/50 ${classes.icon}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
