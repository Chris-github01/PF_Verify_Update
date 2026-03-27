import { useEffect, useState } from 'react';
import { Fingerprint, CheckCircle, AlertCircle, Link2, Hash, Layers } from 'lucide-react';
import { getFingerprintForRun, type SupplierFingerprint, type RunFingerprintLink } from '../../../lib/shadow/phase2/fingerprintingService';

interface Props {
  runId: string;
}

function confidenceBadgeClass(c: number): string {
  if (c >= 0.8) return 'bg-teal-900/40 text-teal-300 border-teal-700';
  if (c >= 0.5) return 'bg-amber-900/40 text-amber-300 border-amber-700';
  return 'bg-red-900/40 text-red-300 border-red-700';
}

function accuracyColor(a: number): string {
  if (a >= 0.85) return 'text-teal-400';
  if (a >= 0.60) return 'text-amber-400';
  return 'text-red-400';
}

export default function SupplierFingerprintPanel({ runId }: Props) {
  const [link, setLink] = useState<RunFingerprintLink | null>(null);
  const [fingerprint, setFingerprint] = useState<SupplierFingerprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [runId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await getFingerprintForRun(runId);
      setLink(result.link);
      setFingerprint(result.fingerprint);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fingerprint');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="py-8 text-center text-gray-500 text-sm">Loading fingerprint data...</div>;
  if (error) return <div className="py-4 text-red-400 text-sm">{error}</div>;

  if (!link) {
    return (
      <div className="py-8 text-center flex flex-col items-center gap-2">
        <Fingerprint className="w-6 h-6 text-gray-700" />
        <div className="text-sm text-gray-500">No fingerprint linked to this run.</div>
        <div className="text-xs text-gray-600">Fingerprinting runs on Phase 2-enabled executions only.</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Link card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Link2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-white">Run Fingerprint Link</span>
              <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide ${confidenceBadgeClass(link.confidence)}`}>
                {(link.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
            <div className="text-xs text-gray-400 font-mono truncate">{link.template_family_id}</div>
            {link.supplier_name_normalized && (
              <div className="text-xs text-gray-500 mt-0.5">Supplier: {link.supplier_name_normalized}</div>
            )}
          </div>
        </div>

        {link.matched_markers_json.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-2">Matched Markers</div>
            <div className="flex flex-wrap gap-1.5">
              {link.matched_markers_json.map((m, i) => (
                <span key={i} className="text-[11px] bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-300 font-mono">
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fingerprint detail */}
      {fingerprint && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Fingerprint className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-white">Template Family Profile</span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-950 rounded-lg p-3">
              <div className="text-[10px] text-gray-600 mb-1">Historical Runs</div>
              <div className="text-xl font-bold text-white">{fingerprint.historical_run_count}</div>
            </div>
            <div className="bg-gray-950 rounded-lg p-3">
              <div className="text-[10px] text-gray-600 mb-1">Avg Accuracy</div>
              <div className={`text-xl font-bold ${accuracyColor(fingerprint.historical_accuracy)}`}>
                {(fingerprint.historical_accuracy * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-950 rounded-lg p-3">
              <div className="text-[10px] text-gray-600 mb-1">Profile Confidence</div>
              <div className="text-xl font-bold text-white">{(fingerprint.confidence * 100).toFixed(0)}%</div>
            </div>
          </div>

          {/* Hash */}
          <div className="flex items-center gap-2">
            <Hash className="w-3.5 h-3.5 text-gray-600" />
            <span className="text-xs text-gray-600">Hash:</span>
            <span className="text-xs text-gray-400 font-mono">{fingerprint.fingerprint_hash}</span>
          </div>

          {/* Markers grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {fingerprint.table_style && (
              <div className="flex gap-2">
                <span className="text-gray-600 w-24 shrink-0">Table Style</span>
                <span className="text-gray-300 font-mono">{fingerprint.table_style}</span>
              </div>
            )}
            {fingerprint.gst_mode && (
              <div className="flex gap-2">
                <span className="text-gray-600 w-24 shrink-0">GST Mode</span>
                <span className="text-gray-300 font-mono">{fingerprint.gst_mode}</span>
              </div>
            )}
            {fingerprint.total_phrase_family && (
              <div className="flex gap-2">
                <span className="text-gray-600 w-24 shrink-0">Total Style</span>
                <span className="text-gray-300 font-mono">{fingerprint.total_phrase_family}</span>
              </div>
            )}
          </div>

          {/* Common failure modes */}
          {fingerprint.common_failure_modes_json.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-3 h-3 text-orange-400" />
                <span className="text-[10px] text-gray-600 uppercase tracking-wide">Known Failure Modes</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {fingerprint.common_failure_modes_json.map((fm, i) => (
                  <span key={i} className="text-[11px] bg-orange-900/20 border border-orange-800/40 rounded px-2 py-0.5 text-orange-300 font-mono">
                    {fm}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Accuracy bar */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-600 mb-1">
              <span>Parse Accuracy</span>
              <span>{(fingerprint.historical_accuracy * 100).toFixed(1)}%</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${fingerprint.historical_accuracy >= 0.85 ? 'bg-teal-500' : fingerprint.historical_accuracy >= 0.60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${fingerprint.historical_accuracy * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {!fingerprint && (
        <div className="py-4 bg-gray-900/50 border border-dashed border-gray-800 rounded-xl text-center">
          <Layers className="w-4 h-4 text-gray-700 mx-auto mb-1" />
          <div className="text-xs text-gray-600">Fingerprint record not yet built for this family.</div>
        </div>
      )}

      {fingerprint && fingerprint.historical_accuracy < 0.70 && fingerprint.historical_run_count >= 3 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-orange-900/20 border border-orange-700/40 rounded-xl">
          <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <div className="text-xs text-orange-300">
            This supplier family has a below-threshold accuracy rate ({(fingerprint.historical_accuracy * 100).toFixed(1)}%) across {fingerprint.historical_run_count} runs. A supplier-specific parsing rule is recommended.
          </div>
        </div>
      )}

      {fingerprint && fingerprint.historical_accuracy >= 0.90 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-teal-900/20 border border-teal-700/40 rounded-xl">
          <CheckCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <div className="text-xs text-teal-300">
            This supplier family consistently parses accurately ({(fingerprint.historical_accuracy * 100).toFixed(1)}% across {fingerprint.historical_run_count} runs).
          </div>
        </div>
      )}
    </div>
  );
}
