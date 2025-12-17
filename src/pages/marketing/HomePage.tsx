import React from 'react';
import MarketingLayout from './MarketingLayout';
import { ArrowRight, CheckCircle, Zap, Target, Shield, TrendingUp, Users, FileText, Search, Settings, BarChart3, Download } from 'lucide-react';

export default function HomePage() {
  return (
    <MarketingLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#fd7e14]/10 to-transparent"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32 relative">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Instantly Audit Every Passive Fire Quote You Receive
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 mb-8">
              The AI engine that finds scope gaps, missing systems, and hidden risks in seconds — not days.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 max-w-2xl mx-auto">
              <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                <div className="text-3xl font-bold text-[#fd7e14] mb-2">200+</div>
                <div className="text-slate-300">Main Contractors & PQS across NZ & Australia</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                <div className="text-3xl font-bold text-[#fd7e14] mb-2">&lt;30 min</div>
                <div className="text-slate-300">Audit reports delivered</div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/trial-signup" className="inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-medium text-white bg-[#fd7e14] rounded-lg hover:bg-[#e86e0d] transition shadow-lg">
                Audit Your First Quotes Free <ArrowRight size={20} />
              </a>
              <a href="/trial-signup" className="inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-medium text-white bg-[#007bff] rounded-lg hover:bg-[#0056b3] transition">
                Book a Live Demo
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Complete Quote Audit in 8 Steps</h2>
            <p className="text-xl text-slate-300">From upload to award recommendation — fully automated</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { num: 1, icon: FileText, title: 'Automated Quote Import & Parsing', desc: 'Upload PDFs or Excel files' },
              { num: 2, icon: Settings, title: 'AI-Driven Normalising & Cleaning', desc: 'Smart data standardization' },
              { num: 3, icon: Search, title: 'Smart System Detection', desc: 'Hilti, Promat, and more' },
              { num: 4, icon: Zap, title: 'One-Click Quote Intelligence', desc: 'Instant insights' },
              { num: 5, icon: Target, title: 'Scope Matrix Generation', desc: 'Complete coverage view' },
              { num: 6, icon: Shield, title: 'Automated Risk & Coverage Scoring', desc: 'Find gaps automatically' },
              { num: 7, icon: BarChart3, title: 'Award Recommendation Report', desc: 'Data-driven decisions' },
              { num: 8, icon: Download, title: 'One-Click Export', desc: 'PDF & Excel reports' }
            ].map((step) => (
              <div key={step.num} className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 hover:border-[#fd7e14] transition">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#fd7e14] text-white font-bold">{step.num}</div>
                  <step.icon className="text-[#fd7e14]" size={24} />
                </div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-slate-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
