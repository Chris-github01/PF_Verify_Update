import { supabase } from '../supabase';
import { logAdminAction } from '../shadow/auditLogger';
import { dbUpdateModuleVersion } from './moduleVersions';
import { dbGetAllFlags, dbToggleFlag, dbUpsertFlag } from './featureFlags';
import type {
  ModuleReleaseChecklistRecord,
  ModuleVersionHistoryRecord,
  ChecklistItemResult,
  ChecklistStatus,
  VersionHistoryEventType,
  RolloutStatus,
} from '../../types/shadow';
import type { ChecklistEvalResult } from '../modules/release/checklistEvaluator';
import { CHECKLIST_ITEM_DEFS } from '../modules/release/checklistEvaluator';

const MODULE_KEY = 'plumbing_parser';

// ─── Checklist ────────────────────────────────────────────────────────────────

export async function dbGetOrCreateChecklist(version: string): Promise<ModuleReleaseChecklistRecord> {
  const { data: existing } = await supabase
    .from('module_release_checklists')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .eq('version', version)
    .maybeSingle();

  if (existing) return existing as ModuleReleaseChecklistRecord;

  const { data, error } = await supabase
    .from('module_release_checklists')
    .insert({
      module_key: MODULE_KEY,
      version,
      checklist_items_json: CHECKLIST_ITEM_DEFS,
      completed_items_json: {},
      status: 'incomplete',
      blocked_reasons_json: [],
    })
    .select()
    .single();

  if (error) throw error;
  return data as ModuleReleaseChecklistRecord;
}

export async function dbGetChecklist(version: string): Promise<ModuleReleaseChecklistRecord | null> {
  const { data } = await supabase
    .from('module_release_checklists')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .eq('version', version)
    .maybeSingle();
  return data as ModuleReleaseChecklistRecord | null;
}

export async function dbSaveChecklistEvaluation(
  version: string,
  evalResult: ChecklistEvalResult
): Promise<void> {
  const completed: Record<string, ChecklistItemResult> = {};
  for (const item of evalResult.items) {
    completed[item.key] = item.result;
  }

  const { data: existing } = await supabase
    .from('module_release_checklists')
    .select('id')
    .eq('module_key', MODULE_KEY)
    .eq('version', version)
    .maybeSingle();

  const payload = {
    module_key: MODULE_KEY,
    version,
    checklist_items_json: CHECKLIST_ITEM_DEFS,
    completed_items_json: completed,
    status: evalResult.status as ChecklistStatus,
    blocked_reasons_json: evalResult.blockedReasons,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('module_release_checklists').update(payload).eq('id', existing.id);
  } else {
    await supabase.from('module_release_checklists').insert(payload);
  }
}

