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

You will receive extracted data from a PDF which may include:
1. Full text content
2. Extracted table data with rows and columns (if available)
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

async function tryRenderParser(pdfBase64: string): Promise<any | null> {
  try {
    const PDF_PARSER_API_KEY = Deno.env.get("RENDER_PDF_EXTRACTOR_API_KEY");

    console.log("Attempting Render PDF parser service...");

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
      console.warn("Render parser failed:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log("Render parser succeeded:", JSON.stringify(data).substring(0, 300));
    return data;

  } catch (error) {
    console.warn("Render parser error (will use fallback):", error);
    return null;
  }
}

async function fallbackTextExtraction(pdfBase64: string): Promise<string> {
  try {
    console.log("Using ultra-lightweight fallback extraction (basic text extraction)...");

    // Decode base64 to bytes
    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    console.log(`PDF decoded: ${pdfBytes.length} bytes`);

    // Convert to string and extract text between parentheses (PDF text objects)
    const pdfString = new TextDecoder('latin1').decode(pdfBytes);

    // Extract text from PDF string objects: (text content)
    const textMatches = pdfString.match(/\(([^)]{2,})\)/g);

    if (!textMatches || textMatches.length === 0) {
      console.warn("No text objects found in PDF - may be image-based or compressed");
      throw new Error("PDF appears to be image-based or uses unsupported compression. The Render service is required for this PDF.");
    }

    // Clean and combine text
    let fullText = textMatches
      .map(match => {
        // Remove parentheses and unescape PDF strings
        let text = match.slice(1, -1);
        text = text.replace(/\\n/g, '\n');
        text = text.replace(/\\r/g, '\r');
        text = text.replace(/\\t/g, '\t');
        text = text.replace(/\\\(/g, '(');
        text = text.replace(/\\\)/g, ')');
        text = text.replace(/\\\\/g, '\\');
        return text;
      })
      .filter(text => text.trim().length > 0)
      .join(' ');

    if (!fullText || fullText.length < 50) {
      throw new Error(`PDF text extraction failed (only ${fullText.length} chars). This PDF requires the Render service for proper extraction.`);
    }

    console.log(`✓ Fallback extraction: ${fullText.length} characters extracted (basic mode)`);

    return fullText;
  } catch (error) {
    console.error("Fallback extraction error:", error);
    throw new Error(`Fallback extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}. The Render PDF service is recommended for optimal results.`);
  }
}

function intelligentlyFilterScheduleContent(text: string): string {
  console.log(`Intelligently filtering schedule content from ${text.length} chars...`);

  // Look for fire schedule sections
  const scheduleKeywords = [
    'passive fire schedule',
    'fire stopping schedule',
    'fire stop schedule',
    'appendix a',
    'penetration schedule',
    'solution id',
    'frr rating',
    'fire resistance'
  ];

  const lowerText = text.toLowerCase();

  // Find the start of the schedule section
  let scheduleStart = -1;
  for (const keyword of scheduleKeywords) {
    const index = lowerText.indexOf(keyword);
    if (index !== -1 && (scheduleStart === -1 || index < scheduleStart)) {
      scheduleStart = index;
    }
  }

  if (scheduleStart === -1) {
    console.log("No schedule keywords found - using full text with truncation");
    scheduleStart = 0;
  } else {
    // Start a bit before the keyword for context
    scheduleStart = Math.max(0, scheduleStart - 500);
    console.log(`Found schedule section starting at char ${scheduleStart}`);
  }

  // Extract from schedule start
  let relevantText = text.slice(scheduleStart);

  // Look for the end (common ending phrases)
  const endKeywords = [
    'end of schedule',
    'notes:',
    'signed:',
    'approved by:',
    'revision history'
  ];

  let scheduleEnd = relevantText.length;
  for (const keyword of endKeywords) {
    const index = relevantText.toLowerCase().lastIndexOf(keyword);
    if (index !== -1 && index < scheduleEnd) {
      scheduleEnd = index + keyword.length + 200; // Include a bit after
    }
  }

  relevantText = relevantText.slice(0, scheduleEnd);

  // Token limit: gpt-4o has 128k context limit
  // System prompt ~5k tokens + response 16k tokens = 21k tokens overhead
  // Available: 128k - 21k = 107k tokens max for content
  // However, we're seeing issues, so be VERY conservative
  // Rough estimate: 1 token ≈ 4 characters (can be less for dense text)
  // SAFE limit: 80k characters ≈ 20k tokens (leaves 87k tokens buffer)
  const MAX_CHARS = 80000;

  console.log(`Before truncation: ${relevantText.length} chars (~${Math.floor(relevantText.length / 3)} tokens)`);

  if (relevantText.length > MAX_CHARS) {
    console.log(`⚠️ TRUNCATING from ${relevantText.length} to ${MAX_CHARS} chars`);
    relevantText = relevantText.slice(0, MAX_CHARS);
    relevantText += "\n\n[... content truncated to fit token limit. Please ensure the fire schedule table is in the first pages of the PDF ...]";
  }

  console.log(`✓ Final filtered content: ${relevantText.length} chars (~${Math.floor(relevantText.length / 3)} tokens)`);
  return relevantText;
}

