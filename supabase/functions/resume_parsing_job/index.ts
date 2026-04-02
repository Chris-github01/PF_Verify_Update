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
 * Deterministic parser for Western/Sero-style carpentry PDF quotes.
 *
 * These PDFs have two layouts that pdfjs scrambles together:
 *
 * Layout A — numbered item table: "N   qty   unit   $ total"
 *   The column heading may be "No | Item | Dwg Ref | Qty | Unit | U/Rate | Total"
 *   or "No | Description | Amount". Both are equivalent. When the PDF preserves
 *   the description text, the row looks like:
 *     "1   150x0.75 Rondo steel stud wall ... 110   m2   $ 217,98   $ 23 872,91"
 *   When the extractor collapses it, only the numeric row survives:
 *     "1   110   m2   $ 23 872,91"
 *
 * Layout B — rate schedule: "Description text   $ U/Rate"
 *   Descriptions may span multiple lines. These are reference pricing only.
 *
 * Description resolution priority (per spec):
 *   Priority 1 — inline description present in the numbered row itself → use it directly
 *   Priority 2 — no inline description → match implied rate (total/qty) to rate schedule
 *   Priority 3 — neither works → fall back to "Item N" placeholder
 */
function parseCarpentrySeraFormat(chunkTexts: string[]): any[] | null {
  const combined = chunkTexts.join('\n');
  const lines = combined.split('\n');

  // ── Shared helpers ────────────────────────────────────────────────────────────

  // Lines that must never become item descriptions (column headers, section labels, metadata).
  // NOTE: "item" is intentionally NOT in this list — items like "Item" as the column header
  // are only skipped when they appear as standalone column header rows (handled by context),
  // not when "item" appears as part of a real description fetched from the numbered table.
  const isBoilerplateLine = (s: string): boolean => {
    // Only reject lines that are pure column headers / metadata labels with no real spec content.
    // Do NOT reject lines that happen to start with a section keyword but contain real spec detail.
    const lower = s.toLowerCase().trim();

    // Pure column-header / table-label words (exact or anchored):
    if (/^(no|qty|unit|total|amount|description|subtotal|sub total|grand total|gst|supply & install|quotation|project|date|wall legend|location|wall type|dwg ref|u\/rate|summary of quantity|carpentry work)\s*$/i.test(lower)) return true;

    // Document header metadata lines (e.g. "Project Sero Apartment", "Date 23/6/2023"):
    if (/^project\s+\S+/i.test(s)) return true;
    if (/^date\s+\d/i.test(s)) return true;

    // Lines containing "supply & install" (section headers, not item descriptions):
    if (/supply\s*&\s*install/i.test(s)) return true;

    // Lines that are purely "No Description Amount ..." (PDF header row collapsed into one line):
    if (/^no\s+description\s+amount/i.test(s)) return true;

    // All-caps section label lines (e.g. "INTERNAL WALL FRAMING", "TIMBER TRIM", "PLASTERBOARD"):
    if (/^(internal wall framing|insulation|timber trim|plasterboard|interior timber door|ceiling suspended grid system|ceiling lining|wall lining|carpentry work|summary of quantity)\b/i.test(lower)) return true;

    // "Supply & install" section lines (e.g. "Supply & install (Level 1 to 17)"):
    if (/^\(?level\s+\d+\s+to\s+\d+\)?/i.test(s)) return true;

    // Section-header-only lines that never have spec content after them on the same line:
    if (/^(allowed \d|apt\.\s*\d)/i.test(lower)) return true;

    // Lines that are purely numeric / dollar amounts:
    if (/^\$/.test(s)) return true;
    if (/^[\d\s,.$]+$/.test(s)) return true;

    // Company / client address lines:
    if (/^to\s+[A-Z]/i.test(s)) return true;
    if (/\b(pty ltd|ltd|limited|properties|holdings|group)\b/i.test(s)) return true;

    // Level multiplier lines:
    if (/^[xX×]\s*\d+\s*levels?/i.test(s)) return true;
    if (/^level\s+\d+\s+to\s+\d+/i.test(s)) return true;

    // Column header variants:
    if (/^item\b.*\b(dwg|ref|u\/rate|urate|rate|draw)/i.test(s)) return true;
    if (/^(item\s+)?(dwg\s+ref|drawing\s+ref)/i.test(s)) return true;
    if (/^item\s+\d+\s*$/i.test(s)) return true;

    return false;
  };

  // A standalone "Item" or "Item/Description" column-header line (no description text around it)
  const isItemHeaderLine = (s: string): boolean =>
    /^(item\/description|item|description)\s*$/i.test(s);

  // ── Step 1: Scan lines to build two datasets in one pass ─────────────────────
  //
  // Dataset A: numbered line items, with optional inline description
  //   strict form:  /^\s*N  qty  unit  $ total$/
  //   rich form:    /^\s*N  <desc text>  qty  unit  $ rate  $ total$/
  //
  // Dataset B: rate-schedule entries (desc → unit rate < $5000)

  // Strict numeric-only row: "1   110   m2   $ 23 872,91"
  const strictRowRe = /^\s*(\d{1,2})\s{1,6}([\d][\d ]*)\s{1,6}(m2|m\b|no\b|ea\b|lm\b|sum\b)\s{1,6}\$\s*([\d][\d ]*,\d{2})\s*$/i;

  // Rich inline row: "1 <description> 110 m2 $ 217,98 $ 23 872,91"
  // Allow 1–10 spaces between segments (PDF extractors often collapse multiple spaces).
  // Requires TWO dollar amounts at the end (unit rate + total).
  const richRowRe = /^\s*(\d{1,2})\s{1,10}(.+?)\s{1,10}([\d][\d ]*)\s{1,6}(m2|m\b|no\b|ea\b|lm\b|sum\b)\s{1,6}\$\s*[\d][\d ]*,\d{2}\s{1,6}\$\s*([\d][\d ]*,\d{2})\s*$/i;

  // Rate-schedule line ending with "$ XX,XX" or "$ XX.XX" where amount < $5000
  // Handles European comma-decimal and standard dot-decimal formats.
  const rateLineRe = /^(.*?)\s*\$\s*([\d][\d ]*[.,]\d{2})\s*$/;

  type LineItemRaw = { num: number; qty: number; unit: string; total: number; inlineDesc: string };
  const lineItems: LineItemRaw[] = [];
  const seenNums = new Set<number>();

  const rateSchedule: { desc: string; rate: number }[] = [];
  let pendingDescLines: string[] = [];
  // Also keep a rolling window of ALL recent non-numeric text lines (not just pending buffer),
  // so the look-back can find descriptions that were consumed as rate-schedule entries.
  let recentTextLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { pendingDescLines = []; continue; }

    // Skip standalone column-header lines ("Item", "Item/Description", "Description")
    if (isItemHeaderLine(line)) {
      pendingDescLines = [];
      continue;
    }

    // ── Try rich inline row first (Priority 1 source) ────────────────────────
    const richMatch = line.match(richRowRe);
    if (richMatch) {
      const num = parseInt(richMatch[1], 10);
      const rawDesc = richMatch[2].trim();
      const qty = parseFloat(richMatch[3].replace(/\s/g, ''));
      const unit = richMatch[4].trim().toLowerCase();
      const total = parseEuropeanAmount(richMatch[5]);

      // Accept the inline description even if it starts with a word that looks like a header,
      // as long as the overall row parsed correctly (num + qty + unit + rate + total all present).
      // Only filter out pure boilerplate (pure numeric strings, dollar-only lines, etc.).
      const descIsUsable = rawDesc.length > 2 && !/^[\d\s,.$]+$/.test(rawDesc) && !/^\$/.test(rawDesc);

      if (total > 0 && qty > 0 && !seenNums.has(num)) {
        seenNums.add(num);
        lineItems.push({ num, qty, unit, total, inlineDesc: descIsUsable ? rawDesc : '' });
      }
      pendingDescLines = [];
      continue;
    }

    // ── Try strict numeric-only row ──────────────────────────────────────────
    const strictMatch = line.match(strictRowRe);
    if (strictMatch) {
      const num = parseInt(strictMatch[1], 10);
      const qty = parseFloat(strictMatch[2].replace(/\s/g, ''));
      const unit = strictMatch[3].trim().toLowerCase();
      const total = parseEuropeanAmount(strictMatch[4]);

      if (total > 0 && qty > 0 && !seenNums.has(num)) {
        seenNums.add(num);
        // No look-back: description must be inline (same line) or matched via rate schedule.
        // Grabbing preceding text lines is unreliable — they belong to table headers/sections.
        lineItems.push({ num, qty, unit, total, inlineDesc: '' });
      }
      pendingDescLines = [];
      continue;
    }

    // ── Try rate-schedule entry ──────────────────────────────────────────────
    const rateMatch = line.match(rateLineRe);
    if (rateMatch) {
      const descPart = rateMatch[1].trim();
      const rate = parseEuropeanAmount(rateMatch[2]);

      if (rate > 0 && rate < 5000) {
        const fullDesc = [...pendingDescLines, descPart].join(' ').trim();
        console.log(`[CarpentryParser] RATE MATCH: rate=${rate}, descPart="${descPart}", pending=${JSON.stringify(pendingDescLines)}, fullDesc="${fullDesc}", boilerplate=${isBoilerplateLine(fullDesc)}`);
        if (fullDesc.length > 3 && !/^\d+$/.test(fullDesc) && !isBoilerplateLine(fullDesc)) {
          rateSchedule.push({ desc: fullDesc, rate });
          // Also keep the description text available for look-back
          if (descPart && /[A-Za-z]/.test(descPart)) {
            recentTextLines.push(descPart);
            if (recentTextLines.length > 10) recentTextLines.shift();
          }
        }
      } else {
        console.log(`[CarpentryParser] RATE REJECTED: rate=${rate} (out of 0-5000 range), line="${line}"`);
      }
      pendingDescLines = [];
      continue;
    }

    // ── Buffer potential multi-line description fragment ─────────────────────
    if (!/\$/.test(line) && /[A-Za-z]/.test(line) && !/^\d+\s/.test(line) && line.length < 120) {
      pendingDescLines.push(line);
      recentTextLines.push(line);
      if (recentTextLines.length > 10) recentTextLines.shift();
    } else {
      pendingDescLines = [];
    }
  }

  if (lineItems.length === 0) return null;

  // Sort by item number
  lineItems.sort((a, b) => a.num - b.num);

  // ── Step 2: Build rate → description lookup from rate schedule ───────────────
  const rateMap = new Map<string, string>();
  for (const entry of rateSchedule) {
    const key = entry.rate.toFixed(2);
    if (!rateMap.has(key)) {
      rateMap.set(key, entry.desc);
    }
  }

  // ── Step 3: Resolve description for each item using priority order ───────────
  const cleanupDesc = (s: string): string =>
    s.replace(/\s+/g, ' ')
     .replace(/^(W\d+\s+for\s+)/i, '')
     .replace(/^(Assumed\s+W\d+\s+for\s+)/i, '')
     .trim();

  console.log(`[CarpentryParser] rateSchedule has ${rateSchedule.length} entries:`, rateSchedule.map(e => `${e.rate}="${e.desc.substring(0,40)}"`).join(', '));
  console.log(`[CarpentryParser] lineItems:`, lineItems.map(i => `#${i.num} qty=${i.qty} total=${i.total} implied=${(i.total/i.qty).toFixed(2)} inline="${i.inlineDesc?.substring(0,30)}"`).join(' | '));

  const result: any[] = [];
  for (const item of lineItems) {
    const impliedRate = item.total / item.qty;

    // Priority 1: inline description from the row itself
    let finalDesc = '';
    if (item.inlineDesc && item.inlineDesc.length > 2) {
      finalDesc = cleanupDesc(item.inlineDesc);
    }

    // Priority 2: rate-schedule match (only if Priority 1 missed)
    if (!finalDesc) {
      let bestDesc = '';
      let bestDiff = Infinity;
      for (const [key, desc] of rateMap) {
        const schedRate = parseFloat(key);
        const diff = Math.abs(schedRate - impliedRate);
        const relDiff = diff / impliedRate;
        console.log(`[CarpentryParser] Item #${item.num} implied=${impliedRate.toFixed(2)} vs schedRate=${schedRate} diff=${diff.toFixed(2)} relDiff=${(relDiff*100).toFixed(1)}%`);
        if (relDiff < 0.05 && diff < bestDiff) {
          bestDiff = diff;
          bestDesc = desc;
        }
      }
      if (bestDesc) {
        finalDesc = cleanupDesc(bestDesc);
      }
    }

    // Priority 3: placeholder
    const usedFallback = !finalDesc;

    result.push({
      description: finalDesc || `Item ${item.num}`,
      qty: item.qty,
      unit: item.unit,
      rate: impliedRate,
      total: item.total,
      section: 'Main',
      confidence: 0.95,
      source: 'deterministic_carpentry_parser',
      raw_text: item.inlineDesc
        ? `${item.num}   ${item.inlineDesc}   ${item.qty}   ${item.unit}   ${item.total}`
        : `${item.num}   ${item.qty}   ${item.unit}   ${item.total}`,
      validation_flags: usedFallback ? ['NO_DESC_MATCH'] : [],
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

    // Carpentry levels multiplier: detect "x N levels" across full combined text
    let detectedLevelsMultiplier: number | null = null;
    if (isCarpentry && afterStubDedup.length > 0) {
      const combinedText = allChunkTexts.join('\n');
      const rawSubtotal = afterStubDedup.reduce((sum: number, item: any) => sum + (parseFloat(item.total) || 0), 0);
      const levelsResult = detectCarpentryLevelsMultiplier(combinedText, rawSubtotal);
      if (levelsResult) {
        const { multiplier, documentTotal: levelsDocTotal } = levelsResult;
        detectedLevelsMultiplier = multiplier;
        console.log(`[Resume] Carpentry levels multiplier detected: x${multiplier} (subtotal=${rawSubtotal.toFixed(2)} × ${multiplier} = ${levelsDocTotal.toFixed(2)})`);
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

        // For multiplier quotes, persist the document total (all levels combined) as total_amount
        const persistedTotal = (detectedLevelsMultiplier && documentTotal) ? documentTotal : itemsSum;
        const tolerance = documentTotal ? Math.max(100, documentTotal * 0.02) : 100;
        const missingAmount = documentTotal ? documentTotal - itemsSum : 0;
        const needsReview = !detectedLevelsMultiplier && documentTotal !== null && Math.abs(missingAmount) > tolerance;

        await supabase
          .from("quotes")
          .update({
            total_amount: persistedTotal,
            total_price: persistedTotal,
            document_total: documentTotal,
            missing_amount: needsReview ? missingAmount : 0,
            needs_review: needsReview,
            items_count: quoteItems.length,
            raw_items_count: rawItemsCount,
            inserted_items_count: quoteItems.length,
            levels_multiplier: detectedLevelsMultiplier,
          })
          .eq("id", quoteId);

        console.log(`[Resume V5] Replaced ${quoteItems.length} items in quote ${quoteId}`);
        console.log(`[Resume V5] Sum(items): $${itemsSum.toLocaleString()}`);
        console.log(`[Resume V5] Document total: $${documentTotal?.toLocaleString() || 'not found'}`);
        if (detectedLevelsMultiplier) {
          console.log(`[Resume V5] Levels multiplier x${detectedLevelsMultiplier} — persisted total=$${persistedTotal.toLocaleString()}`);
        }
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
