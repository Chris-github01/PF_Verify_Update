import { TriangleAlert, TriangleAlert as AlertTriangle, DollarSign, ChartBar as BarChart2, CircleCheck as CheckCircle2, ChevronRight } from 'lucide-react';
import type { IntelligenceResult } from '../analysis/quoteIntelligence';

type Props = {
  result: IntelligenceResult;
};

interface SectionConfig {
  key: keyof Omit<IntelligenceResult, 'overallScore'>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  bg: string;
  border: string;
  dot: string;
  emptyText: string;
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'weaknesses',
    label: 'Weaknesses',
    icon: TriangleAlert,
    accent: 'text-red-400',
    bg: 'bg-red-500/8',
    border: 'border-red-500/20',
    dot: 'bg-red-400',
    emptyText: 'No weaknesses identified.',
  },
  {
    key: 'risks',
    label: 'Risks',
    icon: AlertTriangle,
    accent: 'text-orange-400',
    bg: 'bg-orange-500/8',
    border: 'border-orange-500/20',
    dot: 'bg-orange-400',
    emptyText: 'No risks identified.',
  },
  {
    key: 'pricingInsights',
    label: 'Pricing Insights',
    icon: DollarSign,
    accent: 'text-blue-400',
    bg: 'bg-blue-500/8',
    border: 'border-blue-500/20',
    dot: 'bg-blue-400',
    emptyText: 'No pricing issues detected.',
  },
  {
    key: 'coverageIssues',
    label: 'Coverage Issues',
    icon: BarChart2,
    accent: 'text-violet-400',
    bg: 'bg-violet-500/8',
    border: 'border-violet-500/20',
    dot: 'bg-violet-400',
    emptyText: 'No coverage gaps found.',
  },
  {
    key: 'recommendations',
    label: 'Recommendations',
    icon: CheckCircle2,
    accent: 'text-emerald-400',
    bg: 'bg-emerald-500/8',
    border: 'border-emerald-500/20',
    dot: 'bg-emerald-400',
    emptyText: 'No recommendations at this time.',
  },
];

function ScoreRing({ score }: { score: number }) {
  const color = score >= 70 ? '#34d399' : score >= 40 ? '#f59e0b' : '#f87171';
  const label = score >= 70 ? 'Competitive' : score >= 40 ? 'Needs Work' : 'High Risk';
  const circumference = 2 * Math.PI * 40;
  const dash = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle
            cx="50" cy="50" r="40"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white leading-none">{score}</span>
          <span className="text-[10px] text-slate-400 mt-0.5">/ 100</span>
        </div>
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

function Section({ config, items }: { config: SectionConfig; items: string[] }) {
  const Icon = config.icon;
  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} overflow-hidden`}>
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/5">
        <Icon className={`w-4 h-4 ${config.accent} flex-shrink-0`} />
        <span className={`font-semibold text-sm ${config.accent}`}>{config.label}</span>
        {items.length > 0 && (
          <span className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-current/10 ${config.accent}`}>
            {items.length}
          </span>
        )}
      </div>
      <div className="px-5 py-4">
        {items.length === 0 ? (
          <p className="text-slate-500 text-sm italic">{config.emptyText}</p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <ChevronRight className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${config.accent}`} />
                <span className="text-slate-300 text-sm leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function QuoteIntelligencePanel({ result }: Props) {
  const totalIssues = result.weaknesses.length + result.risks.length + result.coverageIssues.length;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-6 flex items-center gap-8">
        <ScoreRing score={result.overallScore} />
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-lg mb-1">Intelligence Report</h3>
          <p className="text-slate-400 text-sm leading-relaxed">
            {totalIssues === 0
              ? 'This quote appears well-structured with no major issues detected.'
              : `${totalIssues} issue${totalIssues !== 1 ? 's' : ''} detected across weaknesses, risks, and coverage. Review each section below.`}
          </p>
          <div className="flex items-center gap-4 mt-4">
            {[
              { label: 'Weaknesses', value: result.weaknesses.length, color: 'text-red-400' },
              { label: 'Risks', value: result.risks.length, color: 'text-orange-400' },
              { label: 'Coverage', value: result.coverageIssues.length, color: 'text-violet-400' },
              { label: 'Actions', value: result.recommendations.length, color: 'text-emerald-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-slate-500 text-xs">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {SECTIONS.map((config) => (
          <Section
            key={config.key}
            config={config}
            items={result[config.key] as string[]}
          />
        ))}
      </div>

      <p className="text-xs text-slate-600 font-mono text-center pt-1">
        [VERIFYTRADE NEXT] Advisory output only — no data written, no production logic affected.
      </p>
    </div>
  );
}
