import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ParseRequest {
  pdfBase64: string;
  fileName: string;
  projectId: string;
}

interface ScheduleRow {
  solution_id: string | null;
  system_classification: string | null;
  substrate: string | null;
  orientation: string | null;
  frr_rating: string | null;
  service_type: string | null;
  service_size_text: string | null;
  service_size_min_mm: number | null;
  service_size_max_mm: number | null;
  insulation_type: string | null;
  insulation_thickness_mm: number | null;
  test_reference: string | null;
  notes: string | null;
  raw_text: string;
  parse_confidence: number;
  page_number: number;
  row_index: number;
}

interface ParseResponse {
  success: boolean;
  rows: ScheduleRow[];
  metadata: {
    total_rows: number;
    average_confidence: number;
    low_confidence_count: number;
    parsing_notes: string;
  };
  error?: string;
}

async function chunkPdfDocument(pdfBase64: string, pagesPerChunk: number = 5): Promise<string[]> {
  console.log(`Chunking PDF into ${pagesPerChunk}-page segments...`);

  const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
  const srcDoc = await PDFDocument.load(pdfBytes);
  const totalPages = srcDoc.getPageCount();

  console.log(`Total pages: ${totalPages}`);

  const chunks: string[] = [];

  for (let i = 0; i < totalPages; i += pagesPerChunk) {
    const end = Math.min(i + pagesPerChunk, totalPages);
    const newDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - i }, (_, k) => i + k);
    const pages = await newDoc.copyPages(srcDoc, pageIndices);
    pages.forEach((p) => newDoc.addPage(p));

    const chunkBytes = await newDoc.save();

    // Convert to base64 safely (avoid stack overflow from spreading large arrays)
    let binary = '';
    const len = chunkBytes.length;
    const chunkSize = 8192; // Process in 8KB chunks to avoid stack overflow

    for (let j = 0; j < len; j += chunkSize) {
      const slice = chunkBytes.slice(j, Math.min(j + chunkSize, len));
      binary += String.fromCharCode(...slice);
    }

    const chunkBase64 = btoa(binary);

    chunks.push(chunkBase64);
    console.log(`Created chunk ${chunks.length}: pages ${i + 1}-${end} (${chunkBase64.length} bytes base64)`);
  }

  return chunks;
}

async function parseChunk(
  chunkBase64: string,
  chunkIndex: number,
  startPage: number,
  endPage: number,
  authToken: string
): Promise<any> {
  const chunkFunctionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/parse_fire_schedule_chunk`;

  console.log(`Parsing chunk ${chunkIndex + 1} (pages ${startPage}-${endPage})...`);

  const response = await fetch(chunkFunctionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": authToken,
    },
    body: JSON.stringify({
      pdfBase64: chunkBase64,
      chunkId: `chunk_${chunkIndex}`,
      startPage,
      endPage,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Chunk ${chunkIndex + 1} failed:`, errorText);
    throw new Error(`Chunk ${chunkIndex + 1} parsing failed: ${errorText}`);
  }

  const result = await response.json();
  console.log(`✓ Chunk ${chunkIndex + 1}: ${result.rows?.length || 0} rows extracted`);

  return result;
}

Deno.serve(async (req: Request) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);

  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight request");
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log("Parsing request body...");
    const requestBody = await req.json();
    console.log("Request body parsed, keys:", Object.keys(requestBody));

    const { pdfBase64, fileName, projectId } = requestBody as ParseRequest;

    if (!pdfBase64 || !projectId) {
      console.error("Missing required fields. pdfBase64:", !!pdfBase64, "projectId:", !!projectId);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: pdfBase64 and projectId"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`✓ Valid request - Parsing fire schedule: ${fileName} for project ${projectId}`);
    console.log(`PDF size: ${pdfBase64.length} bytes (base64)`);

    const authToken = req.headers.get("Authorization") || "";

    // Step 1: Chunk the PDF (5 pages per chunk to stay under token limits)
    console.log("Step 1: Chunking PDF into smaller segments...");
    const chunks = await chunkPdfDocument(pdfBase64, 5);
    console.log(`✓ Created ${chunks.length} chunks`);

    // Step 2: Parse each chunk in parallel
    console.log("Step 2: Parsing all chunks...");
    const chunkPromises = chunks.map((chunkBase64, index) => {
      const startPage = index * 5 + 1;
      const endPage = Math.min(startPage + 4, startPage + Math.floor(chunkBase64.length / 1000));
      return parseChunk(chunkBase64, index, startPage, endPage, authToken);
    });

    const chunkResults = await Promise.all(chunkPromises);

    // Step 3: Combine all results
    console.log("Step 3: Combining results from all chunks...");
    const allRows: ScheduleRow[] = [];
    let totalConfidence = 0;
    let totalRows = 0;

    chunkResults.forEach((chunkResult, index) => {
      if (chunkResult.success && chunkResult.rows) {
        const rows = chunkResult.rows;
        allRows.push(...rows);
        totalRows += rows.length;
        totalConfidence += rows.reduce((sum: number, r: any) => sum + (r.parse_confidence || 0), 0);
        console.log(`Chunk ${index + 1}: Added ${rows.length} rows`);
      }
    });

    const avgConfidence = totalRows > 0 ? totalConfidence / totalRows : 0;
    const lowConfidenceCount = allRows.filter(r => (r.parse_confidence || 0) < 0.7).length;

    const response: ParseResponse = {
      success: true,
      rows: allRows,
      metadata: {
        total_rows: totalRows,
        average_confidence: avgConfidence,
        low_confidence_count: lowConfidenceCount,
        parsing_notes: `Successfully parsed ${chunks.length} chunks using chunked OpenAI GPT-4o processing`
      }
    };

    console.log(`✓ SUCCESS: Total ${totalRows} rows, ${(avgConfidence * 100).toFixed(1)}% avg confidence from ${chunks.length} chunks`);

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error parsing fire schedule:", error);

    const errorResponse: ParseResponse = {
      success: false,
      rows: [],
      metadata: {
        total_rows: 0,
        average_confidence: 0,
        low_confidence_count: 0,
        parsing_notes: "Parse failed"
      },
      error: error instanceof Error ? error.message : "Unknown error"
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
