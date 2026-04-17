import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { cleanText, extractFRRFromDescription } from "../_shared/itemNormalizer.ts";
import { runParserV3 } from "../_shared/parserRouterV3.ts";

// =============================================================================
// PROCESS PARSING JOB — V3 CANONICAL PARSER
//
// Single production flow:
//   1. Download file
//   2. Extract raw text / pages
//   3. runParserV3 (classify → route → resolve)
//   4. Save quote + quote_items
//   5. Write parse metadata
//
// NO other parser paths. No feature flags. No fallbacks to old parsers.
// If v3 returns empty, job is marked parsing_failed with diagnostics.
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

    console.log(`[PIPELINE_START] job_id=${jobId} file=${typedJob.filename} trade=${typedJob.trade || "unset"} supplier=${typedJob.supplier_name}`);

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
      .update({ progress: 25, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // -------------------------------------------------------------------------
    // Step 2: Extract raw text / pages
    // -------------------------------------------------------------------------
    let allPages: { pageNum: number; text: string }[] = [];
    let spreadsheetRows: (string | number | null | undefined)[][] | undefined;
    let fileExtension: string | undefined;

    if (fileName.endsWith(".pdf")) {
      fileExtension = "pdf";
      console.log(`[V3] Extracting PDF text with pdfjs...`);

      const pdfjsLib = await import("npm:pdfjs-dist@4.0.379");
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(fileBuffer),
        useWorkerFetch: false,
        isEvalSupported: false,
        useSystemFonts: true,
      });

      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;
      console.log(`[V3] PDF has ${numPages} pages`);

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
      console.log(`[V3] Extracting Excel file...`);

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

    console.log(`[STEP_1_EXTRACT] pages=${allPages.length} chars=${allPages.reduce((s, p) => s + p.text.length, 0)} file_type=${fileExtension}`);

    await supabase
      .from("parsing_jobs")
      .update({ progress: 50, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // -------------------------------------------------------------------------
    // Step 3: Run V3 parser (classify → route → resolve)
    // -------------------------------------------------------------------------
    const rawText = allPages.map((p) => p.text).join("\n\n");
    console.log(`[V3] Running parser on ${allPages.length} pages, ${rawText.length} chars`);

    const v3Result = runParserV3({
      pages: allPages,
      rawText,
      fileExtension,
      spreadsheetRows,
    });

    const { resolution, classification, durationMs } = v3Result;

    console.log(`[STEP_2_CLASSIFY] document_class=${classification.documentClass} confidence=${classification.confidence.toFixed(2)} reasons=${JSON.stringify(classification.reasons)}`);
    console.log(`[STEP_3_ROUTE] parser_used=${resolution.parserUsed}`);
    console.log(`[STEP_4_PARSE_RESULT] base_items=${resolution.baseItems.length} optional_items=${resolution.optionalItems.length} excluded_items=${resolution.excludedItems.length} base_total=${resolution.totals.rowSum.toFixed(2)} optional_total=${resolution.totals.optionalTotal.toFixed(2)} grand_total=${resolution.totals.grandTotal.toFixed(2)} total_source=${resolution.totals.source} validation_risk=${resolution.validation.risk} duration_ms=${durationMs}`);

    // -------------------------------------------------------------------------
    // Step 4: Fail fast if v3 produced nothing usable
    // -------------------------------------------------------------------------
    const hasItems = resolution.baseItems.length > 0 || resolution.optionalItems.length > 0;
    const hasTotal = resolution.totals.grandTotal > 0;

    // Case A: nothing at all
    // Case B: summary total found but zero rows parsed — forensic failure
    const zeroItemsWithTotal = !hasItems && hasTotal;
    const completelyEmpty = !hasItems && !hasTotal;

    if (completelyEmpty || zeroItemsWithTotal) {
      const failureReason = completelyEmpty
        ? "V3 parser returned no items and no total"
        : "Parser found summary total but extracted 0 line items — row detection failed";

      const failureCode = zeroItemsWithTotal
        ? (resolution.debug.parserReasons.find(r => r.startsWith("failure_code="))?.replace("failure_code=", "") ?? "regex_no_matches")
        : "no_items_no_total";

      const diagnostics = {
        parser_version: "v3",
        document_class: classification.documentClass,
        classifier_confidence: classification.confidence,
        classifier_reasons: classification.reasons,
        parser_used: resolution.parserUsed,
        validation_risk: resolution.validation.risk,
        validation_warnings: resolution.validation.warnings,
        duration_ms: durationMs,
        failure_reason: failureReason,
        failure_code: failureCode,
        parser_reasons: resolution.debug.parserReasons,
        grand_total_found: resolution.totals.grandTotal,
        total_source: resolution.totals.source,
      };

      console.error(`[V3] parsing_failed — ${failureReason}. diagnostics:`, JSON.stringify(diagnostics));

      await supabase
        .from("parsing_jobs")
        .update({
          status: "failed",
          error_message: failureReason,
          metadata: diagnostics,
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
    // Step 5: Create or update quote record
    // ONE module writes quote totals — this block only.
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
      console.log(`[V3] Updated existing quote ${quoteData.id}`);
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
      console.log(`[V3] Created new quote ${quoteData.id} rev=${revisionNumber}`);
    }

    // -------------------------------------------------------------------------
    // Step 6: Save quote_items (base + optional)
    // ONE module writes quote_items — this block only.
    // -------------------------------------------------------------------------
    if (typedJob.quote_id) {
      await supabase.from("quote_items").delete().eq("quote_id", quoteData.id);
    }

    const mapItem = (item: any, scopeCategory: "Main" | "Optional") => ({
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

    console.log(`[STEP_5_SAVE] quote_id=${quoteData.id} saved_total=${canonicalTotal} items_saved=${allQuoteItems.length} main=${mainQuoteItems.length} optional=${optionalQuoteItems.length}`);
    console.log(`[V3] Saved ${mainQuoteItems.length} main + ${optionalQuoteItems.length} optional items`);

    // -------------------------------------------------------------------------
    // Step 7: Update quote with canonical totals and metadata
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
    // Step 8: Write parse metadata to parsing_job
    // -------------------------------------------------------------------------
    const parseMetadata = {
      parser_version: "v3",
      document_class: classification.documentClass,
      parser_used: resolution.parserUsed,
      total_source: resolution.totals.source,
      confidence: classification.confidence,
      warnings: resolution.validation.warnings,
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
      duration_ms: durationMs,
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
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    console.log(`[PIPELINE_END] status=success job_id=${jobId} quote_id=${quoteData.id} parser_version=v3 document_class=${classification.documentClass} parser_used=${resolution.parserUsed} grand_total=${canonicalTotal} total_source=${resolution.totals.source} validation_risk=${resolution.validation.risk} items=${allQuoteItems.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        quoteId: quoteData.id,
        itemCount: allQuoteItems.length,
        parserVersion: "v3",
        documentClass: classification.documentClass,
        parserUsed: resolution.parserUsed,
        totalSource: resolution.totals.source,
        grandTotal: canonicalTotal,
        validationRisk: resolution.validation.risk,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[V3] Fatal error:", error);

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
