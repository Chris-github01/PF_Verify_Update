import { ArrowLeft } from 'lucide-react';
import PlumbingRegressionFailureList from './PlumbingRegressionFailureList';
import type { CaseEvalResult, PassStatus } from '../../lib/modules/parsers/plumbing/regression/types';

interface Props {
  result: CaseEvalResult;
  onBack?: () => void;
}

const PASS_LABEL: Record<PassStatus, { label: string; color: string }> = {
  pass:           { label: 'PASS',     color: 'text-green-400' },
  fail_minor:     { label: 'MINOR',    color: 'text-amber-400' },
  fail_major:     { label: 'MAJOR',    color: 'text-orange-400' },
  fail_critical:  { label: 'CRITICAL', color: 'text-red-400' },
};

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;
}

export default function PlumbingRegressionCaseResultDetail({ result, onBack }: Props) {
  const pc = PASS_LABEL[result.passStatus];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">{result.caseLabel}</h2>
            <span className={`text-sm font-bold ${pc.color}`}>{pc.label}</span>
            {result.isMustPass && <span className="text-xs px-2 py-0.5 bg-amber-950/40 border border-amber-800/50 text-amber-400 rounded">MUST PASS</span>}
          </div>
          <div className="text-xs text-gray-600 font-mono mt-0.5">{result.sourceType}/{result.sourceId.slice(0, 20)}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { label: 'Live Parsed Total', value: fmt(result.liveOutput.parsedTotal) },
          { label: 'Shadow Parsed Total', value: fmt(result.shadowOutput.parsedTotal) },
          { label: 'Shadow Better', value: result.shadowBetterThanLive ? 'Yes' : 'No', color: result.shadowBetterThanLive ? 'text-green-400' : 'text-gray-400' },
          { label: 'Included Lines (Live)', value: String(result.liveOutput.includedLineCount) },
          { label: 'Included Lines (Shadow)', value: String(result.shadowOutput.includedLineCount) },
          { label: 'Classification Changes', value: String(result.metrics.classificationMismatchCount) },
        ].map((card) => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div className={`text-base font-bold tabular-nums ${card.color ?? 'text-white'}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Assertion Results (Shadow)</h3>
        <PlumbingRegressionFailureList assertions={result.assertionResults} showOnlyFailed={false} />
      </div>

      {result.failureReasons.length > 0 && (
        <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-400 mb-2">Failure Reasons</h3>
          <div className="space-y-1">
            {result.failureReasons.map((r, i) => (
              <div key={i} className="text-xs text-red-300">• {r}</div>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { title: 'Live Output Warnings', items: result.liveOutput.parserWarnings },
          { title: 'Shadow Output Warnings', items: result.shadowOutput.parserWarnings },
        ].map(({ title, items }) => (
          <div key={title} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-2">{title}</h3>
            {items.length === 0
              ? <span className="text-xs text-gray-600">None</span>
              : items.map((w, i) => <div key={i} className="text-xs text-amber-300/80">• {w}</div>)
            }
          </div>
        ))}
      </div>

      {result.shadowOutput.excludedSummaryPhrases.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-400 mb-2">Shadow Excluded Summary Phrases</h3>
          <div className="flex flex-wrap gap-2">
            {result.shadowOutput.excludedSummaryPhrases.map((p, i) => (
              <span key={i} className="text-xs px-2 py-0.5 bg-red-950/30 border border-red-800/40 text-red-300 rounded font-mono">{p}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
