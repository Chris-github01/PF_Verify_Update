import { supabase } from '../supabase';
import type {
  RunMode,
  ShadowRunRecord,
  ComparableModuleOutput,
  ModuleDiff,
  ShadowCompareResult,
} from '../../types/shadow';
import { logAdminAction } from './auditLogger';
import { isKillSwitchActive } from './featureFlags';

export async function createShadowRun(params: {
  moduleKey: string;
  sourceType: string;
  sourceId: string;
  sourceLabel?: string;
  runMode: RunMode;
  liveVersion?: string;
  shadowVersion?: string;
  orgId?: string;
}): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase.from('shadow_runs').insert({
    module_key: params.moduleKey,
    source_type: params.sourceType,
    source_id: params.sourceId,
    source_label: params.sourceLabel,
    initiated_by: user.id,
    org_id: params.orgId,
    live_version: params.liveVersion,
    shadow_version: params.shadowVersion,
    run_mode: params.runMode,
    status: 'queued',
    metadata_json: {},
  }).select('id').single();

  if (error || !data) throw new Error('Failed to create shadow run');
  return data.id;
}

export async function completeShadowRun(
  runId: string,
  liveOutput: ComparableModuleOutput,
  shadowOutput: ComparableModuleOutput
): Promise<ShadowCompareResult> {
  const diff = diffOutputs(liveOutput, shadowOutput);

  const { data: run } = await supabase
    .from('shadow_runs')
    .select('module_key, live_version, shadow_version, source_id')
    .eq('id', runId)
    .single();

  await supabase.from('shadow_runs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
  }).eq('id', runId);

  await supabase.from('shadow_run_results').insert([
    { shadow_run_id: runId, result_type: 'live', output_json: liveOutput as unknown as Record<string, unknown>, metrics_json: {} },
    { shadow_run_id: runId, result_type: 'shadow', output_json: shadowOutput as unknown as Record<string, unknown>, metrics_json: {} },
    { shadow_run_id: runId, result_type: 'diff', output_json: diff as unknown as Record<string, unknown>, metrics_json: {} },
    {
      shadow_run_id: runId,
      result_type: 'summary',
      output_json: {
        passRating: diff.passRating,
        itemCountDelta: diff.itemCountDelta,
        totalsMatch: diff.totalsMatch,
        totalsDelta: diff.totalsDelta,
      },
      metrics_json: {},
    },
  ]);

  await logAdminAction({
    action: 'shadow_run_completed',
    entityType: 'shadow_runs',
    entityId: runId,
    moduleKey: run?.module_key,
    after: { passRating: diff.passRating, itemCountDelta: diff.itemCountDelta },
  });

  return {
    runId,
    moduleKey: run?.module_key ?? '',
    sourceId: run?.source_id ?? '',
    liveOutput,
    shadowOutput,
    diff,
    liveVersion: run?.live_version ?? 'v1',
    shadowVersion: run?.shadow_version ?? 'unknown',
    completedAt: new Date().toISOString(),
  };
}

export async function failShadowRun(runId: string, errorMessage: string): Promise<void> {
  await supabase.from('shadow_runs').update({
    status: 'failed',
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
  }).eq('id', runId);
}

export async function getShadowRuns(moduleKey?: string, limit = 50): Promise<ShadowRunRecord[]> {
  let q = supabase
    .from('shadow_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (moduleKey) q = q.eq('module_key', moduleKey);

  const { data } = await q;
  return (data ?? []) as ShadowRunRecord[];
}

export async function getShadowRunResults(runId: string) {
  const { data } = await supabase
    .from('shadow_run_results')
    .select('*')
    .eq('shadow_run_id', runId)
    .order('result_type');
  return data ?? [];
}

export async function resolveVersionForExecution(moduleKey: string): Promise<{
  version: string;
  mode: 'live' | 'shadow';
  killed: boolean;
}> {
  const killed = await isKillSwitchActive(moduleKey);
  if (killed) {
    return { version: 'v1', mode: 'live', killed: true };
  }

  const { data: ver } = await supabase
    .from('module_versions')
    .select('live_version, shadow_version, rollout_status')
    .eq('module_key', moduleKey)
    .maybeSingle();

  const shadowStatuses = new Set(['shadow_only', 'internal_beta', 'org_beta', 'partial_rollout']);
  const isShadowMode = ver?.rollout_status && shadowStatuses.has(ver.rollout_status) && !!ver.shadow_version;

  return {
    version: isShadowMode ? (ver!.shadow_version!) : (ver?.live_version ?? 'v1'),
    mode: isShadowMode ? 'shadow' : 'live',
    killed: false,
  };
}

function diffOutputs(live: ComparableModuleOutput, shadow: ComparableModuleOutput): ModuleDiff {
  const liveTotal = live.totals.parsedValue ?? 0;
  const shadowTotal = shadow.totals.parsedValue ?? 0;
  const totalsDelta = shadowTotal - liveTotal;
  const totalsMatch = Math.abs(totalsDelta) < 1;

  const liveKeys = new Set(live.items.map(itemKey));
  const shadowKeys = new Set(shadow.items.map(itemKey));

  const addedItems = shadow.items.filter((i) => !liveKeys.has(itemKey(i)));
  const removedItems = live.items.filter((i) => !shadowKeys.has(itemKey(i)));

  const changedItems: ModuleDiff['changedItems'] = [];
  for (const lItem of live.items) {
    const key = itemKey(lItem);
    const sItem = shadow.items.find((i) => itemKey(i) === key);
    if (sItem && JSON.stringify(lItem) !== JSON.stringify(sItem)) {
      changedItems.push({ before: lItem, after: sItem });
    }
  }

  const liveWarnSet = new Set(live.warnings);
  const shadowWarnSet = new Set(shadow.warnings);
  const addedWarnings = shadow.warnings.filter((w) => !liveWarnSet.has(w));
  const removedWarnings = live.warnings.filter((w) => !shadowWarnSet.has(w));

  const itemCountDelta = (shadow.totals.itemCount ?? 0) - (live.totals.itemCount ?? 0);

  let passRating: 'pass' | 'warn' | 'fail' = 'pass';
  const threshold = liveTotal > 0 ? liveTotal * 0.05 : 1;
  if (!totalsMatch || Math.abs(totalsDelta) > threshold) passRating = 'fail';
  else if (addedItems.length > 0 || removedItems.length > 0 || changedItems.length > 0) passRating = 'warn';

  return {
    totalsDelta,
    totalsMatch,
    addedItems,
    removedItems,
    changedItems,
    addedWarnings,
    removedWarnings,
    itemCountDelta,
    passRating,
  };
}

function itemKey(item: Record<string, unknown>): string {
  return String(item.description ?? item.id ?? JSON.stringify(item)).toLowerCase().trim();
}
