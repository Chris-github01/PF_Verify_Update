import { supabase } from '../../supabase';
import { loadPlumbingSource } from '../parsers/plumbing/loadSource';
import { executeLiveParser } from './liveExecutor';
import { executeShadowParser } from './shadowExecutor';
import { buildPlumbingCompare } from './compareExecutor';
import { logAdminAction } from '../../shadow/auditLogger';
import type { PlumbingParserInput } from '../parsers/plumbing/types';

export interface ExecuteModuleRunParams {
  moduleKey: string;
  sourceType: 'quote' | 'parsing_job';
  sourceId: string;
  runMode: 'live_vs_shadow' | 'shadow_only';
}

export interface ExecuteModuleRunResult {
  success: boolean;
  runId?: string;
  error?: string;
}

export async function executeModuleRun(
  params: ExecuteModuleRunParams
): Promise<ExecuteModuleRunResult> {
  const { moduleKey, sourceType, sourceId, runMode } = params;

  if (moduleKey !== 'plumbing_parser') {
    return { success: false, error: `Module ${moduleKey} not yet supported for shadow execution` };
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { data: runRecord, error: runErr } = await supabase
    .from('shadow_runs')
    .insert({
      module_key: moduleKey,
      source_type: sourceType,
      source_id: sourceId,
      initiated_by: user?.id,
      run_mode: runMode,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (runErr || !runRecord) {
    return { success: false, error: `Failed to create shadow run: ${runErr?.message ?? 'unknown'}` };
  }

  const runId = runRecord.id;

  await logAdminAction({
    action: 'shadow_run_started',
    entityType: 'shadow_runs',
    entityId: runId,
    moduleKey,
    after: { sourceType, sourceId, runMode },
  });

  try {
    const source = await loadPlumbingSource(sourceType, sourceId);

    await supabase
      .from('shadow_runs')
      .update({ source_label: source.sourceLabel })
      .eq('id', runId);

    const parserInput: PlumbingParserInput = {
      sourceType,
      sourceId,
      rows: source.rows,
      documentTotal: source.documentTotal,
      supplierName: source.supplierName,
      metadata: source.metadata,
    };

    if (runMode === 'shadow_only') {
      const shadowResult = await executeShadowParser(parserInput);

      await supabase.from('shadow_run_results').insert([
        {
          shadow_run_id: runId,
          result_type: 'shadow',
          output_json: shadowResult.output ?? null,
          metrics_json: { durationMs: shadowResult.durationMs, success: shadowResult.success },
        },
        {
          shadow_run_id: runId,
          result_type: 'summary',
          output_json: {
            runMode,
            shadowParsedTotal: shadowResult.output?.parsedValue ?? null,
            shadowRowCount: shadowResult.output?.totalRowCount ?? 0,
            shadowExcludedCount: shadowResult.output?.excludedLineCount ?? 0,
            error: shadowResult.error ?? null,
          },
          metrics_json: {},
        },
      ]);

      await supabase
        .from('shadow_runs')
        .update({
          status: shadowResult.success ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          error_message: shadowResult.error ?? null,
          live_version: null,
          shadow_version: shadowResult.output?.parserVersion ?? null,
        })
        .eq('id', runId);

    } else {
      const [liveResult, shadowResult] = await Promise.all([
        executeLiveParser(parserInput),
        executeShadowParser(parserInput),
      ]);

      const compareResult = liveResult.output && shadowResult.output
        ? buildPlumbingCompare(liveResult.output, shadowResult.output)
        : null;

      const resultRows = [
        {
          shadow_run_id: runId,
          result_type: 'live',
          output_json: liveResult.output ?? null,
          metrics_json: { durationMs: liveResult.durationMs, success: liveResult.success },
        },
        {
          shadow_run_id: runId,
          result_type: 'shadow',
          output_json: shadowResult.output ?? null,
          metrics_json: { durationMs: shadowResult.durationMs, success: shadowResult.success },
        },
      ];

      if (compareResult) {
        resultRows.push({
          shadow_run_id: runId,
          result_type: 'diff',
          output_json: compareResult as unknown as Record<string, unknown>,
          metrics_json: { recommendation: compareResult.recommendation, riskFlagCount: compareResult.riskFlags.length },
        });
        resultRows.push({
          shadow_run_id: runId,
          result_type: 'summary',
          output_json: {
            liveParsedTotal: compareResult.liveParsedTotal,
            shadowParsedTotal: compareResult.shadowParsedTotal,
            totalsDelta: compareResult.totalsDelta,
            recommendation: compareResult.recommendation,
            riskFlagCount: compareResult.riskFlags.length,
            changedClassificationCount: compareResult.changedClassifications.length,
          },
          metrics_json: {},
        });
      }

      await supabase.from('shadow_run_results').insert(resultRows);

      const bothSucceeded = liveResult.success && shadowResult.success;

      await supabase
        .from('shadow_runs')
        .update({
          status: bothSucceeded ? 'completed' : 'failed',
          completed_at: new Date().toISOString(),
          error_message: bothSucceeded
            ? null
            : (liveResult.error ?? shadowResult.error ?? 'One or more parsers failed'),
          live_version: liveResult.output?.parserVersion ?? null,
          shadow_version: shadowResult.output?.parserVersion ?? null,
        })
        .eq('id', runId);
    }

    await logAdminAction({
      action: 'shadow_compare_run_completed',
      entityType: 'shadow_runs',
      entityId: runId,
      moduleKey,
      after: { runMode, sourceType, sourceId },
    });

    return { success: true, runId };

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown execution error';

    await supabase
      .from('shadow_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errMsg,
      })
      .eq('id', runId);

    await logAdminAction({
      action: 'shadow_run_failed',
      entityType: 'shadow_runs',
      entityId: runId,
      moduleKey,
      after: { error: errMsg },
    });

    return { success: false, error: errMsg, runId };
  }
}

export async function saveShadowDraft(params: {
  moduleKey: string;
  sourceType: string;
  sourceId: string;
  runId: string;
  draftName?: string;
  payload: Record<string, unknown>;
}): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('shadow_drafts')
    .insert({
      module_key: params.moduleKey,
      source_type: params.sourceType,
      source_id: params.sourceId,
      draft_name: params.draftName ?? `Draft ${new Date().toLocaleDateString()}`,
      payload_json: { runId: params.runId, ...params.payload },
      status: 'draft',
      created_by: user?.id,
    })
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to save draft: ${error.message}`);

  await logAdminAction({
    action: 'shadow_draft_saved',
    entityType: 'shadow_drafts',
    entityId: data?.id,
    moduleKey: params.moduleKey,
    after: { sourceType: params.sourceType, sourceId: params.sourceId },
  });

  return data?.id ?? '';
}
