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
  confidence: number;
  source: string;
  raw_text: string;
  validation_flags: string[];
}

interface ParseRequest {
  text?: string;
  supplierName?: string;
  phase?: 'detect' | 'normalize' | 'full';
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 45000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

function chunkByLineItems(text: string, maxLinesPerChunk: number = 30): { section: string; content: string; lineCount: number }[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const chunks: { section: string; content: string; lineCount: number }[] = [];

  let currentSection = 'Main';
  let currentLines: string[] = [];

  const looksLikeSubtotal = (line: string): boolean => {
    const lower = line.toLowerCase().trim();
    return /^(sub)?total[\s:]/i.test(lower) ||
           /^grand\s+total/i.test(lower) ||
           /^carried\s+forward/i.test(lower) ||
           /^gst/i.test(lower) ||
           /^p\s*&\s*g/i.test(lower);
  };

  const detectSectionHeader = (line: string): string | null => {
    const patterns = [
      /^([A-Z][A-Za-z\s&-]+)\s+\$[\d,]+\.?\d*/,
      /^([A-Z][A-Z\s&-]+)$/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && line.length < 100) {
        return match[1]?.trim() || match[0]?.trim();
      }
    }
    return null;
  };

  for (const line of lines) {
    const sectionHeader = detectSectionHeader(line);
    if (sectionHeader) {
      if (currentLines.length > 5) {
        chunks.push({
          section: currentSection,
          content: currentLines.join('\n'),
          lineCount: currentLines.length,
        });
        currentLines = [];
      }
      currentSection = sectionHeader;
      currentLines.push(line);
      continue;
    }

    if (looksLikeSubtotal(line)) continue;

    if (currentLines.length >= maxLinesPerChunk) {
      chunks.push({
        section: `${currentSection} (part ${chunks.filter(c => c.section.startsWith(currentSection)).length + 1})`,
        content: currentLines.join('\n'),
        lineCount: currentLines.length,
      });
      currentLines = [];
    }

    currentLines.push(line);
  }

  if (currentLines.length > 5) {
    chunks.push({
      section: currentSection,
      content: currentLines.join('\n'),
      lineCount: currentLines.length,
    });
  }

  console.log(`[Row-Aware Chunker] Created ${chunks.length} chunks from ${lines.length} lines`);
  return chunks;
}

async function detectCandidateRows(text: string, openaiApiKey: string): Promise<{ rows: string[]; confidence: number }> {
  const systemPrompt = `You are a line item detector for construction quotes.

Your ONLY job is to identify which lines are actual line items (products or services with a price).

A line item is any row that has:
- A product or service description
- Any price information (unit rate, total, or both)

IMPORTANT: Quantity and Unit fields are OPTIONAL. Include a line even if:
- The unit column shows "0", "-", "N/A", or is completely blank
- The quantity is missing or appears to be 0
- The unit column contains an unusual value

DO NOT extract:
- Section headers (lines that only name a category with no price breakdown)
- Subtotals / Grand Totals / Summary lines
- GST / tax lines
- Lines with only text and no associated price

Return ONLY the raw text lines that are line items. Do not parse or interpret them.

Return JSON: {"rows": ["raw line 1", "raw line 2", ...]}`;

  const userPrompt = `Identify line item rows from this text:\n\n${text}`;

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_completion_tokens: 4096,
    }),
  }, 30000);

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content);

  return {
    rows: parsed.rows || [],
    confidence: 0.85,
  };
}

async function normalizeRows(rows: string[], section: string, openaiApiKey: string): Promise<LineItem[]> {
  if (rows.length === 0) return [];

  const systemPrompt = `You are a line item normalizer.

For each raw text line, extract:
- description: Product/service name
- qty: Quantity as a number
- unit: Unit of measure (ea, m, LS, etc.) - CRITICAL: If unit is "0", "-", "N/A", or blank, use "ea"
- rate: Unit price as a number
- total: Total price as a number (if present)

CRITICAL RULES:
1. Some tables show "0" or blank in the Unit column. This does NOT mean skip the item.
2. NUMBER FORMAT: Commas are THOUSAND separators, NOT decimal separators
   - "$465,740.00" = 465740.00 (NOT 465.74)
   - "$26,791.50" = 26791.50 (NOT 26.79)
   - "$12,804.00" = 12804.00 (NOT 12.80)

Example: "SuperSTOPPER | 1276 | 0 | $365.00 | $465,740.00" → qty=1276, unit="ea", rate=365.00, total=465740.00

If total is missing, set it to 0 (we'll calculate it later).

Return JSON: {"items": [{"description": "...", "qty": 10, "unit": "ea", "rate": 5.50, "total": 55.00, "confidence": 0.9}]}`;

  const userPrompt = `Normalize these line items:\n\n${rows.join('\n')}`;

  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
      max_completion_tokens: 8192,
    }),
  }, 40000);

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  const parsed = JSON.parse(content);

  return (parsed.items || []).map((item: any, idx: number) => ({
    description: item.description || '',
    qty: parseFloat(String(item.qty || 0)),
    unit: item.unit || 'ea',
    rate: parseFloat(String(item.rate || 0)),
    total: parseFloat(String(item.total || 0)),
    section,
    confidence: item.confidence || 0.8,
    source: 'llm_normalize',
    raw_text: rows[idx] || '',
    validation_flags: [],
  }));
}

