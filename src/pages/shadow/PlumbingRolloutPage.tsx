import { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck, Zap, AlertTriangle, XCircle, CheckCircle2,
  Users, Building2, RotateCcw, ChevronDown, ChevronUp,
  ClipboardCheck, Clock, Info, Activity,
} from 'lucide-react';
import ShadowLayout from '../../components/shadow/ShadowLayout';
import {
  dbGetPlumbingRolloutState,
  dbGetPlumbingApprovals,
  dbCreateApproval,
  dbEnableInternalBeta,
  dbEnableOrgBeta,
  dbActivateKillSwitch,
  dbRollback,
  dbDisableBeta,
  getRolloutStatusLabel,
  getRolloutStatusColor,
} from '../../lib/db/plumbingRolloutDb';
import { dbGetRecentPlumbingRuns } from '../../lib/db/plumbingRegressionDb';
import { dbGetModuleRolloutEvents } from '../../lib/db/rolloutEvents';
import type {
  PlumbingRolloutState,
  ModuleReleaseApprovalRecord,
  RolloutEventRecord,
} from '../../types/shadow';
import type { RegressionSuiteRunRecordExtended } from '../../lib/modules/parsers/plumbing/regression/types';

type ConfirmAction =
  | 'approve_beta'
  | 'enable_internal_beta'
  | 'enable_org_beta'
  | 'disable_beta'
  | 'kill_switch'
  | 'rollback'
  | null;

