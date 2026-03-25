import { supabase } from '../supabase';
import { logAdminAction } from '../shadow/auditLogger';
import { dbUpdateModuleVersion } from './moduleVersions';
import { dbGetAllFlags, dbToggleFlag, dbUpsertFlag } from './featureFlags';
import type {
  ModuleReleaseApprovalRecord,
  PlumbingRolloutState,
  FeatureFlagRecord,
  RolloutStatus,
} from '../../types/shadow';

const MODULE_KEY = 'plumbing_parser';

export async function dbGetPlumbingRolloutState(): Promise<PlumbingRolloutState> {
  const [versionData, approvalData, flagData] = await Promise.all([
    supabase
      .from('module_versions')
      .select('*')
      .eq('module_key', MODULE_KEY)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('module_release_approvals')
      .select('*')
      .eq('module_key', MODULE_KEY)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    dbGetAllFlags({ moduleKey: MODULE_KEY }),
  ]);

  const flags = (flagData ?? []) as FeatureFlagRecord[];

  function flagEnabled(key: string): boolean {
    return flags.find((f) => f.flag_key === key)?.enabled ?? false;
  }

  function flagConfig(key: string): Record<string, unknown> {
    return flags.find((f) => f.flag_key === key)?.config_json ?? {};
  }

  const allowedOrgsConfig = flagConfig('plumbing_parser.allowed_orgs') as { orgIds?: string[] };
  const rolloutPctConfig = flagConfig('plumbing_parser.rollout_percentage') as { percentage?: number };

  return {
    moduleVersion: versionData.data ?? null,
    latestApproval: approvalData.data as ModuleReleaseApprovalRecord | null,
    flags: {
      killSwitch: flagEnabled('plumbing_parser.kill_switch'),
      betaEnabled: flagEnabled('plumbing_parser.beta_enabled'),
      internalOnly: flagEnabled('plumbing_parser.internal_only'),
      allowedOrgs: allowedOrgsConfig.orgIds ?? [],
      rolloutPercentage: rolloutPctConfig.percentage ?? 0,
    },
    flagRecords: flags,
  };
}

export async function dbGetPlumbingApprovals(): Promise<ModuleReleaseApprovalRecord[]> {
  const { data, error } = await supabase
    .from('module_release_approvals')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as ModuleReleaseApprovalRecord[];
}

