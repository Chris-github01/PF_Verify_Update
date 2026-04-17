import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { runParserV3 } from "../_shared/parserRouterV3.ts";

// =============================================================================
// VALIDATE PARSER — Phase 3 dry-run endpoint
//
// Accepts a file upload + expected values.
// Runs runParserV3 WITHOUT writing any quotes or quote_items.
// Returns full diagnostics for the comparison panel.
// Optionally persists result to parser_validation_runs if org context provided.
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function extractPdfPages(arrayBuffer: ArrayBuffer): Promise<{ pages: { pageNum: number; text: string }[]; rawText: string }> {
  try {
    const uint8 = new Uint8Array(arrayBuffer);
    const base64 = btoa(String.fromCharCode(...uint8));

    // Use pdfjs-dist via CDN compatible with Deno edge
    // Inline text extraction without worker (edge compatible)
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
    const rows: (string | number | null)[][] = utils.sheet_to_json(sheet, { header: 1, defval: null });
    return rows;
  } catch (err) {
    console.error("[validate_parser] Spreadsheet extraction failed:", err);
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const expectedFamily = String(formData.get("expectedFamily") ?? "");
    const expectedTotalRaw = String(formData.get("expectedTotal") ?? "0");
    const expectedTotal = parseFloat(expectedTotalRaw.replace(/[$,]/g, "")) || 0;
    const organisationId = String(formData.get("organisationId") ?? "");
    const persist = formData.get("persist") === "true";

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const arrayBuffer = await file.arrayBuffer();

    const start = Date.now();

    // Extract content by file type
    let pages: { pageNum: number; text: string }[] = [];
    let rawText = "";
    let spreadsheetRows: (string | number | null | undefined)[][] | undefined;

    if (ext === "pdf") {
      const extracted = await extractPdfPages(arrayBuffer);
      pages = extracted.pages;
      rawText = extracted.rawText;
    } else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      spreadsheetRows = await extractSpreadsheetRows(arrayBuffer);
      rawText = spreadsheetRows.map(r => r.join("\t")).join("\n");
    } else {
      const decoder = new TextDecoder();
      rawText = decoder.decode(arrayBuffer);
      pages = [{ pageNum: 1, text: rawText }];
    }

    // Run parser V3 — dry run, no DB writes
    const v3Result = runParserV3({ pages, rawText, fileExtension: ext, spreadsheetRows });
    const { resolution, classification, durationMs } = v3Result;

    const parsedTotal = resolution.totals.grandTotal;
    const optionalTotal = resolution.totals.optionalTotal;
    const itemCount = resolution.baseItems.length + resolution.optionalItems.length;
    const variance = Math.abs(parsedTotal - expectedTotal);
    const variancePct = expectedTotal > 0 ? (variance / expectedTotal) * 100 : null;
    const pass = variancePct !== null ? variancePct < 1 : null;

    const diagnostics = {
      // Classification
      document_class: classification.documentClass,
      commercial_family: classification.commercialFamily,
      confidence: classification.confidence,
      classifier_reasons: classification.reasons,
      signals: classification.signals,

      // Parser
      parser_used: resolution.parserUsed,
      total_source: resolution.totals.source,
      warnings: resolution.validation.warnings,
      validation_risk: resolution.validation.risk,
      parser_reasons: resolution.debug.parserReasons,

      // Totals
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

      // Comparison
      expected_family: expectedFamily,
      expected_total: expectedTotal,
      variance,
      variance_pct: variancePct,
      pass,

      // Meta
      filename,
      file_extension: ext,
      duration_ms: durationMs,
    };

    // Optionally persist to parser_validation_runs
    if (persist && organisationId) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
        const { data: { user } } = await supabaseAnon.auth.getUser(authHeader.replace("Bearer ", ""));

        await supabase.from("parser_validation_runs").insert({
          filename,
          file_extension: ext,
          expected_family: expectedFamily,
          expected_total: expectedTotal,
          detected_family: classification.commercialFamily,
          detected_document_class: classification.documentClass,
          detected_parser_used: resolution.parserUsed,
          parsed_total: parsedTotal,
          optional_total: optionalTotal,
          item_count: itemCount,
          confidence: classification.confidence,
          total_source: resolution.totals.source,
          warnings: resolution.validation.warnings,
          validation_risk: resolution.validation.risk,
          organisation_id: organisationId,
          user_id: user?.id ?? null,
          raw_diagnostics: diagnostics,
        });
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
