import { Check, X, ChevronDown, Shield, Zap, Award, ArrowRight } from 'lucide-react';
import { useState } from 'react';

interface PricingProps {
  onStartTrial?: () => void;
  onBookDemo?: () => void;
}

export default function Pricing({ onStartTrial, onBookDemo }: PricingProps) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('annual');
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenFAQ(openFAQ === index ? null : index);
  };

  const companyLogos = [
    'Fletcher Construction',
    'Hawkins',
    'Naylor Love',
    'Beca',
    'Rider Levett Bucknall',
    'WT Partnership'
  ];

  const pricingTiers = [
    {
      name: 'Starter',
      badge: 'Perfect for smaller teams & consultants',
      monthlyPrice: 1199,
      annualPrice: 999,
      description: 'Essential tools to get started with passive fire auditing',
      features: [
        'Up to 5 users',
        'Unlimited passive fire audits',
        'Full PDF + Excel reports',
        'Email support',
        '14-day free trial'
      ],
      cta: 'Start 14-Day Trial',
      ctaColor: 'bg-blue-600 hover:bg-blue-700',
      popular: false
    },
    {
      name: 'Professional',
      badge: 'For growing main contractors & PQS firms',
      monthlyPrice: null,
      annualPrice: 1999,
      savingsNote: 'Save $4,800/year',
      description: 'Everything you need to scale your passive fire compliance',
      features: [
        'Everything in Starter, plus:',
        'Up to 15 users',
        'Custom branding on reports',
        'Priority support (Slack + phone)',
        'Multi-project dashboard',
        'API access (coming Q1 2026)',
        'On-chain audit trail (ICP)'
      ],
      cta: 'Start 14-Day Trial',
      ctaColor: 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700',
      popular: true
    },
    {
      name: 'Enterprise',
      badge: 'For Tier-1 contractors & national PQS practices',
      monthlyPrice: null,
      annualPrice: null,
      customPrice: 'From $3,500+/month',
      description: 'Maximum power, flexibility, and white-glove support',
      features: [
        'Everything in Professional, plus:',
        'Unlimited users',
        'Dedicated account manager',
        'White-label client portal',
        'Early access to Electrical / HVAC / Plumbing Verify+',
        'Custom ontology training',
        'SLA + 99.9% uptime',
        'On-premise / private cloud option'
      ],
      cta: 'Book a Custom Demo',
      ctaColor: 'bg-gray-900 hover:bg-gray-800',
      popular: false,
      isEnterprise: true
    }
  ];

  const addOns = [
    { name: 'Per extra user', price: '$149 / month' },
    { name: 'Per-report transactional (pay-as-you-go)', price: '$249 / audit' },
    { name: 'Multi-trade early access pack', price: '+$1,000 / month (when live)' }
  ];

  const comparisonFeatures = [
    { name: 'Users', starter: '5', professional: '15', enterprise: 'Unlimited' },
    { name: 'Unlimited Audits', starter: true, professional: true, enterprise: true },
    { name: 'Custom Branding', starter: false, professional: true, enterprise: true },
    { name: 'Priority Support', starter: false, professional: true, enterprise: true },
    { name: 'API Access', starter: false, professional: '2026', enterprise: true },
    { name: 'On-chain Audit Trail', starter: false, professional: true, enterprise: true },
    { name: 'Multi-trade Early Access', starter: false, professional: false, enterprise: true },
    { name: 'Dedicated Manager', starter: false, professional: false, enterprise: true }
  ];

  const faqs = [
    {
      question: 'Can I try before I buy?',
      answer: 'Yes, 14 days free, no credit card required.'
    },
    {
      question: 'What happens after the trial?',
      answer: 'Downgrade to free limited plan or choose a paid tier.'
    },
    {
      question: 'Do you offer discounts for annual billing?',
      answer: 'Yes – save up to 20%.'
    },
    {
      question: 'Can we pay per report instead?',
      answer: 'Yes – $249 per audit (perfect for consultants).'
    },
    {
      question: 'Is my data secure?',
      answer: 'Enterprise-grade encryption + optional on-chain immutability.'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-gray-50 to-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Simple, Transparent Pricing That<br />Pays for Itself on the First Project
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            No hidden fees. No per-report surprises. Unlimited audits on every plan.
          </p>

          {/* Billing Toggle */}
          <div className="mt-12 flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${billingPeriod === 'monthly' ? 'text-gray-900' : 'text-gray-500'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')}
              className="relative inline-flex h-7 w-14 items-center rounded-full bg-blue-600 transition-colors"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  billingPeriod === 'annual' ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${billingPeriod === 'annual' ? 'text-gray-900' : 'text-gray-500'}`}>
              Annual <span className="text-green-600 font-semibold">(Save 20%)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">
        <div className="grid md:grid-cols-3 gap-8 mb-20">
          {pricingTiers.map((tier, index) => (
            <div
              key={index}
              className={`relative bg-white rounded-2xl shadow-xl border-2 ${
                tier.popular ? 'border-orange-500' : 'border-gray-200'
              } p-8 flex flex-col`}
            >
              {tier.popular && (
                <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                  ⭐ MOST POPULAR - Best Value
                </div>
              )}

              <div className="mb-6">
                <div className="text-sm font-medium text-gray-500 mb-2">{tier.badge}</div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{tier.name}</h3>

                <div className="mb-4">
                  {tier.customPrice ? (
                    <div className="text-3xl font-bold text-gray-900">{tier.customPrice}</div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold text-gray-900">
                          ${billingPeriod === 'annual' && tier.annualPrice ? tier.annualPrice : tier.monthlyPrice}
                        </span>
                        <span className="text-gray-600">NZD / month</span>
                      </div>
                      {billingPeriod === 'annual' && tier.annualPrice && (
                        <div className="text-sm text-gray-500 mt-1">billed annually</div>
                      )}
                      {billingPeriod === 'monthly' && tier.monthlyPrice && tier.annualPrice && (
                        <div className="text-sm text-gray-500 mt-1">or ${tier.annualPrice} annually</div>
                      )}
                      {tier.savingsNote && billingPeriod === 'annual' && (
                        <div className="text-sm font-semibold text-green-600 mt-2">{tier.savingsNote}</div>
                      )}
                    </>
                  )}
                </div>

                <p className="text-sm text-gray-600">{tier.description}</p>
              </div>

              <div className="flex-1 mb-8">
                <ul className="space-y-4">
                  {tier.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check className="text-green-500 flex-shrink-0 mt-0.5" size={20} />
                      <span className={`text-sm ${feature.startsWith('Everything') ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={tier.isEnterprise ? onBookDemo : onStartTrial}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all shadow-md hover:shadow-lg ${tier.ctaColor}`}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add-ons Section */}
      <div className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Optional Add-ons</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {addOns.map((addOn, index) => (
              <div key={index} className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                <div className="text-sm font-medium text-gray-600 mb-2">{addOn.name}</div>
                <div className="text-2xl font-bold text-gray-900">{addOn.price}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trust & Social Proof */}
      <div className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wider mb-8">
            Used by leading New Zealand main contractors & PQS firms
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 mb-12">
            {companyLogos.map((logo, index) => (
              <div key={index} className="flex items-center justify-center">
                <div className="text-gray-400 font-semibold text-sm text-center">{logo}</div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100">
            <div className="flex items-start gap-4">
              <Award className="text-blue-600 flex-shrink-0" size={32} />
              <div>
                <p className="text-lg text-gray-900 italic mb-4">
                  "Verify+ saved us $1.8M in rework risk on a single project."
                </p>
                <p className="text-sm font-semibold text-gray-700">
                  — James Hargrove, Procurement Director
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">What's Included</h2>
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Feature</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">Starter</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-orange-600 bg-orange-50">
                    Professional ★
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {comparisonFeatures.map((feature, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{feature.name}</td>
                    <td className="px-6 py-4 text-center">
                      {typeof feature.starter === 'boolean' ? (
                        feature.starter ? (
                          <Check className="text-green-500 mx-auto" size={20} />
                        ) : (
                          <X className="text-gray-300 mx-auto" size={20} />
                        )
                      ) : (
                        <span className="text-sm text-gray-700">{feature.starter}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center bg-orange-50/30">
                      {typeof feature.professional === 'boolean' ? (
                        feature.professional ? (
                          <Check className="text-green-500 mx-auto" size={20} />
                        ) : (
                          <X className="text-gray-300 mx-auto" size={20} />
                        )
                      ) : (
                        <span className="text-sm text-gray-700">{feature.professional}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {typeof feature.enterprise === 'boolean' ? (
                        feature.enterprise ? (
                          <Check className="text-green-500 mx-auto" size={20} />
                        ) : (
                          <X className="text-gray-300 mx-auto" size={20} />
                        )
                      ) : (
                        <span className="text-sm text-gray-700">{feature.enterprise}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900">{faq.question}</span>
                  <ChevronDown
                    className={`text-gray-500 transform transition-transform ${
                      openFAQ === index ? 'rotate-180' : ''
                    }`}
                    size={20}
                  />
                </button>
                {openFAQ === index && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <p className="text-gray-700">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Start Auditing Smarter Today</h2>
          <p className="text-xl text-blue-100 mb-10">
            Join leading contractors who are saving millions with Verify+
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onStartTrial}
              className="px-8 py-4 bg-white text-blue-600 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all shadow-lg flex items-center justify-center gap-2"
            >
              Start Your Free 14-Day Trial
              <ArrowRight size={20} />
            </button>
            <button
              onClick={onBookDemo}
              className="px-8 py-4 bg-transparent border-2 border-white text-white rounded-lg font-semibold text-lg hover:bg-white/10 transition-all"
            >
              Book a 15-Min Demo
            </button>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 border-t border-gray-200">
        <p className="text-center text-sm text-gray-600">
          All prices exclude GST. Billed in NZD. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
