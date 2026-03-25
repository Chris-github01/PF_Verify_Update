import { useState } from 'react';
import { RotateCcw, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { dbFullRollback } from '../../../lib/db/releaseDb';
import type { PlumbingRolloutState } from '../../../types/shadow';

interface PlumbingRollbackPanelProps {
  rolloutState: PlumbingRolloutState;
  onRefresh: () => void;
}

export default function PlumbingRollbackPanel({ rolloutState, onRefresh }: PlumbingRollbackPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rollbackVersion = rolloutState.moduleVersion?.rollback_version ?? 'previous version';
  const currentLiveVersion = rolloutState.moduleVersion?.live_version ?? 'unknown';
  const isRolledBack = rolloutState.moduleVersion?.rollout_status === 'rolled_back';

  async function executeRollback() {
    setBusy(true);
    setError(null);
    try {
      await dbFullRollback(notes || undefined);
      setDone(true);
      setConfirming(false);
      onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bg-teal-500/10 border border-teal-500/30 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-teal-400" />
          <div>
            <div className="text-sm font-semibold text-teal-300">Rollback complete</div>
            <div className="text-xs text-gray-500 mt-0.5">Live parser restored. All beta flags disabled.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-red-500/5 border border-red-500/30 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-red-500/20">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-red-400" />
          <h2 className="text-sm font-semibold text-white">Emergency Rollback</h2>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
            <div className="text-[10px] text-gray-500 mb-1">Current live</div>
            <div className="text-sm font-mono font-semibold text-white">{currentLiveVersion}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
            <div className="text-[10px] text-gray-500 mb-1">Rollback target</div>
            <div className="text-sm font-mono font-semibold text-amber-300">{rollbackVersion}</div>
          </div>
        </div>

        <div className="text-xs text-gray-400 leading-relaxed">
          Rollback restores the previous live version, disables all shadow routing flags, and sets status to <code className="text-red-300">rolled_back</code>.
          This is fully reversible by running a new promotion cycle.
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        {isRolledBack ? (
          <div className="text-xs text-gray-500 italic">System is already in rolled-back state.</div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg bg-red-700/80 hover:bg-red-700 text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Initiate Rollback
          </button>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-red-500/40 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-red-400" />
                Confirm Rollback
              </h2>
              <button onClick={() => setConfirming(false)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-start gap-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 rounded-lg mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              This will immediately affect all plumbing parser traffic. The action is logged and reversible.
            </div>

            <p className="text-sm text-gray-400 mb-4">
              Live version will revert to <code className="text-amber-300">{rollbackVersion}</code>.
              All beta routing flags will be disabled.
            </p>

            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Rollback reason (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none resize-none"
                placeholder="Describe why rollback is being triggered..."
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(false)}
                className="text-xs text-gray-400 hover:text-white px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={executeRollback}
                disabled={busy}
                className="flex items-center gap-2 text-xs font-semibold px-5 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white disabled:opacity-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Execute Rollback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
