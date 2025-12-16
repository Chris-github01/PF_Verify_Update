import { useState, useEffect } from 'react';
import { AlertTriangle, X, Clock, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TrialStatusBannerProps {
  organisationId: string;
}

export default function TrialStatusBanner({ organisationId }: TrialStatusBannerProps) {
  const [trialStatus, setTrialStatus] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrialStatus();
  }, [organisationId]);

  const loadTrialStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('check_trial_status', {
        p_organisation_id: organisationId
      });

      if (error) throw error;
      setTrialStatus(data);
    } catch (err) {
      console.error('Failed to load trial status:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !trialStatus || dismissed) return null;

  const isExpired = trialStatus.is_expired;
  const daysRemaining = trialStatus.days_remaining || 0;
  const subscriptionStatus = trialStatus.subscription_status;

  if (subscriptionStatus !== 'trial' || (!isExpired && daysRemaining > 7)) {
    return null;
  }

  if (isExpired) {
    return (
      <div className="bg-red-600 text-white px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="flex-shrink-0" size={20} />
            <div>
              <p className="font-semibold">Your trial has expired</p>
              <p className="text-sm text-red-100">
                Upgrade to a paid plan to continue using Verify+
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                window.location.href = '/settings?tab=billing';
              }}
              className="px-4 py-2 bg-white text-red-600 rounded-lg font-semibold text-sm hover:bg-red-50 transition-colors flex items-center gap-2"
            >
              <CreditCard size={16} />
              Upgrade Now
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-2 hover:bg-red-700 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (daysRemaining <= 7) {
    return (
      <div className="bg-orange-600 text-white px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="flex-shrink-0" size={20} />
            <div>
              <p className="font-semibold">
                {daysRemaining === 0
                  ? 'Your trial expires today'
                  : `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left in your trial`}
              </p>
              <p className="text-sm text-orange-100">
                Upgrade now to keep full access to all features
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                window.location.href = '/settings?tab=billing';
              }}
              className="px-4 py-2 bg-white text-orange-600 rounded-lg font-semibold text-sm hover:bg-orange-50 transition-colors flex items-center gap-2"
            >
              <CreditCard size={16} />
              Upgrade
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-2 hover:bg-orange-700 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
