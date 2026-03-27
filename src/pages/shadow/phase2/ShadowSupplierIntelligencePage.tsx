import { useEffect, useState } from 'react';
import { Fingerprint, AlertCircle, CheckCircle, TrendingUp, Hash, Loader2, RefreshCw } from 'lucide-react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import { getAllFingerprints, type SupplierFingerprint } from '../../../lib/shadow/phase2/fingerprintingService';

function accuracyColor(a: number): string {
  if (a >= 0.85) return 'text-teal-400';
  if (a >= 0.60) return 'text-amber-400';
  return 'text-red-400';
}

function accuracyBarColor(a: number): string {
  if (a >= 0.85) return 'bg-teal-500';
  if (a >= 0.60) return 'bg-amber-500';
  return 'bg-red-500';
}

function confidenceBadgeClass(c: number): string {
  if (c >= 0.8) return 'bg-teal-900/40 text-teal-300 border-teal-700';
  if (c >= 0.5) return 'bg-amber-900/40 text-amber-300 border-amber-700';
  return 'bg-red-900/40 text-red-300 border-red-700';
}

export default function ShadowSupplierIntelligencePage() {
  const [fingerprints, setFingerprints] = useState<SupplierFingerprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterLowAccuracy, setFilterLowAccuracy] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllFingerprints(200);
      setFingerprints(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fingerprints');
    } finally {
      setLoading(false);
    }
  }

  const filtered = fingerprints
    .filter((fp) => {
      if (filterLowAccuracy && fp.historical_accuracy >= 0.70) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          fp.template_family_id.toLowerCase().includes(q) ||
          (fp.supplier_name_normalized ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });

  const lowAccuracyCount = fingerprints.filter((fp) => fp.historical_run_count >= 3 && fp.historical_accuracy < 0.70).length;
  const avgAccuracy = fingerprints.length > 0
    ? fingerprints.reduce((s, f) => s + f.historical_accuracy, 0) / fingerprints.length
    : 0;
  const totalRuns = fingerprints.reduce((s, f) => s + f.historical_run_count, 0);

  return (
    <ShadowLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Fingerprint className="w-5 h-5 text-amber-400" />
              <h1 className="text-xl font-bold text-white">Supplier Intelligence</h1>
            </div>
            <p className="text-sm text-gray-500 max-w-xl">
              Supplier and template family fingerprints derived from shadow run parsing signals. Identifies recurring document structures and per-family accuracy trends.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 border border-gray-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Total Families</div>
            <div className="text-2xl font-bold text-white">{fingerprints.length}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">fingerprinted</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Total Runs</div>
            <div className="text-2xl font-bold text-white">{totalRuns}</div>
            <div className="text-[10px] text-gray-600 mt-0.5">across all families</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Avg Accuracy</div>
            <div className={`text-2xl font-bold ${accuracyColor(avgAccuracy)}`}>
              {(avgAccuracy * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">fleet-wide</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Low Accuracy</div>
            <div className={`text-2xl font-bold ${lowAccuracyCount > 0 ? 'text-red-400' : 'text-gray-600'}`}>
              {lowAccuracyCount}
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">families &lt;70% (&ge;3 runs)</div>
          </div>
        </div>

        {lowAccuracyCount > 0 && (
          <div className="flex items-start gap-3 px-4 py-3 bg-orange-900/20 border border-orange-700/40 rounded-xl">
            <AlertCircle className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <div className="text-xs text-orange-300">
              {lowAccuracyCount} supplier {lowAccuracyCount === 1 ? 'family has' : 'families have'} below-threshold accuracy and may benefit from supplier-specific parsing rules. Check Recommendations for actionable suggestions.
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier or family ID..."
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 w-64"
          />
          <button
            onClick={() => setFilterLowAccuracy(!filterLowAccuracy)}
            className={`px-3 py-2 text-xs rounded-lg border transition-colors ${filterLowAccuracy ? 'bg-red-900/30 text-red-300 border-red-700' : 'text-gray-500 border-gray-800 hover:bg-gray-800 hover:text-gray-300'}`}
          >
            Low Accuracy Only
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        {loading && filtered.length === 0 ? (
          <div className="py-10 text-center">
            <Loader2 className="w-5 h-5 text-gray-600 animate-spin mx-auto mb-2" />
            <div className="text-sm text-gray-600">Loading fingerprints...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
            <Fingerprint className="w-6 h-6 text-gray-700 mx-auto mb-2" />
            <div className="text-sm text-gray-500">No supplier families found.</div>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Family</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Supplier</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Runs</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Accuracy</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Confidence</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Failure Modes</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filtered.map((fp) => {
                  const expanded = expandedId === fp.id;
                  return (
                    <>
                      <tr
                        key={fp.id}
                        onClick={() => setExpandedId(expanded ? null : fp.id)}
                        className="hover:bg-gray-800/40 transition-colors cursor-pointer group"
                      >
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-300 font-mono truncate max-w-[200px]" title={fp.template_family_id}>
                            {fp.template_family_id.length > 28 ? fp.template_family_id.slice(0, 28) + '…' : fp.template_family_id}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-400">
                            {fp.supplier_name_normalized ?? <span className="text-gray-600 italic">Unknown</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-white">{fp.historical_run_count}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${accuracyColor(fp.historical_accuracy)}`}>
                              {(fp.historical_accuracy * 100).toFixed(1)}%
                            </span>
                            <div className="h-1 w-16 bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${accuracyBarColor(fp.historical_accuracy)}`}
                                style={{ width: `${fp.historical_accuracy * 100}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide ${confidenceBadgeClass(fp.confidence)}`}>
                            {(fp.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {fp.common_failure_modes_json.slice(0, 2).map((fm, i) => (
                              <span key={i} className="text-[10px] bg-orange-900/20 border border-orange-800/30 rounded px-1.5 py-0.5 text-orange-400 font-mono">
                                {fm}
                              </span>
                            ))}
                            {fp.common_failure_modes_json.length > 2 && (
                              <span className="text-[10px] text-gray-600">+{fp.common_failure_modes_json.length - 2}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <TrendingUp className={`w-3.5 h-3.5 inline-block transition-colors ${expanded ? 'text-amber-400' : 'text-gray-700 group-hover:text-gray-500'}`} />
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={fp.id + '_expanded'} className="bg-gray-950">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-3 gap-4 text-xs">
                              <div>
                                <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">Fingerprint Hash</div>
                                <div className="flex items-center gap-1.5">
                                  <Hash className="w-3 h-3 text-gray-600" />
                                  <span className="text-gray-400 font-mono">{fp.fingerprint_hash}</span>
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">Document Markers</div>
                                <div className="space-y-0.5">
                                  {fp.table_style && <div className="text-gray-400"><span className="text-gray-600">Table: </span>{fp.table_style}</div>}
                                  {fp.gst_mode && <div className="text-gray-400"><span className="text-gray-600">GST: </span>{fp.gst_mode}</div>}
                                  {fp.total_phrase_family && <div className="text-gray-400"><span className="text-gray-600">Total: </span>{fp.total_phrase_family}</div>}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">All Failure Modes</div>
                                <div className="flex flex-wrap gap-1">
                                  {fp.common_failure_modes_json.length === 0
                                    ? <span className="text-gray-600 italic">None recorded</span>
                                    : fp.common_failure_modes_json.map((fm, i) => (
                                      <span key={i} className="text-[10px] bg-orange-900/20 border border-orange-800/30 rounded px-1.5 py-0.5 text-orange-400 font-mono">
                                        {fm}
                                      </span>
                                    ))}
                                </div>
                              </div>
                            </div>
                            {fp.historical_accuracy < 0.70 && fp.historical_run_count >= 3 && (
                              <div className="mt-3 flex items-center gap-2 text-xs text-orange-300">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Below-threshold accuracy — consider supplier-specific rule or review in Recommendations.
                              </div>
                            )}
                            {fp.historical_accuracy >= 0.90 && (
                              <div className="mt-3 flex items-center gap-2 text-xs text-teal-300">
                                <CheckCircle className="w-3.5 h-3.5" />
                                High-accuracy family — no immediate action required.
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ShadowLayout>
  );
}
