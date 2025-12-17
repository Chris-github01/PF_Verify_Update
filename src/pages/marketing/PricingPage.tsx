import React from 'react';
import MarketingLayout from './MarketingLayout';
import { Check, ArrowRight } from 'lucide-react';

export default function PricingPage() {
  const plans = [
    { name: 'Starter', price: 999, features: ['Up to 5 users', 'Unlimited audits', 'Email support', '14-day trial'] },
    { name: 'Professional', price: 1999, features: ['Up to 15 users', 'Everything in Starter', 'Priority support', 'Custom branding'], highlighted: true },
    { name: 'Enterprise', price: 3500, features: ['Unlimited users', 'Everything in Pro', 'Dedicated manager', 'White-label'] }
  ];

  return (
    <MarketingLayout>
      <div className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-xl text-slate-300">No hidden fees. Unlimited audits on every plan.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map(plan => (
            <div key={plan.name} className={`rounded-2xl p-8 ${plan.highlighted ? 'border-2 border-[#fd7e14]' : 'border border-slate-700'} bg-slate-900/50`}>
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="text-4xl font-bold mb-6">${plan.price} <span className="text-lg font-normal text-slate-400">/mo</span></div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <Check className="text-[#fd7e14]" size={20} />
                    <span className="text-slate-300">{f}</span>
                  </li>
                ))}
              </ul>
              <a href="/trial-signup" className={`block w-full text-center py-3 rounded-lg font-medium ${plan.highlighted ? 'bg-[#fd7e14] text-white' : 'bg-slate-800 text-white'}`}>
                Start Trial
              </a>
            </div>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
}
