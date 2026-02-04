import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

async function parseFireScheduleChunk(pdfBase64: string): Promise<any> {
  console.log("Parsing fire schedule chunk using OpenAI GPT-4o with vision...");

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const systemPrompt = `You are an expert at parsing fire engineer schedules (fire stopping schedules). These schedules contain tables with:

CRITICAL: Only extract data from the actual schedule tables. Ignore:
- Product sheets (pages with "PS-01", "PS-02", etc.)
- Installation instructions
- Drawing title blocks and headers
- General notes sections

Schedule table markers:
- Headers like "PASSIVE FIRE SCHEDULE" or "FIRE AND SMOKE STOPPING SOLUTIONS"
- Column headers: "Service", "Material", "Size", "Insulation", "Orientation", "FRR", "Substrate", "Fire Stop Reference", "Fire Stop Products"

Extract ONLY from schedule table rows containing:
- Service Type (Fire Hydrant, Cable Tray, Sanitary Waste, Heating Hot Water, etc.)
- Material (Steel uninsulated, PVC, Copper, etc.)
- Size (15-150mm, Ø110, 600mm wide, etc.)
- PFP codes (PFP001, PFP009, etc.)
- Fire stop product names (Ryanfire 502, Protecta FR Acrylic, BOSS FireMastic, Hilti, Promat, etc.)

Return ONLY rows that are clearly part of the schedule table.`;

  const userPrompt = `Parse the fire schedule from this PDF page. Extract ONLY schedule table rows.

For each schedule row, extract:
{
  "solution_id": "PFP code or null",
  "service_type": "Service - Material (combined)",
  "service_size_text": "original size text",
  "service_size_min_mm": number or null,
  "service_size_max_mm": number or null,
  "insulation_thickness_mm": number or null,
  "system_classification": "substrate type",
  "orientation": "WALL or FLOOR",
  "frr_rating": "e.g., -/60/60",
  "fire_stop_products": "product list",
  "substrate_requirements": "requirements text",
  "test_reference": "PFP code",
  "raw_text": "all fields concatenated",
  "parse_confidence": 0.0-1.0
}

Rules:
1. Skip header rows, title blocks, general notes
2. Only extract rows with service types or PFP codes
3. If a cell spans multiple substrate columns, create separate rows for each substrate
4. Set parse_confidence based on completeness: 0.9 if all key fields present, 0.7 if most fields, 0.5 if partial

Return JSON:
{
  "success": true,
  "rows": [...],
  "metadata": {
    "parsing_notes": ["what was found"],
    "total_rows": number
  }
}`;

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
    console.error("OpenAI API error:", errorText);
    throw new Error(`OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const openaiResult = await response.json();
  const content = openaiResult.choices[0].message.content;

  let parsedResult;
  try {
    parsedResult = JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse OpenAI response:", content);
    throw new Error(`Failed to parse OpenAI response as JSON: ${error}`);
  }

  console.log(`✓ Parser returned: ${parsedResult.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`Rows found: ${parsedResult.rows?.length || 0}`);
  console.log(`Parsing notes: ${JSON.stringify(parsedResult.metadata?.parsing_notes || [])}`);

  return parsedResult;
}

Deno.serve(async (req: Request) => {
  console.log(`[Fire Schedule Chunk] ${req.method} ${req.url}`);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { pdfBase64, chunkId, startPage, endPage } = body;

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing pdfBase64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing chunk ${chunkId || 'unknown'} (pages ${startPage}-${endPage})`);
    console.log(`PDF chunk size: ${pdfBase64.length} bytes (base64)`);

    const result = await parseFireScheduleChunk(pdfBase64);

    console.log(`✓ Extracted ${result.rows?.length || 0} rows from chunk ${chunkId}`);

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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Fire Schedule Chunk] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        rows: [],
        metadata: { parsing_notes: ["Parse failed due to error"] }
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
