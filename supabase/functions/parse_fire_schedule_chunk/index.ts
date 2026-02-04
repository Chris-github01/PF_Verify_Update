import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RENDER_PDF_EXTRACTOR_API_KEY = Deno.env.get("RENDER_PDF_EXTRACTOR_API_KEY");
const RENDER_BASE_URL = "https://verify-pdf-extractor.onrender.com";

async function parseFireScheduleChunk(pdfBase64: string): Promise<any> {
  if (!RENDER_PDF_EXTRACTOR_API_KEY) {
    throw new Error("RENDER_PDF_EXTRACTOR_API_KEY not configured");
  }

  console.log("Sending PDF chunk to dedicated fire schedule parser...");

  const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('file', blob, 'schedule_chunk.pdf');

  const response = await fetch(`${RENDER_BASE_URL}/parse/fire_schedule`, {
    method: 'POST',
    headers: {
      'X-API-Key': RENDER_PDF_EXTRACTOR_API_KEY
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fire schedule parser error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  console.log(`✓ Parser returned: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Rows found: ${result.rows?.length || 0}`);
  console.log(`Parsing notes: ${result.metadata?.parsing_notes}`);

  return result;
}

// Removed: OpenAI parsing - now using dedicated Python fire schedule parser

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
    const body = await req.json();
    console.log("Request body parsed, keys:", Object.keys(body));

    const { pdfBase64, chunkId, startPage, endPage } = body;

    if (!pdfBase64) {
      console.error("Missing required fields. pdfBase64:", !!pdfBase64);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: pdfBase64"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`✓ Valid request - Parsing chunk ${chunkId || 'unknown'} (pages ${startPage}-${endPage})`);
    console.log("PDF chunk size:", pdfBase64.length, "bytes (base64)");

    // Use dedicated Python fire schedule parser
    const result = await parseFireScheduleChunk(pdfBase64);

    console.log(`✓ Parsing complete: ${result.rows?.length || 0} rows from chunk ${chunkId}`);

    if (!result.success || !result.rows || result.rows.length === 0) {
      console.warn("⚠ WARNING: Parser returned 0 rows for this chunk");
      console.warn("Parsing notes:", result.metadata?.parsing_notes);
    }

    return new Response(
      JSON.stringify({
        success: result.success,
        rows: result.rows || [],
        metadata: {
          ...result.metadata,
          chunk_id: chunkId,
          start_page: startPage,
          end_page: endPage
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error parsing fire schedule chunk:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
