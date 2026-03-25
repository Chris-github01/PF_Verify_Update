import { supabase } from '../supabase';
import type { FeatureFlagRecord } from '../../types/shadow';
import { logAdminAction } from '../shadow/auditLogger';

export async function dbGetAllFlags(filters?: {
  moduleKey?: string;
  environment?: string;
  targetType?: string;
}): Promise<FeatureFlagRecord[]> {
  let q = supabase
    .from('feature_flags')
    .select('*')
    .order('flag_key', { ascending: true });

  if (filters?.moduleKey) q = q.eq('module_key', filters.moduleKey);
  if (filters?.environment) q = q.eq('environment', filters.environment);
  if (filters?.targetType) q = q.eq('target_type', filters.targetType);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FeatureFlagRecord[];
}

export async function dbGetFlagsByKey(flagKey: string): Promise<FeatureFlagRecord[]> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('flag_key', flagKey)
    .order('priority', { ascending: true });
  if (error) throw error;
  return (data ?? []) as FeatureFlagRecord[];
}

export async function dbUpsertFlag(
  flag: Partial<FeatureFlagRecord> & { flag_key: string; target_type: string },
  existingId?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const isUpdate = !!existingId;

  if (isUpdate) {
    const { data: before } = await supabase
      .from('feature_flags')
      .select('*')
      .eq('id', existingId)
      .maybeSingle();

    await supabase.from('feature_flags').update({
      ...flag,
      updated_at: now,
      updated_by: user?.id,
    }).eq('id', existingId);

    await logAdminAction({
      action: 'update_feature_flag',
      entityType: 'feature_flags',
      entityId: existingId,
      moduleKey: flag.module_key,
      before: before ?? undefined,
      after: flag as Record<string, unknown>,
    });
  } else {
    const { data: inserted } = await supabase
      .from('feature_flags')
      .upsert({
        ...flag,
        updated_at: now,
        updated_by: user?.id,
        created_by: user?.id,
      })
      .select('id')
      .maybeSingle();

    await logAdminAction({
      action: 'create_feature_flag',
      entityType: 'feature_flags',
      entityId: inserted?.id,
      moduleKey: flag.module_key,
      after: flag as Record<string, unknown>,
    });
  }
}

export async function dbToggleFlag(flagId: string, enabled: boolean): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: before } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('id', flagId)
    .maybeSingle();

  await supabase.from('feature_flags').update({
    enabled,
    updated_at: new Date().toISOString(),
    updated_by: user?.id,
  }).eq('id', flagId);

  await logAdminAction({
    action: enabled ? 'enable_feature_flag' : 'disable_feature_flag',
    entityType: 'feature_flags',
    entityId: flagId,
    moduleKey: before?.module_key,
    before: { enabled: !enabled },
    after: { enabled },
  });
}
