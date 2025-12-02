import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getUserIdFromRequest } from "./_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
    const items = parseResult.lines || parseResult.items || [];
    const grandTotal = parseResult.totals?.grandTotal || parseResult.grandTotal || parseResult.quoteTotalAmount;

    console.log(`AI parser extracted ${items.length} items, grand total: ${grandTotal}`);

    const lineItemsTotal = items.reduce((sum: number, item: any) => {
      const itemTotal = parseFloat(item.total || item.amount || "0");
      return sum + itemTotal;
    }, 0);

    const quotedTotal = grandTotal || null;
    const contingencyAmount = quotedTotal && quotedTotal > lineItemsTotal
      ? quotedTotal - lineItemsTotal
      : 0;
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
      const quoteItems = items.map((item: any) => ({
        quote_id: quote.id,
        description: item.description || item.desc || "",
        quantity: parseFloat(item.qty || item.quantity || "0"),
        unit: item.unit || "",
        unit_price: parseFloat(item.unit_price || item.unitPrice || item.rate || "0"),
        total_price: parseFloat(item.total || item.amount || "0"),
      }));

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