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
  trade?: string;
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

async function detectCandidateRows(text: string, openaiApiKey: string, trade?: string): Promise<{ rows: string[]; confidence: number }> {
  const isPlumbing = trade === 'plumbing';
  const isCarpentry = trade === 'carpentry';

  const systemPrompt = isPlumbing
    ? `You are a line item detector for plumbing construction quotes.

Plumbing quotes are often presented as LUMP SUM items — a section or work package description paired with a single total price, without individual quantities or unit rates.

A valid plumbing line item can be ANY of these formats:
1. LUMP SUM: A description of a scope of work with a total price (e.g. "Item NO. 3 - Sanitary fixtures - $250,000 + GST")
2. ITEMISED: Description + quantity + unit + rate + total (e.g. "HWC 450L storage vessel 2 ea $1,200 $2,400")
3. NUMBERED SCOPE: Numbered work items with a price (e.g. "6. Non-Potable Cold Water system $85,000")
4. SUMMARY LINE: A single price covering the whole quote (e.g. "Total Price: $1,511,338 + GST")

INCLUDE:
- Any line that contains a description of plumbing/drainage/gas work AND a dollar amount
- Item numbers with descriptions and prices (e.g. "Item NO. 6", "Item 3", "6.")
- Lump sum work packages even if no qty or rate is visible
- Section totals that represent a discrete scope (e.g. "Sanitary Fixtures $250,000")
- The overall quote total if no individual items are broken out

DO NOT extract:
- Pure header lines with no dollar amount (e.g. "Price included:", "Price not included:")
- Bullet point inclusions/exclusions lists with no price
- Payment terms, conditions, warranty text
- GST lines, subtotals that are clearly summations of already-listed items
- Supplier contact details, dates, project addresses

Return JSON: {"rows": ["raw line 1", "raw line 2", ...]}`
    : isCarpentry
    ? `You are a line item detector for carpentry and interior lining construction quotes.

Carpentry quotes typically cover: timber framing, GIB/plasterboard fixing and stopping, insulation, ceiling battens, and related interior lining trades. They are commonly presented as LUMP SUM packages or UNIT RATE items broken down by level, zone, wall type, or trade section.

A valid carpentry line item can be ANY of these formats:
1. LUMP SUM SECTION: A trade or scope description with a total price (e.g. "Framing Level 3 $45,000", "GIB Fixing - Apartments $120,000")
2. UNIT RATE: Description + quantity + unit + rate + total (e.g. "W30 Intertenancy Wall 2400 m2 $28.50 $68,400")
3. LEVEL-BASED: Work priced per floor or zone (e.g. "Level 1 Carpentry $38,500", "Ground Floor Framing & Lining $52,000")
4. TRADE SECTION: A section heading with a total (e.g. "Carpentry $485,000", "Plasterboard $320,000", "Insulation $95,000")
5. NUMBERED SCOPE: Numbered work items with a price (e.g. "1. Structural Framing $210,000", "2. GIB Fixing $180,000")
6. SUMMARY LINE: A single price covering the whole quote if no breakdown is given (e.g. "Total Lump Sum $850,000 + GST")

INCLUDE:
- Any line that contains a description of carpentry/framing/GIB/plasterboard/insulation/lining work AND a dollar amount
- Lump sum work packages even if no qty or unit rate is visible
- Level-based rows where each floor is priced separately
- Section subtotals where each section (Carpentry, Plasterboard, Insulation) represents a distinct trade scope
- Hourly rate lines if they include an estimated total (e.g. "Carpenter $75/hr x 400hrs = $30,000")
- The overall quote total if no individual items are broken out

DO NOT extract:
- Pure header lines with no dollar amount
- Inclusions/exclusions lists with no price
- GST lines or grand totals that are clearly the sum of already-listed sections
- Payment terms, warranty text, contact details, project addresses
- Rate-only lines with no quantity or total (e.g. "Carpenter $75/hr" with no hours or total)

Return JSON: {"rows": ["raw line 1", "raw line 2", ...]}`
    : `You are a line item detector for construction quotes.

Your ONLY job is to identify which lines are PRICED line items — items that have an actual quantity AND a line total.

A valid line item MUST have:
- A product or service description
- A quantity (a number > 0 representing units being purchased/installed — this appears BEFORE the unit rate)
- A line total price (the final dollar amount for this row, appearing at the END of the row)

CRITICAL: In some quotes the "Unit" column contains "0" (zero) or is blank. This does NOT mean the quantity is zero.
The columns are always: Description | Size | Substrate | Qty | Unit | Unit Rate | Total Price
Example: "Trafalgar SuperSTOPPER 350x125x250mm New Gib Wall 2x13mm 1276 0 $365.00 $465,740.00"
→ This IS a valid line item: qty=1276, unit="0" (means "each"), rate=$365, total=$465,740 — INCLUDE IT.

DO NOT extract:
- Section header lines that are just a category name with a subtotal (e.g. "Electrical $2,490.50", "New Building", "Heritage Building") — these have NO qty column
- Subtotals / Grand Totals / Summary lines / P&G lines
- GST / tax lines
- Rate schedule / price list rows — these have a description and unit rate but NO quantity column and NO line total (e.g. "Linear seals per m $22.00", "Cavity barriers per m $89.90", "Intumescent Flushbox ea $20.50")
- Any section labelled "Excluded" or "Exclusions" that lists rates without quantities
- Rate-only rows with no quantity and no line total (e.g. "Linear seals per m $22.00")
- IMPORTANT: Do NOT skip rows just because they appear under a section called "Optional Extras" or similar — if a row has a real quantity AND a real line total, INCLUDE it regardless of its section heading.

INCLUDE all rows that have: a description + a numeric quantity + a line total.

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

async function normalizeRows(rows: string[], section: string, openaiApiKey: string, trade?: string): Promise<LineItem[]> {
  if (rows.length === 0) return [];

  const isPlumbing = trade === 'plumbing';
  const isCarpentry = trade === 'carpentry';

  const systemPrompt = isPlumbing
    ? `You are a line item normalizer for plumbing construction quotes.

For each raw text line, extract:
- description: The scope of work or product/service name (clean, concise)
- qty: Quantity as a number. For lump sum items use 1. If a real quantity is present, use it.
- unit: Unit of measure. Use "LS" for lump sum items, "ea" for each, "m" for metres, etc.
- rate: Unit price as a number. For lump sums where only a total is given, set rate equal to the total.
- total: The total dollar amount for this line item.

CRITICAL RULES:
1. NUMBER FORMAT: Commas are THOUSAND separators, NOT decimal separators
   - "$1,511,338" = 1511338 (NOT 1511.338)
   - "$250,000" = 250000
2. Lump sum items are VALID — if a line has a description and a dollar amount, extract it as qty=1, unit="LS", rate=total.
3. If a line says "Item NO. X" or "Item X", include the item number in the description.
4. SKIP pure contact details, addresses, dates, payment terms with no dollar amount.
5. SKIP lines that are clearly inclusions/exclusions bullet points with no price.
6. If only one grand total is found for the whole quote, return it as a single lump sum item.

Example: "Item NO. 3 - Sanitary fixtures Total Price: $250,000 + GST" → description="Item NO. 3 - Sanitary fixtures", qty=1, unit="LS", rate=250000, total=250000, confidence=0.9
Example: "Non-Potable Cold Water system $85,000" → description="Non-Potable Cold Water system", qty=1, unit="LS", rate=85000, total=85000, confidence=0.85

Return JSON: {"items": [{"description": "...", "qty": 1, "unit": "LS", "rate": 250000, "total": 250000, "confidence": 0.9}]}`
    : isCarpentry
    ? `You are a line item normalizer for carpentry and interior lining construction quotes.

For each raw text line, extract:
- description: The scope of work, trade section, or product/service name (clean, concise). Include level or zone if present (e.g. "GIB Fixing - Level 3", "Framing - Ground Floor").
- qty: Quantity as a number. For lump sum items use 1. If a real quantity is present (e.g. m2, LM, sheets), use it.
- unit: Unit of measure. Use "LS" for lump sum items, "m2" for square metres, "LM" for lineal metres, "ea" for each, etc.
- rate: Unit price as a number. For lump sums where only a total is given, set rate equal to the total.
- total: The total dollar amount for this line item.

CRITICAL RULES:
1. NUMBER FORMAT: Commas are THOUSAND separators, NOT decimal separators
   - "$485,000" = 485000 (NOT 485)
   - "$1,200,000" = 1200000
2. Lump sum items are VALID — if a line has a description and a dollar amount with no qty/rate, extract it as qty=1, unit="LS", rate=total.
3. Level-based rows are valid line items — "Level 1 Carpentry $38,500" → description="Level 1 Carpentry", qty=1, unit="LS", rate=38500, total=38500.
4. Section totals (Carpentry, Plasterboard, Insulation) ARE valid line items if they represent distinct trade scopes.
5. SKIP grand totals, GST lines, and summary rows that are the sum of already-extracted sections.
6. SKIP contact details, addresses, dates, payment terms, inclusions/exclusions lists with no price.
7. If only one total is found for the whole quote, return it as a single lump sum item.

Example: "Framing Level 3 $45,000" → description="Framing Level 3", qty=1, unit="LS", rate=45000, total=45000, confidence=0.9
Example: "W30 Intertenancy Wall 2400 m2 $28.50 $68,400" → description="W30 Intertenancy Wall", qty=2400, unit="m2", rate=28.50, total=68400, confidence=0.95
Example: "GIB Fixing $120,000" → description="GIB Fixing", qty=1, unit="LS", rate=120000, total=120000, confidence=0.9

Return JSON: {"items": [{"description": "...", "qty": 1, "unit": "LS", "rate": 45000, "total": 45000, "confidence": 0.9}]}`
    : `You are a line item normalizer for construction quotes.

For each raw text line, extract:
- description: Product/service name
- qty: Quantity as a number (use 1 ONLY if this is a genuine lump sum item with a real line total — do NOT invent a qty for rate-schedule rows that have no line total)
- unit: Unit of measure (ea, m, LS, etc.) - CRITICAL: If unit is "0", "-", "N/A", or blank, use "ea"
- rate: Unit price as a number
- total: Total price as a number (the line total, NOT a subtotal or section rollup)

CRITICAL RULES:
1. Some tables show "0" or blank in the Unit column. This does NOT mean skip the item - use "ea".
2. NUMBER FORMAT: Commas are THOUSAND separators, NOT decimal separators
   - "$465,740.00" = 465740.00 (NOT 465.74)
   - "$26,791.50" = 26791.50 (NOT 26.79)
3. SKIP lines that are section-level subtotals or category rollup headers. These look like:
   - A single word or short category name followed by a dollar amount (e.g. "Electrical $2,490.50", "Mechanical $2,461")
   - "Subtotal", "Grand Total", "Total", "P&G", "GST", "Margin", "Summary"
   - Any line where the dollar value equals or closely matches the sum of other items in that section
4. SKIP lines where there is no actual line total (total = 0 and rate = 0). These are rate card placeholders.

Example: "SuperSTOPPER | 1276 | 0 | $365.00 | $465,740.00" → qty=1276, unit="ea", rate=365.00, total=465740.00

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

/**
 * Regex fallback: extract level-based pricing table rows from plumbing quotes.
 * Used when the LLM returns 0 items on a plumbing quote.
 *
 * Handles PDFs where the text extractor splits each word onto its own line, e.g.:
 *   "LOWER\n GROUND\n LEVEL\n 13800   15355   1760   7620   32000   70535"
 *
 * Strategy:
 * 1. Join the entire text into one long string collapsing whitespace/newlines.
 * 2. Use a regex to find "LEVEL N" or "LOWER GROUND LEVEL" etc. followed by numbers.
 * 3. The last number in the sequence is the SUM column.
 */
function extractPlumbingLevelTable(text: string): LineItem[] {
  const results: LineItem[] = [];

  // Collapse the entire text: replace newlines with spaces, then collapse runs of spaces
  const flat = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

  // Match all known level label patterns followed by a sequence of numbers
  // The last number in the run is the SUM column value
  const LEVEL_RE = /(lower\s+ground(?:\s+level)?|upper\s+ground(?:\s+level)?|ground(?:\s+level)?|basement|level\s+\d+|floor\s+\d+|roof(?:\s+level)?|plant\s+room|car\s+park(?:\s+level)?|podium(?:\s+level)?)\s+((?:[\d,]+(?:\.\d+)?\s+){1,10}[\d,]+(?:\.\d+)?)/gi;

  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = LEVEL_RE.exec(flat)) !== null) {
    const rawLabel = match[1].trim();
    const numberStr = match[2].trim();

    // Skip header rows like "LEVELS ITEMS SUM NOTE" — these have no large numbers
    if (/^levels?\s*$/i.test(rawLabel)) continue;

    // Extract all numbers from the sequence
    const numbers = numberStr.match(/[\d,]+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 1) continue;

    // The last number is the SUM column
    const sumStr = numbers[numbers.length - 1].replace(/,/g, '');
    const sumVal = parseFloat(sumStr);
    if (!sumVal || sumVal < 1000) continue;

    // Deduplicate by label
    const labelKey = rawLabel.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(labelKey)) continue;
    seen.add(labelKey);

    const description = rawLabel
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\s+/g, ' ')
      + ' - Plumbing Works';

    results.push({
      description,
      qty: 1,
      unit: 'LS',
      rate: sumVal,
      total: sumVal,
      section: 'Main',
      confidence: 0.9,
      source: 'regex_level_table',
      raw_text: match[0].trim(),
      validation_flags: [],
    });
  }

  return results;
}