export default function PlumbingRolloutPage() {
  const [state, setState] = useState<PlumbingRolloutState | null>(null);
  const [approvals, setApprovals] = useState<ModuleReleaseApprovalRecord[]>([]);
  const [recentRuns, setRecentRuns] = useState<RegressionSuiteRunRecordExtended[]>([]);
  const [events, setEvents] = useState<RolloutEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [orgIdsInput, setOrgIdsInput] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [showAuditLog, setShowAuditLog] = useState(false);

  const reload = useCallback(async () => {
    const [s, a, runs, ev] = await Promise.all([
      dbGetPlumbingRolloutState(),
      dbGetPlumbingApprovals(),
      dbGetRecentPlumbingRuns(10).catch(() => []),
      dbGetModuleRolloutEvents('plumbing_parser', 30),
    ]);
    setState(s);
    setApprovals(a);
    setRecentRuns(runs as RegressionSuiteRunRecordExtended[]);
    setEvents(ev);
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  async function handleConfirm() {
    if (!confirmAction) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      switch (confirmAction) {
        case 'approve_beta':
          await dbCreateApproval({
            version: state?.moduleVersion?.shadow_version ?? '1.0.0',
            approvalType: 'beta',
            regressionSuiteRunId: selectedRunId || undefined,
            approvalNotes: approvalNotes || undefined,
          });
          setSuccess('Module approved for beta. Shadow parser is NOT yet active — enable a beta mode to activate it.');
          break;
        case 'enable_internal_beta':
          await dbEnableInternalBeta();
          setSuccess('Internal beta enabled. Shadow parser is now active for internal admins only.');
          break;
        case 'enable_org_beta': {
          const ids = orgIdsInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
          if (ids.length === 0) { setError('Enter at least one org ID.'); setBusy(false); return; }
          await dbEnableOrgBeta(ids);
          setSuccess(`Org beta enabled for ${ids.length} organisation(s).`);
          break;
        }
        case 'disable_beta':
          await dbDisableBeta();
          setSuccess('Beta disabled. Live parser is now used for all users.');
          break;
        case 'kill_switch':
          await dbActivateKillSwitch();
          setSuccess('Kill switch activated. All routing is now using the live parser.');
          break;
        case 'rollback':
          await dbRollback();
          setSuccess('Full rollback complete. All flags cleared, status set to rolled_back.');
          break;
      }
      setConfirmAction(null);
      setApprovalNotes('');
      setOrgIdsInput('');
      setSelectedRunId('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <ShadowLayout>
        <div className="text-center py-16 text-gray-500 text-sm">Loading rollout state...</div>
      </ShadowLayout>
    );
  }

  const rolloutStatus = state?.moduleVersion?.rollout_status ?? 'live_only';
  const flags = state?.flags;
  const killActive = flags?.killSwitch ?? false;
  const betaActive = flags?.betaEnabled ?? false;
  const hasApproval = !!state?.latestApproval;
  const latestRun = recentRuns[0] ?? null;
  const latestRunRec = latestRun?.recommendation ?? null;
  const regressionBlocked = latestRunRec === 'blocked_by_critical_failures';
  const regressionPassed = latestRunRec === 'ready_for_internal_beta';
  const staleRegression = latestRun
    ? Date.now() - new Date(latestRun.created_at ?? '').getTime() > 7 * 24 * 60 * 60 * 1000
    : true;

  return (
    <ShadowLayout>
      <div className="max-w-5xl mx-auto space-y-6">

          {/* Page header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white">Plumbing Parser — Rollout Control</h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Manage internal beta rollout for <code className="text-cyan-400 text-xs">plumbing_parser</code>.
                Regression results inform decisions — they do not trigger rollout automatically.
              </p>
            </div>
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
              killActive
                ? 'text-red-300 border-red-500/40 bg-red-500/10'
                : betaActive
                  ? 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10'
                  : 'text-gray-400 border-gray-700 bg-gray-800'
            }`}>
              {killActive ? 'KILL SWITCH ACTIVE' : getRolloutStatusLabel(rolloutStatus)}
            </span>
          </div>

          {/* Toast messages */}
          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-xl">
              <XCircle className="w-4 h-4 shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-sm px-4 py-3 rounded-xl">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {success}
              <button onClick={() => setSuccess(null)} className="ml-auto text-teal-400 hover:text-teal-200">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Kill switch banner */}
          {killActive && (
            <div className="flex items-center gap-3 bg-red-500/15 border border-red-500/40 text-red-200 px-5 py-4 rounded-xl">
              <XCircle className="w-5 h-5 shrink-0 text-red-400" />
              <div>
                <div className="font-semibold text-sm">Kill switch is active</div>
                <div className="text-xs text-red-300/80 mt-0.5">
                  All plumbing parser routing is using the LIVE parser only. Shadow parser is completely bypassed.
                </div>
              </div>
            </div>
          )}

          {/* Warnings */}
          <WarningsBanner
            staleRegression={staleRegression}
            hasApproval={hasApproval}
            regressionBlocked={regressionBlocked}
            betaActive={betaActive}
          />

          <div className="grid lg:grid-cols-3 gap-6">

            {/* Left: State + Controls */}
            <div className="lg:col-span-2 space-y-5">

              {/* Current State Panel */}
              <StatePanel state={state} rolloutStatus={rolloutStatus} />

              {/* Regression Gate */}
              <RegressionGatePanel
                latestRun={latestRun}
                latestRunRec={latestRunRec}
                regressionBlocked={regressionBlocked}
                regressionPassed={regressionPassed}
                staleRegression={staleRegression}
              />

              {/* Control Actions */}
              <ControlsPanel
                rolloutStatus={rolloutStatus}
                hasApproval={hasApproval}
                betaActive={betaActive}
                killActive={killActive}
                regressionBlocked={regressionBlocked}
                onAction={setConfirmAction}
              />

              {/* Confirmation Modal */}
              {confirmAction && (
                <ConfirmationPanel
                  action={confirmAction}
                  approvalNotes={approvalNotes}
                  onNotesChange={setApprovalNotes}
                  orgIdsInput={orgIdsInput}
                  onOrgIdsChange={setOrgIdsInput}
                  recentRuns={recentRuns}
                  selectedRunId={selectedRunId}
                  onRunIdChange={setSelectedRunId}
                  regressionBlocked={regressionBlocked}
                  busy={busy}
                  onConfirm={handleConfirm}
                  onCancel={() => setConfirmAction(null)}
                />
              )}
            </div>

            {/* Right: Status sidebar */}
            <div className="space-y-4">
              <FlagsPanel flags={state?.flags} />
              <ApprovalsPanel approvals={approvals} />

              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowAuditLog(!showAuditLog)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:text-white"
                >
                  <span className="flex items-center gap-2"><Activity className="w-4 h-4 text-gray-500" /> Rollout Events</span>
                  {showAuditLog ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>
                {showAuditLog && <EventLog events={events} />}
              </div>
            </div>
          </div>
      </div>
    </ShadowLayout>
  );
}

// ─── Sub-panels ──────────────────────────────────────────────────────────────

function WarningsBanner({ staleRegression, hasApproval, regressionBlocked, betaActive }: {
  staleRegression: boolean;
  hasApproval: boolean;
  regressionBlocked: boolean;
  betaActive: boolean;
}) {
  const warnings: string[] = [];
  if (staleRegression) warnings.push('Regression suite has not been run in the last 7 days. Run it before approving.');
  if (!hasApproval && betaActive) warnings.push('No approval record exists for this rollout. An approval is required before enabling beta.');
  if (regressionBlocked) warnings.push('Latest regression run has critical failures. Override with god_mode only.');

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs px-4 py-3 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          {w}
        </div>
      ))}
    </div>
  );
}

