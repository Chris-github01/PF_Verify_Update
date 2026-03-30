import { useState } from 'react';
import { ChevronDown, Flame, Zap, Wind, Droplet, ShieldCheck, Hammer } from 'lucide-react';
import { useTrade, getTradeInfo } from '../lib/tradeContext';
import type { Trade } from '../lib/userPreferences';

const trades: Array<{ id: Trade; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'passive_fire', icon: Flame },
  { id: 'electrical', icon: Zap },
  { id: 'hvac', icon: Wind },
  { id: 'plumbing', icon: Droplet },
  { id: 'active_fire', icon: ShieldCheck },
  { id: 'carpentry', icon: Hammer },
];

export default function TradeSelectorDropdown() {
  const { currentTrade, setCurrentTrade } = useTrade();
  const [isOpen, setIsOpen] = useState(false);

  const currentTradeInfo = getTradeInfo(currentTrade);
  const CurrentIcon = trades.find(t => t.id === currentTrade)?.icon || Flame;

  const handleTradeSelect = async (trade: Trade) => {
    if (trade !== currentTrade) {
      await setCurrentTrade(trade);
    }
    setIsOpen(false);
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, { text: string; iconBg: string }> = {
      orange: {
        text: 'text-orange-400',
        iconBg: 'bg-orange-950/50',
      },
      yellow: {
        text: 'text-yellow-400',
        iconBg: 'bg-yellow-950/50',
      },
      cyan: {
        text: 'text-cyan-400',
        iconBg: 'bg-cyan-950/50',
      },
      blue: {
        text: 'text-blue-400',
        iconBg: 'bg-blue-950/50',
      },
      red: {
        text: 'text-red-400',
        iconBg: 'bg-red-950/50',
      },
      amber: {
        text: 'text-amber-400',
        iconBg: 'bg-amber-950/50',
      },
    };
    return colors[color];
  };

  const currentColors = getColorClasses(currentTradeInfo.color);

  return (
    <div className="relative z-30">
      <button
        onClick={() => {
          console.log('Trade selector clicked!', isOpen);
          setIsOpen(!isOpen);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1 text-xs text-slate-200 shadow-sm hover:border-sky-500 hover:text-sky-200 transition-colors"
      >
        <CurrentIcon size={14} className={currentColors.text} />
        <span>Verify+ {currentTradeInfo.name}</span>
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 w-72 rounded-lg border border-slate-700/80 bg-slate-900/95 backdrop-blur-sm shadow-xl overflow-hidden z-50">
            <div className="py-2 max-h-80 overflow-y-auto">
              <div className="px-3 py-2 text-xs font-medium text-slate-400 border-b border-slate-800">
                Select Trade Module
              </div>
              {trades.map((trade) => {
                const Icon = trade.icon;
                const tradeInfo = getTradeInfo(trade.id);
                const isActive = currentTrade === trade.id;
                const colors = getColorClasses(tradeInfo.color);

                return (
                  <button
                    key={trade.id}
                    onClick={() => handleTradeSelect(trade.id)}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-800/70 transition-colors ${
                      isActive
                        ? 'bg-sky-900/30 text-sky-200 border-l-2 border-sky-500'
                        : 'text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.iconBg}`}>
                        <Icon size={16} className={colors.text} />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{tradeInfo.name}</div>
                        <div className="text-slate-500 mt-0.5 text-[11px]">
                          {tradeInfo.description}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-slate-800 px-3 py-2 bg-slate-950/50">
              <p className="text-xs text-slate-500">
                Each module has isolated data and trade-specific rules
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
