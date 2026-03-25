import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  cleanText,
  hasMoney,
  hasDesc,
  normalizeLine,
  extractDocumentTotal,
  dedupeKey,
  addRemainderIfNeeded,
} from "../_shared/itemNormalizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TOTAL_ROW_PATTERNS = [
  /^total$/i,
  /^grand total$/i,
  /^sub.?total$/i,
  /^total price$/i,
  /^total amount$/i,
  /^contract sum$/i,
  /^final contract sum/i,
  /^total contract/i,
  /^total \(excl/i,
  /^total \(inc/i,
  /^total ex\.? gst$/i,
  /^total incl\.? gst$/i,
  /^lump sum total$/i,
  /^quote total$/i,
  /^project total$/i,
];

function isTotalRow(description: string): boolean {
  const trimmed = (description ?? '').trim();
  return TOTAL_ROW_PATTERNS.some(p => p.test(trimmed));
}

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

    // Check if we need to process anything
    const needsFinalization = !job.quote_id && completedChunks.length > 0;
    const needsRetry = failedChunks.length > 0;

    if (!needsFinalization && !needsRetry) {
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

    if (needsFinalization) {
      console.log(`[Resume] All chunks complete but no quote created yet. Finalizing...`);
    }

    // Update job status to processing if we're retrying
    if (needsRetry) {
      await supabase
        .from("parsing_jobs")
        .update({
          status: "processing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    const llmUrl = `${supabaseUrl}/functions/v1/parse_quote_llm_fallback_v2`;
    const llmHeaders = {
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    };

    const newItems: any[] = [];
    let retriedCount = 0;
    let successCount = 0;

    // Retry failed chunks IN PARALLEL (skip if just finalizing)
    if (needsRetry) {
      console.log(`[Resume] Processing ${failedChunks.length} chunks in parallel...`);

      // Process chunks in parallel with max concurrency of 5
      const maxConcurrency = 5;
      const chunkBatches: any[][] = [];
      for (let i = 0; i < failedChunks.length; i += maxConcurrency) {
        chunkBatches.push(failedChunks.slice(i, i + maxConcurrency));
      }

      for (const batch of chunkBatches) {
        const batchPromises = batch.map(async (chunk) => {
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
                phase: 'full',
                trade: job.trade,
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
              return { success: false, chunk, items: [] };
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

            console.log(`[Resume] Chunk ${chunk.chunk_number} succeeded: ${chunkItems.length} items`);
            return { success: true, chunk, items: renumberedItems };

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
            return { success: false, chunk, items: [] };
          }
        });

        const batchResults = await Promise.all(batchPromises);

        batchResults.forEach(result => {
          if (result.success) {
            newItems.push(...result.items);
            successCount++;
          }
        });

        console.log(`[Resume] Batch complete: ${batchResults.filter(r => r.success).length}/${batchResults.length} succeeded`);
      }
    } // end if (needsRetry)

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

    // ✅ Keep items if they have description OR money
    const keptItems = allItems.filter(item => hasDesc(item) || hasMoney(item));
    console.log(`[Resume] After safe filter: ${keptItems.length} items (removed ${allItems.length - keptItems.length} empty rows)`);

    // ✅ Normalize items to fill empty descriptions from raw_text
    const normalizedItems = keptItems.map((item, index) => normalizeLine(item, index));
    console.log(`[Resume] After normalization: ${normalizedItems.length} items`);

    // ✅ Deduplicate using improved key
    const seenKeys = new Set();
    const dedupedItems = normalizedItems.filter(item => {
      const key = dedupeKey(item);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    console.log(`[Resume] After dedup: ${dedupedItems.length} items (removed ${normalizedItems.length - dedupedItems.length} duplicates)`);

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
          created_by: job.user_id || job.created_by,
          organisation_id: job.organisation_id,
          trade: job.trade || 'passive_fire',
        })
        .select()
        .single();

      if (quoteError) {
        console.error(`[Resume] Failed to create quote:`, quoteError);
      } else if (newQuote) {
        quoteId = newQuote.id;
        console.log(`[Resume] Created quote ${quoteId}`);
      }
    }

    // ✅ Extract document total from chunk text
    // Try ALL chunks (not just last) since Grand Total could be anywhere
    let documentTotal: number | null = null;
    if (allCompletedChunks.data && allCompletedChunks.data.length > 0) {
      const allChunksText = await supabase
        .from("parsing_chunks")
        .select("chunk_text, chunk_number")
        .eq("job_id", jobId)
        .eq("status", "completed")
        .order("chunk_number", { ascending: false });

      if (allChunksText.data) {
        // Try chunks in reverse order (summary usually at end)
        for (const chunk of allChunksText.data) {
          if (chunk.chunk_text) {
            documentTotal = extractDocumentTotal(chunk.chunk_text);
            if (documentTotal) {
              console.log(`[Resume] Extracted document total from chunk ${chunk.chunk_number}: $${documentTotal.toLocaleString()}`);
              break;
            }
          }
        }
      }
    }

    // ✅ V5: Use deduped items AS-IS (no band-aid remainder adjustment)
    const finalItems = dedupedItems;
    const rawItemsCount = allItems.length;

    // Replace ALL items with complete deduplicated set
    if (quoteId && finalItems.length > 0) {
      // Delete old items (partial data)
      await supabase
        .from("quote_items")
        .delete()
        .eq("quote_id", quoteId);

      // ✅ Insert items — exclude rollup/total rows that would double-count breakdown lines
      const quoteItems = finalItems.filter((line: any) => !isTotalRow(String(line.description ?? ''))).map((line: any) => ({
        quote_id: quoteId,
        description: cleanText(line.description) || 'No description',
        quantity: parseFloat(line.qty) || 0,
        unit: line.unit || 'ea',
        unit_price: parseFloat(line.rate) || 0,
        total_price: parseFloat(line.total) || 0,
        scope_category: line.section || null,
        is_excluded: false,
      }));

      if (quoteItems.length > 0) {
        await supabase.from("quote_items").insert(quoteItems);

        // ✅ V5: Calculate validation metrics
        const itemsSum = finalItems.reduce((sum: number, line: any) =>
          sum + (parseFloat(line.total) || 0), 0
        );

        // V5: total_amount = sum(items), NOT document_total
        const tolerance = documentTotal ? Math.max(100, documentTotal * 0.02) : 100;
        const missingAmount = documentTotal ? documentTotal - itemsSum : 0;
        const needsReview = documentTotal !== null && Math.abs(missingAmount) > tolerance;

        // ✅ Update quote with V5 validation fields
        await supabase
          .from("quotes")
          .update({
            total_amount: itemsSum, // V5: Use actual sum, not document total
            total_price: itemsSum,
            document_total: documentTotal, // Store for reference
            missing_amount: needsReview ? missingAmount : 0,
            needs_review: needsReview,
            items_count: quoteItems.length,
            raw_items_count: rawItemsCount,
            inserted_items_count: quoteItems.length,
          })
          .eq("id", quoteId);

        console.log(`[Resume V5] Replaced ${quoteItems.length} items in quote ${quoteId}`);
        console.log(`[Resume V5] Sum(items): $${itemsSum.toLocaleString()}`);
        console.log(`[Resume V5] Document total: $${documentTotal?.toLocaleString() || 'not found'}`);

        if (needsReview) {
          console.warn(`[Resume V5] ⚠️ NEEDS REVIEW: Missing $${Math.abs(missingAmount).toLocaleString()} (${((Math.abs(missingAmount) / documentTotal!) * 100).toFixed(1)}% gap)`);
        } else {
          console.log(`[Resume V5] ✅ Totals match within tolerance`);
        }
      }
    }

    // Update job status - check for ANY incomplete chunks
    const { data: incompleteChunks } = await supabase
      .from("parsing_chunks")
      .select("id, status")
      .eq("job_id", jobId)
      .in("status", ["failed", "pending", "processing"]);

    const incompleteCount = incompleteChunks?.length || 0;
    const allChunksComplete = incompleteCount === 0;

    const finalStatus = allChunksComplete ? "completed" : "processing";
    const finalProgress = allChunksComplete ? 100 : 95;
    const errorMessage = incompleteCount > 0
      ? `Partial completion: ${incompleteCount} chunks still pending/processing/failed`
      : null;

    const updateData: any = {
      quote_id: quoteId,
      status: finalStatus,
      progress: finalProgress,
      parsed_lines: dedupedItems,
      updated_at: new Date().toISOString(),
      error_message: errorMessage
    };

    // Only set completed_at if truly complete
    if (allChunksComplete) {
      updateData.completed_at = new Date().toISOString();
    }

    await supabase
      .from("parsing_jobs")
      .update(updateData)
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
        stillFailed: incompleteCount,
        message: allChunksComplete
          ? `Successfully recovered ${newItems.length} items from ${successCount}/${retriedCount} retried chunks`
          : `Partial completion: ${incompleteCount} chunks still incomplete`
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
