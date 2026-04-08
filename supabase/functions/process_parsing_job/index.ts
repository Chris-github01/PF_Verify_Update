import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  cleanText,
  hasMoney,
  hasDesc,
  normalizeLine,
  extractDocumentTotal,
  dedupeKey,
  addRemainderIfNeeded,
  extractFRRFromDescription,
  filterTotalRows,
} from "../_shared/itemNormalizer.ts";

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

async function parseLargeQuoteInChunks(
  text: string,
  supplierName: string,
  llmUrl: string,
  llmHeaders: Record<string, string>
): Promise<any> {
  console.log("Chunking large quote for processing...");

  const lines = text.split('\n');
  const rawChunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;
  const maxChunkSize = 2500;
  const overlapLines = 3;

  for (const line of lines) {
    currentChunk.push(line);
    currentSize += line.length;

    if (currentSize >= maxChunkSize) {
      rawChunks.push([...currentChunk]);
      const overlap = currentChunk.slice(-overlapLines);
      currentChunk = [...overlap];
      currentSize = overlap.reduce((s, l) => s + l.length, 0);
    }
  }

  if (currentChunk.length > 0) {
    rawChunks.push(currentChunk);
  }

  const chunks = rawChunks.map(c => c.join('\n'));

  console.log(`Split into ${chunks.length} chunks`);

  const allItems: any[] = [];
  const allWarnings: string[] = [];
  let totalConfidence = 0;

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(llmUrl, {
        method: "POST",
        headers: llmHeaders,
        body: JSON.stringify({
          text: chunks[i],
          supplierName,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        if (result.items && Array.isArray(result.items)) {
          allItems.push(...result.items);
          totalConfidence += (result.confidence || 0.8);
          if (result.warnings) {
            allWarnings.push(...result.warnings);
          }
          console.log(`Chunk ${i + 1} extracted ${result.items.length} items`);
        }
      } else {
        console.error(`Chunk ${i + 1} failed:`, response.status);
        allWarnings.push(`Chunk ${i + 1} parse failed`);
      }
    } catch (error) {
      console.error(`Error processing chunk ${i + 1}:`, error);
      allWarnings.push(`Chunk ${i + 1} error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return {
    items: allItems,
    totals: {
      grandTotal: allItems.reduce((sum, item) => sum + (item.total || 0), 0),
    },
    metadata: {
      supplier: supplierName,
    },
    confidence: chunks.length > 0 ? totalConfidence / chunks.length : 0,
    warnings: allWarnings,
  };
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
            const overallConfidence = extractorData.confidence_breakdown?.overall || 0;

            // CRITICAL: Only use external parser if confidence >= 0.7
            // This promotes high-quality structured data to "source of truth"
            if (bestResult && bestResult.success && bestResult.items && bestResult.items.length > 0 && overallConfidence >= 0.7) {
              const SUMMARY_ROW_LABELS = new Set([
                'total', 'totals', 'total:', 'grand total', 'grandtotal',
                'quote total', 'contract sum', 'lump sum total', 'overall total',
                'subtotal', 'sub-total', 'sub total', 'net total', 'project total',
                'tender total', 'tender sum', 'contract value', 'total price',
                'total cost', 'total amount', 'total sum', 'contract total',
                'contract price', 'price total',
              ]);

              const isSummaryRow = (desc: string): boolean => {
                const d = desc.replace(/[:\s]+$/, '').trim().toLowerCase();
                if (SUMMARY_ROW_LABELS.has(d)) return true;
                if (/^(grand\s+)?total(\s*(excl|incl|ex|inc)\.?.*)?$/i.test(d)) return true;
                if (/^sub[-\s]?total/i.test(d)) return true;
                if (/^contract\s+(sum|total|value|price)$/i.test(d)) return true;
                return false;
              };

              const allMapped = bestResult.items.map((item: any) => ({
                description: item.description || item.item_description || '',
                qty: parseFloat(item.quantity) || 0,
                unit: item.unit || item.unit_of_measure || '',
                rate: parseFloat(item.unit_price) || 0,
                total: parseFloat(item.total_price || item.line_total) || 0,
                section: item.section || item.category || '',
                item_number: item.item_number || item.item_code || '',
                confidence: overallConfidence,
                source: bestResult.parser_name,
                raw_text: item.raw_text || '',
                validation_flags: []
              }));

              structuredItems = allMapped.filter((item: any) => {
                const desc = String(item.description ?? '').trim();
                if (isSummaryRow(desc)) {
                  console.log(`Filtered summary row from external extractor: "${desc}" ($${item.total})`);
                  return false;
                }
                return true;
              });

              useExternalExtractor = true;
              console.log(`✓ Using external extractor (confidence ${(overallConfidence * 100).toFixed(1)}%) from ${bestResult.parser_name}, ${structuredItems.length} items extracted (${allMapped.length - structuredItems.length} summary rows removed)`);

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
                    confidence: overallConfidence,
                    skip_llm: true
                  },
                  updated_at: new Date().toISOString(),
                })
                .eq("id", jobId);
            } else if (bestResult && bestResult.items && bestResult.items.length > 0) {
              console.log(`⚠ External extractor low confidence (${(overallConfidence * 100).toFixed(1)}%), falling back to LLM parser`);
            } else {
              console.log("External extractor returned no items, falling back to LLM parser");
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

        console.log(`Extracted ${parsedLines.length} lines from document, length: ${fullText.length} chars`);

        await supabase
          .from("parsing_jobs")
          .update({
            progress: 60,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);

        // For large documents, create chunks in database
        if (fullText.length > 4000 || parsedLines.length > 50) {
          console.log("Large document detected, creating chunks...");

          const lines = fullText.split('\n');
          const rawChunks: string[][] = [];
          let currentChunk: string[] = [];
          let currentSize = 0;
          const maxChunkSize = 2500;
          const overlapLines = 3;

          for (const line of lines) {
            currentChunk.push(line);
            currentSize += line.length;

            if (currentSize >= maxChunkSize) {
              rawChunks.push([...currentChunk]);
              const overlap = currentChunk.slice(-overlapLines);
              currentChunk = [...overlap];
              currentSize = overlap.reduce((s, l) => s + l.length, 0);
            }
          }

          if (currentChunk.length > 0) {
            rawChunks.push(currentChunk);
          }

          const chunks = rawChunks.map(c => c.join('\n'));

          console.log(`Created ${chunks.length} chunks, saving to database...`);

          // Create chunk records in database
          const chunkRecords = chunks.map((chunk, index) => ({
            job_id: jobId,
            chunk_number: index + 1,
            total_chunks: chunks.length,
            chunk_text: chunk,
            status: 'pending' as const,
          }));

          const { error: chunksError } = await supabase
            .from("parsing_chunks")
            .insert(chunkRecords);

          if (chunksError) {
            console.error("Failed to create chunks:", chunksError);
            throw new Error(`Failed to create chunks: ${chunksError.message}`);
          }

          // Update job to indicate chunks are ready
          await supabase
            .from("parsing_jobs")
            .update({
              progress: 70,
              status: "processing",
              metadata: { ...(job.metadata || {}), chunks_created: chunks.length },
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);

          console.log(`Chunks created, triggering resume to process them...`);

          // Trigger resume to process the chunks
          const resumeUrl = `${supabaseUrl}/functions/v1/resume_parsing_job`;
          fetch(resumeUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ jobId }),
          }).catch(err => console.error("Failed to trigger resume:", err));

          // Return early - chunks will be processed by resume function
          return new Response(
            JSON.stringify({
              success: true,
              message: "Chunks created, processing started",
              jobId,
              chunks: chunks.length
            }),
            {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }

        // For smaller documents, parse directly with v2 parser
        const llmUrl = `${supabaseUrl}/functions/v1/parse_quote_llm_fallback_v2`;
        const llmHeaders = {
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        };

        console.log("Small document, parsing directly with v2 two-phase parser...");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55000);

        try {
          const llmResponse = await fetch(llmUrl, {
            method: "POST",
            headers: llmHeaders,
            body: JSON.stringify({
              text: fullText,
              supplierName: typedJob.supplier_name,
              phase: 'full',
              trade: typedJob.trade,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!llmResponse.ok) {
            const errorText = await llmResponse.text();
            console.error(`LLM parser HTTP error: ${llmResponse.status} ${llmResponse.statusText}`);
            throw new Error(`LLM parser failed (${llmResponse.status}): ${errorText || llmResponse.statusText}`);
          }

          parsedData = await llmResponse.json();
          console.log(`LLM parser returned ${parsedData.items?.length || 0} items`);

        } catch (error) {
          clearTimeout(timeoutId);
          console.error("Direct parsing failed:", error);
          throw error;
        }

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

        const rawItemsCount = parsedData.items.length;

        // Keep items that have a description AND a non-zero total (or can calculate one from qty*rate)
        // For plumbing, lump-sum items (qty=1, unit=LS, total>0) are always valid even without a rate
        const isLumpSumTrade = (typedJob.trade || '') === 'plumbing' || (typedJob.trade || '') === 'carpentry';
        const basicFiltered = parsedData.items.filter((item: any) => {
          if (!hasDesc(item)) return false;
          const total = Number(item.total ?? item.total_price ?? item.amount ?? 0);
          if (total !== 0) return true;
          if (isLumpSumTrade) return false;
          const qty = Number(item.qty ?? item.quantity ?? 0);
          const rate = Number(item.rate ?? item.unit_price ?? 0);
          return qty > 0 && rate > 0;
        });
        console.log(`After safe filter: ${basicFiltered.length} items (removed ${parsedData.items.length - basicFiltered.length} empty/zero rows)`);

        const { kept: keptItems, removedCount: totalRowsRemoved, removedDescriptions: totalRowDescs } = filterTotalRows(basicFiltered);
        if (totalRowsRemoved > 0) {
          console.log(`Removed ${totalRowsRemoved} total/summary row(s): ${totalRowDescs.join(', ')}`);
        }

        // ✅ Normalize items to fill empty descriptions from raw_text
        const normalizedItems = keptItems.map((item: any, index: number) => normalizeLine(item, index));
        console.log(`After normalization: ${normalizedItems.length} items`);

        // ✅ Extract document total from full text
        let documentTotal: number | null = null;
        if (allPages && allPages.length > 0) {
          const fullText = allPages.join("\n\n");
          documentTotal = extractDocumentTotal(fullText);
          if (documentTotal) {
            console.log(`Extracted document total: $${documentTotal.toLocaleString()}`);
          }
        }

        // ✅ Add remainder adjustment if needed
        const finalItems = addRemainderIfNeeded(normalizedItems, documentTotal);

        const quoteItems = finalItems.map((item: any) => ({
          quote_id: quoteData.id,
          item_number: item.item_number || '',
          description: cleanText(item.description) || 'No description',
          quantity: item.qty || 0,
          unit: item.unit || 'ea',
          unit_price: item.rate || 0,
          total_price: item.total || 0,
          system_id: item.section || '',
          raw_text: item.raw_text || item.description || '',
          confidence: item.confidence || 0.85,
          source: item.source || (useExternalExtractor ? 'external_parser' : 'llm_v2'),
          validation_flags: item.validation_flags || [],
          frr: item.frr || extractFRRFromDescription(cleanText(item.description) || '') || 'Smoke'
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

        // ✅ Calculate totals - prefer line item sum (ground truth) over document total
        // Document totals on cover pages may contain human arithmetic errors.
        // Only fall back to document total when no line items were parsed.
        const calculatedTotal = quoteItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
        const finalTotalAmount = calculatedTotal > 0 ? calculatedTotal : (documentTotal ?? 0);

        // ✅ Update quote with both counts and document total
        await supabase
          .from("quotes")
          .update({
            items_count: quoteItems.length,
            raw_items_count: rawItemsCount,
            inserted_items_count: quoteItems.length,
            total_amount: finalTotalAmount,
            total_price: finalTotalAmount
          })
          .eq("id", quoteData.id);

        console.log(`Raw parsed: ${rawItemsCount}, Inserted: ${quoteItems.length}, Document total: $${finalTotalAmount.toLocaleString()}`);
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