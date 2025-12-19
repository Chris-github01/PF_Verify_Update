import { useState, useEffect } from 'react';
import { AlertTriangle, CreditCard, Mail, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useOrganisation } from '../lib/organisationContext';

export default function TrialExpired() {
  const { currentOrganisation } = useOrganisation();
  const [trialEndDate, setTrialEndDate] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrganisation) {
      loadTrialInfo();
    }
  }, [currentOrganisation]);

  const loadTrialInfo = async () => {
    if (!currentOrganisation) return;

    try {
      const { data, error } = await supabase.rpc('check_trial_status', {
        p_organisation_id: currentOrganisation.id
      });

      if (error) throw error;
      if (data?.trial_end_date) {
        setTrialEndDate(new Date(data.trial_end_date).toLocaleDateString());
      }
    } catch (err) {
      console.error('Failed to load trial info:', err);
    }
  };

  const handleContactSales = () => {
    window.location.href = 'mailto:sales@verifytrade.com?subject=Trial Upgrade Request';
  };

  const handleViewPricing = () => {
    window.location.href = '/pricing';
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl w-full"
      >
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-orange-600 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <AlertTriangle size={32} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Trial Expired</h1>
                <p className="text-red-100 mt-1">Your 14-day trial has ended</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700/50">
              <h2 className="text-xl font-semibold text-white mb-3">
                Continue Using Verify+
              </h2>
              <p className="text-slate-300 leading-relaxed mb-4">
                Your trial for <span className="font-semibold text-white">{currentOrganisation?.name}</span> expired
                {trialEndDate && <> on {trialEndDate}</>}. To continue accessing your projects, quotes, and reports,
                please upgrade to a paid plan.
              </p>

              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600/30">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">What you're missing:</h3>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400 mt-0.5">•</span>
                    <span>Access to all your projects and imported quotes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400 mt-0.5">•</span>
                    <span>Advanced quote intelligence and comparison reports</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400 mt-0.5">•</span>
                    <span>Scope matrix analysis and award recommendations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-sky-400 mt-0.5">•</span>
                    <span>Contract management and variation tracking</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Pricing Tiers */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-slate-900/30 rounded-lg p-5 border border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white">Starter</h3>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">$299</div>
                    <div className="text-xs text-slate-400">per month</div>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>Up to 5 users</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>100 quotes/month</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>All core features</span>
                  </li>
                </ul>
              </div>

              <div className="bg-gradient-to-br from-sky-900/40 to-blue-900/40 rounded-lg p-5 border border-sky-600/50 relative">
                <div className="absolute top-3 right-3">
                  <span className="px-2 py-1 bg-sky-500 text-white text-xs font-semibold rounded">
                    POPULAR
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white">Professional</h3>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">$599</div>
                    <div className="text-xs text-sky-200">per month</div>
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-sky-100">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>Up to 15 users</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>500 quotes/month</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>Priority support</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleViewPricing}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg hover:shadow-sky-500/50"
              >
                <CreditCard size={20} />
                View Pricing Plans
              </button>
              <button
                onClick={handleContactSales}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-slate-700/50 hover:bg-slate-700 text-white font-semibold rounded-lg transition-all duration-200 border border-slate-600/50"
              >
                <Mail size={18} />
                Contact Sales
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-700/50 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition-all duration-200 border border-slate-600/50"
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>

            <div className="text-center">
              <p className="text-sm text-slate-400">
                Need help? Email us at{' '}
                <a href="mailto:support@verifytrade.com" className="text-sky-400 hover:text-sky-300 underline">
                  support@verifytrade.com
                </a>
              </p>
            </div>

            <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4 text-sm text-amber-300">
              <p className="font-semibold mb-2">Trial Expired?</p>
              <p className="text-amber-200">
                View our pricing plans to upgrade your account and regain access to all your projects and data.
                Contact our sales team for custom enterprise solutions.
              </p>
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="text-center mt-8">
          <p className="text-slate-400 text-sm">
            VerifyTrade Quote Audit Engine
          </p>
        </div>
      </motion.div>
    </div>
  );
}
