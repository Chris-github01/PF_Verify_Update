import { useEffect, useState } from 'react';
import { Plus, Play, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import {
  getBenchmarkSets,
  getBenchmarkQuotes,
  getReplayRuns,
  createBenchmarkSet,
  type BenchmarkSet,
  type BenchmarkQuote,
  type BenchmarkReplayRun,
} from '../../../lib/shadow/phase1/benchmarkReplay';
import { supabase } from '../../../lib/supabase';
import { TRADE_MODULES } from '../../../lib/modules/tradeRegistry';

function passStatusIcon(status: string) {
  if (status === 'pass') return <CheckCircle className="w-4 h-4 text-teal-400" />;
  if (status === 'fail') return <XCircle className="w-4 h-4 text-red-400" />;
  if (status === 'error') return <XCircle className="w-4 h-4 text-orange-400" />;
  return <Clock className="w-4 h-4 text-gray-500" />;
}

function fmt(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(n);
}

interface SetRowProps {
  set: BenchmarkSet;
  onDelete: (id: string) => void;
}

function BenchmarkSetRow({ set, onDelete }: SetRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [quotes, setQuotes] = useState<BenchmarkQuote[]>([]);
  const [replays, setReplays] = useState<BenchmarkReplayRun[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadDetail() {
    setLoading(true);
    const [q, r] = await Promise.all([
      getBenchmarkQuotes(set.id),
      getReplayRuns(set.id),
    ]);
    setQuotes(q);
    setReplays(r);
    setLoading(false);
  }

  function toggle() {
    setExpanded((v) => {
      if (!v) loadDetail();
      return !v;
    });
  }

  async function handleDeleteQuote(quoteId: string) {
    if (!confirm('Remove this benchmark quote?')) return;
    await supabase.from('benchmark_quotes').delete().eq('id', quoteId);
    loadDetail();
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-800/50 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">{set.name}</div>
          <div className="text-xs text-gray-500 font-mono">{set.module_key}</div>
        </div>
        {set.description && (
          <div className="text-xs text-gray-600 hidden sm:block max-w-[200px] truncate">{set.description}</div>
        )}
        <div className="text-[10px] text-gray-600">Created {new Date(set.created_at).toLocaleDateString()}</div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800 p-4 space-y-4">
          {loading && <div className="text-center text-gray-600 text-sm py-4">Loading...</div>}

          {!loading && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{quotes.length} benchmark quote{quotes.length !== 1 ? 's' : ''}</span>
                <button
                  onClick={() => onDelete(set.id)}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete Set
                </button>
              </div>

              {quotes.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-600 border-b border-gray-800">
                        <th className="text-left py-2 pr-4 font-medium">Supplier</th>
                        <th className="text-right py-2 pr-4 font-medium">Expected Total</th>
                        <th className="text-right py-2 pr-4 font-medium">Expected Lines</th>
                        <th className="text-right py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.map((q) => (
                        <tr key={q.id} className="border-b border-gray-800/50">
                          <td className="py-2 pr-4 text-white">{q.supplier_name ?? '—'}</td>
                          <td className="py-2 pr-4 text-right font-mono text-teal-300">{fmt(q.expected_total)}</td>
                          <td className="py-2 pr-4 text-right text-gray-400">{q.expected_line_count ?? '—'}</td>
                          <td className="py-2 text-right">
                            <button onClick={() => handleDeleteQuote(q.id)} className="text-red-600 hover:text-red-400 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t border-gray-800 pt-4">
                <div className="text-xs font-semibold text-gray-500 mb-3">Replay Runs ({replays.length})</div>
                {replays.length === 0 && (
                  <div className="text-xs text-gray-700 italic">No replay runs yet. Use the Replay API to execute a benchmark.</div>
                )}
                {replays.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 py-2 border-b border-gray-800/50 text-xs">
                    {passStatusIcon(r.pass_status)}
                    <span className="font-mono text-gray-400">{r.shadow_version}</span>
                    <span className="text-gray-500">Total: {r.total_accuracy != null ? `${r.total_accuracy}%` : '—'}</span>
                    <span className="text-gray-500">Lines: {r.line_accuracy != null ? `${r.line_accuracy}%` : '—'}</span>
                    <span className={r.regression_count > 0 ? 'text-amber-400' : 'text-gray-600'}>
                      {r.regression_count} regressions
                    </span>
                    {r.critical_failures > 0 && (
                      <span className="text-red-400">{r.critical_failures} critical</span>
                    )}
                    <span className="ml-auto text-gray-700">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ShadowBenchmarksPage() {
  const [sets, setSets] = useState<BenchmarkSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModule, setNewModule] = useState('plumbing_parser');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getBenchmarkSets();
      setSets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load benchmark sets');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createBenchmarkSet(newName.trim(), newModule, newDesc.trim() || undefined);
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create set');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this benchmark set and all its quotes?')) return;
    await supabase.from('benchmark_sets').delete().eq('id', id);
    load();
  }

  return (
    <ShadowLayout>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Benchmarks</h1>
            <p className="text-gray-500 text-sm">Adjudicated quote sets for shadow version replay and regression testing</p>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:text-amber-300 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Set
          </button>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {showCreate && (
          <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-5 space-y-4">
            <div className="text-sm font-semibold text-white">Create Benchmark Set</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Plumbing Regression Suite v1"
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Module</label>
                <select
                  value={newModule}
                  onChange={(e) => setNewModule(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                >
                  {Object.values(TRADE_MODULES).map((m) => (
                    <option key={m.module_key} value={m.module_key}>{m.module_name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Description (optional)</label>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What is this benchmark set for?"
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="flex items-center gap-2 px-4 py-1.5 text-sm bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:text-white rounded-lg disabled:opacity-40 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Loading benchmark sets...</div>
        ) : sets.length === 0 ? (
          <div className="text-center py-12 text-gray-600 text-sm">
            No benchmark sets yet. Create one to start defining adjudicated test cases.
          </div>
        ) : (
          <div className="space-y-3">
            {sets.map((set) => (
              <BenchmarkSetRow key={set.id} set={set} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </ShadowLayout>
  );
}
