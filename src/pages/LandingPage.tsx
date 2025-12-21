import { Shield, Upload, Cpu, Layers, Zap, FileText, BarChart3, Download, CheckCircle, ArrowRight, Target, AlertTriangle, Award, Users, Brain, Database, FileSearch, TrendingUp, ShieldAlert, Clock, Lock, Briefcase, BookOpen, HelpCircle, FileCode, LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import DemoBookingModal from '../components/DemoBookingModal';
import HeroVideo from '../components/HeroVideo';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfService from './TermsOfService';

interface LandingPageProps {
  onSignIn: () => void;
  onViewPricing?: () => void;
}

export default function LandingPage({ onSignIn, onViewPricing }: LandingPageProps) {
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);

  const comingSoonTrades = [
    'PassiveFire Verify+ • Now Available',
    'Electrical Verify+ • Q1 2026',
    'Plumbing Verify+ • Q1 2026',
    'HVAC Verify+ • Q1 2026',
    'ActiveFire Verify+ • Q1 2026',
    'Trade Analysis Suite • Expanding'
  ];

  if (showPrivacyPolicy) {
    return <PrivacyPolicy onBack={() => setShowPrivacyPolicy(false)} />;
  }

  if (showTermsOfService) {
    return <TermsOfService onBack={() => setShowTermsOfService(false)} />;
  }

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

      {/* Breaking News Banner */}
      <div className="fixed top-16 left-0 right-0 z-40 bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-lg border-b-2 border-orange-400 overflow-hidden">
        <div className="h-10 flex items-center">
          <div className="animate-scroll-seamless flex items-center whitespace-nowrap">
            {/* Repeat content 3 times for seamless loop */}
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center">
                <span className="inline-block px-6 text-sm font-bold">
                  Coming Soon!
                </span>
                <span className="inline-block px-2 text-slate-200">•</span>
                <span className="inline-block px-6 text-sm font-semibold">
                  🔌 Electrical Verify+
                </span>
                <span className="inline-block px-2 text-slate-200">•</span>
                <span className="inline-block px-6 text-sm font-semibold">
                  ❄️ HVAC Verify+
                </span>
                <span className="inline-block px-2 text-slate-200">•</span>
                <span className="inline-block px-6 text-sm font-semibold">
                  🚿 Plumbing Verify+
                </span>
                <span className="inline-block px-2 text-slate-200">•</span>
                <span className="inline-block px-6 text-sm font-semibold">
                  🚨 Active Fire Verify+
                </span>
                <span className="inline-block px-2 text-slate-200">•</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="pt-26">
        <section className="relative overflow-hidden py-12 sm:py-24 lg:py-32 min-h-[85vh] sm:min-h-[90vh] flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="text-center max-w-5xl mx-auto">
              <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-6 sm:mb-8">
                <span className="px-3 py-1.5 text-xs sm:text-sm font-medium text-blue-300 bg-blue-900/40 rounded-full border border-blue-800/50 backdrop-blur-sm">
                  Main Contractors
                </span>
                <span className="px-3 py-1.5 text-xs sm:text-sm font-medium text-purple-300 bg-purple-900/40 rounded-full border border-purple-800/50 backdrop-blur-sm">
                  Quantity Surveyors
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
                Built for Main Contractors & Quantity Surveyors across NZ & Australia who need defensible, risk-free awards
              </p>
            </div>

            {/* Hero Video */}
            <HeroVideo onBookDemo={() => setShowDemoModal(true)} />

            <div className="text-center max-w-5xl mx-auto mt-12 sm:mt-16">
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
                <h3 className="text-xl font-bold text-slate-100 mb-3">Quantity Surveyors</h3>
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

        <section id="customers" className="py-12 sm:py-16 md:py-20 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-3 sm:mb-4">Built for Industry Leaders</h2>
              <p className="text-base sm:text-lg md:text-xl text-slate-400 px-4 max-w-3xl mx-auto">
                Trusted by construction professionals who demand precision and accountability
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <Users className="text-blue-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Main Contractors</h3>
                    <p className="text-sm text-slate-500">NZ & Australia</p>
                  </div>
                </div>
                <p className="text-slate-300 leading-relaxed mb-4">
                  "After manually auditing hundreds of passive fire quotes, we knew there had to be a better way. VerifyTrade eliminates the guesswork and gives us complete confidence in our procurement decisions."
                </p>
                <p className="text-sm text-green-400 italic font-semibold">Live</p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                    <BarChart3 className="text-green-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Quantity Surveyors</h3>
                    <p className="text-sm text-slate-500">Professional Services</p>
                  </div>
                </div>
                <p className="text-slate-300 leading-relaxed mb-4">
                  "The ability to compare quotes line-by-line across multiple suppliers in minutes instead of days is transformative. Every recommendation is now backed by data, not gut feel."
                </p>
                <p className="text-sm text-green-400 italic font-semibold">Live</p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center">
                    <Shield className="text-orange-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Fire Engineers</h3>
                    <p className="text-sm text-slate-500">Compliance Verification</p>
                  </div>
                </div>
                <p className="text-slate-300 leading-relaxed mb-4">
                  "Verifying that quoted systems actually meet our fire report requirements used to take hours of manual checking. Now it's instant, and we catch non-compliant systems before they become problems."
                </p>
                <p className="text-sm text-green-400 italic font-semibold">Live</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 text-center">
              <h3 className="text-2xl font-bold text-slate-100 mb-4">Join the Early Access Program</h3>
              <p className="text-lg text-slate-400 mb-6 max-w-2xl mx-auto">
                Be among the first to experience the future of construction procurement. Early access customers get priority support, discounted pricing, and direct input into product development.
              </p>
              <button
                onClick={onSignIn}
                className="px-8 py-3 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg"
              >
                Apply for Early Access
              </button>
            </div>
          </div>
        </section>

        <section id="features" className="py-12 sm:py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-3 sm:mb-4">Revolutionary Features</h2>
              <p className="text-base sm:text-lg md:text-xl text-slate-400 px-4 max-w-3xl mx-auto">
                Purpose-built for construction professionals who need absolute clarity on every quote they receive
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-16">
              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Brain className="text-blue-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2">Multi-Model AI Extraction</h3>
                    <p className="text-slate-400">
                      Advanced ensemble parsing using multiple AI models simultaneously. Achieves 98%+ extraction accuracy even on poorly formatted quotes with handwritten markups.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Database className="text-purple-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2">System Library Database</h3>
                    <p className="text-slate-400">
                      52+ passive fire system templates covering walls, floors, penetrations, and more. Constantly updated with latest manufacturer certifications and specifications.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileSearch className="text-green-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2">Intelligent Scope Gap Detection</h3>
                    <p className="text-slate-400">
                      Automatically identifies missing items by comparing quotes against your specification, fire reports, and architectural drawings. No manual cross-checking required.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="text-orange-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2">Real-Time Price Benchmarking</h3>
                    <p className="text-slate-400">
                      Compare rates against market averages and historical data. Instantly flag outliers and negotiate with confidence backed by data.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ShieldAlert className="text-red-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2">Compliance Risk Scoring</h3>
                    <p className="text-slate-400">
                      Each quote receives an automated risk score (0-100) based on scope coverage, system compliance, and certification status. Make informed decisions fast.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Clock className="text-yellow-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2">Quote Revision Tracking</h3>
                    <p className="text-slate-400">
                      Automatic change detection across quote versions. See exactly what changed, why, and the cost impact. Complete audit trail for every modification.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 md:py-20">
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
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-md border-2 border-slate-700/50 relative">
                <span className="absolute top-4 right-4 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">Q1 2026</span>
                <div className="w-12 h-12 bg-slate-700/50 rounded-lg flex items-center justify-center mb-4">
                  <CheckCircle className="text-slate-500" size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-2">Electrical Verify+</h3>
                <p className="text-slate-400 text-sm">Quote audit intelligence for electrical trades</p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-md border-2 border-slate-700/50 relative">
                <span className="absolute top-4 right-4 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">Q2 2026</span>
                <div className="w-12 h-12 bg-slate-700/50 rounded-lg flex items-center justify-center mb-4">
                  <CheckCircle className="text-slate-500" size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-2">Plumbing Verify+</h3>
                <p className="text-slate-400 text-sm">Quote audit intelligence for plumbing trades</p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-md border-2 border-slate-700/50 relative">
                <span className="absolute top-4 right-4 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">Q3 2026</span>
                <div className="w-12 h-12 bg-slate-700/50 rounded-lg flex items-center justify-center mb-4">
                  <CheckCircle className="text-slate-500" size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-2">HVAC Verify+</h3>
                <p className="text-slate-400 text-sm">Quote audit intelligence for hvac trades</p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 shadow-md border-2 border-slate-700/50 relative">
                <span className="absolute top-4 right-4 px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-full">Q4 2026</span>
                <div className="w-12 h-12 bg-slate-700/50 rounded-lg flex items-center justify-center mb-4">
                  <CheckCircle className="text-slate-500" size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-2">ActiveFire Verify+</h3>
                <p className="text-slate-400 text-sm">Quote audit intelligence for activefire trades</p>
              </div>
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
                {[...comingSoonTrades, ...comingSoonTrades, ...comingSoonTrades].map((trade, idx) => (
                  <span key={idx} className="inline-block px-8 text-sm font-medium text-slate-500">
                    {trade}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="py-12 sm:py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-3 sm:mb-4">Enterprise-Grade Security</h2>
              <p className="text-base sm:text-lg md:text-xl text-slate-400 px-4 max-w-3xl mx-auto">
                Your quotes contain commercially sensitive data. We take security seriously.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="w-14 h-14 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Lock className="text-blue-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">End-to-End Encryption</h3>
                <p className="text-slate-400 leading-relaxed">
                  All data encrypted in transit (TLS 1.3) and at rest (AES-256). Your quotes are never accessible to unauthorized parties.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="w-14 h-14 bg-green-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Shield className="text-green-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Role-Based Access Control</h3>
                <p className="text-slate-400 leading-relaxed">
                  Granular permissions system ensures team members only see what they need. Full audit trail of all access and changes.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="w-14 h-14 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Database className="text-purple-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Secure Cloud Infrastructure</h3>
                <p className="text-slate-400 leading-relaxed">
                  Hosted on enterprise-grade infrastructure with 99.9% uptime SLA. Daily automated backups and disaster recovery.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="w-14 h-14 bg-orange-500/20 rounded-xl flex items-center justify-center mb-4">
                  <FileText className="text-orange-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Data Sovereignty</h3>
                <p className="text-slate-400 leading-relaxed">
                  Your data stays in your region. We comply with GDPR, CCPA, and local data protection regulations.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="w-14 h-14 bg-red-500/20 rounded-xl flex items-center justify-center mb-4">
                  <AlertTriangle className="text-red-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Penetration Tested</h3>
                <p className="text-slate-400 leading-relaxed">
                  Regular third-party security audits and penetration testing. Vulnerabilities identified and patched promptly.
                </p>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="w-14 h-14 bg-yellow-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Briefcase className="text-yellow-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Enterprise SSO Support</h3>
                <p className="text-slate-400 leading-relaxed">
                  Integration with your existing identity provider (Azure AD, Okta, Google Workspace). Launching Q2 2026.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="py-12 sm:py-16 md:py-20 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-6">Built by Experts Who've Been There</h2>
              <div className="text-left space-y-6 text-slate-300 leading-relaxed">
                <p className="text-lg">
                  VerifyTrade was born from real frustration. Our founding team has collectively audited over <span className="font-bold text-slate-100">£500 million</span> of passive fire work across major construction projects in NZ and Australia.
                </p>
                <p className="text-lg">
                  We've seen the same problems over and over: quotes that arrive in inconsistent formats, missing critical items, non-compliant systems specified, and procurement teams struggling to make informed decisions under tight deadlines.
                </p>
                <p className="text-lg">
                  After spending thousands of hours manually comparing quotes line-by-line, we knew there had to be a better way. So we built it.
                </p>
                <p className="text-lg">
                  VerifyTrade combines deep domain expertise in passive fire protection with cutting-edge AI to deliver what the industry has been missing: <span className="font-bold text-blue-400">absolute clarity</span> on every quote you receive.
                </p>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 mt-8">
                  <p className="text-lg font-semibold text-slate-100 mb-2">Our Mission</p>
                  <p className="text-base text-slate-400">
                    To eliminate the risk and uncertainty in construction procurement by making it impossible for under-scoped, non-compliant quotes to slip through unnoticed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="help" className="py-12 sm:py-16 md:py-20 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-4">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-6">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-3">How accurate is the AI extraction?</h3>
                <p className="text-slate-400 leading-relaxed">
                  Our multi-model ensemble approach achieves 98%+ extraction accuracy, even on poorly formatted quotes. Every extraction includes a confidence score, and items flagged as low-confidence are automatically queued for human review.
                </p>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-3">What file formats do you support?</h3>
                <p className="text-slate-400 leading-relaxed">
                  We support PDF (including scanned/image-based PDFs with OCR) and Excel files (.xlsx, .xls, .csv). Our AI can handle inconsistent formatting, merged cells, and various table layouts.
                </p>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-3">How long does it take to audit a quote?</h3>
                <p className="text-slate-400 leading-relaxed">
                  Most quotes are fully processed and audited in under 5 minutes. Complex quotes with 500+ line items may take up to 15 minutes. You'll get real-time progress updates throughout.
                </p>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-3">Can I customize the system templates?</h3>
                <p className="text-slate-400 leading-relaxed">
                  Yes! While we provide 52+ pre-built templates, you can create custom templates tailored to your specific projects and specifications. Templates can be shared across your organization.
                </p>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-3">What happens to my uploaded quotes?</h3>
                <p className="text-slate-400 leading-relaxed">
                  Your quotes are encrypted at rest and in transit. We never share your data with third parties or use it to train AI models. You maintain full ownership and can delete quotes at any time. Data retention policies can be customized per your requirements.
                </p>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-3">Do you support other trades besides passive fire?</h3>
                <p className="text-slate-400 leading-relaxed">
                  PassiveFire Verify+ is available now. We're launching Electrical, Plumbing, HVAC, and ActiveFire editions in Q1 2026. Early access customers will receive priority onboarding for new trades.
                </p>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-3">What level of support do you provide?</h3>
                <p className="text-slate-400 leading-relaxed">
                  All plans include email support with 24-hour response time. Professional and Enterprise plans include priority support, dedicated account manager, and onboarding assistance. We also provide comprehensive documentation and video tutorials.
                </p>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-slate-100 mb-3">Can I export the audit reports?</h3>
                <p className="text-slate-400 leading-relaxed">
                  Yes! Export comprehensive audit reports as PDF, Excel, or CSV. All reports are client-ready and include executive summaries, detailed comparisons, risk analysis, and recommendations.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="docs" className="py-12 sm:py-16 md:py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-4">Documentation & Resources</h2>
              <p className="text-lg text-slate-400">
                Everything you need to get started and maximize value from VerifyTrade
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-blue-500/50 transition-all">
                <div className="w-14 h-14 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                  <BookOpen className="text-blue-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Getting Started Guide</h3>
                <p className="text-slate-400 mb-4">
                  Step-by-step walkthrough from account setup to your first audit report. Includes video tutorials and best practices.
                </p>
                <span className="text-blue-400 text-sm font-medium">Coming with launch →</span>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-purple-500/50 transition-all">
                <div className="w-14 h-14 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                  <FileCode className="text-purple-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">API Documentation</h3>
                <p className="text-slate-400 mb-4">
                  RESTful API for integrating VerifyTrade into your existing procurement workflow. OAuth 2.0 authentication included.
                </p>
                <span className="text-purple-400 text-sm font-medium">Q2 2026 →</span>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-green-500/50 transition-all">
                <div className="w-14 h-14 bg-green-500/20 rounded-xl flex items-center justify-center mb-4">
                  <LifeBuoy className="text-green-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Support Portal</h3>
                <p className="text-slate-400 mb-4">
                  Access knowledge base, submit support tickets, and connect with our team. Track issue resolution in real-time.
                </p>
                <span className="text-green-400 text-sm font-medium">Coming with launch →</span>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-orange-500/50 transition-all">
                <div className="w-14 h-14 bg-orange-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Target className="text-orange-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Best Practices</h3>
                <p className="text-slate-400 mb-4">
                  Industry insights and recommendations from our expert team on optimizing your procurement process.
                </p>
                <span className="text-orange-400 text-sm font-medium">Coming soon →</span>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-yellow-500/50 transition-all">
                <div className="w-14 h-14 bg-yellow-500/20 rounded-xl flex items-center justify-center mb-4">
                  <FileText className="text-yellow-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Template Library</h3>
                <p className="text-slate-400 mb-4">
                  Browse and download 52+ pre-built system templates. Filter by manufacturer, system type, and fire rating.
                </p>
                <span className="text-yellow-400 text-sm font-medium">Available at launch →</span>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-8 hover:border-red-500/50 transition-all">
                <div className="w-14 h-14 bg-red-500/20 rounded-xl flex items-center justify-center mb-4">
                  <HelpCircle className="text-red-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Video Tutorials</h3>
                <p className="text-slate-400 mb-4">
                  Comprehensive video library covering every feature, from basic quote import to advanced audit customization.
                </p>
                <span className="text-red-400 text-sm font-medium">Coming with launch →</span>
              </div>
            </div>
          </div>
        </section>

        <section id="resources" className="py-12 sm:py-16 md:py-20 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-3 sm:mb-4">Resources Hub</h2>
              <p className="text-base sm:text-lg md:text-xl text-slate-400 px-4 max-w-3xl mx-auto">
                Everything you need to master quote auditing and procurement best practices
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 hover:border-blue-500/50 transition-all">
                <div className="w-14 h-14 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                  <BookOpen className="text-blue-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Knowledge Base</h3>
                <p className="text-slate-400 mb-4 leading-relaxed">
                  Comprehensive guides, tutorials, and best practices for passive fire quote auditing. Searchable articles covering every feature and workflow.
                </p>
                <a href="#docs" className="text-blue-400 text-sm font-medium hover:text-blue-300 transition-colors">
                  Browse Documentation →
                </a>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 hover:border-purple-500/50 transition-all">
                <div className="w-14 h-14 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                  <FileText className="text-purple-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Industry Insights</h3>
                <p className="text-slate-400 mb-4 leading-relaxed">
                  Expert analysis on passive fire trends, common procurement pitfalls, and how to improve your quote evaluation process.
                </p>
                <span className="text-purple-400 text-sm font-medium">Blog launching Q1 2026 →</span>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 hover:border-green-500/50 transition-all">
                <div className="w-14 h-14 bg-green-500/20 rounded-xl flex items-center justify-center mb-4">
                  <HelpCircle className="text-green-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">FAQs</h3>
                <p className="text-slate-400 mb-4 leading-relaxed">
                  Quick answers to common questions about AI extraction accuracy, data security, pricing, and platform capabilities.
                </p>
                <a href="#help" className="text-green-400 text-sm font-medium hover:text-green-300 transition-colors">
                  View FAQ →
                </a>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 hover:border-orange-500/50 transition-all">
                <div className="w-14 h-14 bg-orange-500/20 rounded-xl flex items-center justify-center mb-4">
                  <FileCode className="text-orange-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">API Reference</h3>
                <p className="text-slate-400 mb-4 leading-relaxed">
                  Complete API documentation for developers integrating VerifyTrade into existing procurement systems and workflows.
                </p>
                <span className="text-orange-400 text-sm font-medium">Available Q2 2026 →</span>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 hover:border-yellow-500/50 transition-all">
                <div className="w-14 h-14 bg-yellow-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Target className="text-yellow-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Template Library</h3>
                <p className="text-slate-400 mb-4 leading-relaxed">
                  52+ pre-built passive fire system templates. Download, customize, and share across your organization.
                </p>
                <span className="text-yellow-400 text-sm font-medium">Available at launch →</span>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 hover:border-red-500/50 transition-all">
                <div className="w-14 h-14 bg-red-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Users className="text-red-400" size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-100 mb-3">Webinars & Training</h3>
                <p className="text-slate-400 mb-4 leading-relaxed">
                  Live training sessions, recorded webinars, and certification programs to help your team maximize platform value.
                </p>
                <span className="text-red-400 text-sm font-medium">Starting Q1 2026 →</span>
              </div>
            </div>

            <div className="mt-12 text-center">
              <p className="text-slate-400 mb-6">
                Can't find what you're looking for?
              </p>
              <a
                href="#support"
                className="inline-block px-6 py-3 text-base font-semibold text-slate-100 bg-slate-800 border-2 border-slate-600 rounded-xl hover:border-slate-500 hover:bg-slate-700 transition-all"
              >
                Contact Support
              </a>
            </div>
          </div>
        </section>

        <section id="support" className="py-12 sm:py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-3 sm:mb-4">World-Class Support</h2>
              <p className="text-base sm:text-lg md:text-xl text-slate-400 px-4 max-w-3xl mx-auto">
                We're here to help you succeed at every step of your journey
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <LifeBuoy className="text-blue-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2">Email Support</h3>
                    <p className="text-sm text-slate-500 mb-4">Available on all plans</p>
                    <p className="text-slate-400 leading-relaxed">
                      Get expert help via email with guaranteed 24-hour response time. Our team of passive fire specialists understands your challenges and provides detailed, actionable solutions.
                    </p>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>24-hour response time</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>Expert passive fire knowledge</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>Detailed troubleshooting</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users className="text-purple-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2">Priority Support</h3>
                    <p className="text-sm text-slate-500 mb-4">Professional & Enterprise plans</p>
                    <p className="text-slate-400 leading-relaxed">
                      Get faster response times, direct access to senior engineers, and proactive monitoring of your account. Includes dedicated onboarding and training sessions.
                    </p>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>4-hour response time</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>Dedicated account manager</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>Onboarding & training included</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <BookOpen className="text-green-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2">Self-Service Resources</h3>
                    <p className="text-sm text-slate-500 mb-4">Available 24/7</p>
                    <p className="text-slate-400 leading-relaxed">
                      Comprehensive knowledge base, video tutorials, and interactive guides help you find answers instantly without waiting for support.
                    </p>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>Searchable knowledge base</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>Video tutorial library</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>Step-by-step guides</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Target className="text-orange-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-100 mb-2">Implementation Support</h3>
                    <p className="text-sm text-slate-500 mb-4">Enterprise plans</p>
                    <p className="text-slate-400 leading-relaxed">
                      Hands-on assistance setting up custom templates, integrating with your systems, and training your team. We ensure smooth adoption across your organization.
                    </p>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>Custom template setup</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>Team training sessions</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <CheckCircle className="text-green-400" size={16} />
                      <span>Integration assistance</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 text-center">
              <h3 className="text-2xl font-bold text-slate-100 mb-3">Need Help Right Now?</h3>
              <p className="text-lg text-slate-400 mb-6">
                Our support team is ready to assist with any questions about features, pricing, or implementation.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => setShowDemoModal(true)}
                  className="px-8 py-3 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg"
                >
                  Book a Demo Call
                </button>
                <a
                  href="#help"
                  className="px-8 py-3 text-lg font-semibold text-slate-100 bg-slate-800 border-2 border-slate-600 rounded-xl hover:border-slate-500 hover:bg-slate-700 transition-all inline-block"
                >
                  View FAQ
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="py-12 sm:py-16 md:py-20 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-50 mb-6">Ready for Early Access?</h2>
            <p className="text-lg text-slate-400 mb-8">
              We're launching in Q1 2026. Join our early access program and be among the first to experience the future of quote auditing.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onSignIn}
                className="px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg"
              >
                Start Your Free Trial
              </button>
              <button
                onClick={() => setShowDemoModal(true)}
                className="px-8 py-4 text-lg font-semibold text-slate-100 border-2 border-slate-600 rounded-xl hover:border-slate-500 hover:bg-slate-800/50 transition-all"
              >
                Schedule a Demo
              </button>
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
                <li><a href="#early-access" className="hover:text-slate-50 transition-colors">Early Access Program</a></li>
                <li><a href="#contact" className="hover:text-slate-50 transition-colors">Contact</a></li>
                <li><a href="#careers" className="hover:text-slate-50 transition-colors">Careers</a></li>
                <li><button onClick={() => setShowPrivacyPolicy(true)} className="hover:text-slate-50 transition-colors text-left">Privacy Policy</button></li>
                <li><button onClick={() => setShowTermsOfService(true)} className="hover:text-slate-50 transition-colors text-left">Terms of Service</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-slate-50 font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#help" className="hover:text-slate-50 transition-colors">Help Center</a></li>
                <li><a href="#docs" className="hover:text-slate-50 transition-colors">Documentation</a></li>
                <li><a href="#support" className="hover:text-slate-50 transition-colors">Support</a></li>
                <li><a href="#status" className="hover:text-slate-50 transition-colors">System Status</a></li>
                <li><a href="#blog" className="hover:text-slate-50 transition-colors">Blog</a></li>
                <li><a href="#api" className="hover:text-slate-50 transition-colors">API Documentation</a></li>
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
            transform: translateX(-33.333%);
          }
        }
        @keyframes scroll-seamless {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
        .animate-scroll {
          animation: scroll 25s linear infinite;
        }
        .animate-scroll-seamless {
          animation: scroll-seamless 20s linear infinite;
        }
      `}</style>
    </div>
  );
}
