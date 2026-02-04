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

const FIRE_SCHEDULE_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          solution_id: { type: "string", description: "Fire stop reference or solution ID (e.g., 'PFP-001', 'FS-123')" },
          system_classification: { type: "string", description: "System type (e.g., 'Penetration Seal', 'Linear Joint Seal')" },
          substrate: { type: "string", description: "Wall/floor type (e.g., 'Concrete', 'Plasterboard', 'Masonry')" },
          orientation: { type: "string", description: "Horizontal or Vertical" },
          frr_rating: { type: "string", description: "Fire resistance rating (e.g., '120 mins', '-/120/120', '2 hours')" },
          service_type: { type: "string", description: "Type of penetration (e.g., 'Electrical', 'Plumbing', 'HVAC', 'Cable', 'Pipe', 'Duct')" },
          service_size_text: { type: "string", description: "Size as written in schedule (e.g., 'Ø110', '0-50mm', '750x200')" },
          service_size_min_mm: { type: "number", description: "Minimum service size in millimeters" },
          service_size_max_mm: { type: "number", description: "Maximum service size in millimeters" },
          insulation_type: { type: "string", description: "Insulation material if specified" },
          insulation_thickness_mm: { type: "number", description: "Insulation thickness in millimeters" },
          test_reference: { type: "string", description: "Test certification reference (e.g., 'WARRES', 'BRE', 'CERTIFIRE')" },
          notes: { type: "string", description: "Any additional notes or comments" },
          raw_text: { type: "string", description: "The complete raw text of this schedule row" },
          parse_confidence: { type: "number", description: "Confidence score 0-1 for this row's extraction" },
          page_number: { type: "number", description: "Page number where this row appears" },
          row_index: { type: "number", description: "Row number within the schedule" }
        },
        required: ["raw_text", "parse_confidence", "page_number", "row_index"]
      }
    },
    metadata: {
      type: "object",
      properties: {
        schedule_section_found: { type: "boolean" },
        start_page: { type: "number" },
        end_page: { type: "number" },
        parsing_notes: { type: "string" }
      }
    }
  },
  required: ["rows", "metadata"]
};

const SYSTEM_PROMPT = `You are an expert at extracting structured data from Fire Engineer schedules (also called Passive Fire Schedules, Fire Stopping Schedules, or Appendix A).

Your task is to:
1. Identify the Passive Fire Schedule section in the PDF
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

Return a JSON object matching the schema with all rows and metadata.`;

async function extractTextFromPDF(pdfBase64: string): Promise<string> {
  try {
    // Import pdf-parse from npm
    const pdfParse = (await import("npm:pdf-parse@1.1.1")).default;

    // Convert base64 to Buffer
    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    const buffer = Buffer.from(pdfBytes);

    // Parse the PDF
    const data = await pdfParse(buffer);

    if (!data.text || data.text.length < 100) {
      throw new Error("PDF appears to be empty or contains only images. OCR may be required.");
    }

    console.log(`Extracted ${data.text.length} characters from ${data.numpages} pages`);

    return data.text;
  } catch (error) {
    console.error("PDF extraction error:", error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function callOpenAI(extractedText: string): Promise<any> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

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
          content: `Please extract all fire schedule rows from this PDF text. Look for sections titled 'Passive Fire Schedule', 'Fire Stopping Schedule', 'Appendix A', or similar. Extract every row with maximum detail.\n\nPDF Content:\n${extractedText}`
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

    // Step 1: Extract text from PDF
    console.log("Extracting text from PDF...");
    const extractedText = await extractTextFromPDF(pdfBase64);

    if (!extractedText || extractedText.length < 100) {
      throw new Error("Failed to extract meaningful text from PDF. The PDF may be empty or corrupted.");
    }

    console.log(`Extracted ${extractedText.length} characters from PDF`);

    // Step 2: Parse with OpenAI
    console.log("Sending to OpenAI for intelligent parsing...");
    const result = await callOpenAI(extractedText);

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
        parsing_notes: result.metadata?.parsing_notes || "Successfully parsed fire schedule"
      }
    };

    console.log(`Successfully parsed ${totalRows} rows with ${(avgConfidence * 100).toFixed(1)}% avg confidence`);

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
