import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { cleanText, extractFRRFromDescription, isTotalRow, isArithmeticTotalRow } from "../_shared/itemNormalizer.ts";
import { runParserV3 } from "../_shared/parserRouterV3.ts";
import { runResolutionLayer } from "../_shared/parseResolutionLayerV3.ts";
import { classifyDocument } from "../_shared/documentClassifier.ts";
import { extractDocumentTotals } from "../_shared/documentTotalExtractor.ts";
import type { ParsedLineItem, RawParserOutput } from "../_shared/parseResolutionLayerV3.ts";

// =============================================================================
// PROCESS PARSING JOB — LLM-PRIMARY WITH REGEX RECOVERY
//
// Flow:
//   1. Download file + extract text / pages
//   2. Classify document (structural signals)
//   3. Spreadsheets: regex only (no LLM needed)
//   4. PDFs: call LLM (parse_quote_llm_fallback) as PRIMARY parser
//      - On failure: classify failure reason, retry once with smaller chunk
//      - On second failure: retry with shorter prompt flag
//      - Only fall back to regex after both retries exhausted
//   5. Evaluate LLM output — trigger regex recovery if still needed
//   6. Merge LLM + regex outputs intelligently (prefer LLM items, fill gaps)
//   7. Run parseResolutionLayerV3 on merged output
//   8. Write quote + quote_items to DB
//   9. Write metadata: llm_attempted, llm_success, llm_fail_reason,
//      llm_chunks_completed, parser_strategy, llm_confidence, regex_recovery_used
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ParsingJob {
  id: string;
  project_id: string;
  quote_id: string | null;
  supplier_name: string;
  filename: string;
  file_url: string;
  organisation_id: string;
  user_id: string;
  trade: string | null;
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// LLM failure classification
// ---------------------------------------------------------------------------
type LlmFailReason =
  | "timeout"
  | "json_parse"
  | "token_limit"
  | "api_error"
  | "empty_response"
  | "network_error";

function classifyLlmFailure(err: unknown, responseStatus?: number): LlmFailReason {
  const msg = err instanceof Error ? err.message : String(err);
  const msgLow = msg.toLowerCase();

  if (err instanceof Error && err.name === "AbortError") return "timeout";
  if (msgLow.includes("timeout") || msgLow.includes("timed out")) return "timeout";
  if (msgLow.includes("json") || msgLow.includes("parse") || msgLow.includes("syntax")) return "json_parse";
  if (msgLow.includes("token") || msgLow.includes("context_length") || msgLow.includes("max_tokens")) return "token_limit";
  if (msgLow.includes("empty") || msgLow.includes("no content")) return "empty_response";
  if (responseStatus && responseStatus >= 500) return "api_error";
  if (responseStatus && responseStatus === 429) return "api_error";
  if (msgLow.includes("fetch") || msgLow.includes("network") || msgLow.includes("econnrefused")) return "network_error";
  return "api_error";
}

// ---------------------------------------------------------------------------
// Attempt JSON repair — strip prose wrapping, fix trailing commas, truncated arrays
// ---------------------------------------------------------------------------
function repairJson(raw: string): string {
  let s = raw.trim();

  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

  // Find the first { or [ and last } or ]
  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  let start = -1;
  if (firstBrace === -1 && firstBracket === -1) return s;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);

  // Find matching close
  const opener = s[start];
  const closer = opener === "{" ? "}" : "]";
  const lastClose = s.lastIndexOf(closer);
  if (lastClose > start) {
    s = s.slice(start, lastClose + 1);
  } else {
    // Truncated — close it
    s = s.slice(start) + closer;
  }

  // Remove trailing commas before closing brackets/braces
  s = s.replace(/,(\s*[}\]])/g, "$1");

  return s;
}

// ---------------------------------------------------------------------------
// LLM item → ParsedLineItem adapter
// ---------------------------------------------------------------------------
function adaptLlmItem(item: any, index: number, parserUsed: string): ParsedLineItem {
  const desc = cleanText(String(item.description ?? "")) || `Item ${index + 1}`;
  const qty = Number(item.qty ?? item.quantity ?? 1);
  const rate = Number(item.rate ?? item.unit_price ?? 0);
  const total = Number(item.total ?? item.total_price ?? 0);
  const isOptional =
    /optional|option\b|\(opt\)/i.test(desc) ||
    String(item.section ?? "").toLowerCase().includes("optional") ||
    item.is_optional === true;

  return {
    lineId: String(index + 1),
    section: cleanText(String(item.section ?? "")),
    description: desc,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    unit: cleanText(String(item.unit ?? "ea")) || "ea",
    rate: Number.isFinite(rate) ? rate : 0,
    total: Number.isFinite(total) ? total : 0,
    scopeCategory: isOptional ? "optional" : "base",
    pageNum: 0,
    confidence: Number(item.confidence ?? 0.85),
    source: parserUsed,
  };
}

