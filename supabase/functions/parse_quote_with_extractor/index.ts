import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getUserIdFromRequest } from "./_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Extract document totals deterministically from raw text using regex
 * VERSION: 2026-02-20-A (Document total reconciliation)
 */
function extractDocumentTotals(text: string) {
  const t = text.replace(/\u00A0/g, " ").replace(/\s+/g, " "); // Normalize whitespace

  const parseMoney = (s: string) => {
    const cleaned = String(s).replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    return (parsed > 0 && Number.isFinite(parsed)) ? parsed : null;
  };

  const grab = (re: RegExp) => {
    const m = t.match(re);
    return m ? parseMoney(m[1]) : null;
  };

  // Try multiple patterns for "Grand Total (excluding GST)"
  let grandExcl = grab(/Grand\s+Total\s*\(excluding\s+GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  if (!grandExcl) {
    // Try with various spacing/punctuation variations
    grandExcl = grab(/Grand\s+Total\s*\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  }

  if (!grandExcl) {
    // Try "Grand Total excl GST" without parentheses
    grandExcl = grab(/Grand\s+Total\s+excl\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  }

  if (!grandExcl) {
    // Try "Grand Total ex GST"
    grandExcl = grab(/Grand\s+Total\s+ex\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  }

  // Some quotes show TOTAL and P&G as separate lines
  const total = grab(/(?:^|\n)\s*TOTAL\s*:?\s*\$?\s*([\d,]+\.?\d*)/im);
  const pg = grab(/P\s*&\s*G\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const optionalExtras = grab(/Optional\s+Extras\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  // If no grand total found, try to compute it
  let computedGrand = null;
  if (grandExcl == null && total != null && pg != null) {
    computedGrand = total + pg;
  }

  const finalGrandTotal = grandExcl ?? computedGrand;

  console.log("Document total extraction debug:", {
    grandExcl,
    total,
    pg,
    computedGrand,
    finalGrandTotal,
    textSample: t.substring(0, 500)
  });

  return {
    grand_total_excl_gst: finalGrandTotal,
    total,
    p_and_g: pg,
    optional_extras_total: optionalExtras
  };
}

/**
 * Normalize unit string for comparison
 */
function normUnit(u: any) {
  return String(u ?? "").toUpperCase().replace(/\./g, "").trim();
}

/**
 * Check if description looks like a summary line
 */
function looksLikeSummaryLine(descRaw: any) {
  const d = String(descRaw ?? "").toLowerCase().trim();
  if (!d) return true;

  const summaryWords = [
    "subtotal", "sub-total", "total", "grand total", "summary",
    "p&g", "prelim", "preliminaries", "margin", "gst",
    "optional extras", "options", "contingency"
  ];

  // Check for section headers like "Electrical $xxx"
  const isSectionHeaderMoney = /^[a-z][a-z\s/&-]{2,40}\s+\$[\d,]+(\.\d{2})?$/.test(d);

  return isSectionHeaderMoney || summaryWords.some(w => d.includes(w));
}

/**
 * Check if item has all required fields (qty, rate, total)
 */
function itemHasAllFields(item: any) {
  const qty = Number(item.qty ?? item.quantity);
  const rate = Number(item.rate ?? item.unit_price ?? item.unitPrice);
  const total = Number(item.total ?? item.total_price ?? item.amount);

  return Number.isFinite(qty) && qty > 0 &&
         Number.isFinite(rate) && rate > 0 &&
         Number.isFinite(total) && total > 0;
}

/**
 * Determine if an LS item should be dropped (only if it's a summary duplicate)
 */
function shouldDropLumpSumItem(lsItem: any, itemizedItems: any[]) {
  const desc = String(lsItem.description ?? "");
  if (looksLikeSummaryLine(desc)) return true;

  const lsTotal = Number(lsItem.total ?? lsItem.total_price ?? lsItem.amount ?? 0);
  if (!(lsTotal > 0)) return false;

  // If this LS total approximately equals the sum of itemized totals,
  // it's probably a summary duplicate
  const itemizedTotal = itemizedItems.reduce((s, it) => {
    const t = Number(it.total ?? it.total_price ?? it.amount ?? 0);
    return s + (Number.isFinite(t) ? t : 0);
  }, 0);

  const tolerance = 0.02; // 2%
  if (itemizedTotal > 0) {
    const diffRatio = Math.abs(lsTotal - itemizedTotal) / itemizedTotal;
    if (diffRatio <= tolerance) return true;
  }

  return false;
}

/**
 * Check if item is optional
 */
function isOptionalItem(item: any) {
  const d = String(item.description ?? "").toLowerCase();
  return d.includes("optional") || d.includes("option ");
}

/**
 * Sum totals from item list
 */
function sumItems(list: any[]) {
  return list.reduce((s, it) => {
    const v = Number(it.total ?? it.total_price ?? it.amount ?? 0);
    return s + (Number.isFinite(v) ? v : 0);
  }, 0);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: authHeader },
      },
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
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log("=== STARTING PARSE_QUOTE_WITH_EXTRACTOR ===");
    console.log("File:", file.name, "Size:", file.size);
    console.log("Project ID:", projectId);
    console.log("Supplier:", supplierName);
    console.log("Trade:", trade);

    const userId = await getUserIdFromRequest(req);
    console.log("User ID:", userId);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("organisation_id")
      .eq("id", projectId)
      .single();

    if (projectError) {
      console.error("Project lookup error:", projectError);
      throw new Error(`Project lookup failed: ${projectError.message}`);
    }

    if (!project) {
      throw new Error("Project not found");
    }

    console.log("Project organisation_id:", project.organisation_id);

    const { data: configs, error: configError } = await supabaseAdmin
      .from("system_config")
      .select("key, value")
      .in("key", ["RENDER_PDF_EXTRACTOR_API_KEY", "RENDER_PDF_EXTRACTOR_URL", "OPENAI_API_KEY"]);

    if (configError) {
      console.error("Config lookup error:", configError);
    }

    console.log("Configs found:", configs?.map(c => c.key).join(", ") || "none");

    const configMap = new Map(configs?.map(c => [c.key, c.value]) || []);
    const apiKey = configMap.get("RENDER_PDF_EXTRACTOR_API_KEY");
    const baseUrl = configMap.get("RENDER_PDF_EXTRACTOR_URL") || "https://verify-pdf-extractor.onrender.com";

    if (!baseUrl || !apiKey) {
      console.error("Missing extractor config", {
        baseUrl,
        apiKeyPresent: !!apiKey,
        availableConfigs: configs?.map(c => c.key).join(", ")
      });
      throw new Error("Extractor config missing - check RENDER_PDF_EXTRACTOR_URL and RENDER_PDF_EXTRACTOR_API_KEY in system_config");
    }

    console.log("Calling external PDF extractor for:", file.name);
    console.log("Using base URL:", baseUrl);
    console.log("File size:", file.size, "bytes");

    // Read file buffer ONCE at the start (can't read stream multiple times)
    const fileBuffer = await file.arrayBuffer();
    console.log(`File loaded: ${file.name}, buffer size: ${fileBuffer.byteLength} bytes`);

    let extractorData: any = null;

    try {
      // Create a new Blob from the buffer for the extractor call
      const fileBlob = new Blob([fileBuffer], { type: file.type });
      const fileForExtractor = new File([fileBlob], file.name, { type: file.type });

      const extractorFormData = new FormData();
      extractorFormData.append("file", fileForExtractor);

      console.log("Sending to extractor:", {
        url: `${baseUrl}/parse/ensemble`,
        fileName: file.name,
        fileSize: fileBuffer.byteLength
      });

      const extractorResponse = await fetch(`${baseUrl}/parse/ensemble`, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
        },
        body: extractorFormData,
      });

      console.log("[DEBUG] Extractor response status:", extractorResponse.status);

      if (!extractorResponse.ok) {
        const errorText = await extractorResponse.text();
        console.error(`Python service failed with status ${extractorResponse.status}:`, errorText);
        console.log("Falling back to OpenAI");
        extractorData = null;
      } else {
        extractorData = await extractorResponse.json();
        console.log("Extractor successful, text length:", extractorData.text?.length || 0);
        console.log("Extractor tables count:", extractorData.tables?.length || 0);

        if (!extractorData.text || extractorData.text.length === 0) {
          console.error("Extractor returned no text, falling back to OpenAI");
          extractorData = null;
        }
      }
    } catch (pythonError) {
      console.error("Python service error:", pythonError);
      console.log("Falling back to OpenAI direct parsing");
      extractorData = null;
    }

    // If Python service failed, use OpenAI to extract text directly from PDF
    if (!extractorData) {
      console.log("PYTHON SERVICE UNAVAILABLE - Using OpenAI GPT-4 Vision to parse PDF directly");

      const openaiKey = configMap.get("OPENAI_API_KEY");
      if (!openaiKey) {
        console.error("OpenAI API key not found in system_config");
        throw new Error("OpenAI API key not configured in system settings");
      }

      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
      console.log(`Base64 encoding complete: ${base64.length} characters`);

      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Extract ALL text from this PDF quote. Return complete text including all line items, quantities, rates, and totals." },
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } }
            ]
          }],
          max_tokens: 16000
        })
      });

      if (!openaiResponse.ok) {
        throw new Error(`OpenAI API error: ${openaiResponse.status}`);
      }

      const openaiResult = await openaiResponse.json();
      const extractedText = openaiResult.choices[0].message.content;

      extractorData = {
        filename: file.name,
        num_pages: 1,
        text: extractedText,
        tables: []
      };

      console.log("OpenAI direct extraction complete");
    }

    // Extract document totals deterministically from raw text
    const docTotals = extractDocumentTotals(extractorData.text);
    console.log("Document totals extracted:", docTotals);

    const fileName = file.name;
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = new Date().getTime();
    const storagePath = `${projectId}/${timestamp}-${sanitizedFileName}`;

    console.log("Attempting storage upload:", {
      bucket: "quotes",
      path: storagePath,
      originalFileName: file.name,
      sanitizedFileName: sanitizedFileName,
      fileSize: file.size,
      fileType: file.type
    });

    const { data: uploadData, error: uploadError } = await supabaseAdmin
      .storage
      .from("quotes")
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error details:", {
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        error: uploadError,
        attemptedPath: storagePath
      });
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    console.log("Storage upload successful:", uploadData);

    const llmUrl = `${supabaseUrl}/functions/v1/parse_quote_llm_fallback`;
    const llmHeaders = {
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
    };

    const llmPayload = {
      text: extractorData.text,
      supplierName: supplierName,
      documentType: "PDF Quote (Extractor)",
      chunkInfo: `Complete document - ${extractorData.num_pages} pages, ${extractorData.tables?.length || 0} tables`
    };

    console.log("Sending to AI parser...");

    const llmResponse = await fetch(llmUrl, {
      method: "POST",
      headers: llmHeaders,
      body: JSON.stringify(llmPayload),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      throw new Error(`AI parsing failed: ${errorText}`);
    }

    const parseResult = await llmResponse.json();
    const rawItems = parseResult.lines || parseResult.items || [];
    console.log(`[DEBUG] LLM returned rawItems count = ${rawItems.length}`);

    // Import v3 parsing pipeline
    const { processParsingPipeline } = await import("../_shared/parsingV3.ts");

    // Run v3 parsing pipeline
    const parsingResult = processParsingPipeline(rawItems, extractorData.text);

    console.log(`[Parsing v3] Raw items: ${parsingResult.rawItemsCount}`);
    console.log(`[Parsing v3] Final items: ${parsingResult.finalItemsCount}`);
    console.log(`[Parsing v3] Items total: $${parsingResult.itemsTotal.toFixed(2)}`);
    console.log(`[Parsing v3] Document total: ${parsingResult.documentTotal ? `$${parsingResult.documentTotal.toFixed(2)}` : 'N/A'}`);
    console.log(`[Parsing v3] Final total amount: $${parsingResult.finalTotalAmount.toFixed(2)}`);
    console.log(`[Parsing v3] Has adjustment: ${parsingResult.hasAdjustment}`);

    const items = parsingResult.finalItems;
    const totalAmount = parsingResult.finalTotalAmount;
    const quotedTotal = parsingResult.documentTotal;
    const contingencyAmount = 0;

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
      console.log("Setting revision number:", { supplierName, revisionNumber, dashboardMode });
    }

    // Step 1: Create quote with processing status and temporary counts
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .insert({
        project_id: projectId,
        supplier_name: supplierName,
        file_name: fileName,
        file_url: storagePath,
        total_amount: totalAmount,
        quoted_total: quotedTotal,
        contingency_amount: contingencyAmount,
        items_count: items.length, // deprecated but keep for backwards compat
        raw_items_count: parsingResult.rawItemsCount,
        final_items_count: 0, // will update after insert
        items_total: 0, // will update after insert
        document_total: parsingResult.documentTotal,
        remainder_amount: parsingResult.remainderAmount,
        has_adjustment: parsingResult.hasAdjustment,
        parsing_version: parsingResult.parsingVersion,
        user_id: userId,
        organisation_id: project.organisation_id,
        status: "processing",
        revision_number: revisionNumber,
        trade: trade,
        document_total_excl_gst: parsingResult.documentTotal,
        reconciliation_applied: parsingResult.hasAdjustment,
        has_adjustment_item: parsingResult.hasAdjustment,
        optional_items_included: items.some((it: any) => it.is_optional),
        metadata: {
          extractor_used: "external_direct",
          num_pages: extractorData.num_pages,
          tables_count: extractorData.tables?.length || 0,
          parsed_at: new Date().toISOString(),
          parsing_version: parsingResult.parsingVersion,
        },
      })
      .select()
      .single();

    if (quoteError || !quote) {
      console.error("Quote creation error:", quoteError);
      throw new Error("Failed to create quote");
    }

    console.log(`[Atomic Write] Step 1: Quote created with ID ${quote.id}, status=processing`);

    if (items.length > 0) {
      console.log(`PREPARING TO INSERT ${items.length} ITEMS INTO DATABASE`);

      const quoteItems = items.map((item: any, index: number) => {
        // For lump sum items, preserve null values for rate/total
        const unitPrice = item.unit_price ?? item.unitPrice ?? item.rate;
        const totalPrice = item.total ?? item.amount;
        let quantity = parseFloat(item.qty || item.quantity || "0");
        let finalUnitPrice = unitPrice;

        // CRITICAL FIX: If item has total but missing qty/unit_price, convert to qty=1, price=total
        // This preserves the value for downstream calculations (qty × unit_price = total)
        if ((quantity === 0 || finalUnitPrice === null || finalUnitPrice === undefined) && totalPrice) {
          quantity = 1;
          finalUnitPrice = parseFloat(totalPrice.toString());
        }

        // Normalize unit: if "0", "N/A", "-", "TBC", or empty, default to "ea"
        let normalizedUnit = item.unit || "ea";
        const unitStr = String(normalizedUnit).trim();
        if (unitStr === "0" || unitStr === "N/A" || unitStr === "-" || unitStr === "TBC" || unitStr === "") {
          normalizedUnit = "ea";
        }

        const dbItem = {
          quote_id: quote.id,
          description: item.description || item.desc || "",
          quantity: quantity,
          unit: normalizedUnit,
          unit_price: finalUnitPrice !== null && finalUnitPrice !== undefined ? parseFloat(finalUnitPrice.toString()) : null,
          total_price: totalPrice !== null && totalPrice !== undefined ? parseFloat(totalPrice.toString()) : null,
          metadata: {
            is_optional: item.is_optional || false,
            is_adjustment: item.is_adjustment || false,
            section: item.section
          }
        };

        // Log first and last few items
        if (index < 3 || index >= items.length - 3) {
          console.log(`Item ${index + 1}:`, {
            desc: dbItem.description.substring(0, 50),
            qty: dbItem.quantity,
            unit: dbItem.unit,
            unit_price: dbItem.unit_price,
            total_price: dbItem.total_price
          });
        }

        return dbItem;
      });

      console.log(`INSERTING ${quoteItems.length} ITEMS INTO quote_items TABLE`);

      const { data: insertedItems, error: itemsError } = await supabase
        .from("quote_items")
        .insert(quoteItems)
        .select('id');

      if (itemsError) {
        console.error("Quote items creation error:", itemsError);
        throw new Error("Failed to create quote items");
      }

      console.log(`[Atomic Write] Step 2: Successfully inserted ${insertedItems?.length || 0} items (expected ${quoteItems.length})`);

      if (insertedItems && insertedItems.length !== quoteItems.length) {
        console.error(`CRITICAL: Item count mismatch! Prepared ${quoteItems.length} items but only ${insertedItems.length} were inserted`);
      }

      // Step 3: Recount from database (source of truth)
      const { count: savedCount } = await supabase
        .from("quote_items")
        .select("*", { count: "exact", head: true })
        .eq("quote_id", quote.id);

      const { data: totalData } = await supabase
        .from("quote_items")
        .select("total_price")
        .eq("quote_id", quote.id);

      const savedTotal = totalData?.reduce((sum, item) => sum + Number(item.total_price || 0), 0) || 0;

      console.log(`[Atomic Write] Step 3: Recounted from DB - ${savedCount} items, $${savedTotal.toFixed(2)} total`);

      // Step 4: Update quote with final counts (atomic source of truth)
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          final_items_count: savedCount || 0,
          items_total: savedTotal,
          items_count: savedCount || 0, // update deprecated field too
          status: "complete",
        })
        .eq("id", quote.id);

      if (updateError) {
        console.error("Failed to update quote with final counts:", updateError);
      } else {
        console.log(`[Atomic Write] Step 4: Updated quote ${quote.id} with final counts - status=complete`);
      }
    } else {
      // No items, just update status
      await supabase
        .from("quotes")
        .update({
          final_items_count: 0,
          items_total: 0,
          status: "complete",
        })
        .eq("id", quote.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        quoteId: quote.id,
        itemsCount: items.length,
        rawItemsCount: parsingResult.rawItemsCount,
        finalItemsCount: parsingResult.finalItemsCount,
        itemsTotal: parsingResult.itemsTotal,
        documentTotal: parsingResult.documentTotal,
        finalTotalAmount: parsingResult.finalTotalAmount,
        hasAdjustment: parsingResult.hasAdjustment,
        parsingVersion: parsingResult.parsingVersion,
        extractorData: {
          filename: extractorData.filename,
          num_pages: extractorData.num_pages,
          text_length: extractorData.text.length,
          tables_count: extractorData.tables?.length || 0,
        },
        message: `Successfully parsed quote using v3 pipeline. Raw: ${parsingResult.rawItemsCount} items, Final: ${parsingResult.finalItemsCount} items.`,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error) {
    console.error("=== ERROR IN parse_quote_with_extractor ===");
    console.error("Error message:", error?.message);
    console.error("Error name:", error?.name);
    console.error("Error stack:", error?.stack);
    console.error("Full error object:", error);

    return new Response(
      JSON.stringify({
        error: error?.message || String(error) || "Internal server error",
        errorDetails: {
          name: error?.name,
          message: error?.message,
          stack: error?.stack?.split('\n').slice(0, 5).join('\n')
        },
        fallback_required: true,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});