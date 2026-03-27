import { supabase } from '../supabase';
import type { ModuleRegistryRecord, ModuleVersionRecord, RolloutStatus } from '../../types/shadow';
import { logAdminAction } from './auditLogger';

export async function getAllModules(): Promise<(ModuleRegistryRecord & { version?: ModuleVersionRecord })[]> {
  const [modulesResult, versionsResult] = await Promise.all([
    supabase.from('module_registry').select('*').order('module_name'),
    supabase.from('module_versions').select('*').order('updated_at', { ascending: false }),
  ]);

  if (modulesResult.error) {
    console.error('[shadow] getAllModules: module_registry query failed', modulesResult.error);
    throw modulesResult.error;
  }
  if (versionsResult.error) {
    console.error('[shadow] getAllModules: module_versions query failed', versionsResult.error);
  }

  const versionMap = new Map<string, ModuleVersionRecord>();
  for (const v of versionsResult.data ?? []) {
    if (!versionMap.has(v.module_key)) {
      versionMap.set(v.module_key, v as ModuleVersionRecord);
    }
  }

  const seenKeys = new Set<string>();
  const deduped = (modulesResult.data ?? []).filter((m) => {
    if (seenKeys.has(m.module_key)) return false;
    seenKeys.add(m.module_key);
    return true;
  });

  return deduped.map((m) => ({
    ...(m as ModuleRegistryRecord),
    version: versionMap.get(m.module_key),
  }));
}

export async function getModuleWithVersion(moduleKey: string) {
  const [{ data: mod }, { data: ver }] = await Promise.all([
    supabase.from('module_registry').select('*').eq('module_key', moduleKey).maybeSingle(),
    supabase.from('module_versions').select('*').eq('module_key', moduleKey).maybeSingle(),
  ]);
  return { module: mod as ModuleRegistryRecord | null, version: ver as ModuleVersionRecord | null };
}

export async function updateModuleVersion(
  moduleKey: string,
  updates: Partial<Pick<ModuleVersionRecord, 'shadow_version' | 'promoted_candidate_version' | 'rollback_version' | 'rollout_status'>>
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from('module_versions')
    .select('*')
    .eq('module_key', moduleKey)
    .maybeSingle();

  await supabase.from('module_versions').update({
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: user?.id,
  }).eq('module_key', moduleKey);

  await logAdminAction({
    action: 'update_module_version',
    entityType: 'module_versions',
    entityId: moduleKey,
    moduleKey,
    before: current ?? undefined,
    after: updates,
  });
}

export async function promoteModule(moduleKey: string): Promise<void> {
  const { version } = await getModuleWithVersion(moduleKey);
  if (!version?.promoted_candidate_version) throw new Error('No candidate version to promote');

  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from('module_versions').update({
    rollback_version: version.live_version,
    live_version: version.promoted_candidate_version,
    promoted_candidate_version: null,
    rollout_status: 'global_live' as RolloutStatus,
    updated_at: new Date().toISOString(),
    updated_by: user?.id,
  }).eq('module_key', moduleKey);

  await supabase.from('rollout_events').insert({
    module_key: moduleKey,
    event_type: 'global_promoted',
    previous_state_json: { live_version: version.live_version },
    new_state_json: { live_version: version.promoted_candidate_version },
    triggered_by: user?.id,
  });

  await logAdminAction({
    action: 'promote_module',
    entityType: 'module_versions',
    moduleKey,
    before: { live_version: version.live_version },
    after: { live_version: version.promoted_candidate_version },
  });
}

export async function rollbackModule(moduleKey: string): Promise<void> {
  const { version } = await getModuleWithVersion(moduleKey);
  if (!version?.rollback_version) throw new Error('No rollback version available');

  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from('module_versions').update({
    live_version: version.rollback_version,
    rollout_status: 'rolled_back' as RolloutStatus,
    updated_at: new Date().toISOString(),
    updated_by: user?.id,
  }).eq('module_key', moduleKey);

  await supabase.from('rollout_events').insert({
    module_key: moduleKey,
    event_type: 'rollback_triggered',
    previous_state_json: { live_version: version.live_version },
    new_state_json: { live_version: version.rollback_version },
    triggered_by: user?.id,
  });

  await logAdminAction({
    action: 'rollback_module',
    entityType: 'module_versions',
    moduleKey,
    before: { live_version: version.live_version },
    after: { live_version: version.rollback_version },
  });
}

export async function setKillSwitch(moduleKey: string, active: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  const existing = await supabase
    .from('feature_flags')
    .select('id')
    .eq('flag_key', `kill_switch.${moduleKey}`)
    .maybeSingle();

  if (existing.data) {
    await supabase.from('feature_flags')
      .update({ enabled: active, updated_at: new Date().toISOString(), updated_by: user?.id })
      .eq('flag_key', `kill_switch.${moduleKey}`);
  } else {
    await supabase.from('feature_flags').insert({
      flag_key: `kill_switch.${moduleKey}`,
      module_key: moduleKey,
      environment: 'production',
      target_type: 'global',
      enabled: active,
      config_json: {},
      priority: 1,
      created_by: user?.id,
    });
  }

  await supabase.from('rollout_events').insert({
    module_key: moduleKey,
    event_type: active ? 'kill_switch_enabled' : 'kill_switch_disabled',
    triggered_by: user?.id,
  });

  await logAdminAction({
    action: active ? 'kill_switch_enable' : 'kill_switch_disable',
    entityType: 'feature_flags',
    moduleKey,
  });
}
