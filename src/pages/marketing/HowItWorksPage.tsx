import React from 'react';
import MarketingLayout from './MarketingLayout';
import { ArrowRight } from 'lucide-react';

export default function HowItWorksPage() {
  return (
    <MarketingLayout>
      <div className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8 text-center">How PassiveFire Verify+ Works</h1>
        <p className="text-xl text-slate-300 text-center mb-12">
          From quote upload to award recommendation in 8 automated steps
        </p>
        <div className="space-y-8">
          {[1,2,3,4,5,6,7,8].map(num => (
            <div key={num} className="bg-slate-900/50 rounded-lg p-8 border border-slate-700">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#fd7e14] text-white font-bold flex items-center justify-center text-xl">{num}</div>
                <h3 className="text-2xl font-bold">Step {num}</h3>
              </div>
              <p className="text-slate-300">Automated process step {num} description</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <a href="/trial-signup" className="inline-flex items-center gap-2 px-8 py-4 text-lg font-medium text-white bg-[#fd7e14] rounded-lg hover:bg-[#e86e0d] transition">
            Start Free Trial <ArrowRight size={20} />
          </a>
        </div>
      </div>
    </MarketingLayout>
  );
}
