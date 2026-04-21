import { Database, Loader2, X, Trophy, ChevronsRight, AlertTriangle, Timer } from 'lucide-react';
import type { BulkRunRow } from './vaultBulkRunner';

interface Props {
  run: BulkRunRow | null;
  discovery: { found: number; duplicates: number; queued: number } | null;
  phase: 'discovering' | 'running' | 'done' | 'error';
  errorMessage?: string | null;
  onCancel: () => void;
  onClose: () => void;
}

export default function VaultBulkRunModal({ run, discovery, phase, errorMessage, onCancel, onClose }: Props) {
  const processed = run?.processed_count ?? 0;
  const queued = run?.queued_unique ?? discovery?.queued ?? 0;
  const progress = run?.progress_percent ?? 0;
  const v2 = run?.v2_better_count ?? 0;
  const eq = run?.equal_count ?? 0;
  const v1 = run?.v1_better_count ?? 0;
  const failed = run?.failed_count ?? 0;
  const eta = computeEta(run);

  const isTerminal = phase === 'done' || phase === 'error';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-sky-500/10 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/60 to-transparent" />
        <header className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-sky-500/30">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-50">Parse From PDF Vault</h2>
              <p className="text-xs text-slate-400">
                {phase === 'discovering' && 'Scanning vault and deduplicating…'}
                {phase === 'running' && 'Comparing parsers across unique vault PDFs'}
                {phase === 'done' && 'Bulk run complete'}
                {phase === 'error' && 'Bulk run ended with errors'}
              </p>
            </div>
          </div>
          {isTerminal && (
            <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition">
              <X className="w-4 h-4" />
            </button>
          )}
        </header>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <StatChip label="Vault PDFs Found" value={fmtNum(discovery?.found)} />
            <StatChip label="Duplicates Skipped" value={fmtNum(discovery?.duplicates)} tone="amber" />
            <StatChip label="Unique Queue" value={fmtNum(queued)} tone="sky" />
          </div>

          {phase === 'discovering' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-6 flex items-center gap-3 text-sm text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              Discovering vault PDFs and building unique queue…
            </div>
          )}

          {(phase === 'running' || phase === 'done' || phase === 'error') && run && (
            <>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 uppercase tracking-wider">Currently Parsing</span>
                  <span className="text-slate-300 tabular-nums">
                    {processed}/{queued}
                  </span>
                </div>
                <div className="text-sm text-slate-200 truncate">
                  {run.current_file ?? (isTerminal ? 'Finished' : 'Queued…')}
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400 transition-all"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                  <span>{progress}% complete</span>
                  <span className="inline-flex items-center gap-1">
                    <Timer className="w-3 h-3" />
                    ETA {eta}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <CounterChip label="V2 Better" value={v2} tone="emerald" icon={<Trophy className="w-3.5 h-3.5" />} />
                <CounterChip label="Equal" value={eq} tone="slate" icon={<ChevronsRight className="w-3.5 h-3.5" />} />
                <CounterChip label="V1 Better" value={v1} tone="rose" icon={<Trophy className="w-3.5 h-3.5" />} />
                <CounterChip label="Failed" value={failed} tone="amber" icon={<AlertTriangle className="w-3.5 h-3.5" />} />
              </div>
            </>
          )}

          {phase === 'error' && errorMessage && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-800 bg-slate-950/40">
          {!isTerminal ? (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20 transition"
            >
              <X className="w-4 h-4" /> Cancel Run
            </button>
          ) : (
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white px-4 py-2 text-sm font-medium transition"
            >
              Close
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function StatChip({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'amber' | 'sky' }) {
  const tones: Record<string, string> = {
    slate: 'border-slate-800 bg-slate-950/60 text-slate-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    sky: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  };
  return (
    <div className={`rounded-xl border px-3 py-3 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-xl font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function CounterChip({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'slate' | 'rose' | 'amber';
  icon: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    slate: 'border-slate-700 bg-slate-800/50 text-slate-200',
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function computeEta(run: BulkRunRow | null): string {
  if (!run) return '—';
  const processed = run.processed_count ?? 0;
  const queued = run.queued_unique ?? 0;
  if (processed === 0 || queued === 0 || processed >= queued) return '—';
  const started = new Date(run.started_at).getTime();
  const elapsed = Date.now() - started;
  const perItem = elapsed / processed;
  const remainingMs = perItem * (queued - processed);
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '—';
  const seconds = Math.round(remainingMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${mins}m ${s}s`;
}
