import React from 'react';
import MarketingLayout from './MarketingLayout';
import { Download, Mail } from 'lucide-react';

export default function ResourcesPage() {
  return (
    <MarketingLayout>
      <div className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">Resources & Insights</h1>
          <p className="text-xl text-slate-300">Expert guidance on passive fire quote auditing</p>
        </div>
        <div className="bg-gradient-to-br from-[#fd7e14]/10 to-transparent rounded-2xl p-12 border border-slate-700 mb-12">
          <Download className="text-[#fd7e14] mb-4" size={48} />
          <h2 className="text-2xl font-bold mb-4">Free Download: Top 10 Passive Fire Scope Gaps Checklist</h2>
          <p className="text-slate-300 mb-6">The most common scope gaps found in passive fire quotes</p>
          <input type="email" placeholder="Enter your email" className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white mb-4" />
          <button className="w-full px-8 py-3 bg-[#fd7e14] text-white rounded-lg font-medium hover:bg-[#e86e0d] transition">
            Download Free Checklist
          </button>
        </div>
        <div className="bg-slate-900/50 rounded-2xl p-12 border border-slate-700 text-center">
          <Mail className="text-[#fd7e14] mx-auto mb-6" size={48} />
          <h2 className="text-3xl font-bold mb-4">Stay Updated</h2>
          <p className="text-slate-300 mb-8">Join our mailing list for product updates and insights</p>
          <input type="email" placeholder="your@email.com" className="w-full max-w-md mx-auto px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white mb-4" />
          <button className="px-8 py-3 bg-[#fd7e14] text-white rounded-lg font-medium hover:bg-[#e86e0d] transition">Subscribe</button>
        </div>
      </div>
    </MarketingLayout>
  );
}
