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
// Hard timeout: LLM total wall-time capped at 90 seconds across all 3 attempts.
// Loop breaker: If attempt_count >= 3, LLM is skipped entirely — regex runs directly.
// Stage labels: Written to DB at every transition so UI shows exact stage.
// Trace: Full parser_attempt_order array written to trace_json column.
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Hard cap for total LLM wall time across all attempts
const LLM_TOTAL_WALL_TIME_MS = 90_000;

// Per-attempt timeouts (shrink with each retry)
const LLM_ATTEMPT_TIMEOUTS = [60_000, 45_000, 25_000];

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
  attempt_count: number | null;
  llm_fail_reason: string | null;
  llm_attempted: boolean | null;
}

interface ParserAttemptEntry {
  parser: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  status: "success" | "failed" | "timeout" | "skipped";
  reason: string;
}

type LlmFailReason =
  | "timeout"
  | "json_parse"
  | "token_limit"
  | "api_error"
  | "empty_response"
  | "network_error"
  | "rate_limit"
  | "chunk_failed"
  | "cancelled"
  | "unknown_error";

function classifyLlmFailure(err: unknown, responseStatus?: number): LlmFailReason {
  const msg = err instanceof Error ? err.message : String(err);
  const msgLow = msg.toLowerCase();

  if (err instanceof Error && err.name === "AbortError") return "timeout";
  if (msgLow.includes("timeout") || msgLow.includes("timed out")) return "timeout";
  if (msgLow.includes("429") || msgLow.includes("rate limit") || msgLow.includes("rate_limit")) return "rate_limit";
  if (msgLow.includes("json") || msgLow.includes("parse") || msgLow.includes("syntax")) return "json_parse";
  if (msgLow.includes("token") || msgLow.includes("context_length") || msgLow.includes("max_tokens")) return "token_limit";
  if (msgLow.includes("empty") || msgLow.includes("no content")) return "empty_response";
  if (msgLow.includes("chunk") || msgLow.includes("partial")) return "chunk_failed";
  if (msgLow.includes("cancel")) return "cancelled";
  if (responseStatus && responseStatus >= 500) return "api_error";
  if (responseStatus && responseStatus === 429) return "rate_limit";
  if (msgLow.includes("fetch") || msgLow.includes("network") || msgLow.includes("econnrefused")) return "network_error";
  return "unknown_error";
}

function repairJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  let start = -1;
  if (firstBrace === -1 && firstBracket === -1) return s;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);

  const opener = s[start];
  const closer = opener === "{" ? "}" : "]";
  const lastClose = s.lastIndexOf(closer);
  if (lastClose > start) {
    s = s.slice(start, lastClose + 1);
  } else {
    s = s.slice(start) + closer;
  }
  s = s.replace(/,(\s*[}\]])/g, "$1");
  return s;
}

async function setStage(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  stage: string,
  progress?: number,
): Promise<void> {
  const update: Record<string, unknown> = {
    current_stage: stage,
    updated_at: new Date().toISOString(),
  };
  if (progress !== undefined) update.progress = progress;
  await supabase.from("parsing_jobs").update(update).eq("id", jobId);
  console.log(`[STAGE] ${stage}${progress !== undefined ? ` (${progress}%)` : ""}`);
}

interface LlmCallResult {
  items: any[];
  confidence: number;
  totals: { grandTotal?: number; subtotal?: number };
  warnings: string[];
  success: boolean;
  failReason: LlmFailReason | null;
  failMessage: string;
  chunksStarted: number;
  chunksCompleted: number;
}