export async function dbUpdateChecklistItem(
  version: string,
  itemKey: string,
  result: ChecklistItemResult
): Promise<void> {
  const existing = await dbGetOrCreateChecklist(version);
  const updated = { ...existing.completed_items_json, [itemKey]: result };

  const allRequired = CHECKLIST_ITEM_DEFS.filter((d) => d.required);
  const blockedReasons: string[] = [];
  for (const def of allRequired) {
    const r = updated[def.key];
    if (!r?.passed) blockedReasons.push(def.label);
  }
  const status: ChecklistStatus = blockedReasons.length === 0 ? 'ready' : 'blocked';

  await supabase
    .from('module_release_checklists')
    .update({
      completed_items_json: updated,
      status,
      blocked_reasons_json: blockedReasons,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  await logAdminAction({
    action: `checklist.item_updated.${itemKey}`,
    entityType: 'module_release_checklists',
    entityId: existing.id,
    moduleKey: MODULE_KEY,
    before: { [itemKey]: existing.completed_items_json[itemKey] },
    after: { [itemKey]: result },
  });
}

// ─── Version History ─────────────────────────────────────────────────────────

export async function dbGetVersionHistory(limit = 30): Promise<ModuleVersionHistoryRecord[]> {
  const { data, error } = await supabase
    .from('module_version_history')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ModuleVersionHistoryRecord[];
}

export async function dbRecordVersionHistory(params: {
  eventType: VersionHistoryEventType;
  fromVersion?: string;
  toVersion: string;
  fromRolloutStatus?: string;
  toRolloutStatus?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from('module_version_history').insert({
    module_key: MODULE_KEY,
    event_type: params.eventType,
    from_version: params.fromVersion ?? null,
    to_version: params.toVersion,
    from_rollout_status: params.fromRolloutStatus ?? null,
    to_rollout_status: params.toRolloutStatus ?? null,
    actor_user_id: user?.id ?? null,
    notes: params.notes ?? null,
    metadata_json: params.metadata ?? {},
  });
}

// ─── Expansion controls ───────────────────────────────────────────────────────

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

export async function dbSetRolloutPercentage(percentage: number): Promise<void> {
  if (percentage < 0 || percentage > 100) throw new Error('Percentage must be 0–100');

  const { data: before } = await supabase
    .from('module_versions')
    .select('rollout_status, shadow_version, live_version')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  await setFlagEnabled('plumbing_parser.rollout_percentage', percentage > 0, { percentage });
  const newStatus: RolloutStatus = percentage >= 50 ? 'beta_expanded' : 'beta_limited';
  await dbUpdateModuleVersion(MODULE_KEY, { rollout_status: newStatus });

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('rollout_events').insert({
    module_key: MODULE_KEY,
    event_type: 'org_rollout_enabled',
    previous_state_json: { rollout_status: before?.rollout_status, percentage: 0 },
    new_state_json: { rollout_status: newStatus, percentage },
    triggered_by: user?.id,
  });

  await dbRecordVersionHistory({
    eventType: 'beta_expanded',
    fromVersion: before?.shadow_version ?? before?.live_version ?? 'unknown',
    toVersion: before?.shadow_version ?? before?.live_version ?? 'unknown',
    fromRolloutStatus: before?.rollout_status,
    toRolloutStatus: newStatus,
    notes: `Rollout percentage set to ${percentage}%`,
  });

  await logAdminAction({
    action: 'plumbing_parser.set_rollout_percentage',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { rollout_status: before?.rollout_status },
    after: { rollout_status: newStatus, percentage },
  });
}

export async function dbAddOrgsToBeta(orgIds: string[]): Promise<void> {
  const flags = await dbGetAllFlags({ moduleKey: MODULE_KEY });
  const existing = flags.find((f) => f.flag_key === 'plumbing_parser.allowed_orgs');
  const currentOrgs: string[] = (existing?.config_json as { orgIds?: string[] })?.orgIds ?? [];
  const merged = Array.from(new Set([...currentOrgs, ...orgIds]));

  await setFlagEnabled('plumbing_parser.allowed_orgs', true, { orgIds: merged });
  await setFlagEnabled('plumbing_parser.beta_enabled', true);

  const { data: before } = await supabase
    .from('module_versions')
    .select('rollout_status')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  await dbUpdateModuleVersion(MODULE_KEY, { rollout_status: 'beta_limited' });

  await logAdminAction({
    action: 'plumbing_parser.add_orgs_to_beta',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { orgIds: currentOrgs, rollout_status: before?.rollout_status },
    after: { orgIds: merged, rollout_status: 'beta_limited' },
    metadata: { addedOrgs: orgIds },
  });
}

export async function dbRemoveOrgFromBeta(orgId: string): Promise<void> {
  const flags = await dbGetAllFlags({ moduleKey: MODULE_KEY });
  const existing = flags.find((f) => f.flag_key === 'plumbing_parser.allowed_orgs');
  const currentOrgs: string[] = (existing?.config_json as { orgIds?: string[] })?.orgIds ?? [];
  const filtered = currentOrgs.filter((id) => id !== orgId);

  await setFlagEnabled('plumbing_parser.allowed_orgs', filtered.length > 0, { orgIds: filtered });

  await logAdminAction({
    action: 'plumbing_parser.remove_org_from_beta',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { orgIds: currentOrgs },
    after: { orgIds: filtered },
    metadata: { removedOrg: orgId },
  });
}

// ─── RC Promotion ─────────────────────────────────────────────────────────────

export async function dbPromoteToReleaseCandidate(shadowVersion: string, notes?: string): Promise<void> {
  const { data: before } = await supabase
    .from('module_versions')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  await dbUpdateModuleVersion(MODULE_KEY, {
    rollout_status: 'release_candidate',
    promoted_candidate_version: shadowVersion,
  });

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('rollout_events').insert({
    module_key: MODULE_KEY,
    event_type: 'beta_enabled',
    previous_state_json: { rollout_status: before?.rollout_status },
    new_state_json: { rollout_status: 'release_candidate', shadowVersion },
    triggered_by: user?.id,
  });

  await dbRecordVersionHistory({
    eventType: 'promoted_to_rc',
    fromVersion: before?.live_version ?? 'unknown',
    toVersion: shadowVersion,
    fromRolloutStatus: before?.rollout_status,
    toRolloutStatus: 'release_candidate',
    notes,
  });

  await logAdminAction({
    action: 'plumbing_parser.promoted_to_rc',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { rollout_status: before?.rollout_status },
    after: { rollout_status: 'release_candidate', shadowVersion },
    metadata: { notes },
  });
}

// ─── Production Promotion ─────────────────────────────────────────────────────

export async function dbPromoteToProduction(shadowVersion: string, notes?: string): Promise<void> {
  const { data: before } = await supabase
    .from('module_versions')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  const previousLiveVersion = before?.live_version;

  await dbUpdateModuleVersion(MODULE_KEY, {
    live_version: shadowVersion,
    rollback_version: previousLiveVersion,
    rollout_status: 'production_live',
  });

  await setFlagEnabled('plumbing_parser.beta_enabled', false);
  await setFlagEnabled('plumbing_parser.internal_only', false, { enabled: false });
  await setFlagEnabled('plumbing_parser.allowed_orgs', false, { orgIds: [] });
  await setFlagEnabled('plumbing_parser.rollout_percentage', false, { percentage: 0 });
  await setFlagEnabled('plumbing_parser.kill_switch', false);

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('rollout_events').insert({
    module_key: MODULE_KEY,
    event_type: 'global_promoted',
    previous_state_json: { live_version: previousLiveVersion, rollout_status: before?.rollout_status },
    new_state_json: { live_version: shadowVersion, rollout_status: 'production_live' },
    triggered_by: user?.id,
  });

  await dbRecordVersionHistory({
    eventType: 'promoted_to_production',
    fromVersion: previousLiveVersion,
    toVersion: shadowVersion,
    fromRolloutStatus: before?.rollout_status,
    toRolloutStatus: 'production_live',
    notes,
    metadata: { previousLiveVersion },
  });

  await logAdminAction({
    action: 'plumbing_parser.promoted_to_production',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { live_version: previousLiveVersion, rollout_status: before?.rollout_status },
    after: { live_version: shadowVersion, rollout_status: 'production_live' },
    metadata: { notes, previousLiveVersion },
  });
}

// ─── Full Rollback ─────────────────────────────────────────────────────────────

export async function dbFullRollback(notes?: string): Promise<void> {
  const { data: current } = await supabase
    .from('module_versions')
    .select('*')
    .eq('module_key', MODULE_KEY)
    .maybeSingle();

  const rollbackTo = current?.rollback_version ?? current?.live_version ?? 'v1.0';

  await dbUpdateModuleVersion(MODULE_KEY, {
    live_version: rollbackTo,
    rollout_status: 'rolled_back',
  });

  await setFlagEnabled('plumbing_parser.beta_enabled', false);
  await setFlagEnabled('plumbing_parser.internal_only', false, { enabled: false });
  await setFlagEnabled('plumbing_parser.allowed_orgs', false, { orgIds: [] });
  await setFlagEnabled('plumbing_parser.rollout_percentage', false, { percentage: 0 });
  await setFlagEnabled('plumbing_parser.kill_switch', false);

  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('rollout_events').insert({
    module_key: MODULE_KEY,
    event_type: 'rollback_triggered',
    previous_state_json: { live_version: current?.live_version, rollout_status: current?.rollout_status },
    new_state_json: { live_version: rollbackTo, rollout_status: 'rolled_back' },
    triggered_by: user?.id,
  });

  await dbRecordVersionHistory({
    eventType: 'rolled_back',
    fromVersion: current?.live_version,
    toVersion: rollbackTo,
    fromRolloutStatus: current?.rollout_status,
    toRolloutStatus: 'rolled_back',
    notes,
    metadata: { previousLiveVersion: current?.live_version },
  });

  await logAdminAction({
    action: 'plumbing_parser.rollback',
    entityType: 'module_versions',
    entityId: MODULE_KEY,
    moduleKey: MODULE_KEY,
    before: { live_version: current?.live_version, rollout_status: current?.rollout_status },
    after: { live_version: rollbackTo, rollout_status: 'rolled_back' },
    metadata: { notes, rollbackTo },
  });
}
