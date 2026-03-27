import { useEffect, useState } from 'react';
import { getRevenueLeakageForRun } from '../../../lib/shadow/phase3/revenueLeakageService';
import type { RevenueLeakageSummary, ShadowRevenueLeakageEvent } from '../../../lib/shadow/phase3/revenueLeakageService';

interface Props {
  runId: string;
}

function leakageTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    total_mismatch: 'Total Mismatch',
    under_priced_rate: 'Under-Priced Rate',
    over_priced_rate: 'Over-Priced Rate',
    scope_gap: 'Scope Gap',
    excluded_scope: 'Excluded Scope',
    high_provisional_sum_density: 'High Provisional Density',
  };
  return labels[type] ?? type.replace(/_/g, ' ');
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-red-400';
  if (confidence >= 0.6) return 'text-amber-400';
  return 'text-gray-500';
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    document_truth: 'Document Truth',
    rate: 'Rate Analysis',
    scope: 'Scope Analysis',
    failure: 'Parser Failure',
    parser_comparison: 'Parser',
    rate_intelligence: 'Rate Analysis',
    scope_intelligence: 'Scope Analysis',
  };
  return labels[source] ?? source;
}

function EventCard({ event }: { event: ShadowRevenueLeakageEvent }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {leakageTypeLabel(event.leakage_type)}
          </div>
          <div className="text-sm text-gray-200 mt-0.5">{event.description}</div>
        </div>
        <div className="text-right shrink-0">
          {event.estimated_value != null && event.estimated_value > 0 && (
            <div className="text-sm font-semibold text-red-400">
              ${event.estimated_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          )}
          <div className={`text-xs ${confidenceColor(event.confidence)}`}>
            {Math.round(event.confidence * 100)}% conf.
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-600">
        <span>Source: {sourceLabel(event.source)}</span>
        {event.reference_id && (
          <span className="font-mono text-gray-700">ref: {event.reference_id.slice(0, 8)}</span>
        )}
      </div>
    </div>
  );
}

export default function RevenueLeakagePanel({ runId }: Props) {
  const [data, setData] = useState<RevenueLeakageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRevenueLeakageForRun(runId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) return <div className="text-gray-500 text-sm py-8 text-center">Loading leakage analysis...</div>;
  if (error) return <div className="text-red-400 text-sm py-4">{error}</div>;
  if (!data || data.events.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-8 text-center">
        <div className="text-teal-400 text-sm font-medium">No revenue leakage events detected</div>
        <div className="text-gray-600 text-xs mt-1">This run passed commercial risk checks with no leakage signals.</div>
      </div>
    );
  }

  const typeEntries = Object.entries(data.leakageByType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className={`rounded-xl border p-4 ${data.events.length > 0 ? 'bg-red-950/30 border-red-800' : 'bg-gray-900 border-gray-800'}`}>
          <div className={`text-lg font-bold ${data.events.length > 0 ? 'text-red-400' : 'text-white'}`}>
            {data.events.length}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Leakage Events</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-lg font-bold text-white">
            {data.totalEstimatedLeakage > 0
              ? `$${data.totalEstimatedLeakage.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Est. Total Leakage</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-lg font-bold text-white">
            {data.highConfidenceLeakage > 0
              ? `$${data.highConfidenceLeakage.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : '—'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">High-Confidence Leakage</div>
        </div>
      </div>

      {typeEntries.length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
          <div className="text-xs font-medium text-gray-400 mb-2">Leakage by Type</div>
          <div className="space-y-1.5">
            {typeEntries.map(([type, value]) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{leakageTypeLabel(type)}</span>
                <span className="text-gray-300 font-mono">
                  {value > 0 ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-400">Events (sorted by confidence)</div>
        {data.events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
