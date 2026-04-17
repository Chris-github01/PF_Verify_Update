import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getUserIdFromRequest } from "./_shared/auth.ts";
import { sanitizePlumbingItems } from "../_shared/plumbingSanitizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  text: string;
  pages: PageResult[];
  extraction_method: "pdfplumber" | "pymupdf" | "ocr" | "vision";
  diagnostics: ExtractionDiagnostics;
  page_count: number;
  confidence: number;
  tables?: unknown[];
  filename?: string;
}

export interface PageResult {
  page_number: number;
  text: string;
  has_tables: boolean;
}

export interface ExtractionDiagnostics {
  python_service_available: boolean;
  fallback_reason?: string;
  raw_text_length: number;
  tables_found: number;
  ocr_used: boolean;
  vision_used: boolean;
  warnings: string[];
}

export interface ExtractQuoteDocumentOptions {
  file: File;
  fileBuffer: ArrayBuffer;
  pythonServiceUrl: string;
  pythonServiceApiKey: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

// ---------------------------------------------------------------------------
// Text cleanup helpers
// ---------------------------------------------------------------------------

/**
 * Remove obvious OCR garbage lines while preserving row boundaries,
 * table spacing, and headings.
 */
function cleanExtractedText(raw: string): string {
  const lines = raw.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Preserve blank lines — they encode table row / section boundaries
    if (trimmed.trim() === "") {
      kept.push("");
      continue;
    }

    // Drop lines that are pure OCR noise:
    // - only punctuation / special chars (no alphanumerics)
    if (/^[^a-zA-Z0-9$.,\-/()%]+$/.test(trimmed.trim())) continue;

    // - very short non-numeric fragments that are likely garbage
    if (trimmed.trim().length <= 2 && !/^\d+$/.test(trimmed.trim())) continue;

    // - repeated identical non-word chars (e.g. "||||||||")
    if (/^(.)\1{4,}$/.test(trimmed.trim())) continue;

    kept.push(trimmed);
  }

