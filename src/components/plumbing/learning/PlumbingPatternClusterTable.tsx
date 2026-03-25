import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, TrendingUp } from 'lucide-react';
import type { PatternClusterRecord } from '../../../lib/modules/parsers/plumbing/learning/learningTypes';

interface PlumbingPatternClusterTableProps {
  clusters: PatternClusterRecord[];
}

export default function PlumbingPatternClusterTable({ clusters }: PlumbingPatternClusterTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (clusters.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-sm text-gray-600">
        No pattern clusters detected yet. Run anomaly detection or regression suites to populate learning events.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Pattern Clusters</h2>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {clusters.length} distinct failure patterns detected from regression failures and beta anomalies.
        </p>
      </div>
      <div className="divide-y divide-gray-800">
        {clusters.map((cluster) => {
          const isOpen = expanded === cluster.id;
          const sevDist = cluster.severity_distribution_json;
          const hasCritical = sevDist.critical > 0;

          return (
            <div key={cluster.id}>
              <button
                onClick={() => setExpanded(isOpen ? null : cluster.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-800/50 transition-colors text-left"
              >
                <div className="text-gray-600">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {hasCritical && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                    <span className="text-sm font-medium text-white truncate">{cluster.pattern_label}</span>
                  </div>
                  <div className="text-[10px] font-mono text-gray-600 mt-0.5 truncate">{cluster.pattern_key}</div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <SevBadge dist={sevDist} />
                  <div className="text-right">
                    <div className="text-sm font-bold text-white tabular-nums">{cluster.occurrence_count}</div>
                    <div className="text-[10px] text-gray-500">occurrences</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold tabular-nums ${cluster.failure_count > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {cluster.failure_count}
                    </div>
                    <div className="text-[10px] text-gray-500">failures</div>
                  </div>
                  <div className="text-[10px] text-gray-600 text-right">
                    {new Date(cluster.last_seen_at).toLocaleDateString()}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 space-y-4 bg-gray-900/50">
                  <SignatureDetails sig={cluster.pattern_signature_json} />
                  {cluster.example_rows_json.length > 0 && (
                    <ExampleRows rows={cluster.example_rows_json} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SevBadge({ dist }: { dist: { critical: number; warning: number; info: number } }) {
  return (
    <div className="flex items-center gap-1">
      {dist.critical > 0 && (
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
          {dist.critical}C
        </span>
      )}
      {dist.warning > 0 && (
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
          {dist.warning}W
        </span>
      )}
      {dist.info > 0 && (
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
          {dist.info}I
        </span>
      )}
    </div>
  );
}

function SignatureDetails({ sig }: { sig: PatternClusterRecord['pattern_signature_json'] }) {
  const flags: string[] = [];
  if (sig.amountOnly) flags.push('Amount-only row');
  if (sig.missingQty) flags.push('Missing quantity');
  if (sig.missingUnit) flags.push('Missing unit');
  if (sig.highValue) flags.push('High value');
  if (sig.shortDescription) flags.push('Short description');
  if (sig.lumpSumPattern) flags.push('Lump sum pattern');
  if (sig.position && sig.position !== 'any') flags.push(`Position: ${sig.position}`);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-[10px] text-gray-500 mb-1.5">Pattern flags</div>
        <div className="flex flex-wrap gap-1">
          {flags.map((f) => (
            <span key={f} className="text-[10px] px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">{f}</span>
          ))}
          {flags.length === 0 && <span className="text-[10px] text-gray-600">No specific flags</span>}
        </div>
      </div>
      <div>
        <div className="text-[10px] text-gray-500 mb-1.5">Keywords ({(sig.keywords ?? []).length})</div>
        <div className="flex flex-wrap gap-1">
          {(sig.keywords ?? []).slice(0, 10).map((kw) => (
            <span key={kw} className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300">
              {kw}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExampleRows({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 mb-1.5">Example events ({rows.length})</div>
      <div className="space-y-1">
        {rows.slice(0, 3).map((row, i) => (
          <div key={i} className="text-[10px] font-mono bg-gray-800 border border-gray-700 px-3 py-2 rounded text-gray-400">
            {(row.rawText as string)?.slice(0, 80) ?? JSON.stringify(row).slice(0, 80)}
          </div>
        ))}
      </div>
    </div>
  );
}
