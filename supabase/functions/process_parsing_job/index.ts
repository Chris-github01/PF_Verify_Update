import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { runParserV2, type ParserV2Output } from "../_shared/parser_v2/runParserV2.ts";
import {
  StageTracker,
  ParserV2StageError,
  type StageRecord,
} from "../_shared/parser_v2/stageTracker.ts";

// =============================================================================
// PROCESS PARSING JOB — PARSER V2 ONLY (no V1 fallback).
//
// Flow:
//   1. Download file + extract text (PDF via pdfjs, XLSX via xlsx)
//   2. Run Parser V2 (LLM-first orchestrator)
//   3. On success → persist items + totals + passive_fire_final
//   4. On failure → persist full failure report onto quote.passive_fire_final
//      and parsing_jobs.parser_v2_output so UI can display the reason.
//      Parser V1 is NEVER invoked.
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUILD_VERSION = "2026-04-23-slow-finalize";

// Required inner stages that must all have passed for a run to be considered
// semantically successful even if the outer watchdog already fired. If these
// are all green, the job is committed as success (or success_slow_finalize).
const REQUIRED_INNER_STAGES = [
  "classification",
  "pf_sanitize",
  "pf_structure",
  "extraction",
  "pf_authoritative_total",
  "validation",
  "mappers",
] as const;

const TERMINAL_MAP_STAGE = "mappers";

function allRequiredStagesPassed(stages: StageRecord[]): boolean {
  const byName = new Map(stages.map((s) => [s.name, s]));
  for (const name of REQUIRED_INNER_STAGES) {
    const record = byName.get(name);
    if (!record) return false;
    if (record.status !== "passed" && record.status !== "skipped") return false;
  }
  return true;
}

function mapToDatabasePassed(stages: StageRecord[]): boolean {
  const record = stages.find((s) => s.name === TERMINAL_MAP_STAGE);
  return !!record && (record.status === "passed" || record.status === "skipped");
}

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

type V2FailureStage =
  | "download"
  | "text_extraction"
  | "parser_v2_exception"
  | "parser_v2_no_items"
  | "parser_v2_no_total"
  | "openai_key_missing";

