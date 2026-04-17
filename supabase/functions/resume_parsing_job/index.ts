import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// =============================================================================
// RESUME PARSING JOB — Phase 1 Stabilization
//
// This function is the retry/recovery entry point called by ParsingJobMonitor
// when a job is stuck or failed.
//
// Production behaviour (Phase 1):
//   1. Load the job record
//   2. Reset job status to "pending"
//   3. Re-dispatch process_parsing_job (the ONLY parser path)
//   4. Return immediately (fire-and-forget, same pattern as start_parsing_job)
//
// NO V2 chunk logic. NO legacy LLM fallback. NO alternative parser paths.
// If V3 fails again, the job is marked failed with diagnostics by process_parsing_job.
// =============================================================================

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
      .select("id, supplier_name, status, file_url, filename, trade, metadata")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Resume] Re-dispatching job ${jobId} (${job.supplier_name}) via process_parsing_job`);

    await supabase
      .from("parsing_jobs")
      .update({
        status: "pending",
        progress: 0,
        error_message: null,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(job.metadata as Record<string, unknown> || {}),
          retry_triggered_at: new Date().toISOString(),
          entry_point: "resume_parsing_job",
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
        message: "Job re-dispatched to process_parsing_job (V3 parser)",
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
