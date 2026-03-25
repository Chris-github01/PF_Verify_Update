import { Download, FileText, Table2 } from 'lucide-react';
import type { AggregatedMetrics, ExecutiveSummary, ReleaseConfidenceRecord } from '../../../lib/modules/parsers/plumbing/analytics/analyticsTypes';

interface PlumbingExecutiveExportPanelProps {
  summary: ExecutiveSummary;
  metrics: AggregatedMetrics | null;
  releaseRecord: ReleaseConfidenceRecord | null;
}

function nzd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function exportCSV(summary: ExecutiveSummary, metrics: AggregatedMetrics | null, release: ReleaseConfidenceRecord | null) {
  const rows: string[][] = [
    ['Metric', 'Value', 'Unit', 'Period'],
    ['Total Financial Risk Prevented', String(Math.round(summary.totalFinancialRiskPrevented)), 'NZD', summary.periodLabel],
    ['Total Impact Events', String(summary.totalImpactEvents), 'count', summary.periodLabel],
    ['Highest Single Risk Event', String(Math.round(summary.highestSingleRiskEvent)), 'NZD', 'all time'],
    ['Release Confidence Score', String(summary.currentConfidenceScore), 'score', 'current'],
    ['Release Verdict', summary.releaseVerdict, '', 'current'],
    ['Active Orgs at Risk', String(summary.activeOrgsAtRisk), 'count', summary.periodLabel],
    ['Review Backlog', String(summary.reviewBacklog), 'count', 'current'],
  ];
  if (metrics) {
    rows.push(['Anomaly Rate', metrics.anomalyRate.toFixed(2), '%', summary.periodLabel]);
    rows.push(['Duplicate Total Rate', metrics.duplicateTotalRate.toFixed(2), '%', summary.periodLabel]);
    rows.push(['Avg Risk Per Quote', Math.round(metrics.averageRiskPerQuote).toString(), 'NZD', summary.periodLabel]);
  }
  if (release) {
    rows.push(['Regression Pass Rate', release.regression_pass_rate.toFixed(2), '%', new Date(release.created_at).toLocaleDateString()]);
    rows.push(['Anomaly Rate (signal)', release.anomaly_rate.toFixed(2), '%', new Date(release.created_at).toLocaleDateString()]);
    rows.push(['Predictive Accuracy', release.predictive_accuracy.toFixed(2), '%', new Date(release.created_at).toLocaleDateString()]);
  }

  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plumbing_parser_executive_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTextReport(summary: ExecutiveSummary, release: ReleaseConfidenceRecord | null) {
  const lines = [
    '================================================',
    'PLUMBING PARSER — EXECUTIVE INTELLIGENCE REPORT',
    `Generated: ${new Date().toLocaleString()}`,
    `Period: ${summary.periodLabel}`,
    '================================================',
    '',
    'FINANCIAL IMPACT',
    `  Total Risk Prevented:     ${nzd(summary.totalFinancialRiskPrevented)}`,
    `  Total Impact Events:      ${summary.totalImpactEvents}`,
    `  Highest Single Risk:      ${nzd(summary.highestSingleRiskEvent)}`,
    '',
    'RELEASE CONFIDENCE',
    `  Verdict:                  ${summary.releaseVerdict}`,
    `  Confidence Score:         ${summary.currentConfidenceScore}/100`,
    release ? `  Regression Pass Rate:     ${release.regression_pass_rate.toFixed(1)}%` : '',
    release ? `  Anomaly Rate:             ${release.anomaly_rate.toFixed(1)}%` : '',
    release ? `  Predictive Accuracy:      ${release.predictive_accuracy.toFixed(1)}%` : '',
    '',
    'OPERATIONAL STATUS',
    `  Active Orgs at Risk:      ${summary.activeOrgsAtRisk}`,
    `  Review Backlog:           ${summary.reviewBacklog}`,
    '',
    'METHODOLOGY NOTE',
    '  All financial impact estimates are conservative and confidence-weighted.',
    '  Impact values are traceable to source run, anomaly, and review data.',
    '  No fabricated or assumed values are used.',
    '================================================',
  ].filter(Boolean);

  const text = lines.join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plumbing_parser_executive_report_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PlumbingExecutiveExportPanel({ summary, metrics, releaseRecord }: PlumbingExecutiveExportPanelProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Download className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-white">Export</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => exportCSV(summary, metrics, releaseRecord)}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-teal-500/50 hover:text-teal-300 transition-colors"
        >
          <Table2 className="w-3.5 h-3.5" />
          Export CSV
        </button>
        <button
          onClick={() => exportTextReport(summary, releaseRecord)}
          className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-teal-500/50 hover:text-teal-300 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          Export report (txt)
        </button>
      </div>
      <p className="text-[10px] text-gray-600 mt-3">
        All exported values are traceable to underlying run, anomaly, and review data. No assumed values are included.
      </p>
    </div>
  );
}
