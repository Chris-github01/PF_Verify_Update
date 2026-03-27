import { useEffect, useState } from 'react';
import { getScopeIntelligenceForRun } from '../../../lib/shadow/phase3/scopeIntelligenceService';
import type { ScopeIntelligenceResult } from '../../../lib/shadow/phase3/scopeIntelligenceService';

interface Props {
  runId: string;
}

const riskColor: Record<string, string> = {
  high: 'text-red-400 bg-red-950/40 border-red-800',
  medium: 'text-amber-400 bg-amber-950/40 border-amber-800',
  low: 'text-teal-400 bg-teal-950/40 border-teal-800',
};

export default function ScopeIntelligencePanel({ runId }: Props) {
  const [data, setData] = useState<ScopeIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'items' | 'gaps' | 'qualifications' | 'exclusions'>('gaps');

  useEffect(() => {
    getScopeIntelligenceForRun(runId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Loading scope intelligence...</div>;
  if (error) return <div className="text-red-400 text-sm py-4">{error}</div>;
  if (!data) return null;

  const hasAnyData =
    data.gaps.length > 0 ||
    data.exclusions.length > 0 ||
    data.qualifications.length > 0 ||
    data.items.length > 0;

  if (!hasAnyData) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-8 text-center">
        <div className="text-gray-500 text-sm">No scope intelligence data available for this run.</div>
        <div className="text-gray-600 text-xs mt-1">This is generated automatically when a shadow run completes.</div>
      </div>
    );
  }

  const sections: { id: typeof activeSection; label: string; count: number }[] = [
    { id: 'gaps', label: 'Scope Gaps', count: data.gaps.length },
    { id: 'exclusions', label: 'Exclusions', count: data.exclusions.length },
    { id: 'qualifications', label: 'Qualifications', count: data.qualifications.length },
    { id: 'items', label: 'Scope Items', count: data.items.length },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`rounded-xl border p-3 text-left transition-colors ${
              activeSection === s.id
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-gray-900 border-gray-800 hover:border-gray-700'
            }`}
          >
            <div className="text-lg font-bold text-white">{s.count}</div>
            <div className={`text-xs mt-0.5 ${activeSection === s.id ? 'text-amber-300' : 'text-gray-500'}`}>
              {s.label}
            </div>
          </button>
        ))}
      </div>

      {activeSection === 'gaps' && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400 mb-3">
            Scope gaps are missing work items that are typically expected in this trade.
          </div>
          {data.gaps.length === 0 ? (
            <div className="text-gray-600 text-sm text-center py-6">No scope gaps detected</div>
          ) : (
            data.gaps.map((gap, i) => (
              <div
                key={i}
                className={`rounded-xl border px-4 py-3 ${riskColor[gap.risk_level] ?? 'text-gray-400 bg-gray-900 border-gray-800'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{gap.description}</div>
                  <div className="text-xs uppercase tracking-wider opacity-70 shrink-0">{gap.risk_level}</div>
                </div>
                <div className="text-xs opacity-60 mt-1">
                  Type: {gap.missing_scope_type} · Expected: {gap.expected_presence.replace(/_/g, ' ')}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeSection === 'exclusions' && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400 mb-3">
            Exclusions are scope items explicitly excluded from this quote.
          </div>
          {data.exclusions.length === 0 ? (
            <div className="text-gray-600 text-sm text-center py-6">No exclusions detected</div>
          ) : (
            data.exclusions.map((ex, i) => (
              <div
                key={i}
                className={`rounded-xl border px-4 py-3 ${riskColor[ex.risk_level] ?? 'text-gray-400 bg-gray-900 border-gray-800'}`}
              >
                <div className="text-sm font-medium">{ex.description}</div>
                {ex.section && <div className="text-xs opacity-60 mt-1">Section: {ex.section}</div>}
                <div className="text-xs opacity-60 mt-0.5">Risk: {ex.risk_level}</div>
              </div>
            ))
          )}
        </div>
      )}

      {activeSection === 'qualifications' && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400 mb-3">
            Qualifications flag conditional or provisional scope items.
          </div>
          {data.qualifications.length === 0 ? (
            <div className="text-gray-600 text-sm text-center py-6">No qualifications detected</div>
          ) : (
            data.qualifications.map((q, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-gray-200">{q.description}</div>
                  <div className="text-xs text-amber-400 bg-amber-950/40 border border-amber-800/40 rounded px-2 py-0.5 shrink-0">
                    {q.impact_type.replace(/_/g, ' ')}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeSection === 'items' && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-400 mb-3">
            Classified scope items extracted from the parsed quote.
          </div>
          {data.items.length === 0 ? (
            <div className="text-gray-600 text-sm text-center py-6">No scope items extracted</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 pr-3 font-medium">Description</th>
                    <th className="text-left py-2 pr-3 font-medium">Type</th>
                    <th className="text-left py-2 pr-3 font-medium">Classification</th>
                    <th className="text-right py-2 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.slice(0, 100).map((item, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900">
                      <td className="py-1.5 pr-3 text-gray-300 max-w-xs truncate">{item.description}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{item.item_type}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{item.classification}</td>
                      <td className="py-1.5 text-right text-gray-400">
                        {item.total_value != null ? `$${item.total_value.toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.items.length > 100 && (
                <div className="text-gray-600 text-xs text-center mt-2">
                  Showing 100 of {data.items.length} items
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