function validateAndFixItem(item: LineItem): LineItem {
  const flags: string[] = [];

  if (!item.total && item.qty && item.rate) {
    item.total = Math.round(item.qty * item.rate * 100) / 100;
    flags.push('CALCULATED_TOTAL');
  }

  const expectedTotal = Math.round(item.qty * item.rate * 100) / 100;
  const actualTotal = Math.round(item.total * 100) / 100;
  const diff = Math.abs(expectedTotal - actualTotal);

  if (diff > 0.5) {
    flags.push('MISMATCH');
    item.confidence = Math.max(0.3, item.confidence - 0.2);
  }

  if (!item.description || item.description.length < 3) {
    flags.push('MISSING_DESCRIPTION');
    item.confidence = Math.max(0.2, item.confidence - 0.3);
  }

  if (item.qty <= 0) {
    flags.push('INVALID_QTY');
    item.confidence = Math.max(0.2, item.confidence - 0.3);
  }

  if (item.rate <= 0) {
    flags.push('INVALID_RATE');
    item.confidence = Math.max(0.2, item.confidence - 0.3);
  }

  return {
    ...item,
    validation_flags: flags,
  };
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

    const { data: configData } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "OPENAI_API_KEY")
      .maybeSingle();

    const openaiApiKey = configData?.value || Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({
          error: "OpenAI API key not configured",
          success: false,
          items: [],
          confidence: 0,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { text, supplierName, phase }: ParseRequest = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No text provided", success: false, items: [] }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[LLM v2] Processing ${text.length} characters (phase: ${phase || 'full'})...`);

    const needsChunking = text.length > 5000;
    let allItems: LineItem[] = [];

    if (needsChunking) {
      const chunks = chunkByLineItems(text, 30);
      console.log(`[LLM v2] Processing ${chunks.length} chunks in parallel...`);

      const chunkPromises = chunks.map(async (chunk) => {
        try {
          const detectionResult = await detectCandidateRows(chunk.content, openaiApiKey);

          if (detectionResult.rows.length === 0) {
            console.log(`[LLM v2] Chunk "${chunk.section}" - no candidate rows found`);
            return [];
          }

          console.log(`[LLM v2] Chunk "${chunk.section}" - detected ${detectionResult.rows.length} candidate rows`);

          const normalizedItems = await normalizeRows(detectionResult.rows, chunk.section, openaiApiKey);

          console.log(`[LLM v2] Chunk "${chunk.section}" - normalized ${normalizedItems.length} items`);

          return normalizedItems.map(validateAndFixItem);
        } catch (error) {
          console.error(`[LLM v2] Chunk "${chunk.section}" failed:`, error);
          return [];
        }
      });

      const results = await Promise.all(chunkPromises);
      allItems = results.flat();
    } else {
      console.log('[LLM v2] Processing entire document (no chunking)...');

      const detectionResult = await detectCandidateRows(text, openaiApiKey);
      console.log(`[LLM v2] Detected ${detectionResult.rows.length} candidate rows`);

      if (detectionResult.rows.length > 0) {
        const normalizedItems = await normalizeRows(detectionResult.rows, 'Main', openaiApiKey);
        allItems = normalizedItems.map(validateAndFixItem);
      }
    }

    const validItems = allItems.filter(item => {
      if (item.confidence >= 0.6) return true;
      if (item.total > 0 && item.description && item.description.length >= 3) return true;
      return false;
    });
    const flaggedItems = allItems.filter(item => {
      const isValid = item.confidence >= 0.6 || (item.total > 0 && item.description && item.description.length >= 3);
      return !isValid && item.confidence >= 0.4;
    });

    console.log(`[LLM v2] Extracted ${validItems.length} valid items, ${flaggedItems.length} flagged for review`);

    const subtotal = validItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const avgConfidence = validItems.length > 0
      ? validItems.reduce((sum, item) => sum + item.confidence, 0) / validItems.length
      : 0;

    return new Response(
      JSON.stringify({
        success: true,
        items: validItems,
        lines: validItems,
        flagged_items: flaggedItems,
        confidence: avgConfidence,
        totals: {
          subtotal,
          grandTotal: subtotal,
        },
        metadata: {
          supplier: supplierName,
          itemCount: validItems.length,
          flaggedCount: flaggedItems.length,
          chunked: needsChunking,
          phase: 'two_phase_extraction',
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LLM v2] ERROR:', errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        items: [],
        confidence: 0,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
