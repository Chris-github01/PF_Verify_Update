import { useState } from 'react';
import { ArrowLeft, CheckCircle, DollarSign, Building2, HardHat } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ALL_TRADES, TRADE_LABELS } from '../../lib/admin/adminApi';
import PageHeader from '../../components/PageHeader';

type ClientType = 'main_contractor' | 'sub_contractor';

export default function CreateClient() {
  const [formData, setFormData] = useState({
    name: '',
    clientType: 'main_contractor' as ClientType,
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const auditNamespace = `ORG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const trialEndDate = new Date(Date.now() + formData.trialDays * 24 * 60 * 60 * 1000).toISOString();
      const primaryTrade = formData.selectedTrades[0];

      const { data: org, error: orgError } = await supabase
        .from('organisations')
        .insert({
          name: formData.name,
          legal_name: formData.name,
          owner_email: formData.ownerEmail.toLowerCase().trim(),
          trade_type: primaryTrade,
          primary_trade_focus: primaryTrade,
          licensed_trades: formData.selectedTrades,
          client_type: formData.clientType,
          subscription_status: 'trial',
          pricing_tier: 'starter',
          trial_end_date: trialEndDate,
          seat_limit: 5,
          audit_namespace: auditNamespace,
          compliance_acceptance: true,
          created_by_admin_id: user.id,
          industry_type: formData.clientType === 'sub_contractor' ? 'Subcontractor' : 'Main Contractor',
          country_region: 'New Zealand',
          jurisdiction_code_set: 'NZBC',
          compliance_role: formData.clientType === 'sub_contractor' ? 'Reviewing party' : 'Awarding party',
          project_size_range: '<$5m',
        })
        .select()
        .single();

      if (orgError) throw orgError;

      setSuccess({
        organisationId: org.id,
        message: `Organisation "${formData.name}" created successfully. Owner can sign up with ${formData.ownerEmail}.`
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

        <div className="bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 p-8 max-w-2xl mx-auto">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <CheckCircle size={32} className="text-green-400" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">
              {formData.name} Created!
            </h2>

            <p className="text-gray-400 mb-6">{success.message}</p>

            <div className="bg-slate-800/50 rounded-lg p-4 text-left space-y-2 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-400">Organisation ID:</span>
                <span className="font-mono text-sm text-white">{success.organisationId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Owner Email:</span>
                <span className="font-medium text-white">{formData.ownerEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Client Type:</span>
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  formData.clientType === 'sub_contractor'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                }`}>
                  {formData.clientType === 'sub_contractor' ? 'Sub-contractor' : 'Main Contractor'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Licensed Trades:</span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {formData.selectedTrades.map(trade => (
                    <span key={trade} className="px-2 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-medium rounded">
                      {TRADE_LABELS[trade]?.replace(' Verify+', '')}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Monthly Revenue:</span>
                <span className="text-lg font-bold text-green-400">${monthlyRevenue.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Trial Length:</span>
                <span className="font-medium text-white">{formData.trialDays} days</span>
              </div>
            </div>

            <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4 text-left mb-6">
              <h3 className="font-semibold text-blue-300 mb-2">Next Steps:</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-300">
                <li>Owner must sign up at the app using: <strong>{formData.ownerEmail}</strong></li>
                <li>They'll be automatically added to this organisation</li>
                <li>During trial: All {formData.selectedTrades.length} trades are accessible</li>
                <li>After trial: Pay ${monthlyRevenue.toFixed(0)}/month to keep licenses active</li>
              </ol>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.location.href = '/admin/dashboard'}
                className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-md hover:bg-orange-600 font-medium"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => {
                  setSuccess(null);
                  setFormData({
                    name: '',
                    clientType: 'main_contractor',
                    selectedTrades: ['passive_fire'],
                    trialDays: 14,
                    ownerEmail: ''
                  });
                }}
                className="flex-1 px-6 py-3 bg-slate-800/50 border border-slate-600 text-white rounded-md hover:bg-slate-700/50 font-medium"
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
          className="p-2 text-gray-400 hover:bg-slate-800/50 rounded transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <PageHeader
          title="Create New Client"
          subtitle="Set up a new organisation with multi-trade licensing in under 15 seconds"
        />
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg p-4">
          {error}
        </div>
      )}

      <div className="bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Company Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Acme Fire Protection Ltd"
              className="w-full px-4 py-2 bg-slate-800/50 border border-slate-600 text-white placeholder-gray-400 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Client Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, clientType: 'main_contractor' })}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  formData.clientType === 'main_contractor'
                    ? 'border-orange-500 bg-orange-500/20 ring-2 ring-orange-500/30'
                    : 'border-slate-600 hover:border-orange-500/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <Building2 size={20} className={formData.clientType === 'main_contractor' ? 'text-orange-400' : 'text-gray-400'} />
                  <span className="font-medium text-white">Main Contractor</span>
                  {formData.clientType === 'main_contractor' && (
                    <CheckCircle size={16} className="ml-auto text-orange-400" />
                  )}
                </div>
                <p className="text-xs text-gray-400 ml-8">Full procurement & quote audit workflow</p>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, clientType: 'sub_contractor' })}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  formData.clientType === 'sub_contractor'
                    ? 'border-cyan-500 bg-cyan-500/20 ring-2 ring-cyan-500/30'
                    : 'border-slate-600 hover:border-cyan-500/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <HardHat size={20} className={formData.clientType === 'sub_contractor' ? 'text-cyan-400' : 'text-gray-400'} />
                  <span className="font-medium text-white">Sub-contractor</span>
                  {formData.clientType === 'sub_contractor' && (
                    <CheckCircle size={16} className="ml-auto text-cyan-400" />
                  )}
                </div>
                <p className="text-xs text-gray-400 ml-8">SCC: Subcontract Commercial Control</p>
              </button>
            </div>
            {formData.clientType === 'sub_contractor' && (
              <div className="mt-3 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                <p className="text-xs text-cyan-300 font-medium mb-1">SCC Module Enabled</p>
                <p className="text-xs text-cyan-400">
                  This client will access the Subcontract Commercial Control module: contract setup, progress claims, variation register, and materials tracking.
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-3">
              Licensed Trades * <span className="text-gray-400 font-normal">(select all that apply)</span>
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
                        ? 'border-orange-500 bg-orange-500/20 ring-2 ring-orange-500/30'
                        : 'border-slate-600 hover:border-orange-500/50'
                    } ${isSelected && formData.selectedTrades.length === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-4 h-4 rounded-full ${
                        trade.color === 'orange' ? 'bg-orange-500' :
                        trade.color === 'yellow' ? 'bg-yellow-500' :
                        trade.color === 'blue' ? 'bg-blue-500' :
                        'bg-green-500'
                      }`}></div>
                      <div className="font-medium text-white">{trade.label}</div>
                      {isSelected && (
                        <CheckCircle size={16} className="ml-auto text-orange-400" />
                      )}
                    </div>
                    <div className="text-sm text-gray-400">${trade.price}/month</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-gray-400">
              Client can access all selected trades during trial. After trial, they pay for what they keep.
            </p>
          </div>

          <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-5">
            <div className="flex items-center gap-3 mb-3">
              <DollarSign className="text-green-400" size={24} />
              <h3 className="font-bold text-green-300">Revenue Calculator</h3>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-green-300">Base Price ({formData.selectedTrades.length} trades):</span>
                <span className="font-medium text-green-300">${fullPrice}/month</span>
              </div>

              {formData.selectedTrades.length >= 2 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-green-300">
                      Bundle Discount (
                      {formData.selectedTrades.length === 2 && '15%'}
                      {formData.selectedTrades.length === 3 && '25%'}
                      {formData.selectedTrades.length >= 4 && '35%'}
                      ):
                    </span>
                    <span className="font-medium text-green-400">-${savings.toFixed(0)}</span>
                  </div>
                  <div className="h-px bg-green-500/30 my-2"></div>
                </>
              )}

              <div className="flex justify-between">
                <span className="font-bold text-green-300">Monthly Revenue:</span>
                <span className="text-2xl font-bold text-green-300">${monthlyRevenue.toFixed(0)}</span>
              </div>

              <div className="text-xs text-green-300 mt-2">
                {formData.selectedTrades.length === 1 && 'Select another trade for 15% bundle discount'}
                {formData.selectedTrades.length === 2 && 'Select one more trade for 25% bundle discount (10% more savings)'}
                {formData.selectedTrades.length === 3 && 'Select all trades for 35% bundle discount'}
                {formData.selectedTrades.length >= 4 && 'Maximum bundle discount applied!'}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
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
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-800/50 border border-slate-600 text-white hover:bg-slate-700/50'
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Owner Email *
            </label>
            <input
              type="email"
              required
              value={formData.ownerEmail}
              onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
              placeholder="owner@company.com"
              className="w-full px-4 py-2 bg-slate-800/50 border border-slate-600 text-white placeholder-gray-400 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <p className="mt-1 text-sm text-gray-400">
              They'll need to sign up with this email to access the organisation
            </p>
          </div>

          <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
            <h3 className="font-semibold text-blue-300 mb-2">What happens next:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-blue-300">
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
              className="flex-1 px-6 py-3 bg-slate-800/50 border border-slate-600 text-white rounded-md hover:bg-slate-700/50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex-1 px-6 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 font-medium disabled:bg-slate-700 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : `Create Client ($${monthlyRevenue.toFixed(0)}/mo)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
