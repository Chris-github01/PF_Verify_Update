import { useState } from 'react';
import { Tag, CheckCircle2, Circle, Layers } from 'lucide-react';
import type { RuleVersionRecord } from '../../../lib/modules/parsers/plumbing/learning/learningTypes';
import { dbSetActiveShadowRuleVersion } from '../../../lib/db/learningDb';

interface PlumbingRuleVersionTableProps {
  versions: RuleVersionRecord[];
  onRefresh: () => void;
  onSelectForComparison?: (a: RuleVersionRecord, b: RuleVersionRecord) => void;
}

export default function PlumbingRuleVersionTable({
  versions,
  onRefresh,
  onSelectForComparison,
}: PlumbingRuleVersionTableProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [settingActive, setSettingActive] = useState<string | null>(null);

  async function handleSetActive(versionId: string) {
    setSettingActive(versionId);
    try {
      await dbSetActiveShadowRuleVersion(versionId);
      onRefresh();
    } finally {
      setSettingActive(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev.slice(-1), id]
    );
  }

  function handleCompare() {
    if (selected.length !== 2 || !onSelectForComparison) return;
    const a = versions.find((v) => v.id === selected[0])!;
    const b = versions.find((v) => v.id === selected[1])!;
    onSelectForComparison(a, b);
  }

  if (versions.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No rule versions created yet. Use the rule editor to create the first version.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Layers className="w-4 h-4 text-gray-500" />
          Rule Versions ({versions.length})
        </h2>
        {selected.length === 2 && onSelectForComparison && (
          <button
            onClick={handleCompare}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-cyan-800 hover:bg-cyan-700 text-white transition-colors"
          >
            Compare selected
          </button>
        )}
        {selected.length === 1 && (
          <span className="text-[10px] text-gray-500">Select 1 more to compare</span>
        )}
      </div>

      <div className="divide-y divide-gray-800">
        {versions.map((v) => {
          const isSelected = selected.includes(v.id);
          return (
            <div
              key={v.id}
              className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${isSelected ? 'bg-gray-800/60' : 'hover:bg-gray-800/30'}`}
            >
              <button onClick={() => toggleSelect(v.id)} className="text-gray-600 hover:text-white transition-colors shrink-0">
                {isSelected ? <CheckCircle2 className="w-4 h-4 text-cyan-400" /> : <Circle className="w-4 h-4" />}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                  <span className="text-sm font-medium text-white">{v.label || v.version}</span>
                  {v.is_active_shadow && (
                    <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      ACTIVE SHADOW
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-600 font-mono mt-0.5">{v.version}</div>
                {v.notes && <div className="text-[10px] text-gray-500 mt-0.5 italic">{v.notes}</div>}
              </div>

              <div className="flex items-center gap-4 shrink-0 text-right">
                {v.regression_pass_rate != null ? (
                  <div>
                    <div className={`text-sm font-bold tabular-nums ${v.regression_pass_rate >= 0.90 ? 'text-teal-400' : v.regression_pass_rate >= 0.75 ? 'text-amber-400' : 'text-red-400'}`}>
                      {(v.regression_pass_rate * 100).toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-gray-500">pass rate</div>
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-600">Not tested</div>
                )}

                <div className="text-[10px] text-gray-600">
                  {new Date(v.created_at).toLocaleDateString()}
                </div>

                {!v.is_active_shadow && (
                  <button
                    onClick={() => handleSetActive(v.id)}
                    disabled={settingActive === v.id}
                    className="text-[10px] font-medium px-3 py-1.5 rounded-lg border border-gray-700 hover:border-cyan-500/50 hover:text-cyan-300 text-gray-400 transition-colors disabled:opacity-40"
                  >
                    Set as shadow
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
