import { supabase } from '../supabase';
import type { RolloutEventRecord } from '../../types/shadow';

export async function dbGetRolloutEvents(filters?: {
  moduleKey?: string;
  limit?: number;
}): Promise<RolloutEventRecord[]> {
  let q = supabase
    .from('rollout_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 100);

  if (filters?.moduleKey) q = q.eq('module_key', filters.moduleKey);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RolloutEventRecord[];
}

export async function dbGetRecentRolloutEvents(limit = 10): Promise<RolloutEventRecord[]> {
  return dbGetRolloutEvents({ limit });
}

export async function dbGetModuleRolloutEvents(moduleKey: string, limit = 20): Promise<RolloutEventRecord[]> {
  return dbGetRolloutEvents({ moduleKey, limit });
}
