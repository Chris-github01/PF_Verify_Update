import type { SuiteRunSummary } from '../../lib/modules/parsers/plumbing/regression/types';

interface Props {
  summary: Pick<SuiteRunSummary,
    | 'casesTotal' | 'casesPassed' | 'casesFailedMinor'
    | 'casesFailedMajor' | 'casesFailedCritical'
    | 'mustPassCasesFailed' | 'shadowBetterCount' | 'liveBetterCount' | 'inconclusiveCount'
  >;
}

export default function PlumbingRegressionSummaryCards({ summary }: Props) {
  const passRate = summary.casesTotal > 0
    ? ((summary.casesPassed / summary.casesTotal) * 100).toFixed(1)
    : '—';
  const shadowBetterRate = summary.casesTotal > 0
    ? ((summary.shadowBetterCount / summary.casesTotal) * 100).toFixed(1)
    : '—';

  const cards = [
    { label: 'Total Cases', value: String(summary.casesTotal), color: 'text-white' },
    { label: 'Passed', value: String(summary.casesPassed), sub: `${passRate}% pass rate`, color: 'text-green-400' },
    { label: 'Minor Failures', value: String(summary.casesFailedMinor), color: summary.casesFailedMinor > 0 ? 'text-amber-400' : 'text-gray-500' },
    { label: 'Major Failures', value: String(summary.casesFailedMajor), color: summary.casesFailedMajor > 0 ? 'text-orange-400' : 'text-gray-500' },
    { label: 'Critical Failures', value: String(summary.casesFailedCritical), color: summary.casesFailedCritical > 0 ? 'text-red-400' : 'text-gray-500' },
    { label: 'Must-Pass Failed', value: String(summary.mustPassCasesFailed), color: summary.mustPassCasesFailed > 0 ? 'text-red-400 font-bold' : 'text-gray-500' },
    { label: 'Shadow Better', value: String(summary.shadowBetterCount), sub: `${shadowBetterRate}% of cases`, color: 'text-cyan-400' },
    { label: 'Live Better', value: String(summary.liveBetterCount), color: summary.liveBetterCount > 0 ? 'text-amber-400' : 'text-gray-500' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {cards.map((c) => (
        <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <div className="text-[10px] text-gray-500 mb-1 leading-tight">{c.label}</div>
          <div className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</div>
          {c.sub && <div className="text-[10px] text-gray-600 mt-0.5">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}
