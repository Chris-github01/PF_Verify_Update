import { supabase } from '../supabase';
import { logAdminAction } from '../shadow/auditLogger';
import type {
  RegressionSuiteRecordExtended,
  RegressionSuiteCaseRecordExtended,
  RegressionSuiteRunRecordExtended,
  RegressionSuiteCaseResultRecord,
  ExpectedOutcome,
} from '../modules/parsers/plumbing/regression/types';

// ─── Suites ─────────────────────────────────────────────────────────────────

export async function dbGetPlumbingSuites(): Promise<RegressionSuiteRecordExtended[]> {
  const { data, error } = await supabase
    .from('regression_suites')
    .select('*')
    .eq('module_key', 'plumbing_parser')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as RegressionSuiteRecordExtended[];
}

export async function dbGetPlumbingSuite(suiteId: string): Promise<RegressionSuiteRecordExtended | null> {
  const { data, error } = await supabase
    .from('regression_suites')
    .select('*')
    .eq('id', suiteId)
    .eq('module_key', 'plumbing_parser')
    .maybeSingle();
  if (error) throw error;
  return data as unknown as RegressionSuiteRecordExtended | null;
}

export async function dbCreatePlumbingSuite(params: {
  suiteName: string;
  description?: string;
}): Promise<RegressionSuiteRecordExtended> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('regression_suites')
    .insert({
      module_key: 'plumbing_parser',
      suite_name: params.suiteName,
      description: params.description ?? null,
      created_by: user?.id,
      is_active: true,
      config_json: {},
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  await logAdminAction({
    action: 'regression_suite_created',
    entityType: 'regression_suites',
    entityId: data.id,
    moduleKey: 'plumbing_parser',
    after: { suiteName: params.suiteName },
  });

  return data as unknown as RegressionSuiteRecordExtended;
}

export async function dbUpdatePlumbingSuite(suiteId: string, params: {
  suiteName?: string;
  description?: string;
}): Promise<void> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.suiteName !== undefined) updates.suite_name = params.suiteName;
  if (params.description !== undefined) updates.description = params.description;

  const { error } = await supabase
    .from('regression_suites')
    .update(updates)
    .eq('id', suiteId);
  if (error) throw error;

  await logAdminAction({
    action: 'regression_suite_updated',
    entityType: 'regression_suites',
    entityId: suiteId,
    moduleKey: 'plumbing_parser',
    after: params,
  });
}

export async function dbExportSuite(suiteId: string): Promise<Record<string, unknown>> {
  const suite = await dbGetPlumbingSuite(suiteId);
  const cases = await dbGetPlumbingSuiteCases(suiteId);
  return { suite, cases, exportedAt: new Date().toISOString(), version: '1' };
}

export async function dbImportSuite(payload: Record<string, unknown>): Promise<string> {
  const { suite, cases } = payload as {
    suite: { suite_name: string; description?: string };
    cases: Array<{
      source_type: string;
      source_id: string;
      case_label?: string;
      is_must_pass?: boolean;
      notes?: string;
      expected_json?: Record<string, unknown>;
    }>;
  };

  const created = await dbCreatePlumbingSuite({
    suiteName: `${suite.suite_name} (imported)`,
    description: suite.description,
  });

  for (const c of cases ?? []) {
    await dbAddPlumbingSuiteCase(created.id, {
      sourceType: c.source_type,
      sourceId: c.source_id,
      caseLabel: c.case_label,
      isMustPass: c.is_must_pass ?? false,
      notes: c.notes,
      expectedOutcome: (c.expected_json ?? {}) as ExpectedOutcome,
    });
  }

  return created.id;
}

// ─── Cases ───────────────────────────────────────────────────────────────────

