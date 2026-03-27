import { useEffect, useState } from 'react';
import {
  Zap, Plus, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, PauseCircle, RotateCcw,
  ArrowRight, ChevronRight, Flag, Clock,
} from 'lucide-react';
import ShadowLayout from '../../../components/shadow/ShadowLayout';
import {
  getRolloutPlans, getRolloutPlan, getRolloutPlanEvents,
  advanceRolloutStage, pauseRollout, rollbackPlan, completeRollout, createRolloutPlan,
  type RolloutPlan, type RolloutPlanEvent,
} from '../../../lib/shadow/phase4/rolloutManagerService';
import { getShadowVersions, type ShadowVersion } from '../../../lib/shadow/phase4/shadowVersioningService';

function StagePill({ stage }: { stage: RolloutPlan['rollout_stage'] }) {
  const map = {
    shadow_only: 'bg-gray-700 text-gray-300',
    limited:     'bg-blue-900/50 text-blue-300 border border-blue-800',
    expanded:    'bg-amber-900/50 text-amber-300 border border-amber-800',
    full:        'bg-green-900/50 text-green-300 border border-green-800',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[stage]}`}>{stage.replace('_', ' ')}</span>;
}

function StatusDot({ status }: { status: RolloutPlan['status'] }) {
  const map = {
    planned:     'bg-gray-500',
    active:      'bg-green-400',
    paused:      'bg-amber-400',
    rolled_back: 'bg-red-400',
    completed:   'bg-teal-400',
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${map[status] ?? 'bg-gray-500'}`} />
      <span className="text-xs text-gray-400 capitalize">{status.replace('_', ' ')}</span>
    </div>
  );
}

const STAGE_ORDER: RolloutPlan['rollout_stage'][] = ['shadow_only', 'limited', 'expanded', 'full'];
const STAGE_PCT: Record<string, number> = { shadow_only: 0, limited: 10, expanded: 40, full: 100 };

