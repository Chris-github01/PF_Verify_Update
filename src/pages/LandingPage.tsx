import {
  Shield, Upload, Layers, FileText, BarChart3, Download,
  CheckCircle, ArrowRight, AlertTriangle, Award, Users,
  FileSearch, Lock, Database, ChevronRight, ClipboardList,
  GitBranch, Briefcase, Scale, TrendingUp, Mail
} from 'lucide-react';
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

  if (showPrivacyPolicy) {
    return <PrivacyPolicy onBack={() => setShowPrivacyPolicy(false)} />;
  }

  if (showTermsOfService) {
    return <TermsOfService onBack={() => setShowTermsOfService(false)} />;
  }

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-slate-100">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 bg-[#0b0f1a]/95 backdrop-blur-sm border-b border-slate-800/80 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center h-16 overflow-hidden">
              <img
                src="/verifytrade_logo.png"
                alt="VerifyTrade"
                className="h-20 w-auto object-cover object-center"
              />
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#workflow" className="text-sm text-slate-400 hover:text-slate-100 transition-colors font-medium tracking-wide">How It Works</a>
              <a href="#outputs" className="text-sm text-slate-400 hover:text-slate-100 transition-colors font-medium tracking-wide">Outputs</a>
              <button onClick={onViewPricing} className="text-sm text-slate-400 hover:text-slate-100 transition-colors font-medium tracking-wide">Pricing</button>
              <a href="#who" className="text-sm text-slate-400 hover:text-slate-100 transition-colors font-medium tracking-wide">Who It's For</a>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onSignIn}
                className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-all"
              >
                Sign In
              </button>
              <button
                onClick={() => setShowDemoModal(true)}
                className="hidden sm:block px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all"
              >
                Book Demo
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-20">

        {/* HERO */}
        <section className="relative overflow-hidden pt-20 pb-0">
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/8 blur-[120px] rounded-full" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-4xl mx-auto mb-14">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-8 text-xs font-semibold text-blue-300 bg-blue-900/30 rounded-full border border-blue-800/50 tracking-widest uppercase">
                Commercial Adjudication Platform
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight leading-[1.08]">
                The Commercial Adjudication<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600">
                  Platform for Trade Packages
                </span>
              </h1>

              <p className="text-xl sm:text-2xl text-slate-400 mb-4 leading-relaxed font-light">
                From supplier quotes to award, contract, and commercial control —<br className="hidden sm:block" /> all in one structured workflow.
              </p>

              <p className="text-sm text-slate-500 mb-10 leading-relaxed">
                Built for main contractors, quantity surveyors, estimators, and commercial managers<br className="hidden sm:block" />
                across passive fire, plumbing, electrical, HVAC, and active fire.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => setShowDemoModal(true)}
                  className="group px-7 py-4 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  Book a Demo
                  <ArrowRight className="group-hover:translate-x-0.5 transition-transform" size={18} />
                </button>
                <a
                  href="#workflow"
                  className="px-7 py-4 text-base font-semibold text-slate-300 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  See How It Works
                </a>
              </div>
            </div>

            {/* VIDEO */}
            <HeroVideo onBookDemo={() => setShowDemoModal(true)} />
          </div>
        </section>

        {/* PROBLEM */}
        <section className="py-24 bg-slate-900/40">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 leading-tight">
                Trade procurement is still being<br />run in spreadsheets.
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mb-10">
              {[
                'Different suppliers price different scopes.',
                'Quotes are inconsistent, incomplete, and hard to compare.',
                'Critical gaps are missed until after award.',
                'Decisions are difficult to defend when challenged.',
              ].map((problem) => (
                <div key={problem} className="flex items-start gap-3 bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                  <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={18} />
                  <p className="text-slate-300 text-sm leading-relaxed">{problem}</p>
                </div>
              ))}
            </div>
            <div className="text-center">
              <p className="text-lg text-slate-300 font-medium">
                VerifyTrade replaces fragmented workflows with structured commercial clarity.
              </p>
            </div>
          </div>
        </section>

        {/* WHAT IT DOES */}
        <section className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                From raw quotes to clear commercial decisions
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Every stage of the adjudication process, structured and auditable.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  icon: Upload,
                  color: 'text-blue-400',
                  bg: 'bg-blue-900/30',
                  border: 'border-blue-800/40',
                  title: 'Import & Structure',
                  body: 'Upload supplier quotes in PDF or Excel. Line items are extracted, structured, and prepared for comparison across all tenderers.',
                },
                {
                  icon: Layers,
                  color: 'text-teal-400',
                  bg: 'bg-teal-900/30',
                  border: 'border-teal-800/40',
                  title: 'Classify & Understand Scope',
                  body: 'Every line item is classified — main works, optional items, or provisional sums. Attributes including size, specification, and service type are extracted automatically.',
                },
                {
                  icon: Scale,
                  color: 'text-sky-400',
                  bg: 'bg-sky-900/30',
                  border: 'border-sky-800/40',
                  title: 'Compare Like-for-Like',
                  body: 'Equalise quotes to a common scope baseline. Missing items are identified per supplier and estimated against reference rates for a fair comparison.',
                },
                {
                  icon: FileSearch,
                  color: 'text-amber-400',
                  bg: 'bg-amber-900/30',
                  border: 'border-amber-800/40',
                  title: 'Identify Commercial Risk',
                  body: 'Scope gaps are classified by severity with estimated cost exposure. Quantity misalignments are detected across suppliers. Risk is surfaced before the award decision.',
                },
                {
                  icon: BarChart3,
                  color: 'text-orange-400',
                  bg: 'bg-orange-900/30',
                  border: 'border-orange-800/40',
                  title: 'Evaluate Suppliers',
                  body: 'Suppliers are scored across multiple commercial dimensions — price, scope coverage, quantity alignment, and compliance. Weighted scoring is configurable per project.',
                },
                {
                  icon: Award,
                  color: 'text-green-400',
                  bg: 'bg-green-900/30',
                  border: 'border-green-800/40',
                  title: 'Approve with Confidence',
                  body: 'Award decisions go through a formal approval gate with mandatory sign-off and override tracking. Every decision is recorded with rationale and audit trail.',
                },
              ].map(({ icon: Icon, color, bg, border, title, body }) => (
                <div
                  key={title}
                  className="bg-slate-900/60 border border-slate-800/60 hover:border-slate-700/80 rounded-2xl p-7 transition-all group"
                >
                  <div className={`w-11 h-11 ${bg} border ${border} rounded-xl flex items-center justify-center mb-5`}>
                    <Icon className={color} size={22} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">{title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WORKFLOW */}
        <section id="workflow" className="py-24 bg-slate-900/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                One platform. Full commercial lifecycle.
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Pre-award adjudication through to post-award commercial management in a single structured workflow.
              </p>
            </div>

            <div className="relative">
              <div className="hidden lg:block absolute top-7 left-[calc(14.28%+1.5rem)] right-[calc(14.28%+1.5rem)] h-px bg-gradient-to-r from-blue-800/0 via-blue-700/50 to-blue-800/0" />

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                {[
                  { step: '01', label: 'Quote Import', sub: 'PDF & Excel', icon: Upload },
                  { step: '02', label: 'Review & Clean', sub: 'Classify & tag', icon: ClipboardList },
                  { step: '03', label: 'Scope Analysis', sub: 'Gap detection', icon: FileSearch },
                  { step: '04', label: 'Equalisation', sub: 'Fair comparison', icon: Scale },
                  { step: '05', label: 'Award', sub: 'Scored decision', icon: Award },
                  { step: '06', label: 'Contract', sub: 'SA 2017 ready', icon: FileText },
                  { step: '07', label: 'Post-Award Control', sub: 'Baseline & claims', icon: TrendingUp },
                ].map(({ step, label, sub, icon: Icon }) => (
                  <div key={step} className="flex flex-col items-center text-center group">
                    <div className="relative w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 group-hover:border-blue-600 group-hover:bg-blue-900/30 flex items-center justify-center mb-3 transition-all z-10">
                      <Icon className="text-slate-400 group-hover:text-blue-400 transition-colors" size={22} />
                    </div>
                    <span className="text-xs font-bold text-blue-500 mb-1 tracking-widest">{step}</span>
                    <p className="text-xs font-semibold text-slate-200 mb-0.5 leading-tight">{label}</p>
                    <p className="text-xs text-slate-500 leading-tight">{sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* OUTPUTS */}
        <section id="outputs" className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Outputs your team can actually use
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Every output is structured, exportable, and ready for stakeholders.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  icon: BarChart3,
                  color: 'text-blue-400',
                  title: 'Award Reports',
                  body: 'Weighted supplier scoring across commercial dimensions. Coverage breakdown, scope gap analysis with cost estimates, and recommendation rationale — in PDF and Excel.',
                },
                {
                  icon: Shield,
                  color: 'text-green-400',
                  title: 'Dispute Defence Pack',
                  body: 'A formal, timestamped procurement defence document capturing the full decision record, approval chain, risk identification, and commercial rationale.',
                },
                {
                  icon: FileSearch,
                  color: 'text-teal-400',
                  title: 'Itemised Comparison',
                  body: 'Line-by-line supplier comparison in Excel — quantity, unit of measure, unit rate, and total per tenderer. Colour-coded and client-ready.',
                },
                {
                  icon: FileText,
                  color: 'text-amber-400',
                  title: 'Schedule of Rates',
                  body: 'Structured rate schedule exports for each awarded supplier — ready for contract administration and variation management.',
                },
                {
                  icon: Briefcase,
                  color: 'text-orange-400',
                  title: 'Subcontract Agreement (SA 2017)',
                  body: 'Template-based SA 2017 subcontract form, auto-filled from project data. Completed field-by-field, versioned, and exportable as a PDF.',
                },
                {
                  icon: Download,
                  color: 'text-slate-300',
                  title: 'Commercial Exports',
                  body: 'Baseline tracker, VO tracker, tags and clarifications, SAFE classification audit, and baseline in internal and supplier-facing formats.',
                },
              ].map(({ icon: Icon, color, title, body }) => (
                <div
                  key={title}
                  className="bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 rounded-2xl p-7 transition-all"
                >
                  <Icon className={`${color} mb-4`} size={26} />
                  <h3 className="text-base font-bold text-white mb-2">{title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* DIFFERENTIATORS */}
        <section className="py-24 bg-slate-900/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                More than quote comparison
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                VerifyTrade is built for the full commercial lifecycle, not just price analysis.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  icon: BarChart3,
                  color: 'text-blue-400',
                  title: 'Structured Commercial Intelligence',
                  body: 'Scope gap detection, quantity alignment analysis, coverage scoring, and weighted evaluation — applied consistently to every tender package.',
                },
                {
                  icon: Shield,
                  color: 'text-green-400',
                  title: 'Defensible Decisions',
                  body: 'Formal approval gates, override tracking, and a complete audit trail. Every award decision is documented and retrievable.',
                },
                {
                  icon: Layers,
                  color: 'text-teal-400',
                  title: 'Trade-Specific Workflows',
                  body: 'Dedicated workflows for passive fire, plumbing, electrical, HVAC, and active fire. Each with trade-appropriate classification rules and system templates.',
                },
                {
                  icon: GitBranch,
                  color: 'text-orange-400',
                  title: 'End-to-End Continuity',
                  body: 'The data from quote adjudication flows directly into contract generation, baseline tracking, and post-award commercial management — no re-entry.',
                },
              ].map(({ icon: Icon, color, title, body }) => (
                <div
                  key={title}
                  className="bg-[#111827] border border-slate-800/60 rounded-2xl p-8 hover:border-slate-700 transition-all"
                >
                  <div className={`w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mb-5`}>
                    <Icon className={color} size={24} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-3">{title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WHO IT'S FOR */}
        <section id="who" className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Designed for the teams running complex projects
              </h2>
            </div>

            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Roles</p>
                <div className="space-y-3">
                  {[
                    { icon: Briefcase, label: 'Main Contractors', body: 'Manage trade procurement across multiple packages with consistency and accountability.' },
                    { icon: BarChart3, label: 'Quantity Surveyors', body: 'Produce structured award recommendations backed by commercial data, not gut feel.' },
                    { icon: TrendingUp, label: 'Estimators', body: 'Compare incoming quotes on equal terms before they reach the award stage.' },
                    { icon: Scale, label: 'Commercial Managers', body: 'Track commercial exposure from award through to final account in one place.' },
                    { icon: Users, label: 'Project Managers', body: 'Maintain visibility of scope, variations, and subcontractor performance post-award.' },
                  ].map(({ icon: Icon, label, body }) => (
                    <div key={label} className="flex items-start gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800/60 hover:border-slate-700 transition-all">
                      <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="text-slate-400" size={17} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-100 mb-0.5">{label}</p>
                        <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Supported Trades</p>
                <div className="space-y-3">
                  {[
                    { label: 'Passive Fire', desc: 'Penetration sealing, dampers, barriers — classified per FRL and substrate.' },
                    { label: 'Plumbing', desc: 'Hydraulic services, drainage, and sanitary — line items compared at quantity level.' },
                    { label: 'Electrical', desc: 'Power, lighting, and services — system templates applied per section.' },
                    { label: 'HVAC', desc: 'Mechanical services and ventilation packages adjudicated with full scope coverage analysis.' },
                    { label: 'Active Fire & Alarms', desc: 'Detection, suppression, and evacuation packages with compliance classification.' },
                  ].map(({ label, desc }, i) => (
                    <div key={label} className="flex items-start gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800/60 hover:border-slate-700 transition-all">
                      <div className="w-9 h-9 rounded-lg bg-blue-900/40 border border-blue-800/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-blue-400">{String(i + 1).padStart(2, '0')}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-100 mb-0.5">{label}</p>
                        <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COMMERCIAL IMPACT */}
        <section className="py-24 bg-slate-900/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                What changes when teams use VerifyTrade
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  icon: CheckCircle,
                  color: 'text-green-400',
                  title: 'Faster, more consistent quote evaluation',
                  body: 'A structured workflow replaces ad-hoc spreadsheet reviews. Every tender package follows the same adjudication process.',
                },
                {
                  icon: Shield,
                  color: 'text-blue-400',
                  title: 'Reduced risk of scope gaps and cost overruns',
                  body: 'Scope gaps are identified before award with estimated cost exposure flagged by severity — before they become post-award problems.',
                },
                {
                  icon: Award,
                  color: 'text-amber-400',
                  title: 'Clear, defensible award decisions',
                  body: 'Scored evaluation with formal approval tracking. When decisions are challenged, the record is complete and retrievable.',
                },
                {
                  icon: FileText,
                  color: 'text-teal-400',
                  title: 'Faster transition from award to contract',
                  body: 'SA 2017 subcontract agreements are auto-filled from award data. Contract generation starts immediately after award sign-off.',
                },
                {
                  icon: TrendingUp,
                  color: 'text-orange-400',
                  title: 'Ongoing visibility into post-award performance',
                  body: 'Baseline tracker, VO management, and payment claims give commercial managers visibility throughout the subcontract lifecycle.',
                },
                {
                  icon: Database,
                  color: 'text-slate-300',
                  title: 'A single source of commercial truth',
                  body: 'All project data — quotes, comparisons, awards, contracts, and claims — in one place, accessible to the whole team.',
                },
              ].map(({ icon: Icon, color, title, body }) => (
                <div key={title} className="bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 rounded-2xl p-7 transition-all">
                  <Icon className={`${color} mb-4`} size={24} />
                  <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* GOVERNANCE */}
        <section className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 text-xs font-semibold text-blue-300 bg-blue-900/30 rounded-full border border-blue-800/50 tracking-widest uppercase">
                  Commercial Accountability
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 leading-tight">
                  Built for commercial accountability
                </h2>
                <p className="text-slate-400 mb-8 leading-relaxed">
                  Every decision in VerifyTrade is structured, tracked, and exportable. When procurement processes are scrutinised, the record is complete.
                </p>
                <div className="space-y-4">
                  {[
                    { icon: CheckCircle, text: 'Approval workflows with mandatory sign-off and override tracking' },
                    { icon: FileSearch, text: 'Structured decision records with full rationale captured' },
                    { icon: Download, text: 'Exportable documentation for clients, principals, and stakeholders' },
                    { icon: Users, text: 'Organisational controls with team and user management' },
                    { icon: Lock, text: 'Data encrypted in transit and at rest — commercially sensitive information stays secure' },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-start gap-3">
                      <Icon className="text-blue-400 flex-shrink-0 mt-0.5" size={17} />
                      <p className="text-sm text-slate-300 leading-relaxed">{text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Award Reports', sub: 'PDF & Excel', icon: BarChart3, color: 'text-blue-400' },
                  { label: 'Dispute Defence Pack', sub: 'Formal procurement record', icon: Shield, color: 'text-green-400' },
                  { label: 'Approval Audit Trail', sub: 'Complete decision history', icon: ClipboardList, color: 'text-teal-400' },
                  { label: 'Subcontract Agreement', sub: 'SA 2017 ready', icon: FileText, color: 'text-amber-400' },
                  { label: 'Baseline Tracker', sub: '4 export formats', icon: TrendingUp, color: 'text-orange-400' },
                  { label: 'Tags & Clarifications', sub: 'Excel export', icon: Database, color: 'text-slate-300' },
                ].map(({ label, sub, icon: Icon, color }) => (
                  <div key={label} className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-5 hover:border-slate-700 transition-all">
                    <Icon className={`${color} mb-3`} size={20} />
                    <p className="text-xs font-semibold text-slate-100">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-28 bg-gradient-to-b from-slate-900/60 to-[#0b0f1a]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-5 leading-tight">
              Take control of your trade<br />procurement workflow
            </h2>
            <p className="text-lg text-slate-400 mb-10 leading-relaxed">
              Move from fragmented quote comparison to structured commercial decision-making.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              <button
                onClick={() => setShowDemoModal(true)}
                className="group px-8 py-4 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
              >
                Book a Demo
                <ArrowRight className="group-hover:translate-x-0.5 transition-transform" size={18} />
              </button>
              <a
                href="mailto:admin@verifytrade.co.nz"
                className="px-8 py-4 text-base font-semibold text-slate-300 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Mail size={17} />
                Talk to Us
              </a>
            </div>
            <p className="text-sm text-slate-600">
              No obligation. See how it works on real project data.
            </p>
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="bg-[#080b13] border-t border-slate-800/60 text-slate-500 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                  <Shield className="text-white" size={13} />
                </div>
                <span className="text-base font-bold text-slate-100">VerifyTrade</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">
                Commercial adjudication platform for trade packages.
              </p>
            </div>

            <div>
              <h4 className="text-slate-200 font-semibold mb-4 text-sm">Platform</h4>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#workflow" className="hover:text-slate-200 transition-colors">How It Works</a></li>
                <li><a href="#outputs" className="hover:text-slate-200 transition-colors">Outputs</a></li>
                <li><button onClick={onViewPricing} className="hover:text-slate-200 transition-colors text-left">Pricing</button></li>
                <li><a href="#who" className="hover:text-slate-200 transition-colors">Who It's For</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-slate-200 font-semibold mb-4 text-sm">Trades</h4>
              <ul className="space-y-2.5 text-sm">
                <li className="text-slate-500">Passive Fire</li>
                <li className="text-slate-500">Plumbing</li>
                <li className="text-slate-500">Electrical</li>
                <li className="text-slate-500">HVAC</li>
                <li className="text-slate-500">Active Fire & Alarms</li>
              </ul>
            </div>

            <div>
              <h4 className="text-slate-200 font-semibold mb-4 text-sm">Company</h4>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <a href="mailto:admin@verifytrade.co.nz" className="hover:text-slate-200 transition-colors">
                    admin@verifytrade.co.nz
                  </a>
                </li>
                <li>
                  <button onClick={() => setShowDemoModal(true)} className="hover:text-slate-200 transition-colors text-left">
                    Book a Demo
                  </button>
                </li>
                <li>
                  <button onClick={() => setShowPrivacyPolicy(true)} className="hover:text-slate-200 transition-colors text-left">
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button onClick={() => setShowTermsOfService(true)} className="hover:text-slate-200 transition-colors text-left">
                    Terms of Service
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800/60 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <p>&copy; {new Date().getFullYear()} VerifyTrade. All rights reserved.</p>
            <p className="text-slate-600">Built for construction teams across NZ & Australia.</p>
          </div>
        </div>
      </footer>

      <DemoBookingModal
        isOpen={showDemoModal}
        onClose={() => setShowDemoModal(false)}
      />
    </div>
  );
}