export async function dbCreateApproval(params: {
  version: string;
  approvalType: 'beta' | 'full_release';
  regressionSuiteRunId?: string;
  approvalNotes?: string;
}): Promise<ModuleReleaseApprovalRecord> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: before } = await supabase
    .from('module_versions')
    .select('rollout_status')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  const { data, error } = await supabase
    .from('module_release_approvals')
    .insert({
      module_key: MODULE_KEY,
      version: params.version,
      approved_by: user.id,
      approval_type: params.approvalType,
      regression_suite_run_id: params.regressionSuiteRunId ?? null,
      approval_notes: params.approvalNotes ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  await dbUpdateModuleVersion(MODULE_KEY, { rollout_status: 'approved_for_beta' });

  await logAdminAction({
    action: 'plumbing_parser.approved_for_beta',
    entityType: 'module_release_approvals',
    entityId: data.id,
    moduleKey: MODULE_KEY,
    before: { rollout_status: before?.rollout_status },
    after: { rollout_status: 'approved_for_beta', approval_type: params.approvalType },
  });

  return data as ModuleReleaseApprovalRecord;
}

async function setFlagEnabled(flagKey: string, enabled: boolean, config?: Record<string, unknown>): Promise<void> {
  const flags = await dbGetAllFlags({ moduleKey: MODULE_KEY });
  const existing = flags.find((f) => f.flag_key === flagKey);

  if (existing) {
    if (config !== undefined) {
      await dbUpsertFlag({ ...existing, enabled, config_json: config }, existing.id);
    } else {
      await dbToggleFlag(existing.id, enabled);
    }
  } else {
    await dbUpsertFlag({
      flag_key: flagKey,
      module_key: MODULE_KEY,
      environment: 'production',
      target_type: 'global',
      enabled,
      config_json: config ?? {},
      priority: 10,
    });
  }
}

export async function dbEnableInternalBeta(): Promise<void> {
  const { data: before } = await supabase
    .from('module_versions')
    .select('rollout_status')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  await setFlagEnabled('plumbing_parser.beta_enabled', true);
  await setFlagEnabled('plumbing_parser.internal_only', true, { enabled: true });
  await setFlagEnabled('plumbing_parser.kill_switch', false);
  await dbUpdateModuleVersion(MODULE_KEY, { rollout_status: 'beta_internal' });

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('rollout_events').insert({
    module_key: MODULE_KEY,
    event_type: 'beta_enabled',
    previous_state_json: { rollout_status: before?.rollout_status },
    new_state_json: { rollout_status: 'beta_internal', scope: 'internal_only' },
    triggered_by: user?.id,
  });

  await logAdminAction({
    action: 'plumbing_parser.enable_internal_beta',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { rollout_status: before?.rollout_status },
    after: { rollout_status: 'beta_internal' },
  });
}

export async function dbEnableOrgBeta(orgIds: string[]): Promise<void> {
  const { data: before } = await supabase
    .from('module_versions')
    .select('rollout_status')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  await setFlagEnabled('plumbing_parser.beta_enabled', true);
  await setFlagEnabled('plumbing_parser.internal_only', false, { enabled: false });
  await setFlagEnabled('plumbing_parser.allowed_orgs', true, { orgIds });
  await setFlagEnabled('plumbing_parser.kill_switch', false);
  await dbUpdateModuleVersion(MODULE_KEY, { rollout_status: 'beta_limited' });

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('rollout_events').insert({
    module_key: MODULE_KEY,
    event_type: 'org_rollout_enabled',
    previous_state_json: { rollout_status: before?.rollout_status },
    new_state_json: { rollout_status: 'beta_limited', orgCount: orgIds.length },
    triggered_by: user?.id,
  });

  await logAdminAction({
    action: 'plumbing_parser.enable_org_beta',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { rollout_status: before?.rollout_status },
    after: { rollout_status: 'beta_limited', orgIds },
  });
}

export async function dbActivateKillSwitch(): Promise<void> {
  const { data: before } = await supabase
    .from('module_versions')
    .select('rollout_status')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  await setFlagEnabled('plumbing_parser.kill_switch', true);

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('rollout_events').insert({
    module_key: MODULE_KEY,
    event_type: 'kill_switch_enabled',
    previous_state_json: { rollout_status: before?.rollout_status },
    new_state_json: { kill_switch: true },
    triggered_by: user?.id,
  });

  await logAdminAction({
    action: 'plumbing_parser.kill_switch_activated',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { rollout_status: before?.rollout_status },
    after: { kill_switch: true },
  });
}

export async function dbRollback(): Promise<void> {
  const { data: before } = await supabase
    .from('module_versions')
    .select('rollout_status')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  await setFlagEnabled('plumbing_parser.beta_enabled', false);
  await setFlagEnabled('plumbing_parser.internal_only', false, { enabled: false });
  await setFlagEnabled('plumbing_parser.allowed_orgs', false, { orgIds: [] });
  await setFlagEnabled('plumbing_parser.rollout_percentage', false, { percentage: 0 });
  await setFlagEnabled('plumbing_parser.kill_switch', false);
  await dbUpdateModuleVersion(MODULE_KEY, { rollout_status: 'rolled_back' });

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('rollout_events').insert({
    module_key: MODULE_KEY,
    event_type: 'rollback_triggered',
    previous_state_json: { rollout_status: before?.rollout_status },
    new_state_json: { rollout_status: 'rolled_back' },
    triggered_by: user?.id,
  });

  await logAdminAction({
    action: 'plumbing_parser.rollback',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { rollout_status: before?.rollout_status },
    after: { rollout_status: 'rolled_back' },
  });
}

export async function dbDisableBeta(): Promise<void> {
  const { data: before } = await supabase
    .from('module_versions')
    .select('rollout_status')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  await setFlagEnabled('plumbing_parser.beta_enabled', false);
  await setFlagEnabled('plumbing_parser.internal_only', false, { enabled: false });
  await setFlagEnabled('plumbing_parser.allowed_orgs', false, { orgIds: [] });
  await dbUpdateModuleVersion(MODULE_KEY, { rollout_status: 'approved_for_beta' });

  await logAdminAction({
    action: 'plumbing_parser.disable_beta',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { rollout_status: before?.rollout_status },
    after: { rollout_status: 'approved_for_beta' },
  });
}

export type { PlumbingRolloutState, ModuleReleaseApprovalRecord };

export function getRolloutStatusLabel(status: RolloutStatus | string): string {
  const map: Record<string, string> = {
    live_only: 'Live Only',
    shadow_only: 'Shadow Only',
    idle: 'Idle',
    shadow_testing: 'Shadow Testing',
    regression_passed: 'Regression Passed',
    regression_failed: 'Regression Failed',
    approved_for_beta: 'Approved for Beta',
    beta_internal: 'Internal Beta Active',
    beta_limited: 'Org Beta Active',
    internal_beta: 'Internal Beta',
    org_beta: 'Org Beta',
    partial_rollout: 'Partial Rollout',
    full_release: 'Full Release',
    global_live: 'Global Live',
    rolled_back: 'Rolled Back',
  };
  return map[status] ?? status;
}

export function getRolloutStatusColor(status: RolloutStatus | string): string {
  const map: Record<string, string> = {
    live_only: 'text-gray-400',
    idle: 'text-gray-400',
    shadow_testing: 'text-cyan-400',
    regression_passed: 'text-teal-400',
    regression_failed: 'text-red-400',
    approved_for_beta: 'text-amber-400',
    beta_internal: 'text-cyan-300',
    beta_limited: 'text-teal-300',
    internal_beta: 'text-cyan-400',
    org_beta: 'text-teal-400',
    partial_rollout: 'text-amber-400',
    full_release: 'text-green-400',
    global_live: 'text-green-400',
    rolled_back: 'text-red-500',
    shadow_only: 'text-cyan-400',
  };
  return map[status] ?? 'text-gray-400';
}
