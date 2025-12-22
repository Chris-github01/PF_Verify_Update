import { Check, X, ChevronDown, Shield, Zap, Award, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import DemoBookingModal from '../components/DemoBookingModal';

interface PricingProps {
  onStartTrial?: (tier?: 'starter' | 'professional') => void;
  onBookDemo?: () => void;
  onBackToHome?: () => void;
}

export default function Pricing({ onStartTrial, onBookDemo, onBackToHome }: PricingProps) {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const [showDemoModal, setShowDemoModal] = useState(false);

  const toggleFAQ = (index: number) => {
    setOpenFAQ(openFAQ === index ? null : index);
  };

  const handleBookDemo = () => {
    setShowDemoModal(true);
    if (onBookDemo) onBookDemo();
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
      monthlyPrice: 1249,
      annualPrice: 999,
      savingsNote: 'Save $3,000/year',
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
      badge: 'For growing main contractors & Quantity Surveyors',
      monthlyPrice: 2499,
      annualPrice: 1999,
      savingsNote: 'Save $6,000/year',
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
      badge: 'For Tier-1 contractors & national Quantity Surveyors',
      monthlyPrice: 3500,
      annualPrice: 2800,
      customPricePrefix: 'From ',
      description: 'Maximum power, flexibility, and white-glove support',
      features: [
        'Everything in Professional, plus:',
        'Unlimited users',
        'Dedicated account manager',
        'White-label client portal',
        'Early access to Verify+ Electrical / HVAC / Plumbing',
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)]">
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button onClick={onBackToHome} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <Shield className="text-white" size={20} />
              </div>
              <span className="text-xl font-bold text-slate-50">VerifyTrade</span>
            </button>

            <div className="hidden md:flex items-center gap-8">
              <button onClick={onBackToHome} className="text-sm text-slate-400 hover:text-slate-50 transition-colors font-medium">How It Works</button>
              <button className="text-sm text-slate-50 transition-colors font-medium">Pricing</button>
              <button onClick={onBackToHome} className="text-sm text-slate-400 hover:text-slate-50 transition-colors font-medium">Customers</button>
              <button onClick={onBackToHome} className="text-sm text-slate-400 hover:text-slate-50 transition-colors font-medium">Resources</button>
              <button onClick={onBackToHome} className="text-sm text-slate-400 hover:text-slate-50 transition-colors font-medium">Support</button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onStartTrial}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={handleBookDemo}
                className="hidden sm:block px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-sm"
              >
                Book Demo
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-slate-50 mb-6">
            Simple, Transparent Pricing That<br />Pays for Itself on the First Project
          </h1>
          <p className="text-xl text-slate-300 max-w-3xl mx-auto">
            No hidden fees. No per-report surprises. Unlimited audits on every plan.
          </p>

          {/* Billing Toggle */}
          <div className="mt-12 flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${billingPeriod === 'monthly' ? 'text-slate-50' : 'text-slate-400'}`}>
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
            <span className={`text-sm font-medium ${billingPeriod === 'annual' ? 'text-slate-50' : 'text-slate-400'}`}>
              Annual <span className="text-green-400 font-semibold">(Save 20%)</span>
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
              className={`relative bg-slate-800/60 rounded-2xl shadow-xl border-2 ${
                tier.popular ? 'border-orange-500' : 'border-slate-700'
              } p-8 flex flex-col`}
            >
              {tier.popular && (
                <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                  ⭐ MOST POPULAR - Best Value
                </div>
              )}

              <div className="mb-6">
                <div className="text-sm font-medium text-slate-400 mb-2">{tier.badge}</div>
                <h3 className="text-2xl font-bold text-slate-50 mb-4">{tier.name}</h3>

                <div className="mb-4">
                  <>
                    {billingPeriod === 'annual' && tier.annualPrice ? (
                      <>
                        <div className="flex items-baseline gap-2">
                          {tier.customPricePrefix && <span className="text-2xl font-medium text-slate-300">From </span>}
                          <span className="text-4xl font-bold text-slate-50">
                            ${(tier.annualPrice * 12).toLocaleString()}
                          </span>
                          <span className="text-slate-300">NZD / year</span>
                        </div>
                        <div className="text-sm text-slate-400 mt-1">
                          ${tier.annualPrice.toLocaleString()}/month equivalent
                        </div>
                        {tier.savingsNote && (
                          <div className="text-sm font-semibold text-green-400 mt-2">{tier.savingsNote}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-2">
                          {tier.customPricePrefix && <span className="text-2xl font-medium text-slate-300">From </span>}
                          <span className="text-4xl font-bold text-slate-50">
                            ${tier.monthlyPrice?.toLocaleString()}
                          </span>
                          <span className="text-slate-300">NZD / month</span>
                        </div>
                        {tier.annualPrice && (
                          <div className="text-sm text-slate-400 mt-1">
                            or ${(tier.annualPrice * 12).toLocaleString()}/year (save 20%)
                          </div>
                        )}
                      </>
                    )}
                  </>
                </div>

                <p className="text-sm text-slate-300">{tier.description}</p>
              </div>

              <div className="flex-1 mb-8">
                <ul className="space-y-4">
                  {tier.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <Check className="text-green-500 flex-shrink-0 mt-0.5" size={20} />
                      <span className={`text-sm ${feature.startsWith('Everything') ? 'font-semibold text-slate-50' : 'text-slate-300'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={tier.isEnterprise ? handleBookDemo : () => onStartTrial?.(tier.name.toLowerCase() as 'starter' | 'professional')}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all shadow-md hover:shadow-lg ${tier.ctaColor}`}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add-ons Section */}
      <div className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-50 text-center mb-12">Optional Add-ons</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {addOns.map((addOn, index) => (
              <div key={index} className="bg-slate-800/60 rounded-lg shadow-md p-6 border border-slate-700">
                <div className="text-sm font-medium text-slate-300 mb-2">{addOn.name}</div>
                <div className="text-2xl font-bold text-slate-50">{addOn.price}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trust & Social Proof */}
      <div className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-center text-sm font-semibold text-slate-400 uppercase tracking-wider mb-8">
            Used by leading New Zealand main contractors & Quantity Surveyors
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 mb-12">
            {companyLogos.map((logo, index) => (
              <div key={index} className="flex items-center justify-center">
                <div className="text-slate-400 font-semibold text-sm text-center">{logo}</div>
              </div>
            ))}
          </div>

          <div className="bg-slate-800/40 rounded-2xl p-8 border border-slate-700">
            <div className="flex items-start gap-4">
              <Award className="text-blue-400 flex-shrink-0" size={32} />
              <div>
                <p className="text-lg text-slate-100 italic mb-4">
                  "Verify+ saved us $1.8M in rework risk on a single project."
                </p>
                <p className="text-sm font-semibold text-slate-300">
                  — James Hargrove, Procurement Director
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-50 text-center mb-12">What's Included</h2>
          <div className="bg-slate-800/60 rounded-xl shadow-lg overflow-hidden border border-slate-700">
            <table className="w-full">
              <thead className="bg-slate-900/50 border-b border-slate-700">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-100">Feature</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-slate-100">Starter</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-orange-400 bg-orange-900/20">
                    Professional ★
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-slate-100">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {comparisonFeatures.map((feature, index) => (
                  <tr key={index} className="hover:bg-slate-700/30">
                    <td className="px-6 py-4 text-sm font-medium text-slate-100">{feature.name}</td>
                    <td className="px-6 py-4 text-center">
                      {typeof feature.starter === 'boolean' ? (
                        feature.starter ? (
                          <Check className="text-green-500 mx-auto" size={20} />
                        ) : (
                          <X className="text-slate-600 mx-auto" size={20} />
                        )
                      ) : (
                        <span className="text-sm text-slate-300">{feature.starter}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center bg-orange-900/20">
                      {typeof feature.professional === 'boolean' ? (
                        feature.professional ? (
                          <Check className="text-green-500 mx-auto" size={20} />
                        ) : (
                          <X className="text-slate-600 mx-auto" size={20} />
                        )
                      ) : (
                        <span className="text-sm text-slate-300">{feature.professional}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {typeof feature.enterprise === 'boolean' ? (
                        feature.enterprise ? (
                          <Check className="text-green-500 mx-auto" size={20} />
                        ) : (
                          <X className="text-slate-600 mx-auto" size={20} />
                        )
                      ) : (
                        <span className="text-sm text-slate-300">{feature.enterprise}</span>
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
      <div className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-50 text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/60">
                <button
                  onClick={() => toggleFAQ(index)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-slate-700/30 transition-colors"
                >
                  <span className="font-semibold text-slate-100">{faq.question}</span>
                  <ChevronDown
                    className={`text-slate-400 transform transition-transform ${
                      openFAQ === index ? 'rotate-180' : ''
                    }`}
                    size={20}
                  />
                </button>
                {openFAQ === index && (
                  <div className="px-6 py-4 bg-slate-900/30 border-t border-slate-700">
                    <p className="text-slate-300">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 py-20 px-4 sm:px-6 lg:px-8 border-t border-slate-700">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Start Auditing Smarter Today</h2>
          <p className="text-xl text-slate-300 mb-10">
            Join leading contractors who are saving millions with Verify+
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onStartTrial?.()}
              className="px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold text-lg hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2"
            >
              Start Your Free 14-Day Trial
              <ArrowRight size={20} />
            </button>
            <button
              onClick={handleBookDemo}
              className="px-8 py-4 bg-transparent border-2 border-slate-500 text-slate-100 rounded-lg font-semibold text-lg hover:bg-slate-700/30 transition-all"
            >
              Book a 15-Min Demo
            </button>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="py-8 px-4 sm:px-6 lg:px-8 border-t border-slate-700">
        <p className="text-center text-sm text-slate-400">
          All prices exclude GST. Billed in NZD. Cancel anytime.
        </p>
      </div>

      <DemoBookingModal
        isOpen={showDemoModal}
        onClose={() => setShowDemoModal(false)}
      />
    </div>
  );
}
