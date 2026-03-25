import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, RefreshCw, AlertOctagon, Clock, CheckCircle2, Users, Sparkles } from 'lucide-react';
import ShadowGuard from '../../components/shadow/ShadowGuard';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import PlumbingReviewQueueTable from '../../components/plumbing/review/PlumbingReviewQueueTable';
import PlumbingReviewerWorkloadTable from '../../components/plumbing/review/PlumbingReviewerWorkloadTable';
import PlumbingReviewFeedbackPanel from '../../components/plumbing/review/PlumbingReviewFeedbackPanel';
import PlumbingCorrectionPatternList from '../../components/plumbing/review/PlumbingCorrectionPatternList';
import {
  dbGetReviewCases,
  dbGetReviewMetrics,
  dbGetFeedback,
} from '../../lib/db/reviewOpsDb';
import type {
  ReviewCase,
  ReviewMetrics,
  ReviewFeedback,
  DecisionType,
} from '../../lib/modules/parsers/plumbing/review/reviewTypes';

type Tab = 'queue' | 'workload' | 'feedback' | 'corrections';

const DECISION_LABELS: Partial<Record<DecisionType, string>> = {
  confirm_shadow_better: 'Shadow better',
  confirm_live_better:   'Live correct',
  needs_rule_change:     'Rule change',
  needs_manual_correction_pattern: 'Pattern fix',
  false_positive_alert:  'False positive',
  false_negative_alert:  'False negative',
  escalate:              'Escalated',
  dismiss:               'Dismissed',
};

export default function PlumbingReviewDashboard() {
  const [tab, setTab] = useState<Tab>('queue');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cases, setCases] = useState<ReviewCase[]>([]);
  const [metrics, setMetrics] = useState<ReviewMetrics | null>(null);
  const [feedback, setFeedback] = useState<ReviewFeedback[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const OPEN_STATUSES = ['new', 'queued', 'assigned', 'in_review', 'awaiting_approval'] as const;

  const load = useCallback(async () => {
    const [casesData, metricsData, feedbackData] = await Promise.all([
      dbGetReviewCases({ status: [...OPEN_STATUSES], limit: 300 }),
      dbGetReviewMetrics(),
      dbGetFeedback(),
    ]);
    setCases(casesData);
    setMetrics(metricsData);
    setFeedback(feedbackData);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function handleSelectCase(id: string) {
    window.location.hash = `/shadow/modules/plumbing_parser/review/cases/${id}`;
    setSelectedCaseId(id);
  }

  if (selectedCaseId) {
    window.location.pathname = `/shadow/modules/plumbing_parser/review/cases/${selectedCaseId}`;
    return null;
  }

  if (loading) {
    return (
      <ShadowGuard>
        <ShadowLayout>
          <div className="text-center py-16 text-sm text-gray-500">Loading review operations...</div>
        </ShadowLayout>
      </ShadowGuard>
    );
  }

  const decisionEntries = Object.entries(metrics?.decisionDistribution ?? {}) as [DecisionType, number][];

  return (
    <ShadowGuard>
      <ShadowLayout>
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-teal-400" />
                Review Operations — plumbing_parser
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Human-in-the-loop review governance. No live parser changes without explicit approval.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-white border border-gray-700 bg-gray-900 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Metrics strip */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <MetricCard icon={ClipboardList} label="Open" value={metrics.openCases} color="text-white" />
              <MetricCard icon={AlertOctagon} label="Critical" value={metrics.criticalCases} color="text-red-300" highlight={metrics.criticalCases > 0} />
              <MetricCard icon={Clock} label="Overdue" value={metrics.overdueCases} color="text-orange-300" highlight={metrics.overdueCases > 0} />
              <MetricCard icon={CheckCircle2} label="Completed" value={metrics.completedCases} color="text-teal-300" />
              <MetricCard icon={Sparkles} label="Feedback" value={metrics.feedbackGenerated} color="text-cyan-300" />
              <MetricCard icon={Users} label="Regression candidates" value={metrics.regressionCandidates} color="text-amber-300" />
            </div>
          )}

          {/* Priority & origin breakdown */}
          {metrics && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs font-semibold text-white mb-3">Cases by priority</div>
                <div className="space-y-2">
                  {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
                    <div key={p} className="flex items-center gap-2">
                      <span className={`text-[10px] capitalize w-14 ${p === 'critical' ? 'text-red-400' : p === 'high' ? 'text-orange-400' : p === 'medium' ? 'text-amber-400' : 'text-gray-500'}`}>{p}</span>
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${p === 'critical' ? 'bg-red-600' : p === 'high' ? 'bg-orange-600' : p === 'medium' ? 'bg-amber-600' : 'bg-gray-600'}`}
                          style={{ width: metrics.totalCases > 0 ? `${((metrics.casesByPriority[p] ?? 0) / metrics.totalCases) * 100}%` : '0%' }} />
                      </div>
                      <span className="text-[10px] text-gray-500 tabular-nums w-5">{metrics.casesByPriority[p] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs font-semibold text-white mb-3">Decision distribution</div>
                {decisionEntries.length === 0 ? (
                  <div className="text-xs text-gray-600 text-center py-2">No decisions recorded yet</div>
                ) : (
                  <div className="space-y-1.5">
                    {decisionEntries.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">{DECISION_LABELS[type] ?? type}</span>
                        <span className="font-bold text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-1 gap-1">
            {([
              { key: 'queue' as Tab, label: 'Queue' },
              { key: 'workload' as Tab, label: 'Workload' },
              { key: 'feedback' as Tab, label: 'Feedback' },
              { key: 'corrections' as Tab, label: 'Corrections' },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 text-xs px-3 py-2 rounded-lg transition-colors ${
                  tab === t.key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'queue' && (
            <PlumbingReviewQueueTable cases={cases} onSelectCase={handleSelectCase} />
          )}

          {tab === 'workload' && (
            <PlumbingReviewerWorkloadTable cases={cases} assignments={[]} />
          )}

          {tab === 'feedback' && (
            <PlumbingReviewFeedbackPanel feedback={feedback} />
          )}

          {tab === 'corrections' && (
            <PlumbingCorrectionPatternList feedback={feedback} />
          )}

          <div className="flex items-center gap-4 text-xs pt-2 border-t border-gray-800">
            <a href="/shadow/modules/plumbing_parser/predictive" className="text-cyan-400 hover:text-cyan-300 transition-colors">
              Predictive intelligence →
            </a>
            <a href="/shadow/modules/plumbing_parser/learning" className="text-amber-400 hover:text-amber-300 transition-colors">
              Learning system →
            </a>
            <a href="/shadow/modules/plumbing_parser" className="text-gray-400 hover:text-white transition-colors">
              Module overview →
            </a>
          </div>
        </div>
      </ShadowLayout>
    </ShadowGuard>
  );
}

function MetricCard({ icon: Icon, label, value, color, highlight }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-gray-900 border ${highlight ? 'border-red-800/50' : 'border-gray-800'} rounded-xl px-4 py-3`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
