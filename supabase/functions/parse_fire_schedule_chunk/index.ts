import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SYSTEM_PROMPT = `You are an expert at extracting passive fire schedule data from construction documents.

Your task is to extract all rows from fire schedules/appendices in the provided PDF chunk. Each row represents a fire penetration or compartmentation detail.

Extract the following fields for EVERY row you find:
- solution_id: Unique identifier or reference number
- system_classification: Type of fire stopping system (e.g., "Penetration", "Linear Gap", "Cavity Barrier")
- substrate: Wall/floor type (e.g., "Concrete", "Blockwork", "Plasterboard")
- orientation: "Vertical" or "Horizontal"
- frr_rating: Fire resistance rating (e.g., "120 minutes", "2 hours")
- service_type: Type of service passing through (e.g., "Cables", "Pipes", "Ductwork")
- service_size_text: Free-text description of service size
- service_size_min_mm: Minimum service size in millimeters (number only)
- service_size_max_mm: Maximum service size in millimeters (number only)
- insulation_type: Type of insulation used
- insulation_thickness_mm: Insulation thickness in millimeters (number only)
- test_reference: Certificate or test reference number
- notes: Any additional notes or comments
- raw_text: The complete raw text of this row
- parse_confidence: Your confidence in the extraction (0.0 to 1.0)
- page_number: Page number where this row was found

Be thorough and extract EVERY row, even if some fields are missing. Set fields to null if not present.

Return a JSON object with this exact structure:
{
  "rows": [array of row objects],
  "metadata": {
    "total_rows": number,
    "average_confidence": number,
    "low_confidence_count": number,
    "parsing_notes": "any relevant notes about this chunk"
  }
}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RENDER_PDF_EXTRACTOR_API_KEY = Deno.env.get("RENDER_PDF_EXTRACTOR_API_KEY");
const RENDER_BASE_URL = "https://verify-pdf-extractor.onrender.com";

async function extractPdfText(pdfBase64: string): Promise<string> {
  if (RENDER_PDF_EXTRACTOR_API_KEY) {
    try {
      console.log("Step 1: Attempting professional Render PDF parser...");

      const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', blob, 'schedule.pdf');

      const response = await fetch(`${RENDER_BASE_URL}/parse/pdfplumber`, {
        method: 'POST',
        headers: {
          'X-API-Key': RENDER_PDF_EXTRACTOR_API_KEY
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✓ Render parser succeeded");

        let extractedText = '';
        if (result.text) {
          extractedText = result.text;
        }

        if (result.tables && Array.isArray(result.tables)) {
          extractedText += '\n\nTABLES:\n';
          result.tables.forEach((table: any, idx: number) => {
            extractedText += `\nTable ${idx + 1}:\n`;
            if (table.rows && Array.isArray(table.rows)) {
              table.rows.forEach((row: string[]) => {
                extractedText += row.join(' | ') + '\n';
              });
            }
          });
        }

        return extractedText;
      } else {
        console.log("✗ Render parser failed - using fallback");
      }
    } catch (err) {
      console.log("✗ Render parser error (will use fallback):", err);
    }
  }

  console.log("Step 1: Using basic fallback text extraction");
  const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
  const text = new TextDecoder().decode(pdfBytes);

  const streamRegex = /stream\s*(.*?)\s*endstream/gs;
  const matches = [...text.matchAll(streamRegex)];

  let extracted = '';
  for (const match of matches) {
    extracted += match[1] + '\n';
  }

  return extracted || text;
}

async function callOpenAIWithText(text: string): Promise<any> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  console.log(`Sending ${text.length} characters to OpenAI GPT-4o for chunk parsing...`);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `Extract all fire schedule rows from this PDF chunk:\n\n${text}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 16000
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
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

    const extractedText = await extractPdfText(pdfBase64);
    console.log(`Extracted ${extractedText.length} characters from chunk`);

    const result = await callOpenAIWithText(extractedText);

    console.log(`✓ Success: ${result.rows?.length || 0} rows from chunk ${chunkId}`);

    return new Response(
      JSON.stringify({
        success: true,
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
