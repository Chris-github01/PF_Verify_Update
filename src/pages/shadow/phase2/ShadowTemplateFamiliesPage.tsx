import { useEffect, useState } from 'react';
import { Layers, Fingerprint, ChevronRight, Search, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import { getAllFingerprints, type SupplierFingerprint } from '../../../lib/shadow/phase2/fingerprintingService';

type SortKey = 'runs' | 'accuracy' | 'confidence' | 'failures';

function formatFamilyLabel(fp: SupplierFingerprint): string {
  const parts = fp.template_family_id.split('__');
  if (parts.length >= 2) return parts.slice(0, 2).join(' / ');
  return fp.template_family_id;
}

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

interface GroupedFamily {
  prefix: string;
  fingerprints: SupplierFingerprint[];
  totalRuns: number;
  avgAccuracy: number;
  failureModeCount: number;
}

function groupByPrefix(fps: SupplierFingerprint[]): GroupedFamily[] {
  const map = new Map<string, SupplierFingerprint[]>();
  for (const fp of fps) {
    const prefix = fp.template_family_id.split('__')[0] ?? fp.template_family_id;
    const existing = map.get(prefix) ?? [];
    existing.push(fp);
    map.set(prefix, existing);
  }
  return Array.from(map.entries()).map(([prefix, items]) => ({
    prefix,
    fingerprints: items,
    totalRuns: items.reduce((s, f) => s + f.historical_run_count, 0),
    avgAccuracy: items.reduce((s, f) => s + f.historical_accuracy, 0) / items.length,
    failureModeCount: new Set(items.flatMap((f) => f.common_failure_modes_json)).size,
  })).sort((a, b) => b.totalRuns - a.totalRuns);
}

export default function ShadowTemplateFamiliesPage() {
  const [fingerprints, setFingerprints] = useState<SupplierFingerprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('runs');
  const [expandedPrefix, setExpandedPrefix] = useState<string | null>(null);
  const [selectedFp, setSelectedFp] = useState<SupplierFingerprint | null>(null);

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
      setError(e instanceof Error ? e.message : 'Failed to load template families');
    } finally {
      setLoading(false);
    }
  }

  const groups = groupByPrefix(fingerprints).filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      g.prefix.toLowerCase().includes(q) ||
      g.fingerprints.some(
        (fp) => fp.template_family_id.toLowerCase().includes(q) || (fp.supplier_name_normalized ?? '').toLowerCase().includes(q),
      )
    );
  }).sort((a, b) => {
    if (sortBy === 'runs') return b.totalRuns - a.totalRuns;
    if (sortBy === 'accuracy') return a.avgAccuracy - b.avgAccuracy;
    if (sortBy === 'confidence') return b.fingerprints[0].confidence - a.fingerprints[0].confidence;
    return b.failureModeCount - a.failureModeCount;
  });

  return (
    <ShadowLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-amber-400" />
              <h1 className="text-xl font-bold text-white">Template Families</h1>
            </div>
            <p className="text-sm text-gray-500 max-w-xl">
              Quote document format families grouped by structure prefix. Each family represents a cluster of supplier documents sharing the same table style, GST treatment, and total detection pattern.
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Format Groups</div>
            <div className="text-2xl font-bold text-white">{groups.length}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Distinct Families</div>
            <div className="text-2xl font-bold text-white">{fingerprints.length}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Low-Accuracy Groups</div>
            <div className="text-2xl font-bold text-red-400">
              {groups.filter((g) => g.avgAccuracy < 0.70 && g.totalRuns >= 3).length}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search families..."
              className="bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 w-56"
            />
          </div>
          <div className="flex gap-1 ml-auto">
            {([
              { key: 'runs' as SortKey, label: 'By Runs' },
              { key: 'accuracy' as SortKey, label: 'Lowest Accuracy' },
              { key: 'failures' as SortKey, label: 'Most Failures' },
            ]).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${sortBy === opt.key ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-gray-500 border border-gray-800 hover:bg-gray-800 hover:text-gray-300'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        {loading && groups.length === 0 ? (
          <div className="py-10 text-center">
            <Loader2 className="w-5 h-5 text-gray-600 animate-spin mx-auto mb-2" />
            <div className="text-sm text-gray-600">Loading template families...</div>
          </div>
        ) : groups.length === 0 ? (
          <div className="py-10 text-center bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
            <Layers className="w-6 h-6 text-gray-700 mx-auto mb-2" />
            <div className="text-sm text-gray-500">No template families found.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => {
              const expanded = expandedPrefix === group.prefix;
              return (
                <div key={group.prefix} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedPrefix(expanded ? null : group.prefix)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                      <Layers className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white capitalize">
                        {group.prefix.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs text-gray-600">
                        {group.fingerprints.length} {group.fingerprints.length === 1 ? 'family' : 'families'} · {group.totalRuns} total runs
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-right">
                        <div className={`text-sm font-semibold ${accuracyColor(group.avgAccuracy)}`}>
                          {(group.avgAccuracy * 100).toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-gray-600">avg accuracy</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-white">{group.failureModeCount}</div>
                        <div className="text-[10px] text-gray-600">failure modes</div>
                      </div>
                      {group.avgAccuracy < 0.70 && group.totalRuns >= 3 && (
                        <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
                      )}
                      <ChevronRight className={`w-4 h-4 text-gray-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-gray-800 divide-y divide-gray-800">
                      {group.fingerprints.map((fp) => (
                        <button
                          key={fp.id}
                          onClick={() => setSelectedFp(selectedFp?.id === fp.id ? null : fp)}
                          className="w-full flex items-center gap-4 px-6 py-3 hover:bg-gray-800/40 transition-colors text-left"
                        >
                          <Fingerprint className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-300 font-mono truncate">
                              {formatFamilyLabel(fp)}
                            </div>
                            {fp.supplier_name_normalized && (
                              <div className="text-[10px] text-gray-600">{fp.supplier_name_normalized}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-4 shrink-0 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className={accuracyColor(fp.historical_accuracy)}>
                                {(fp.historical_accuracy * 100).toFixed(1)}%
                              </span>
                              <div className="h-1 w-12 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${accuracyBarColor(fp.historical_accuracy)}`}
                                  style={{ width: `${fp.historical_accuracy * 100}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-gray-600">{fp.historical_run_count} runs</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selected FP detail panel */}
                  {expanded && selectedFp && group.fingerprints.some((f) => f.id === selectedFp.id) && (
                    <div className="border-t border-amber-500/20 bg-gray-950 px-6 py-4 space-y-3">
                      <div className="text-xs font-semibold text-amber-300">Detail: {formatFamilyLabel(selectedFp)}</div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="text-[10px] text-gray-600 mb-1">Hash</div>
                          <div className="text-gray-400 font-mono">{selectedFp.fingerprint_hash}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-600 mb-1">GST Mode</div>
                          <div className="text-gray-400">{selectedFp.gst_mode ?? '—'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-600 mb-1">Total Style</div>
                          <div className="text-gray-400">{selectedFp.total_phrase_family ?? '—'}</div>
                        </div>
                      </div>
                      {selectedFp.common_failure_modes_json.length > 0 && (
                        <div>
                          <div className="text-[10px] text-gray-600 mb-1.5">Known Failure Modes</div>
                          <div className="flex flex-wrap gap-1">
                            {selectedFp.common_failure_modes_json.map((fm, i) => (
                              <span key={i} className="text-[10px] bg-orange-900/20 border border-orange-800/30 rounded px-1.5 py-0.5 text-orange-400 font-mono">{fm}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ShadowLayout>
  );
}
