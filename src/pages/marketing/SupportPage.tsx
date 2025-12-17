import React, { useState } from 'react';
import MarketingLayout from './MarketingLayout';
import { Mail, ChevronDown } from 'lucide-react';

export default function SupportPage() {
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const faqs = [
    { q: 'Can I try before I buy?', a: 'Yes! All plans include a 14-day free trial with full access.' },
    { q: 'What happens after my trial?', a: 'Your data is preserved for 30 days while you decide.' },
    { q: 'Do you offer annual discounts?', a: 'Yes! Annual billing saves you approximately 20%.' },
    { q: 'Is my data secure?', a: 'Yes. All data is encrypted with AES-256 and hosted in NZ/AU regions.' }
  ];

  return (
    <MarketingLayout>
      <div className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">How Can We Help?</h1>
          <p className="text-xl text-slate-300">Get the support you need</p>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-8 border border-slate-700 text-center mb-12">
          <Mail className="text-[#fd7e14] mx-auto mb-4" size={48} />
          <h3 className="text-xl font-bold mb-3">Email Support</h3>
          <a href="mailto:support@verifytrade.co.nz" className="text-[#fd7e14] hover:underline">support@verifytrade.co.nz</a>
        </div>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-slate-900/50 rounded-lg border border-slate-700">
              <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="w-full flex items-center justify-between p-6 text-left">
                <span className="font-semibold">{faq.q}</span>
                <ChevronDown className={`text-[#fd7e14] transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} size={20} />
              </button>
              {faqOpen === i && <div className="px-6 pb-6 text-slate-300">{faq.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
}
