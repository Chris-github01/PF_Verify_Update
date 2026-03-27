import { supabase } from '../../supabase';

export interface ShadowVersion {
  id: string;
  module_key: string;
  version_name: string;
  parser_version: string;
  rules_version: string;
  config_snapshot_json: Record<string, unknown>;
  description: string | null;
  created_by: string | null;
  created_at: string;
  status: 'draft' | 'testing' | 'approved' | 'rejected';
  benchmark_score: number | null;
  benchmark_run_count: number;
  notes: string | null;
}

export interface ShadowVersionRun {
  id: string;
  version_id: string;
  run_id: string;
  benchmark_set_id: string | null;
  result_summary_json: Record<string, unknown>;
  pass_rate: number | null;
  financial_accuracy_score: number | null;
  line_accuracy_score: number | null;
  failure_severity_score: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Version management
// ---------------------------------------------------------------------------

export async function createShadowVersion(params: {
  moduleKey: string;
  versionName: string;
  parserVersion: string;
  rulesVersion?: string;
  configSnapshot?: Record<string, unknown>;
  description?: string;
}): Promise<ShadowVersion> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('shadow_versions')
    .insert({
      module_key: params.moduleKey,
      version_name: params.versionName,
      parser_version: params.parserVersion,
      rules_version: params.rulesVersion ?? 'v1',
      config_snapshot_json: params.configSnapshot ?? {},
      description: params.description ?? null,
      created_by: user?.id ?? null,
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) throw new Error(`[Phase4/Versioning] createShadowVersion failed: ${error.message}`);
  return data as ShadowVersion;
}

export async function getShadowVersions(moduleKey?: string): Promise<ShadowVersion[]> {
  let q = supabase
    .from('shadow_versions')
    .select('*')
    .order('created_at', { ascending: false });

  if (moduleKey) q = q.eq('module_key', moduleKey);

  const { data, error } = await q;
  if (error) throw new Error(`[Phase4/Versioning] getShadowVersions failed: ${error.message}`);
  return (data ?? []) as ShadowVersion[];
}

export async function getShadowVersion(versionId: string): Promise<ShadowVersion | null> {
  const { data, error } = await supabase
    .from('shadow_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();

  if (error) return null;
  return data as ShadowVersion | null;
}

export async function updateShadowVersionStatus(
  versionId: string,
  status: ShadowVersion['status'],
  notes?: string,
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (notes !== undefined) update.notes = notes;

  const { error } = await supabase
    .from('shadow_versions')
    .update(update)
    .eq('id', versionId);

  if (error) {
    console.warn(`[Phase4/Versioning] updateShadowVersionStatus failed: ${error.message}`);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Version ↔ Run linking
// ---------------------------------------------------------------------------

export async function linkRunToVersion(
  runId: string,
  versionId: string,
  benchmarkSetId?: string,
): Promise<void> {
  const { error } = await supabase
    .from('shadow_version_runs')
    .insert({
      version_id: versionId,
      run_id: runId,
      benchmark_set_id: benchmarkSetId ?? null,
      result_summary_json: {},
    })
    .select('id')
    .single();

  if (error && !error.message.includes('duplicate')) {
    console.warn(`[Phase4/Versioning] linkRunToVersion failed: ${error.message}`);
  }
}

export async function updateVersionRunResults(
  runId: string,
  versionId: string,
  results: {
    passRate?: number;
    financialAccuracyScore?: number;
    lineAccuracyScore?: number;
    failureSeverityScore?: number;
    summary?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase
    .from('shadow_version_runs')
    .update({
      pass_rate: results.passRate ?? null,
      financial_accuracy_score: results.financialAccuracyScore ?? null,
      line_accuracy_score: results.lineAccuracyScore ?? null,
      failure_severity_score: results.failureSeverityScore ?? null,
      result_summary_json: results.summary ?? {},
    })
    .eq('version_id', versionId)
    .eq('run_id', runId);

  if (error) {
    console.warn(`[Phase4/Versioning] updateVersionRunResults failed: ${error.message}`);
  }
}

export async function getVersionRuns(versionId: string): Promise<ShadowVersionRun[]> {
  const { data, error } = await supabase
    .from('shadow_version_runs')
    .select('*')
    .eq('version_id', versionId)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as ShadowVersionRun[];
}

export async function getVersionForRun(runId: string): Promise<ShadowVersion | null> {
  const { data: link, error: linkErr } = await supabase
    .from('shadow_version_runs')
    .select('version_id')
    .eq('run_id', runId)
    .maybeSingle();

  if (linkErr || !link) return null;

  return getShadowVersion(link.version_id as string);
}

// ---------------------------------------------------------------------------
// Active version resolution — returns the most recent approved/testing version
// for a module, or null when no version is configured.
// ---------------------------------------------------------------------------
export async function getActiveVersionForModule(moduleKey: string): Promise<ShadowVersion | null> {
  const { data, error } = await supabase
    .from('shadow_versions')
    .select('*')
    .eq('module_key', moduleKey)
    .in('status', ['approved', 'testing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data as ShadowVersion | null;
}

// ---------------------------------------------------------------------------
// Benchmark score aggregation — called after runs complete
// ---------------------------------------------------------------------------
export async function refreshVersionBenchmarkScore(versionId: string): Promise<void> {
  const { data, error } = await supabase
    .from('shadow_version_runs')
    .select('pass_rate, financial_accuracy_score, line_accuracy_score, failure_severity_score')
    .eq('version_id', versionId);

  if (error || !data || data.length === 0) return;

  const rows = data as Array<{
    pass_rate: number | null;
    financial_accuracy_score: number | null;
    line_accuracy_score: number | null;
    failure_severity_score: number | null;
  }>;

  const withScores = rows.filter((r) => r.financial_accuracy_score !== null);
  if (withScores.length === 0) return;

  const avgFinancial = withScores.reduce((s, r) => s + (r.financial_accuracy_score ?? 0), 0) / withScores.length;
  const avgLine = withScores.reduce((s, r) => s + (r.line_accuracy_score ?? 0), 0) / withScores.length;
  const avgPass = rows.reduce((s, r) => s + (r.pass_rate ?? 0), 0) / rows.length;
  const avgSeverity = rows.reduce((s, r) => s + (r.failure_severity_score ?? 100), 0) / rows.length;

  // Weighted composite: financial 40%, pass rate 30%, line 20%, severity (inverted) 10%
  const compositeScore = Math.round(
    avgFinancial * 0.4 + avgPass * 0.3 + avgLine * 0.2 + (100 - avgSeverity) * 0.1,
  );

  await supabase
    .from('shadow_versions')
    .update({
      benchmark_score: compositeScore,
      benchmark_run_count: rows.length,
    })
    .eq('id', versionId);
}
