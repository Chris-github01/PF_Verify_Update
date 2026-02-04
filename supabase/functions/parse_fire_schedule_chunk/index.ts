import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RENDER_PDF_EXTRACTOR_API_KEY = Deno.env.get("RENDER_PDF_EXTRACTOR_API_KEY");
const RENDER_BASE_URL = "https://verify-pdf-extractor.onrender.com";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

async function extractTextFromPDF(pdfBase64: string): Promise<string> {
  console.log("Extracting text from PDF using pdfplumber fallback...");

  const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('file', blob, 'schedule_chunk.pdf');

  // Try Python service first for text extraction
  if (RENDER_PDF_EXTRACTOR_API_KEY) {
    try {
      const response = await fetch(`${RENDER_BASE_URL}/parse/pdfplumber`, {
        method: 'POST',
        headers: {
          'X-API-Key': RENDER_PDF_EXTRACTOR_API_KEY
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        return result.text || "";
      }
    } catch (error) {
      console.warn("Python service text extraction failed, will use OpenAI vision:", error);
    }
  }

  return ""; // Will use vision-only approach
}

async function parseFireScheduleChunk(pdfBase64: string): Promise<any> {
  console.log("Parsing fire schedule chunk using OpenAI GPT-4o with vision...");

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Extract text first (optional)
  const extractedText = await extractTextFromPDF(pdfBase64);

  const systemPrompt = `You are an expert at parsing fire engineer schedules. These schedules typically contain:

- Service Type (e.g., "Fire Hydrant", "Cable Tray", "Sanitary Waste")
- Material (e.g., "Steel uninsulated", "PVC", "Copper")
- Size (e.g., "15-150mm", "Ø110", "600mm wide")
- Insulation thickness
- Fire Stop Reference codes (e.g., "PFP001", "PFP009")
- Substrate types (e.g., "Masonry 120", "Plasterboard 60", "Korok 60")
- FRR ratings (e.g., "-/60/60", "-/120/120")
- Fire Stop Products (product names like "Ryanfire 502", "Protecta FR Acrylic")
- Substrate Requirements (installation notes)

Extract ALL rows from the schedule, even if some fields are missing. Return structured data for each row.`;

  const userPrompt = `Parse this fire schedule page and extract all rows into structured data.

${extractedText ? `Extracted text (may help):\n${extractedText.substring(0, 3000)}\n\n` : ''}

For each row, extract:
- solution_id (PFP code if present)
- service_type (e.g., "Fire Hydrant - Steel uninsulated")
- service_size_text (e.g., "15-150mm")
- service_size_min_mm and service_size_max_mm (parsed numbers)
- insulation_thickness_mm (number)
- system_classification (substrate type)
- orientation ("WALL" or "FLOOR")
- frr_rating (e.g., "-/60/60")
- fire_stop_products (product list)
- substrate_requirements (installation notes)
- test_reference (reference codes)
- raw_text (concatenate all fields)
- parse_confidence (0.0-1.0)

Return JSON: { "success": true, "rows": [...], "metadata": { "parsing_notes": "..." } }`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${pdfBase64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const openaiResult = await response.json();
  const content = openaiResult.choices[0].message.content;

  let parsedResult;
  try {
    parsedResult = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse OpenAI response as JSON: ${error}`);
  }

  console.log(`✓ Parser returned: ${parsedResult.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Rows found: ${parsedResult.rows?.length || 0}`);

  return parsedResult;
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
