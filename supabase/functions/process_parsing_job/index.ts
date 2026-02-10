import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PDF_EXTRACTOR_BASE_URL = Deno.env.get("PDF_EXTRACTOR_BASE_URL") || "https://verify-pdf-extractor.onrender.com";
const PYTHON_PARSER_API_KEY = Deno.env.get("PYTHON_PARSER_API_KEY");

interface ParsingJob {
  id: string;
  project_id: string;
  quote_id: string | null;
  supplier_name: string;
  filename: string;
  file_url: string;
  organisation_id: string;
  user_id: string;
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

    const { jobId } = await req.json();

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Missing jobId" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: job, error: jobError } = await supabase
      .from("parsing_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      throw new Error("Job not found");
    }

    const typedJob = job as unknown as ParsingJob;

    await supabase
      .from("parsing_jobs")
      .update({
        status: "processing",
        progress: 10,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("quotes")
      .download(typedJob.file_url);

    if (downloadError || !fileData) {
      await supabase
        .from("parsing_jobs")
        .update({
          status: "failed",
          error_message: "Failed to download file",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      throw new Error("Failed to download file");
    }

    await supabase
      .from("parsing_jobs")
      .update({
        progress: 30,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    const fileBuffer = await fileData.arrayBuffer();
    const fileName = typedJob.filename.toLowerCase();
    let parsedLines = [];

    try {
      let allPages: string[] = [];
      let useExternalExtractor = false;
      let structuredItems: any[] | null = null;

      if (fileName.endsWith(".pdf")) {
        console.log("Attempting to use external PDF extractor API...");

        try {
          const file = new File([fileBuffer], typedJob.filename, { type: "application/pdf" });
          const formData = new FormData();
          formData.append("file", file);

          const headers: Record<string, string> = {};
          if (PYTHON_PARSER_API_KEY) {
            headers["X-API-Key"] = PYTHON_PARSER_API_KEY;
          }

          const extractorResponse = await fetch(`${PDF_EXTRACTOR_BASE_URL}/parse/ensemble`, {
            method: "POST",
            headers,
            body: formData,
          });

          if (extractorResponse.ok) {
            const extractorData = await extractorResponse.json();
            console.log("External PDF extractor succeeded:", {
              recommendation: extractorData.recommendation,
              parsers_succeeded: extractorData.confidence_breakdown?.parsers_succeeded,
              overall_confidence: extractorData.confidence_breakdown?.overall,
              best_parser: extractorData.confidence_breakdown?.best_parser
            });

            const bestResult = extractorData.best_result;
            if (bestResult && bestResult.success && bestResult.items && bestResult.items.length > 0) {
              structuredItems = bestResult.items.map((item: any) => ({
                description: item.description || item.item_description || '',
                qty: parseFloat(item.quantity) || 0,
                unit: item.unit || item.unit_of_measure || '',
                rate: parseFloat(item.unit_price) || 0,
                total: parseFloat(item.total_price || item.line_total) || 0,
                section: item.section || item.category || '',
                item_number: item.item_number || item.item_code || ''
              }));

              useExternalExtractor = true;
              console.log(`Using external extractor result from ${bestResult.parser_name}, ${structuredItems.length} items extracted`);

              await supabase
                .from("parsing_jobs")
                .update({
                  progress: 80,
                  metadata: {
                    extractor_used: "external_ensemble",
                    recommendation: extractorData.recommendation,
                    parsers_succeeded: extractorData.confidence_breakdown?.parsers_succeeded || 0,
                    parsers_attempted: extractorData.confidence_breakdown?.parsers_attempted || 0,
                    best_parser: bestResult.parser_name,
                    items_count: structuredItems.length,
                    confidence: bestResult.confidence_score
                  },
                  updated_at: new Date().toISOString(),
                })
                .eq("id", jobId);
            } else {
              console.log("External extractor returned no items, falling back to built-in parser");
            }
          } else {
            const errorText = await extractorResponse.text();
            console.log(`External extractor failed with status ${extractorResponse.status}: ${errorText}, falling back to built-in parser`);
          }
        } catch (extractorError) {
          console.log("External extractor error, falling back to built-in parser:", extractorError.message);
        }

        if (!useExternalExtractor) {
          console.log("Processing PDF file with built-in text extraction...");

        const pdfjsLib = await import("npm:pdfjs-dist@4.0.379");

        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(fileBuffer),
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
        });

        const pdfDocument = await loadingTask.promise;
        const numPages = pdfDocument.numPages;
        console.log(`PDF has ${numPages} pages, extracting text...`);

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdfDocument.getPage(pageNum);
          const textContent = await page.getTextContent();

          let lastY = -1;
          let pageText = '';

          textContent.items.forEach((item: any) => {
            const currentY = item.transform[5];
            if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
              pageText += '\n';
            } else if (pageText.length > 0) {
              pageText += ' ';
            }
            pageText += item.str;
            lastY = currentY;
          });

          if (pageText.trim()) {
            allPages.push(pageText);
          }
        }

        await supabase
          .from("parsing_jobs")
          .update({
            progress: 40,
            metadata: { extractor_used: "built-in", num_pages: numPages },
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }

      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        console.log("Processing Excel file...");
        const XLSX = await import("npm:xlsx@0.18.5");
        const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: "array" });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

        const textLines = rows
          .map((row) => row.map((cell) => String(cell || "").trim()).join("\t"))
          .filter((line) => line.trim());

        allPages.push(textLines.join("\n"));

        await supabase
          .from("parsing_jobs")
          .update({
            progress: 40,
            metadata: { extractor_used: "xlsx", rows_count: rows.length },
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      } else {
        throw new Error("Unsupported file type");
      }

      let parsedData;
      if (structuredItems && structuredItems.length > 0) {
        console.log(`Using ${structuredItems.length} structured items from external extractor`);
        parsedData = {
          success: true,
          items: structuredItems,
          totals: {
            subtotal: structuredItems.reduce((sum, item) => sum + (item.total || 0), 0),
            gst: 0,
            grandTotal: structuredItems.reduce((sum, item) => sum + (item.total || 0), 0)
          },
          metadata: {
            supplier: typedJob.supplier_name
          },
          confidence: 0.9,
          warnings: []
        };
      } else {
        const fullText = allPages.join("\n\n");
        parsedLines = fullText.split("\n").map((line) => line.trim()).filter(Boolean);

        console.log(`Extracted ${parsedLines.length} lines from document`);

        await supabase
          .from("parsing_jobs")
          .update({
            progress: 60,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);

        const llmUrl = `${supabaseUrl}/functions/v1/parse_quote_llm_fallback`;
        const llmHeaders = {
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        };

        console.log("Sending to LLM fallback parser...");
        const llmResponse = await fetch(llmUrl, {
          method: "POST",
          headers: llmHeaders,
          body: JSON.stringify({
            text: fullText,
            supplierName: typedJob.supplier_name,
          }),
        });

        if (!llmResponse.ok) {
          const errorText = await llmResponse.text();
          console.error(`LLM parser HTTP error: ${llmResponse.status} ${llmResponse.statusText}`);
          console.error(`LLM parser error body:`, errorText);
          throw new Error(`LLM parser failed (${llmResponse.status}): ${errorText || llmResponse.statusText}`);
        }

        parsedData = await llmResponse.json();
        console.log(`LLM parser returned ${parsedData.items?.length || 0} items`);

        await supabase
          .from("parsing_jobs")
          .update({
            progress: 80,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }

      let quoteData;

      // If quote_id is provided, this is a revision - update the existing quote
      if (typedJob.quote_id) {
        console.log(`Updating existing quote ${typedJob.quote_id}`);

        const { data: updatedQuote, error: updateError } = await supabase
          .from("quotes")
          .update({
            status: 'pending',
            total_amount: parsedData.totals?.grandTotal || 0,
            total_price: parsedData.totals?.grandTotal || 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', typedJob.quote_id)
          .select()
          .single();

        if (updateError || !updatedQuote) {
          console.error("Failed to update quote:", updateError);
          throw new Error(`Failed to update quote: ${updateError?.message}`);
        }

        quoteData = updatedQuote;
        console.log(`Updated quote ${quoteData.id} for supplier ${typedJob.supplier_name}`);
      } else {
        // Create new quote
        // Determine revision number based on dashboard mode
        const dashboardMode = (job.metadata as any)?.dashboard_mode || "original";
        let revisionNumber = 1;

        if (dashboardMode === "revisions") {
          // Get the latest revision number for this supplier
          const { data: latestQuote } = await supabase
            .from("quotes")
            .select("revision_number")
            .eq("project_id", typedJob.project_id)
            .eq("supplier_name", typedJob.supplier_name)
            .order("revision_number", { ascending: false })
            .limit(1)
            .maybeSingle();

          revisionNumber = latestQuote && latestQuote.revision_number
            ? latestQuote.revision_number + 1
            : 2;
          console.log(`Setting revision number: ${revisionNumber} for supplier ${typedJob.supplier_name} in ${dashboardMode} mode`);
        }

        const { data: newQuote, error: quoteError } = await supabase
          .from("quotes")
          .insert({
            project_id: typedJob.project_id,
            supplier_name: typedJob.supplier_name,
            organisation_id: typedJob.organisation_id,
            status: 'pending',
            total_amount: parsedData.totals?.grandTotal || 0,
            created_by: typedJob.user_id,
            revision_number: revisionNumber,
            trade: typedJob.trade || 'passive_fire'
          })
          .select()
          .single();

        if (quoteError || !newQuote) {
          console.error("Failed to create quote:", quoteError);
          throw new Error(`Failed to create quote: ${quoteError?.message}`);
        }

        quoteData = newQuote;
        console.log(`Created quote ${quoteData.id} with revision ${revisionNumber} for supplier ${typedJob.supplier_name}`);
      }

      if (parsedData.items && parsedData.items.length > 0) {
        // If this is an update (revision), delete old items first
        if (typedJob.quote_id) {
          console.log(`Deleting old quote items for quote ${quoteData.id}`);
          await supabase
            .from("quote_items")
            .delete()
            .eq("quote_id", quoteData.id);
        }

        const quoteItems = parsedData.items.map((item: any) => ({
          quote_id: quoteData.id,
          item_number: item.item_number || '',
          description: item.description || '',
          quantity: item.qty || 0,
          unit: item.unit || '',
          unit_price: item.rate || 0,
          total_price: item.total || 0,
          system_id: item.section || ''
        }));

        const { error: itemsError } = await supabase
          .from("quote_items")
          .insert(quoteItems);

        if (itemsError) {
          console.error("Failed to create quote items:", itemsError);
          await supabase.from("quotes").delete().eq("id", quoteData.id);
          throw new Error(`Failed to create quote items: ${itemsError.message}`);
        }

        console.log(`Created ${quoteItems.length} quote items`);

        const calculatedTotal = quoteItems.reduce((sum, item) => sum + (item.total_price || 0), 0);

        await supabase
          .from("quotes")
          .update({
            items_count: quoteItems.length,
            total_amount: calculatedTotal,
            total_price: calculatedTotal
          })
          .eq("id", quoteData.id);
      }

      await supabase
        .from("parsing_jobs")
        .update({
          status: "completed",
          progress: 100,
          result_data: parsedData,
          quote_id: quoteData.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      return new Response(
        JSON.stringify({
          success: true,
          jobId,
          quoteId: quoteData.id,
          itemCount: parsedData.items?.length || 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (parseError) {
      console.error("Parsing error:", parseError);

      await supabase
        .from("parsing_jobs")
        .update({
          status: "failed",
          error_message: parseError.message || "Parsing failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      throw parseError;
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
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