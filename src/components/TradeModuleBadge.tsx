import { Shield, Zap, Droplets, Wind, Wrench, BarChart3, Hammer } from 'lucide-react';

interface TradeModuleBadgeProps {
  trade: string;
  compact?: boolean;
}

interface TradeModule {
  icon: React.ReactNode;
  specificModule: string;
  generalModule: string;
  specificColor: string;
  generalColor: string;
  specificBorder: string;
  generalBorder: string;
  specificBg: string;
  generalBg: string;
}

const TRADE_MODULES: Record<string, TradeModule> = {
  passive_fire: {
    icon: <Shield size={12} />,
    specificModule: 'Verify+ Passive Fire',
    generalModule: 'VerifyTrade Quote Audit Engine',
    specificColor: 'text-orange-200',
    generalColor: 'text-sky-200',
    specificBorder: 'border-orange-500/50',
    generalBorder: 'border-sky-500/50',
    specificBg: 'bg-orange-950/40',
    generalBg: 'bg-sky-950/40',
  },
  electrical: {
    icon: <Zap size={12} />,
    specificModule: 'Verify+ Electrical',
    generalModule: 'VerifyTrade Quote Audit Engine',
    specificColor: 'text-yellow-200',
    generalColor: 'text-sky-200',
    specificBorder: 'border-yellow-500/50',
    generalBorder: 'border-sky-500/50',
    specificBg: 'bg-yellow-950/40',
    generalBg: 'bg-sky-950/40',
  },
  plumbing: {
    icon: <Droplets size={12} />,
    specificModule: 'Verify+ Plumbing',
    generalModule: 'VerifyTrade Quote Audit Engine',
    specificColor: 'text-blue-200',
    generalColor: 'text-sky-200',
    specificBorder: 'border-blue-500/50',
    generalBorder: 'border-sky-500/50',
    specificBg: 'bg-blue-950/40',
    generalBg: 'bg-sky-950/40',
  },
  hvac: {
    icon: <Wind size={12} />,
    specificModule: 'Verify+ HVAC',
    generalModule: 'VerifyTrade Quote Audit Engine',
    specificColor: 'text-cyan-200',
    generalColor: 'text-sky-200',
    specificBorder: 'border-cyan-500/50',
    generalBorder: 'border-sky-500/50',
    specificBg: 'bg-cyan-950/40',
    generalBg: 'bg-sky-950/40',
  },
  carpentry: {
    icon: <Hammer size={12} />,
    specificModule: 'Verify+ Carpentry',
    generalModule: 'VerifyTrade Quote Audit Engine',
    specificColor: 'text-amber-200',
    generalColor: 'text-sky-200',
    specificBorder: 'border-amber-500/50',
    generalBorder: 'border-sky-500/50',
    specificBg: 'bg-amber-950/40',
    generalBg: 'bg-sky-950/40',
  },
  mechanical: {
    icon: <Wrench size={12} />,
    specificModule: 'Verify+ Mechanical',
    generalModule: 'VerifyTrade Quote Audit Engine',
    specificColor: 'text-gray-200',
    generalColor: 'text-sky-200',
    specificBorder: 'border-gray-500/50',
    generalBorder: 'border-sky-500/50',
    specificBg: 'bg-gray-950/40',
    generalBg: 'bg-sky-950/40',
  },
  general: {
    icon: <BarChart3 size={12} />,
    specificModule: 'Verify+ General',
    generalModule: 'VerifyTrade Quote Audit Engine',
    specificColor: 'text-slate-200',
    generalColor: 'text-sky-200',
    specificBorder: 'border-slate-500/50',
    generalBorder: 'border-sky-500/50',
    specificBg: 'bg-slate-950/40',
    generalBg: 'bg-sky-950/40',
  },
};

export default function TradeModuleBadge({ trade, compact = false }: TradeModuleBadgeProps) {
  const module = TRADE_MODULES[trade] || TRADE_MODULES.general;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors ${module.specificBorder} ${module.specificBg} ${module.specificColor}`}
        >
          {module.icon}
          <span>{module.specificModule}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${module.specificBorder} ${module.specificBg} ${module.specificColor}`}
      >
        {module.icon}
        <span>{module.specificModule}</span>
      </div>
      <span className="text-slate-500 text-xs">+</span>
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${module.generalBorder} ${module.generalBg} ${module.generalColor}`}
      >
        <BarChart3 size={12} />
        <span>{module.generalModule}</span>
      </div>
    </div>
  );
}