async function attemptLlmCall(
  supabaseUrl: string,
  serviceKey: string,
  text: string,
  supplierName: string,
  trade: string,
  options: { shorterPrompt?: boolean; timeoutMs?: number } = {},
): Promise<LlmCallResult> {
  const url = `${supabaseUrl}/functions/v1/parse_quote_llm_fallback`;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const payload: Record<string, unknown> = { text, supplierName, trade };
  if (options.shorterPrompt) payload.shorterPrompt = true;

  let responseStatus: number | undefined;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    responseStatus = res.status;

    if (!res.ok) {
      const errText = await res.text();
      const failMsg = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
      return {
        items: [], confidence: 0, totals: {}, warnings: [failMsg],
        success: false, failReason: classifyLlmFailure(new Error(failMsg), res.status),
        failMessage: failMsg, chunksStarted: 0, chunksCompleted: 0,
      };
    }

    let data: any;
    const rawText = await res.text();
    try {
      data = JSON.parse(rawText);
    } catch {
      try {
        data = JSON.parse(repairJson(rawText));
        console.warn("[LLM] JSON repaired successfully");
      } catch {
        const failMsg = `JSON unparseable after repair (len=${rawText.length})`;
        return {
          items: [], confidence: 0, totals: {}, warnings: [failMsg],
          success: false, failReason: "json_parse", failMessage: failMsg,
          chunksStarted: 0, chunksCompleted: 0,
        };
      }
    }

    const items: any[] = data.items ?? data.lines ?? [];
    const chunksCompleted: number = data.metadata?.chunksCompleted ?? (items.length > 0 ? 1 : 0);
    const chunksStarted: number = data.metadata?.chunksStarted ?? chunksCompleted;

    if (!data.success && items.length === 0) {
      const failMsg = data.error ?? "LLM returned success=false with 0 items";
      return {
        items: [], confidence: 0, totals: data.totals ?? {}, warnings: data.warnings ?? [],
        success: false, failReason: "empty_response", failMessage: failMsg,
        chunksStarted, chunksCompleted,
      };
    }

    return {
      items, confidence: Number(data.confidence ?? 0),
      totals: data.totals ?? {}, warnings: data.warnings ?? [],
      success: data.success === true, failReason: null, failMessage: "",
      chunksStarted, chunksCompleted,
    };
  } catch (err) {
    const reason = classifyLlmFailure(err, responseStatus);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      items: [], confidence: 0, totals: {}, warnings: [`LLM threw: ${msg}`],
      success: false, failReason: reason, failMessage: msg,
      chunksStarted: 0, chunksCompleted: 0,
    };
  }
}

async function callLlmParserWithRetry(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  supabaseUrl: string,
  serviceKey: string,
  text: string,
  supplierName: string,
  trade: string,
): Promise<{ result: LlmCallResult; attemptsMade: number; traceEntries: ParserAttemptEntry[] }> {
  const wallStart = Date.now();
  const traceEntries: ParserAttemptEntry[] = [];
  let lastResult: LlmCallResult | null = null;
  let attemptsMade = 0;

  const attempts = [
    { label: "three_pass_llm (attempt 1/3 — full text)", text: text, shorterPrompt: false, timeoutMs: LLM_ATTEMPT_TIMEOUTS[0] },
    { label: "three_pass_llm (attempt 2/3 — 60% text)", text: text.slice(0, Math.floor(text.length * 0.6)), shorterPrompt: false, timeoutMs: LLM_ATTEMPT_TIMEOUTS[1] },
    { label: "three_pass_llm (attempt 3/3 — short prompt)", text: text.slice(0, 5000), shorterPrompt: true, timeoutMs: LLM_ATTEMPT_TIMEOUTS[2] },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const elapsed = Date.now() - wallStart;
    const remaining = LLM_TOTAL_WALL_TIME_MS - elapsed;

    if (remaining <= 5000) {
      console.warn(`[LLM] Wall-time budget exhausted (${elapsed}ms) — aborting LLM phase`);
      traceEntries.push({
        parser: attempts[i].label,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        duration_ms: 0,
        status: "skipped",
        reason: `Wall-time budget exhausted (${elapsed}ms / ${LLM_TOTAL_WALL_TIME_MS}ms)`,
      });
      break;
    }

    const attemptTimeout = Math.min(attempts[i].timeoutMs, remaining - 2000);
    const stageLabel = i === 0
      ? "Running LLM Structural Pass"
      : i === 1 ? "Running LLM Extraction Pass (retry)"
      : "Running LLM Extraction Pass (short prompt)";

    await setStage(supabase, jobId, stageLabel, 45 + i * 5);

    const attemptStart = Date.now();
    console.log(`[LLM] ${attempts[i].label} — ${attempts[i].text.length} chars, timeout=${attemptTimeout}ms`);

    const result = await attemptLlmCall(
      supabaseUrl, serviceKey,
      attempts[i].text, supplierName, trade,
      { shorterPrompt: attempts[i].shorterPrompt, timeoutMs: attemptTimeout },
    );

    const duration = Date.now() - attemptStart;
    attemptsMade = i + 1;

    const entryStatus: ParserAttemptEntry["status"] =
      result.success && result.items.length > 0 ? "success"
      : result.failReason === "timeout" ? "timeout"
      : "failed";

    traceEntries.push({
      parser: attempts[i].label,
      started_at: new Date(attemptStart).toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: duration,
      status: entryStatus,
      reason: result.failReason
        ? `${result.failReason}: ${result.failMessage.slice(0, 200)}`
        : `${result.items.length} items, confidence=${result.confidence.toFixed(2)}`,
    });

    lastResult = result;

    if (result.success && result.items.length > 0) {
      console.log(`[LLM] Attempt ${i + 1} succeeded — ${result.items.length} items`);
      break;
    }

    console.warn(`[LLM] Attempt ${i + 1} failed (${result.failReason ?? "no items"}) — ${i < 2 ? "retrying" : "exhausted"}`);
  }

  return {
    result: lastResult ?? {
      items: [], confidence: 0, totals: {}, warnings: ["All LLM attempts exhausted"],
      success: false, failReason: "unknown_error", failMessage: "All attempts exhausted",
      chunksStarted: 0, chunksCompleted: 0,
    },
    attemptsMade,
    traceEntries,
  };
}

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