// ---------------------------------------------------------------------------
// Dedup key for merge
// ---------------------------------------------------------------------------
function dedupKey(item: ParsedLineItem): string {
  return [
    item.description.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80),
    item.qty.toFixed(3),
    item.rate.toFixed(2),
    item.total.toFixed(2),
  ].join("|");
}

// ---------------------------------------------------------------------------
// Merge LLM + regex items
// ---------------------------------------------------------------------------
function mergeItems(llmItems: ParsedLineItem[], regexItems: ParsedLineItem[]): ParsedLineItem[] {
  const seen = new Set<string>(llmItems.map(dedupKey));
  const additions: ParsedLineItem[] = [];

  for (const item of regexItems) {
    const key = dedupKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      additions.push({ ...item, source: item.source + "(regex_gap_fill)" });
    }
  }

  if (additions.length > 0) {
    console.log(`[MERGE] regex gap-fill added ${additions.length} items not found by LLM`);
  }

  return [...llmItems, ...additions];
}

// ---------------------------------------------------------------------------
// Filter summary/total rows from LLM items
// ---------------------------------------------------------------------------
function filterLlmSummaryRows(items: any[]): { kept: any[]; removed: number } {
  let removed = 0;

  const labelFiltered = items.filter((item) => {
    if (isTotalRow(item)) { removed++; return false; }
    return true;
  });

  const mathFiltered = labelFiltered.filter((item) => {
    if (isArithmeticTotalRow(item, labelFiltered)) { removed++; return false; }
    return true;
  });

  return { kept: mathFiltered, removed };
}

// ---------------------------------------------------------------------------
// LLM call result shape
// ---------------------------------------------------------------------------
interface LlmCallResult {
  items: any[];
  confidence: number;
  totals: { grandTotal?: number; subtotal?: number };
  warnings: string[];
  success: boolean;
  failReason: LlmFailReason | null;
  chunksCompleted: number;
}

