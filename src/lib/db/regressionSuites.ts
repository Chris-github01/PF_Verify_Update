import { supabase } from '../supabase';
import type { RegressionSuiteRecord, RegressionSuiteRunRecord } from '../../types/shadow';

export async function dbGetRegressionSuites(moduleKey?: string): Promise<RegressionSuiteRecord[]> {
  let q = supabase
    .from('regression_suites')
    .select('*')
    .order('created_at', { ascending: false });

  if (moduleKey) q = q.eq('module_key', moduleKey);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RegressionSuiteRecord[];
}

export async function dbGetRegressionSuiteRuns(suiteId: string): Promise<RegressionSuiteRunRecord[]> {
  const { data, error } = await supabase
    .from('regression_suite_runs')
    .select('*')
    .eq('suite_id', suiteId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RegressionSuiteRunRecord[];
}

export async function dbGetRecentSuiteRuns(moduleKey?: string, limit = 10): Promise<RegressionSuiteRunRecord[]> {
  let q = supabase
    .from('regression_suite_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (moduleKey) q = q.eq('module_key', moduleKey);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RegressionSuiteRunRecord[];
}
