import { useEffect, useState } from 'react';
import { Plus, ArrowLeft, Play, AlertTriangle } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import {
  dbGetPlumbingSuites,
  dbCreatePlumbingSuite,
  dbGetPlumbingSuiteCases,
  dbImportSuite,
} from '../../lib/db/plumbingRegressionDb';
import type { RegressionSuiteRecordExtended } from '../../lib/modules/parsers/plumbing/regression/types';

export default function PlumbingRegressionListPage() {
  const [suites, setSuites] = useState<RegressionSuiteRecordExtended[]>([]);
  const [caseCounts, setCaseCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await dbGetPlumbingSuites();
      setSuites(data);
      const counts: Record<string, number> = {};
      await Promise.all(data.map(async (s) => {
        const cases = await dbGetPlumbingSuiteCases(s.id);
        counts[s.id] = cases.length;
      }));
      setCaseCounts(counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load suites');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await dbCreatePlumbingSuite({ suiteName: newName.trim(), description: newDesc.trim() || undefined });
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create suite');
    } finally {
      setCreating(false);
    }
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (ev) => {
      const file = (ev.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const id = await dbImportSuite(payload);
        window.location.href = `/shadow/modules/plumbing_parser/regression/${id}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Import failed');
      }
    };
    input.click();
  }

  return (
    <ShadowLayout>
      <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <a href="/shadow/modules/plumbing_parser" className="text-gray-400 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </a>
              <div>
                <h1 className="text-xl font-bold text-white">Plumbing Regression Suites</h1>
                <p className="text-sm text-gray-500 mt-0.5">Historical validation suites for plumbing_parser shadow rollout gating</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleImport} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors">
                Import JSON
              </button>
              <button
                onClick={() => setShowCreate((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs bg-amber-500 text-gray-950 font-semibold rounded-lg hover:bg-amber-400 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Suite
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          {showCreate && (
            <div className="bg-gray-900 border border-amber-800/40 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">New Regression Suite</h3>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Suite name"
                className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
              />
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 text-xs bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={!newName.trim() || creating} className="px-4 py-2 text-xs bg-amber-500 text-gray-950 font-semibold rounded-lg hover:bg-amber-400 disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create Suite'}
                </button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading suites...</div>
          ) : suites.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <Play className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No regression suites yet.</p>
              <p className="text-xs mt-1">Create a suite to start adding historical plumbing quotes for validation.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {suites.map((suite) => (
                <a
                  key={suite.id}
                  href={`/shadow/modules/plumbing_parser/regression/${suite.id}`}
                  className="block bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 hover:bg-gray-800/40 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">{suite.suite_name}</h3>
                        {!suite.is_active && <span className="text-xs text-gray-600">(inactive)</span>}
                      </div>
                      {suite.description && <p className="text-xs text-gray-500 mt-0.5">{suite.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-gray-300">{caseCounts[suite.id] ?? 0} cases</div>
                      <div className="text-xs text-gray-600">{new Date(suite.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
      </div>
    </ShadowLayout>
  );
}
