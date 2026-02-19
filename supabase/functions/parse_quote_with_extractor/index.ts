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
 */
function extractDocumentTotals(text: string) {
  const t = text.replace(/\u00A0/g, " "); // Replace non-breaking spaces

  const parseMoney = (s: string) => {
    const cleaned = String(s).replace(/[^0-9.]/g, "");
    return parseFloat(cleaned) || null;
  };

  const grab = (re: RegExp) => {
    const m = t.match(re);
    return m ? parseMoney(m[1]) : null;
  };

  // Prefer grand total excl GST if present
  const grandExcl = grab(/Grand Total\s*\(excluding GST\)\s*[:\$]*\s*\$?([\d,]+\.\d{2})/i);

  // Some quotes show TOTAL and P&G as separate lines
  const total = grab(/\bTOTAL\s*[:\$]*\s*\$?([\d,]+\.\d{2})/i);
  const pg = grab(/\bP\s*&\s*G\b.*?[:\$]*\s*\$?([\d,]+\.\d{2})/i);

  const optionalExtras = grab(/Optional Extras\s*[:\$]*\s*\$?([\d,]+\.\d{2})/i);

  // If no grand total, compute it if total + pg exist
  const computedGrand = (grandExcl == null && total != null && pg != null) ? (total + pg) : null;

  return {
    grand_total_excl_gst: grandExcl ?? computedGrand,
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

    const userId = await getUserIdFromRequest(req);

    const { data: project } = await supabase
      .from("projects")
      .select("organisation_id")
      .eq("id", projectId)
      .single();

    if (!project) {
      throw new Error("Project not found");
    }

    const { data: configs } = await supabaseAdmin
      .from("system_config")
      .select("key, value")
      .in("key", ["RENDER_PDF_EXTRACTOR_API_KEY", "RENDER_PDF_EXTRACTOR_URL"]);

    const configMap = new Map(configs?.map(c => [c.key, c.value]) || []);
    const apiKey = configMap.get("RENDER_PDF_EXTRACTOR_API_KEY");
    const baseUrl = configMap.get("RENDER_PDF_EXTRACTOR_URL") || "https://verify-pdf-extractor.onrender.com";

    if (!apiKey) {
      throw new Error("PDF Extractor API key not configured in system settings");
    }

    console.log("Calling external PDF extractor for:", file.name);
    console.log("Using base URL:", baseUrl);

    const extractorFormData = new FormData();
    extractorFormData.append("file", file);

    const extractorResponse = await fetch(`${baseUrl}/parse/ensemble`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
      },
      body: extractorFormData,
    });

    if (!extractorResponse.ok) {
      throw new Error(`Extractor API error: ${extractorResponse.status}`);
    }

    const extractorData = await extractorResponse.json();
    console.log("Extractor → Import Quotes:", extractorData);

    if (!extractorData.text || extractorData.text.length === 0) {
      throw new Error("Extractor returned no text");
    }

    // Extract document totals deterministically from raw text
    const docTotals = extractDocumentTotals(extractorData.text);
    console.log("Document totals extracted:", docTotals);

    const fileName = file.name;
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileBuffer = await file.arrayBuffer();
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
    let items = parseResult.lines || parseResult.items || [];
    const llmGrandTotal = parseResult.totals?.grandTotal || parseResult.grandTotal || parseResult.quoteTotalAmount;

    console.log(`AI parser extracted ${items.length} items, LLM grand total: ${llmGrandTotal}`);

    // Smart filtering: Only drop LS items if they're summary duplicates
    const lumpSumItems = items.filter((item: any) => {
      const unit = normUnit(item.unit);
      return ['LS', 'LUMP SUM', 'LUMPSUM', 'SUM'].includes(unit);
    });

    const itemizedItems = items.filter((item: any) => {
      const unit = normUnit(item.unit);
      return !['LS', 'LUMP SUM', 'LUMPSUM', 'SUM'].includes(unit);
    });

    console.log(`Item breakdown: ${lumpSumItems.length} LS items, ${itemizedItems.length} itemized items`);

    // Smart LS filtering: only remove if they look like summary duplicates
    const filteredLumpSums = lumpSumItems.filter((ls: any) => !shouldDropLumpSumItem(ls, itemizedItems));

    console.log(`LS filtering: keeping ${filteredLumpSums.length} of ${lumpSumItems.length} LS items (removed ${lumpSumItems.length - filteredLumpSums.length} summary duplicates)`);

    // Mark optional items instead of deleting them
    items = [...itemizedItems, ...filteredLumpSums].map((item: any) => ({
      ...item,
      is_optional: isOptionalItem(item)
    }));

    const baseItems = items.filter((it: any) => !it.is_optional);
    const optionalItems = items.filter((it: any) => it.is_optional);

    console.log(`Optional items: ${optionalItems.length} optional, ${baseItems.length} base items`);

    // Use document total as source of truth
    const documentGrandTotal = docTotals.grand_total_excl_gst;

    // Decide whether optional is included by checking which interpretation is closer to document total
    let finalItems = [...baseItems];
    const baseTotal = sumItems(baseItems);
    const optionalTotal = sumItems(optionalItems);

    if (documentGrandTotal != null) {
      const diffBase = Math.abs(documentGrandTotal - baseTotal);
      const diffWithOptional = Math.abs(documentGrandTotal - (baseTotal + optionalTotal));

      console.log(`Reconciliation check: doc_total=${documentGrandTotal}, base_total=${baseTotal}, optional_total=${optionalTotal}`);
      console.log(`Diff without optional: ${diffBase}, diff with optional: ${diffWithOptional}`);

      // Choose the closer interpretation
      if (diffWithOptional < diffBase && optionalItems.length > 0) {
        console.log(`Including optional items (closer match to document total)`);
        finalItems = [...baseItems, ...optionalItems];
      }
    } else if (llmGrandTotal != null) {
      // Fallback to LLM grand total if no document total found
      const diffBase = Math.abs(llmGrandTotal - baseTotal);
      const diffWithOptional = Math.abs(llmGrandTotal - (baseTotal + optionalTotal));

      if (diffWithOptional < diffBase && optionalItems.length > 0) {
        console.log(`Including optional items based on LLM total`);
        finalItems = [...baseItems, ...optionalItems];
      }
    }

    // Reconciliation: add adjustment item if needed
    const finalSum = sumItems(finalItems);
    const targetTotal = documentGrandTotal ?? llmGrandTotal;

    if (targetTotal != null) {
      const remainder = targetTotal - finalSum;
      const tolerance = Math.max(5.0, targetTotal * 0.001); // $5 or 0.1%

      if (Math.abs(remainder) > tolerance) {
        console.log(`RECONCILIATION: Adding adjustment item for remainder: ${remainder.toFixed(2)}`);
        finalItems.push({
          description: "Unparsed remainder (auto-adjustment)",
          qty: 1,
          unit: "ea",
          rate: remainder,
          total: remainder,
          is_adjustment: true
        });
      }
    }

    items = finalItems;

    console.log(`After reconciliation: ${items.length} items`);

    const lineItemsTotal = sumItems(items);
    const quotedTotal = documentGrandTotal ?? llmGrandTotal ?? null;
    const contingencyAmount = 0; // Don't auto-calculate contingency - let users add it explicitly
    const totalAmount = quotedTotal || lineItemsTotal;

    console.log("Quote totals:", {
      lineItemsTotal,
      quotedTotal,
      contingencyAmount,
      totalAmount
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
        reconciliation_applied: Math.abs((quotedTotal || 0) - lineItemsTotal) > 5,
        has_adjustment_item: items.some((it: any) => it.is_adjustment),
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
      const quoteItems = items.map((item: any) => {
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
          console.log(`[DATA INTEGRITY FIX] Item "${item.description}" has total but missing qty/price, saving as qty=1, price=${totalPrice}`);
        }

        return {
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
      });

      const { error: itemsError } = await supabase
        .from("quote_items")
        .insert(quoteItems);

      if (itemsError) {
        console.error("Quote items creation error:", itemsError);
        throw new Error("Failed to create quote items");
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
    console.error("Error in parse_quote_with_extractor:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
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