  // Collapse runs of 3+ blank lines into 2 blank lines (preserve section gaps)
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Normalize whitespace inside a line while keeping column spacing intent.
 * Collapses interior spaces but does not strip the line.
 */
function normalizeLineWhitespace(text: string): string {
  return text
    .replace(/\u00A0/g, " ")       // non-breaking space → regular space
    .replace(/\t/g, "    ")         // tab → 4 spaces (preserve column alignment)
    .replace(/ {5,}/g, "    ");     // collapse very large gaps to 4 spaces
}

// ---------------------------------------------------------------------------
// Python service extraction
// ---------------------------------------------------------------------------

async function extractViaPythonService(
  fileBuffer: ArrayBuffer,
  file: File,
  pythonServiceUrl: string,
  pythonServiceApiKey: string,
): Promise<ExtractionResult | null> {
  try {
    const fileBlob = new Blob([fileBuffer], { type: file.type });
    const fileForExtractor = new File([fileBlob], file.name, { type: file.type });

    const form = new FormData();
    form.append("file", fileForExtractor);

    console.log("[Extractor] Calling Python service:", `${pythonServiceUrl}/parse/ensemble`);

    const resp = await fetch(`${pythonServiceUrl}/parse/ensemble`, {
      method: "POST",
      headers: { "X-API-Key": pythonServiceApiKey },
      body: form,
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.warn(`[Extractor] Python service HTTP ${resp.status}:`, body);
      return null;
    }

    const data = await resp.json();

    if (!data.text || data.text.length === 0) {
      console.warn("[Extractor] Python service returned empty text");
      return null;
    }

    const rawText: string = data.text;
    const cleanedText = cleanExtractedText(normalizeLineWhitespace(rawText));

    const method: ExtractionResult["extraction_method"] =
      data.extraction_method === "ocr" ? "ocr" :
      data.extraction_method === "pymupdf" ? "pymupdf" :
      "pdfplumber";

    const pages: PageResult[] = Array.isArray(data.pages)
      ? data.pages.map((p: any, i: number) => ({
          page_number: p.page_number ?? i + 1,
          text: cleanExtractedText(normalizeLineWhitespace(p.text ?? "")),
          has_tables: Array.isArray(p.tables) && p.tables.length > 0,
        }))
      : [];

    return {
      text: cleanedText,
      pages,
      extraction_method: method,
      diagnostics: {
        python_service_available: true,
        raw_text_length: rawText.length,
        tables_found: data.tables?.length ?? 0,
        ocr_used: method === "ocr",
        vision_used: false,
        warnings: [],
      },
      page_count: data.num_pages ?? pages.length ?? 1,
      confidence: data.confidence ?? 0.85,
      tables: data.tables ?? [],
      filename: data.filename ?? file.name,
    };
  } catch (err: any) {
    console.warn("[Extractor] Python service threw:", err?.message ?? err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Vision (OpenAI) fallback
// ---------------------------------------------------------------------------

async function extractViaVision(
  fileBuffer: ArrayBuffer,
  file: File,
  openaiApiKey: string,
  openaiModel = "gpt-4o",
): Promise<ExtractionResult> {
  console.log("[Extractor] Using OpenAI Vision fallback, model:", openaiModel);

  const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Extract ALL text from this PDF quote exactly as it appears.",
                "Preserve table structure using spaces/tabs between columns.",
                "Preserve line breaks between rows.",
                "Preserve section headings.",
                "Do NOT summarise or reformat.",
                "Return the raw extracted text only.",
              ].join(" "),
            },
            {
              type: "image_url",
              image_url: { url: `data:application/pdf;base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 16000,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenAI Vision API error ${resp.status}: ${body}`);
  }

  const result = await resp.json();
  const rawText: string = result.choices?.[0]?.message?.content ?? "";
  const cleanedText = cleanExtractedText(normalizeLineWhitespace(rawText));

  return {
    text: cleanedText,
    pages: [
      {
        page_number: 1,
        text: cleanedText,
        has_tables: false,
      },
    ],
    extraction_method: "vision",
    diagnostics: {
      python_service_available: false,
      fallback_reason: "Python service unavailable — used OpenAI Vision",
      raw_text_length: rawText.length,
      tables_found: 0,
      ocr_used: false,
      vision_used: true,
      warnings: ["Text extracted via vision model; table alignment may differ from source."],
    },
    page_count: 1,
    confidence: 0.70,
    tables: [],
    filename: file.name,
  };
}

// ---------------------------------------------------------------------------
// Public extraction engine
// ---------------------------------------------------------------------------

/**
 * extractQuoteDocument
 *
 * Shared extraction engine for the whole parser system.
 * Priority order:
 *   1. Python service (pdfplumber → pymupdf → OCR internally)
 *   2. OpenAI Vision fallback
 *
 * Returns a standard ExtractionResult shape suitable for downstream parsers.
 */
export async function extractQuoteDocument(
  opts: ExtractQuoteDocumentOptions,
): Promise<ExtractionResult> {
  const { file, fileBuffer, pythonServiceUrl, pythonServiceApiKey, openaiApiKey, openaiModel } = opts;

  console.log("[extractQuoteDocument] Starting extraction:", file.name, file.size, "bytes");

  // 1. Python service
  if (pythonServiceUrl && pythonServiceApiKey) {
    const result = await extractViaPythonService(
      fileBuffer,
      file,
      pythonServiceUrl,
      pythonServiceApiKey,
    );
    if (result) {
      console.log(
        `[extractQuoteDocument] Python service success — method=${result.extraction_method},`,
        `text=${result.text.length} chars, pages=${result.page_count}, tables=${result.diagnostics.tables_found}`,
      );
      return result;
    }
  }

  // 2. Vision fallback
  if (!openaiApiKey) {
    throw new Error(
      "Python PDF service unavailable and no OpenAI key configured — cannot extract document",
    );
  }

  const fallbackResult = await extractViaVision(fileBuffer, file, openaiApiKey, openaiModel);

  console.log(
    `[extractQuoteDocument] Vision fallback complete — text=${fallbackResult.text.length} chars`,
  );

  return fallbackResult;
}

// ---------------------------------------------------------------------------
// Legacy helpers (kept for backward compatibility with callers that use them)
// ---------------------------------------------------------------------------

function extractDocumentTotals(text: string) {
  const t = text.replace(/\u00A0/g, " ").replace(/\s+/g, " ");

  const parseMoney = (s: string) => {
    const cleaned = String(s).replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    return parsed > 0 && Number.isFinite(parsed) ? parsed : null;
  };

  const grab = (re: RegExp) => {
    const m = t.match(re);
    return m ? parseMoney(m[1]) : null;
  };

  let grandExcl = grab(/Grand\s+Total\s*\(excluding\s+GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  if (!grandExcl) grandExcl = grab(/Grand\s+Total\s*\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  if (!grandExcl) grandExcl = grab(/Grand\s+Total\s+excl\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  if (!grandExcl) grandExcl = grab(/Grand\s+Total\s+ex\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const total = grab(/(?:^|\n)\s*TOTAL\s*:?\s*\$?\s*([\d,]+\.?\d*)/im);
  const pg = grab(/P\s*&\s*G\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  const optionalExtras = grab(/Optional\s+Extras\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  let computedGrand = null;
  if (grandExcl == null && total != null && pg != null) {
    computedGrand = total + pg;
  }

  return {
    grand_total_excl_gst: grandExcl ?? computedGrand,
    total,
    p_and_g: pg,
    optional_extras_total: optionalExtras,
  };
}

const SUMMARY_LABELS = new Set([
  "total", "totals", "grand total", "grandtotal", "quote total",
  "contract sum", "lump sum total", "overall total", "subtotal",
  "sub-total", "sub total", "net total", "project total", "tender total",
  "tender sum", "contract value", "total price", "total cost",
  "total amount", "total sum", "contract total", "contract price", "price total",
]);

function isSummaryLabel(desc: string): boolean {
  const d = desc.replace(/[:\s]+$/, "").trim().toLowerCase();
  if (SUMMARY_LABELS.has(d)) return true;
  if (/^(grand\s+)?total(\s*(excl|incl|ex|inc)\.?.*)?$/i.test(d)) return true;
  if (/^sub[-\s]?total/i.test(d)) return true;
  if (/^contract\s+(sum|total|value|price)$/i.test(d)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// HTTP handler (backward-compatible entry point)
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;
    const supplierName = formData.get("supplierName") as string;
    const dashboardMode = (formData.get("dashboardMode") as string) || "original";
    const trade = (formData.get("trade") as string) || "passive_fire";

    if (!file || !projectId || !supplierName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("=== STARTING PARSE_QUOTE_WITH_EXTRACTOR ===");
    console.log("File:", file.name, "Size:", file.size);
    console.log("Project ID:", projectId);
    console.log("Supplier:", supplierName);
    console.log("Trade:", trade);

    const userId = await getUserIdFromRequest(req);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("organisation_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new Error(`Project lookup failed: ${projectError?.message ?? "not found"}`);
    }

    // Load config
    const { data: configs, error: configError } = await supabaseAdmin
      .from("system_config")
      .select("key, value")
      .in("key", ["RENDER_PDF_EXTRACTOR_API_KEY", "RENDER_PDF_EXTRACTOR_URL", "OPENAI_API_KEY", "OPENAI_MODEL"]);

    if (configError) console.error("Config lookup error:", configError);

    const configMap = new Map(configs?.map((c) => [c.key, c.value]) ?? []);
    const pythonServiceApiKey = configMap.get("RENDER_PDF_EXTRACTOR_API_KEY") as string | undefined;
    const pythonServiceUrl = (configMap.get("RENDER_PDF_EXTRACTOR_URL") as string | undefined)
      ?? "https://verify-pdf-extractor.onrender.com";
    const openaiApiKey = configMap.get("OPENAI_API_KEY") as string | undefined;
    const openaiModel = (configMap.get("OPENAI_MODEL") as string | undefined) ?? "gpt-4o";

    // Read file buffer once
    const fileBuffer = await file.arrayBuffer();
    console.log(`[Handler] File loaded: ${file.name}, ${fileBuffer.byteLength} bytes`);

    // === EXTRACTION ===
    const extraction = await extractQuoteDocument({
      file,
      fileBuffer,
      pythonServiceUrl,
      pythonServiceApiKey: pythonServiceApiKey ?? "",
      openaiApiKey,
      openaiModel,
    });

    console.log(
      `[Handler] Extraction complete — method=${extraction.extraction_method},`,
      `text=${extraction.text.length} chars`,
    );

    // Upload to storage
    const fileName = file.name;
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const storagePath = `${projectId}/${timestamp}-${sanitizedFileName}`;

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from("quotes")
      .upload(storagePath, fileBuffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Send to LLM parser
    const llmPayload = {
      text: extraction.text,
      supplierName,
      trade,
      documentType: "PDF Quote (Extractor)",
      chunkInfo: `Complete document — ${extraction.page_count} pages, ${extraction.diagnostics.tables_found} tables`,
    };

    const llmResponse = await fetch(
      `${supabaseUrl}/functions/v1/parse_quote_llm_fallback`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(llmPayload),
      },
    );

    if (!llmResponse.ok) {
      throw new Error(`AI parsing failed: ${await llmResponse.text()}`);
    }

    const parseResult = await llmResponse.json();
    const rawItems = parseResult.lines || parseResult.items || [];

    // v3 parsing pipeline
    const { processParsingPipeline } = await import("../_shared/parsingV3.ts");
    const parsingResult = processParsingPipeline(rawItems, extraction.text);

    // Safety filter — strip any surviving summary rows
    const filteredItems = parsingResult.finalItems.filter((item: any) => {
      const desc = String(item.description ?? "").trim();
      if (isSummaryLabel(desc)) {
        console.log(`[Safety filter] Removed summary row: "${desc}"`);
        return false;
      }
      return true;
    });

    // Plumbing sanitizer
    let finalItems = filteredItems;
    let plumbingExtractedTotal: number | null = null;
    if (trade.toLowerCase() === "plumbing") {
      const { cleanedItems, quoteTotalFound } = sanitizePlumbingItems(
        filteredItems as unknown as Record<string, unknown>[],
        parsingResult.documentTotal ?? null,
      );
      finalItems = cleanedItems as unknown as typeof filteredItems;
      plumbingExtractedTotal = quoteTotalFound;
    }

    const totalAmount = parsingResult.finalTotalAmount;
    const quotedTotal = parsingResult.documentTotal ?? plumbingExtractedTotal;

    // Revision handling
    let revisionNumber = 1;
    if (dashboardMode === "revisions") {
      const { data: latestQuote } = await supabase
        .from("quotes")
        .select("revision_number")
        .eq("project_id", projectId)
        .eq("supplier_name", supplierName)
        .order("revision_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      revisionNumber = latestQuote ? latestQuote.revision_number + 1 : 2;
    }

    // Create quote record
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .insert({
        project_id: projectId,
        supplier_name: supplierName,
        file_name: fileName,
        file_url: storagePath,
        total_amount: totalAmount,
        quoted_total: quotedTotal,
        contingency_amount: 0,
        items_count: finalItems.length,
        raw_items_count: parsingResult.rawItemsCount,
        final_items_count: 0,
        items_total: 0,
        document_total: parsingResult.documentTotal,
        remainder_amount: parsingResult.remainderAmount,
        has_adjustment: parsingResult.hasAdjustment,
        parsing_version: parsingResult.parsingVersion,
        user_id: userId,
        organisation_id: project.organisation_id,
        status: "processing",
        revision_number: revisionNumber,
        trade,
        document_total_excl_gst: parsingResult.documentTotal,
        reconciliation_applied: parsingResult.hasAdjustment,
        has_adjustment_item: parsingResult.hasAdjustment,
        optional_items_included: finalItems.some((it: any) => it.is_optional),
        metadata: {
          extractor_used: extraction.extraction_method,
          extraction_confidence: extraction.confidence,
          python_service_available: extraction.diagnostics.python_service_available,
          fallback_reason: extraction.diagnostics.fallback_reason ?? null,
          num_pages: extraction.page_count,
          tables_count: extraction.diagnostics.tables_found,
          parsed_at: new Date().toISOString(),
          parsing_version: parsingResult.parsingVersion,
        },
      })
      .select()
      .single();

    if (quoteError || !quote) {
      throw new Error(`Failed to create quote: ${quoteError?.message}`);
    }

    // Insert line items
    if (finalItems.length > 0) {
      const quoteItems = finalItems.map((item: any) => {
        const unitPrice = item.unit_price ?? item.unitPrice ?? item.rate;
        const totalPrice = item.total ?? item.amount;
        let quantity = parseFloat(item.qty || item.quantity || "0");
        let finalUnitPrice = unitPrice;

        if ((quantity === 0 || finalUnitPrice == null) && totalPrice) {
          quantity = 1;
          finalUnitPrice = parseFloat(totalPrice.toString());
        }

        let normalizedUnit = item.unit || "ea";
        const unitStr = String(normalizedUnit).trim();
        if (["0", "N/A", "-", "TBC", ""].includes(unitStr)) normalizedUnit = "ea";

        return {
          quote_id: quote.id,
          description: item.description || item.desc || "",
          quantity,
          unit: normalizedUnit,
          unit_price: finalUnitPrice != null ? parseFloat(finalUnitPrice.toString()) : null,
          total_price: totalPrice != null ? parseFloat(totalPrice.toString()) : null,
          metadata: {
            is_optional: item.is_optional || false,
            is_adjustment: item.is_adjustment || false,
            section: item.section,
          },
        };
      });

      const { error: itemsError } = await supabase.from("quote_items").insert(quoteItems);
      if (itemsError) throw new Error(`Failed to create quote items: ${itemsError.message}`);
    }

    // Recount from DB and update quote
    const { count: savedCount } = await supabase
      .from("quote_items")
      .select("*", { count: "exact", head: true })
      .eq("quote_id", quote.id);

    const { data: totalData } = await supabase
      .from("quote_items")
      .select("total_price")
      .eq("quote_id", quote.id);

    const savedTotal = totalData?.reduce((sum, row) => sum + Number(row.total_price || 0), 0) ?? 0;

    await supabase
      .from("quotes")
      .update({
        final_items_count: savedCount ?? 0,
        items_total: savedTotal,
        items_count: savedCount ?? 0,
        status: "complete",
      })
      .eq("id", quote.id);

    return new Response(
      JSON.stringify({
        success: true,
        quoteId: quote.id,
        itemsCount: finalItems.length,
        rawItemsCount: parsingResult.rawItemsCount,
        finalItemsCount: parsingResult.finalItemsCount,
        itemsTotal: parsingResult.itemsTotal,
        documentTotal: parsingResult.documentTotal,
        finalTotalAmount: parsingResult.finalTotalAmount,
        hasAdjustment: parsingResult.hasAdjustment,
        parsingVersion: parsingResult.parsingVersion,
        extraction: {
          method: extraction.extraction_method,
          confidence: extraction.confidence,
          page_count: extraction.page_count,
          text_length: extraction.text.length,
          tables_found: extraction.diagnostics.tables_found,
          python_service_available: extraction.diagnostics.python_service_available,
          fallback_reason: extraction.diagnostics.fallback_reason ?? null,
          warnings: extraction.diagnostics.warnings,
        },
        message: `Parsed via ${extraction.extraction_method}. Raw: ${parsingResult.rawItemsCount} items, Final: ${parsingResult.finalItemsCount} items.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("=== ERROR IN parse_quote_with_extractor ===");
    console.error(error?.message, error?.stack);

    return new Response(
      JSON.stringify({
        error: error?.message || String(error) || "Internal server error",
        fallback_required: true,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