async function callOpenAIWithData(extractionData: any, extractionMethod: string): Promise<any> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Build context based on extraction method
  let rawContent = '';

  if (typeof extractionData === 'string') {
    // Simple text extraction
    rawContent = extractionData;
  } else {
    // Render extraction with tables
    if (extractionData.text) {
      rawContent = extractionData.text;
    }

    // Append table data if available
    if (extractionData.tables && Array.isArray(extractionData.tables)) {
      rawContent += `\n\nEXTRACTED TABLES (${extractionData.tables.length} found):\n`;
      extractionData.tables.forEach((table: any, idx: number) => {
        rawContent += `\nTable ${idx + 1} (Page ${table.page || 'unknown'}):\n`;
        if (table.rows && Array.isArray(table.rows)) {
          table.rows.forEach((row: string[], rowIdx: number) => {
            rawContent += `${row.join(' | ')}\n`;
          });
        }
      });
    }
  }

  // Intelligently filter and truncate content
  const filteredContent = intelligentlyFilterScheduleContent(rawContent);

  const context = `EXTRACTION METHOD: ${extractionMethod}\n\n${filteredContent}`;

  console.log(`Sending ${context.length} characters (~${Math.floor(context.length / 4)} tokens) to OpenAI...`);

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
          content: `Please extract all fire schedule rows from the following PDF data. Look for sections titled 'Passive Fire Schedule', 'Fire Stopping Schedule', 'Appendix A', or similar. Extract every row with maximum detail.\n\n${context}`
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

    let extractionData: any;
    let extractionMethod: string;

    // Step 1: Try Render PDF parser (preferred)
    console.log("Step 1: Attempting professional Render PDF parser...");
    const renderData = await tryRenderParser(pdfBase64);

    if (renderData && (renderData.text || renderData.tables)) {
      console.log("✓ Render parser succeeded - using high-quality extraction");
      extractionData = renderData;
      extractionMethod = "Render pdfplumber (professional table extraction)";
    } else {
      console.log("✗ Render parser unavailable - using fallback extraction");
      extractionData = await fallbackTextExtraction(pdfBase64);
      extractionMethod = "Fallback text extraction (pdf-parse)";
    }

    // Step 2: ALWAYS use OpenAI LMM for intelligent parsing (PRIMARY FUNCTION)
    console.log("Step 2: Sending to OpenAI GPT-4 LMM (PRIMARY INTELLIGENCE)...");
    const result = await callOpenAIWithData(extractionData, extractionMethod);

    if (!result.rows || !Array.isArray(result.rows)) {
      throw new Error("Invalid response structure from OpenAI LMM");
    }

    const rows: ScheduleRow[] = result.rows;
    const totalRows = rows.length;
    const avgConfidence = rows.reduce((sum, r) => sum + (r.parse_confidence || 0), 0) / totalRows;
    const lowConfidenceCount = rows.filter(r => (r.parse_confidence || 0) < 0.7).length;

    const parsingNotes = result.metadata?.parsing_notes ||
      `Successfully parsed using ${extractionMethod} + OpenAI GPT-4 LMM intelligence`;

    const response: ParseResponse = {
      success: true,
      rows: rows,
      metadata: {
        total_rows: totalRows,
        average_confidence: avgConfidence,
        low_confidence_count: lowConfidenceCount,
        parsing_notes: parsingNotes
      }
    };

    console.log(`✓ Success: ${totalRows} rows, ${(avgConfidence * 100).toFixed(1)}% confidence via ${extractionMethod}`);

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