export async function dbGetPlumbingSuiteCases(suiteId: string): Promise<RegressionSuiteCaseRecordExtended[]> {
  const { data, error } = await supabase
    .from('regression_suite_cases')
    .select('*')
    .eq('suite_id', suiteId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as RegressionSuiteCaseRecordExtended[];
}

export async function dbAddPlumbingSuiteCase(suiteId: string, params: {
  sourceType: string;
  sourceId: string;
  caseLabel?: string;
  isMustPass?: boolean;
  notes?: string;
  expectedOutcome: ExpectedOutcome;
}): Promise<RegressionSuiteCaseRecordExtended> {
  const { data, error } = await supabase
    .from('regression_suite_cases')
    .insert({
      suite_id: suiteId,
      source_type: params.sourceType,
      source_id: params.sourceId,
      case_label: params.caseLabel ?? null,
      is_must_pass: params.isMustPass ?? false,
      notes: params.notes ?? null,
      expected_json: params.expectedOutcome as unknown as Record<string, unknown>,
    })
    .select()
    .single();
  if (error) throw error;

  await logAdminAction({
    action: 'regression_case_added',
    entityType: 'regression_suite_cases',
    entityId: data.id,
    moduleKey: 'plumbing_parser',
    after: { suiteId, sourceId: params.sourceId, caseLabel: params.caseLabel },
  });

  return data as unknown as RegressionSuiteCaseRecordExtended;
}

export async function dbUpdatePlumbingSuiteCase(caseId: string, params: {
  caseLabel?: string;
  isMustPass?: boolean;
  notes?: string;
  expectedOutcome?: ExpectedOutcome;
}): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (params.caseLabel !== undefined) updates.case_label = params.caseLabel;
  if (params.isMustPass !== undefined) updates.is_must_pass = params.isMustPass;
  if (params.notes !== undefined) updates.notes = params.notes;
  if (params.expectedOutcome !== undefined) updates.expected_json = params.expectedOutcome as unknown as Record<string, unknown>;

  const { error } = await supabase
    .from('regression_suite_cases')
    .update(updates)
    .eq('id', caseId);
  if (error) throw error;

  await logAdminAction({
    action: 'regression_case_updated',
    entityType: 'regression_suite_cases',
    entityId: caseId,
    moduleKey: 'plumbing_parser',
    after: params,
  });
}

export async function dbRemovePlumbingSuiteCase(caseId: string): Promise<void> {
  const { error } = await supabase
    .from('regression_suite_cases')
    .delete()
    .eq('id', caseId);
  if (error) throw error;
}

// ─── Suite Runs ───────────────────────────────────────────────────────────────

export async function dbGetPlumbingSuiteRuns(suiteId: string): Promise<RegressionSuiteRunRecordExtended[]> {
  const { data, error } = await supabase
    .from('regression_suite_runs')
    .select('*')
    .eq('suite_id', suiteId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as RegressionSuiteRunRecordExtended[];
}

export async function dbGetRecentPlumbingRuns(limit = 10): Promise<RegressionSuiteRunRecordExtended[]> {
  const { data, error } = await supabase
    .from('regression_suite_runs')
    .select('*, regression_suites!inner(suite_name, module_key)')
    .eq('module_key', 'plumbing_parser')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>;
    const suite = r.regression_suites as Record<string, unknown> | null;
    return {
      ...r,
      suite_name: suite?.suite_name ?? null,
    } as unknown as RegressionSuiteRunRecordExtended;
  });
}

export async function dbGetPlumbingSuiteRun(runId: string): Promise<RegressionSuiteRunRecordExtended | null> {
  const { data, error } = await supabase
    .from('regression_suite_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as RegressionSuiteRunRecordExtended | null;
}

export async function dbCreateSuiteRun(suiteId: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('regression_suite_runs')
    .insert({
      suite_id: suiteId,
      module_key: 'plumbing_parser',
      version_under_test: 'shadow_v2',
      initiated_by: user?.id,
      status: 'queued',
      summary_json: {},
      cases_total: 0,
      cases_passed: 0,
      cases_failed_minor: 0,
      cases_failed_major: 0,
      cases_failed_critical: 0,
    })
    .select('id')
    .single();
  if (error) throw error;

  await logAdminAction({
    action: 'regression_suite_run_started',
    entityType: 'regression_suite_runs',
    entityId: data.id,
    moduleKey: 'plumbing_parser',
    after: { suiteId },
  });

  return data.id;
}

// ─── Case Results ─────────────────────────────────────────────────────────────

export async function dbGetSuiteRunCaseResults(suiteRunId: string): Promise<RegressionSuiteCaseResultRecord[]> {
  const { data, error } = await supabase
    .from('regression_suite_case_results')
    .select('*')
    .eq('suite_run_id', suiteRunId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as RegressionSuiteCaseResultRecord[];
}

export async function dbGetCaseResult(caseResultId: string): Promise<RegressionSuiteCaseResultRecord | null> {
  const { data, error } = await supabase
    .from('regression_suite_case_results')
    .select('*')
    .eq('id', caseResultId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as RegressionSuiteCaseResultRecord | null;
}
