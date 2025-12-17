import React from 'react';
import MarketingLayout from './MarketingLayout';
import { ArrowRight } from 'lucide-react';

export default function CustomersPage() {
  return (
    <MarketingLayout>
      <div className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">Trusted by Leading Contractors</h1>
          <p className="text-xl text-slate-300">200+ organisations across NZ & Australia</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {['Fletcher Construction', 'Hawkins', 'Naylor Love', 'Beca', 'Rider Levett Bucknall', 'WT Partnership', 'Holmes Fire', '+87 others'].map(c => (
            <div key={c} className="text-center text-slate-400 font-medium">{c}</div>
          ))}
        </div>
        <div className="bg-gradient-to-br from-[#fd7e14]/10 to-transparent rounded-2xl p-12 border border-slate-700">
          <div className="text-3xl font-medium mb-6">
            "Verify+ saved us $1.8M in rework risk on a single project."
          </div>
          <div className="text-slate-400">— James Hargrove, Procurement Director</div>
        </div>
        <div className="text-center mt-12">
          <a href="/trial-signup" className="inline-flex items-center gap-2 px-8 py-4 text-lg font-medium text-white bg-[#fd7e14] rounded-lg hover:bg-[#e86e0d] transition">
            Book a Demo <ArrowRight size={20} />
          </a>
        </div>
      </div>
    </MarketingLayout>
  );
}
