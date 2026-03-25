import { useState } from 'react';
import { Plus, X, Percent, Users, AlertTriangle } from 'lucide-react';
import type { PlumbingRolloutState } from '../../../types/shadow';
import { dbAddOrgsToBeta, dbRemoveOrgFromBeta, dbSetRolloutPercentage } from '../../../lib/db/releaseDb';

interface PlumbingExpansionControlsProps {
  rolloutState: PlumbingRolloutState;
  healthScore?: number;
  onRefresh: () => void;
}

export default function PlumbingExpansionControls({
  rolloutState,
  healthScore,
  onRefresh,
}: PlumbingExpansionControlsProps) {
  const [newOrgId, setNewOrgId] = useState('');
  const [percentage, setPercentage] = useState(rolloutState.flags.rolloutPercentage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHealthCritical = healthScore != null && healthScore < 35;
  const allowedOrgs = rolloutState.flags.allowedOrgs;

  async function handleAddOrg() {
    if (!newOrgId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await dbAddOrgsToBeta([newOrgId.trim()]);
      setNewOrgId('');
      onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveOrg(orgId: string) {
    setBusy(true);
    try {
      await dbRemoveOrgFromBeta(orgId);
      onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleSetPercentage() {
    if (isHealthCritical) {
      setError('Health score is critical — cannot expand rollout. Override in god_mode only.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await dbSetRolloutPercentage(percentage);
      onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {isHealthCritical && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-4 py-3 rounded-xl">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
          Beta health score is critical ({healthScore}). Expansion is blocked. Resolve critical anomalies before increasing rollout coverage.
        </div>
      )}

      {error && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-4 py-2.5 rounded-xl">
          {error}
        </div>
      )}

      {/* Org beta */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-white">Org-Level Beta</h3>
          <span className="text-[10px] text-gray-500 ml-auto">{allowedOrgs.length} orgs enabled</span>
        </div>

        {allowedOrgs.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {allowedOrgs.map((orgId) => (
              <div
                key={orgId}
                className="flex items-center gap-1.5 text-[10px] font-mono text-gray-300 bg-gray-800 border border-gray-700 px-2.5 py-1.5 rounded-lg"
              >
                {orgId.slice(0, 12)}…
                <button
                  onClick={() => handleRemoveOrg(orgId)}
                  disabled={busy}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newOrgId}
            onChange={(e) => setNewOrgId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddOrg()}
            placeholder="Org UUID..."
            className="flex-1 text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none font-mono placeholder-gray-600"
          />
          <button
            onClick={handleAddOrg}
            disabled={busy || !newOrgId.trim()}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      {/* Percentage rollout */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Percent className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-white">Percentage Rollout</h3>
          <span className="text-[10px] text-gray-500 ml-auto">
            Current: {rolloutState.flags.rolloutPercentage}%
          </span>
        </div>

        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={percentage}
            onChange={(e) => setPercentage(Number(e.target.value))}
            disabled={isHealthCritical}
            className="flex-1 accent-cyan-500"
          />
          <span className="text-lg font-bold text-white tabular-nums w-14 text-right">{percentage}%</span>
        </div>

        <div className="flex items-center justify-between mt-3">
          <p className="text-[10px] text-gray-600">
            Routing is deterministic — same org/user always receives the same parser.
            {percentage >= 50 && ' 50%+ sets status to "Beta Expanded".'}
          </p>
          <button
            onClick={handleSetPercentage}
            disabled={busy || isHealthCritical || percentage === rolloutState.flags.rolloutPercentage}
            className="text-xs font-medium px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
