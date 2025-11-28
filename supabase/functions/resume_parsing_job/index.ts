import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Resume/Retry a stuck or partially completed parsing job
 * Retries only the failed chunks instead of reprocessing the entire file
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

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("parsing_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Resume] Job ${jobId}: ${job.supplier_name}, status: ${job.status}`);

    // Get all chunks for this job
    const { data: chunks, error: chunksError } = await supabase
      .from("parsing_chunks")
      .select("*")
      .eq("job_id", jobId)
      .order("chunk_number");

    if (chunksError || !chunks) {
      return new Response(
        JSON.stringify({ error: "Failed to load chunks" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find failed or pending chunks
    const failedChunks = chunks.filter(c => c.status === 'failed' || c.status === 'pending');
    const completedChunks = chunks.filter(c => c.status === 'completed');

    console.log(`[Resume] Total chunks: ${chunks.length}, Failed: ${failedChunks.length}, Completed: ${completedChunks.length}`);

    if (failedChunks.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No failed chunks to retry. Job is already complete.",
          jobId,
          totalChunks: chunks.length,
          completedChunks: completedChunks.length
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update job status to processing
    await supabase
      .from("parsing_jobs")
      .update({
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    const llmUrl = `${supabaseUrl}/functions/v1/parse_quote_llm_fallback`;
    const llmHeaders = {
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    };

    const newItems: any[] = [];
    let retriedCount = 0;
    let successCount = 0;

    // Retry failed chunks
    for (const chunk of failedChunks) {
      console.log(`[Resume] Retrying chunk ${chunk.chunk_number}/${chunk.total_chunks}...`);
      retriedCount++;

      await supabase
        .from("parsing_chunks")
        .update({ status: 'processing' })
        .eq("id", chunk.id);

      const timeoutMs = 120000; // 2 minutes
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const llmRes = await fetch(llmUrl, {
          method: "POST",
          headers: llmHeaders,
          body: JSON.stringify({
            text: chunk.chunk_text,
            supplierName: job.supplier_name,
            documentType: "PDF Quote",
            chunkInfo: `Chunk ${chunk.chunk_number}/${chunk.total_chunks} (Retry)`
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!llmRes.ok) {
          const errorText = await llmRes.text();
          console.error(`[Resume] Chunk ${chunk.chunk_number} failed:`, errorText);
          await supabase
            .from("parsing_chunks")
            .update({
              status: 'failed',
              error_message: `Retry failed: ${errorText}`,
              updated_at: new Date().toISOString()
            })
            .eq("id", chunk.id);
          continue;
        }

        const parseResult = await llmRes.json();
        const chunkItems = parseResult.lines || parseResult.items || [];

        // Renumber items globally
        const globalLineOffset = completedChunks.reduce((sum, c) =>
          sum + (c.parsed_items?.length || 0), 0
        ) + newItems.length;

        const renumberedItems = chunkItems.map((item: any, idx: number) => ({
          ...item,
          lineNumber: globalLineOffset + idx + 1,
          originalChunkNumber: chunk.chunk_number
        }));

        await supabase
          .from("parsing_chunks")
          .update({
            status: 'completed',
            parsed_items: renumberedItems,
            updated_at: new Date().toISOString()
          })
          .eq("id", chunk.id);

        newItems.push(...renumberedItems);
        successCount++;

        console.log(`[Resume] Chunk ${chunk.chunk_number} succeeded: ${chunkItems.length} items`);

      } catch (error) {
        clearTimeout(timeoutId);
        console.error(`[Resume] Chunk ${chunk.chunk_number} exception:`, error);
        await supabase
          .from("parsing_chunks")
          .update({
            status: 'failed',
            error_message: error.message,
            updated_at: new Date().toISOString()
          })
          .eq("id", chunk.id);
      }
    }

    // Aggregate ALL items (previously completed + newly recovered)
    const allCompletedChunks = await supabase
      .from("parsing_chunks")
      .select("parsed_items")
      .eq("job_id", jobId)
      .eq("status", "completed");

    const allItems: any[] = [];
    for (const chunk of allCompletedChunks.data || []) {
      if (chunk.parsed_items) {
        allItems.push(...chunk.parsed_items);
      }
    }

    console.log(`[Resume] Total items after retry: ${allItems.length}`);

    // Deduplicate
    const seenKeys = new Set();
    const dedupedItems = allItems.filter(item => {
      const key = `${item.lineNumber}_${item.description}_${item.qty}_${item.total}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    console.log(`[Resume] After dedup: ${dedupedItems.length} items`);

    // Create or update quote
    let quoteId = job.quote_id;

    if (!quoteId) {
      const { data: newQuote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          project_id: job.project_id,
          supplier_name: job.supplier_name,
          total_amount: 0,
          items_count: dedupedItems.length,
          status: "pending",
          user_id: job.user_id,
          organisation_id: job.organisation_id,
        })
        .select()
        .single();

      if (!quoteError && newQuote) {
        quoteId = newQuote.id;
      }
    }

    // Replace ALL items with complete deduplicated set
    if (quoteId && dedupedItems.length > 0) {
      // Delete old items (partial data)
      await supabase
        .from("quote_items")
        .delete()
        .eq("quote_id", quoteId);

      // Insert ALL deduped items
      const quoteItems = dedupedItems
        .filter((line: any) => line.description && line.description.trim().length > 0)
        .map((line: any) => ({
          quote_id: quoteId,
          description: line.description.trim(),
          quantity: parseFloat(line.qty) || 0,
          unit: line.unit || '',
          unit_price: parseFloat(line.rate) || 0,
          total_price: parseFloat(line.total) || 0,
          scope_category: line.section || null,
          is_excluded: false,
        }));

      if (quoteItems.length > 0) {
        await supabase.from("quote_items").insert(quoteItems);

        // Update quote total
        const totalAmount = dedupedItems.reduce((sum: number, line: any) =>
          sum + (line.total || 0), 0
        );

        await supabase
          .from("quotes")
          .update({
            total_amount: totalAmount,
            items_count: dedupedItems.length,
          })
          .eq("id", quoteId);

        console.log(`[Resume] Replaced ${quoteItems.length} items in quote ${quoteId}`);
      }
    }

    // Update job status
    const stillFailed = await supabase
      .from("parsing_chunks")
      .select("id")
      .eq("job_id", jobId)
      .eq("status", "failed");

    const finalStatus = (stillFailed.data?.length || 0) === 0 ? "completed" : "completed";
    const errorMessage = (stillFailed.data?.length || 0) > 0
      ? `Partial completion: ${stillFailed.data?.length} chunks still failed after retry`
      : null;

    await supabase
      .from("parsing_jobs")
      .update({
        quote_id: quoteId,
        status: finalStatus,
        progress: 100,
        parsed_lines: dedupedItems,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: errorMessage
      })
      .eq("id", jobId);

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        quoteId,
        retriedChunks: retriedCount,
        successfulRetries: successCount,
        totalItems: dedupedItems.length,
        newItems: newItems.length,
        stillFailed: stillFailed.data?.length || 0,
        message: `Successfully recovered ${newItems.length} items from ${successCount}/${retriedCount} retried chunks`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Resume] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
