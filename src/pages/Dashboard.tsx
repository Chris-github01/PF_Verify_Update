import { Link } from 'react-router-dom';
import { FlaskConical, ShieldCheck, ArrowRight, Cpu, Eye, GitBranch } from 'lucide-react';

const devFeatures = [
  {
    icon: Cpu,
    title: 'Quote Intelligence',
    description: 'Read-only analysis layer. Detects scope gaps, cost anomalies, and subcontractor weaknesses using experimental logic.',
    to: '/dev/quote-intelligence',
    badge: 'DEV',
  },
];

const principles = [
  { icon: ShieldCheck, text: 'No writes to production database' },
  { icon: Eye, text: 'Read-only analysis — no data mutation' },
  { icon: GitBranch, text: 'Fully isolated from live VerifyTrade system' },
];

export default function Dashboard() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
          <FlaskConical className="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            VerifyTrade <span className="text-amber-400">Next</span>
          </h1>
          <p className="text-slate-400 mt-1 text-base">
            Experimental development environment. Build and test new features in complete isolation from the live system.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        {principles.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/60 rounded-xl p-4">
            <Icon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span className="text-slate-300 text-sm">{text}</span>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
          Dev Features
        </h2>
        <div className="grid grid-cols-1 gap-4">
          {devFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.to}
                to={feature.to}
                className="group flex items-center gap-5 bg-slate-800/60 border border-slate-700/60 hover:border-amber-500/40 hover:bg-slate-800 rounded-xl p-5 transition-all duration-200"
              >
                <div className="w-11 h-11 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-semibold">{feature.title}</span>
                    <span className="inline-block bg-amber-500/20 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wider">
                      {feature.badge}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm">{feature.description}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-amber-400 transition-colors flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
        <p className="text-xs text-slate-500 font-mono">
          [VERIFYTRADE NEXT] — Isolated development fork. This environment does not share state, data, or services with the production VerifyTrade system.
        </p>
      </div>
    </div>
  );
}