function dedupKey(item: ParsedLineItem): string {
  return [
    item.description.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80),
    item.qty.toFixed(3), item.rate.toFixed(2), item.total.toFixed(2),
  ].join("|");
}

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
  if (additions.length > 0) console.log(`[MERGE] gap-fill added ${additions.length} items`);
  return [...llmItems, ...additions];
}

function filterLlmSummaryRows(items: any[]): { kept: any[]; removed: number } {
  let removed = 0;
  const labelFiltered = items.filter((item) => { if (isTotalRow(item)) { removed++; return false; } return true; });
  const mathFiltered = labelFiltered.filter((item) => { if (isArithmeticTotalRow(item, labelFiltered)) { removed++; return false; } return true; });
  return { kept: mathFiltered, removed };
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
      return new Response(JSON.stringify({ error: "Missing authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    jobId = body.jobId;

    if (!jobId) {
      return new Response(JSON.stringify({ error: "Missing jobId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: job, error: jobError } = await supabase.from("parsing_jobs").select("*").eq("id", jobId).single();
    if (jobError || !job) throw new Error("Job not found");

    const typedJob = job as unknown as ParsingJob;
    const trade = typedJob.trade || "passive_fire";

    const currentAttemptCount = (typedJob.attempt_count ?? 0) + 1;
    const priorLlmFailed = typedJob.llm_attempted === true && typedJob.llm_fail_reason != null;

    console.log(`[PIPELINE_START] job_id=${jobId} file=${typedJob.filename} trade=${trade} attempt=${currentAttemptCount} priorLlmFailed=${priorLlmFailed}`);

    await supabase.from("parsing_jobs").update({
      status: "processing",
      progress: 10,
      attempt_count: currentAttemptCount,
      current_stage: "Initializing",
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    // Step 1: Download file
    await setStage(supabase, jobId, "Downloading file", 15);
    const { data: fileData, error: downloadError } = await supabase.storage.from("quotes").download(typedJob.file_url);
    if (downloadError || !fileData) throw new Error("Failed to download file from storage");

    const fileBuffer = await fileData.arrayBuffer();
    const fileName = typedJob.filename.toLowerCase();

    // Step 2: Extract text
    await setStage(supabase, jobId, "Extracting document text", 20);

    let allPages: { pageNum: number; text: string }[] = [];
    let spreadsheetRows: (string | number | null | undefined)[][] | undefined;
    let fileExtension: string | undefined;

    if (fileName.endsWith(".pdf")) {
      fileExtension = "pdf";
      const pdfjsLib = await import("npm:pdfjs-dist@4.0.379");
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(fileBuffer), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true,
      });
      const pdfDocument = await loadingTask.promise;
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        let lastY = -1;
        let pageText = "";
        textContent.items.forEach((item: any) => {
          const currentY = item.transform[5];
          if (lastY !== -1 && Math.abs(currentY - lastY) > 5) pageText += "\n";
          else if (pageText.length > 0) pageText += " ";
          pageText += item.str;
          lastY = currentY;
        });
        if (pageText.trim()) allPages.push({ pageNum, text: pageText });
      }
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      fileExtension = fileName.endsWith(".xls") ? "xls" : "xlsx";
      const XLSX = await import("npm:xlsx@0.18.5");
      const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as (string | number | null | undefined)[][];
      spreadsheetRows = rows;
      allPages = [{ pageNum: 1, text: rows.map((r) => r.map((c) => String(c || "").trim()).join("\t")).filter(Boolean).join("\n") }];
    } else {
      throw new Error(`Unsupported file type: ${fileName}`);
    }

    if (allPages.length === 0) throw new Error("No text could be extracted from the file");

    const rawText = allPages.map((p) => p.text).join("\n\n");
    console.log(`[EXTRACT] pages=${allPages.length} chars=${rawText.length} type=${fileExtension}`);

    // Step 3: Classify
    await setStage(supabase, jobId, "Classifying document", 30);
    const classification = classifyDocument(rawText, allPages, fileExtension);
    const isSpreadsheet = classification.commercialFamily === "spreadsheet_quote";
    console.log(`[CLASSIFY] class=${classification.documentClass} spreadsheet=${isSpreadsheet}`);

    // =========================================================================
    // PARSER STRATEGY
    // Loop-breaker: attempt_count >= 3 OR (LLM already failed AND attempt >= 2)
    //   → skip LLM, go straight to regex
    // =========================================================================

    const parserTrace: ParserAttemptEntry[] = [];
    let parserStrategy: "llm_primary" | "regex_only" = isSpreadsheet ? "regex_only" : "llm_primary";

    let llmAttempted = false;
    let llmSuccess: boolean | null = null;
    let llmFailReason: LlmFailReason | null = null;
    let llmFailMessage = "";
    let llmChunksStarted: number | null = null;
    let llmChunksCompleted: number | null = null;
    let llmAttemptsMade = 0;
    let llmConfidence = 0;
    let llmWarnings: string[] = [];
    let llmRawItems: any[] = [];
    let llmGrandTotal = 0;
    let regexRecoveryUsed = false;
    let regexResult: ReturnType<typeof runParserV3> | null = null;

    const skipLlmDueToLoop = !isSpreadsheet && (
      currentAttemptCount >= 3 ||
      (priorLlmFailed && currentAttemptCount >= 2)
    );

    if (isSpreadsheet) {
      await setStage(supabase, jobId, "Running Regex Parser", 50);
      const t0 = Date.now();
      regexResult = runParserV3({ pages: allPages, rawText, fileExtension, spreadsheetRows });
      const dur = Date.now() - t0;
      parserTrace.push({
        parser: "regex_recovery",
        started_at: new Date(Date.now() - dur).toISOString(),
        ended_at: new Date().toISOString(),
        duration_ms: dur,
        status: "success",
        reason: `Spreadsheet — ${regexResult.resolution.baseItems.length} base items`,
      });
      await setStage(supabase, jobId, "Finalizing Totals", 75);

    } else if (skipLlmDueToLoop) {
      console.warn(`[LOOP_BREAKER] attempt=${currentAttemptCount} priorLlmFailed=${priorLlmFailed} — skipping LLM`);
      parserTrace.push({
        parser: "three_pass_llm",
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        duration_ms: 0,
        status: "skipped",
        reason: `Loop breaker (attempt_count=${currentAttemptCount}, priorLlmFailed=${priorLlmFailed})`,
      });

      await setStage(supabase, jobId, "Running Regex Recovery (LLM skipped)", 50);
      await supabase.from("parsing_jobs").update({ fallback_parser: "regex_recovery" }).eq("id", jobId);

      const t0 = Date.now();
      regexResult = runParserV3({ pages: allPages, rawText, fileExtension });
      const dur = Date.now() - t0;
      regexRecoveryUsed = true;

      parserTrace.push({
        parser: "regex_recovery",
        started_at: new Date(Date.now() - dur).toISOString(),
        ended_at: new Date().toISOString(),
        duration_ms: dur,
        status: "success",
        reason: `${regexResult.resolution.baseItems.length} base items`,
      });
      await setStage(supabase, jobId, "Finalizing Totals", 75);

    } else {
      // PDF — LLM primary with retry + hard wall-time
      llmAttempted = true;
      await supabase.from("parsing_jobs").update({ primary_parser: "three_pass_llm", updated_at: new Date().toISOString() }).eq("id", jobId);

      const { result: llmResult, attemptsMade, traceEntries } = await callLlmParserWithRetry(
        supabase, jobId, supabaseUrl, supabaseServiceKey, rawText, typedJob.supplier_name, trade,
      );

      parserTrace.push(...traceEntries);
      llmAttemptsMade = attemptsMade;
      llmChunksStarted = llmResult.chunksStarted;
      llmChunksCompleted = llmResult.chunksCompleted;
      llmFailReason = llmResult.failReason;
      llmFailMessage = llmResult.failMessage;

      if (llmResult.items.length > 0) {
        llmSuccess = true;
        llmConfidence = llmResult.confidence;
        llmWarnings = llmResult.warnings;
        llmGrandTotal = llmResult.totals.grandTotal ?? 0;
        const { kept: filteredLlmItems, removed } = filterLlmSummaryRows(llmResult.items);
        llmRawItems = filteredLlmItems;
        if (removed > 0) console.log(`[LLM] Removed ${removed} summary rows`);
      } else {
        llmSuccess = false;
      }

      // Persist LLM audit state immediately — Resume reads this to decide whether to skip LLM
      await supabase.from("parsing_jobs").update({
        llm_attempted: llmAttempted,
        llm_success: llmSuccess,
        llm_fail_reason: llmFailReason,
        llm_chunks_completed: llmChunksCompleted,
        last_error: llmSuccess ? null : llmFailMessage.slice(0, 500),
        last_error_code: llmSuccess ? null : (llmFailReason ?? null),
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);

      // Evaluate if regex recovery needed
      const docTotals = extractDocumentTotals(rawText);
      const documentTotal = docTotals.grandTotal ?? 0;
      const llmItemsSum = llmRawItems.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0);
      const mismatchRatio = documentTotal > 0 && llmItemsSum > 0 ? Math.abs(documentTotal - llmItemsSum) / documentTotal : 0;

      const needsRegexRecovery = llmRawItems.length === 0 || llmConfidence < 0.55 || (documentTotal > 0 && mismatchRatio > 0.20);

      if (needsRegexRecovery) {
        regexRecoveryUsed = true;
        const reasons: string[] = [];
        if (llmRawItems.length === 0) reasons.push("zero_items");
        if (llmConfidence < 0.55) reasons.push(`low_confidence(${llmConfidence.toFixed(2)})`);
        if (documentTotal > 0 && mismatchRatio > 0.20) reasons.push(`totals_mismatch(${(mismatchRatio * 100).toFixed(1)}%)`);

        await setStage(supabase, jobId, "LLM Timeout — Switching to Fallback", 65);
        await supabase.from("parsing_jobs").update({ fallback_parser: "regex_recovery" }).eq("id", jobId);

        const t0 = Date.now();
        regexResult = runParserV3({ pages: allPages, rawText, fileExtension });
        const dur = Date.now() - t0;

        parserTrace.push({
          parser: "regex_recovery",
          started_at: new Date(Date.now() - dur).toISOString(),
          ended_at: new Date().toISOString(),
          duration_ms: dur,
          status: "success",
          reason: `${reasons.join(",")} — ${regexResult.resolution.baseItems.length} base items`,
        });
      }

      await setStage(supabase, jobId, "Finalizing Totals", 75);
    }

    // =========================================================================
    // BUILD FINAL RESOLUTION OUTPUT
    // =========================================================================

    let finalResolution: ReturnType<typeof runParserV3>["resolution"];
    const finalClassification = regexResult?.classification ?? classification;

    if (isSpreadsheet && regexResult) {
      finalResolution = regexResult.resolution;

    } else if (!regexRecoveryUsed) {
      const llmAdapted: ParsedLineItem[] = llmRawItems.map((item, i) => adaptLlmItem(item, i, "llm_primary(gpt-4o)"));
      const docTotals = extractDocumentTotals(rawText);
      const grandTotal = llmGrandTotal > 0 ? llmGrandTotal : docTotals.grandTotal ?? llmAdapted.reduce((s, i) => s + i.total, 0);
      const baseRowSum = llmAdapted.filter(i => i.scopeCategory === "base").reduce((s, i) => s + i.total, 0);
      const totalSource = llmGrandTotal > 0 ? "summary_page" : (grandTotal > baseRowSum ? "document_grand_total" : "row_sum");

      finalResolution = runResolutionLayer({
        parserUsed: "llm_primary(gpt-4o)",
        allItems: llmAdapted,
        totals: { grandTotal, optionalTotal: docTotals.optionalTotal ?? 0, subTotal: docTotals.subTotal, rowSum: baseRowSum, source: totalSource },
        summaryDetected: llmGrandTotal > 0,
        optionalScopeDetected: llmAdapted.some(i => i.scopeCategory === "optional"),
        parserReasons: [`llm confidence=${llmConfidence.toFixed(2)}`, `attempts=${llmAttemptsMade}`, ...llmWarnings.slice(0, 4)],
        rawSummary: null,
      } as RawParserOutput, classification);

    } else {
      const regexResolution = regexResult!.resolution;
      const regexItems = [...regexResolution.baseItems, ...regexResolution.optionalItems];
      const llmAdapted: ParsedLineItem[] = llmRawItems.map((item, i) => adaptLlmItem(item, i, "llm_primary(gpt-4o)"));
      const mergedItems = mergeItems(llmAdapted, regexItems);
      const docTotals = extractDocumentTotals(rawText);

      const regexHasSummaryTotal = regexResolution.totals.source === "summary_page"
        && regexResolution.validation.summaryTotal != null
        && regexResolution.validation.summaryTotal > 0;

      const grandTotal = regexResolution.totals.grandTotal > 0 ? regexResolution.totals.grandTotal
        : llmGrandTotal > 0 ? llmGrandTotal
        : docTotals.grandTotal ?? mergedItems.reduce((s, i) => s + i.total, 0);

      const baseRowSum = mergedItems.filter(i => i.scopeCategory === "base").reduce((s, i) => s + i.total, 0);

      finalResolution = runResolutionLayer({
        parserUsed: llmRawItems.length > 0 ? "llm_primary+regex_recovery(gpt-4o)" : "regex_recovery(v3)",
        allItems: mergedItems,
        totals: {
          grandTotal,
          optionalTotal: regexResolution.totals.optionalTotal > 0 ? regexResolution.totals.optionalTotal : docTotals.optionalTotal ?? 0,
          subTotal: regexResolution.totals.subTotal ?? docTotals.subTotal,
          rowSum: baseRowSum,
          source: regexHasSummaryTotal ? "summary_page" : "row_sum",
        },
        summaryDetected: regexHasSummaryTotal,
        optionalScopeDetected: mergedItems.some(i => i.scopeCategory === "optional"),
        parserReasons: [`llm_fail=${llmFailReason ?? "none"}`, `regex_recovery=true`, ...regexResolution.debug.parserReasons.slice(0, 4)],
        rawSummary: null,
      } as RawParserOutput, finalClassification);
    }

    const { resolution } = { resolution: finalResolution };
    const finalParserUsed = resolution.parserUsed;
    const hasItems = resolution.baseItems.length > 0 || resolution.optionalItems.length > 0;
    const hasTotal = resolution.totals.grandTotal > 0;

    const traceReport = {
      parser_attempt_order: parserTrace,
      final_parser_used: finalParserUsed,
      fallback_triggered: regexRecoveryUsed,
      llm_chunks_started: llmChunksStarted,
      llm_chunks_completed: llmChunksCompleted,
    };

    // Fail-fast — nothing usable
    if (!hasItems && !hasTotal) {
      const failureReason = "Both parsers returned no items and no total";
      await supabase.from("parsing_jobs").update({
        status: "failed",
        current_stage: "Failed — No Items Extracted",
        error_message: failureReason,
        last_error: failureReason,
        last_error_code: "no_items_no_total",
        final_parser_used: finalParserUsed,
        trace_json: traceReport,
        llm_attempted: llmAttempted,
        llm_success: llmSuccess,
        llm_fail_reason: llmFailReason,
        llm_chunks_completed: llmChunksCompleted,
        metadata: { failure_reason: failureReason, failure_code: "no_items_no_total", parser_strategy: parserStrategy },
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);

      return new Response(JSON.stringify({ success: false, jobId, error: "parsing_failed", trace: traceReport }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await setStage(supabase, jobId, "Saving Results", 80);

    const canonicalTotal = resolution.totals.grandTotal;
    const canonicalOptionalTotal = resolution.totals.optionalTotal;
    const resolutionConfidence = resolution.validation.risk === "OK" ? "HIGH"
      : resolution.validation.risk === "MEDIUM" ? "MEDIUM" : "LOW";

    let quoteData: { id: string };

    if (typedJob.quote_id) {
      const { data: updatedQuote, error: updateError } = await supabase.from("quotes").update({
        status: "pending", total_amount: canonicalTotal, total_price: canonicalTotal, updated_at: new Date().toISOString(),
      }).eq("id", typedJob.quote_id).select().single();
      if (updateError || !updatedQuote) throw new Error(`Failed to update quote: ${updateError?.message}`);
      quoteData = updatedQuote;
    } else {
      const dashboardMode = (typedJob.metadata as any)?.dashboard_mode || "original";
      let revisionNumber = 1;
      if (dashboardMode === "revisions") {
        const { data: latestQuote } = await supabase.from("quotes").select("revision_number")
          .eq("project_id", typedJob.project_id).eq("supplier_name", typedJob.supplier_name)
          .order("revision_number", { ascending: false }).limit(1).maybeSingle();
        revisionNumber = latestQuote?.revision_number ? latestQuote.revision_number + 1 : 2;
      }
      const { data: newQuote, error: quoteError } = await supabase.from("quotes").insert({
        project_id: typedJob.project_id, supplier_name: typedJob.supplier_name,
        organisation_id: typedJob.organisation_id, status: "pending",
        total_amount: canonicalTotal, total_price: canonicalTotal,
        created_by: typedJob.user_id, revision_number: revisionNumber,
        trade: typedJob.trade || "passive_fire",
      }).select().single();
      if (quoteError || !newQuote) throw new Error(`Failed to create quote: ${quoteError?.message}`);
      quoteData = newQuote;
    }

    if (typedJob.quote_id) await supabase.from("quote_items").delete().eq("quote_id", quoteData.id);

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

    await supabase.from("quotes").update({
      items_count: mainQuoteItems.length,
      raw_items_count: resolution.baseItems.length + resolution.optionalItems.length + resolution.excludedItems.length,
      inserted_items_count: mainQuoteItems.length,
      total_amount: canonicalTotal, total_price: canonicalTotal,
      resolved_total: canonicalTotal, resolution_source: resolution.totals.source,
      resolution_confidence: resolutionConfidence,
      document_grand_total: resolution.totals.grandTotal > 0 ? resolution.totals.grandTotal : null,
      document_sub_total: resolution.totals.subTotal,
      optional_scope_total: canonicalOptionalTotal > 0 ? canonicalOptionalTotal : null,
      original_line_items_total: resolution.totals.rowSum,
    }).eq("id", quoteData.id);

    const parseMetadata = {
      parser_strategy: parserStrategy,
      parser_version: "vNext-llm-primary",
      entry_point: "process_parsing_job",
      document_class: classification.documentClass,
      commercial_family: classification.commercialFamily,
      parser_used: finalParserUsed,
      llm_attempted: llmAttempted,
      llm_success: llmSuccess,
      llm_fail_reason: llmFailReason,
      llm_fail_message: llmFailMessage.slice(0, 300),
      llm_chunks_started: llmChunksStarted,
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

    await supabase.from("parsing_jobs").update({
      status: "completed",
      progress: 100,
      current_stage: "Completed",
      quote_id: quoteData.id,
      result_data: parseMetadata,
      metadata: parseMetadata,
      llm_attempted: llmAttempted,
      llm_success: llmSuccess,
      llm_fail_reason: llmFailReason,
      llm_chunks_completed: llmChunksCompleted,
      final_parser_used: finalParserUsed,
      trace_json: traceReport,
      last_error: null,
      last_error_code: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    console.log(`[PIPELINE_END] status=success job_id=${jobId} items=${allQuoteItems.length} llm_success=${llmSuccess} fallback=${regexRecoveryUsed}`);

    return new Response(JSON.stringify({
      success: true, jobId, quoteId: quoteData.id, itemCount: allQuoteItems.length,
      parserUsed: finalParserUsed, llmSuccess, llmFailReason, regexRecoveryUsed,
      grandTotal: canonicalTotal, trace: traceReport,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[PIPELINE] Fatal error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";

    if (jobId) {
      try {
        const supabase2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await supabase2.from("parsing_jobs").update({
          status: "failed",
          current_stage: "Failed — Fatal Error",
          error_message: msg,
          last_error: msg,
          last_error_code: "fatal_error",
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      } catch (_) {}
    }

    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
