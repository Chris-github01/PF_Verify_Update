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

    const llmGrandTotal = parseResult.totals?.grandTotal || parseResult.grandTotal || parseResult.quoteTotalAmount;
    console.log(`[DEBUG] LLM grand total: ${llmGrandTotal}`);

    // Helper functions for safe extraction
    function getTotal(it: any) {
      const v = it.total ?? it.total_price ?? it.amount ?? it.line_total ?? it.extended ?? null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }

    function getDesc(it: any) {
      return String(it.description ?? it.desc ?? it.item ?? "").trim();
    }

    let items = rawItems;
    console.log(`[DEBUG] Starting with ${items.length} items`);

    // SAFE junk filter - only remove truly empty rows
    items = items.filter((it: any) => {
      const desc = getDesc(it);
      const total = getTotal(it);

      // Keep if it has a real description OR a real total
      if (desc.length > 0) return true;
      if (total != null && total !== 0) return true;

      return false;
    });
    console.log(`[DEBUG] After SAFE junk filter, items = ${items.length}`);

    // Normalize items - convert total-only lines into qty=1, rate=total
    items = items.map((it: any) => {
      const desc = String(it.description ?? it.desc ?? "").trim();
      const unit = String(it.unit ?? "").trim() || "ea";

      let qty = Number(it.qty ?? it.quantity ?? 0);
      let rate = Number(it.rate ?? it.unit_price ?? it.unitPrice ?? 0);
      let total = Number(it.total ?? it.total_price ?? it.amount ?? 0);

      // If total exists but qty/rate are missing: preserve money
      if ((qty <= 0 || !Number.isFinite(qty)) && Number.isFinite(total) && total !== 0) {
        qty = 1;
      }
      if ((!Number.isFinite(rate) || rate === 0) && Number.isFinite(total) && total !== 0 && qty > 0) {
        rate = total / qty;
      }

      return {
        ...it,
        description: desc,
        unit,
        qty,
        rate,
        total,
        is_optional: isOptionalItem(it)
      };
    });
    console.log(`[DEBUG] After normalization, items = ${items.length}`);

    // Log sample for verification (bounded to avoid stack overflow)
    console.log(`\n[DEBUG] Sample of first 10 items:`);
    items.slice(0, 10).forEach((it: any, idx: number) => {
      console.log(`  ${idx + 1}. ${String(it.description || "").slice(0, 50)} | qty=${it.qty} rate=${it.rate} total=${it.total}`);
    });

    console.log(`[DEBUG] Final item count: ${items.length} items`);

    // Calculate totals - sum of ALL items should equal document total
    const lineItemsTotal = sumItems(items);
    const documentGrandTotal = docTotals.grand_total_excl_gst;

    console.log(`Line items sum: ${lineItemsTotal}`);
    console.log(`Document grand total: ${documentGrandTotal}`);

    // The quote total should be the sum of line items (no reconciliation adjustments)
    const totalAmount = lineItemsTotal;
    const quotedTotal = documentGrandTotal; // Store what the document says for reference
    const contingencyAmount = 0;

    // Calculate discrepancy for tracking
    const discrepancy = documentGrandTotal ? Math.abs(documentGrandTotal - lineItemsTotal) : 0;

    console.log("Quote totals:", {
      lineItemsTotal,
      quotedTotal,
      contingencyAmount,
      totalAmount,
      discrepancy
    });

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
        items_count: items.length,
        user_id: userId,
        organisation_id: project.organisation_id,
        status: "pending",
        revision_number: revisionNumber,
        trade: trade,
        document_total_excl_gst: documentGrandTotal,
        items_total: lineItemsTotal,
        reconciliation_applied: false,
        has_adjustment_item: false,
        optional_items_included: items.some((it: any) => it.is_optional),
        metadata: {
          extractor_used: "external_direct",
          num_pages: extractorData.num_pages,
          tables_count: extractorData.tables?.length || 0,
          parsed_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (quoteError || !quote) {
      console.error("Quote creation error:", quoteError);
      throw new Error("Failed to create quote");
    }

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

        const dbItem = {
          quote_id: quote.id,
          description: item.description || item.desc || "",
          quantity: quantity,
          unit: item.unit || "ea",
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

      console.log(`SUCCESSFULLY INSERTED ${insertedItems?.length || 0} ITEMS (expected ${quoteItems.length})`);

      if (insertedItems && insertedItems.length !== quoteItems.length) {
        console.error(`CRITICAL: Item count mismatch! Prepared ${quoteItems.length} items but only ${insertedItems.length} were inserted`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        quoteId: quote.id,
        itemsCount: items.length,
        extractorData: {
          filename: extractorData.filename,
          num_pages: extractorData.num_pages,
          text_length: extractorData.text.length,
          tables_count: extractorData.tables?.length || 0,
        },
        message: `Successfully parsed quote using external extractor. Found ${items.length} items.`,
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