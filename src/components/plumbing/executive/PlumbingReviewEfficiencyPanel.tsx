import { Clock, CheckCircle2, AlertTriangle, PieChart } from 'lucide-react';
import type { ReviewEfficiencyMetrics } from '../../../lib/modules/parsers/plumbing/analytics/analyticsTypes';

interface PlumbingReviewEfficiencyPanelProps {
  metrics: ReviewEfficiencyMetrics;
}

const DECISION_LABELS: Record<string, string> = {
  confirm_shadow_better:           'Shadow better',
  confirm_live_better:             'Live correct',
  needs_rule_change:               'Rule change',
  needs_manual_correction_pattern: 'Pattern fix',
  false_positive_alert:            'False positive',
  false_negative_alert:            'False negative',
  escalate:                        'Escalated',
  dismiss:                         'Dismissed',
};

export default function PlumbingReviewEfficiencyPanel({ metrics }: PlumbingReviewEfficiencyPanelProps) {
  const totalDecisions = Object.values(metrics.decisionDistribution).reduce((s, v) => s + v, 0);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <PieChart className="w-4 h-4 text-gray-400" />
          Review Efficiency
        </h2>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox
            icon={Clock}
            label="Avg turnaround"
            value={metrics.avgTurnaroundHours != null ? `${metrics.avgTurnaroundHours.toFixed(1)}h` : 'N/A'}
            color="text-white"
          />
          <StatBox
            icon={CheckCircle2}
            label="SLA compliance"
            value={`${metrics.slaComplianceRate.toFixed(1)}%`}
            color={metrics.slaComplianceRate >= 90 ? 'text-teal-300' : metrics.slaComplianceRate >= 70 ? 'text-amber-300' : 'text-red-300'}
          />
          <StatBox
            icon={AlertTriangle}
            label="Overdue rate"
            value={`${metrics.overdueRate.toFixed(1)}%`}
            color={metrics.overdueRate <= 5 ? 'text-teal-300' : metrics.overdueRate <= 15 ? 'text-amber-300' : 'text-red-300'}
          />
          <StatBox
            icon={CheckCircle2}
            label="Correction rate"
            value={`${metrics.correctionEffectivenessRate.toFixed(1)}%`}
            color="text-cyan-300"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-teal-600 rounded-full transition-all"
              style={{ width: `${metrics.slaComplianceRate}%` }} />
          </div>
          <span className="text-[10px] text-gray-500 shrink-0">Backlog: {metrics.backlogSize}</span>
        </div>

        {totalDecisions > 0 && (
          <div>
            <div className="text-[10px] text-gray-500 mb-2">Decision distribution ({totalDecisions} total)</div>
            <div className="space-y-1.5">
              {Object.entries(metrics.decisionDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-36 shrink-0">{DECISION_LABELS[type] ?? type}</span>
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-600 rounded-full"
                        style={{ width: `${(count / totalDecisions) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500 w-6 text-right">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-3">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-gray-500" />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