function StageProgressBar({ current }: { current: RolloutPlan['rollout_stage'] }) {
  const idx = STAGE_ORDER.indexOf(current);
  return (
    <div className="flex items-center gap-2">
      {STAGE_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${i <= idx ? 'bg-amber-400' : 'bg-gray-700'}`} />
          <span className={`text-xs ${i === idx ? 'text-amber-300 font-medium' : i < idx ? 'text-gray-500' : 'text-gray-700'}`}>
            {STAGE_PCT[s]}%
          </span>
          {i < STAGE_ORDER.length - 1 && (
            <div className={`w-6 h-px ${i < idx ? 'bg-amber-400' : 'bg-gray-700'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function PlanDetail({ plan, onRefresh }: { plan: RolloutPlan; onRefresh: () => void }) {
  const [events, setEvents] = useState<RolloutPlanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRolloutPlanEvents(plan.id).then((e) => { setEvents(e); setLoading(false); });
  }, [plan.id]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); onRefresh(); } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed');
    } finally { setBusy(false); }
  }

  const canAdvance = plan.status !== 'rolled_back' && plan.status !== 'completed'
    && plan.rollout_stage !== 'full';
  const canPause = plan.status === 'active';
  const canRollback = plan.status !== 'rolled_back' && plan.status !== 'completed';
  const canComplete = plan.rollout_stage === 'full' && plan.status === 'active';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Stage</div>
          <StagePill stage={plan.rollout_stage} />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Traffic</div>
          <div className="text-xl font-bold text-white">{plan.rollout_percentage}%</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Status</div>
          <StatusDot status={plan.status} />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Activated</div>
          <div className="text-sm text-white">
            {plan.activated_at ? new Date(plan.activated_at).toLocaleDateString() : '—'}
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-xs text-gray-500 mb-3">Rollout Progress</p>
        <StageProgressBar current={plan.rollout_stage} />
      </div>

      <div className="flex flex-wrap gap-2">
        {canAdvance && (
          <button
            onClick={() => act(() => advanceRolloutStage(plan.id))}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg disabled:opacity-40"
          >
            <ArrowRight className="w-4 h-4" /> Advance Stage
          </button>
        )}
        {canPause && (
          <button
            onClick={() => act(() => pauseRollout(plan.id, 'Paused by admin'))}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg disabled:opacity-40"
          >
            <PauseCircle className="w-4 h-4" /> Pause
          </button>
        )}
        {canComplete && (
          <button
            onClick={() => act(() => completeRollout(plan.id))}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-lg disabled:opacity-40"
          >
            <CheckCircle className="w-4 h-4" /> Mark Complete
          </button>
        )}
        {canRollback && (
          <button
            onClick={() => {
              if (!confirm('Rollback this plan to shadow_only stage?')) return;
              act(() => rollbackPlan(plan.id, 'Admin triggered rollback'));
            }}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-red-900/40 hover:bg-red-900/70 text-red-300 text-sm font-medium rounded-lg border border-red-800 disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4" /> Rollback
          </button>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Event Log</h3>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-600 text-sm">Loading…</div>
        ) : events.length === 0 ? (
          <div className="p-6 text-center text-gray-600 text-sm">No events yet.</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 px-5 py-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-gray-400">{ev.event_type}</p>
                  <p className="text-xs text-gray-300 mt-0.5">{ev.description}</p>
                  {ev.previous_stage && ev.new_stage && (
                    <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                      {ev.previous_stage} <ChevronRight className="w-3 h-3" /> {ev.new_stage}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-600 flex-shrink-0">
                  {new Date(ev.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface CreatePlanModalProps {
  versions: ShadowVersion[];
  onClose: () => void;
  onCreated: () => void;
}

function CreatePlanModal({ versions, onClose, onCreated }: CreatePlanModalProps) {
  const [versionId, setVersionId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approvedVersions = versions.filter((v) => v.status === 'approved');

  async function handleCreate() {
    if (!versionId) { setError('Select an approved version.'); return; }
    const version = approvedVersions.find((v) => v.id === versionId);
    if (!version) { setError('Version not found.'); return; }
    setLoading(true);
    setError(null);
    try {
      await createRolloutPlan({ versionId, moduleKey: version.module_key, notes: notes || undefined });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create plan');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-lg font-semibold text-white">Create Rollout Plan</h2>
        <p className="text-xs text-gray-400">Only versions in <span className="text-green-300">Approved</span> status are eligible for rollout.</p>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Approved Version</label>
          {approvedVersions.length === 0 ? (
            <p className="text-xs text-amber-400 bg-amber-900/20 rounded-lg p-2 border border-amber-800">
              No approved versions available. Evaluate and approve a version first.
            </p>
          ) : (
            <select
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              <option value="">— select version —</option>
              {approvedVersions.map((v) => (
                <option key={v.id} value={v.id}>{v.version_name} ({v.module_key})</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 resize-none"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={loading || approvedVersions.length === 0}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShadowRolloutPlansPage() {
  const [plans, setPlans] = useState<RolloutPlan[]>([]);
  const [versions, setVersions] = useState<ShadowVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<RolloutPlan | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [p, v] = await Promise.all([getRolloutPlans(), getShadowVersions()]);
    setPlans(p);
    setVersions(v);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function refreshPlan(planId: string) {
    const updated = await getRolloutPlan(planId);
    if (updated) {
      setPlans((prev) => prev.map((p) => p.id === planId ? updated : p));
      if (selectedPlan?.id === planId) setSelectedPlan(updated);
    }
  }

  const active = plans.filter((p) => p.status === 'active').length;
  const completed = plans.filter((p) => p.status === 'completed').length;

  return (
    <ShadowLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {selectedPlan ? (
          <>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedPlan(null)}
                className="text-gray-400 hover:text-white text-sm flex items-center gap-1"
              >
                <ChevronRight className="w-4 h-4 rotate-180" /> Rollout Plans
              </button>
              <ChevronRight className="w-4 h-4 text-gray-700" />
              <span className="text-white font-semibold font-mono text-sm">{selectedPlan.id.slice(0, 8)}…</span>
              <StagePill stage={selectedPlan.rollout_stage} />
            </div>
            <PlanDetail
              plan={selectedPlan}
              onRefresh={async () => { await refreshPlan(selectedPlan.id); await load(); }}
            />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="w-6 h-6 text-amber-400" />
                <div>
                  <h1 className="text-xl font-bold text-white">Rollout Plans</h1>
                  <p className="text-xs text-gray-500 mt-0.5">Staged deployment — shadow only → limited → expanded → full</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={load} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg">
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg"
                >
                  <Plus className="w-4 h-4" /> New Plan
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total Plans', value: plans.length, color: 'text-white' },
                { label: 'Active', value: active, color: 'text-green-400' },
                { label: 'Completed', value: completed, color: 'text-teal-400' },
              ].map((s) => (
                <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/80">
                Stage advancement is manual and requires explicit admin action. Rollback is always available.
                No stage changes occur automatically.
              </p>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-600">Loading plans…</div>
            ) : plans.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-gray-800 rounded-2xl">
                <Zap className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No rollout plans created yet.</p>
                <p className="text-gray-600 text-xs mt-1">Approve a version first via Promotion Decisions.</p>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-xs text-gray-500">
                      <th className="text-left px-5 py-3 font-medium">Plan</th>
                      <th className="text-left px-4 py-3 font-medium">Module</th>
                      <th className="text-left px-4 py-3 font-medium">Stage</th>
                      <th className="text-left px-4 py-3 font-medium">Status</th>
                      <th className="text-right px-4 py-3 font-medium">Traffic</th>
                      <th className="text-right px-5 py-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {plans.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedPlan(p)}
                        className="hover:bg-gray-800/50 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono text-gray-400">{p.id.slice(0, 8)}…</span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.module_key}</td>
                        <td className="px-4 py-3"><StagePill stage={p.rollout_stage} /></td>
                        <td className="px-4 py-3"><StatusDot status={p.status} /></td>
                        <td className="px-4 py-3 text-right text-white font-bold">{p.rollout_percentage}%</td>
                        <td className="px-5 py-3 text-right text-gray-500 text-xs">
                          {new Date(p.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreatePlanModal
          versions={versions}
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </ShadowLayout>
  );
}
