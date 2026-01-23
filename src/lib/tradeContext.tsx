import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSelectedTrade, updateSelectedTrade, type Trade } from './userPreferences';

interface TradeContextValue {
  currentTrade: Trade;
  setCurrentTrade: (trade: Trade) => Promise<void>;
  isLoading: boolean;
}

const TradeContext = createContext<TradeContextValue | undefined>(undefined);

export function TradeProvider({ children }: { children: ReactNode }) {
  const [currentTrade, setCurrentTradeState] = useState<Trade>('passive_fire');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTrade();
  }, []);

  const loadTrade = async () => {
    try {
      const trade = await getSelectedTrade();
      setCurrentTradeState(trade);
    } catch (error) {
      console.error('Error loading trade:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setCurrentTrade = async (trade: Trade) => {
    try {
      await updateSelectedTrade(trade);
      setCurrentTradeState(trade);

      // Trigger a page reload to ensure all components refresh with new trade
      window.location.reload();
    } catch (error) {
      console.error('Error updating trade:', error);
    }
  };

  return (
    <TradeContext.Provider value={{ currentTrade, setCurrentTrade, isLoading }}>
      {children}
    </TradeContext.Provider>
  );
}

export function useTrade() {
  const context = useContext(TradeContext);
  if (context === undefined) {
    throw new Error('useTrade must be used within a TradeProvider');
  }
  return context;
}

// Helper to get trade display information
export const getTradeInfo = (trade: Trade) => {
  const tradeInfo = {
    passive_fire: {
      name: 'Passive Fire',
      color: 'orange',
      description: 'Fire stopping and passive fire protection',
    },
    electrical: {
      name: 'Electrical',
      color: 'yellow',
      description: 'Electrical systems and installations',
    },
    hvac: {
      name: 'HVAC',
      color: 'cyan',
      description: 'Heating, ventilation, and air conditioning',
    },
    plumbing: {
      name: 'Plumbing',
      color: 'blue',
      description: 'Plumbing and drainage systems',
    },
    active_fire: {
      name: 'Active Fire',
      color: 'red',
      description: 'Sprinkler systems and active fire protection',
    },
  };

  return tradeInfo[trade];
};
