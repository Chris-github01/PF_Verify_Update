import { supabase } from '../supabase';
import type { ShadowRunRecord, ShadowRunResultRecord, RunMode, RunStatus } from '../../types/shadow';

export interface ShadowRunFilters {
  moduleKey?: string;
  status?: RunStatus;
  runMode?: RunMode;
  sourceType?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export async function dbGetShadowRuns(filters: ShadowRunFilters = {}): Promise<ShadowRunRecord[]> {
  let q = supabase
    .from('shadow_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.moduleKey) q = q.eq('module_key', filters.moduleKey);
  if (filters.status) q = q.eq('status', filters.status);
  if (filters.runMode) q = q.eq('run_mode', filters.runMode);
  if (filters.sourceType) q = q.eq('source_type', filters.sourceType);
  if (filters.fromDate) q = q.gte('created_at', filters.fromDate);
  if (filters.toDate) q = q.lte('created_at', filters.toDate);
  if (filters.offset) q = q.range(filters.offset, filters.offset + (filters.limit ?? 100) - 1);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ShadowRunRecord[];
}

export async function dbGetShadowRun(runId: string): Promise<ShadowRunRecord | null> {
  const { data, error } = await supabase
    .from('shadow_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();
  if (error) throw error;
  return data as ShadowRunRecord | null;
}

export async function dbGetShadowRunResults(runId: string): Promise<ShadowRunResultRecord[]> {
  const { data, error } = await supabase
    .from('shadow_run_results')
    .select('*')
    .eq('shadow_run_id', runId)
    .order('result_type');
  if (error) throw error;
  return (data ?? []) as ShadowRunResultRecord[];
}

export async function dbGetRunsCountByModule(): Promise<Array<{ module_key: string; total: number; failed: number; completed: number }>> {
  const { data } = await supabase
    .from('shadow_runs')
    .select('module_key, status');

  const agg: Record<string, { total: number; failed: number; completed: number }> = {};
  for (const row of data ?? []) {
    const key = String(row.module_key);
    if (!agg[key]) agg[key] = { total: 0, failed: 0, completed: 0 };
    agg[key].total++;
    if (row.status === 'failed') agg[key].failed++;
    if (row.status === 'completed') agg[key].completed++;
  }

  return Object.entries(agg).map(([module_key, counts]) => ({ module_key, ...counts }));
}

export async function dbUpdateRunStatus(runId: string, status: RunStatus, errorMessage?: string): Promise<void> {
  await supabase.from('shadow_runs').update({
    status,
    error_message: errorMessage,
    completed_at: ['completed', 'failed', 'cancelled'].includes(status) ? new Date().toISOString() : undefined,
    started_at: status === 'running' ? new Date().toISOString() : undefined,
  }).eq('id', runId);
}