function StatePanel({ state, rolloutStatus }: {
  state: PlumbingRolloutState | null;
  rolloutStatus: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Info className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-white">Current State</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <StateRow label="Rollout Status" value={getRolloutStatusLabel(rolloutStatus)} valueClass={getRolloutStatusColor(rolloutStatus)} />
        <StateRow label="Live Version" value={state?.moduleVersion?.live_version ?? '—'} />
        <StateRow label="Shadow Version" value={state?.moduleVersion?.shadow_version ?? '—'} />
        <StateRow label="Candidate" value={state?.moduleVersion?.promoted_candidate_version ?? '—'} />
        <StateRow label="Last Updated" value={state?.moduleVersion?.updated_at ? new Date(state.moduleVersion.updated_at).toLocaleString() : '—'} />
        <StateRow label="Approval" value={state?.latestApproval ? `${state.latestApproval.approval_type} — ${new Date(state.latestApproval.created_at).toLocaleDateString()}` : 'None'} valueClass={state?.latestApproval ? 'text-teal-400' : 'text-gray-600'} />
      </div>
    </div>
  );
}

function StateRow({ label, value, valueClass = 'text-gray-200' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-600 mb-0.5">{label}</div>
      <div className={`text-xs font-medium font-mono ${valueClass}`}>{value}</div>
    </div>
  );
}

