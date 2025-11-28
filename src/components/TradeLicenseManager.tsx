import { useState } from 'react';
import { X, Plus, Trash2, DollarSign, Check } from 'lucide-react';
import { addTradeLicense, removeTradeLicense, ALL_TRADES } from '../lib/admin/adminApi';

interface TradeLicenseManagerProps {
  organisationId: string;
  organisationName: string;
  currentLicenses: string[];
  subscriptionStatus: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function TradeLicenseManager({
  organisationId,
  organisationName,
  currentLicenses,
  subscriptionStatus,
  onClose,
  onUpdate
}: TradeLicenseManagerProps) {
  const [licenses, setLicenses] = useState<string[]>(currentLicenses);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleAddLicense = async (trade: string) => {
    setProcessing(true);
    setMessage(null);

    try {
      const result = await addTradeLicense(organisationId, trade);
      setLicenses(result.licensedTrades);
      setMessage({ type: 'success', text: result.message });
      setTimeout(() => onUpdate(), 1000);
    } catch (error) {
      console.error('Failed to add license:', error);
      setMessage({ type: 'error', text: 'Failed to add trade license' });
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveLicense = async (trade: string) => {
    if (licenses.length === 1) {
      setMessage({ type: 'error', text: 'Cannot remove last trade license' });
      return;
    }

    setProcessing(true);
    setMessage(null);

    try {
      const result = await removeTradeLicense(organisationId, trade);
      setLicenses(result.licensedTrades);
      setMessage({ type: 'success', text: result.message });
      setTimeout(() => onUpdate(), 1000);
    } catch (error) {
      console.error('Failed to remove license:', error);
      setMessage({ type: 'error', text: 'Failed to remove trade license' });
    } finally {
      setProcessing(false);
    }
  };

  const calculateMonthlyRevenue = () => {
    const total = licenses.reduce((sum, trade) => {
      const tradeInfo = ALL_TRADES.find(t => t.value === trade);
      return sum + (tradeInfo?.price || 0);
    }, 0);

    // Apply bundle discounts
    if (licenses.length === 2) {
      return total * 0.85; // 15% off
    } else if (licenses.length === 3) {
      return total * 0.75; // 25% off
    } else if (licenses.length >= 4) {
      return total * 0.65; // 35% off
    }

    return total;
  };

  const monthlyRevenue = calculateMonthlyRevenue();
  const fullPrice = licenses.reduce((sum, trade) => {
    const tradeInfo = ALL_TRADES.find(t => t.value === trade);
    return sum + (tradeInfo?.price || 0);
  }, 0);
  const savings = fullPrice - monthlyRevenue;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Manage Trade Licenses</h2>
            <p className="text-gray-600 mt-1">{organisationName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {message && (
          <div className={`mx-6 mt-4 p-4 rounded-md ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        <div className="p-6 space-y-6">
          {subscriptionStatus === 'trial' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="font-semibold text-blue-900 mb-1">Trial Mode</div>
              <div className="text-sm text-blue-800">
                This client is on trial and can access all trades. Licenses will be enforced when they convert to paid.
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Current Licensed Trades</h3>
            <div className="space-y-2">
              {licenses.length === 0 ? (
                <div className="text-gray-500 text-sm">No trade licenses active</div>
              ) : (
                licenses.map(trade => {
                  const tradeInfo = ALL_TRADES.find(t => t.value === trade);
                  if (!tradeInfo) return null;

                  return (
                    <div key={trade} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full bg-${tradeInfo.color}-500`}></div>
                        <div>
                          <div className="font-medium text-gray-900">{tradeInfo.label}</div>
                          <div className="text-sm text-gray-600">${tradeInfo.price}/month</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveLicense(trade)}
                        disabled={processing || licenses.length === 1}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={licenses.length === 1 ? 'Cannot remove last license' : 'Remove license'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Available Trades to Add</h3>
            <div className="grid grid-cols-2 gap-3">
              {ALL_TRADES.filter(t => !licenses.includes(t.value)).map(trade => (
                <button
                  key={trade.value}
                  onClick={() => handleAddLicense(trade.value)}
                  disabled={processing}
                  className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className={`w-4 h-4 rounded-full bg-${trade.color}-500`}></div>
                  <div className="text-left flex-1">
                    <div className="font-medium text-gray-900">{trade.label}</div>
                    <div className="text-sm text-gray-600">${trade.price}/month</div>
                  </div>
                  <Plus size={20} className="text-gray-400" />
                </button>
              ))}
            </div>

            {ALL_TRADES.filter(t => !licenses.includes(t.value)).length === 0 && (
              <div className="text-center p-8 bg-green-50 rounded-lg">
                <Check size={48} className="mx-auto mb-2 text-green-600" />
                <div className="font-semibold text-green-900">All Trades Licensed!</div>
                <div className="text-sm text-green-700 mt-1">
                  This client has access to every trade
                </div>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <DollarSign className="text-blue-600" size={24} />
              <h3 className="font-bold text-blue-900">Revenue Calculation</h3>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-blue-800">Base Price ({licenses.length} trades):</span>
                <span className="font-medium text-blue-900">${fullPrice}/month</span>
              </div>

              {licenses.length >= 2 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-800">
                      Bundle Discount (
                      {licenses.length === 2 && '15%'}
                      {licenses.length === 3 && '25%'}
                      {licenses.length >= 4 && '35%'}
                      ):
                    </span>
                    <span className="font-medium text-green-600">-${savings.toFixed(0)}</span>
                  </div>
                  <div className="h-px bg-blue-300 my-2"></div>
                </>
              )}

              <div className="flex justify-between">
                <span className="font-bold text-blue-900">Monthly Revenue:</span>
                <span className="text-2xl font-bold text-blue-900">${monthlyRevenue.toFixed(0)}</span>
              </div>

              <div className="text-xs text-blue-700 mt-2">
                {licenses.length === 1 && 'Add another trade for 15% bundle discount'}
                {licenses.length === 2 && 'Add one more trade for 25% bundle discount (10% more savings)'}
                {licenses.length === 3 && 'Add all trades for 35% bundle discount'}
                {licenses.length >= 4 && 'Maximum bundle discount applied!'}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
