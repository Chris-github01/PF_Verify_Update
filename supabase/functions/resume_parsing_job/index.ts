import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Missing jobId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: job, error: jobError } = await supabase
      .from("parsing_jobs")
      .select("id, supplier_name, status, file_url, filename, trade, metadata, attempt_count, llm_attempted, llm_fail_reason, last_error_code, updated_at")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const attemptCount = (job.attempt_count as number) ?? 0;
    const priorLlmFailed = job.llm_attempted === true && job.llm_fail_reason != null;

    // Guard 1 — idempotency: reject if already processing with recent heartbeat
    const ACTIVE_LOCK_WINDOW_MS = 120_000;
    const jobUpdatedAt = job.updated_at ? new Date(job.updated_at as string).getTime() : 0;
    const isRecentlyUpdated = Date.now() - jobUpdatedAt < ACTIVE_LOCK_WINDOW_MS;
    if (job.status === "processing" && isRecentlyUpdated) {
      const ageSec = Math.round((Date.now() - jobUpdatedAt) / 1000);
      console.warn(`[Resume] Job ${jobId} already processing (heartbeat ${ageSec}s ago). Rejecting duplicate resume.`);
      return new Response(
        JSON.stringify({
          error: "job_already_processing",
          jobId,
          heartbeat_age_seconds: ageSec,
          message: "Job is already being processed. Wait for it to complete or fail before resuming.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard 2 — hard failure: reject resume if job was marked as hard failure
    if (job.last_error_code === "hard_failure") {
      console.warn(`[Resume] Job ${jobId} is in hard_failure state. Rejecting resume.`);
      return new Response(
        JSON.stringify({
          error: "hard_failure_cannot_resume",
          jobId,
          message: "Job has been marked as a hard failure. Please re-upload the document.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard 3 — max attempts: reject if exceeded hard cap
    const HARD_MAX_ATTEMPTS = 5;
    if (attemptCount >= HARD_MAX_ATTEMPTS) {
      console.warn(`[Resume] Job ${jobId} reached hard_max_attempts=${HARD_MAX_ATTEMPTS}. Marking hard failure.`);
      await supabase
        .from("parsing_jobs")
        .update({
          status: "failed",
          current_stage: "Failed — Max Attempts Exceeded",
          error_message: `Exceeded hard maximum of ${HARD_MAX_ATTEMPTS} attempts`,
          last_error: "hard_max_attempts_exceeded",
          last_error_code: "hard_failure",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return new Response(
        JSON.stringify({
          error: "hard_max_attempts_exceeded",
          jobId,
          attempt_count: attemptCount,
          message: "Job exceeded maximum retry attempts. Please re-upload the document.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Guard 4 — stuck processing job >2min old: mark failed so attempt counter increments cleanly
    if (job.status === "processing" && !isRecentlyUpdated) {
      console.warn(`[Resume] Job ${jobId} stuck in processing for ${Math.round((Date.now() - jobUpdatedAt) / 1000)}s. Marking failed before resume.`);
      await supabase
        .from("parsing_jobs")
        .update({
          status: "failed",
          current_stage: "Failed — Zombie Worker Detected",
          error_message: `Worker silently died during processing (last heartbeat ${Math.round((Date.now() - jobUpdatedAt) / 1000)}s ago)`,
          last_error: "zombie_worker_timeout",
          last_error_code: "worker_timeout",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    // Loop-breaker: if LLM already failed and we've had 2+ attempts, inform the caller
    // that the next run will skip LLM entirely (handled in process_parsing_job)
    const willSkipLlm = attemptCount >= 2 || (priorLlmFailed && attemptCount >= 1);

    console.log(`[Resume] Job ${jobId} (${job.supplier_name}) — attempt_count=${attemptCount}, priorLlmFailed=${priorLlmFailed}, willSkipLlm=${willSkipLlm}`);

    await supabase
      .from("parsing_jobs")
      .update({
        status: "pending",
        progress: 0,
        error_message: null,
        current_stage: willSkipLlm ? "Queued — Regex Recovery (LLM skipped)" : "Queued — Retrying",
        updated_at: new Date().toISOString(),
        metadata: {
          ...(job.metadata as Record<string, unknown> || {}),
          retry_triggered_at: new Date().toISOString(),
          entry_point: "resume_parsing_job",
          prior_attempt_count: attemptCount,
          prior_llm_fail_reason: job.llm_fail_reason ?? null,
          will_skip_llm: willSkipLlm,
        },
      })
      .eq("id", jobId);

    const processUrl = `${supabaseUrl}/functions/v1/process_parsing_job`;

    fetch(processUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId }),
    }).catch((err) => {
      console.error(`[Resume] Failed to dispatch process_parsing_job for job ${jobId}:`, err);
    });

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        message: willSkipLlm
          ? "Re-dispatched — LLM will be skipped (prior failures detected), running regex recovery"
          : "Re-dispatched to process_parsing_job",
        willSkipLlm,
        attemptCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Resume] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
