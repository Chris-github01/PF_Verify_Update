import { useState, useEffect } from 'react';
import { AlertTriangle, Crown, X } from 'lucide-react';
import { checkDemoLimit, DemoLimitStatus } from '../lib/demoLimits';

interface DemoLimitBannerProps {
  organisationId: string;
  className?: string;
}

export default function DemoLimitBanner({ organisationId, className = '' }: DemoLimitBannerProps) {
  const [limitStatus, setLimitStatus] = useState<DemoLimitStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadDemoStatus();
  }, [organisationId]);

  const loadDemoStatus = async () => {
    const status = await checkDemoLimit(organisationId);
    setLimitStatus(status);
  };

  if (!limitStatus || !limitStatus.isDemo || dismissed) {
    return null;
  }

  const handleUpgrade = () => {
    window.location.href = '/pricing';
  };

  if (!limitStatus.canUpload) {
    return (
      <div className={`bg-gradient-to-r from-red-900 to-orange-900 border border-red-700 rounded-lg p-4 ${className}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-white mb-1">Demo Limit Reached</h3>
            <p className="text-red-100 text-sm mb-3">
              You have processed {limitStatus.quotesProcessed} of {limitStatus.quoteLimit} quotes.
              Your demo account cannot upload more quotes.
            </p>
            <button
              onClick={handleUpgrade}
              className="bg-white hover:bg-red-50 text-red-900 font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm"
            >
              <Crown className="w-4 h-4" />
              Upgrade to Pro for Unlimited Access
            </button>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-red-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-r from-blue-900 to-purple-900 border border-blue-700 rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-500 bg-opacity-20 flex items-center justify-center flex-shrink-0">
          <span className="text-blue-300 font-bold">{limitStatus.remaining}</span>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">Demo Account</h3>
          <p className="text-blue-100 text-sm">
            {limitStatus.remaining} quote{limitStatus.remaining === 1 ? '' : 's'} remaining in your demo.
            {limitStatus.remaining === 1 && ' Make it count!'}
          </p>
          {limitStatus.quotesProcessed > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-2 bg-blue-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-500"
                  style={{ width: `${(limitStatus.quotesProcessed / limitStatus.quoteLimit) * 100}%` }}
                />
              </div>
              <span className="text-xs text-blue-300 font-medium">
                {limitStatus.quotesProcessed}/{limitStatus.quoteLimit}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={handleUpgrade}
          className="bg-white hover:bg-blue-50 text-blue-900 font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-sm flex-shrink-0"
        >
          <Crown className="w-3.5 h-3.5" />
          Upgrade
        </button>
      </div>
    </div>
  );
}
