import { Shield, Upload, Cpu, Layers, Zap, FileText, BarChart3, Download, CheckCircle, ArrowRight, Target, AlertTriangle, Award, Users } from 'lucide-react';
import { useState } from 'react';
import DemoBookingModal from '../components/DemoBookingModal';

interface LandingPageProps {
  onSignIn: () => void;
  onViewPricing?: () => void;
}

export default function LandingPage({ onSignIn, onViewPricing }: LandingPageProps) {
  const [showDemoModal, setShowDemoModal] = useState(false);

  const trustedCompanies = [
    'Fletcher Construction',
    'Hawkins',
    'Mainzeal',
    'RLB',
    'WT Partnership',
    'Holmes Fire',
    '87+ others'
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#020617)]">
      <nav className="fixed top-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <Shield className="text-white" size={20} />
              </div>
              <span className="text-xl font-bold text-slate-50">VerifyTrade</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#how-it-works" className="text-sm text-slate-400 hover:text-slate-50 transition-colors font-medium">How It Works</a>
              <button onClick={onViewPricing} className="text-sm text-slate-400 hover:text-slate-50 transition-colors font-medium">Pricing</button>
              <a href="#customers" className="text-sm text-slate-400 hover:text-slate-50 transition-colors font-medium">Customers</a>
              <a href="#resources" className="text-sm text-slate-400 hover:text-slate-50 transition-colors font-medium">Resources</a>
              <a href="#support" className="text-sm text-slate-400 hover:text-slate-50 transition-colors font-medium">Support</a>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onSignIn}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => setShowDemoModal(true)}
                className="hidden sm:block px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-sm"
              >
                Book Demo
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-16">
        <section className="relative overflow-hidden py-12 sm:py-24 lg:py-32 min-h-[85vh] sm:min-h-[90vh] flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="text-center max-w-5xl mx-auto">
              <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-6 sm:mb-8">
                <span className="px-3 py-1.5 text-xs sm:text-sm font-medium text-blue-300 bg-blue-900/40 rounded-full border border-blue-800/50 backdrop-blur-sm">
                  Main Contractors
                </span>
                <span className="px-3 py-1.5 text-xs sm:text-sm font-medium text-purple-300 bg-purple-900/40 rounded-full border border-purple-800/50 backdrop-blur-sm">
                  Quantity Surveyors & PQS
                </span>
                <span className="px-3 py-1.5 text-xs sm:text-sm font-medium text-green-300 bg-green-900/40 rounded-full border border-green-800/50 backdrop-blur-sm">
                  Fire Engineers
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-slate-50 mb-4 sm:mb-6 tracking-tight leading-[1.15] sm:leading-tight px-2">
                Instantly Audit Every<br />
                <span className="bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
                  Passive Fire Quote
                </span> You Receive
              </h1>

              <p className="text-lg sm:text-2xl md:text-3xl font-semibold text-blue-400 mb-4 sm:mb-6 leading-snug sm:leading-tight px-4">
                The AI engine that finds scope gaps, missing systems, and hidden risks in seconds — not days.
              </p>

              <p className="text-sm sm:text-base md:text-lg text-slate-400 mb-8 sm:mb-12 max-w-3xl mx-auto px-4">
                Used by 200+ Main Contractors & PQS across NZ & Australia to make defensible, risk-free awards
              </p>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 mb-8 sm:mb-12 border border-slate-700/50 mx-2 sm:mx-0">
                <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-slate-100 font-medium leading-relaxed">
                  Upload every supplier quote → Get a full audit report that tells you exactly who is <span className="font-bold text-red-400">under-scoping</span>, <span className="font-bold text-orange-400">over-pricing</span>, or taking <span className="font-bold text-red-400">unacceptable risk</span> — in under 30 minutes.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
                <button
                  onClick={onSignIn}
                  className="group px-6 sm:px-8 py-3.5 sm:py-4 text-base sm:text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  Audit Your First Quotes Free
                  <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
                </button>
                <button
                  onClick={() => setShowDemoModal(true)}
                  className="px-6 sm:px-8 py-3.5 sm:py-4 text-base sm:text-lg font-semibold text-slate-100 bg-slate-800 border-2 border-slate-700 rounded-xl hover:border-slate-600 hover:bg-slate-700 transition-all shadow-sm hover:shadow-md"
                >
                  Book a Live Demo
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="py-12 sm:py-16 md:py-20 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-3 sm:mb-4">Complete Quote Audit in 8 Steps</h2>
              <p className="text-base sm:text-lg md:text-xl text-slate-400 px-4">The most comprehensive passive fire quote analysis platform ever built</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700/50 rounded-xl p-6 hover:border-blue-500/50 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-blue-900/40 rounded-lg flex items-center justify-center mb-4">
                  <Upload className="text-blue-400" size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-3">1. Automated Quote Import & Parsing</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Upload PDFs or Excel files. Our AI instantly extracts every line item, rate, description, and spec — even from messy formats.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700/50 rounded-xl p-6 hover:border-purple-500/50 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-purple-900/40 rounded-lg flex items-center justify-center mb-4">
                  <Cpu className="text-purple-400" size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-3">2. AI-Driven Normalising & Cleaning</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Automatically standardizes units, corrects typos, and groups similar items across all quotes for true apples-to-apples comparison.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700/50 rounded-xl p-6 hover:border-green-500/50 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-green-900/40 rounded-lg flex items-center justify-center mb-4">
                  <Layers className="text-green-400" size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-3">3. Smart System Detection</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Recognizes Hilti, Promat, Trafalgar, Nullifire, and 40+ other manufacturers. Maps every product to certified fire-rated systems.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700/50 rounded-xl p-6 hover:border-orange-500/50 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-orange-900/40 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="text-orange-400" size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-3">4. One-Click Quote Intelligence</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  52+ passive fire system templates. Instantly highlights missing items, wrong specs, and coverage gaps against your master scope.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700/50 rounded-xl p-6 hover:border-red-500/50 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-red-900/40 rounded-lg flex items-center justify-center mb-4">
                  <Target className="text-red-400" size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-3">5. Scope Matrix Generation</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  True line-by-line comparison across all suppliers. See exactly who included what, who's missing items, and who's over-pricing.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700/50 rounded-xl p-6 hover:border-yellow-500/50 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-yellow-900/40 rounded-lg flex items-center justify-center mb-4">
                  <AlertTriangle className="text-yellow-400" size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-3">6. Automated Risk & Coverage Scoring</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Every quote gets a risk score (0-100). Flags exclusions, underscoping, non-compliant systems, and missing certifications.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700/50 rounded-xl p-6 hover:border-blue-500/50 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-blue-900/40 rounded-lg flex items-center justify-center mb-4">
                  <FileText className="text-blue-400" size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-3">7. Award Recommendation Report</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Client-ready PDF + Excel report with executive summary, risk analysis, and clear recommendation. Board-meeting ready.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border-2 border-slate-700/50 rounded-xl p-6 hover:border-green-500/50 hover:shadow-lg transition-all">
                <div className="w-12 h-12 bg-green-900/40 rounded-lg flex items-center justify-center mb-4">
                  <Download className="text-green-400" size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-100 mb-3">8. One-Click Export Everything</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Export scope matrix, award report, comparison tables, and audit trail in multiple formats. Full transparency, zero manual work.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-3 sm:mb-4">Who It's Built For</h2>
              <p className="text-base sm:text-lg md:text-xl text-slate-400 px-4">The procurement confidence you've been missing</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-md border-2 border-slate-700/50 hover:border-blue-500/50 transition-all">
                <div className="w-14 h-14 bg-blue-900/40 rounded-xl flex items-center justify-center mb-4">
                  <Users className="text-blue-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Main Contractors</h3>
                <p className="text-slate-400 leading-relaxed">
                  Never award an under-scoped job again. Catch every gap before you sign.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-md border-2 border-slate-700/50 hover:border-purple-500/50 transition-all">
                <div className="w-14 h-14 bg-purple-900/40 rounded-xl flex items-center justify-center mb-4">
                  <BarChart3 className="text-purple-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Quantity Surveyors & PQS</h3>
                <p className="text-slate-400 leading-relaxed">
                  Make awards with total confidence. Defend every decision with data.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-md border-2 border-slate-700/50 hover:border-green-500/50 transition-all">
                <div className="w-14 h-14 bg-green-900/40 rounded-xl flex items-center justify-center mb-4">
                  <Shield className="text-green-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Fire Engineers</h3>
                <p className="text-slate-400 leading-relaxed">
                  Verify every proposed system meets the fire report. Zero compliance risk.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-md border-2 border-slate-700/50 hover:border-orange-500/50 transition-all">
                <div className="w-14 h-14 bg-orange-900/40 rounded-xl flex items-center justify-center mb-4">
                  <Award className="text-orange-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Compliance & Audit Teams</h3>
                <p className="text-slate-400 leading-relaxed">
                  100% defensible procurement decisions with full audit trail.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 md:py-20 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-3 sm:mb-4">Key Benefits</h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
              <div className="text-center p-6">
                <div className="text-5xl font-bold text-blue-400 mb-3">10x</div>
                <h4 className="font-semibold text-slate-100 mb-2">Faster Audits</h4>
                <p className="text-sm text-slate-400">Days → under 30 minutes</p>
              </div>

              <div className="text-center p-6">
                <div className="text-5xl font-bold text-green-400 mb-3">0</div>
                <h4 className="font-semibold text-slate-100 mb-2">Scope Gaps Missed</h4>
                <p className="text-sm text-slate-400">AI catches every exclusion</p>
              </div>

              <div className="text-center p-6">
                <div className="text-5xl font-bold text-purple-400 mb-3">100%</div>
                <h4 className="font-semibold text-slate-100 mb-2">Risk Transparency</h4>
                <p className="text-sm text-slate-400">Full visibility on every quote</p>
              </div>

              <div className="text-center p-6">
                <div className="text-5xl font-bold text-orange-400 mb-3">✓</div>
                <h4 className="font-semibold text-slate-100 mb-2">Defensible Awards</h4>
                <p className="text-sm text-slate-400">Data-backed decisions</p>
              </div>

              <div className="text-center p-6">
                <div className="text-5xl font-bold text-red-400 mb-3">∞</div>
                <h4 className="font-semibold text-slate-100 mb-2">Standard Format</h4>
                <p className="text-sm text-slate-400">Industry-standard output</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12">
              <span className="inline-block px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-900/40 text-blue-300 border border-blue-800/50 rounded-full text-xs sm:text-sm font-semibold mb-3 sm:mb-4 backdrop-blur-sm">Coming Soon</span>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-3 sm:mb-4">The Full Trade Audit Suite</h2>
              <p className="text-base sm:text-lg md:text-xl text-slate-400 px-4">The same AI audit engine — now for every major trade</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {['Electrical Verify+', 'Plumbing Verify+', 'HVAC Verify+', 'ActiveFire Verify+'].map((product) => (
                <div key={product} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-md border-2 border-slate-700/50 relative">
                  <span className="absolute top-4 right-4 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">Q1 2026</span>
                  <div className="w-12 h-12 bg-slate-700/50 rounded-lg flex items-center justify-center mb-4">
                    <CheckCircle className="text-slate-500" size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-100 mb-2">{product}</h3>
                  <p className="text-slate-400 text-sm">Quote audit intelligence for {product.split(' ')[0].toLowerCase()} trades</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-5 sm:mb-6 leading-tight">
              The New Global Standard for<br />Passive Fire Quote Auditing
            </h2>
            <div className="space-y-3 sm:space-y-4 text-lg sm:text-xl md:text-2xl mb-8 sm:mb-10 md:mb-12 font-medium px-4">
              <p>No more guesswork.</p>
              <p>No more nasty surprises.</p>
              <p>No other tool gives you this level of visibility.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
              <button
                onClick={onSignIn}
                className="group px-6 sm:px-8 py-3.5 sm:py-4 text-base sm:text-lg font-semibold text-black bg-white rounded-xl hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                Audit Your First Quotes Free
                <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
              </button>
              <button
                onClick={() => setShowDemoModal(true)}
                className="px-6 sm:px-8 py-3.5 sm:py-4 text-base sm:text-lg font-semibold text-white bg-transparent border-2 border-white rounded-xl hover:bg-white hover:text-gray-900 transition-all"
              >
                Book a Live Demo
              </button>
            </div>
          </div>
        </section>

        <section className="py-12 bg-slate-900/30 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden py-4 rounded-lg">
              <div className="flex animate-scroll whitespace-nowrap">
                {[...trustedCompanies, ...trustedCompanies].map((company, idx) => (
                  <span key={idx} className="inline-block px-8 text-sm font-medium text-slate-500">
                    Used by {company}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950 border-t border-slate-800 text-slate-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <p className="text-sm text-slate-500 italic">
              Built by the team that's audited over £500m of passive fire work.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <Shield className="text-white" size={14} />
                </div>
                <span className="text-lg font-bold text-slate-50">VerifyTrade</span>
              </div>
              <p className="text-sm">
                The world's first AI audit engine for passive fire quotes
              </p>
            </div>
            <div>
              <h4 className="text-slate-50 font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-slate-50 transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-slate-50 transition-colors">How It Works</a></li>
                <li><a href="#pricing" className="hover:text-slate-50 transition-colors">Pricing</a></li>
                <li><a href="#security" className="hover:text-slate-50 transition-colors">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-50 font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#about" className="hover:text-slate-50 transition-colors">About</a></li>
                <li><a href="#customers" className="hover:text-slate-50 transition-colors">Customers</a></li>
                <li><a href="#contact" className="hover:text-slate-50 transition-colors">Contact</a></li>
                <li><a href="#careers" className="hover:text-slate-50 transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-50 font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#help" className="hover:text-slate-50 transition-colors">Help Center</a></li>
                <li><a href="#docs" className="hover:text-slate-50 transition-colors">Documentation</a></li>
                <li><a href="#support" className="hover:text-slate-50 transition-colors">Support</a></li>
                <li><a href="#status" className="hover:text-slate-50 transition-colors">System Status</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} VerifyTrade. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <DemoBookingModal
        isOpen={showDemoModal}
        onClose={() => setShowDemoModal(false)}
      />

      <style>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
      `}</style>
    </div>
  );
}
