import { useState } from 'react';
import { ArrowLeft, CheckCircle, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ALL_TRADES, TRADE_LABELS } from '../../lib/admin/adminApi';
import PageHeader from '../../components/PageHeader';

export default function CreateClient() {
  const [formData, setFormData] = useState({
    name: '',
    selectedTrades: ['passive_fire'] as string[],
    trialDays: 14,
    ownerEmail: ''
  });
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState<{
    organisationId: string;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculateRevenue = (trades: string[]) => {
    const total = trades.reduce((sum, trade) => {
      const tradeInfo = ALL_TRADES.find(t => t.value === trade);
      return sum + (tradeInfo?.price || 0);
    }, 0);

    if (trades.length === 2) return total * 0.85; // 15% off
    if (trades.length === 3) return total * 0.75; // 25% off
    if (trades.length >= 4) return total * 0.65; // 35% off
    return total;
  };

  const toggleTrade = (trade: string) => {
    if (formData.selectedTrades.includes(trade)) {
      if (formData.selectedTrades.length === 1) return; // Must have at least one
      setFormData({
        ...formData,
        selectedTrades: formData.selectedTrades.filter(t => t !== trade)
      });
    } else {
      setFormData({
        ...formData,
        selectedTrades: [...formData.selectedTrades, trade]
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user.email) throw new Error('Not authenticated');

      // Create organisation via RPC
      const { data: orgData, error: orgError } = await supabase.rpc('admin_create_client_organisation', {
        p_admin_email: session.user.email,
        p_org_name: formData.name,
        p_trade_type: formData.selectedTrades[0], // Primary trade
        p_trial_days: formData.trialDays,
        p_owner_email: formData.ownerEmail
      });

      if (orgError) throw orgError;

      const orgId = orgData.organisation_id;

      // Update licensed_trades array directly
      const { error: updateError } = await supabase
        .from('organisations')
        .update({ licensed_trades: formData.selectedTrades })
        .eq('id', orgId);

      if (updateError) throw updateError;

      setSuccess({
        organisationId: orgId,
        message: orgData.message
      });
    } catch (err) {
      console.error('Failed to create organisation:', err);
      setError(err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setCreating(false);
    }
  };

  const monthlyRevenue = calculateRevenue(formData.selectedTrades);
  const fullPrice = formData.selectedTrades.reduce((sum, trade) => {
    const tradeInfo = ALL_TRADES.find(t => t.value === trade);
    return sum + (tradeInfo?.price || 0);
  }, 0);
  const savings = fullPrice - monthlyRevenue;

  if (success) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Client Created Successfully"
          subtitle="The new client organisation is ready"
        />

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 max-w-2xl mx-auto">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {formData.name} Created!
            </h2>

            <p className="text-gray-600 mb-6">{success.message}</p>

            <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-600">Organisation ID:</span>
                <span className="font-mono text-sm text-gray-900">{success.organisationId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Owner Email:</span>
                <span className="font-medium text-gray-900">{formData.ownerEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Licensed Trades:</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {formData.selectedTrades.map(trade => (
                    <span key={trade} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                      {TRADE_LABELS[trade]?.replace(' Verify+', '')}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Monthly Revenue:</span>
                <span className="text-lg font-bold text-green-600">${monthlyRevenue.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Trial Length:</span>
                <span className="font-medium text-gray-900">{formData.trialDays} days</span>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">Next Steps:</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                <li>Owner must sign up at the app using: <strong>{formData.ownerEmail}</strong></li>
                <li>They'll be automatically added to this organisation</li>
                <li>During trial: All {formData.selectedTrades.length} trades are accessible</li>
                <li>After trial: Pay ${monthlyRevenue.toFixed(0)}/month to keep licenses active</li>
              </ol>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.location.href = '/admin/dashboard'}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => {
                  setSuccess(null);
                  setFormData({
                    name: '',
                    selectedTrades: ['passive_fire'],
                    trialDays: 14,
                    ownerEmail: ''
                  });
                }}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
              >
                Create Another Client
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => window.location.href = '/admin/dashboard'}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <PageHeader
          title="Create New Client"
          subtitle="Set up a new organisation with multi-trade licensing in under 15 seconds"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Acme Fire Protection Ltd"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Licensed Trades * <span className="text-gray-500 font-normal">(select all that apply)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {ALL_TRADES.map(trade => {
                const isSelected = formData.selectedTrades.includes(trade.value);
                return (
                  <button
                    key={trade.value}
                    type="button"
                    onClick={() => toggleTrade(trade.value)}
                    disabled={isSelected && formData.selectedTrades.length === 1}
                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-blue-300'
                    } ${isSelected && formData.selectedTrades.length === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-4 h-4 rounded-full ${
                        trade.color === 'orange' ? 'bg-orange-500' :
                        trade.color === 'yellow' ? 'bg-yellow-500' :
                        trade.color === 'blue' ? 'bg-blue-500' :
                        'bg-green-500'
                      }`}></div>
                      <div className="font-medium text-gray-900">{trade.label}</div>
                      {isSelected && (
                        <CheckCircle size={16} className="ml-auto text-blue-600" />
                      )}
                    </div>
                    <div className="text-sm text-gray-600">${trade.price}/month</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Client can access all selected trades during trial. After trial, they pay for what they keep.
            </p>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <DollarSign className="text-green-600" size={24} />
              <h3 className="font-bold text-green-900">Revenue Calculator</h3>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-green-800">Base Price ({formData.selectedTrades.length} trades):</span>
                <span className="font-medium text-green-900">${fullPrice}/month</span>
              </div>

              {formData.selectedTrades.length >= 2 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-green-800">
                      Bundle Discount (
                      {formData.selectedTrades.length === 2 && '15%'}
                      {formData.selectedTrades.length === 3 && '25%'}
                      {formData.selectedTrades.length >= 4 && '35%'}
                      ):
                    </span>
                    <span className="font-medium text-green-600">-${savings.toFixed(0)}</span>
                  </div>
                  <div className="h-px bg-green-300 my-2"></div>
                </>
              )}

              <div className="flex justify-between">
                <span className="font-bold text-green-900">Monthly Revenue:</span>
                <span className="text-2xl font-bold text-green-900">${monthlyRevenue.toFixed(0)}</span>
              </div>

              <div className="text-xs text-green-700 mt-2">
                {formData.selectedTrades.length === 1 && 'Select another trade for 15% bundle discount'}
                {formData.selectedTrades.length === 2 && 'Select one more trade for 25% bundle discount (10% more savings)'}
                {formData.selectedTrades.length === 3 && 'Select all trades for 35% bundle discount'}
                {formData.selectedTrades.length >= 4 && 'Maximum bundle discount applied!'}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Trial Length *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[7, 14, 30, 60].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setFormData({ ...formData, trialDays: days })}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    formData.trialDays === days
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Owner Email *
            </label>
            <input
              type="email"
              required
              value={formData.ownerEmail}
              onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
              placeholder="owner@company.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              They'll need to sign up with this email to access the organisation
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">What happens next:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
              <li>Organisation created with {formData.selectedTrades.length} licensed trade{formData.selectedTrades.length > 1 ? 's' : ''}</li>
              <li>Default project set up for primary trade</li>
              <li>Owner can sign up and access all {formData.selectedTrades.length} trades during trial</li>
              <li>After trial: ${monthlyRevenue.toFixed(0)}/month to keep licenses active</li>
            </ul>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => window.location.href = '/admin/dashboard'}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : `Create Client ($${monthlyRevenue.toFixed(0)}/mo)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
