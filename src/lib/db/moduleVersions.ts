import { supabase } from '../supabase';
import type { ModuleVersionRecord, RolloutStatus } from '../../types/shadow';
import { logAdminAction } from '../shadow/auditLogger';

export async function dbGetAllModuleVersions(): Promise<ModuleVersionRecord[]> {
  const { data, error } = await supabase
    .from('module_versions')
    .select('*')
    .order('module_key', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ModuleVersionRecord[];
}

export async function dbGetModuleVersion(moduleKey: string): Promise<ModuleVersionRecord | null> {
  const { data, error } = await supabase
    .from('module_versions')
    .select('*')
    .eq('module_key', moduleKey)
    .maybeSingle();
  if (error) throw error;
  return data as ModuleVersionRecord | null;
}

export async function dbUpdateModuleVersion(
  moduleKey: string,
  updates: Partial<Pick<ModuleVersionRecord, 'shadow_version' | 'promoted_candidate_version' | 'rollback_version' | 'rollout_status'>>
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: before } = await supabase
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
    before: before ?? undefined,
    after: updates as Record<string, unknown>,
  });
}

export async function dbGetVersionsWithModuleInfo(): Promise<Array<ModuleVersionRecord & {
  module_name: string;
  module_type: string;
  is_shadow_enabled: boolean;
}>> {
  const { data, error } = await supabase
    .from('module_versions')
    .select(`
      *,
      module_registry!inner(module_name, module_type, is_shadow_enabled)
    `)
    .order('module_key');

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const reg = row.module_registry as Record<string, unknown>;
    return {
      ...(row as unknown as ModuleVersionRecord),
      module_name: String(reg?.module_name ?? row.module_key),
      module_type: String(reg?.module_type ?? ''),
      is_shadow_enabled: Boolean(reg?.is_shadow_enabled ?? false),
    };
  });
}

export async function dbSetRolloutStatus(moduleKey: string, rollout_status: RolloutStatus): Promise<void> {
  await dbUpdateModuleVersion(moduleKey, { rollout_status });

  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from('rollout_events').insert({
    module_key: moduleKey,
    event_type: 'beta_enabled',
    new_state_json: { rollout_status },
    triggered_by: user?.id,
  });
}
