import { useState } from 'react';
import { Shield, Mail, Lock, Building2, ArrowRight, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TrialSignupProps {
  onSuccess?: () => void;
  onBackToHome?: () => void;
  preselectedTier?: 'starter' | 'professional';
}

export default function TrialSignup({ onSuccess, onBackToHome, preselectedTier = 'starter' }: TrialSignupProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organisationName, setOrganisationName] = useState('');
  const [selectedTier, setSelectedTier] = useState<'starter' | 'professional'>(preselectedTier);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'account' | 'organization'>('account');

  const tiers = {
    starter: {
      name: 'Starter',
      price: '$11,988 NZD/year',
      monthly: '$999/month',
      users: '5',
      quotes: '100',
      features: ['Full PDF + Excel reports', 'Email support', 'Unlimited audits']
    },
    professional: {
      name: 'Professional',
      price: '$23,988 NZD/year',
      monthly: '$1,999/month',
      users: '15',
      quotes: '500',
      features: ['Everything in Starter', 'Priority support', 'Custom branding', 'Multi-project dashboard']
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Failed to create account');
      }

      setStep('organization');
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleOrganizationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('You must be logged in');
      }

      const { data, error: fnError } = await supabase.rpc('create_trial_account', {
        p_user_id: user.id,
        p_email: user.email,
        p_organisation_name: organisationName,
        p_pricing_tier: selectedTier
      });

      if (fnError) throw fnError;

      if (onSuccess) {
        onSuccess();
      } else {
        window.location.href = '/';
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)] flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-6">
            <img
              src="/verifytrade_logo_new.png"
              alt="VerifyTrade"
              className="h-80 w-auto"
            />
          </div>
          <h1 className="text-3xl font-bold text-slate-50 mb-2">
            Start Your Free 14-Day Trial
          </h1>
          <p className="text-slate-400">
            No credit card required. Full access to all features.
          </p>
        </div>

        {step === 'account' ? (
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl shadow-xl border border-slate-700/50 p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-slate-50 mb-2">Create Your Account</h2>
              <p className="text-sm text-slate-400">Step 1 of 2</p>
            </div>

            <form onSubmit={handleAccountSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-100 placeholder-slate-500"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-100 placeholder-slate-500"
                    placeholder="••••••••"
                    minLength={6}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">Minimum 6 characters</p>
              </div>

              {error && (
                <div className="text-sm p-3 rounded-lg text-red-800 bg-red-50 border border-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2 shadow-lg"
              >
                {loading ? 'Creating account...' : (
                  <>
                    Continue
                    <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={onBackToHome}
                className="text-sm text-slate-400 hover:text-slate-100"
              >
                Already have an account? <span className="text-blue-400">Sign in</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl shadow-xl border border-slate-700/50 p-8">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-50 mb-2">Choose Your Trial Plan</h2>
                <p className="text-sm text-slate-400">Step 2 of 2 - Select your plan for the 14-day trial</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                {Object.entries(tiers).map(([key, tier]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedTier(key as 'starter' | 'professional')}
                    className={`text-left p-6 rounded-lg border-2 transition-all ${
                      selectedTier === key
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-50">{tier.name}</h3>
                        <p className="text-sm text-slate-400 mt-1">{tier.price}</p>
                        <p className="text-xs text-slate-500">{tier.monthly} equivalent</p>
                      </div>
                      {selectedTier === key && (
                        <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
                          <Check className="text-white" size={16} />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="text-green-500" size={16} />
                        <span className="text-slate-300">Up to {tier.users} users</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="text-green-500" size={16} />
                        <span className="text-slate-300">{tier.quotes} quotes/month</span>
                      </div>
                      {tier.features.map((feature, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <Check className="text-green-500" size={16} />
                          <span className="text-slate-300">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

              <form onSubmit={handleOrganizationSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Organization Name
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                      type="text"
                      value={organisationName}
                      onChange={(e) => setOrganisationName(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-100 placeholder-slate-500"
                      placeholder="Your Company Name"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm p-3 rounded-lg text-red-800 bg-red-50 border border-red-200">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2 shadow-lg"
                >
                  {loading ? 'Starting trial...' : (
                    <>
                      Start 14-Day Free Trial
                      <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="bg-slate-800/40 rounded-lg p-4 border border-slate-700">
              <div className="flex items-start gap-3">
                <Shield className="text-green-400 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-sm text-slate-300">
                  <p className="font-medium mb-1">What happens after 14 days?</p>
                  <p className="text-slate-400">
                    Your trial will automatically end after 14 days. You can upgrade to a paid plan anytime to continue using Verify+. No credit card required to start.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          By continuing, you agree to our{' '}
          <a href="#terms" className="text-slate-400 hover:text-slate-300 underline">Terms of Service</a>
          {' '}and{' '}
          <a href="#privacy" className="text-slate-400 hover:text-slate-300 underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
