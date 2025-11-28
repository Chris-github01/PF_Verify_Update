import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Auto-retry parsing job until ALL chunks are successfully parsed
 * Loops continuously until no failed/pending chunks remain
 */
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

    const { jobId, maxRetries = 10 } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Missing jobId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[AutoRetry] Starting auto-retry loop for job ${jobId}, maxRetries: ${maxRetries}`);

    let iteration = 0;
    let totalRecovered = 0;
    const iterationResults: any[] = [];

    while (iteration < maxRetries) {
      iteration++;
      console.log(`\n[AutoRetry] Iteration ${iteration}/${maxRetries}`);

      // Reset any chunks stuck in "processing" status
      const { data: stuckChunks } = await supabase
        .from("parsing_chunks")
        .select("id, chunk_number")
        .eq("job_id", jobId)
        .eq("status", "processing");

      if (stuckChunks && stuckChunks.length > 0) {
        console.log(`[AutoRetry] Resetting ${stuckChunks.length} stuck chunks`);
        await supabase
          .from("parsing_chunks")
          .update({
            status: "failed",
            error_message: "Auto-reset from processing status",
            updated_at: new Date().toISOString()
          })
          .eq("job_id", jobId)
          .eq("status", "processing");
      }

      // Check for failed or pending chunks
      const { data: chunks } = await supabase
        .from("parsing_chunks")
        .select("id, chunk_number, status")
        .eq("job_id", jobId)
        .order("chunk_number");

      if (!chunks || chunks.length === 0) {
        console.log(`[AutoRetry] No chunks found for job ${jobId}`);
        break;
      }

      const failedChunks = chunks.filter(c => c.status === 'failed' || c.status === 'pending');
      const completedChunks = chunks.filter(c => c.status === 'completed');

      console.log(`[AutoRetry] Status: ${completedChunks.length}/${chunks.length} completed, ${failedChunks.length} failed/pending`);

      // If all chunks are completed, we're done!
      if (failedChunks.length === 0) {
        console.log(`[AutoRetry] All chunks completed successfully!`);
        iterationResults.push({
          iteration,
          status: "complete",
          completedChunks: completedChunks.length,
          totalChunks: chunks.length
        });
        break;
      }

      // Call resume_parsing_job to retry failed chunks
      console.log(`[AutoRetry] Calling resume_parsing_job to retry ${failedChunks.length} chunks...`);

      const resumeUrl = `${supabaseUrl}/functions/v1/resume_parsing_job`;
      const resumeHeaders = {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      };

      try {
        const resumeRes = await fetch(resumeUrl, {
          method: "POST",
          headers: resumeHeaders,
          body: JSON.stringify({ jobId }),
        });

        if (!resumeRes.ok) {
          const errorText = await resumeRes.text();
          console.error(`[AutoRetry] Resume failed:`, errorText);
          iterationResults.push({
            iteration,
            status: "error",
            error: errorText
          });
          break;
        }

        const resumeResult = await resumeRes.json();
        console.log(`[AutoRetry] Resume result:`, resumeResult);

        totalRecovered += resumeResult.newItems || 0;
        iterationResults.push({
          iteration,
          status: "success",
          retriedChunks: resumeResult.retriedChunks,
          successfulRetries: resumeResult.successfulRetries,
          newItems: resumeResult.newItems,
          stillFailed: resumeResult.stillFailed
        });

        // If no progress was made (all retries failed), stop to avoid infinite loop
        if (resumeResult.successfulRetries === 0 && resumeResult.stillFailed > 0) {
          console.log(`[AutoRetry] No progress made. Stopping to avoid infinite loop.`);
          break;
        }

      } catch (error) {
        console.error(`[AutoRetry] Exception during resume:`, error);
        iterationResults.push({
          iteration,
          status: "exception",
          error: error.message
        });
        break;
      }

      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Get final status
    const { data: finalChunks } = await supabase
      .from("parsing_chunks")
      .select("id, chunk_number, status")
      .eq("job_id", jobId);

    const finalCompleted = finalChunks?.filter(c => c.status === 'completed').length || 0;
    const finalFailed = finalChunks?.filter(c => c.status === 'failed' || c.status === 'pending').length || 0;
    const finalTotal = finalChunks?.length || 0;

    // Get final item count
    const { data: job } = await supabase
      .from("parsing_jobs")
      .select("quote_id, parsed_lines")
      .eq("id", jobId)
      .single();

    const finalItemCount = job?.parsed_lines?.length || 0;

    const success = finalFailed === 0;
    const message = success
      ? `✅ All ${finalTotal} chunks parsed successfully! Total items: ${finalItemCount}`
      : `⚠️ Completed ${finalCompleted}/${finalTotal} chunks. ${finalFailed} chunks still failed.`;

    console.log(`[AutoRetry] Final: ${message}`);

    return new Response(
      JSON.stringify({
        success,
        message,
        jobId,
        quoteId: job?.quote_id,
        iterations: iteration,
        totalRecovered,
        finalStatus: {
          totalChunks: finalTotal,
          completedChunks: finalCompleted,
          failedChunks: finalFailed,
          totalItems: finalItemCount
        },
        iterationResults
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[AutoRetry] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});