function RegressionGatePanel({ latestRun, latestRunRec, regressionBlocked, regressionPassed, staleRegression }: {
  latestRun: RegressionSuiteRunRecordExtended | null;
  latestRunRec: string | null;
  regressionBlocked: boolean;
  regressionPassed: boolean;
  staleRegression: boolean;
}) {
  const borderColor = regressionBlocked
    ? 'border-red-500/40'
    : regressionPassed
      ? 'border-teal-500/40'
      : 'border-gray-700';

  return (
    <div className={`bg-gray-900 border rounded-xl p-5 ${borderColor}`}>
      <div className="flex items-center gap-2 mb-4">
        <ClipboardCheck className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-white">Regression Gate</h2>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ml-auto ${
          regressionBlocked ? 'text-red-300 border-red-500/40 bg-red-500/10'
          : regressionPassed ? 'text-teal-300 border-teal-500/40 bg-teal-500/10'
          : 'text-gray-500 border-gray-700 bg-gray-800'
        }`}>
          {regressionBlocked ? 'BLOCKED' : regressionPassed ? 'PASSED' : latestRunRec === 'needs_more_work' ? 'NEEDS WORK' : 'NO DATA'}
        </span>
      </div>
      {latestRun ? (
        <div className="space-y-2 text-sm">
          <StateRow
            label="Latest Run Recommendation"
            value={latestRunRec ?? '—'}
            valueClass={regressionBlocked ? 'text-red-400' : regressionPassed ? 'text-teal-400' : 'text-amber-400'}
          />
          <StateRow label="Run Date" value={new Date(latestRun.created_at ?? '').toLocaleString()} />
          <StateRow label="Cases Total" value={String(latestRun.cases_total ?? '—')} />
          <StateRow label="Cases Passed" value={String(latestRun.cases_passed ?? '—')} />
          {staleRegression && (
            <p className="text-xs text-amber-400 mt-2">
              This run is more than 7 days old. Consider running a fresh regression suite before approval.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-600">
          No regression suite runs found for <code className="text-gray-500">plumbing_parser</code>.{' '}
          <a href="/shadow/modules/plumbing_parser/regression" className="text-cyan-400 hover:underline">
            Create and run a regression suite →
          </a>
        </p>
      )}
    </div>
  );
}

function ControlsPanel({
  rolloutStatus, hasApproval, betaActive, killActive, regressionBlocked, onAction,
}: {
  rolloutStatus: string;
  hasApproval: boolean;
  betaActive: boolean;
  killActive: boolean;
  regressionBlocked: boolean;
  onAction: (a: ConfirmAction) => void;
}) {
  const canApprove = !['approved_for_beta', 'beta_internal', 'beta_limited', 'full_release'].includes(rolloutStatus);
  const canEnableInternal = hasApproval && !betaActive;
  const canEnableOrg = hasApproval && !betaActive;
  const canDisableBeta = betaActive;
  const canRollback = rolloutStatus !== 'live_only' && rolloutStatus !== 'idle';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-5">
        <ShieldCheck className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-white">Rollout Controls</h2>
      </div>

      <div className="space-y-3">
        {/* Approve for Beta */}
        <ControlRow
          icon={<ClipboardCheck className="w-4 h-4" />}
          label="Approve for Beta"
          description="Link a regression run result and record explicit approval. Does NOT activate shadow parser yet."
          disabled={!canApprove}
          disabledReason={!canApprove ? 'Already approved or in beta' : undefined}
          variant="amber"
          onClick={() => onAction('approve_beta')}
        />

        {/* Enable Internal Beta */}
        <ControlRow
          icon={<Users className="w-4 h-4" />}
          label="Enable Internal Beta"
          description="Shadow parser activates for internal admins only. No production users affected."
          disabled={!canEnableInternal}
          disabledReason={!hasApproval ? 'Approval required first' : betaActive ? 'Beta already active' : undefined}
          variant="cyan"
          onClick={() => onAction('enable_internal_beta')}
        />

        {/* Enable Org Beta */}
        <ControlRow
          icon={<Building2 className="w-4 h-4" />}
          label="Enable Org-Level Beta"
          description="Shadow parser activates for selected organisations. Specify org IDs in the next step."
          disabled={!canEnableOrg}
          disabledReason={!hasApproval ? 'Approval required first' : betaActive ? 'Beta already active' : undefined}
          variant="teal"
          onClick={() => onAction('enable_org_beta')}
        />

        {/* Disable Beta */}
        {canDisableBeta && (
          <ControlRow
            icon={<XCircle className="w-4 h-4" />}
            label="Disable Beta"
            description="Turns off shadow parser for all users. Status reverts to approved_for_beta."
            disabled={false}
            variant="gray"
            onClick={() => onAction('disable_beta')}
          />
        )}

        <div className="border-t border-gray-800 pt-3 space-y-3">
          {/* Kill Switch */}
          <ControlRow
            icon={<Zap className="w-4 h-4" />}
            label={killActive ? 'Kill Switch is Active' : 'Activate Kill Switch'}
            description="Instantly forces ALL routing to use live parser. Takes effect immediately."
            disabled={killActive}
            disabledReason={killActive ? 'Already active — rollback to reset all flags' : undefined}
            variant="red"
            onClick={() => onAction('kill_switch')}
          />

          {/* Rollback */}
          <ControlRow
            icon={<RotateCcw className="w-4 h-4" />}
            label="Rollback to Live"
            description="Clears ALL plumbing_parser flags, sets status to rolled_back. One-click full reset."
            disabled={!canRollback}
            disabledReason={!canRollback ? 'Already at live_only state' : undefined}
            variant="red"
            destructive
            onClick={() => onAction('rollback')}
          />
        </div>

        {regressionBlocked && (
          <p className="text-xs text-red-400 mt-2">
            Regression is blocked by critical failures. These actions are available with god_mode override — proceed with caution.
          </p>
        )}
      </div>
    </div>
  );
}

function ControlRow({
  icon, label, description, disabled, disabledReason, variant, destructive = false, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  disabled: boolean;
  disabledReason?: string;
  variant: 'amber' | 'cyan' | 'teal' | 'gray' | 'red';
  destructive?: boolean;
  onClick: () => void;
}) {
  const colors: Record<string, string> = {
    amber: 'text-amber-300 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20',
    cyan: 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20',
    teal: 'text-teal-300 border-teal-500/40 bg-teal-500/10 hover:bg-teal-500/20',
    gray: 'text-gray-300 border-gray-600 bg-gray-800 hover:bg-gray-700',
    red: destructive
      ? 'text-red-200 border-red-500/60 bg-red-500/20 hover:bg-red-500/30'
      : 'text-red-300 border-red-500/40 bg-red-500/10 hover:bg-red-500/20',
  };

  return (
    <div className={`flex items-start gap-4 p-3 rounded-xl border transition-colors ${
      disabled ? 'opacity-40 cursor-not-allowed border-gray-800 bg-gray-900' : `cursor-pointer ${colors[variant]}`
    }`} onClick={disabled ? undefined : onClick}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs opacity-70 mt-0.5">{description}</div>
        {disabled && disabledReason && (
          <div className="text-xs text-gray-600 mt-1">— {disabledReason}</div>
        )}
      </div>
    </div>
  );
}

function ConfirmationPanel({
  action, approvalNotes, onNotesChange, orgIdsInput, onOrgIdsChange,
  recentRuns, selectedRunId, onRunIdChange,
  regressionBlocked, busy, onConfirm, onCancel,
}: {
  action: ConfirmAction;
  approvalNotes: string;
  onNotesChange: (v: string) => void;
  orgIdsInput: string;
  onOrgIdsChange: (v: string) => void;
  recentRuns: RegressionSuiteRunRecordExtended[];
  selectedRunId: string;
  onRunIdChange: (v: string) => void;
  regressionBlocked: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDestructive = action === 'rollback' || action === 'kill_switch';

  const labels: Record<NonNullable<ConfirmAction>, string> = {
    approve_beta: 'Confirm Beta Approval',
    enable_internal_beta: 'Enable Internal Beta',
    enable_org_beta: 'Enable Org-Level Beta',
    disable_beta: 'Disable Beta',
    kill_switch: 'Activate Kill Switch',
    rollback: 'Full Rollback',
  };

  const descriptions: Record<NonNullable<ConfirmAction>, string> = {
    approve_beta: 'You are creating an explicit approval record for this module version. Shadow parser will NOT be activated yet.',
    enable_internal_beta: 'Shadow parser will become active for all internal_admin and god_mode users immediately.',
    enable_org_beta: 'Shadow parser will become active for the specified organisations. All other users continue using live parser.',
    disable_beta: 'Shadow parser will be disabled for all users. The approval record is preserved.',
    kill_switch: 'ALL plumbing parser routing will immediately revert to the live parser. This affects active sessions.',
    rollback: 'All plumbing_parser feature flags will be disabled and status set to rolled_back. This is a full reset.',
  };

  return (
    <div className={`border rounded-xl p-5 ${
      isDestructive ? 'bg-red-500/5 border-red-500/30' : 'bg-gray-900 border-amber-500/30'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className={`w-4 h-4 ${isDestructive ? 'text-red-400' : 'text-amber-400'}`} />
        <h3 className={`text-sm font-semibold ${isDestructive ? 'text-red-200' : 'text-amber-200'}`}>
          {action ? labels[action] : ''}
        </h3>
      </div>

      <p className="text-xs text-gray-400 mb-4">{action ? descriptions[action] : ''}</p>

      {action === 'approve_beta' && (
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Link Regression Run (optional)</label>
            <select
              value={selectedRunId}
              onChange={(e) => onRunIdChange(e.target.value)}
              className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500/50"
            >
              <option value="">— No regression run linked —</option>
              {recentRuns.slice(0, 10).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.suite_name ?? r.id.slice(0, 8)} — {r.recommendation ?? 'unknown'} — {new Date(r.created_at ?? '').toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Approval Notes (optional)</label>
            <textarea
              value={approvalNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="e.g. Reviewed suite output. No critical failures. Approving for internal beta only."
              rows={3}
              className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:border-amber-500/50 resize-none"
            />
          </div>
        </div>
      )}

      {action === 'enable_org_beta' && (
        <div className="mb-4">
          <label className="text-xs text-gray-400 mb-1 block">Organisation IDs (one per line or comma-separated)</label>
          <textarea
            value={orgIdsInput}
            onChange={(e) => onOrgIdsChange(e.target.value)}
            placeholder="org_abc123&#10;org_def456"
            rows={4}
            className="w-full text-xs bg-gray-800 border border-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:border-teal-500/50 resize-none font-mono"
          />
        </div>
      )}

      {regressionBlocked && !isDestructive && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-lg mb-4">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Regression has critical failures. You are overriding the gate as god_mode. Ensure you have reviewed the failures.
        </div>
      )}

      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${
            isDestructive
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-amber-600 hover:bg-amber-500 text-white'
          }`}
        >
          {busy ? 'Processing...' : 'Confirm'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FlagsPanel({ flags }: { flags: PlumbingRolloutState['flags'] | undefined }) {
  if (!flags) return null;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-xs font-semibold text-gray-400 mb-3">Active Flags</h3>
      <div className="space-y-2">
        <FlagRow label="kill_switch" active={flags.killSwitch} danger />
        <FlagRow label="beta_enabled" active={flags.betaEnabled} />
        <FlagRow label="internal_only" active={flags.internalOnly} />
        <FlagRow label="allowed_orgs" active={flags.allowedOrgs.length > 0} extra={flags.allowedOrgs.length > 0 ? `${flags.allowedOrgs.length} org(s)` : ''} />
        <FlagRow label="rollout_pct" active={flags.rolloutPercentage > 0} extra={flags.rolloutPercentage > 0 ? `${flags.rolloutPercentage}%` : ''} />
      </div>
    </div>
  );
}

function FlagRow({ label, active, danger = false, extra }: { label: string; active: boolean; danger?: boolean; extra?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-mono text-gray-400">{label}</span>
      <div className="flex items-center gap-1.5">
        {extra && <span className="text-gray-500">{extra}</span>}
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
          active
            ? danger ? 'bg-red-500/20 text-red-300' : 'bg-teal-500/20 text-teal-300'
            : 'bg-gray-800 text-gray-600'
        }`}>
          {active ? 'ON' : 'OFF'}
        </span>
      </div>
    </div>
  );
}

