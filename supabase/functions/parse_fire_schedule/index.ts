import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

const SYSTEM_PROMPT = `You are an expert at extracting structured data from Fire Engineer schedules (also called Passive Fire Schedules, Fire Stopping Schedules, or Appendix A).

You will receive:
1. Extracted text from the PDF
2. Extracted table data with rows and columns
3. Page-by-page text content

Your task is to:
1. Identify the Passive Fire Schedule section
2. Extract EVERY row from the schedule table
3. Parse each field accurately with structured data
4. Assign a confidence score (0-1) to each row based on completeness

CRITICAL FIELD PARSING RULES:

**Solution ID / Fire Stop Reference:**
- Look for alphanumeric codes like "PFP-001", "FS-123", "A.1.1"
- This is typically the first column
- MUST be present for high confidence

**FRR Rating (Fire Resistance Rating):**
- Formats: "120 mins", "2 hours", "-/120/120", "120/120/120"
- Extract as written, do not convert units
- CRITICAL field for confidence scoring

**Service Size:**
- Parse text format (service_size_text): Exactly as written
- Extract min/max in millimeters:
  - "Ø110" → min=110, max=110
  - "0-50mm" → min=0, max=50
  - "750x200" → min=200, max=750 (use smaller as min, larger as max)
  - "Up to 300mm" → min=0, max=300
  - "100-200" → min=100, max=200
- If unclear, set min/max to null but keep the text

**Service Type:**
- Categories: Electrical, Plumbing, HVAC, Cable, Pipe, Duct, Mixed
- Look for keywords: "cable", "pipe", "duct", "electrical", "plumbing", "HVAC"
- Can extract from description or notes

**Substrate:**
- Common: Concrete, Plasterboard, Masonry, Timber, Blockwork
- Extract from substrate/wall column

**System Classification:**
- Types: "Penetration Seal", "Linear Joint Seal", "Fire Door", "Cavity Barrier"
- Extract from system type column or description

**Test Reference:**
- Certification bodies: WARRES, BRE, CERTIFIRE, EXOVA, IFC
- Format: Usually code like "WF123456" or "BRE 12345"

**Confidence Scoring:**
- 1.0 = All critical fields present (solution_id, frr_rating, service_size, substrate)
- 0.9 = One minor field missing
- 0.8 = Service size unclear but other fields present
- 0.7 = Multiple fields missing but core data intact
- 0.6 = Significant data gaps
- 0.5 or below = Row is unclear or incomplete

**Raw Text:**
- Capture the complete original text of the row for audit trail

Return a JSON object with this structure:
{
  "rows": [array of ScheduleRow objects],
  "metadata": {
    "schedule_section_found": boolean,
    "start_page": number,
    "end_page": number,
    "parsing_notes": string
  }
}`;

const PDF_EXTRACTOR_URL = 'https://verify-pdf-extractor.onrender.com';

async function callRenderParser(pdfBase64: string): Promise<any> {
  const PDF_PARSER_API_KEY = Deno.env.get("RENDER_PDF_EXTRACTOR_API_KEY");

  console.log("Calling Render PDF parser service...");

  // Convert base64 to blob for form data
  const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });

  const formData = new FormData();
  formData.append('file', blob, 'fire_schedule.pdf');

  const response = await fetch(`${PDF_EXTRACTOR_URL}/parse/pdfplumber`, {
    method: 'POST',
    headers: {
      'X-API-Key': PDF_PARSER_API_KEY || 'dev-key-change-in-production',
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Render parser error:", errorText);
    throw new Error(`Render PDF parser failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  console.log("Render parser response:", JSON.stringify(data).substring(0, 500));

  return data;
}

async function callOpenAIWithExtractedData(renderData: any, pdfBase64: string): Promise<any> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Build comprehensive context from Render extraction
  let context = "PDF EXTRACTION RESULTS:\n\n";

  if (renderData.text) {
    context += `FULL TEXT:\n${renderData.text}\n\n`;
  }

  if (renderData.tables && Array.isArray(renderData.tables)) {
    context += `EXTRACTED TABLES (${renderData.tables.length} found):\n`;
    renderData.tables.forEach((table: any, idx: number) => {
      context += `\nTable ${idx + 1} (Page ${table.page || 'unknown'}):\n`;
      if (table.rows && Array.isArray(table.rows)) {
        table.rows.forEach((row: string[], rowIdx: number) => {
          context += `Row ${rowIdx + 1}: ${row.join(' | ')}\n`;
        });
      }
    });
  }

  if (renderData.metadata) {
    context += `\nMETADATA:\n${JSON.stringify(renderData.metadata, null, 2)}\n`;
  }

  console.log(`Sending ${context.length} characters to OpenAI for intelligent parsing...`);

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
          content: `Please extract all fire schedule rows from the following extracted PDF data. Look for sections titled 'Passive Fire Schedule', 'Fire Stopping Schedule', 'Appendix A', or similar. Extract every row with maximum detail.\n\n${context}`
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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { pdfBase64, fileName, projectId }: ParseRequest = await req.json();

    if (!pdfBase64 || !projectId) {
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

    console.log(`Parsing fire schedule: ${fileName} for project ${projectId}`);

    // Step 1: Extract structured data using Render Python service
    console.log("Step 1: Calling Render PDF parser (pdfplumber with table extraction)...");
    const renderData = await callRenderParser(pdfBase64);

    if (!renderData || (!renderData.text && !renderData.tables)) {
      throw new Error("Render parser returned empty results. PDF may be image-based or corrupted.");
    }

    console.log(`Step 1 complete: Extracted ${renderData.text?.length || 0} chars, ${renderData.tables?.length || 0} tables`);

    // Step 2: Use OpenAI's LMM to intelligently parse the extracted data
    console.log("Step 2: Sending to OpenAI LMM for intelligent fire schedule parsing...");
    const result = await callOpenAIWithExtractedData(renderData, pdfBase64);

    if (!result.rows || !Array.isArray(result.rows)) {
      throw new Error("Invalid response structure from OpenAI");
    }

    const rows: ScheduleRow[] = result.rows;
    const totalRows = rows.length;
    const avgConfidence = rows.reduce((sum, r) => sum + (r.parse_confidence || 0), 0) / totalRows;
    const lowConfidenceCount = rows.filter(r => (r.parse_confidence || 0) < 0.7).length;

    const response: ParseResponse = {
      success: true,
      rows: rows,
      metadata: {
        total_rows: totalRows,
        average_confidence: avgConfidence,
        low_confidence_count: lowConfidenceCount,
        parsing_notes: result.metadata?.parsing_notes || "Successfully parsed fire schedule using Render + OpenAI pipeline"
      }
    };

    console.log(`Success: Parsed ${totalRows} rows with ${(avgConfidence * 100).toFixed(1)}% avg confidence`);

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
