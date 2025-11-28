import { useState } from 'react';
import { TrendingUp, X, DollarSign } from 'lucide-react';
import { ALL_TRADES, TRADE_LABELS } from '../lib/admin/adminApi';

interface TradeUpsellBannerProps {
  currentTrades: string[];
  subscriptionStatus: string;
  onDismiss?: () => void;
}

export default function TradeUpsellBanner({
  currentTrades,
  subscriptionStatus,
  onDismiss
}: TradeUpsellBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || currentTrades.length >= 4 || subscriptionStatus === 'trial') {
    return null;
  }

  const missingTrades = ALL_TRADES.filter(t => !currentTrades.includes(t.value));

  if (missingTrades.length === 0) return null;

  const calculateCurrentRevenue = () => {
    const total = currentTrades.reduce((sum, trade) => {
      const tradeInfo = ALL_TRADES.find(t => t.value === trade);
      return sum + (tradeInfo?.price || 0);
    }, 0);

    if (currentTrades.length === 2) return total * 0.85;
    if (currentTrades.length === 3) return total * 0.75;
    return total;
  };

  const calculateUpgradedRevenue = (additionalTrades: number) => {
    const totalTrades = currentTrades.length + additionalTrades;
    const total = currentTrades.reduce((sum, trade) => {
      const tradeInfo = ALL_TRADES.find(t => t.value === trade);
      return sum + (tradeInfo?.price || 0);
    }, 0) + missingTrades.slice(0, additionalTrades).reduce((sum, trade) => {
      return sum + trade.price;
    }, 0);

    if (totalTrades === 2) return total * 0.85;
    if (totalTrades === 3) return total * 0.75;
    if (totalTrades >= 4) return total * 0.65;
    return total;
  };

  const currentRevenue = calculateCurrentRevenue();
  const allTradesRevenue = calculateUpgradedRevenue(missingTrades.length);
  const additionalCost = allTradesRevenue - currentRevenue;

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  const handleUpgrade = () => {
    // Open contact or upgrade modal
    alert('Contact your account manager to add trades to your license.\n\nOr email: support@verifyhub.com');
  };

  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="hidden md:flex items-center justify-center w-12 h-12 bg-white/20 rounded-full">
            <TrendingUp size={24} />
          </div>

          <div className="flex-1">
            <div className="font-bold text-lg mb-1">
              Unlock {missingTrades.length} More Trade{missingTrades.length > 1 ? 's' : ''}
            </div>
            <div className="text-blue-100 text-sm">
              Add {missingTrades.slice(0, 3).map(t => TRADE_LABELS[t.value]?.replace(' Verify+', '')).join(', ')}
              {missingTrades.length > 3 && ` + ${missingTrades.length - 3} more`}
              {' '}for only <span className="font-bold text-white">${Math.round(additionalCost)}/mo more</span>
              {' '}→ Total ${Math.round(allTradesRevenue)}/mo
              {currentTrades.length + missingTrades.length >= 4 && (
                <span className="ml-1">(35% bundle discount)</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleUpgrade}
            className="px-6 py-2 bg-white text-blue-700 rounded-md hover:bg-blue-50 font-semibold transition-colors whitespace-nowrap"
          >
            Upgrade Now
          </button>
          <button
            onClick={handleDismiss}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Dismiss"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
