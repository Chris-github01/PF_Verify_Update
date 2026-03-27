import { useEffect, useState } from 'react';
import {
  GitBranch, Plus, ChevronRight, CheckCircle, XCircle,
  Clock, FlaskConical, RefreshCw, AlertTriangle, BarChart2,
} from 'lucide-react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import {
  getShadowVersions, createShadowVersion, getVersionRuns,
  type ShadowVersion, type ShadowVersionRun,
} from '../../../lib/shadow/phase4/shadowVersioningService';
import {
  computeVersionBenchmarkSummary,
  type BenchmarkVersionSummary,
} from '../../../lib/shadow/phase4/benchmarkEvaluationEngine';

function StatusBadge({ status }: { status: ShadowVersion['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:    { label: 'Draft',    cls: 'bg-gray-700 text-gray-300' },
    testing:  { label: 'Testing',  cls: 'bg-blue-900/60 text-blue-300 border border-blue-700' },
    approved: { label: 'Approved', cls: 'bg-green-900/60 text-green-300 border border-green-700' },
    rejected: { label: 'Rejected', cls: 'bg-red-900/60 text-red-300 border border-red-700' },
  };
  const { label, cls } = map[status] ?? map.draft;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-600">—</span>;
  const color = score >= 70 ? 'text-green-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
  return <span className={`text-sm font-bold tabular-nums ${color}`}>{score}</span>;
}

interface VersionDetailProps {
  version: ShadowVersion;
  onBack: () => void;
}

function VersionDetail({ version, onBack }: VersionDetailProps) {
  const [runs, setRuns] = useState<ShadowVersionRun[]>([]);
  const [summary, setSummary] = useState<BenchmarkVersionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [r, s] = await Promise.all([
        getVersionRuns(version.id),
        computeVersionBenchmarkSummary(version.id),
      ]);
      setRuns(r);
      setSummary(s);
      setLoading(false);
    })();
  }, [version.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
          <ChevronRight className="w-4 h-4 rotate-180" /> Versions
        </button>
        <ChevronRight className="w-4 h-4 text-gray-700" />
        <span className="text-white font-semibold">{version.version_name}</span>
        <StatusBadge status={version.status} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Composite Score', value: summary?.compositeScore !== undefined ? String(summary.compositeScore) : '—' },
          { label: 'Benchmark Runs', value: String(summary?.runCount ?? 0) },
          { label: 'Avg Financial Acc.', value: summary?.avgFinancialAccuracy !== undefined ? `${summary.avgFinancialAccuracy.toFixed(0)}%` : '—' },
          { label: 'Regressions', value: String(summary?.regressionCount ?? '—') },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className="text-xl font-bold text-white">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Version Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Module</span>
            <p className="text-gray-200 font-mono mt-0.5">{version.module_key}</p>
          </div>
          <div>
            <span className="text-gray-500">Parser Version</span>
            <p className="text-gray-200 font-mono mt-0.5">{version.parser_version}</p>
          </div>
          <div>
            <span className="text-gray-500">Rules Version</span>
            <p className="text-gray-200 font-mono mt-0.5">{version.rules_version}</p>
          </div>
          <div>
            <span className="text-gray-500">Created</span>
            <p className="text-gray-200 mt-0.5">{new Date(version.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        {version.description && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-gray-400 text-sm">{version.description}</p>
          </div>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Linked Benchmark Runs ({runs.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-600 text-sm">Loading runs...</div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-gray-600 text-sm">No runs linked to this version yet.</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3">
                <span className="text-xs font-mono text-gray-400">{r.run_id.slice(0, 8)}…</span>
                <div className="flex items-center gap-6 text-xs text-gray-400">
                  <span>Pass: <span className="text-white">{r.pass_rate ?? '—'}</span></span>
                  <span>Fin: <span className="text-white">{r.financial_accuracy_score ?? '—'}</span></span>
                  <span>Line: <span className="text-white">{r.line_accuracy_score ?? '—'}</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface CreateVersionModalProps {
  onClose: () => void;
  onCreated: (v: ShadowVersion) => void;
}

function CreateVersionModal({ onClose, onCreated }: CreateVersionModalProps) {
  const [form, setForm] = useState({
    moduleKey: 'plumbing_parser',
    versionName: '',
    parserVersion: '',
    rulesVersion: 'v1',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.versionName.trim() || !form.parserVersion.trim()) {
      setError('Version name and parser version are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const v = await createShadowVersion({
        moduleKey: form.moduleKey,
        versionName: form.versionName.trim(),
        parserVersion: form.parserVersion.trim(),
        rulesVersion: form.rulesVersion.trim() || 'v1',
        description: form.description.trim() || undefined,
      });
      onCreated(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create version');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-lg font-semibold text-white">Create Shadow Version</h2>

        {[
          { label: 'Module Key', key: 'moduleKey', placeholder: 'e.g. plumbing_parser' },
          { label: 'Version Name', key: 'versionName', placeholder: 'e.g. v2.1.0-rc1' },
          { label: 'Parser Version', key: 'parserVersion', placeholder: 'e.g. v2' },
          { label: 'Rules Version', key: 'rulesVersion', placeholder: 'v1' },
        ].map((field) => (
          <div key={field.key}>
            <label className="block text-xs text-gray-400 mb-1">{field.label}</label>
            <input
              value={form[field.key as keyof typeof form]}
              onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>
        ))}

        <div>
          <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Version'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShadowVersionsV4Page() {
  const [versions, setVersions] = useState<ShadowVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<ShadowVersion | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    const v = await getShadowVersions();
    setVersions(v);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const statusIcon: Record<string, React.ReactNode> = {
    draft:    <Clock className="w-4 h-4 text-gray-500" />,
    testing:  <FlaskConical className="w-4 h-4 text-blue-400" />,
    approved: <CheckCircle className="w-4 h-4 text-green-400" />,
    rejected: <XCircle className="w-4 h-4 text-red-400" />,
  };

  return (
    <ShadowLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {selectedVersion ? (
          <VersionDetail version={selectedVersion} onBack={() => setSelectedVersion(null)} />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GitBranch className="w-6 h-6 text-amber-400" />
                <div>
                  <h1 className="text-xl font-bold text-white">Shadow Versions</h1>
                  <p className="text-xs text-gray-500 mt-0.5">Track, benchmark, and promote parser configurations</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={load}
                  className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> New Version
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-16 text-gray-600">Loading versions…</div>
            ) : versions.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-gray-800 rounded-2xl">
                <GitBranch className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No shadow versions created yet.</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg"
                >
                  Create First Version
                </button>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-xs text-gray-500">
                      <th className="text-left px-5 py-3 font-medium">Version</th>
                      <th className="text-left px-4 py-3 font-medium">Module</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-right px-4 py-3 font-medium">Score</th>
                      <th className="text-right px-4 py-3 font-medium">Runs</th>
                      <th className="text-right px-5 py-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {versions.map((v) => (
                      <tr
                        key={v.id}
                        onClick={() => setSelectedVersion(v)}
                        className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {statusIcon[v.status] ?? statusIcon.draft}
                            <span className="text-white font-medium">{v.version_name}</span>
                          </div>
                          {v.description && (
                            <p className="text-xs text-gray-500 mt-0.5 ml-6 truncate max-w-xs">{v.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{v.module_key}</td>
                        <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                        <td className="px-4 py-3 text-right"><ScoreBadge score={v.benchmark_score} /></td>
                        <td className="px-4 py-3 text-right text-gray-400">{v.benchmark_run_count}</td>
                        <td className="px-5 py-3 text-right text-gray-500 text-xs">
                          {new Date(v.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-gray-400">
                <span className="text-amber-300 font-medium">Promotion is manual.</span> After a version reaches{' '}
                <span className="text-white">Approved</span> status via the Promotion Decisions page, a human admin must
                create a rollout plan. No automatic promotion occurs.
              </div>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateVersionModal
          onClose={() => setShowCreate(false)}
          onCreated={(v) => {
            setVersions((prev) => [v, ...prev]);
            setShowCreate(false);
            setSelectedVersion(v);
          }}
        />
      )}
    </ShadowLayout>
  );
}
