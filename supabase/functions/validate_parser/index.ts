import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { runParserV3 } from "../_shared/parserRouterV3.ts";

// =============================================================================
// VALIDATE PARSER — Phase 3 QA Framework
//
// Modes:
//   single  — dry-run a single uploaded file, full ground truth comparison
//   batch   — run all active golden benchmarks for an org, return scorecard
//   shadow  — compare current production result vs candidate re-run for a quoteId
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---------------------------------------------------------------------------
// Error categorisation — deterministic, no LLM
// ---------------------------------------------------------------------------

type ErrorCategory =
  | "wrong_family_selected"
  | "total_extraction_failed"
  | "optional_contamination"
  | "exclusions_counted"
  | "duplicate_inflation"
  | "row_parse_low_quality"
  | "ocr_low_quality"
  | "fallback_used"
  | null;

interface GroundTruth {
  expectedFamily: string;
  expectedTotal: number;
  expectedOptionalTotal: number;
  expectedItemCountMin: number | null;
  expectedItemCountMax: number | null;
  expectedHasOptional: boolean | null;
  expectedHasExclusions: boolean | null;
}

interface ActualResult {
  commercialFamily: string;
  parsedTotal: number;
  optionalTotal: number;
  itemCount: number;
  itemCountExcluded: number;
  validationRisk: string;
  parserUsed: string;
  confidence: number;
  summaryDetected: boolean;
}

function categoriseError(gt: GroundTruth, actual: ActualResult): ErrorCategory {
  if (gt.expectedFamily && actual.commercialFamily !== gt.expectedFamily) {
    return "wrong_family_selected";
  }

  if (actual.parserUsed?.includes("fallback") || actual.parserUsed?.includes("lump_sum")) {
    if (gt.expectedFamily && gt.expectedFamily !== "lump_sum_quote") {
      return "fallback_used";
    }
  }

  if (actual.confidence < 0.35 && actual.commercialFamily === "scanned_ocr_quote") {
    return "ocr_low_quality";
  }

  if (gt.expectedTotal > 0) {
    const variance = Math.abs(actual.parsedTotal - gt.expectedTotal) / gt.expectedTotal;
    if (variance > 0.01) {
      if (gt.expectedHasOptional === false && actual.optionalTotal > 0) {
        return "optional_contamination";
      }
      if (actual.parsedTotal > gt.expectedTotal * 1.05) {
        if (actual.itemCountExcluded === 0 && gt.expectedHasExclusions) {
          return "exclusions_counted";
        }
        return "duplicate_inflation";
      }
      if (actual.parsedTotal === 0 || !actual.summaryDetected) {
        return "total_extraction_failed";
      }
      return "row_parse_low_quality";
    }
  }

  if (
    gt.expectedItemCountMin !== null &&
    gt.expectedItemCountMax !== null &&
    (actual.itemCount < gt.expectedItemCountMin || actual.itemCount > gt.expectedItemCountMax)
  ) {
    if (actual.itemCount > gt.expectedItemCountMax * 1.3) {
      return "duplicate_inflation";
    }
    return "row_parse_low_quality";
  }

  if (gt.expectedHasOptional === true && actual.optionalTotal === 0) {
    return "optional_contamination";
  }

  return null;
}

// ---------------------------------------------------------------------------
// File extraction helpers
// ---------------------------------------------------------------------------

