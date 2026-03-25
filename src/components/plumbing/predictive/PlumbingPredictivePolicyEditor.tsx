import { useState } from 'react';
import { CheckCircle2, Play, Save, AlertTriangle } from 'lucide-react';
import type { RiskPolicyRecord, RiskPolicyConfig, RoutingRecommendation, RiskTier } from '../../../lib/modules/parsers/plumbing/predictive/riskTypes';
import { validatePolicyConfig, AGGRESSIVE_BETA_POLICY, DEFAULT_CONSERVATIVE_POLICY } from '../../../lib/modules/parsers/plumbing/predictive/riskPolicyEngine';
import { dbActivateRiskPolicy, dbCreateRiskPolicy, dbUpdateRiskPolicy } from '../../../lib/db/predictiveDb';

interface PlumbingPredictivePolicyEditorProps {
  policies: RiskPolicyRecord[];
  onRefresh: () => void;
}

const VALID_ACTIONS: RoutingRecommendation[] = [
  'normal_live_path',
  'shadow_compare_recommended',
  'shadow_only_recommended',
  'manual_review_recommended',
  'org_watchlist_recommended',
];

const ACTION_LABELS: Record<RoutingRecommendation, string> = {
  normal_live_path: 'Normal live path',
  shadow_compare_recommended: 'Shadow compare (advisory)',
  shadow_only_recommended: 'Shadow only (advisory)',
  manual_review_recommended: 'Manual review (advisory)',
  org_watchlist_recommended: 'Org watchlist (advisory)',
};

export default function PlumbingPredictivePolicyEditor({ policies, onRefresh }: PlumbingPredictivePolicyEditorProps) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newJson, setNewJson] = useState(() => JSON.stringify(DEFAULT_CONSERVATIVE_POLICY, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function handleJsonChange(v: string) {
    setNewJson(v);
    try {
      const parsed = JSON.parse(v);
      const { valid, errors } = validatePolicyConfig(parsed);
      setParseError(valid ? null : errors.join('; '));
    } catch (e) {
      setParseError(String(e));
    }
  }

  async function handleActivate(policyId: string) {
    setBusy(policyId);
    try {
      await dbActivateRiskPolicy(policyId);
      onRefresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleCreate() {
    if (parseError || !newName.trim()) return;
    setBusy('new');
    try {
      const parsed = JSON.parse(newJson) as RiskPolicyConfig;
      await dbCreateRiskPolicy({ policyName: newName, description: newDesc, policyJson: parsed });
      setShowNew(false);
      setNewName('');
      setNewDesc('');
      setNewJson(JSON.stringify(DEFAULT_CONSERVATIVE_POLICY, null, 2));
      onRefresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Risk Policies</h2>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-700 hover:border-teal-500/50 text-gray-400 hover:text-teal-300 transition-colors"
        >
          {showNew ? 'Cancel' : 'New policy'}
        </button>
      </div>

      {showNew && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Policy name *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none"
                placeholder="e.g. Conservative Beta Policy"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Description</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none"
                placeholder="Brief description..."
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mb-1">
            <label className="text-[10px] text-gray-500">Policy JSON</label>
            <button
              onClick={() => setNewJson(JSON.stringify(AGGRESSIVE_BETA_POLICY, null, 2))}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Load aggressive beta template
            </button>
            <button
              onClick={() => setNewJson(JSON.stringify(DEFAULT_CONSERVATIVE_POLICY, null, 2))}
              className="text-[10px] text-gray-500 hover:text-white transition-colors"
            >
              Reset to conservative
            </button>
          </div>
          <textarea
            value={newJson}
            onChange={(e) => handleJsonChange(e.target.value)}
            rows={16}
            className={`w-full text-[10px] font-mono bg-gray-800 border ${parseError ? 'border-red-500/50' : 'border-gray-700'} text-gray-200 px-3 py-2.5 rounded-lg focus:outline-none resize-y`}
          />
          {parseError && (
            <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-gray-600">
              New policy is inactive by default. Activate manually after creation.
            </p>
            <button
              onClick={handleCreate}
              disabled={!!parseError || !newName.trim() || busy === 'new'}
              className="flex items-center gap-2 text-xs font-semibold px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {busy === 'new' ? 'Saving...' : 'Save policy'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
        {policies.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-600">No policies configured</div>
        )}
        {policies.map((policy) => {
          const config = policy.policy_json;
          return (
            <div key={policy.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{policy.policy_name}</span>
                    {policy.is_active && (
                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  {policy.description && (
                    <p className="text-[10px] text-gray-500 mt-0.5">{policy.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {(['low', 'medium', 'high', 'critical'] as RiskTier[]).map((tier) => {
                      const tierConfig = config[tier];
                      return (
                        <div key={tier} className="text-[10px] text-gray-500 capitalize">
                          <span className="text-gray-400">{tier}: </span>
                          {ACTION_LABELS[tierConfig.action]}
                          {tierConfig.shadowCompare && ' + shadow'}
                          {tierConfig.reviewRequired && ' + review req'}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-600">
                    {config.autoShadowRouteEnabled && <span className="text-cyan-400">Auto-shadow ON</span>}
                    {!config.autoShadowRouteEnabled && <span>Auto-shadow: off</span>}
                    {config.orgWatchlistEnabled && <span className="text-amber-400">Org watchlist ON</span>}
                  </div>
                </div>
                {!policy.is_active && (
                  <button
                    onClick={() => handleActivate(policy.id)}
                    disabled={busy === policy.id}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-teal-900 hover:bg-teal-800 text-teal-300 transition-colors disabled:opacity-40 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Activate
                  </button>
                )}
                {policy.is_active && (
                  <div className="flex items-center gap-1.5 text-xs text-teal-400 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
