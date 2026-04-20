import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { cleanText, extractFRRFromDescription, isTotalRow, isArithmeticTotalRow } from "../_shared/itemNormalizer.ts";
import { runParserV3 } from "../_shared/parserRouterV3.ts";
import { runResolutionLayer } from "../_shared/parseResolutionLayerV3.ts";
import { classifyDocument } from "../_shared/documentClassifier.ts";
import { extractDocumentTotals } from "../_shared/documentTotalExtractor.ts";
import { runThreePassParser } from "../_shared/threePassParser.ts";
import type { ParsedLineItem, RawParserOutput } from "../_shared/parseResolutionLayerV3.ts";
import { arbitrate } from "../_shared/arbitration/arbitrationEngine.ts";
import { runValueReview, type CandidateItem, type ValueReviewResult } from "../_shared/arbitration/gptValueReviewer.ts";
import { resolveConsensusTotals, confidenceRank, type ScopedRow } from "../_shared/arbitration/consensusTotals.ts";

// =============================================================================
// PROCESS PARSING JOB — DETERMINISTIC PRE-PASS + LLM EXTRACTION
//
// Runtime flow:
//   STEP 1: Deterministic pre-pass (<500ms) — section map, totals, document type
//   STEP 2: LLM row extraction only (Pass 2 chunked) — NO structural LLM pass
//   STEP 3: Arithmetic reconciliation (Pass 3, pure computation)
//
// Old 3-attempt LLM Pass 1 loop (fast-pass1/60%/5k) is REMOVED.
// Fallback: regex_recovery if threePass returns 0 items or confidence < 0.55
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUILD_VERSION = "2026-04-19-stable-prod";
const THREE_PASS_VERSION = "v3-det-prepass";
const DEBUG_VERSION = "strict_total_taxonomy_v1";
const DEPLOYED_AT = "2026-04-20T11:05Z";

const ROW_BAN_PATTERNS: RegExp[] = [
  /\bbase\s*rate\b/i,
  /\bpenetration\s+works\s+total\b/i,
  /\btotal\s*:/i,
  /^\s*total\s*$/i,
  /^\s*total\b[^a-z]/i,
  /\blump\s*sum\b/i,
  /\bquote\s*total\b/i,
  /\bsub[-\s]?total\b/i,
  /\bgrand\s*total\b/i,
  /\bproject\s*total\b/i,
];

function isBannedItemRow(description: unknown): boolean {
  if (typeof description !== "string") return false;
  const s = description.trim();
  if (!s) return false;
  return ROW_BAN_PATTERNS.some((rx) => rx.test(s));
}

function filterBannedItems<T extends { description?: string }>(items: T[]): { kept: T[]; rejected: T[] } {
  const kept: T[] = [];
  const rejected: T[] = [];
  for (const it of items) {
    if (isBannedItemRow(it?.description)) rejected.push(it);
    else kept.push(it);
  }
  return { kept, rejected };
}

// LLM budget for Pass 2 row extraction only (no structural Pass 1 LLM)
const LLM_EXTRACTION_TIMEOUT_MS = 90_000;

// =============================================================================
// PRODUCTION MODE SWITCH
//
// PRODUCTION_MODE=stable   (DEFAULT — live imports)
//   - parserRouterV3 is the primary row extractor
//   - parseResolutionLayerV3 handles totals
//   - LLM runs ONLY as a lightweight post-pass (categorise, scope cleanup, FRR)
//   - threePassParser is DISABLED for live imports
//
// PRODUCTION_MODE=experimental
//   - Re-enables the three-pass LLM primary path (the previous live behaviour)
//   - Enable by setting edge function secret: PRODUCTION_MODE=experimental
// =============================================================================
const PRODUCTION_MODE = (Deno.env.get("PRODUCTION_MODE") ?? "stable").toLowerCase();
const STABLE_MODE = PRODUCTION_MODE !== "experimental";

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

interface ThreePassCallResult {
  items: any[];
  confidence: number;
  totals: { grandTotal?: number; subtotal?: number };
  warnings: string[];
  success: boolean;
  failReason: LlmFailReason | null;
  failMessage: string;
  chunksStarted: number;
  chunksCompleted: number;
  prepassDurationMs: number;
  prepassSections: number;
  prepassDocType: string;
}

