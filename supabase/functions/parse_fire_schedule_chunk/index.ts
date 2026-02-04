import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SYSTEM_PROMPT = `You are an expert at extracting passive fire schedule data from construction documents.

CRITICAL: You MUST find and extract ALL rows from any fire protection schedule/appendix tables in the document.
These tables may appear anywhere in the document - scan ALL pages thoroughly.

Fire schedules typically have these characteristics:
- Table format with multiple columns
- Row-oriented data about fire protection systems
- May include: System classifications, FRR ratings, service types, sizes, products, test references
- Product names often include: Ryafire, Nullifire, Hilti, Sika, Passive, Intumescent, Mastic, Collar, Wrap
- Test references like: EN 1366, BS 476, EI ratings, REI ratings
- Solution/Passive Solution IDs (often alphanumeric codes like PS-01, PS-12, etc.)

Extract these fields for EVERY row you find:
- solution_id: Passive Solution ID or reference (e.g., PS-01, PS-12) - check last column especially
- system_classification: Fire protection system type (e.g., Fire Protection, Cavity Barrier, Linear Seal, Penetration)
- substrate: Wall/floor substrate (e.g., Blockwork, Concrete, Plasterboard, Timber)
- orientation: Usually "Wall", "Vertical", or "Horizontal"
- frr_rating: Fire resistance rating (e.g., 120, 60 minutes, 2hr, EI 120)
- service_type: Service being protected (e.g., Copper Pipe, Cable, HVAC, Ductwork, Multiple services)
- service_size_text: Size description from the document
- service_size_min_mm: Minimum size in mm (extract number only)
- service_size_max_mm: Maximum size in mm (extract number only)
- insulation_type: Insulation type if mentioned (e.g., Fibreglass, Thermaflex)
- insulation_thickness_mm: Insulation thickness in mm (number only)
- test_reference: Test certificate or standard (e.g., EN 1366, BS 476, EI 120/25, FRT 100/25)
- notes: Any notes, options, or additional details from the row
- raw_text: Complete text from this row
- parse_confidence: Your confidence (0.0 to 1.0) - use 0.9+ if you see clear fire protection data
- page_number: Page number (estimate if not clear)

IMPORTANT RULES:
1. Extract EVERY row from fire schedule tables, even with missing data
2. If a field is unclear or missing, set it to null
3. Look for tables across ALL pages in this chunk
4. Product names in "Passive Fire Stopping System" or "Option 1/2/3" columns are valuable - include in notes
5. Multiple options in one row are common - capture all in notes field
6. If you see ANY fire protection products, test references, or FRR ratings, extract that row

Return this exact JSON structure:
{
  "rows": [array of row objects],
  "metadata": {
    "total_rows": number,
    "average_confidence": number,
    "low_confidence_count": number,
    "parsing_notes": "Description of what you found"
  }
}

If you don't find any schedule tables, still return the structure with empty rows array and explain in parsing_notes what the chunk contained.`;

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

        // PRIORITIZE TABLES - put them first and with clear markers
        if (result.tables && Array.isArray(result.tables) && result.tables.length > 0) {
          extractedText += '=== FIRE SCHEDULE TABLES FOUND ===\n\n';
          result.tables.forEach((table: any, idx: number) => {
            extractedText += `\n--- TABLE ${idx + 1} START ---\n`;
            if (table.rows && Array.isArray(table.rows)) {
              table.rows.forEach((row: string[], rowIdx: number) => {
                // Format as structured row data
                extractedText += `ROW ${rowIdx}: ` + row.join(' | ') + '\n';
              });
            }
            extractedText += `--- TABLE ${idx + 1} END ---\n\n`;
          });
          console.log(`Found ${result.tables.length} tables with ${result.tables.reduce((sum: number, t: any) => sum + (t.rows?.length || 0), 0)} total rows`);
        } else {
          console.log("⚠ No tables found in PDF chunk");
        }

        // Add regular text after tables
        if (result.text) {
          extractedText += '\n\n=== DOCUMENT TEXT ===\n' + result.text;
        }

        if (!extractedText.includes('TABLE')) {
          console.warn("⚠ WARNING: No table markers found - OpenAI may not find schedule data");
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

  // Log sample of text to debug
  const textSample = text.substring(0, 500);
  console.log("Text sample being sent:", textSample);
  console.log(`Text contains 'TABLE': ${text.includes('TABLE')}`);
  console.log(`Text contains 'ROW': ${text.includes('ROW')}`);

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
  const parsed = JSON.parse(data.choices[0].message.content);

  console.log("OpenAI returned:", JSON.stringify(parsed).substring(0, 500));
  console.log(`OpenAI found ${parsed.rows?.length || 0} rows`);

  return parsed;
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

    if (extractedText.length < 100) {
      console.error("⚠ WARNING: Extracted text is suspiciously short!");
      return new Response(
        JSON.stringify({
          success: false,
          rows: [],
          metadata: {
            total_rows: 0,
            average_confidence: 0,
            low_confidence_count: 0,
            parsing_notes: "PDF extraction failed - text too short"
          },
          error: "Failed to extract meaningful text from PDF chunk"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const result = await callOpenAIWithText(extractedText);

    console.log(`✓ Success: ${result.rows?.length || 0} rows from chunk ${chunkId}`);

    if (!result.rows || result.rows.length === 0) {
      console.warn("⚠ WARNING: OpenAI returned 0 rows for this chunk");
      console.warn("Parsing notes:", result.metadata?.parsing_notes);
    }

    return new Response(
      JSON.stringify({
        success: result.rows && result.rows.length > 0,
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
