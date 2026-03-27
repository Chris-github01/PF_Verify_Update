import { supabase } from '../supabase';
import type { ShadowRunRecord } from '../../types/shadow';

export interface LoadedCompareRun {
  run: ShadowRunRecord;
  liveOutput: Record<string, unknown> | null;
  shadowOutput: Record<string, unknown> | null;
  diffResult: Record<string, unknown> | null;
  summaryResult: Record<string, unknown> | null;
}

export async function loadCompareRunOutputs(runId: string): Promise<LoadedCompareRun> {
  const [{ data: run }, { data: results }] = await Promise.all([
    supabase.from('shadow_runs').select('*').eq('id', runId).maybeSingle(),
    supabase.from('shadow_run_results').select('*').eq('shadow_run_id', runId),
  ]);

  if (!run) throw new Error(`Shadow run not found: ${runId}`);

  const findResult = (type: string) =>
    (results ?? []).find((r: Record<string, unknown>) => r.result_type === type)?.output_json as Record<string, unknown> | null ?? null;

  return {
    run: run as ShadowRunRecord,
    liveOutput: findResult('live'),
    shadowOutput: findResult('shadow'),
    diffResult: findResult('diff'),
    summaryResult: findResult('summary'),
  };
}

export async function listRecentCompareRuns(
  moduleKey: string,
  limit = 20
): Promise<ShadowRunRecord[]> {
  const { data } = await supabase
    .from('shadow_runs')
    .select('*')
    .eq('module_key', moduleKey)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as ShadowRunRecord[];
}

export function getRecommendationColor(recommendation: string): string {
  switch (recommendation) {
    case 'shadow_better': return 'text-green-400';
    case 'live_better': return 'text-orange-400';
    case 'needs_review': return 'text-amber-400';
    case 'inconclusive': return 'text-gray-400';
    case 'systemic_failure': return 'text-red-400';
    default: return 'text-gray-500';
  }
}

export function getRecommendationLabel(recommendation: string): string {
  switch (recommendation) {
    case 'shadow_better': return 'Shadow Better';
    case 'live_better': return 'Live Better';
    case 'needs_review': return 'Needs Review';
    case 'inconclusive': return 'Inconclusive';
    case 'systemic_failure': return 'Systemic Failure';
    default: return recommendation;
  }
}

export function getRiskFlagSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-400 bg-red-950/30 border-red-800';
    case 'warning': return 'text-amber-400 bg-amber-950/30 border-amber-800';
    case 'info': return 'text-blue-400 bg-blue-950/30 border-blue-800';
    default: return 'text-gray-400 bg-gray-800 border-gray-700';
  }
}