function validateAndFixItem(item: LineItem, trade?: string): LineItem {
  const flags: string[] = [];
  const isLumpSum = item.unit === 'LS' || item.qty === 1;
  const isLumpSumTrade = trade === 'plumbing' || trade === 'carpentry';

  if (!item.total && item.qty && item.rate) {
    item.total = Math.round(item.qty * item.rate * 100) / 100;
    flags.push('CALCULATED_TOTAL');
  }

  if (!isLumpSum) {
    const expectedTotal = Math.round(item.qty * item.rate * 100) / 100;
    const actualTotal = Math.round(item.total * 100) / 100;
    const diff = Math.abs(expectedTotal - actualTotal);
    if (diff > 0.5) {
      flags.push('MISMATCH');
      item.confidence = Math.max(0.3, item.confidence - 0.2);
    }
  }

  if (!item.description || item.description.length < 3) {
    flags.push('MISSING_DESCRIPTION');
    item.confidence = Math.max(0.2, item.confidence - 0.3);
  }

  if (item.qty <= 0 && !isLumpSumTrade) {
    flags.push('INVALID_QTY');
    item.confidence = Math.max(0.2, item.confidence - 0.3);
  }

  if (item.rate <= 0 && !isLumpSumTrade) {
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

    const { text, supplierName, phase, trade }: ParseRequest = await req.json();

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
      console.log(`[LLM v2] Processing ${chunks.length} chunks in parallel (trade: ${trade || 'default'})...`);

      const chunkPromises = chunks.map(async (chunk) => {
        try {
          const detectionResult = await detectCandidateRows(chunk.content, openaiApiKey, trade);

          if (detectionResult.rows.length === 0) {
            console.log(`[LLM v2] Chunk "${chunk.section}" - no candidate rows found`);
            return [];
          }

          console.log(`[LLM v2] Chunk "${chunk.section}" - detected ${detectionResult.rows.length} candidate rows`);

          const normalizedItems = await normalizeRows(detectionResult.rows, chunk.section, openaiApiKey, trade);

          console.log(`[LLM v2] Chunk "${chunk.section}" - normalized ${normalizedItems.length} items`);

          return normalizedItems.map(item => validateAndFixItem(item, trade));
        } catch (error) {
          console.error(`[LLM v2] Chunk "${chunk.section}" failed:`, error);
          return [];
        }
      });

      const results = await Promise.all(chunkPromises);
      allItems = results.flat();
    } else {
      console.log(`[LLM v2] Processing entire document (no chunking, trade: ${trade || 'default'})...`);

      const detectionResult = await detectCandidateRows(text, openaiApiKey, trade);
      console.log(`[LLM v2] Detected ${detectionResult.rows.length} candidate rows`);

      if (detectionResult.rows.length > 0) {
        const normalizedItems = await normalizeRows(detectionResult.rows, 'Main', openaiApiKey, trade);
        allItems = normalizedItems.map(item => validateAndFixItem(item, trade));
      }
    }

    // Plumbing fallback: if LLM returned 0 items, try regex level-table extraction
    const isPlumbing = (trade ?? '').toLowerCase() === 'plumbing';
    const isCarpentry = (trade ?? '').toLowerCase() === 'carpentry';
    if (isPlumbing && allItems.length === 0) {
      console.log('[LLM v2] Plumbing: LLM returned 0 items, attempting regex level-table fallback...');
      const levelItems = extractPlumbingLevelTable(text);
      if (levelItems.length > 0) {
        console.log(`[LLM v2] Regex fallback extracted ${levelItems.length} level rows`);
        allItems = levelItems;
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