async function runDeterministicPlusTwoPass(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  rawText: string,
  supplierName: string,
): Promise<{ result: ThreePassCallResult; traceEntries: ParserAttemptEntry[] }> {
  const traceEntries: ParserAttemptEntry[] = [];
  const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

  // STEP 1: Deterministic pre-pass
  const prepassStart = Date.now();
  await setStage(supabase, jobId, "Running Deterministic Pre-Pass", 35);
  console.log("[DET] Starting deterministic pre-pass");

  let threePassOutput;
  let prepassDurationMs = 0;
  let prepassSections = 0;
  let prepassDocType = "unknown";

  try {
    threePassOutput = await runThreePassParser({
      rawText,
      supplierName,
      apiKey: openAiKey,
      model: "gpt-4o-mini",
      onChunkComplete: async (completed: number) => {
        await setStage(supabase, jobId, `LLM Extraction — chunk ${completed} completed`, 45 + Math.min(completed * 5, 40));
      },
    });

    prepassDurationMs = threePassOutput.debug?.pass1_duration_ms ?? (Date.now() - prepassStart);
    prepassSections = threePassOutput.sections.length;
    prepassDocType = threePassOutput.items.length > 0 ? "itemized_schedule" : "unknown";

    traceEntries.push({
      parser: "deterministic_prepass",
      started_at: new Date(prepassStart).toISOString(),
      ended_at: new Date(prepassStart + prepassDurationMs).toISOString(),
      duration_ms: prepassDurationMs,
      status: "success",
      reason: `${prepassSections} sections detected, doc_type=${prepassDocType}, duration=${prepassDurationMs}ms`,
    });

    const llmStart = prepassStart + prepassDurationMs;
    const llmDuration = Date.now() - llmStart;
    const chunksStarted = threePassOutput.debug?.pass2_chunks_started ?? 0;
    const chunksCompleted = threePassOutput.debug?.pass2_chunks_completed ?? 0;

    for (let c = 0; c < chunksCompleted; c++) {
      traceEntries.push({
        parser: `llm_extraction chunk ${c + 1}`,
        started_at: new Date(llmStart + (c * (llmDuration / Math.max(chunksCompleted, 1)))).toISOString(),
        ended_at: new Date(llmStart + ((c + 1) * (llmDuration / Math.max(chunksCompleted, 1)))).toISOString(),
        duration_ms: Math.round(llmDuration / Math.max(chunksCompleted, 1)),
        status: "success",
        reason: `chunk ${c + 1}/${chunksStarted} extracted`,
      });
    }

    console.log(`[DET] Pre-pass done: sections=${prepassSections} items=${threePassOutput.items.length} confidence=${threePassOutput.confidence}`);

    return {
      result: {
        items: threePassOutput.items,
        confidence: threePassOutput.confidence,
        totals: {
          grandTotal: threePassOutput.totals.stated_grand_total ?? threePassOutput.totals.included_items_total,
          subtotal: threePassOutput.totals.stated_subtotal ?? undefined,
        },
        warnings: threePassOutput.warnings,
        success: threePassOutput.items.length > 0,
        failReason: threePassOutput.items.length === 0 ? "empty_response" : null,
        failMessage: threePassOutput.items.length === 0 ? "Three-pass parser returned 0 items" : "",
        chunksStarted: threePassOutput.debug?.pass2_chunks_started ?? 0,
        chunksCompleted: threePassOutput.debug?.pass2_chunks_completed ?? 0,
        prepassDurationMs,
        prepassSections,
        prepassDocType,
      },
      traceEntries,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = classifyLlmFailure(err);
    prepassDurationMs = Date.now() - prepassStart;

    traceEntries.push({
      parser: "deterministic_prepass",
      started_at: new Date(prepassStart).toISOString(),
      ended_at: new Date().toISOString(),
      duration_ms: prepassDurationMs,
      status: "failed",
      reason: msg.slice(0, 300),
    });

    console.error("[DET] Three-pass parser threw:", msg);

    return {
      result: {
        items: [], confidence: 0, totals: {}, warnings: [`Three-pass failed: ${msg}`],
        success: false, failReason: reason, failMessage: msg,
        chunksStarted: 0, chunksCompleted: 0,
        prepassDurationMs, prepassSections: 0, prepassDocType: "unknown",
      },
      traceEntries,
    };
  }
}

function adaptLlmItem(item: any, index: number, parserUsed: string): ParsedLineItem {
  const desc = cleanText(String(item.description ?? "")) || `Item ${index + 1}`;
  const rawQty = item.qty ?? item.quantity;
  const rawRate = item.rate ?? item.unit_price;
  const rawTotal = item.total ?? item.total_price;
  const qtyNum = rawQty === null || rawQty === undefined || rawQty === "" ? NaN : Number(rawQty);
  const rateNum = rawRate === null || rawRate === undefined || rawRate === "" ? NaN : Number(rawRate);
  const totalNum = rawTotal === null || rawTotal === undefined || rawTotal === "" ? NaN : Number(rawTotal);

  const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : null;
  let rate = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : null;
  const total = Number.isFinite(totalNum) ? totalNum : 0;

  if (rate === null && qty !== null && total > 0) {
    rate = parseFloat((total / qty).toFixed(4));
  }

  const isOptional =
    /optional|option\b|\(opt\)/i.test(desc) ||
    String(item.section ?? "").toLowerCase().includes("optional") ||
    item.is_optional === true;

  return {
    lineId: String(index + 1),
    section: cleanText(String(item.section ?? "")),
    description: desc,
    qty,
    unit: cleanText(String(item.unit ?? "ea")) || "ea",
    rate,
    total,
    scopeCategory: isOptional ? "optional" : "base",
    pageNum: 0,
    confidence: Number(item.confidence ?? 0.85),
    source: parserUsed,
  };
}

function arithmeticallyValid(item: ParsedLineItem): boolean {
  if (item.qty === null || item.rate === null || item.total <= 0) return true;
  const expected = item.qty * item.rate;
  const tolerance = Math.max(0.02 * item.total, 0.5);
  return Math.abs(expected - item.total) <= tolerance;
}

function dedupKey(item: ParsedLineItem): string {
  return [
    item.description.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80),
    (item.qty ?? 0).toFixed(3),
    (item.rate ?? 0).toFixed(2),
    item.total.toFixed(2),
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

// ---------------------------------------------------------------------------
// STABLE MODE — LLM enhancement pass
// Operates ONLY on already-extracted regex items. Enhances:
//   - scope_category (base | optional) cleanup when ambiguous
//   - category tagging (plumbing, fire, joinery, etc.)
//   - FRR normalisation (e.g. "90 / 90 / -" -> "90/90/-")
// Never adds or removes rows. Never touches qty / rate / total.
// If the LLM call fails, the caller swallows the error and ships regex output.
// ---------------------------------------------------------------------------
async function runLlmEnhancementPass(
  apiKey: string,
  baseItems: ParsedLineItem[],
  optionalItems: ParsedLineItem[],
): Promise<{ baseItems: ParsedLineItem[]; optionalItems: ParsedLineItem[]; touched: number } | null> {
  if (!apiKey) return null;
  const all = [...baseItems, ...optionalItems];
  if (all.length === 0) return null;

  // Hard cap so the enhancement pass is fast and cheap.
  const MAX_ITEMS = 250;
  const sample = all.slice(0, MAX_ITEMS);

  const payload = sample.map((it, i) => ({
    i,
    description: it.description.slice(0, 240),
    current_scope: it.scopeCategory,
    frr: extractFRRFromDescription(it.description) || null,
  }));

  const system = `You enhance already-extracted construction quote line items.
You MUST NOT add, remove, or re-order items.
You MUST NOT modify quantity, unit price, or total.
For each item, return the same index and:
  - scope: "base" or "optional"
  - category: short tag ("plumbing","fire_stopping","joinery","hvac","electrical","general", etc.)
  - frr: normalised fire-resistance rating as "N/N/N" or null
Return JSON: {"items":[{"i":0,"scope":"base","category":"fire_stopping","frr":"90/90/90"}]}.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        max_completion_tokens: 4096,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`OpenAI enhance ${res.status}`);
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(repairJson(content));
    const updates: Array<{ i: number; scope?: string; category?: string; frr?: string | null }> = parsed?.items ?? [];

    let touched = 0;
    const enhanced = [...baseItems, ...optionalItems];
    for (const u of updates) {
      const target = enhanced[u.i];
      if (!target) continue;
      let changed = false;
      if (u.scope === "base" || u.scope === "optional") {
        if (target.scopeCategory !== u.scope) {
          target.scopeCategory = u.scope;
          changed = true;
        }
      }
      if (u.category) {
        (target as any).category = u.category;
        changed = true;
      }
      if (u.frr) {
        (target as any).frrNormalised = u.frr;
        changed = true;
      }
      if (changed) touched++;
    }

    // Re-split by scope after enhancement (LLM may have moved items between base/optional)
    const newBase = enhanced.filter((it) => it.scopeCategory === "base");
    const newOptional = enhanced.filter((it) => it.scopeCategory === "optional");
    return { baseItems: newBase, optionalItems: newOptional, touched };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
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

    // =========================================================================
    // IDEMPOTENCY LOCK — reject if another worker is actively processing this
    // job (status=processing AND heartbeat within last 120s).
    // =========================================================================
    const ACTIVE_LOCK_WINDOW_MS = 120_000;
    const jobUpdatedAt = typedJob.updated_at ? new Date(typedJob.updated_at).getTime() : 0;
    const isRecentlyUpdated = Date.now() - jobUpdatedAt < ACTIVE_LOCK_WINDOW_MS;
    if (typedJob.status === "processing" && isRecentlyUpdated) {
      console.warn(`[PIPELINE_START] Rejecting duplicate dispatch for job ${jobId} — already processing (updated ${Math.round((Date.now() - jobUpdatedAt) / 1000)}s ago)`);
      return new Response(
        JSON.stringify({ error: "job_already_processing", jobId, message: "Job is already being processed by another worker" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Hard stop — prevent infinite retry loops
    const HARD_MAX_ATTEMPTS = 5;
    if ((typedJob.attempt_count ?? 0) >= HARD_MAX_ATTEMPTS) {
      console.error(`[PIPELINE_START] Job ${jobId} has reached hard max attempts (${HARD_MAX_ATTEMPTS}). Marking as permanently failed.`);
      await supabase.from("parsing_jobs").update({
        status: "failed",
        current_stage: "Failed — Max Attempts Exceeded",
        error_message: `Job exceeded hard maximum of ${HARD_MAX_ATTEMPTS} attempts. Manual intervention required.`,
        last_error: "hard_max_attempts_exceeded",
        last_error_code: "hard_failure",
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
      return new Response(
        JSON.stringify({ error: "hard_max_attempts_exceeded", jobId }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
    let parserStrategy: "llm_primary" | "regex_only" | "regex_primary_llm_enhance" =
      isSpreadsheet ? "regex_only"
        : STABLE_MODE ? "regex_primary_llm_enhance"
        : "llm_primary";

    console.log(`[MODE] PRODUCTION_MODE=${PRODUCTION_MODE} stable=${STABLE_MODE} strategy=${parserStrategy}`);

    let llmAttempted = false;
    let llmSuccess: boolean | null = null;
    let llmFailReason: LlmFailReason | null = null;
    let llmFailMessage = "";
    let llmChunksStarted: number | null = null;
    let llmChunksCompleted: number | null = null;
    let llmConfidence = 0;
    // llmAttemptsMade removed — no retry loop with det pre-pass
    let llmWarnings: string[] = [];
    let llmRawItems: any[] = [];
    let llmGrandTotal = 0;
    let regexRecoveryUsed = false;
    let regexResult: ReturnType<typeof runParserV3> | null = null;
    let prepassDurationMs = 0;
    let prepassSections = 0;
    let prepassDocType = "unknown";

    const skipLlmDueToLoop = !isSpreadsheet && (
      currentAttemptCount >= 3 ||
      (priorLlmFailed && currentAttemptCount >= 2)
    );

    // STABLE MODE: regex_primary path — parserRouterV3 runs first, LLM is optional enhancement only.
    // This completely bypasses threePassParser for PDFs.
    const runStableRegexPrimary = STABLE_MODE && !isSpreadsheet;

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

    } else if (runStableRegexPrimary) {
      // =====================================================================
      // STABLE PRODUCTION PATH
      // parserRouterV3 -> items
      // parseResolutionLayerV3 -> totals
      // LLM (optional, best-effort) -> categorise + scope cleanup + FRR enhancement
      // threePassParser is NOT called in this path.
      // =====================================================================
      await setStage(supabase, jobId, "Running Stable Parser (regex primary)", 45);
      const t0 = Date.now();
      regexResult = runParserV3({ pages: allPages, rawText, fileExtension });
      const dur = Date.now() - t0;
      regexRecoveryUsed = false;

      parserTrace.push({
        parser: "regex_primary_v3",
        started_at: new Date(Date.now() - dur).toISOString(),
        ended_at: new Date().toISOString(),
        duration_ms: dur,
        status: "success",
        reason: `STABLE_MODE — ${regexResult.resolution.baseItems.length} base items`,
      });

      // Best-effort LLM enhancement (NON-BLOCKING). If it fails, we still ship the stable result.
      try {
        await setStage(supabase, jobId, "Enhancing items (categorise + FRR)", 65);
        const enhanceStart = Date.now();
        const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
        const enhanced = await runLlmEnhancementPass(
          openAiKey,
          regexResult.resolution.baseItems,
          regexResult.resolution.optionalItems,
        );
        if (enhanced) {
          regexResult.resolution.baseItems = enhanced.baseItems;
          regexResult.resolution.optionalItems = enhanced.optionalItems;
          parserTrace.push({
            parser: "llm_enhancement",
            started_at: new Date(enhanceStart).toISOString(),
            ended_at: new Date().toISOString(),
            duration_ms: Date.now() - enhanceStart,
            status: "success",
            reason: `Enhanced ${enhanced.touched} items (scope/FRR/category)`,
          });
          llmAttempted = true;
          llmSuccess = true;
        }
      } catch (enhanceErr) {
        const msg = enhanceErr instanceof Error ? enhanceErr.message : String(enhanceErr);
        console.warn(`[ENHANCE] LLM enhancement failed (non-fatal): ${msg}`);
        parserTrace.push({
          parser: "llm_enhancement",
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          duration_ms: 0,
          status: "failed",
          reason: msg.slice(0, 200),
        });
        llmAttempted = true;
        llmSuccess = false;
        llmFailReason = classifyLlmFailure(enhanceErr);
        llmFailMessage = msg;
      }

      await setStage(supabase, jobId, "Finalizing Totals", 75);

    } else if (skipLlmDueToLoop) {
      console.warn(`[LOOP_BREAKER] attempt=${currentAttemptCount} priorLlmFailed=${priorLlmFailed} — skipping LLM`);
      parserTrace.push({
        parser: "deterministic_prepass",
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
      // PDF — deterministic pre-pass + LLM row extraction (NO structural LLM Pass 1)
      llmAttempted = true;
      await supabase.from("parsing_jobs").update({
        primary_parser: "three_pass_llm",
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);

      const { result: threePassResult, traceEntries } = await runDeterministicPlusTwoPass(
        supabase, jobId, rawText, typedJob.supplier_name,
      );

      parserTrace.push(...traceEntries);
      prepassDurationMs = threePassResult.prepassDurationMs;
      prepassSections = threePassResult.prepassSections;
      prepassDocType = threePassResult.prepassDocType;
      llmChunksStarted = threePassResult.chunksStarted;
      llmChunksCompleted = threePassResult.chunksCompleted;
      llmFailReason = threePassResult.failReason;
      llmFailMessage = threePassResult.failMessage;

      if (threePassResult.items.length > 0) {
        llmSuccess = true;
        llmConfidence = threePassResult.confidence;
        llmWarnings = threePassResult.warnings;
        llmGrandTotal = threePassResult.totals.grandTotal ?? 0;
        const { kept: filteredItems, removed } = filterLlmSummaryRows(threePassResult.items);
        llmRawItems = filteredItems;
        if (removed > 0) console.log(`[DET] Removed ${removed} summary rows post-filter`);
      } else {
        llmSuccess = false;
      }

      // Persist audit state
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
      const threePassItemsSum = llmRawItems.reduce((s: number, i: any) => s + Number(i.total ?? 0), 0);
      const mismatchRatio = documentTotal > 0 && threePassItemsSum > 0
        ? Math.abs(documentTotal - threePassItemsSum) / documentTotal
        : 0;

      const needsRegexRecovery = llmRawItems.length === 0 || llmConfidence < 0.55 || (documentTotal > 0 && mismatchRatio > 0.20);

      if (needsRegexRecovery) {
        regexRecoveryUsed = true;
        const reasons: string[] = [];
        if (llmRawItems.length === 0) reasons.push("zero_items");
        if (llmConfidence < 0.55) reasons.push(`low_confidence(${llmConfidence.toFixed(2)})`);
        if (documentTotal > 0 && mismatchRatio > 0.20) reasons.push(`totals_mismatch(${(mismatchRatio * 100).toFixed(1)}%)`);

        await setStage(supabase, jobId, "Three-Pass Low Confidence — Switching to Fallback", 65);
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

    if ((isSpreadsheet || runStableRegexPrimary) && regexResult) {
      // Spreadsheet OR stable-mode PDF path — resolution already produced by parserRouterV3
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
        parserReasons: [`llm confidence=${llmConfidence.toFixed(2)}`, `attempts=1`, ...llmWarnings.slice(0, 4)],
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
    let finalParserUsed = resolution.parserUsed;
    let hasItems = resolution.baseItems.length > 0 || resolution.optionalItems.length > 0;
    let hasTotal = resolution.totals.grandTotal > 0;

    // =========================================================================
    // HYBRID ARBITRATION ENGINE — universal, company-agnostic
    // =========================================================================
    const allFlatItems = [...resolution.baseItems, ...resolution.optionalItems];
    const arbitrationItems = allFlatItems.map((it) => ({
      description: it.description || "",
      qty: it.qty ?? null,
      unit: it.unit ?? null,
      rate: it.rate ?? null,
      total: typeof it.total === "number" ? it.total : null,
      block: it.section ?? null,
      page: null,
      line_id: it.lineId ?? null,
      line_number: null,
      confidence: it.confidence ?? null,
      source: it.source ?? finalParserUsed,
      scope: it.scopeCategory === "optional" ? "optional" as const : it.scopeCategory === "excluded" ? "excluded" as const : "main" as const,
    }));

    const arbitration = arbitrate({
      rawText,
      items: arbitrationItems,
      rowSum: resolution.totals.rowSum ?? null,
      parserUsed: finalParserUsed,
    });

    if (
      arbitration.resolved_total !== null &&
      arbitration.resolved_total_label !== null &&
      arbitration.resolved_total_label !== "row_sum" &&
      resolution.totals.grandTotal > 0 &&
      Math.abs(arbitration.resolved_total - resolution.totals.grandTotal) / resolution.totals.grandTotal > 0.02
    ) {
      console.log(
        `[Arbitration] Labelled total override: ${arbitration.resolved_total_label}=${arbitration.resolved_total} replaces grandTotal=${resolution.totals.grandTotal}`,
      );
      resolution.totals.grandTotal = arbitration.resolved_total;
      resolution.totals.source = "labelled_total_priority";
    } else if (arbitration.resolved_total !== null && resolution.totals.grandTotal === 0) {
      resolution.totals.grandTotal = arbitration.resolved_total;
      resolution.totals.source = arbitration.resolved_total_label ?? "row_sum";
    }

    // =========================================================================
    // GPT-4o-mini VALUE REVIEW — validator/corrector/arbitrator of VALUES
    // Not metadata tagging. Decides qty/rate/total/scope and final totals.
    // =========================================================================
    let gptValueReview: ValueReviewResult = {
      used: false,
      trigger_reasons: [],
      trigger_debug: [],
      fallback_to_deterministic: false,
      mark_for_review: false,
    };
    let gptQuoteNeedsManualReview = false;

    const deterministicCandidateItems: CandidateItem[] = arbitration.items.map((it) => ({
      description: it.description,
      qty: it.qty,
      unit: it.unit ?? "",
      rate: it.rate,
      total: it.total,
      scope: it.scope === "optional" ? "Optional" : it.scope === "excluded" ? "Excluded" : "Main",
      line_number: it.line_number ?? null,
      block: it.block ?? null,
      confidence: it.confidence ?? null,
    }));

    const arithmeticMismatchCount = deterministicCandidateItems.reduce((acc, it) => {
      if (it.qty !== null && it.rate !== null && it.total !== null && it.total > 0) {
        const tol = Math.max(it.total * 0.02, 0.5);
        if (Math.abs(it.qty * it.rate - it.total) > tol) return acc + 1;
      }
      return acc;
    }, 0);

    console.log(
      `[GPT Value Review] entering reviewer: items=${deterministicCandidateItems.length} confidence=${arbitration.confidence.overall_confidence.toFixed(3)} parserUsed=${resolution.parserUsed} openAiKey=${Deno.env.get("OPENAI_API_KEY") ? "present" : "MISSING"}`,
    );
    await setStage(supabase, jobId, "GPT Value Review", 72);
    try {
      // Timeout guard — prevent edge function SIGKILL by capping GPT review at 75s
      const GPT_REVIEW_MAX_MS = 75_000;
      const gptPromise = runValueReview(
        {
          documentText: rawText,
          candidateItems: deterministicCandidateItems,
          candidateTotals: {
            grand_total: resolution.totals.grandTotal > 0 ? resolution.totals.grandTotal : null,
            subtotal: resolution.totals.subTotal ?? null,
            optional_total: resolution.totals.optionalTotal > 0 ? resolution.totals.optionalTotal : null,
            row_sum: resolution.totals.rowSum ?? null,
            source: resolution.totals.source ?? null,
            labelled_total_label: arbitration.resolved_total_label ?? null,
          },
          warnings: arbitration.warnings,
          candidateConfidence: arbitration.confidence.overall_confidence,
          duplicatesRemovedCount: Math.max(
            (resolution as unknown as { duplicatesRemoved?: number }).duplicatesRemoved ?? 0,
            allFlatItems.length - arbitration.items.length,
          ),
          arithmeticMismatchCount,
          rowSumChosenWithoutLabelledTotal:
            (!arbitration.resolved_total_label || arbitration.resolved_total_label === "row_sum") &&
            (resolution.totals.grandTotal ?? 0) > 0,
        },
        { openAiKey: Deno.env.get("OPENAI_API_KEY") ?? "" },
      );
      const gptTimeoutPromise = new Promise<ValueReviewResult>((_, reject) =>
        setTimeout(() => reject(new Error(`GPT Value Review exceeded ${GPT_REVIEW_MAX_MS}ms timeout`)), GPT_REVIEW_MAX_MS),
      );
      gptValueReview = await Promise.race([gptPromise, gptTimeoutPromise]);
      console.log(
        `[GPT Value Review] exit: used=${gptValueReview.used} fallback=${gptValueReview.fallback_to_deterministic} skipped=${gptValueReview.skipped_reason ?? "n/a"} error=${gptValueReview.error ?? "n/a"} triggers_fired=${gptValueReview.trigger_reasons.length} elapsed_ms=${gptValueReview.elapsed_ms ?? 0}`,
      );
    } catch (e) {
      console.error("[GPT Value Review] unexpected error (will fall back to deterministic):", e);
      gptValueReview = {
        used: false,
        trigger_reasons: [],
        trigger_debug: [],
        fallback_to_deterministic: true,
        mark_for_review: true,
        error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      };
    }

    if (gptValueReview.used && gptValueReview.parsed && !gptValueReview.fallback_to_deterministic) {
      const gpt = gptValueReview.parsed;
      console.log(
        `[GPT Value Review] applied: items=${gpt.items.length} conf=${gpt.document_confidence.toFixed(2)} triggers=[${gptValueReview.trigger_reasons.join("|")}]`,
      );

      const correctedBase = gpt.items.filter((i) => i.scope === "Main");
      const correctedOptional = gpt.items.filter((i) => i.scope === "Optional");
      const correctedExcluded = gpt.items.filter((i) => i.scope === "Excluded");

      const toResolutionItem = (it: typeof gpt.items[number], idx: number) => ({
        lineId: `gpt-${idx + 1}`,
        description: it.description,
        qty: it.qty ?? 1,
        unit: it.unit || "",
        rate: it.rate ?? 0,
        total: it.total ?? 0,
        section: null,
        scopeCategory: it.scope === "Optional" ? "optional" : it.scope === "Excluded" ? "excluded" : "base",
        source: "gpt_value_review(gpt-4o-mini)",
        confidence: it.confidence,
      }) as unknown as ParsedLineItem;

      resolution.baseItems = correctedBase.map(toResolutionItem);
      resolution.optionalItems = correctedOptional.map(toResolutionItem);
      resolution.excludedItems = correctedExcluded.map(toResolutionItem);

      const ft = gpt.final_totals;
      if (ft.grand_total !== null && ft.grand_total > 0) {
        resolution.totals.grandTotal = ft.grand_total;
        resolution.totals.source = "gpt_value_review";
      }
      if (ft.optional_total !== null && ft.optional_total > 0) {
        resolution.totals.optionalTotal = ft.optional_total;
      }
      if (ft.main_total !== null && ft.main_total > 0) {
        resolution.totals.rowSum = ft.main_total;
      }

      resolution.parserUsed = `${resolution.parserUsed}+gpt_value_review`;

      if (gptValueReview.mark_for_review || gpt.document_confidence < 0.65) {
        gptQuoteNeedsManualReview = true;
      }
    } else if (gptValueReview.used && gptValueReview.fallback_to_deterministic) {
      console.log(
        `[GPT Value Review] fallback to deterministic: ${gptValueReview.error ?? "output worse than deterministic"}`,
      );
      if (gptValueReview.mark_for_review) gptQuoteNeedsManualReview = true;
    }

    // ========================================================================
    // CONSENSUS TOTALS — recompute authoritative main/optional/grand from
    // classified rows + labelled document totals. Overrides row_sum display.
    // ========================================================================
    const consensusRows: ScopedRow[] = [
      ...resolution.baseItems.map((i) => ({ total: i.total, scope: "Main" as const })),
      ...resolution.optionalItems.map((i) => ({ total: i.total, scope: "Optional" as const })),
      ...resolution.excludedItems.map((i) => ({ total: i.total, scope: "Excluded" as const })),
    ];
    const consensus = resolveConsensusTotals(consensusRows, rawText);
    console.log(
      `[Consensus Totals] source=${consensus.resolution_source} conf=${consensus.confidence} ` +
      `main=${consensus.main_total} optional=${consensus.optional_total} grand=${consensus.grand_total} ` +
      `summed_main=${consensus.summed_main} summed_optional=${consensus.summed_optional}`,
    );

    resolution.totals.grandTotal = consensus.grand_total;
    resolution.totals.optionalTotal = consensus.optional_total;
    resolution.totals.source = consensus.resolution_source;

    finalParserUsed = resolution.parserUsed;
    hasItems = resolution.baseItems.length > 0 || resolution.optionalItems.length > 0;
    hasTotal = resolution.totals.grandTotal > 0;

    const traceReport = {
      build_version: BUILD_VERSION,
      production_mode: PRODUCTION_MODE,
      stable_mode: STABLE_MODE,
      three_pass_version: THREE_PASS_VERSION,
      primary_parser: runStableRegexPrimary ? "regex_primary_v3" : "three_pass_llm",
      prepass: prepassDurationMs > 0 ? "deterministic OK" : "skipped",
      prepass_duration_ms: prepassDurationMs,
      prepass_sections_detected: prepassSections,
      prepass_doc_type: prepassDocType,
      llm_chunks: `${llmChunksCompleted ?? 0} / ${llmChunksStarted ?? 0} completed`,
      fallback_triggered: regexRecoveryUsed,
      final_parser_used: finalParserUsed,
      attempt_order: parserTrace,
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

    let canonicalTotal = consensus.grand_total;
    let canonicalOptionalTotal = consensus.optional_total;
    let canonicalMainTotal = consensus.main_total;
    let canonicalExcludedTotal = consensus.excluded_total;
    let resolutionConfidence = consensus.confidence;
    let resolutionSourceFinal = consensus.resolution_source;
    let evidenceForPersist = consensus.evidence;
    let highConfidenceGuardTriggered = false;

    let quoteData: { id: string };

    if (typedJob.quote_id) {
      // Totals Trust Layer: never overwrite an existing HIGH-confidence decision
      // with a lower-confidence reparse. Fetch prior state first.
      const { data: priorQuote } = await supabase
        .from("quotes")
        .select("total_amount, resolution_confidence, totals_confidence, resolution_source, resolved_total, optional_scope_total, totals_evidence")
        .eq("id", typedJob.quote_id)
        .maybeSingle();

      const priorConf = (priorQuote?.totals_confidence ?? priorQuote?.resolution_confidence) as string | null | undefined;
      if (
        priorConf === "HIGH" &&
        confidenceRank(consensus.confidence) < confidenceRank("HIGH") &&
        Number(priorQuote?.resolved_total ?? priorQuote?.total_amount ?? 0) > 0
      ) {
        highConfidenceGuardTriggered = true;
        canonicalTotal = Number(priorQuote?.resolved_total ?? priorQuote?.total_amount ?? 0);
        canonicalMainTotal = Number(priorQuote?.resolved_total ?? priorQuote?.total_amount ?? 0) -
          Number(priorQuote?.optional_scope_total ?? 0);
        canonicalOptionalTotal = Number(priorQuote?.optional_scope_total ?? 0);
        resolutionConfidence = "HIGH";
        resolutionSourceFinal = (priorQuote?.resolution_source as typeof resolutionSourceFinal) ?? resolutionSourceFinal;
        evidenceForPersist = {
          ...consensus.evidence,
          notes: [
            `HIGH-confidence totals guard: retained prior total $${canonicalTotal} (source=${priorQuote?.resolution_source}); ` +
            `new parse confidence=${consensus.confidence} source=${consensus.resolution_source} was rejected`,
            ...consensus.evidence.notes,
          ],
        };
        console.log(`[TotalsTrust] HIGH guard active for quote=${typedJob.quote_id} — rejected ${consensus.confidence}/${consensus.resolution_source}`);
      }

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

    const baseBanFilter = filterBannedItems(resolution.baseItems);
    const optionalBanFilter = filterBannedItems(resolution.optionalItems);
    const excludedBanFilter = filterBannedItems(resolution.excludedItems);
    resolution.baseItems = baseBanFilter.kept;
    resolution.optionalItems = optionalBanFilter.kept;
    resolution.excludedItems = excludedBanFilter.kept;
    const bannedRows = [
      ...baseBanFilter.rejected,
      ...optionalBanFilter.rejected,
      ...excludedBanFilter.rejected,
    ];
    console.log(`[PIPELINE] debug_version=${DEBUG_VERSION} deployed_at=${DEPLOYED_AT} banned_rows_rejected=${bannedRows.length}`);
    for (const r of bannedRows.slice(0, 20)) {
      console.log(`[PIPELINE] banned_row desc="${(r as any).description}" qty=${(r as any).qty} rate=${(r as any).rate} total=${(r as any).total}`);
    }

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
      resolved_total: canonicalTotal, resolution_source: resolutionSourceFinal,
      resolution_confidence: resolutionConfidence,
      totals_confidence: resolutionConfidence,
      totals_evidence: evidenceForPersist,
      document_grand_total: canonicalTotal > 0 ? canonicalTotal : null,
      document_sub_total: resolution.totals.subTotal,
      optional_scope_total: canonicalOptionalTotal > 0 ? canonicalOptionalTotal : null,
      original_line_items_total: resolution.totals.rowSum,
      parse_anomalies: consensus.parse_anomalies ?? [],
      has_variants: (consensus.variants?.length ?? 0) > 0,
    }).eq("id", quoteData.id);

    if (consensus.variants && consensus.variants.length > 0) {
      try {
        await supabase.from("quote_variants").delete().eq("quote_id", quoteData.id);
        const variantRows = consensus.variants.map((v, idx) => ({
          quote_id: quoteData.id,
          organisation_id: quoteData.organisation_id,
          variant_index: v.variant_index ?? idx,
          variant_label: v.variant_label ?? `Option ${idx + 1}`,
          main_total: v.main_total ?? 0,
          optional_total: v.optional_total ?? 0,
          grand_total: v.grand_total ?? 0,
          is_primary: v.is_primary ?? (idx === 0),
          source_evidence: v.source_evidence ?? {},
        }));
        const { error: variantError } = await supabase.from("quote_variants").insert(variantRows);
        if (variantError) {
          console.error("[quote_variants] insert failed:", variantError.message);
        } else {
          console.log(`[quote_variants] persisted ${variantRows.length} variants for quote ${quoteData.id}`);
        }
      } catch (e) {
        console.error("[quote_variants] error:", e instanceof Error ? e.message : String(e));
      }
    }

    const parseMetadata = {
      parser_strategy: parserStrategy,
      parser_version: "v3-det-prepass",
      debug_version: DEBUG_VERSION,
      deployed_at: DEPLOYED_AT,
      banned_rows_rejected: bannedRows.length,
      banned_rows_samples: bannedRows.slice(0, 10).map((r: any) => ({
        description: r?.description,
        qty: r?.qty,
        rate: r?.rate,
        total: r?.total,
      })),
      entry_point: "process_parsing_job",
      document_class: classification.documentClass,
      commercial_family: classification.commercialFamily,
      parser_used: finalParserUsed,
      primary_parser: runStableRegexPrimary ? "regex_primary_v3" : "three_pass_llm",
      production_mode: PRODUCTION_MODE,
      stable_mode: STABLE_MODE,
      prepass: prepassDurationMs > 0 ? "deterministic OK" : "skipped",
      prepass_duration_ms: prepassDurationMs,
      prepass_sections_detected: prepassSections,
      prepass_doc_type: prepassDocType,
      llm_chunks: `${llmChunksCompleted ?? 0} / ${llmChunksStarted ?? 0} completed`,
      fallback_triggered: regexRecoveryUsed,
      llm_attempted: llmAttempted,
      llm_success: llmSuccess,
      llm_fail_reason: llmFailReason,
      llm_fail_message: llmFailMessage.slice(0, 300),
      arbitration: {
        resolved_total: arbitration.resolved_total,
        resolved_total_label: arbitration.resolved_total_label,
        total_candidates: arbitration.total_candidates,
        headings_detected: arbitration.headings.length,
        confidence: arbitration.confidence,
        warnings: arbitration.warnings.slice(0, 20),
      },
      gpt_value_review: {
        used: gptValueReview.used,
        skipped_reason: gptValueReview.skipped_reason ?? null,
        trigger_reasons: gptValueReview.trigger_reasons,
        trigger_debug: gptValueReview.trigger_debug,
        fallback_to_deterministic: gptValueReview.fallback_to_deterministic,
        mark_for_review: gptValueReview.mark_for_review,
        document_confidence: gptValueReview.parsed?.document_confidence ?? null,
        items_returned: gptValueReview.parsed?.items.length ?? 0,
        final_totals: gptValueReview.parsed?.final_totals ?? null,
        elapsed_ms: gptValueReview.elapsed_ms ?? null,
        cost_estimate_usd: gptValueReview.cost_estimate_usd ?? null,
        error: gptValueReview.error ?? null,
        error_detail: gptValueReview.error_detail ?? null,
        http_status: gptValueReview.http_status ?? null,
        raw_response_preview: gptValueReview.raw_response ?? null,
      },
      needs_manual_review: gptQuoteNeedsManualReview,
      llm_chunks_started: llmChunksStarted,
      llm_chunks_completed: llmChunksCompleted,
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
      main_total: canonicalMainTotal,
      excluded_total: canonicalExcludedTotal,
      row_sum: resolution.totals.rowSum,
      validation_risk: resolution.validation.risk,
      parser_reasons: resolution.debug.parserReasons,
      consensus_totals: {
        main_total: consensus.main_total,
        optional_total: consensus.optional_total,
        excluded_total: consensus.excluded_total,
        grand_total: consensus.grand_total,
        resolution_source: consensus.resolution_source,
        confidence: consensus.confidence,
        summed_main: consensus.summed_main,
        summed_optional: consensus.summed_optional,
        summed_excluded: consensus.summed_excluded,
        labelled: {
          grand_total: consensus.labelled.grand_total,
          main_total: consensus.labelled.main_total,
          optional_total: consensus.labelled.optional_total,
          excluded_total: consensus.labelled.excluded_total,
          subtotal: consensus.labelled.subtotal,
          labels_found: consensus.labelled.labels_found.slice(0, 20),
        },
        notes: consensus.notes,
      },
    };

    // Parser trust gate: a zero grand_total is NEVER "completed". Also honor
    // consensus's own requires_review flag — which triggers on summed_rows_fallback.
    // When the HIGH-confidence guard retained the prior total, we do NOT mark for review.
    const consensusRequiresReview = consensus.requires_review && !highConfidenceGuardTriggered;
    const requiresReview =
      !highConfidenceGuardTriggered && (
        !(canonicalTotal > 0) ||
        resolutionConfidence === "LOW" ||
        consensusRequiresReview ||
        resolutionSourceFinal === "summed_rows_fallback"
      );
    const finalStatus = requiresReview ? "review_required" : "completed";
    const finalStage = requiresReview ? "Review Required — Totals Need Verification" : "Completed";
    const reviewReason = !(canonicalTotal > 0)
      ? "Parser produced zero grand total"
      : resolutionSourceFinal === "summed_rows_fallback"
        ? "Totals resolved via raw row-sum fallback — no labelled totals or classified rows"
        : resolutionConfidence === "LOW"
          ? "Parser confidence LOW"
          : consensusRequiresReview
            ? (consensus.review_reason ?? "Consensus engine flagged totals for review")
            : null;

    if (requiresReview) {
      await supabase.from("quotes").update({
        requires_review: true,
        resolution_source: "needs_review",
        resolution_confidence: "LOW",
        totals_confidence: "LOW",
      }).eq("id", quoteData.id);
    }

    await supabase.from("parsing_jobs").update({
      status: finalStatus,
      progress: 100,
      current_stage: finalStage,
      quote_id: quoteData.id,
      result_data: { ...parseMetadata, requires_review: requiresReview, review_reason: reviewReason },
      metadata: { ...parseMetadata, requires_review: requiresReview, review_reason: reviewReason },
      llm_attempted: llmAttempted,
      llm_success: llmSuccess,
      llm_fail_reason: llmFailReason,
      llm_chunks_completed: llmChunksCompleted,
      final_parser_used: finalParserUsed,
      trace_json: traceReport,
      last_error: reviewReason,
      last_error_code: requiresReview ? "review_required" : null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    console.log(`[PIPELINE_END] status=success job_id=${jobId} items=${allQuoteItems.length} llm_success=${llmSuccess} fallback=${regexRecoveryUsed}`);

    return new Response(JSON.stringify({
      success: true, jobId, quoteId: quoteData.id, itemCount: allQuoteItems.length,
      parserUsed: finalParserUsed, llmSuccess, llmFailReason, regexRecoveryUsed,
      grandTotal: canonicalTotal, trace: traceReport,
      debug_version: DEBUG_VERSION,
      deployed_at: DEPLOYED_AT,
      parser_version: "v3-det-prepass",
      edge_function: "process_parsing_job",
      banned_rows_rejected: bannedRows.length,
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
