import { useState } from 'react';
import { Rocket, GitBranch, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { dbPromoteToReleaseCandidate, dbPromoteToProduction } from '../../../lib/db/releaseDb';
import type { PlumbingRolloutState } from '../../../types/shadow';
import type { ChecklistEvalResult } from '../../../lib/modules/release/checklistEvaluator';

interface PlumbingPromotionPanelProps {
  rolloutState: PlumbingRolloutState;
  checklistResult: ChecklistEvalResult | null;
  healthScore?: number;
  unresolvedCriticalCount: number;
  onRefresh: () => void;
}

export default function PlumbingPromotionPanel({
  rolloutState,
  checklistResult,
  healthScore,
  unresolvedCriticalCount,
  onRefresh,
}: PlumbingPromotionPanelProps) {
  const [step, setStep] = useState<null | 'rc' | 'prod'>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rolloutStatus = rolloutState.moduleVersion?.rollout_status;
  const shadowVersion = rolloutState.moduleVersion?.shadow_version ?? 'v-shadow';
  const liveVersion = rolloutState.moduleVersion?.live_version ?? 'v1.0';
  const checklistReady = checklistResult?.status === 'ready';
  const hasApproval = !!rolloutState.latestApproval;
  const isHealthCritical = healthScore != null && healthScore < 35;

  const canPromoteToRC =
    checklistReady &&
    hasApproval &&
    !isHealthCritical &&
    unresolvedCriticalCount === 0 &&
    rolloutStatus !== 'production_live';

  const canPromoteToProduction =
    rolloutStatus === 'release_candidate' &&
    checklistReady &&
    hasApproval &&
    !isHealthCritical &&
    unresolvedCriticalCount === 0;

  async function executeRCPromotion() {
    setBusy(true);
    setError(null);
    try {
      await dbPromoteToReleaseCandidate(shadowVersion, notes);
      setStep(null);
      setNotes('');
      onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function executeProductionPromotion() {
    setBusy(true);
    setError(null);
    try {
      await dbPromoteToProduction(shadowVersion, notes);
      setStep(null);
      setNotes('');
      onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const blockers: string[] = [];
  if (!checklistReady) blockers.push('Release checklist not ready');
  if (!hasApproval) blockers.push('No approval record');
  if (isHealthCritical) blockers.push('Health score is critical');
  if (unresolvedCriticalCount > 0) blockers.push(`${unresolvedCriticalCount} unresolved critical anomaly(s)`);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Promotion Controls</h2>
      </div>

      <div className="p-5 space-y-4">
        {/* Version summary */}
        <div className="grid grid-cols-2 gap-3">
          <VersionBox label="Live version" version={liveVersion} color="text-gray-300" />
          <VersionBox label="Shadow version" version={shadowVersion} color="text-cyan-300" />
        </div>

        {/* Blockers */}
        {blockers.length > 0 && (
          <div className="space-y-1.5">
            {blockers.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                {b}
              </div>
            ))}
          </div>
        )}

        {/* RC promotion */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-white flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5 text-amber-400" />
                Promote to Release Candidate
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Freezes shadow version for promotion. No traffic change yet.
              </div>
            </div>
            <button
              onClick={() => setStep('rc')}
              disabled={!canPromoteToRC || busy}
              className={`text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-30 ${
                canPromoteToRC
                  ? 'bg-amber-700 hover:bg-amber-600 text-white'
                  : 'bg-gray-800 text-gray-500 border border-gray-700'
              }`}
            >
              Promote to RC
            </button>
          </div>
        </div>

        {/* Production promotion */}
        <div className="border-t border-gray-800 pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-white flex items-center gap-2">
                <Rocket className="w-3.5 h-3.5 text-teal-400" />
                Promote to Production
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Sets live_version = shadow_version. Disables all beta flags. Requires RC status.
              </div>
            </div>
            <button
              onClick={() => setStep('prod')}
              disabled={!canPromoteToProduction || busy}
              className={`text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-30 ${
                canPromoteToProduction
                  ? 'bg-teal-700 hover:bg-teal-600 text-white'
                  : 'bg-gray-800 text-gray-500 border border-gray-700'
              }`}
            >
              Promote to Production
            </button>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}
      </div>

      {/* Confirmation modals */}
      {step === 'rc' && (
        <ConfirmModal
          title="Promote to Release Candidate"
          description={`Shadow version "${shadowVersion}" will be frozen as the release candidate. No traffic will change yet. This action is audited.`}
          confirmLabel="Confirm Promote to RC"
          confirmColor="bg-amber-700 hover:bg-amber-600"
          notes={notes}
          onNotesChange={setNotes}
          onConfirm={executeRCPromotion}
          onCancel={() => setStep(null)}
          busy={busy}
        />
      )}
      {step === 'prod' && (
        <ConfirmModal
          title="Promote to Production"
          description={`This will set live_version = "${shadowVersion}", disable all shadow routing flags, and mark the module as production_live. The previous live version will be preserved for rollback. This action is irreversible without a rollback.`}
          confirmLabel="Confirm Promote to Production"
          confirmColor="bg-teal-700 hover:bg-teal-600"
          notes={notes}
          onNotesChange={setNotes}
          onConfirm={executeProductionPromotion}
          onCancel={() => setStep(null)}
          busy={busy}
          dangerous
        />
      )}
    </div>
  );
}

function VersionBox({ label, version, color }: { label: string; version: string; color: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className={`text-sm font-semibold font-mono ${color}`}>{version}</div>
    </div>
  );
}

function ConfirmModal({
  title, description, confirmLabel, confirmColor, notes, onNotesChange,
  onConfirm, onCancel, busy, dangerous = false,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor: string;
  notes: string;
  onNotesChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  dangerous?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {dangerous && (
          <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-2 rounded-lg mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            This action changes what runs in production. It is fully audited and reversible via rollback.
          </div>
        )}

        <p className="text-sm text-gray-400 mb-4 leading-relaxed">{description}</p>

        <div className="mb-4">
          <label className="text-xs text-gray-500 block mb-1">Release notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={2}
            className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none resize-none"
            placeholder="Brief notes about this promotion..."
          />
        </div>

        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            className="text-xs text-gray-400 hover:text-white px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex items-center gap-2 text-xs font-semibold px-5 py-2 rounded-lg text-white transition-colors disabled:opacity-50 ${confirmColor}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
