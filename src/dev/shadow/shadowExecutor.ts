import { getDevSupabaseClient } from '../lib/supabaseClientDev';

export interface ShadowInput {
  runType: string;
  referenceId?: string;
  payload: Record<string, unknown>;
}

export interface ShadowResult {
  runId: string | null;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

export async function executeShadowRun(
  input: ShadowInput,
  logic: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>
): Promise<ShadowResult> {
  const startTime = Date.now();
  const supabase = getDevSupabaseClient();

  console.log('[VERIFYTRADE NEXT] Shadow run starting:', input.runType);

  let runId: string | null = null;

  try {
    const { data: runRecord, error: insertError } = await supabase
      .from('dev_shadow_runs')
      .insert({
        run_type: input.runType,
        reference_id: input.referenceId ?? null,
        input_payload: input.payload,
        status: 'running',
      })
      .select('id')
      .maybeSingle();

    if (insertError) {
      console.warn('[VERIFYTRADE NEXT] Could not record shadow run:', insertError.message);
    } else {
      runId = runRecord?.id ?? null;
    }

    const output = await logic(input.payload);
    const durationMs = Date.now() - startTime;

    if (runId) {
      await supabase
        .from('dev_shadow_runs')
        .update({
          status: 'completed',
          output_payload: output,
          duration_ms: durationMs,
        })
        .eq('id', runId);

      await supabase.from('dev_shadow_results').insert({
        shadow_run_id: runId,
        run_type: input.runType,
        reference_id: input.referenceId ?? null,
        result: output,
      });
    }

    console.log('[VERIFYTRADE NEXT] Shadow run completed in', durationMs, 'ms');

    return { runId, success: true, output, durationMs };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    console.error('[VERIFYTRADE NEXT] Shadow run failed:', errorMsg);

    if (runId) {
      await supabase
        .from('dev_shadow_runs')
        .update({ status: 'failed', error_message: errorMsg, duration_ms: durationMs })
        .eq('id', runId);
    }

    return { runId, success: false, error: errorMsg, durationMs };
  }
}
