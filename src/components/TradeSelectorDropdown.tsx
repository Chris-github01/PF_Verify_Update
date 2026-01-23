import { useState } from 'react';
import { ChevronDown, Flame, Zap, Wind, Droplet, ShieldCheck } from 'lucide-react';
import { useTrade, getTradeInfo } from '../lib/tradeContext';
import type { Trade } from '../lib/userPreferences';

const trades: Array<{ id: Trade; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'passive_fire', icon: Flame },
  { id: 'electrical', icon: Zap },
  { id: 'hvac', icon: Wind },
  { id: 'plumbing', icon: Droplet },
  { id: 'active_fire', icon: ShieldCheck },
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

  const getColorClasses = (color: string, isActive: boolean = false) => {
    const colors: Record<string, { bg: string; text: string; border: string; hover: string }> = {
      orange: {
        bg: isActive ? 'bg-orange-50' : 'hover:bg-orange-50',
        text: 'text-orange-600',
        border: 'border-orange-300',
        hover: 'hover:border-orange-400',
      },
      yellow: {
        bg: isActive ? 'bg-yellow-50' : 'hover:bg-yellow-50',
        text: 'text-yellow-600',
        border: 'border-yellow-300',
        hover: 'hover:border-yellow-400',
      },
      cyan: {
        bg: isActive ? 'bg-cyan-50' : 'hover:bg-cyan-50',
        text: 'text-cyan-600',
        border: 'border-cyan-300',
        hover: 'hover:border-cyan-400',
      },
      blue: {
        bg: isActive ? 'bg-blue-50' : 'hover:bg-blue-50',
        text: 'text-blue-600',
        border: 'border-blue-300',
        hover: 'hover:border-blue-400',
      },
      red: {
        bg: isActive ? 'bg-red-50' : 'hover:bg-red-50',
        text: 'text-red-600',
        border: 'border-red-300',
        hover: 'hover:border-red-400',
      },
    };
    return colors[color];
  };

  const currentColors = getColorClasses(currentTradeInfo.color, true);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all duration-200
          ${currentColors.bg} ${currentColors.border} ${currentColors.hover}
        `}
      >
        <CurrentIcon size={18} className={currentColors.text} />
        <span className="font-semibold text-gray-800">
          Verify+ {currentTradeInfo.name}
        </span>
        <ChevronDown size={16} className={`text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 z-20 overflow-hidden">
            <div className="p-2">
              <div className="text-xs uppercase tracking-wider text-gray-500 px-3 py-2 font-semibold">
                Select Trade Module
              </div>
              {trades.map((trade) => {
                const Icon = trade.icon;
                const tradeInfo = getTradeInfo(trade.id);
                const isActive = currentTrade === trade.id;
                const colors = getColorClasses(tradeInfo.color, isActive);

                return (
                  <button
                    key={trade.id}
                    onClick={() => handleTradeSelect(trade.id)}
                    className={`
                      w-full text-left px-3 py-3 rounded-lg transition-all duration-200
                      border-2 mb-1 ${colors.bg} ${isActive ? colors.border : 'border-transparent hover:border-gray-200'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-10 h-10 rounded-lg flex items-center justify-center
                        ${isActive ? colors.bg : 'bg-gray-100'}
                      `}>
                        <Icon size={20} className={colors.text} />
                      </div>
                      <div className="flex-1">
                        <div className={`font-semibold ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                          {tradeInfo.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {tradeInfo.description}
                        </div>
                      </div>
                      {isActive && (
                        <div className={`w-2 h-2 rounded-full ${colors.text.replace('text-', 'bg-')}`}></div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-gray-200 px-3 py-2 bg-gray-50">
              <p className="text-xs text-gray-500">
                Each module has isolated data and trade-specific rules
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
