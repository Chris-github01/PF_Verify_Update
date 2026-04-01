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
  filterTotalRows,
} from "../_shared/itemNormalizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Regex extraction of level-based pricing table from Hippo-style plumbing PDFs.
 * The PDF text extractor splits each word onto its own line, so we collapse the
 * entire text first and scan for level patterns followed by a run of numbers.
 * The last number in each run is the SUM column (total for that level).
 */
function extractPlumbingLevelTable(text: string): any[] {
  const flat = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

  const LEVEL_RE = /(lower\s+ground(?:\s+level)?|upper\s+ground(?:\s+level)?|ground(?:\s+level)?|basement|level\s+\d+|floor\s+\d+|roof(?:\s+level)?|plant\s+room|car\s+park(?:\s+level)?|podium(?:\s+level)?)\s+((?:[\d,]+(?:\.\d+)?\s+){1,10}[\d,]+(?:\.\d+)?)/gi;

  const results: any[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = LEVEL_RE.exec(flat)) !== null) {
    const rawLabel = match[1].trim();
    if (/^levels?\s*$/i.test(rawLabel)) continue;

    const numbers = match[2].trim().match(/[\d,]+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 1) continue;

    const sumVal = parseFloat(numbers[numbers.length - 1].replace(/,/g, ''));
    if (!sumVal || sumVal < 1000) continue;

    const labelKey = rawLabel.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(labelKey)) continue;
    seen.add(labelKey);

    const description = rawLabel
      .toLowerCase()
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
      .replace(/\s+/g, ' ')
      + ' - Plumbing Works';

    results.push({
      description,
      qty: 1,
      unit: 'LS',
      rate: sumVal,
      total: sumVal,
      section: 'Main',
      confidence: 0.9,
      source: 'regex_level_table',
      raw_text: match[0].trim(),
      validation_flags: [],
    });
  }

  return results;
}

/**
 * Parses a European-format amount string to a number.
 * "$ 217,98" → 217.98, "$ 23 872,91" → 23872.91, "13 740 112,59" → 13740112.59
 */
function parseEuropeanAmount(raw: string): number {
  const s = raw.replace(/\$/g, '').replace(/\s/g, '').trim();
  // European: digits with optional spaces as thousands separator, comma as decimal
  if (/^[\d\s]+,\d{1,2}$/.test(raw.replace(/\$/g, '').trim())) {
    return parseFloat(s.replace(',', '.'));
  }
  // Standard: commas as thousands separator
  return parseFloat(s.replace(/,/g, '')) || 0;
}

/**
 * Deterministic parser for the Sero Apartments carpentry PDF format.
 *
 * This PDF has a very specific layout that pdfjs scrambles:
 * 1. A "Quotation" section with line items: "N   qty   unit   $ total"
 *    (NO inline descriptions — the "No | Description | Amount" header is misleading;
 *     the description column is actually blank for all numbered rows)
 * 2. A "Summary of Quantity" / rate-schedule section with:
 *    "Description text   $ U/Rate" pairs (multi-line descriptions possible)
 *
 * Strategy:
 * - Extract all numbered line items (N   qty   unit   $ total) from the combined text
 * - Extract the rate schedule (desc → rate) from the rate schedule section
 * - For each line item, compute implied rate = total/qty and match to rate schedule
 * - Return only the 37 real line items with proper descriptions, zero garbage
 */