// ---------------------------------------------------------------------------
// Single attempt to call parse_quote_llm_fallback
// Returns structured result including failure classification
// ---------------------------------------------------------------------------
async function attemptLlmCall(
  supabaseUrl: string,
  serviceKey: string,
  text: string,
  supplierName: string,
  trade: string,
  options: { shorterPrompt?: boolean; timeoutMs?: number } = {},
): Promise<LlmCallResult> {
  const url = `${supabaseUrl}/functions/v1/parse_quote_llm_fallback`;
  const timeoutMs = options.timeoutMs ?? 120_000;

  const payload: Record<string, unknown> = { text, supplierName, trade };
  if (options.shorterPrompt) payload.shorterPrompt = true;

  let responseStatus: number | undefined;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    responseStatus = res.status;

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[LLM] HTTP ${res.status}: ${errText.slice(0, 300)}`);
      return {
        items: [], confidence: 0, totals: {}, warnings: [`LLM HTTP ${res.status}`],
        success: false, failReason: classifyLlmFailure(new Error(`HTTP ${res.status}: ${errText}`), res.status),
        chunksCompleted: 0,
      };
    }

    let data: any;
    const rawText = await res.text();
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      // Attempt JSON repair
      try {
        data = JSON.parse(repairJson(rawText));
        console.warn("[LLM] JSON repaired successfully");
      } catch {
        console.error(`[LLM] JSON parse failed after repair: ${rawText.slice(0, 200)}`);
        return {
          items: [], confidence: 0, totals: {}, warnings: ["LLM response JSON unparseable"],
          success: false, failReason: "json_parse", chunksCompleted: 0,
        };
      }
    }

    const items: any[] = data.items ?? data.lines ?? [];
    const chunksCompleted: number = data.metadata?.chunksCompleted ?? (items.length > 0 ? 1 : 0);

    console.log(`[LLM] returned ${items.length} items, confidence=${data.confidence?.toFixed(2) ?? "n/a"}, chunks=${chunksCompleted}`);

    if (!data.success && items.length === 0) {
      return {
        items: [], confidence: 0, totals: data.totals ?? {}, warnings: data.warnings ?? [],
        success: false, failReason: "empty_response", chunksCompleted,
      };
    }

    return {
      items,
      confidence: Number(data.confidence ?? 0),
      totals: data.totals ?? {},
      warnings: data.warnings ?? [],
      success: data.success === true,
      failReason: null,
      chunksCompleted,
    };

  } catch (err) {
    const reason = classifyLlmFailure(err, responseStatus);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[LLM] threw (${reason}): ${msg}`);
    return {
      items: [], confidence: 0, totals: {}, warnings: [`LLM threw: ${msg}`],
      success: false, failReason: reason, chunksCompleted: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// LLM call with up to 2 retries:
//   Attempt 1: full text, normal prompt, 120s timeout
//   Attempt 2 (on failure): truncated text, normal prompt, 90s timeout
//   Attempt 3 (on failure): truncated text, shorter prompt, 60s timeout
// ---------------------------------------------------------------------------
async function callLlmParserWithRetry(
  supabaseUrl: string,
  serviceKey: string,
  text: string,
  supplierName: string,
  trade: string,
): Promise<LlmCallResult & { attemptsMade: number }> {
  // Attempt 1 — full text
  console.log(`[LLM_PRIMARY] Attempt 1 — ${text.length} chars, trade=${trade}`);
  const attempt1 = await attemptLlmCall(supabaseUrl, serviceKey, text, supplierName, trade, { timeoutMs: 120_000 });

  if (attempt1.success && attempt1.items.length > 0) {
    return { ...attempt1, attemptsMade: 1 };
  }

  console.warn(`[LLM_PRIMARY] Attempt 1 failed (${attempt1.failReason ?? "no items"}) — retrying with smaller chunk`);

  // Attempt 2 — truncate to first 60% of chars (reduces token pressure)
  const truncatedText = text.length > 8000 ? text.slice(0, Math.floor(text.length * 0.6)) : text;
  console.log(`[LLM_PRIMARY] Attempt 2 — ${truncatedText.length} chars (truncated), 90s timeout`);
  const attempt2 = await attemptLlmCall(supabaseUrl, serviceKey, truncatedText, supplierName, trade, { timeoutMs: 90_000 });

  if (attempt2.success && attempt2.items.length > 0) {
    console.log(`[LLM_PRIMARY] Attempt 2 succeeded — ${attempt2.items.length} items`);
    return { ...attempt2, attemptsMade: 2 };
  }

  console.warn(`[LLM_PRIMARY] Attempt 2 failed (${attempt2.failReason ?? "no items"}) — retrying with shorter prompt`);

  // Attempt 3 — truncate further + request shorter prompt mode
  const shortText = text.length > 5000 ? text.slice(0, 5000) : truncatedText;
  console.log(`[LLM_PRIMARY] Attempt 3 — ${shortText.length} chars, shorterPrompt=true, 60s timeout`);
  const attempt3 = await attemptLlmCall(supabaseUrl, serviceKey, shortText, supplierName, trade, {
    timeoutMs: 60_000,
    shorterPrompt: true,
  });

  if (attempt3.items.length > 0) {
    console.log(`[LLM_PRIMARY] Attempt 3 produced ${attempt3.items.length} items (partial)`);
  } else {
    console.error(`[LLM_PRIMARY] All 3 attempts exhausted — falling back to regex`);
  }

  return { ...attempt3, attemptsMade: 3 };
}

// ---------------------------------------------------------------------------
// Run regex parser (V3)
// ---------------------------------------------------------------------------
function runRegexParser(
  pages: { pageNum: number; text: string }[],
  rawText: string,
  fileExtension: string | undefined,
  spreadsheetRows: (string | number | null | undefined)[][] | undefined,
) {
  return runParserV3({ pages, rawText, fileExtension, spreadsheetRows });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let jobId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    jobId = body.jobId;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Missing jobId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -------------------------------------------------------------------------
    // Load job
    // -------------------------------------------------------------------------
    const { data: job, error: jobError } = await supabase
      .from("parsing_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      throw new Error("Job not found");
    }

    const typedJob = job as unknown as ParsingJob;
    const trade = typedJob.trade || "passive_fire";

    console.log(`[PIPELINE_START] job_id=${jobId} file=${typedJob.filename} trade=${trade} supplier=${typedJob.supplier_name}`);

    await supabase
      .from("parsing_jobs")
      .update({ status: "processing", progress: 10, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // -------------------------------------------------------------------------
    // Step 1: Download file
    // -------------------------------------------------------------------------
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("quotes")
      .download(typedJob.file_url);

    if (downloadError || !fileData) {
      throw new Error("Failed to download file from storage");
    }

    const fileBuffer = await fileData.arrayBuffer();
    const fileName = typedJob.filename.toLowerCase();

    await supabase
      .from("parsing_jobs")
      .update({ progress: 20, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // -------------------------------------------------------------------------
    // Step 2: Extract raw text / pages
    // -------------------------------------------------------------------------
    let allPages: { pageNum: number; text: string }[] = [];
    let spreadsheetRows: (string | number | null | undefined)[][] | undefined;
    let fileExtension: string | undefined;

    if (fileName.endsWith(".pdf")) {
      fileExtension = "pdf";
      console.log(`[EXTRACT] Extracting PDF text with pdfjs...`);

      const pdfjsLib = await import("npm:pdfjs-dist@4.0.379");
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(fileBuffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      });

      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;
      console.log(`[EXTRACT] PDF has ${numPages} pages`);

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();

        let lastY = -1;
        let pageText = "";

        textContent.items.forEach((item: any) => {
          const currentY = item.transform[5];
          if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
            pageText += "\n";
          } else if (pageText.length > 0) {
            pageText += " ";
          }
          pageText += item.str;
          lastY = currentY;
        });

        if (pageText.trim()) {
          allPages.push({ pageNum, text: pageText });
        }
      }

    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      fileExtension = fileName.endsWith(".xls") ? "xls" : "xlsx";
      console.log(`[EXTRACT] Extracting Excel file...`);

      const XLSX = await import("npm:xlsx@0.18.5");
      const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as (string | number | null | undefined)[][];
      spreadsheetRows = rows;

      const textLines = rows
        .map((row) => row.map((cell) => String(cell || "").trim()).join("\t"))
        .filter((line) => line.trim());

      allPages = [{ pageNum: 1, text: textLines.join("\n") }];

    } else {
      throw new Error(`Unsupported file type: ${fileName}`);
    }

    if (allPages.length === 0) {
      throw new Error("No text could be extracted from the file");
    }

    const rawText = allPages.map((p) => p.text).join("\n\n");
    const totalChars = rawText.length;

    console.log(`[EXTRACT] pages=${allPages.length} chars=${totalChars} file_type=${fileExtension}`);

    await supabase
      .from("parsing_jobs")
      .update({ progress: 30, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // -------------------------------------------------------------------------
    // Step 3: Classify document
    // -------------------------------------------------------------------------
    const classification = classifyDocument(rawText, allPages, fileExtension);

    console.log(`[CLASSIFY] class=${classification.documentClass} family=${classification.commercialFamily} confidence=${classification.confidence.toFixed(2)}`);
    console.log(`[CLASSIFY] reasons=${classification.reasons.join(" | ")}`);

    const isSpreadsheet = classification.commercialFamily === "spreadsheet_quote";

    await supabase
      .from("parsing_jobs")
      .update({ progress: 40, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // =========================================================================
    // PARSER STRATEGY
    // =========================================================================

    let parserStrategy: "llm_primary" | "regex_only" = isSpreadsheet ? "regex_only" : "llm_primary";

    let llmConfidence = 0;
    let llmWarnings: string[] = [];
    let llmRawItems: any[] = [];
    let llmGrandTotal: number = 0;
    let regexRecoveryUsed = false;
    let regexResult: ReturnType<typeof runParserV3> | null = null;

    // LLM audit fields
    let llmAttempted = false;
    let llmSuccess: boolean | null = null;
    let llmFailReason: LlmFailReason | null = null;
    let llmChunksCompleted: number | null = null;
    let llmAttemptsMade = 0;

    // -------------------------------------------------------------------------
    // Branch A: Spreadsheet — regex only
    // -------------------------------------------------------------------------
    if (isSpreadsheet) {
      console.log(`[STRATEGY] spreadsheet detected — using regex only`);

      regexResult = runRegexParser(allPages, rawText, fileExtension, spreadsheetRows);

      await supabase
        .from("parsing_jobs")
        .update({ progress: 70, updated_at: new Date().toISOString() })
        .eq("id", jobId);

    } else {
      // -----------------------------------------------------------------------
      // Branch B: PDF — LLM primary with retry
      // -----------------------------------------------------------------------
      console.log(`[STRATEGY] PDF detected — running LLM with retry`);
      llmAttempted = true;

      await supabase
        .from("parsing_jobs")
        .update({ progress: 45, updated_at: new Date().toISOString() })
        .eq("id", jobId);

      const llmResult = await callLlmParserWithRetry(
        supabaseUrl,
        supabaseServiceKey,
        rawText,
        typedJob.supplier_name,
        trade,
      );

      llmAttemptsMade = llmResult.attemptsMade;
      llmChunksCompleted = llmResult.chunksCompleted;
      llmFailReason = llmResult.failReason;

      if (llmResult.items.length > 0) {
        llmSuccess = true;
        llmConfidence = llmResult.confidence;
        llmWarnings = llmResult.warnings;
        llmGrandTotal = llmResult.totals.grandTotal ?? 0;

        const { kept: filteredLlmItems, removed: summaryRowsRemoved } = filterLlmSummaryRows(llmResult.items);
        llmRawItems = filteredLlmItems;

        if (summaryRowsRemoved > 0) {
          console.log(`[LLM_PRIMARY] Removed ${summaryRowsRemoved} summary rows from LLM output`);
        }
        console.log(`[LLM_PRIMARY] After filter: ${llmRawItems.length} items, confidence=${llmConfidence.toFixed(2)}, llmGrandTotal=$${llmGrandTotal.toFixed(2)}, attempts=${llmAttemptsMade}`);
      } else {
        llmSuccess = false;
        llmWarnings = llmResult.warnings;
        console.warn(`[LLM_PRIMARY] All attempts returned 0 items — fail_reason=${llmFailReason} attempts=${llmAttemptsMade}`);
      }

      // Extract document total for mismatch evaluation
      const docTotals = extractDocumentTotals(rawText);
      const documentTotal = docTotals.grandTotal ?? 0;
      const llmItemsSum = llmRawItems.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0);

      const mismatchRatio =
        documentTotal > 0 && llmItemsSum > 0
          ? Math.abs(documentTotal - llmItemsSum) / documentTotal
          : 0;

      const zeroItems = llmRawItems.length === 0;
      const lowConfidence = llmConfidence < 0.55;
      const totalsMismatch = documentTotal > 0 && mismatchRatio > 0.20;

      const needsRegexRecovery = zeroItems || lowConfidence || totalsMismatch;

      if (needsRegexRecovery) {
        regexRecoveryUsed = true;
        const reasons: string[] = [];
        if (zeroItems)        reasons.push(`zero_items`);
        if (lowConfidence)    reasons.push(`low_confidence(${llmConfidence.toFixed(2)})`);
        if (totalsMismatch)   reasons.push(`totals_mismatch(${(mismatchRatio * 100).toFixed(1)}%)`);

        console.log(`[REGEX_RECOVERY] triggered after LLM exhaustion — reasons: ${reasons.join(", ")}`);

        regexResult = runRegexParser(allPages, rawText, fileExtension, undefined);

        console.log(`[REGEX_RECOVERY] regex produced ${regexResult.resolution.baseItems.length} base + ${regexResult.resolution.optionalItems.length} optional items`);
      }

      await supabase
        .from("parsing_jobs")
        .update({ progress: 70, updated_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    // =========================================================================
    // BUILD FINAL RESOLUTION OUTPUT
    // =========================================================================

    let finalResolution: ReturnType<typeof runParserV3>["resolution"];
    let finalClassification = regexResult?.classification ?? classification;

    if (isSpreadsheet && regexResult) {
      finalResolution = regexResult.resolution;

    } else if (!regexRecoveryUsed) {
      // PDF, LLM succeeded — wrap LLM items
      console.log(`[MERGE] LLM-only path — ${llmRawItems.length} items`);

      const llmAdapted: ParsedLineItem[] = llmRawItems.map((item, i) =>
        adaptLlmItem(item, i, "llm_primary(gpt-4o)")
      );

      const docTotals = extractDocumentTotals(rawText);
      const grandTotal = llmGrandTotal > 0
        ? llmGrandTotal
        : docTotals.grandTotal ?? llmAdapted.reduce((s, i) => s + i.total, 0);
      const optionalTotal = docTotals.optionalTotal ?? 0;
      const baseRowSum = llmAdapted.filter(i => i.scopeCategory === "base").reduce((s, i) => s + i.total, 0);

      // Source attribution: only call it summary_page if LLM actually reported a grandTotal
      const totalSource = llmGrandTotal > 0 ? "summary_page" : (grandTotal > baseRowSum ? "document_grand_total" : "row_sum");

      const rawOutput: RawParserOutput = {
        parserUsed: "llm_primary(gpt-4o)",
        allItems: llmAdapted,
        totals: {
          grandTotal,
          optionalTotal,
          subTotal: docTotals.subTotal,
          rowSum: baseRowSum,
          source: totalSource,
        },
        summaryDetected: llmGrandTotal > 0,
        optionalScopeDetected: llmAdapted.some(i => i.scopeCategory === "optional"),
        parserReasons: [`llm_primary confidence=${llmConfidence.toFixed(2)}`, `attempts=${llmAttemptsMade}`, ...llmWarnings.slice(0, 4)],
        rawSummary: null,
      };

      finalResolution = runResolutionLayer(rawOutput, classification);

    } else {
      // PDF, regex recovery triggered — merge LLM + regex
      const regexResolution = regexResult!.resolution;
      const regexItems = [...regexResolution.baseItems, ...regexResolution.optionalItems];

      const llmAdapted: ParsedLineItem[] = llmRawItems.map((item, i) =>
        adaptLlmItem(item, i, "llm_primary(gpt-4o)")
      );

      const mergedItems = mergeItems(llmAdapted, regexItems);
      console.log(`[MERGE] merged total = ${mergedItems.length} items (llm=${llmAdapted.length} regex=${regexItems.length})`);

      const docTotals = extractDocumentTotals(rawText);

      // Total priority: regex resolution total → LLM total → docTotals → row sum
      // Source is only "summary_page" when the regex parser actually detected a summary page
      const regexHasSummaryTotal = regexResolution.totals.source === "summary_page"
        && regexResolution.validation.summaryTotal != null
        && regexResolution.validation.summaryTotal > 0;

      const grandTotal = regexResolution.totals.grandTotal > 0
        ? regexResolution.totals.grandTotal
        : llmGrandTotal > 0
        ? llmGrandTotal
        : docTotals.grandTotal ?? mergedItems.reduce((s, i) => s + i.total, 0);

      const optionalTotal = regexResolution.totals.optionalTotal > 0
        ? regexResolution.totals.optionalTotal
        : docTotals.optionalTotal ?? 0;

      const baseRowSum = mergedItems.filter(i => i.scopeCategory === "base").reduce((s, i) => s + i.total, 0);

      // Source attribution: only "summary_page" if regex actually found and validated a summary total
      const totalSource = regexHasSummaryTotal ? "summary_page" : "row_sum";

      const rawOutput: RawParserOutput = {
        parserUsed: llmRawItems.length > 0 ? "llm_primary+regex_recovery(gpt-4o)" : "regex_recovery(v3)",
        allItems: mergedItems,
        totals: {
          grandTotal,
          optionalTotal,
          subTotal: regexResolution.totals.subTotal ?? docTotals.subTotal,
          rowSum: baseRowSum,
          source: totalSource,
        },
        summaryDetected: regexHasSummaryTotal,
        optionalScopeDetected: mergedItems.some(i => i.scopeCategory === "optional"),
        parserReasons: [
          `llm_confidence=${llmConfidence.toFixed(2)}`,
          `llm_attempts=${llmAttemptsMade}`,
          `llm_fail=${llmFailReason ?? "none"}`,
          `regex_recovery=true`,
          ...regexResolution.debug.parserReasons.slice(0, 4),
        ],
        rawSummary: null,
      };

      finalResolution = runResolutionLayer(rawOutput, finalClassification);
    }

    const { resolution } = { resolution: finalResolution };

    console.log(`[RESOLVE] parser_used=${resolution.parserUsed} base=${resolution.baseItems.length} optional=${resolution.optionalItems.length} excluded=${resolution.excludedItems.length}`);
    console.log(`[RESOLVE] grandTotal=$${resolution.totals.grandTotal.toFixed(2)} source=${resolution.totals.source} risk=${resolution.validation.risk}`);

    // -------------------------------------------------------------------------
    // Fail fast if nothing usable produced
    // -------------------------------------------------------------------------
    const hasItems = resolution.baseItems.length > 0 || resolution.optionalItems.length > 0;
    const hasTotal = resolution.totals.grandTotal > 0;
    const zeroItemsWithTotal = !hasItems && hasTotal;
    const completelyEmpty = !hasItems && !hasTotal;

    if (completelyEmpty || zeroItemsWithTotal) {
      const failureReason = completelyEmpty
        ? "Both LLM and regex parsers returned no items and no total"
        : "Parser(s) found summary total but extracted 0 line items — row detection failed";

      const failureCode = zeroItemsWithTotal ? "llm_and_regex_no_matches" : "no_items_no_total";

      const diagnostics = {
        parser_strategy: parserStrategy,
        parser_version: "vNext-llm-primary",
        entry_point: "process_parsing_job",
        document_class: classification.documentClass,
        classifier_confidence: classification.confidence,
        classifier_reasons: classification.reasons,
        parser_used: resolution.parserUsed,
        llm_attempted: llmAttempted,
        llm_success: llmSuccess,
        llm_fail_reason: llmFailReason,
        llm_chunks_completed: llmChunksCompleted,
        llm_attempts_made: llmAttemptsMade,
        llm_confidence: llmConfidence,
        regex_recovery_used: regexRecoveryUsed,
        validation_risk: resolution.validation.risk,
        failure_reason: failureReason,
        failure_code: failureCode,
      };

      console.error(`[PIPELINE] parsing_failed — ${failureReason}`);

      await supabase
        .from("parsing_jobs")
        .update({
          status: "failed",
          error_message: failureReason,
          metadata: diagnostics,
          llm_attempted: llmAttempted,
          llm_success: llmSuccess,
          llm_fail_reason: llmFailReason,
          llm_chunks_completed: llmChunksCompleted,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      return new Response(
        JSON.stringify({ success: false, jobId, error: "parsing_failed", diagnostics }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("parsing_jobs")
      .update({ progress: 75, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // -------------------------------------------------------------------------
    // Create or update quote record
    // -------------------------------------------------------------------------
    const canonicalTotal = resolution.totals.grandTotal;
    const canonicalOptionalTotal = resolution.totals.optionalTotal;
    const resolutionConfidence =
      resolution.validation.risk === "OK" ? "HIGH"
      : resolution.validation.risk === "MEDIUM" ? "MEDIUM"
      : "LOW";

    let quoteData: { id: string };

    if (typedJob.quote_id) {
      const { data: updatedQuote, error: updateError } = await supabase
        .from("quotes")
        .update({
          status: "pending",
          total_amount: canonicalTotal,
          total_price: canonicalTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", typedJob.quote_id)
        .select()
        .single();

      if (updateError || !updatedQuote) {
        throw new Error(`Failed to update quote: ${updateError?.message}`);
      }

      quoteData = updatedQuote;
      console.log(`[DB] Updated existing quote ${quoteData.id}`);
    } else {
      const dashboardMode = (typedJob.metadata as any)?.dashboard_mode || "original";
      let revisionNumber = 1;

      if (dashboardMode === "revisions") {
        const { data: latestQuote } = await supabase
          .from("quotes")
          .select("revision_number")
          .eq("project_id", typedJob.project_id)
          .eq("supplier_name", typedJob.supplier_name)
          .order("revision_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        revisionNumber = latestQuote?.revision_number ? latestQuote.revision_number + 1 : 2;
      }

      const { data: newQuote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          project_id: typedJob.project_id,
          supplier_name: typedJob.supplier_name,
          organisation_id: typedJob.organisation_id,
          status: "pending",
          total_amount: canonicalTotal,
          total_price: canonicalTotal,
          created_by: typedJob.user_id,
          revision_number: revisionNumber,
          trade: typedJob.trade || "passive_fire",
        })
        .select()
        .single();

      if (quoteError || !newQuote) {
        throw new Error(`Failed to create quote: ${quoteError?.message}`);
      }

      quoteData = newQuote;
      console.log(`[DB] Created new quote ${quoteData.id} rev=${revisionNumber}`);
    }

    // -------------------------------------------------------------------------
    // Save quote_items
    // -------------------------------------------------------------------------
    if (typedJob.quote_id) {
      await supabase.from("quote_items").delete().eq("quote_id", quoteData.id);
    }

    const mapItem = (item: ParsedLineItem, scopeCategory: "Main" | "Optional") => ({
      quote_id: quoteData.id,
      item_number: item.lineId || "",
      description: cleanText(item.description) || "No description",
      quantity: item.qty || 0,
      unit: item.unit || "ea",
      unit_price: item.rate || 0,
      total_price: item.total || 0,
      system_id: item.section || "",
      raw_text: cleanText(item.description) || "",
      confidence: item.confidence || 0.85,
      source: item.source || resolution.parserUsed,
      validation_flags: [],
      frr: extractFRRFromDescription(cleanText(item.description) || "") || null,
      scope_category: scopeCategory,
    });

    const mainQuoteItems = resolution.baseItems.map((item) => mapItem(item, "Main"));
    const optionalQuoteItems = resolution.optionalItems.map((item) => mapItem(item, "Optional"));
    const allQuoteItems = [...mainQuoteItems, ...optionalQuoteItems];

    if (allQuoteItems.length > 0) {
      const { error: itemsError } = await supabase.from("quote_items").insert(allQuoteItems);
      if (itemsError) {
        await supabase.from("quotes").delete().eq("id", quoteData.id);
        throw new Error(`Failed to insert quote items: ${itemsError.message}`);
      }
    }

    console.log(`[DB] Saved ${mainQuoteItems.length} main + ${optionalQuoteItems.length} optional items to quote ${quoteData.id}`);

    // -------------------------------------------------------------------------
    // Update quote with canonical totals
    // -------------------------------------------------------------------------
    await supabase
      .from("quotes")
      .update({
        items_count: mainQuoteItems.length,
        raw_items_count: resolution.baseItems.length + resolution.optionalItems.length + resolution.excludedItems.length,
        inserted_items_count: mainQuoteItems.length,
        total_amount: canonicalTotal,
        total_price: canonicalTotal,
        resolved_total: canonicalTotal,
        resolution_source: resolution.totals.source,
        resolution_confidence: resolutionConfidence,
        document_grand_total: resolution.totals.grandTotal > 0 ? resolution.totals.grandTotal : null,
        document_sub_total: resolution.totals.subTotal,
        optional_scope_total: canonicalOptionalTotal > 0 ? canonicalOptionalTotal : null,
        original_line_items_total: resolution.totals.rowSum,
      })
      .eq("id", quoteData.id);

    // -------------------------------------------------------------------------
    // Write parse metadata + LLM audit fields
    // -------------------------------------------------------------------------
    const parseMetadata = {
      parser_strategy: parserStrategy,
      parser_version: "vNext-llm-primary",
      entry_point: "process_parsing_job",
      document_class: classification.documentClass,
      commercial_family: classification.commercialFamily,
      parser_used: resolution.parserUsed,
      llm_attempted: llmAttempted,
      llm_success: llmSuccess,
      llm_fail_reason: llmFailReason,
      llm_chunks_completed: llmChunksCompleted,
      llm_attempts_made: llmAttemptsMade,
      llm_confidence: llmConfidence,
      regex_recovery_used: regexRecoveryUsed,
      total_source: resolution.totals.source,
      confidence: classification.confidence,
      warnings: [...resolution.validation.warnings, ...llmWarnings.slice(0, 5)],
      classifier_reasons: classification.reasons,
      summary_detected: resolution.debug.summaryDetected,
      optional_scope_detected: resolution.debug.optionalScopeDetected,
      item_count_base: resolution.debug.itemCountBase,
      item_count_optional: resolution.debug.itemCountOptional,
      item_count_excluded: resolution.debug.itemCountExcluded,
      grand_total: canonicalTotal,
      optional_total: canonicalOptionalTotal,
      row_sum: resolution.totals.rowSum,
      validation_risk: resolution.validation.risk,
      parser_reasons: resolution.debug.parserReasons,
    };

    await supabase
      .from("parsing_jobs")
      .update({
        status: "completed",
        progress: 100,
        quote_id: quoteData.id,
        result_data: parseMetadata,
        metadata: parseMetadata,
        llm_attempted: llmAttempted,
        llm_success: llmSuccess,
        llm_fail_reason: llmFailReason,
        llm_chunks_completed: llmChunksCompleted,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    console.log(`[PIPELINE_END] status=success job_id=${jobId} quote_id=${quoteData.id} llm_success=${llmSuccess} llm_attempts=${llmAttemptsMade} fail_reason=${llmFailReason ?? "none"} regex_recovery=${regexRecoveryUsed} grand_total=${canonicalTotal} items=${allQuoteItems.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        quoteId: quoteData.id,
        itemCount: allQuoteItems.length,
        parserVersion: "vNext-llm-primary",
        parserStrategy,
        parserUsed: resolution.parserUsed,
        llmAttempted,
        llmSuccess,
        llmFailReason,
        llmChunksCompleted,
        llmAttemptsMade,
        llmConfidence,
        regexRecoveryUsed,
        documentClass: classification.documentClass,
        totalSource: resolution.totals.source,
        grandTotal: canonicalTotal,
        validationRisk: resolution.validation.risk,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[PIPELINE] Fatal error:", error);

    if (jobId) {
      try {
        const supabase2 = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase2
          .from("parsing_jobs")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      } catch (_) {}
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