interface V2FailureReport {
  failed: true;
  stage: V2FailureStage;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

function buildFailureReport(
  stage: V2FailureStage,
  message: string,
  details?: Record<string, unknown>,
): V2FailureReport {
  return {
    failed: true,
    stage,
    message: message.slice(0, 500),
    details,
    timestamp: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let jobId: string | null = null;
  const outerTracker = new StageTracker();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    jobId = body.jobId;
    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Missing jobId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("parsing_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (jobError || !job) throw new Error("Job not found");

    const typedJob = job as unknown as ParsingJob;
    const trade = typedJob.trade || "passive_fire";
    const currentAttemptCount = (typedJob.attempt_count ?? 0) + 1;

    console.log(`[PIPELINE_START_V2_ONLY] job=${jobId} file=${typedJob.filename} trade=${trade} attempt=${currentAttemptCount}`);

    await supabase.from("parsing_jobs").update({
      status: "processing",
      progress: 10,
      attempt_count: currentAttemptCount,
      current_stage: "Initializing (V2-only)",
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    // -------- STEP 1: download file --------
    await setStage(supabase, jobId, "Downloading file", 15);
    outerTracker.start("download");
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("quotes")
      .download(typedJob.file_url);

    if (downloadError || !fileData) {
      outerTracker.fail("download", downloadError ?? new Error("unknown download error"));
      const report = buildFailureReport(
        "download",
        `Failed to download file: ${downloadError?.message ?? "unknown"}`,
        { file_url: typedJob.file_url },
      );
      await persistFailure(supabase, typedJob, jobId, report, null, outerTracker.snapshot());
      return new Response(
        JSON.stringify({ success: false, jobId, error: report.message, stage: report.stage }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    outerTracker.succeed("download");

    const fileBuffer = await fileData.arrayBuffer();
    const fileName = typedJob.filename.toLowerCase();

    // -------- STEP 2: extract text --------
    await setStage(supabase, jobId, "Extracting document text", 25);
    outerTracker.start("text_extraction");
    let allPages: { pageNum: number; text: string }[] = [];
    let fileExtension: "pdf" | "xlsx" | "xls" | null = null;

    try {
      if (fileName.endsWith(".pdf")) {
        fileExtension = "pdf";
        const pdfjsLib = await import("npm:pdfjs-dist@4.0.379");
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(fileBuffer),
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
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
        allPages = [{
          pageNum: 1,
          text: rows.map((r) => r.map((c) => String(c || "").trim()).join("\t")).filter(Boolean).join("\n"),
        }];
      } else {
        throw new Error(`Unsupported file type: ${fileName}`);
      }
    } catch (extractErr) {
      const msg = extractErr instanceof Error ? extractErr.message : String(extractErr);
      outerTracker.fail("text_extraction", extractErr);
      const report = buildFailureReport("text_extraction", msg, { fileName });
      await persistFailure(supabase, typedJob, jobId, report, null, outerTracker.snapshot());
      return new Response(
        JSON.stringify({ success: false, jobId, error: msg, stage: report.stage }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (allPages.length === 0) {
      outerTracker.fail("text_extraction", new Error("no text extracted"));
      const report = buildFailureReport("text_extraction", "No text could be extracted from the file");
      await persistFailure(supabase, typedJob, jobId, report, null, outerTracker.snapshot());
      return new Response(
        JSON.stringify({ success: false, jobId, error: report.message, stage: report.stage }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    outerTracker.succeed("text_extraction");

    const rawText = allPages.map((p) => p.text).join("\n\n");
    console.log(`[EXTRACT] pages=${allPages.length} chars=${rawText.length} type=${fileExtension}`);

    // -------- STEP 3: run Parser V2 --------
    await setStage(supabase, jobId, "Running Parser V2", 45);

    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!openAiKey) {
      outerTracker.skip("parser_v2", "OPENAI_API_KEY missing");
      const report = buildFailureReport("openai_key_missing", "OPENAI_API_KEY is not configured");
      await persistFailure(supabase, typedJob, jobId, report, null, outerTracker.snapshot());
      return new Response(
        JSON.stringify({ success: false, jobId, error: report.message, stage: report.stage }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let v2: ParserV2Output;
    const requestStart = Date.now();
    const v2Start = Date.now();
    const V2_TIMEOUT_MS = 110_000;
    // Grace window after the soft watchdog fires. If the inner parser is still
    // progressing (stages passing under the durable sink) we give it this long
    // to finish before admitting defeat. Kept inside edge runtime wall clock.
    const V2_GRACE_MS = 25_000;
    outerTracker.start("parser_v2");
    let slowFinalize = false;
    let successCommittedAt: string | null = null;
    let timeoutFiredAt: string | null = null;

    await supabase.from("parsing_jobs").update({
      parser_started_at: new Date(v2Start).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    // Durable telemetry: persist pipeline_stages after every stage transition
    // so that an outer timeout never destroys the evidence of where we died.
    let liveInnerStages: StageRecord[] = [];
    let lastPersistAt = 0;
    let persistPending = false;
    const flushStages = async (stages: StageRecord[]): Promise<void> => {
      try {
        await supabase.from("parsing_jobs").update({
          pipeline_stages: [...outerTracker.snapshot(), ...stages],
          updated_at: new Date().toISOString(),
        }).eq("id", jobId!);
      } catch (e) {
        console.error("[persistStages] write failed", e);
      }
    };
    const persistStages = (stages: StageRecord[]): void => {
      liveInnerStages = stages;
      const now = Date.now();
      const hasActive = stages.some((s) => s.status === "running");
      if (!hasActive || now - lastPersistAt >= 400) {
        lastPersistAt = now;
        void flushStages(stages);
        return;
      }
      if (persistPending) return;
      persistPending = true;
      setTimeout(() => {
        persistPending = false;
        lastPersistAt = Date.now();
        void flushStages(liveInnerStages);
      }, 400);
    };

    // Cancellable watchdog. We keep a handle so we can clear it the moment
    // the parser resolves — a stale timer must never reject a committed
    // success promise. We also track whether the parser settled, so the
    // catch block can distinguish "real parser failure" from "slow parser
    // that kept running".
    let watchdogHandle: number | null = null;
    let watchdogRejected = false;
    let parserSettled = false;
    let parserResolvedValue: ParserV2Output | null = null;
    let parserRejectedError: unknown = null;

    const v2Promise = runParserV2({
      rawText,
      pages: allPages,
      fileName: typedJob.filename,
      supplierHint: typedJob.supplier_name,
      tradeHint: trade,
      projectId: typedJob.project_id,
      organisationId: typedJob.organisation_id,
      quoteId: typedJob.quote_id ?? undefined,
      openAIKey: openAiKey,
      persistStages,
    }).then(
      (value) => {
        parserSettled = true;
        parserResolvedValue = value;
        return value;
      },
      (err) => {
        parserSettled = true;
        parserRejectedError = err;
        throw err;
      },
    );

    const watchdogPromise = new Promise<never>((_, reject) => {
      watchdogHandle = setTimeout(() => {
        watchdogRejected = true;
        timeoutFiredAt = new Date().toISOString();
        reject(new Error(`parser_v2_timeout: exceeded ${V2_TIMEOUT_MS}ms`));
      }, V2_TIMEOUT_MS) as unknown as number;
    });

    const clearWatchdog = () => {
      if (watchdogHandle != null) {
        clearTimeout(watchdogHandle);
        watchdogHandle = null;
      }
    };

    try {
      try {
        v2 = await Promise.race([v2Promise, watchdogPromise]);
        clearWatchdog();
        outerTracker.succeed("parser_v2");
      } catch (raceErr) {
        // If the parser itself rejected (not the watchdog), re-throw — it's a real failure.
        if (!watchdogRejected) {
          clearWatchdog();
          throw raceErr;
        }

        // Watchdog fired first. If all required inner stages already passed
        // (durably persisted by the sink), the parser has effectively succeeded;
        // just await its resolution. Otherwise give it a grace window.
        if (allRequiredStagesPassed(liveInnerStages) && parserSettled && parserResolvedValue) {
          slowFinalize = true;
          v2 = parserResolvedValue;
          outerTracker.succeed("parser_v2");
        } else {
          try {
            const graceTimeout = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("grace_period_exceeded")), V2_GRACE_MS),
            );
            v2 = await Promise.race([v2Promise, graceTimeout]);
            slowFinalize = true;
            outerTracker.succeed("parser_v2");
          } catch (graceErr) {
            // Grace also expired. Last-chance check: if the durable sink
            // recorded all required stages as passed in the meantime, treat
            // as slow success using the resolved value if any.
            if (
              allRequiredStagesPassed(liveInnerStages) &&
              parserSettled &&
              parserResolvedValue
            ) {
              slowFinalize = true;
              v2 = parserResolvedValue;
              outerTracker.succeed("parser_v2");
            } else {
              throw raceErr;
            }
          }
        }
      }
    } catch (v2Err) {
      clearWatchdog();
      const msg = v2Err instanceof Error ? v2Err.message : String(v2Err);
      const stack = v2Err instanceof Error ? v2Err.stack?.slice(0, 1500) : undefined;
      console.error("[V2] threw:", msg);
      outerTracker.fail("parser_v2", v2Err);

      // Hard guard: if Map to Database already passed, we must not fail
      // the job. Treat as slow finalize instead.
      const innerStages =
        v2Err instanceof ParserV2StageError && v2Err.stages.length > 0
          ? v2Err.stages
          : liveInnerStages;

      if (mapToDatabasePassed(innerStages) && parserResolvedValue) {
        console.warn("[V2] watchdog fired after Map to Database passed; committing slow finalize");
        slowFinalize = true;
        v2 = parserResolvedValue;
        // fall through to the success-commit path below
      } else {
        const failedInnerStage =
          v2Err instanceof ParserV2StageError
            ? v2Err.failedStage
            : innerStages.find((s) => s.status === "running")?.name ?? null;
        const report = buildFailureReport("parser_v2_exception", msg, {
          stack,
          duration_ms: Date.now() - v2Start,
          failed_inner_stage: failedInnerStage,
          timeout_fired_at: timeoutFiredAt,
        });
        const combined = [...outerTracker.snapshot(), ...innerStages];
        await persistFailure(
          supabase,
          typedJob,
          jobId,
          report,
          null,
          combined,
          {
            parserStartedAt: new Date(v2Start).toISOString(),
            timeoutFiredAt,
            pureParsingMs: Date.now() - v2Start,
            totalRuntimeMs: Date.now() - requestStart,
          },
        );
        return new Response(
          JSON.stringify({ success: false, jobId, error: msg, stage: report.stage }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const v2DurationMs = Date.now() - v2Start;
    const finalizeStart = Date.now();
    console.log(`[V2] done in ${v2DurationMs}ms items=${v2.items.length} total=${v2.totals.grand_total} confidence=${v2.totals.confidence}`);

    // -------- STEP 4: persist V2 output --------
    await setStage(supabase, jobId, "Saving Parser V2 output", 80);

    const finalRecord = v2.passive_fire_final;
    const mainTotal = finalRecord?.quote_total_ex_gst ?? v2.totals.main_total ?? v2.totals.grand_total;
    const grandTotal = v2.totals.grand_total ?? mainTotal;
    const optionalTotal = finalRecord?.optional_total ?? v2.totals.optional_total ?? 0;

    // Guard: V2 produced nothing usable — still record as failed report
    if (v2.items.length === 0 && (!grandTotal || grandTotal <= 0)) {
      const report = buildFailureReport(
        "parser_v2_no_items",
        "Parser V2 returned zero items and no total",
        {
          anomalies: v2.validation.anomalies,
          extractor_used: v2.telemetry.extractor_used,
          requires_review: v2.requires_review,
          duration_ms: v2DurationMs,
          classification: v2.classification,
          passive_fire_validation: v2.passive_fire_validation,
        },
      );
      const combined = [...outerTracker.snapshot(), ...(v2.telemetry.stages ?? [])];
      await persistFailure(supabase, typedJob, jobId, report, v2, combined);
      return new Response(
        JSON.stringify({ success: false, jobId, error: report.message, stage: report.stage }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upsert quote
    let quoteId: string;
    if (typedJob.quote_id) {
      await supabase.from("quotes").update({
        status: "pending",
        total_amount: mainTotal,
        total_price: mainTotal,
        updated_at: new Date().toISOString(),
      }).eq("id", typedJob.quote_id);
      quoteId = typedJob.quote_id;
    } else {
      const dashboardMode = (typedJob.metadata as any)?.dashboard_mode || "original";
      let revisionNumber = 1;
      if (dashboardMode === "revisions") {
        const { data: latestQuote } = await supabase.from("quotes")
          .select("revision_number")
          .eq("project_id", typedJob.project_id)
          .eq("supplier_name", typedJob.supplier_name)
          .order("revision_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        revisionNumber = latestQuote?.revision_number ? latestQuote.revision_number + 1 : 2;
      }
      const { data: newQuote, error: createErr } = await supabase.from("quotes").insert({
        project_id: typedJob.project_id,
        supplier_name: typedJob.supplier_name,
        organisation_id: typedJob.organisation_id,
        status: "pending",
        total_amount: mainTotal,
        total_price: mainTotal,
        created_by: typedJob.user_id,
        revision_number: revisionNumber,
        trade,
      }).select("id").single();
      if (createErr || !newQuote) throw new Error(`Failed to create quote: ${createErr?.message}`);
      quoteId = newQuote.id;
    }

    // Replace items
    await supabase.from("quote_items").delete().eq("quote_id", quoteId);

    const mainItems = v2.items.filter((it) => it.scope_category === "main");
    const optionalItems = v2.items.filter((it) => it.scope_category === "optional");
    const excludedItems = v2.items.filter((it) => it.scope_category === "excluded");

    const rows = v2.items.map((it, idx) => ({
      quote_id: quoteId,
      item_number: it.item_number ?? String(idx + 1),
      description: it.description || "No description",
      quantity: it.quantity ?? 0,
      unit: it.unit ?? "ea",
      unit_price: it.unit_price ?? 0,
      total_price: it.total_price ?? 0,
      system_id: it.sub_scope ?? "",
      raw_text: it.description ?? "",
      confidence: it.confidence ?? 0.85,
      source: `parser_v2:${it.source}`,
      validation_flags: [],
      frr: it.frr ?? null,
      scope_category:
        it.scope_category === "main"
          ? "Main"
          : it.scope_category === "optional"
            ? "Optional"
            : "Excluded",
    }));

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("quote_items").insert(rows);
      if (insErr) throw new Error(`Failed to insert quote items: ${insErr.message}`);
    }

    const resolutionConfidence = v2.totals.confidence; // HIGH | MEDIUM | LOW

    await supabase.from("quotes").update({
      items_count: mainItems.length,
      raw_items_count: v2.items.length,
      inserted_items_count: mainItems.length,
      total_amount: mainTotal,
      total_price: mainTotal,
      resolved_total: mainTotal,
      resolution_source: v2.totals.resolution_source || "parser_v2",
      resolution_confidence: resolutionConfidence,
      document_grand_total: grandTotal > 0 ? grandTotal : null,
      document_sub_total: mainTotal > 0 ? mainTotal : null,
      optional_scope_total: optionalTotal > 0 ? optionalTotal : null,
      original_line_items_total: mainItems.reduce((s, i) => s + (i.total_price ?? 0), 0),
      parser_primary: "v2",
      parser_fallback_reason: null,
      parser_v1_total: null,
      parser_v2_confidence: finalRecord?.confidence ?? null,
      parser_v2_review_status: finalRecord?.review_status ?? null,
      parser_v2_comparison_safe: finalRecord?.comparison_safe ?? null,
      parser_v2_quote_type: finalRecord?.quote_type ?? null,
      parser_v2_total_ex_gst: finalRecord?.quote_total_ex_gst ?? null,
      parser_v2_total_inc_gst: finalRecord?.quote_total_inc_gst ?? null,
      parser_v2_optional_total: finalRecord?.optional_total ?? null,
      passive_fire_final: finalRecord,
      parse_status: "success",
      parsed_at: new Date().toISOString(),
    }).eq("id", quoteId);

    const parseMetadata = {
      parser_strategy: "parser_v2_only",
      parser_version: "v2",
      entry_point: "process_parsing_job",
      build_version: BUILD_VERSION,
      parser_used: "parser_v2(gpt-4.1)",
      parser_primary: "v2",
      parser_fallback_reason: null,
      trade,
      extractor_used: v2.telemetry.extractor_used,
      v2_duration_ms: v2DurationMs,
      classification: v2.classification,
      totals_ok: v2.validation.totals_ok,
      line_math_ok: v2.validation.line_math_ok,
      missing_rows: v2.validation.missing_rows,
      anomalies: v2.validation.anomalies,
      requires_review: v2.requires_review,
      grand_total: grandTotal,
      main_total: mainTotal,
      optional_total: optionalTotal,
      excluded_count: excludedItems.length,
      item_count: v2.items.length,
    };

    const v2PersistOutput = {
      failed: false,
      confidence: finalRecord?.confidence ?? null,
      review_status: finalRecord?.review_status ?? null,
      comparison_safe: finalRecord?.comparison_safe ?? null,
      quote_type: finalRecord?.quote_type ?? null,
      requires_review: v2.requires_review,
      quote_total_ex_gst: finalRecord?.quote_total_ex_gst ?? null,
      quote_total_inc_gst: finalRecord?.quote_total_inc_gst ?? null,
      optional_total: finalRecord?.optional_total ?? null,
      root_cause: finalRecord?.root_cause ?? null,
      review_reason: finalRecord?.review_reason ?? null,
      main_total: v2.totals.main_total,
      grand_total: v2.totals.grand_total,
      resolution_source: v2.totals.resolution_source,
      anomalies: v2.validation.anomalies,
      extractor_used: v2.telemetry.extractor_used,
      total_duration_ms: v2.telemetry.total_duration_ms,
      classification: v2.classification,
      items_count: v2.items.length,
    };

    const combinedStages = [
      ...outerTracker.snapshot(),
      ...(v2.telemetry.stages ?? []),
    ];

    const finalizeMs = Date.now() - finalizeStart;
    const totalRuntimeMs = Date.now() - requestStart;
    successCommittedAt = new Date().toISOString();
    const terminalStatus = slowFinalize ? "success_slow_finalize" : "completed";
    const terminalStageLabel = slowFinalize
      ? "Completed successfully (slow finalize)"
      : "Completed";

    await supabase.from("parsing_jobs").update({
      status: terminalStatus,
      progress: 100,
      current_stage: terminalStageLabel,
      quote_id: quoteId,
      result_data: {
        ...parseMetadata,
        slow_finalize: slowFinalize,
        pure_parsing_ms: v2DurationMs,
        finalize_ms: finalizeMs,
        total_runtime_ms: totalRuntimeMs,
        timeout_fired_at: timeoutFiredAt,
      },
      metadata: parseMetadata,
      parser_v2_output: v2PersistOutput,
      pipeline_stages: combinedStages,
      final_parser_used: "parser_v2(gpt-4.1)",
      last_error: null,
      last_error_code: null,
      completed_at: successCommittedAt,
      success_committed_at: successCommittedAt,
      timeout_fired_at: timeoutFiredAt,
      last_stage_completed_at: successCommittedAt,
      pure_parsing_ms: v2DurationMs,
      finalize_ms: finalizeMs,
      total_runtime_ms: totalRuntimeMs,
      updated_at: successCommittedAt,
    }).eq("id", jobId);

    console.log(
      `[PIPELINE_END] V2 success job=${jobId} quote=${quoteId} items=${v2.items.length} total=${mainTotal} status=${terminalStatus} slow=${slowFinalize}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        slowFinalize,
        status: terminalStatus,
        jobId,
        quoteId,
        itemCount: v2.items.length,
        parserUsed: "parser_v2(gpt-4.1)",
        grandTotal,
        mainTotal,
        confidence: finalRecord?.confidence ?? null,
        timing: {
          pure_parsing_ms: v2DurationMs,
          finalize_ms: finalizeMs,
          total_runtime_ms: totalRuntimeMs,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    console.error("[PIPELINE] Fatal error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    outerTracker.failAllInFlight(error);
    if (jobId) {
      try {
        await supabase.from("parsing_jobs").update({
          status: "failed",
          current_stage: "Failed — Fatal Error",
          error_message: msg,
          last_error: msg,
          last_error_code: "fatal_error",
          parser_v2_output: buildFailureReport("parser_v2_exception", msg),
          pipeline_stages: outerTracker.snapshot(),
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      } catch (_) { /* ignore */ }
    }
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------------------------------------------------------------------------
// Failure persistence — never silently falls back to V1.
// Writes the failure report to:
//   - parsing_jobs.parser_v2_output  (full structured report for the UI)
//   - parsing_jobs.metadata          (summary for dashboards)
//   - quotes.passive_fire_final      (so Parser Report under the quote shows it)
//   - quotes.parser_primary = 'v2_failed'
// ---------------------------------------------------------------------------
async function persistFailure(
  supabase: ReturnType<typeof createClient>,
  typedJob: ParsingJob,
  jobId: string,
  report: V2FailureReport,
  v2: ParserV2Output | null = null,
  stages: StageRecord[] = [],
  timing: {
    parserStartedAt?: string | null;
    timeoutFiredAt?: string | null;
    pureParsingMs?: number | null;
    totalRuntimeMs?: number | null;
  } = {},
): Promise<void> {
  // Belt & braces: never overwrite a committed success. If another write path
  // already committed this job as success (or success_slow_finalize), leave
  // it alone.
  try {
    const { data: existing } = await supabase
      .from("parsing_jobs")
      .select("status, success_committed_at")
      .eq("id", jobId)
      .maybeSingle();
    if (
      existing?.success_committed_at ||
      existing?.status === "completed" ||
      existing?.status === "success_slow_finalize"
    ) {
      console.warn(
        `[persistFailure] skipping — job ${jobId} already committed as ${existing?.status}`,
      );
      return;
    }
  } catch (_) {
    /* proceed to write failure */
  }

  const trade = typedJob.trade || "passive_fire";

  // Ensure a quote exists so the UI can display the Parser Report
  let quoteId = typedJob.quote_id;
  if (!quoteId) {
    try {
      const { data: newQuote } = await supabase.from("quotes").insert({
        project_id: typedJob.project_id,
        supplier_name: typedJob.supplier_name,
        organisation_id: typedJob.organisation_id,
        status: "failed",
        total_amount: 0,
        total_price: 0,
        created_by: typedJob.user_id,
        revision_number: 1,
        trade,
      }).select("id").single();
      quoteId = newQuote?.id ?? null;
    } catch (err) {
      console.error("[FAIL] failed to create placeholder quote", err);
    }
  }

  const failurePassiveFireFinal = {
    failed: true,
    stage: report.stage,
    message: report.message,
    details: report.details ?? null,
    timestamp: report.timestamp,
    extractor_used: v2?.telemetry.extractor_used ?? null,
    classification: v2?.classification ?? null,
    anomalies: v2?.validation.anomalies ?? [],
  };

  if (quoteId) {
    await supabase.from("quotes").update({
      parser_primary: "v2_failed",
      parser_fallback_reason: `${report.stage}: ${report.message}`.slice(0, 500),
      parser_v2_confidence: null,
      parser_v2_review_status: "manual_review_required",
      parser_v2_comparison_safe: false,
      parser_v2_quote_type: v2?.classification.quoteType.quoteType ?? null,
      parser_v2_total_ex_gst: null,
      parser_v2_total_inc_gst: null,
      parser_v2_optional_total: null,
      passive_fire_final: failurePassiveFireFinal,
      resolution_source: "parser_v2_failed",
      resolution_confidence: "LOW",
      parse_status: "failed",
      updated_at: new Date().toISOString(),
    }).eq("id", quoteId);
  }

  const metadata = {
    parser_strategy: "parser_v2_only",
    parser_version: "v2",
    parser_primary: "v2_failed",
    parser_fallback_reason: `${report.stage}: ${report.message}`.slice(0, 500),
    build_version: BUILD_VERSION,
    trade,
    v2_failure: failurePassiveFireFinal,
  };

  const failurePatch: Record<string, unknown> = {
    status: "failed",
    progress: 100,
    current_stage: `Failed — ${report.stage}`,
    quote_id: quoteId,
    metadata,
    result_data: metadata,
    parser_v2_output: failurePassiveFireFinal,
    pipeline_stages: stages,
    final_parser_used: "parser_v2_failed",
    error_message: report.message,
    last_error: report.message,
    last_error_code: report.stage,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (timing.parserStartedAt) failurePatch.parser_started_at = timing.parserStartedAt;
  if (timing.timeoutFiredAt) failurePatch.timeout_fired_at = timing.timeoutFiredAt;
  if (timing.pureParsingMs != null) failurePatch.pure_parsing_ms = timing.pureParsingMs;
  if (timing.totalRuntimeMs != null) failurePatch.total_runtime_ms = timing.totalRuntimeMs;

  await supabase.from("parsing_jobs").update(failurePatch).eq("id", jobId);
}
