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
  frr?: string;
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

/**
 * Extract document totals from raw text
 */
function extractDocumentTotals(text: string) {
  const t = text.replace(/\u00A0/g, " ").replace(/\s+/g, " ");

  const parseMoney = (s: string) => {
    const cleaned = String(s).replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    return (parsed > 0 && Number.isFinite(parsed)) ? parsed : null;
  };

  const grab = (re: RegExp) => {
    const m = t.match(re);
    return m ? parseMoney(m[1]) : null;
  };

  let grandExcl = grab(/Grand\s+Total\s*\(excluding\s+GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  if (!grandExcl) grandExcl = grab(/Grand\s+Total\s*\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  if (!grandExcl) grandExcl = grab(/Grand\s+Total\s+excl\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  if (!grandExcl) grandExcl = grab(/Grand\s+Total\s+ex\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const gst = grab(/GST\s*\(10%\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) || grab(/GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
  const grandIncl = grab(/Grand\s+Total\s*\(including\s+GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) || grab(/Grand\s+Total\s+incl\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  return {
    grand_total_excl_gst: grandExcl,
    gst_amount: gst,
    grand_total_incl_gst: grandIncl
  };
}

/**
 * Fetch with timeout protection
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 50000): Promise<Response> {
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

/**
 * Detect if quote needs to be chunked based on size and structure
 */
function shouldChunkQuote(text: string): boolean {
  // Chunk if text is over 5,000 characters (more aggressive to avoid timeouts)
  if (text.length > 5000) return true;

  // Count line items - if more than 30 items, chunk it
  const itemLinePattern = /^\s*\d+\s+ea\s+\$[\d,]+/gim;
  const itemCount = (text.match(itemLinePattern) || []).length;
  if (itemCount > 30) return true;

  return false;
}

/**
 * Chunk by lines with overlap to prevent losing items between chunks
 */
function chunkByLinesWithOverlap(text: string, maxChars = 3200, overlapLines = 10): { section: string; content: string }[] {
  const lines = text.split('\n');
  const chunks: { section: string; content: string }[] = [];
  let current: string[] = [];
  let chunkNum = 1;

  for (let i = 0; i < lines.length; i++) {
    current.push(lines[i]);
    const joined = current.join('\n');

    if (joined.length >= maxChars) {
      chunks.push({
        section: `Section ${chunkNum}`,
        content: joined
      });
      chunkNum++;

      // Keep overlap lines for next chunk
      current = current.slice(Math.max(0, current.length - overlapLines));
    }
  }

  if (current.length) {
    chunks.push({
      section: `Section ${chunkNum}`,
      content: current.join('\n')
    });
  }

  console.log(`[LLM Fallback] Created ${chunks.length} chunks with ${overlapLines}-line overlap`);
  return chunks;
}

/**
 * Chunk quote by detecting section headers or by fixed size
 */
function chunkQuoteBySection(text: string): { section: string; content: string }[] {
  const chunks: { section: string; content: string }[] = [];

  // Common section header patterns in construction quotes
  const sectionPatterns = [
    /^([A-Z][A-Za-z\s]+)\s+\$[\d,]+\.?\d*/m,  // "Greenhouse $21,964.00"
    /^([A-Z][A-Za-z\s]+)\s+continued/im,       // "Headhouse Continued"
    /^([A-Z][A-Za-z\s]+)$/m,                   // "Lab", "Outbuilding", etc.
  ];

  const lines = text.split('\n');
  let currentSection = 'Main';
  let currentContent: string[] = [];
  const overlapLines = 10; // Keep 10 lines overlap between sections

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if this is a section header
    let isSectionHeader = false;
    for (const pattern of sectionPatterns) {
      const match = line.match(pattern);
      if (match && line.length < 100) { // Section headers are typically short
        // Save previous section with overlap
        if (currentContent.length > 10) { // Minimum lines for a valid section
          chunks.push({
            section: currentSection,
            content: currentContent.join('\n')
          });
        }

        // Start new section, keeping overlap from previous
        const overlap = currentContent.slice(Math.max(0, currentContent.length - overlapLines));
        currentSection = match[1].trim();
        currentContent = [...overlap, line];
        isSectionHeader = true;
        break;
      }
    }

    if (!isSectionHeader) {
      currentContent.push(line);

      // Force chunk if section gets too large (3000 chars)
      const currentSize = currentContent.join('\n').length;
      if (currentSize > 3000) {
        chunks.push({
          section: `${currentSection} (part ${chunks.filter(c => c.section.startsWith(currentSection)).length + 1})`,
          content: currentContent.join('\n')
        });
        // Keep overlap for next part
        currentContent = currentContent.slice(Math.max(0, currentContent.length - overlapLines));
      }
    }
  }

  // Add last section
  if (currentContent.length > 10) {
    chunks.push({
      section: currentSection,
      content: currentContent.join('\n')
    });
  }

  // If section detection failed (only 1 chunk), split by fixed size with overlap
  if (chunks.length === 1 && chunks[0].content.length > 4000) {
    console.log('[LLM Fallback] Section detection failed, using line-based chunking with overlap');
    return chunkByLinesWithOverlap(text, 3200, 10);
  }

  console.log(`[LLM Fallback] Split quote into ${chunks.length} sections with overlap:`, chunks.map(c => c.section));

  return chunks;
}

/**
 * Fallback: chunk by fixed character size
 */
function chunkByFixedSize(text: string, maxSize: number): { section: string; content: string }[] {
  const chunks: { section: string; content: string }[] = [];
  const lines = text.split('\n');
  let currentContent: string[] = [];
  let chunkNum = 1;

  for (const line of lines) {
    currentContent.push(line);
    const currentSize = currentContent.join('\n').length;

    if (currentSize >= maxSize) {
      chunks.push({
        section: `Section ${chunkNum}`,
        content: currentContent.join('\n')
      });
      currentContent = [];
      chunkNum++;
    }
  }

  // Add remaining content
  if (currentContent.length > 0) {
    chunks.push({
      section: `Section ${chunkNum}`,
      content: currentContent.join('\n')
    });
  }

  console.log(`[LLM Fallback] Fixed-size chunking created ${chunks.length} chunks`);
  return chunks;
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

    // Check if we need to chunk the quote
    const needsChunking = shouldChunkQuote(text);
    console.log(`[LLM Fallback] Quote needs chunking: ${needsChunking}`);

    // Create extraction prompt
    const systemPrompt = `You are an expert at extracting line items from construction quotes with hierarchical structures.

CRITICAL: Quotes often have a hierarchical structure:
- Section summaries (e.g., "Greenhouse $21,964.00") - DO NOT EXTRACT
- Subsection summaries (e.g., "Electrical Services Fire stopping $1,948.50") - DO NOT EXTRACT
- Individual line items with quantity, unit, rate (e.g., "Protecta FR Acrylic... 19 ea $35.50 $674.50") - EXTRACT THESE

You MUST extract individual line items. An item is valid if it has:
1. A description (product/service name)
2. A quantity AND a unit rate AND a total

SKIP ONLY these:
- Lines with ONLY a description and total (no qty or rate at all)
- Lines with "Sub-Total", "Grand Total", "Subtotal", "P&G", "Margin"
- Section header lines that aggregate other items

Extract each valid line item with:
- description: Full item description including product name and specifications
- qty: Quantity (number only, e.g., 19 or 1276)
- unit: Unit of measure. IF THE UNIT COLUMN SHOWS "0", "N/A", "-", OR IS EMPTY, YOU MUST USE "ea". NEVER output unit=0.
- rate: Unit price (number only, e.g., 35.50 or 365.00)
- total: Total price (number only)
- section: Section name if present
- frr: Fire Resistance Rating if mentioned (e.g., "90/90/-"). Leave empty if not found.

CRITICAL: HANDLING UNIT FIELD
- Some tables show "0", "N/A", "-", or blank in the Unit column
- This does NOT mean skip the item - it means default to "ea" (each)
- Example: "SuperSTOPPER | 1276 | 0 | $365.00 | $465,740.00" → qty=1276, unit="ea", rate=365.00
- NEVER EVER skip an item just because the unit column is "0", blank, or "N/A"
- If you see qty and rate but unit is "0" or missing, SET unit="ea" and EXTRACT THE ITEM

CRITICAL: HANDLING MULTI-LINE ITEMS
- Some items have description on one line, and numbers on the next line
- Example:
  "Trafalgar SuperSTOPPER Maxi (Multi-Service)   350x125x250mm   New Gib Wall
   1276   0   $365.00   $465,740.00"
- This is ONE ITEM: description="Trafalgar SuperSTOPPER...", qty=1276, unit="ea", rate=365.00, total=465740.00
- ALWAYS look at the PREVIOUS line if you see a line that starts with numbers
- Join multi-line items together - they are a SINGLE item
- The "0" is the unit column (default to "ea")

VALIDATION:
- Every extracted item MUST have qty × rate = total (within rounding)
- If you can't find qty AND rate, it's probably a summary - SKIP IT
- Items with qty and rate but missing/zero unit are VALID - use unit="ea"
- If numbers don't match description, look at surrounding lines - it may be split across lines

Return JSON format:
{
  "items": [{"description": "string", "qty": number, "unit": "string", "rate": number, "total": number, "section": "string", "frr": "string"}],
  "confidence": number,
  "warnings": ["string"]
}`;

    let allItems: LineItem[] = [];
    let allWarnings: string[] = [];
    let overallConfidence = 0;

    // Process quote in chunks if needed
    if (needsChunking) {
      const chunks = chunkQuoteBySection(text);
      console.log(`[LLM Fallback] Processing ${chunks.length} chunks...`);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`[LLM Fallback] Processing chunk ${i + 1}/${chunks.length}: ${chunk.section} (${chunk.content.length} chars)`);

        const userPrompt = `Extract line items from this section:\n\nSection: ${chunk.section}\n\n${chunk.content}\n\n${supplierName ? `Supplier: ${supplierName}` : ''}`;

        try {
          const openaiResponse = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
              max_completion_tokens: 4096,
            }),
          }, 45000);

          if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error(`[LLM Fallback] Chunk ${i + 1} failed:`, errorText);
            allWarnings.push(`Section "${chunk.section}" parse failed`);
            continue;
          }

          const openaiResult = await openaiResponse.json();
          const content = openaiResult.choices?.[0]?.message?.content;

          if (content) {
            try {
              const parsed: ParseResponse = JSON.parse(content);
              const chunkItems = (parsed.items || []).map(item => ({
                ...item,
                section: item.section || chunk.section
              }));

              allItems.push(...chunkItems);
              allWarnings.push(...(parsed.warnings || []));
              overallConfidence += (parsed.confidence || 0.8);

              console.log(`[LLM Fallback] Chunk ${i + 1} extracted ${chunkItems.length} items`);
            } catch (parseError) {
              console.error(`[LLM Fallback] JSON parse error for chunk ${i + 1}:`, parseError);
              console.error(`[LLM Fallback] Content preview:`, content.substring(0, 500));
              allWarnings.push(`Section "${chunk.section}" - Invalid JSON response from LLM`);
            }
          } else {
            console.error(`[LLM Fallback] Chunk ${i + 1} - No content in response`);
            allWarnings.push(`Section "${chunk.section}" - Empty response from LLM`);
          }
        } catch (error) {
          console.error(`[LLM Fallback] Error processing chunk ${i + 1}:`, error);
          allWarnings.push(`Section "${chunk.section}" parse error: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

      overallConfidence = chunks.length > 0 ? overallConfidence / chunks.length : 0;
    } else {
      // Process entire quote in one call
      const userPrompt = `Extract all line items from this quote:\n\n${text}\n\n${supplierName ? `Supplier: ${supplierName}` : ''}`;

      console.log('[LLM Fallback] Calling OpenAI API...');

      const openaiResponse = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
      }, 50000);

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

      allItems = parsed.items || [];
      allWarnings = parsed.warnings || [];
      overallConfidence = parsed.confidence || 0.85;
    }

    let items = allItems;
    console.log(`[DEBUG] LLM raw items count: ${items.length}`);

    // Extract document totals from raw text
    const docTotals = extractDocumentTotals(text);
    console.log(`[DEBUG] docTotal extracted:`, docTotals);

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

    // Calculate totals from items
    const itemsSubtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);

    // Use document total if available, otherwise use items subtotal
    const finalTotal = docTotals.grand_total_excl_gst ?? itemsSubtotal;
    const quotedTotal = docTotals.grand_total_excl_gst;

    console.log(`[LLM Fallback] Items subtotal: $${itemsSubtotal.toFixed(2)}`);
    console.log(`[LLM Fallback] Document total: $${quotedTotal?.toFixed(2) || 'N/A'}`);
    console.log(`[LLM Fallback] Final total: $${finalTotal.toFixed(2)}`);

    if (quotedTotal && Math.abs(itemsSubtotal - quotedTotal) > 100) {
      allWarnings.push(`Items total ($${itemsSubtotal.toFixed(2)}) differs from quoted total ($${quotedTotal.toFixed(2)}) - using quoted total`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        lines: items,
        items: items,
        confidence: overallConfidence,
        warnings: allWarnings,
        totals: {
          subtotal: itemsSubtotal,
          grandTotal: finalTotal,
          quotedTotal: quotedTotal,
          gst: docTotals.gst_amount
        },
        metadata: {
          supplier: supplierName,
          itemCount: items.length,
          chunked: needsChunking
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('[LLM Fallback] ERROR CAUGHT:', errorMessage);
    if (errorStack) {
      console.error('[LLM Fallback] Stack trace:', errorStack);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        lines: [],
        items: [],
        totals: {},
        metadata: {},
        confidence: 0,
        warnings: [`Parse failed: ${errorMessage}`],
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
