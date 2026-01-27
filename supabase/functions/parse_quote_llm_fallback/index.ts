import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LineItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  section?: string;
}

interface ParseRequest {
  text?: string;
  chunks?: any;
  supplierName?: string;
  documentType?: string;
  chunkInfo?: string;
}

interface ParseResponse {
  success: boolean;
  items: LineItem[];
  totals: {
    subtotal?: number;
    gst?: number;
    grandTotal?: number;
  };
  metadata: {
    supplier?: string;
    project?: string;
    date?: string;
    reference?: string;
  };
  confidence: number;
  warnings: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("npm:@supabase/supabase-js@2.57.4");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Use maybeSingle() to handle missing config gracefully
    const { data: configData, error: configError } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "OPENAI_API_KEY")
      .maybeSingle();

    const openaiApiKey = configData?.value || Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      console.error('[LLM Fallback] No OpenAI API key found');
      return new Response(
        JSON.stringify({
          error: "OpenAI API key not configured",
          success: false,
          items: [],
          confidence: 0,
          warnings: ["OpenAI API key not configured in system_config"]
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

    console.log('[LLM Fallback] OpenAI API key found, parsing quote...');

    const { text, supplierName }: ParseRequest = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No text provided", success: false, items: [], confidence: 0, warnings: [] }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const textLength = text.length;
    console.log(`[LLM Fallback] Processing ${textLength} characters...`);

    // Create extraction prompt
    const systemPrompt = `You are an expert at extracting line items from construction quotes.

Extract ALL line items with these fields:
- description: detailed item description
- qty: quantity (number)
- unit: unit of measure (EA, M, Nr, etc)
- rate: unit price (calculate from total/qty if not shown)
- total: total price for THIS INDIVIDUAL LINE ITEM ONLY
- section: category/section name if visible

CRITICAL RULES:
1. Extract ONLY actual line items with their INDIVIDUAL totals
2. NEVER use section subtotals (like "Sub-Total ex GST", "Total inc GST") as line item totals
3. Skip ALL rows containing: "Sub-Total", "Total inc", "GST", "Grand Total"
4. Skip section headers and category names
5. Each line item should have its OWN unique total, not shared totals

COMMON MISTAKE TO AVOID:
❌ WRONG: Assigning section subtotal ($598,744.78) to every item in that section
✅ CORRECT: Each item has its own total based on quantity × rate

Quote Structure Examples:
- If you see "Pit type 66 - Qty: 10.00 - $1,093.12", the total is $1,093.12 (NOT the section subtotal)
- If you see "Cable tray 300mm - Qty: 30.00", calculate its individual total
- Section subtotals like "Sub-Total ex GST $109,312.10" are NOT line items

Additional guidance for ELECTRICAL quotes:
- Electrical proposals often contain section-level subtotals (e.g., "Electrical TOTAL", "Security & Data TOTAL", "Cable Tray TOTAL") — do NOT extract those as line items.
- Extract the underlying package lines inside each section (e.g., "Switchboard Panels", "Cable-Power (Installed Terminated)", "Lightning Protection Level 4", "Access Control", "CCTV", "Preliminary and General Overheads", "Seismic Bracing Materials & Installation", "Seismic Engineering").
- If a quote includes corrections/credits (e.g., "Cable supply price error", "Removal of exit lighting ... -$X"), extract them as line items with negative totals when shown.
- Preserve the section name if visible (Electrical, Security & Data, Cable Tray, Corrections, etc.).

Return JSON format:
{
  "items": [{"description": "string", "qty": number, "unit": "string", "rate": number, "total": number, "section": "string"}],
  "confidence": number,
  "warnings": ["string"]
}`;

    const userPrompt = `Extract all line items from this quote:\n\n${text}\n\n${supplierName ? `Supplier: ${supplierName}` : ''}`;

    console.log('[LLM Fallback] Calling OpenAI API...');

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_completion_tokens: 16384,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('[LLM Fallback] OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiResult = await openaiResponse.json();
    const content = openaiResult.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    console.log('[LLM Fallback] Got response from OpenAI, parsing...');
    const parsed: ParseResponse = JSON.parse(content);

    const items = parsed.items || [];
    console.log(`[LLM Fallback] Extracted ${items.length} items`);

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        lines: items,
        items: items,
        confidence: parsed.confidence || 0.85,
        warnings: parsed.warnings || [],
        totals: {
          subtotal,
          grandTotal: subtotal
        },
        metadata: {
          supplier: supplierName,
          itemCount: items.length
        }
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (error) {
    console.error('[LLM Fallback] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lines: [],
        items: [],
        totals: {},
        metadata: {},
        confidence: 0,
        warnings: ['Parse failed'],
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
