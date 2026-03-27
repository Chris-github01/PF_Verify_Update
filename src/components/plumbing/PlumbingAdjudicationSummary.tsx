import { FileText, Copy, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import type { PlumbingDiff, RecommendedOutcome } from '../../types/plumbingDiscrepancy';

interface Props {
  diff: PlumbingDiff;
}

const OUTCOME_CONFIG: Record<RecommendedOutcome, { label: string; color: string; bg: string }> = {
  shadow_better:     { label: 'Shadow Better',      color: 'text-green-400',  bg: 'bg-green-950/30 border-green-800' },
  needs_review:      { label: 'Needs Review',       color: 'text-amber-400',  bg: 'bg-amber-950/30 border-amber-800' },
  live_better:       { label: 'Live Better',        color: 'text-red-400',    bg: 'bg-red-950/30 border-red-800' },
  inconclusive:      { label: 'Inconclusive',       color: 'text-gray-400',   bg: 'bg-gray-800/50 border-gray-700' },
  systemic_failure:  { label: 'Systemic Failure',   color: 'text-red-400',    bg: 'bg-red-950/40 border-red-700' },
};

export default function PlumbingAdjudicationSummary({ diff }: Props) {
  const [copied, setCopied] = useState(false);
  const outcome = OUTCOME_CONFIG[diff.recommendedOutcome];

  async function copyText() {
    await navigator.clipboard.writeText(diff.adjudicationSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const lines = diff.adjudicationSummary.split('\n');

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-white">Adjudication Summary</h3>
          <span className="text-xs text-gray-600">admin-only</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${outcome.bg} ${outcome.color}`}>
            {outcome.label}
          </span>
          <button
            onClick={copyText}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors"
          >
            {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 font-mono text-xs leading-relaxed space-y-1">
          {lines.map((line, i) => {
            if (line.startsWith('PLUMBING PARSER')) {
              return <div key={i} className="text-amber-400 font-bold text-[11px] tracking-wider">{line}</div>;
            }
            if (line.startsWith('⚠ SYSTEMIC FAILURE')) {
              return <div key={i} className="text-red-400 font-bold">{line}</div>;
            }
            if (line.startsWith('FINDING:') || line.startsWith('LIKELY ROOT CAUSE:')) {
              return <div key={i} className="text-cyan-300">{line}</div>;
            }
            if (line.startsWith('Do not promote') || line.startsWith('Recommended action:')) {
              return <div key={i} className="text-orange-300 italic">{line}</div>;
            }
            if (line.startsWith('Recommended outcome:')) {
              return <div key={i} className={`font-bold ${outcome.color}`}>{line}</div>;
            }
            if (line.startsWith('Shadow parser appears') || line.startsWith('Live parser performs') || line.startsWith('Insufficient evidence') || line.startsWith('Manual review') || line.startsWith('Parser logic is likely')) {
              return <div key={i} className="text-gray-300 italic">{line}</div>;
            }
            if (line === '') {
              return <div key={i} className="h-2" />;
            }
            if (line.startsWith('Active risk flags')) {
              return <div key={i} className="text-orange-400 font-medium mt-1">{line}</div>;
            }
            if (line.startsWith('  -')) {
              return <div key={i} className="text-orange-300/80 pl-2">{line}</div>;
            }
            return <div key={i} className="text-gray-400">{line}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