function parseCarpentrySeraFormat(chunkTexts: string[]): any[] | null {
  const combined = chunkTexts.join('\n');

  // ── Step 1: Extract numbered line items ──────────────────────────────────────
  // Pattern: line starting with a number, then qty (with optional space as thousands sep),
  // then unit (m2|m|no|ea|lm|sum), then $ total (European format)
  // e.g. "1   110   m2   $ 23 872,91" or "37   676   m2   $ 62 961,58"
  const lineItemRe = /^\s*(\d{1,2})\s{1,6}([\d][\d ]*)\s{1,6}(m2|m\b|no\b|ea\b|lm\b|sum\b)\s{1,6}\$\s*([\d][\d ]*,\d{2})\s*$/gim;
  const lineItems: { num: number; qty: number; unit: string; total: number }[] = [];
  const seenNums = new Set<number>();

  let m: RegExpExecArray | null;
  while ((m = lineItemRe.exec(combined)) !== null) {
    const num = parseInt(m[1], 10);
    const qty = parseFloat(m[2].replace(/\s/g, ''));
    const unit = m[3].trim().toLowerCase();
    const total = parseEuropeanAmount(m[4]);

    // Skip if total is 0, or if we've already seen this item number
    // (chunks overlap so the same row may appear twice)
    if (total <= 0 || qty <= 0) continue;
    if (seenNums.has(num)) continue;
    seenNums.add(num);

    lineItems.push({ num, qty, unit, total });
  }

  if (lineItems.length === 0) return null;

  // Sort by item number
  lineItems.sort((a, b) => a.num - b.num);

  // ── Step 2: Extract rate schedule (description → rate) ──────────────────────
  // Rate schedule lines end with "$ XX,XX" (European unit rate, < $5000).
  // Descriptions may span multiple lines (no leading digit, no $).
  const rateSchedule: { desc: string; rate: number }[] = [];
  const lines = combined.split('\n');

  // Skip everything before the first rate-schedule marker
  // The rate schedule appears after "Item   Dwg Ref   U/Rate" header lines
  const rateLineRe = /^(.*?)\s+\$\s*([\d][\d ]*,\d{2})\s*$/;
  // Exclude lines that are section headers, boilerplate, or column headers
  const skipDescRe = /^(no|qty|unit|total|amount|item|description|subtotal|grand total|gst|supply & install|quotation|to\s|project|date|wall legend|location|wall type|dwg ref|u\/rate|summary of quantity|carpentry work|green tga|allowed \d|apt\.|service nogging)\b/i;

  let pendingDescLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { pendingDescLines = []; continue; }

    const rateMatch = line.match(rateLineRe);
    if (rateMatch) {
      const descPart = rateMatch[1].trim();
      const rate = parseEuropeanAmount(rateMatch[2]);

      // Only unit rates (< $5000)
      if (rate > 0 && rate < 5000) {
        const fullDesc = [...pendingDescLines, descPart].join(' ').trim();

        if (fullDesc.length > 3 && !/^\d+$/.test(fullDesc) && !skipDescRe.test(fullDesc)) {
          rateSchedule.push({ desc: fullDesc, rate });
        }
      }
      pendingDescLines = [];
    } else if (!/\$/.test(line) && /[A-Za-z]/.test(line) && !/^\d+\s/.test(line) && line.length < 120) {
      // Possible multi-line description fragment
      pendingDescLines.push(line);
    } else {
      pendingDescLines = [];
    }
  }

  // ── Step 3: Build rate → description lookup (best match wins) ───────────────
  const rateMap = new Map<string, string>();
  for (const entry of rateSchedule) {
    const key = entry.rate.toFixed(2);
    if (!rateMap.has(key)) {
      rateMap.set(key, entry.desc);
    }
  }

  // ── Step 4: Match each line item to a description ────────────────────────────
  const result: any[] = [];
  for (const item of lineItems) {
    const impliedRate = item.total / item.qty;

    // Find closest rate within 2% tolerance
    let bestDesc = '';
    let bestDiff = Infinity;
    for (const [key, desc] of rateMap) {
      const schedRate = parseFloat(key);
      const diff = Math.abs(schedRate - impliedRate);
      const relDiff = diff / impliedRate;
      if (relDiff < 0.02 && diff < bestDiff) {
        bestDiff = diff;
        bestDesc = desc;
      }
    }

    // Clean up multi-line description artifacts
    const cleanDesc = bestDesc
      .replace(/\s+/g, ' ')
      .replace(/^(W\d+\s+for\s+)/i, '')
      .replace(/^(Assumed\s+W\d+\s+for\s+)/i, '')
      .trim();

    result.push({
      description: cleanDesc || `Item ${item.num}`,
      qty: item.qty,
      unit: item.unit,
      rate: impliedRate,
      total: item.total,
      section: 'Main',
      confidence: 0.95,
      source: 'deterministic_carpentry_parser',
      raw_text: `${item.num}   ${item.qty}   ${item.unit}   ${item.total}`,
      validation_flags: cleanDesc ? [] : ['NO_DESC_MATCH'],
    });
  }

  return result;
}

/**
 * Detects a "x N levels" multiplier pattern in a carpentry quote.
 * Handles both standard ($13,740,112.59) and European (13 740 112,59) number formats.
 * Returns the multiplier and validated document total, or null if not found/validated.
 */