function ApprovalsPanel({ approvals }: { approvals: ModuleReleaseApprovalRecord[] }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-gray-500" />
        <h3 className="text-xs font-semibold text-gray-300">Approval History</h3>
      </div>
      {approvals.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-gray-600">No approvals yet</div>
      ) : (
        <div className="divide-y divide-gray-800/50">
          {approvals.slice(0, 5).map((a) => (
            <div key={a.id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  a.approval_type === 'full_release'
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}>
                  {a.approval_type === 'full_release' ? 'FULL RELEASE' : 'BETA'}
                </span>
                <span className="text-[10px] text-gray-600">
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
              </div>
              {a.approval_notes && (
                <p className="text-[10px] text-gray-500 mt-1 line-clamp-2">{a.approval_notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventLog({ events }: { events: RolloutEventRecord[] }) {
  const EVENT_COLOR: Record<string, string> = {
    kill_switch_enabled: 'text-red-400',
    kill_switch_disabled: 'text-green-400',
    rollback_triggered: 'text-orange-400',
    beta_enabled: 'text-cyan-400',
    org_rollout_enabled: 'text-teal-400',
    global_promoted: 'text-green-300',
  };
  if (events.length === 0) {
    return <div className="px-4 py-5 text-center text-xs text-gray-600">No events yet</div>;
  }
  return (
    <div className="divide-y divide-gray-800/50">
      {events.map((ev) => (
        <div key={ev.id} className="px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-mono font-medium ${EVENT_COLOR[ev.event_type] ?? 'text-gray-400'}`}>
              {ev.event_type}
            </span>
            <span className="text-[10px] text-gray-700">
              {new Date(ev.created_at).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-600 font-mono">
            <Clock className="w-2.5 h-2.5 shrink-0" />
            {JSON.stringify(ev.previous_state_json ?? {}).slice(0, 30)} →{' '}
            {JSON.stringify(ev.new_state_json ?? {}).slice(0, 30)}
          </div>
        </div>
      ))}
    </div>
  );
}
