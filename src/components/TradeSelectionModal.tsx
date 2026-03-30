import { Flame, Zap, Wind, Droplet, ShieldCheck, Hammer } from 'lucide-react';

export type Trade = 'passive_fire' | 'electrical' | 'hvac' | 'plumbing' | 'active_fire' | 'carpentry';

interface TradeOption {
  id: Trade;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
}

const trades: TradeOption[] = [
  {
    id: 'passive_fire',
    name: 'Passive Fire',
    icon: Flame,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
  },
  {
    id: 'electrical',
    name: 'Electrical',
    icon: Zap,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
  },
  {
    id: 'hvac',
    name: 'HVAC',
    icon: Wind,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
  },
  {
    id: 'plumbing',
    name: 'Plumbing',
    icon: Droplet,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  {
    id: 'active_fire',
    name: 'Active Fire',
    icon: ShieldCheck,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  {
    id: 'carpentry',
    name: 'Carpentry',
    icon: Hammer,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
];

interface TradeSelectionModalProps {
  isOpen: boolean;
  onSelect: (trade: Trade) => void;
  currentTrade?: Trade;
}

export default function TradeSelectionModal({ isOpen, onSelect, currentTrade }: TradeSelectionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-700 overflow-hidden">
        <div className="bg-gradient-to-r from-orange-600 to-orange-500 p-8">
          <h2 className="text-3xl font-bold text-white text-center">Select Your Trade</h2>
          <p className="text-orange-100 mt-2 text-center">
            Choose which VerifyTrade module you want to access
          </p>
        </div>

        <div className="p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trades.map((trade) => {
              const Icon = trade.icon;
              const isSelected = currentTrade === trade.id;

              return (
                <button
                  key={trade.id}
                  onClick={() => onSelect(trade.id)}
                  className={`
                    relative p-6 rounded-xl border-2 transition-all duration-200
                    ${isSelected
                      ? `${trade.bgColor} ${trade.borderColor} ring-2 ring-offset-2 ring-offset-slate-900 ${trade.borderColor.replace('border-', 'ring-')}`
                      : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                    }
                  `}
                >
                  <div className="flex flex-col items-center text-center gap-3">
                    <div className={`
                      w-16 h-16 rounded-xl flex items-center justify-center
                      ${isSelected ? trade.bgColor : 'bg-slate-700'}
                    `}>
                      <Icon
                        size={32}
                        className={isSelected ? trade.color : 'text-slate-400'}
                      />
                    </div>
                    <h3 className={`
                      text-lg font-semibold
                      ${isSelected ? 'text-white' : 'text-slate-200'}
                    `}>
                      {trade.name}
                    </h3>
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <div className={`w-3 h-3 rounded-full ${trade.color.replace('text-', 'bg-')}`}></div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-8 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400 text-center">
              You can switch between trades anytime from your dashboard settings
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export { trades };
