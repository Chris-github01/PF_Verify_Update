import { useEffect, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, XCircle,
  TrendingDown, CheckCircle2, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getOrGenerateSummary, generateQuoteIntelligenceSummary } from '../../lib/phase6/quoteSummaryEngine';
import type { QuoteIntelligenceSummary, QuoteIssue } from '../../lib/phase6/quoteSummaryEngine';

interface Props {
  runId: string;
  moduleKey: string;
}

function RiskBadge({ level }: { level: string }) {
  const configs = {
    low: { bg: 'bg-teal-500/15 border-teal-500/30', text: 'text-teal-300', icon: ShieldCheck, label: 'LOW RISK' },
    medium: { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-300', icon: AlertTriangle, label: 'MEDIUM RISK' },
    high: { bg: 'bg-orange-500/15 border-orange-500/30', text: 'text-orange-300', icon: ShieldAlert, label: 'HIGH RISK' },
    critical: { bg: 'bg-red-500/15 border-red-500/30', text: 'text-red-300', icon: XCircle, label: 'CRITICAL RISK' },
  };
  const c = configs[level as keyof typeof configs] ?? configs.low;
  const Icon = c.icon;
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${c.bg}`}>
      <Icon className={`w-4 h-4 ${c.text}`} />
      <span className={`text-xs font-bold tracking-widest ${c.text}`}>{c.label}</span>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const map = {
    critical: 'bg-red-400',
    high: 'bg-orange-400',
    medium: 'bg-amber-400',
    low: 'bg-teal-400',
  };
  return <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${map[severity as keyof typeof map] ?? 'bg-gray-500'}`} />;
}

function formatImpact(v: number | null): string {
  if (v === null) return '';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v.toLocaleString()}`;
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'bg-teal-400' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500">{pct}%</span>
    </div>
  );
}

export default function QuoteIntelligenceSummaryPanel({ runId, moduleKey }: Props) {
  const [summary, setSummary] = useState<QuoteIntelligenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStrengths, setShowStrengths] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    load();
  }, [runId]);

  async function load() {
    setLoading(true);
    const data = await getOrGenerateSummary(runId, moduleKey);
    setSummary(data);
    setLoading(false);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    const data = await generateQuoteIntelligenceSummary(runId, moduleKey);
    setSummary(data);
    setRegenerating(false);
  }

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Generating intelligence summary...
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm text-gray-500">
        No intelligence summary available for this run.
      </div>
    );
  }

  const issues = summary.key_issues_json as QuoteIssue[];
  const strengths = summary.key_strengths_json as string[];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Quote Intelligence Summary</div>
            <div className="text-xs text-gray-500">Phase 6 — aggregated from all intelligence layers</div>
          </div>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex items-start gap-4 flex-wrap">
          <RiskBadge level={summary.overall_risk_level} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white leading-relaxed">
              {summary.recommendation_text}
            </div>
          </div>
        </div>

        {issues.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Key Issues</span>
            </div>
            <div className="space-y-2">
              {issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2.5 bg-gray-800/60 rounded-lg">
                  <SeverityDot severity={issue.severity} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-200">{issue.label}</span>
                  </div>
                  {issue.financial_impact !== null && (
                    <span className="text-xs font-mono text-red-400 flex-shrink-0">
                      {formatImpact(issue.financial_impact)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {strengths.length > 0 && (
          <div>
            <button
              onClick={() => setShowStrengths(!showStrengths)}
              className="flex items-center gap-2 text-xs text-teal-400 hover:text-teal-300 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{strengths.length} strength{strengths.length !== 1 ? 's' : ''} identified</span>
              {showStrengths ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showStrengths && (
              <div className="mt-2 space-y-1.5">
                {strengths.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-teal-500/5 border border-teal-500/15 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                    <span className="text-xs text-teal-300">{s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="pt-1 border-t border-gray-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Summary confidence</span>
            <span className="text-xs text-gray-400">Risk score: {summary.overall_risk_score}/100</span>
          </div>
          <ConfidenceBar score={summary.confidence_score} />
        </div>
      </div>
    </div>
  );
}
