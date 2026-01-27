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

DETECT QUOTE TYPE FIRST:

TYPE A - ITEMIZED QUOTE (each line has its own price):
Item | Qty | Rate | Total
Switchboard | 1 | $5,000 | $5,000
Cable tray | 100m | $50/m | $5,000
→ Extract each line item with its individual total

TYPE B - LUMP SUM QUOTE (only section totals shown):
Civil work And Cable Tray
  Pit type 66: 10.00
  Conduit duct 50mm: 110.00
  Cable tray 300mm: 30.00
  Sub-Total ex GST: $109,312.10
→ Extract ONE line: "Civil work And Cable Tray - Lump Sum" | Qty: 1 | Total: $109,312.10

FOR TYPE A QUOTES:
- Extract each line item with description, qty, unit, rate, and INDIVIDUAL total
- Skip subtotals, GST, and grand totals

FOR TYPE B QUOTES (LUMP SUM):
- Extract ONE line item PER SECTION using the section subtotal
- Format: "{Section Name} - Lump Sum" | Qty: 1 | Unit: "LS" | Total: {section subtotal}
- Example sections: "Civil work And Cable Tray", "First fix", "Second fix", "Audio/Visual"

CRITICAL: If individual line prices are NOT shown (only quantities), this is TYPE B - extract section lump sums.

Return JSON format:
{
  "items": [{"description": "string", "qty": number, "unit": "string", "rate": number, "total": number, "section": "string"}],
  "confidence": number,
  "warnings": ["string"],
  "quoteType": "itemized" or "lumpsum"
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

    let items = parsed.items || [];
    console.log(`[LLM Fallback] Extracted ${items.length} items`);

    // CRITICAL FIX: Detect if parser assigned section subtotal to all items
    // If 10+ items share the exact same total, this is a parsing error
    const totalFrequency = new Map<number, number>();
    items.forEach(item => {
      const total = item.total || 0;
      totalFrequency.set(total, (totalFrequency.get(total) || 0) + 1);
    });

    const maxFrequency = Math.max(...Array.from(totalFrequency.values()));
    const hasDuplicateTotals = maxFrequency >= 10;

    if (hasDuplicateTotals) {
      console.warn(`[LLM Fallback] DETECTED PARSING ERROR: ${maxFrequency} items with identical total - recalculating from qty × rate`);
      items = items.map(item => {
        const qty = parseFloat(String(item.qty || 0));
        const rate = parseFloat(String(item.rate || 0));
        const calculatedTotal = qty * rate;

        if (calculatedTotal > 0 && calculatedTotal !== item.total) {
          console.log(`[LLM Fallback] Fixed: ${item.description} - Total: ${item.total} → ${calculatedTotal.toFixed(2)}`);
          return {
            ...item,
            total: calculatedTotal
          };
        }
        return item;
      });
    }

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
