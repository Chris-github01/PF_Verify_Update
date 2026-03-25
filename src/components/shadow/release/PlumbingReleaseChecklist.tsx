import { CheckCircle2, XCircle, Zap, RefreshCw } from 'lucide-react';
import type { ChecklistEvalResult } from '../../../lib/modules/release/checklistEvaluator';
import { CHECKLIST_ITEM_DEFS } from '../../../lib/modules/release/checklistEvaluator';
import type { ChecklistItemDef } from '../../../types/shadow';

const CATEGORY_LABELS: Record<string, string> = {
  regression: 'Regression',
  anomaly: 'Anomaly Health',
  approval: 'Approval',
  beta_coverage: 'Beta Coverage',
  manual: 'Manual',
};

const CATEGORY_ORDER = ['regression', 'anomaly', 'beta_coverage', 'approval', 'manual'];

interface PlumbingReleaseChecklistProps {
  result: ChecklistEvalResult | null;
  onRefresh: () => void;
  loading?: boolean;
}

export default function PlumbingReleaseChecklist({
  result,
  onRefresh,
  loading = false,
}: PlumbingReleaseChecklistProps) {
  const grouped = CATEGORY_ORDER.reduce<Record<string, Array<ChecklistItemDef & { result?: ChecklistEvalResult['items'][0]['result'] }>>>((acc, cat) => {
    acc[cat] = CHECKLIST_ITEM_DEFS
      .filter((d) => d.category === cat)
      .map((def) => {
        const found = result?.items.find((i) => i.key === def.key);
        return { ...def, result: found?.result };
      });
    return acc;
  }, {} as Record<string, Array<ChecklistItemDef & { result?: ChecklistEvalResult['items'][0]['result'] }>>);

  const statusColors = {
    ready: 'text-teal-300 bg-teal-500/10 border-teal-500/30',
    blocked: 'text-red-300 bg-red-500/10 border-red-500/30',
    incomplete: 'text-gray-400 bg-gray-800 border-gray-700',
  };

  const currentStatus = result?.status ?? 'incomplete';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Release Checklist</h2>
          {result && (
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${statusColors[currentStatus]}`}>
              {currentStatus === 'ready' ? 'READY' : currentStatus === 'blocked' ? `BLOCKED (${result.blockedReasons.length})` : 'INCOMPLETE'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {result && (
            <span className="text-xs text-gray-500">
              {result.passCount}/{result.totalRequired} required passed
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Re-evaluate
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat] ?? [];
          return (
            <div key={cat}>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-2.5">
                {CATEGORY_LABELS[cat] ?? cat}
              </div>
              <div className="space-y-1.5">
                {items.map((item) => {
                  const r = item.result;
                  const passed = r?.passed ?? false;
                  const evaluated = r != null;

                  return (
                    <div
                      key={item.key}
                      className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors ${
                        !evaluated
                          ? 'border-gray-800 bg-gray-900/50'
                          : passed
                            ? 'border-teal-500/20 bg-teal-500/5'
                            : item.required
                              ? 'border-red-500/20 bg-red-500/5'
                              : 'border-amber-500/20 bg-amber-500/5'
                      }`}
                    >
                      <div className="shrink-0 mt-0.5">
                        {!evaluated ? (
                          <div className="w-4 h-4 rounded-full border border-gray-700" />
                        ) : passed ? (
                          <CheckCircle2 className="w-4 h-4 text-teal-400" />
                        ) : item.required ? (
                          <XCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <Zap className="w-4 h-4 text-amber-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${
                            !evaluated ? 'text-gray-500'
                            : passed ? 'text-white'
                            : item.required ? 'text-red-300'
                            : 'text-amber-300'
                          }`}>
                            {item.label}
                          </span>
                          {item.required && (
                            <span className="text-[9px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">required</span>
                          )}
                          {r?.auto === false && (
                            <span className="text-[9px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">manual</span>
                          )}
                        </div>
                        {r?.notes && (
                          <div className="text-[10px] text-gray-500 mt-0.5">{r.notes}</div>
                        )}
                        {!r && (
                          <div className="text-[10px] text-gray-600 mt-0.5">{item.description}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