function detectCarpentryLevelsMultiplier(text: string, parsedSubtotal: number): { multiplier: number; documentTotal: number } | null {
  if (parsedSubtotal <= 0) return null;
  const flat = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

  // Pattern A: explicit "x 17 levels" or "× 17 levels"
  const xMatch = flat.match(/[xX×]\s*(\d+)\s*levels?/i);
  // Pattern B: "Level 1 to 17" or inside parens "(Level 1 to 17)"
  const rangeMatch = flat.match(/[Ll]evel\s+1\s+to\s+(\d+)/i);

  const rawMultiplier = xMatch
    ? parseInt(xMatch[1], 10)
    : rangeMatch
    ? parseInt(rangeMatch[1], 10)
    : null;

  if (!rawMultiplier || rawMultiplier < 2 || rawMultiplier > 100) return null;

  // Parse a number that may be in standard ($13,740,112.59) or European (13 740 112,59) format
  const parseAmount = (raw: string): number => {
    const s = raw.trim();
    // European: ends with comma + 2 digits, spaces as thousands separators
    if (/^[\d\s]+,\d{2}$/.test(s)) {
      return parseFloat(s.replace(/\s/g, '').replace(',', '.'));
    }
    // Standard: commas as thousands separators
    return parseFloat(s.replace(/,/g, ''));
  };

  // Try to find the stated grand total in the text
  // Handles: "Total $ 13 740 112,59" / "Total $13,740,112.59" / "Total 13740112.59"
  const totalPatterns = [
    /\bTotal\s+\$?\s*([\d][\d\s]*[.,]\d{2})\b/gi,
    /Grand\s+Total\s+\$?\s*([\d][\d\s]*[.,]\d{2})\b/gi,
  ];

  let documentTotal = 0;
  for (const pattern of totalPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(flat)) !== null) {
      const val = parseAmount(m[1]);
      if (val > parsedSubtotal * 1.5) {
        documentTotal = val;
        break;
      }
    }
    if (documentTotal > 0) break;
  }

  if (documentTotal > 0) {
    const expected = parsedSubtotal * rawMultiplier;
    const tolerance = expected * 0.03; // 3% tolerance for rounding
    if (Math.abs(expected - documentTotal) > tolerance) {
      console.log(`[Resume] Levels multiplier candidate x${rawMultiplier} rejected: subtotal×${rawMultiplier}=${expected.toFixed(2)} but doc total=${documentTotal.toFixed(2)}`);
      return null;
    }
    return { multiplier: rawMultiplier, documentTotal };
  }

  // Trust explicit "x N levels" even without a parseable document total
  if (xMatch) {
    return { multiplier: rawMultiplier, documentTotal: parsedSubtotal * rawMultiplier };
  }

  return null;
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
      .select("parsed_items, chunk_text")
      .eq("job_id", jobId)
      .eq("status", "completed");

    const allItems: any[] = [];
    const allChunkTexts: string[] = [];
    for (const chunk of allCompletedChunks.data || []) {
      if (chunk.parsed_items) {
        allItems.push(...chunk.parsed_items);
      }
      if (chunk.chunk_text) {
        allChunkTexts.push(chunk.chunk_text);
      }
    }

    console.log(`[Resume] Total items after retry: ${allItems.length}`);

    const isCarpentry = (job.trade ?? '').toLowerCase() === 'carpentry';
    // For plumbing quotes: if LLM missed the level-table rows, inject them from raw text
    const isPlumbing = (job.trade ?? '').toLowerCase() === 'plumbing';
    if (isPlumbing) {
      const combinedText = allChunkTexts.join('\n');
      const levelItems = extractPlumbingLevelTable(combinedText);
      if (levelItems.length > 0) {
        const hasLevelItems = allItems.some((item: any) =>
          /level|ground|roof|basement|floor/i.test(item.description || '')
        );
        if (!hasLevelItems) {
          console.log(`[Resume] Plumbing: injecting ${levelItems.length} level-table rows from regex fallback`);
          allItems.push(...levelItems);
        }
      }
    }

    // ✅ For carpentry: attempt deterministic parse directly from raw chunk text.
    // This bypasses all the LLM noise — the Sero/Western PDF format is structured
    // enough to parse with regex (numbered items + rate schedule).
    let afterStubDedup: any[];
    if (isCarpentry) {
      const deterministicItems = parseCarpentrySeraFormat(allChunkTexts);
      if (deterministicItems && deterministicItems.length >= 10) {
        console.log(`[Resume] Carpentry deterministic parser: ${deterministicItems.length} items extracted, discarding LLM output`);
        afterStubDedup = deterministicItems;
      } else {
        console.log(`[Resume] Carpentry deterministic parser yielded ${deterministicItems?.length ?? 0} items, falling back to LLM output`);
        // Fall back to LLM-based pipeline
        const safeItems = allItems.filter((item: any) => hasDesc(item) || hasMoney(item));
        const { kept: keptItems } = filterTotalRows(safeItems);
        const normalizedItems = keptItems.map((item: any, index: number) => normalizeLine(item, index));
        const seenKeys = new Set();
        afterStubDedup = normalizedItems.filter((item: any) => {
          const key = dedupeKey(item);
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });
      }
    } else {
      // Non-carpentry: standard LLM pipeline
      const safeItems = allItems.filter((item: any) => hasDesc(item) || hasMoney(item));
      console.log(`[Resume] After safe filter: ${safeItems.length} items (removed ${allItems.length - safeItems.length} empty rows)`);

      const { kept: keptItems, removedCount: totalRowsRemoved, removedDescriptions: totalRowDescs } = filterTotalRows(safeItems);
      if (totalRowsRemoved > 0) {
        console.log(`[Resume] Removed ${totalRowsRemoved} total/summary row(s): ${totalRowDescs.join(', ')}`);
      }

      const normalizedItems = keptItems.map((item: any, index: number) => normalizeLine(item, index));
      console.log(`[Resume] After normalization: ${normalizedItems.length} items`);

      const seenKeys = new Set();
      const dedupedItems = normalizedItems.filter((item: any) => {
        const key = dedupeKey(item);
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      const totalPriceChunkMap = new Map<string, { chunkNum: number; hasMismatch: boolean }>();
      for (const item of dedupedItems) {
        const totalKey = Number(item.total ?? 0).toFixed(2);
        if (Number(item.total ?? 0) < 100) continue;
        const chunkNum = item.originalChunkNumber ?? 0;
        const hasMismatch = Array.isArray(item.validation_flags) && item.validation_flags.includes('MISMATCH');
        const existing = totalPriceChunkMap.get(totalKey);
        if (!existing) {
          totalPriceChunkMap.set(totalKey, { chunkNum, hasMismatch });
        } else {
          if (chunkNum > existing.chunkNum || (!hasMismatch && existing.hasMismatch)) {
            totalPriceChunkMap.set(totalKey, { chunkNum, hasMismatch });
          }
        }
      }

      afterStubDedup = dedupedItems.filter((item: any) => {
        const totalKey = Number(item.total ?? 0).toFixed(2);
        if (Number(item.total ?? 0) < 100) return true;
        const best = totalPriceChunkMap.get(totalKey);
        if (!best) return true;
        const itemChunk = item.originalChunkNumber ?? 0;
        const itemHasMismatch = Array.isArray(item.validation_flags) && item.validation_flags.includes('MISMATCH');
        if (itemChunk < best.chunkNum) return false;
        if (itemHasMismatch && !best.hasMismatch && itemChunk === best.chunkNum) return false;
        return true;
      });

      console.log(`[Resume] After dedup: ${afterStubDedup.length} items`);
    }

    // Create or update quote
    let quoteId = job.quote_id;

    if (!quoteId) {
      const { data: newQuote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          project_id: job.project_id,
          supplier_name: job.supplier_name,
          total_amount: 0,
          items_count: afterStubDedup.length,
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

    // Carpentry levels multiplier: detect "x N levels" across full combined text and append multiplier line item
    if (isCarpentry && afterStubDedup.length > 0) {
      const combinedText = allChunkTexts.join('\n');
      const rawSubtotal = afterStubDedup.reduce((sum: number, item: any) => sum + (parseFloat(item.total) || 0), 0);
      const levelsResult = detectCarpentryLevelsMultiplier(combinedText, rawSubtotal);
      if (levelsResult) {
        const { multiplier, documentTotal: levelsDocTotal } = levelsResult;
        console.log(`[Resume] Carpentry levels multiplier detected: x${multiplier} (subtotal=${rawSubtotal.toFixed(2)} × ${multiplier} = ${levelsDocTotal.toFixed(2)})`);
        afterStubDedup.push({
          description: `Levels Multiplier (x${multiplier} levels — subtotal applied across all ${multiplier} identical levels)`,
          qty: multiplier - 1,
          unit: 'LS',
          rate: rawSubtotal,
          total: rawSubtotal * (multiplier - 1),
          section: 'Levels Multiplier',
          confidence: 0.95,
          source: 'levels_multiplier',
          raw_text: `x${multiplier} levels`,
          validation_flags: ['LEVELS_MULTIPLIER'],
        });
        // Use the multiplied total as document total for validation
        documentTotal = levelsDocTotal;
      }
    }

    // ✅ V5: Use deduped items AS-IS (no band-aid remainder adjustment)
    const finalItems = afterStubDedup;
    const rawItemsCount = allItems.length;

    // Replace ALL items with complete deduplicated set
    if (quoteId && finalItems.length > 0) {
      // Delete old items (partial data)
      await supabase
        .from("quote_items")
        .delete()
        .eq("quote_id", quoteId);

      // ✅ Insert ALL items (no filter on description)
      const quoteItems = finalItems.map((line: any) => ({
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
      parsed_lines: afterStubDedup,
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
        totalItems: afterStubDedup.length,
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
