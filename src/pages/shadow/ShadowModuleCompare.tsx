import { useEffect, useState } from 'react';
import { ArrowLeft, Play, Clock, CheckCircle, XCircle, AlertTriangle, RefreshCw, GitCompare } from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import { dbGetShadowRuns } from '../../lib/db/shadowRuns';
import type { ShadowRunRecord, RunStatus } from '../../types/shadow';

function getModuleKeyFromPath(): string | undefined {
  const m = window.location.pathname.match(/^\/shadow\/modules\/([^/]+)\/compare$/);
  return m ? m[1] : undefined;
}

const STATUS_CONFIG: Record<RunStatus, { label: string; icon: React.ReactNode; classes: string }> = {
  completed: {
    label: 'Completed',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    classes: 'text-green-400 bg-green-950/40 border-green-800',
  },
  failed: {
    label: 'Failed',
    icon: <XCircle className="w-3.5 h-3.5" />,
    classes: 'text-red-400 bg-red-950/40 border-red-800',
  },
  running: {
    label: 'Running',
    icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
    classes: 'text-amber-400 bg-amber-950/40 border-amber-800',
  },
  queued: {
    label: 'Queued',
    icon: <Clock className="w-3.5 h-3.5" />,
    classes: 'text-gray-400 bg-gray-800 border-gray-700',
  },
  cancelled: {
    label: 'Cancelled',
    icon: <XCircle className="w-3.5 h-3.5" />,
    classes: 'text-gray-500 bg-gray-900 border-gray-800',
  },
};

function RunStatusBadge({ status }: { status: RunStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.classes}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ShadowModuleCompare() {
  const moduleKey = getModuleKeyFromPath();
  const [runs, setRuns] = useState<ShadowRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RunStatus | 'all'>('all');

  useEffect(() => {
    if (!moduleKey) return;
    load();
  }, [moduleKey]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await dbGetShadowRuns({ moduleKey: moduleKey!, limit: 50 });
      setRuns(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load shadow runs');
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === 'all' ? runs : runs.filter((r) => r.status === filter);
  const canCompare = (r: ShadowRunRecord) => r.status === 'completed' && r.run_mode === 'live_vs_shadow';

  if (!moduleKey) {
    return (
      <ShadowLayout>
        <div className="text-center py-16 text-red-400 text-sm">Invalid URL — no module key found in path</div>
      </ShadowLayout>
    );
  }

  return (
    <ShadowLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <a
              href={`/shadow/modules/${moduleKey}`}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-blue-400" />
                Compare Runs
              </h1>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{moduleKey}</p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Info banner for non-plumbing modules */}
        {moduleKey !== 'plumbing_parser' && (
          <div className="bg-amber-950/30 border border-amber-800 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/80">
              Deep diff view is currently available for <span className="font-semibold text-amber-300">plumbing_parser</span> only.
              Runs for other modules are listed below for reference.
            </p>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-gray-800 pb-0">
          {(['all', 'completed', 'running', 'failed', 'queued'] as const).map((f) => {
            const count = f === 'all' ? runs.length : runs.filter((r) => r.status === f).length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize whitespace-nowrap ${
                  filter === f
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {f === 'all' ? 'All' : f}
                <span className={`ml-1.5 text-[10px] px-1 rounded ${
                  filter === f ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Runs list */}
        {loading ? (
          <div className="text-center py-16 text-gray-500 text-sm">Loading shadow runs...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <GitCompare className="w-8 h-8 text-gray-700 mx-auto" />
            <p className="text-sm text-gray-500">No shadow runs found for this module</p>
            <p className="text-xs text-gray-600">
              Runs are created when the shadow executor processes a quote through both live and shadow parsers.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((run) => (
              <div
                key={run.id}
                className={`bg-gray-900 border rounded-xl px-4 py-3 flex items-center justify-between gap-4 transition-all ${
                  canCompare(run) ? 'border-gray-800 hover:border-gray-700' : 'border-gray-800/50 opacity-70'
                }`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">
                      {run.source_label ?? run.source_id.slice(0, 24)}
                    </span>
                    <RunStatusBadge status={run.status} />
                    <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${
                      run.run_mode === 'live_vs_shadow'
                        ? 'text-blue-400 bg-blue-950/30 border-blue-800'
                        : 'text-gray-500 bg-gray-800 border-gray-700'
                    }`}>
                      {run.run_mode}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                    <span className="font-mono">{run.id.slice(0, 8)}…</span>
                    {run.live_version && <span>live: <span className="text-gray-400">{run.live_version}</span></span>}
                    {run.shadow_version && <span>shadow: <span className="text-gray-400">{run.shadow_version}</span></span>}
                    <span>{formatRelative(run.created_at)}</span>
                    {run.error_message && (
                      <span className="text-red-400 truncate max-w-[200px]">{run.error_message}</span>
                    )}
                  </div>
                </div>

                {canCompare(run) && moduleKey === 'plumbing_parser' ? (
                  <a
                    href={`/shadow/plumbing/compare/${run.id}`}
                    className="flex items-center gap-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    View Diff
                  </a>
                ) : canCompare(run) ? (
                  <span className="text-xs text-gray-600 shrink-0">Diff not available</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </ShadowLayout>
  );
}