async function extractPdfPages(arrayBuffer: ArrayBuffer): Promise<{ pages: { pageNum: number; text: string }[]; rawText: string }> {
  try {
    const uint8 = new Uint8Array(arrayBuffer);
    const { getDocument } = await import("npm:pdfjs-dist@4.9.155/legacy/build/pdf.mjs");
    const pdf = await getDocument({ data: uint8, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
    const pages: { pageNum: number; text: string }[] = [];
    let rawText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
      pages.push({ pageNum: i, text: pageText });
      rawText += pageText + "\n\n";
    }
    return { pages, rawText };
  } catch (err) {
    console.error("[validate_parser] PDF extraction failed:", err);
    return { pages: [{ pageNum: 1, text: "" }], rawText: "" };
  }
}

async function extractSpreadsheetRows(arrayBuffer: ArrayBuffer): Promise<(string | number | null)[][]> {
  try {
    const { read, utils } = await import("npm:xlsx@0.18.5");
    const workbook = read(new Uint8Array(arrayBuffer), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return utils.sheet_to_json(sheet, { header: 1, defval: null }) as (string | number | null)[][];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Core parse + compare — used by all modes
// ---------------------------------------------------------------------------

function buildDiagnostics(
  filename: string,
  ext: string,
  gt: GroundTruth,
  resolution: any,
  classification: any,
  durationMs: number,
) {
  const parsedTotal = resolution.totals.grandTotal;
  const optionalTotal = resolution.totals.optionalTotal;
  const itemCount = resolution.baseItems.length + resolution.optionalItems.length;
  const variance = Math.abs(parsedTotal - gt.expectedTotal);
  const variancePct = gt.expectedTotal > 0 ? (variance / gt.expectedTotal) * 100 : null;
  const totalPass = variancePct !== null ? variancePct < 1 : null;

  const itemCountOk =
    gt.expectedItemCountMin !== null && gt.expectedItemCountMax !== null
      ? itemCount >= gt.expectedItemCountMin && itemCount <= gt.expectedItemCountMax
      : null;

  const optionalPass =
    gt.expectedOptionalTotal > 0
      ? Math.abs(optionalTotal - gt.expectedOptionalTotal) / gt.expectedOptionalTotal < 0.05
      : null;

  const hasOptionalPass =
    gt.expectedHasOptional !== null
      ? (resolution.optionalItems.length > 0) === gt.expectedHasOptional
      : null;

  const pass = totalPass !== false && itemCountOk !== false && hasOptionalPass !== false
    ? (totalPass ?? true)
    : false;

  const actual: ActualResult = {
    commercialFamily: classification.commercialFamily,
    parsedTotal,
    optionalTotal,
    itemCount,
    itemCountExcluded: resolution.excludedItems.length,
    validationRisk: resolution.validation.risk,
    parserUsed: resolution.parserUsed,
    confidence: classification.confidence,
    summaryDetected: resolution.debug.summaryDetected,
  };

  const errorCategory = pass ? null : categoriseError(gt, actual);

  return {
    document_class: classification.documentClass,
    commercial_family: classification.commercialFamily,
    confidence: classification.confidence,
    classifier_reasons: classification.reasons,
    signals: classification.signals ?? {},
    parser_used: resolution.parserUsed,
    total_source: resolution.totals.source,
    warnings: resolution.validation.warnings,
    validation_risk: resolution.validation.risk,
    parser_reasons: resolution.debug.parserReasons,
    parsed_total: parsedTotal,
    optional_total: optionalTotal,
    row_sum: resolution.totals.rowSum,
    sub_total: resolution.totals.subTotal,
    item_count: itemCount,
    item_count_base: resolution.baseItems.length,
    item_count_optional: resolution.optionalItems.length,
    item_count_excluded: resolution.excludedItems.length,
    summary_detected: resolution.debug.summaryDetected,
    optional_scope_detected: resolution.debug.optionalScopeDetected,
    expected_family: gt.expectedFamily,
    expected_total: gt.expectedTotal,
    expected_optional_total: gt.expectedOptionalTotal,
    expected_item_count_min: gt.expectedItemCountMin,
    expected_item_count_max: gt.expectedItemCountMax,
    expected_has_optional: gt.expectedHasOptional,
    expected_has_exclusions: gt.expectedHasExclusions,
    variance,
    variance_pct: variancePct,
    pass,
    total_pass: totalPass,
    item_count_ok: itemCountOk,
    optional_pass: optionalPass,
    has_optional_pass: hasOptionalPass,
    error_category: errorCategory,
    filename,
    file_extension: ext,
    duration_ms: durationMs,
  };
}

async function runParserOnBuffer(
  buffer: ArrayBuffer,
  ext: string,
): Promise<{ resolution: any; classification: any; durationMs: number }> {
  let pages: { pageNum: number; text: string }[] = [];
  let rawText = "";
  let spreadsheetRows: (string | number | null | undefined)[][] | undefined;

  if (ext === "pdf") {
    const extracted = await extractPdfPages(buffer);
    pages = extracted.pages;
    rawText = extracted.rawText;
  } else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
    spreadsheetRows = await extractSpreadsheetRows(buffer);
    rawText = spreadsheetRows.map(r => r.join("\t")).join("\n");
  } else {
    rawText = new TextDecoder().decode(buffer);
    pages = [{ pageNum: 1, text: rawText }];
  }

  return runParserV3({ pages, rawText, fileExtension: ext, spreadsheetRows });
}

// ---------------------------------------------------------------------------
// Persist helper
// ---------------------------------------------------------------------------

async function persistRun(
  supabase: any,
  userId: string | null,
  organisationId: string,
  diag: ReturnType<typeof buildDiagnostics>,
  mode: string,
  batchId?: string,
  trade?: string | null,
) {
  await supabase.from("parser_validation_runs").insert({
    filename: diag.filename,
    file_extension: diag.file_extension,
    expected_family: diag.expected_family,
    expected_total: diag.expected_total,
    expected_optional_total: diag.expected_optional_total,
    expected_item_count_min: diag.expected_item_count_min,
    expected_item_count_max: diag.expected_item_count_max,
    expected_has_optional: diag.expected_has_optional,
    expected_has_exclusions: diag.expected_has_exclusions,
    detected_family: diag.commercial_family,
    detected_document_class: diag.document_class,
    detected_parser_used: diag.parser_used,
    parsed_total: diag.parsed_total,
    optional_total: diag.optional_total,
    item_count: diag.item_count,
    confidence: diag.confidence,
    total_source: diag.total_source,
    warnings: diag.warnings,
    validation_risk: diag.validation_risk,
    error_category: diag.error_category,
    run_mode: mode,
    batch_id: batchId ?? null,
    trade: trade ?? null,
    organisation_id: organisationId,
    user_id: userId,
    raw_diagnostics: diag,
  });
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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = user?.id ?? null;

    const contentType = req.headers.get("content-type") ?? "";

    // -------------------------------------------------------------------------
    // SHADOW MODE — JSON body, no file upload
    // -------------------------------------------------------------------------
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const mode = body.mode ?? "shadow";

      if (mode === "shadow") {
        const quoteId = String(body.quoteId ?? "");
        if (!quoteId) {
          return new Response(JSON.stringify({ error: "quoteId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: job } = await supabase
          .from("parsing_jobs")
          .select("metadata, filename, file_url")
          .eq("quote_id", quoteId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!job) {
          return new Response(JSON.stringify({ error: "No parsing job found for quoteId" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const currentResult = job.metadata ?? {};

        // Re-download and re-parse
        const { data: fileData, error: dlErr } = await supabase.storage
          .from("quote-files")
          .download(job.file_url);

        if (dlErr || !fileData) {
          return new Response(JSON.stringify({ error: "Could not download quote file" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const ext = (job.filename ?? "").split(".").pop()?.toLowerCase() ?? "pdf";
        const buffer = await (fileData as Blob).arrayBuffer();
        const { resolution, classification, durationMs } = await runParserOnBuffer(buffer, ext);

        const candidateResult = {
          document_class: classification.documentClass,
          commercial_family: classification.commercialFamily,
          confidence: classification.confidence,
          parser_used: resolution.parserUsed,
          parsed_total: resolution.totals.grandTotal,
          optional_total: resolution.totals.optionalTotal,
          item_count: resolution.baseItems.length + resolution.optionalItems.length,
          total_source: resolution.totals.source,
          validation_risk: resolution.validation.risk,
          warnings: resolution.validation.warnings,
          duration_ms: durationMs,
        };

        const diff: Record<string, { current: unknown; candidate: unknown; changed: boolean }> = {};
        const compareKeys = ["document_class", "commercial_family", "parser_used", "parsed_total", "optional_total", "total_source", "validation_risk"];
        for (const k of compareKeys) {
          const cur = currentResult[k] ?? null;
          const cand = (candidateResult as any)[k] ?? null;
          diff[k] = { current: cur, candidate: cand, changed: cur !== cand };
        }

        const changedCount = Object.values(diff).filter(d => d.changed).length;
        const totalDelta = Math.abs((candidateResult.parsed_total ?? 0) - (currentResult.grand_total ?? 0));

        return new Response(
          JSON.stringify({
            success: true,
            mode: "shadow",
            quoteId,
            current_result: currentResult,
            candidate_result: candidateResult,
            diff,
            summary: { changed_fields: changedCount, total_delta: totalDelta },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ error: "Unknown JSON mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // -------------------------------------------------------------------------
    // FORM DATA — single or batch
    // -------------------------------------------------------------------------
    const formData = await req.formData();
    const mode = String(formData.get("mode") ?? "single");
    const organisationId = String(formData.get("organisationId") ?? "");
    const persist = formData.get("persist") !== "false";

    // -------------------------------------------------------------------------
    // BATCH MODE
    // -------------------------------------------------------------------------
    if (mode === "batch") {
      if (!organisationId) {
        return new Response(JSON.stringify({ error: "organisationId required for batch mode" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: benchmarks } = await supabase
        .from("parser_golden_benchmarks")
        .select("*")
        .eq("organisation_id", organisationId)
        .eq("is_active", true);

      if (!benchmarks || benchmarks.length === 0) {
        return new Response(JSON.stringify({ success: true, mode: "batch", results: [], scorecard: null, message: "No active benchmarks registered" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const batchId = crypto.randomUUID();
      const results: Array<ReturnType<typeof buildDiagnostics>> = [];

      for (const bm of benchmarks) {
        try {
          const { data: fileData, error: dlErr } = await supabase.storage
            .from("parser-benchmarks")
            .download(bm.storage_path);

          if (dlErr || !fileData) {
            console.warn(`[batch] Could not download benchmark ${bm.id}: ${dlErr?.message}`);
            continue;
          }

          const ext = bm.filename.split(".").pop()?.toLowerCase() ?? "pdf";
          const buffer = await (fileData as Blob).arrayBuffer();
          const { resolution, classification, durationMs } = await runParserOnBuffer(buffer, ext);

          const gt: GroundTruth = {
            expectedFamily: bm.expected_family,
            expectedTotal: bm.expected_total,
            expectedOptionalTotal: bm.expected_optional_total ?? 0,
            expectedItemCountMin: bm.expected_item_count_min ?? null,
            expectedItemCountMax: bm.expected_item_count_max ?? null,
            expectedHasOptional: bm.expected_has_optional ?? null,
            expectedHasExclusions: bm.expected_has_exclusions ?? null,
          };

          const diag = buildDiagnostics(bm.filename, ext, gt, resolution, classification, durationMs);
          const diagWithMeta = { ...diag, benchmark_label: bm.label ?? bm.filename, trade: bm.trade ?? null };
          results.push(diagWithMeta as any);

          if (persist) {
            await persistRun(supabase, userId, organisationId, diagWithMeta as any, "batch", batchId, bm.trade ?? null);
          }
        } catch (bmErr) {
          console.error(`[batch] Failed benchmark ${bm.id}:`, bmErr);
        }
      }

      // Build scorecard
      const families = ["itemized_quote", "lump_sum_quote", "hybrid_quote", "spreadsheet_quote", "scanned_ocr_quote"];
      const familyAccuracy: Record<string, { pass: number; total: number; pct: number | null }> = {};
      for (const fam of families) {
        const famRuns = results.filter(r => r.expected_family === fam);
        const passed = famRuns.filter(r => r.pass).length;
        familyAccuracy[fam] = {
          pass: passed,
          total: famRuns.length,
          pct: famRuns.length > 0 ? Math.round((passed / famRuns.length) * 100) : null,
        };
      }

      const totalPass = results.filter(r => r.pass).length;
      const overallAccuracy = results.length > 0 ? Math.round((totalPass / results.length) * 100) : null;
      const avgVariance = results.filter(r => r.variance_pct !== null).reduce((s, r) => s + (r.variance_pct ?? 0), 0) / (results.filter(r => r.variance_pct !== null).length || 1);
      const optionalRuns = results.filter(r => r.has_optional_pass !== null);
      const optionalAccuracy = optionalRuns.length > 0 ? Math.round((optionalRuns.filter(r => r.has_optional_pass).length / optionalRuns.length) * 100) : null;

      const errorCounts: Record<string, number> = {};
      for (const r of results) {
        if (r.error_category) errorCounts[r.error_category] = (errorCounts[r.error_category] ?? 0) + 1;
      }
      const topFailures = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cat, count]) => ({ category: cat, count }));

      const trades = ["passive_fire", "plumbing", "electrical", "carpentry", "hvac", "active_fire"];
      const tradeAccuracy: Record<string, { pass: number; total: number; pct: number | null }> = {};
      for (const tr of trades) {
        const trRuns = (results as any[]).filter((r: any) => r.trade === tr);
        const trPassed = trRuns.filter((r: any) => r.pass).length;
        tradeAccuracy[tr] = {
          pass: trPassed,
          total: trRuns.length,
          pct: trRuns.length > 0 ? Math.round((trPassed / trRuns.length) * 100) : null,
        };
      }

      const scorecard = {
        overall_accuracy: overallAccuracy,
        total_pass: totalPass,
        total_runs: results.length,
        family_accuracy: familyAccuracy,
        trade_accuracy: tradeAccuracy,
        optional_separation_accuracy: optionalAccuracy,
        avg_variance_pct: parseFloat(avgVariance.toFixed(2)),
        top_failure_causes: topFailures,
        batch_id: batchId,
      };

      return new Response(
        JSON.stringify({ success: true, mode: "batch", results, scorecard, batch_id: batchId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -------------------------------------------------------------------------
    // SINGLE MODE (default)
    // -------------------------------------------------------------------------
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const buffer = await file.arrayBuffer();

    const gt: GroundTruth = {
      expectedFamily: String(formData.get("expectedFamily") ?? ""),
      expectedTotal: parseFloat(String(formData.get("expectedTotal") ?? "0").replace(/[$,]/g, "")) || 0,
      expectedOptionalTotal: parseFloat(String(formData.get("expectedOptionalTotal") ?? "0").replace(/[$,]/g, "")) || 0,
      expectedItemCountMin: formData.get("expectedItemCountMin") ? parseInt(String(formData.get("expectedItemCountMin"))) : null,
      expectedItemCountMax: formData.get("expectedItemCountMax") ? parseInt(String(formData.get("expectedItemCountMax"))) : null,
      expectedHasOptional: formData.get("expectedHasOptional") === "" ? null : formData.get("expectedHasOptional") === "true",
      expectedHasExclusions: formData.get("expectedHasExclusions") === "" ? null : formData.get("expectedHasExclusions") === "true",
    };

    const { resolution, classification, durationMs } = await runParserOnBuffer(buffer, ext);
    const diagnostics = buildDiagnostics(filename, ext, gt, resolution, classification, durationMs);

    if (persist && organisationId) {
      try {
        await persistRun(supabase, userId, organisationId, diagnostics, "manual");
      } catch (persistErr) {
        console.error("[validate_parser] Failed to persist run:", persistErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, diagnostics }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[validate_parser] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
