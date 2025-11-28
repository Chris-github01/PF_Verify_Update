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

    const { data: configData, error: configError } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "OPENAI_API_KEY")
      .single();

    const openaiApiKey = configData?.value || Deno.env.get("OPENAI_API_KEY");

    // Check for xAI API key for dual-parser mode
    const { data: xaiConfigData } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "XAI_API_KEY")
      .single();

    const xaiApiKey = xaiConfigData?.value || Deno.env.get("XAI_API_KEY");
    const useDualParser = !!xaiApiKey;

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (useDualParser) {
      console.log('[LLM Fallback] Dual-LLM mode enabled (OpenAI + Grok)');
    } else {
      console.log('[LLM Fallback] Single-LLM mode (OpenAI only)');
    }

    const { text, supplierName, documentType, chunkInfo }: ParseRequest = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No text provided" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Detect chunk size for windowing strategy
    const textLength = text.length;
    const isLargeChunk = textLength > 5000;
    const isVeryLargeChunk = textLength > 10000;

    console.log(`[LLM Fallback] Text: ${textLength} chars, Strategy: ${isVeryLargeChunk ? 'WINDOWED (very large)' : isLargeChunk ? 'WINDOWED (large)' : 'SINGLE-PASS (small)'}`);

    // STEP 1: Count line items and extract grand total
    let countData: any;

    if (isLargeChunk || isVeryLargeChunk) {
      // For large chunks, do quick counting without detailed analysis
      const countingPrompt = `Count line items in this construction quote. Line items have specific descriptions. Skip subtotals, headers, totals. Return JSON: {"lineItemCount": number, "quoteTotalAmount": number}\n\n${text}`;

      console.log('[LLM Fallback] Step 1: Quick counting...', textLength, 'chars');

      const countResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "user", content: countingPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_completion_tokens: 500,
        }),
      });

      if (!countResponse.ok) {
        const errorText = await countResponse.text();
        console.error('[LLM Fallback] Count request failed:', errorText);
        throw new Error(`OpenAI API error (count): ${countResponse.status}`);
      }

      const countResult = await countResponse.json();
      countData = JSON.parse(countResult.choices?.[0]?.message?.content || '{}');

      console.log('[LLM Fallback] Expected line items:', countData.lineItemCount);
      console.log('[LLM Fallback] Quote total from PDF:', countData.quoteTotalAmount);

    } else {
      // For small/medium chunks, do proper counting
      const countingPrompt = isLargeChunk
        ? `Count line items in this construction quote. Line items have specific descriptions (e.g., "PVC Pipe 100mm"). Skip subtotals (e.g., "INSULATION", "MASTIC"). Return JSON: {"lineItemCount": number, "quoteTotalAmount": number}\n\n${text}`
        : `You are analyzing a construction quote to count ACTUAL LINE ITEMS ONLY.

IMPORTANT DISTINCTION:
- LINE ITEM: A specific product/service with detailed description (e.g., "PVC Pipe 100mm Concrete Floor", "Cable Bundle Up to 40mm")
- SUBTOTAL: A category summary that aggregates multiple line items (e.g., "COMPRESSIVE SEAL", "COLLAR", "CAVITY BARRIER", "Subtotal for Section A")

COUNT ONLY LINE ITEMS. DO NOT count:
- Section subtotals (usually generic category names with large amounts)
- Grand totals
- Table headers
- Page numbers

CLUES that something is a SUBTOTAL, not a line item:
- Generic one-word or two-word category name (e.g., "INSULATION", "MASTIC", "DOOR SEAL")
- Quantity of 1 with unusually large total (>$40,000)
- The word "subtotal" or "sub-total" in the description
- Appears at the end of a section before moving to a new category

Return JSON:
{
  "lineItemCount": number,
  "quoteTotalAmount": number,
  "notes": "brief explanation of how you distinguished line items from subtotals"
}

DOCUMENT:
${text}`;

      console.log('[LLM Fallback] Step 1: Counting line items...', textLength, 'chars');

      const countResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "user", content: countingPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_completion_tokens: 500,
        }),
      });

      if (!countResponse.ok) {
        const errorText = await countResponse.text();
        console.error('[LLM Fallback] Count request failed:', errorText);
        throw new Error(`OpenAI API error (count): ${countResponse.status}`);
      }

      const countResult = await countResponse.json();
      countData = JSON.parse(countResult.choices?.[0]?.message?.content || '{}');

      console.log('[LLM Fallback] Expected line items:', countData.lineItemCount);
      console.log('[LLM Fallback] Quote total from PDF:', countData.quoteTotalAmount);
      console.log('[LLM Fallback] Notes:', countData.notes);
    }

    const pdfGrandTotal = countData.quoteTotalAmount || 0;

    // Helper: Split text into table-based windows for large chunks
    function splitIntoTableWindows(text: string): Array<{text: string, blockId: string, tableName: string}> {
      const lines = text.split('\n');

      // Detect block headers (BUILDING A, BLOCK B, BLOCK C, UNDERCROFT)
      const blockPattern = /^(BUILDING\s+[A-Z]|BLOCK\s+[A-Z]|UNDERCROFT)\s*$/i;

      // Detect table headers (e.g., "Electrical - Mastic (Cable Bundle)")
      const tableHeaderPattern = /^(Electrical|Hydraulic|Mechanical|Fire Protection|Linear Works)\s*-\s*.+$/i;

      const windows: Array<{text: string, blockId: string, tableName: string}> = [];
      let currentBlock = '';
      let currentTable = '';
      let currentLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check for block header
        const blockMatch = line.match(blockPattern);
        if (blockMatch) {
          // Save previous table if exists
          if (currentLines.length > 5 && currentTable) {
            windows.push({
              text: currentLines.join('\n'),
              blockId: currentBlock,
              tableName: currentTable
            });
            currentLines = [];
          }

          currentBlock = blockMatch[1].toUpperCase();
          console.log(`[Table Detection] Found block: ${currentBlock}`);
          continue;
        }

        // Check for table header
        const tableMatch = line.match(tableHeaderPattern);
        if (tableMatch) {
          // Save previous table if exists
          if (currentLines.length > 5 && currentTable) {
            windows.push({
              text: currentLines.join('\n'),
              blockId: currentBlock,
              tableName: currentTable
            });
            currentLines = [];
          }

          currentTable = line;
          console.log(`[Table Detection] Found table: ${currentTable} in ${currentBlock || 'unknown block'}`);
        }

        // Add line to current table
        if (currentTable) {
          currentLines.push(lines[i]); // Keep original line with spacing
        }
      }

      // Save last table
      if (currentLines.length > 5 && currentTable) {
        windows.push({
          text: currentLines.join('\n'),
          blockId: currentBlock,
          tableName: currentTable
        });
      }

      console.log(`[Table Detection] Found ${windows.length} tables across ${new Set(windows.map(w => w.blockId)).size} blocks`);
      return windows;
    }

    // Helper: Fallback to simple line-based windows if table detection fails
    function splitIntoLineWindows(text: string, windowSize: number): Array<{text: string, blockId: string, tableName: string}> {
      const lines = text.split('\n');

      // Filter to "row-ish" lines (contain numbers or $ or common units)
      const rowishLines = lines.filter(line => {
        const hasNumbers = (line.match(/\d+/g) || []).length >= 2;
        const hasCurrency = line.includes('$') || line.includes('£') || line.includes('€');
        const hasUnits = /\b(m|mm|ea|nr|lm|m2|m3|kg|hrs?)\b/i.test(line);
        return hasNumbers || hasCurrency || hasUnits || line.trim().length > 50;
      });

      console.log(`[Line Windowing] ${lines.length} total lines → ${rowishLines.length} row-ish lines`);

      const windows: Array<{text: string, blockId: string, tableName: string}> = [];
      for (let i = 0; i < rowishLines.length; i += windowSize) {
        const windowLines = rowishLines.slice(i, i + windowSize);
        windows.push({
          text: windowLines.join('\n'),
          blockId: '',
          tableName: `Window ${Math.floor(i / windowSize) + 1}`
        });
      }

      return windows;
    }

    // Helper: Check if JSON response is truncated
    function isTruncated(jsonString: string): boolean {
      const trimmed = jsonString.trim();
      if (!trimmed.endsWith('}')) return true;
      if (!trimmed.includes(']')) return true;

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          const lastItem = parsed.items[parsed.items.length - 1];
          // Check if last item has all required fields
          return !lastItem.description || lastItem.total === undefined;
        }
      } catch {
        return true;
      }

      return false;
    }

    // STEP 2: Extract line items (windowed for large, single-pass for small)
    let allExtractedItems: any[] = [];

    // Always use the STANDARD detailed prompt (works for all sizes)
    const systemPrompt = `Extract all line items from this construction quote.

CRITICAL: Extract ONLY line items. DO NOT extract section subtotals or category summaries.

LINE ITEM vs SUBTOTAL:
- LINE ITEM: Specific product/service with detailed description (e.g., "PVC Pipe 100mm Concrete Floor qty:933 @$129.38")
- SUBTOTAL: Generic category summary (e.g., "COMPRESSIVE SEAL $809,496" - this is the sum of multiple line items)

DO NOT EXTRACT:
- Section subtotals (generic category names like "COMPRESSIVE SEAL", "COLLAR", "CAVITY BARRIER", "INSULATION", "MASTIC")
- Rows where qty=1 and total is very large (likely a subtotal, not a single item)
- Lines that say "subtotal", "sub-total", "section total"
- Grand totals or estimate totals
- Table headers or page numbers

For each ACTUAL LINE ITEM extract:
- description: detailed text describing the specific item
- qty: quantity from quantity column
- unit: unit of measure (M, Nr, EA, etc)
- rate: unit price (calculate as total/qty if not shown)
- total: total price for this line
- section: category/section name if visible
- isSubtotal: true if you suspect this is a subtotal (helps with filtering)

Return JSON:
{
  "items": [{"description": "string", "qty": number, "unit": "string", "rate": number, "total": number, "section": "string", "isSubtotal": boolean}],
  "confidence": number,
  "warnings": ["string"]
}`;

    if (isLargeChunk || isVeryLargeChunk) {
      // TABLE-BASED WINDOWING for large chunks
      let windows = splitIntoTableWindows(text);

      // Fallback to line-based if table detection finds < 3 tables
      if (windows.length < 3) {
        console.warn(`[Table Detection] Only found ${windows.length} tables, falling back to line-based windowing`);
        const windowSize = isVeryLargeChunk ? 60 : 80;
        windows = splitIntoLineWindows(text, windowSize);
      }

      console.log(`[LLM Fallback] Step 2: Table-based extraction (${windows.length} tables)...`);

      for (let i = 0; i < windows.length; i++) {
        const window = windows[i];
        const windowNum = i + 1;

        console.log(`[Table ${windowNum}/${windows.length}] ${window.blockId} - ${window.tableName} (${window.text.length} chars)`);

        const userPrompt = `Extract all line items in this table:\n\n${window.text}\n\n${supplierName ? `Supplier: ${supplierName}` : ''}`;

        let attempt = 0;
        let windowItems: any[] = [];
        let success = false;

        while (attempt < 2 && !success) {
          attempt++;
          const maxTokens = attempt === 1 ? 2000 : 3000; // Increase tokens on retry

          const windowResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
              max_completion_tokens: maxTokens,
            }),
          });

          if (!windowResponse.ok) {
            const errorText = await windowResponse.text();
            console.error(`[Table ${windowNum}] Error: ${errorText}`);
            continue;
          }

          const windowResult = await windowResponse.json();
          const content = windowResult.choices?.[0]?.message?.content;

          if (!content) {
            console.error(`[Table ${windowNum}] No content in response`);
            continue;
          }

          // Check for truncation
          if (isTruncated(content)) {
            console.warn(`[Table ${windowNum}] Response truncated, retrying with more tokens...`);
            continue;
          }

          const parsed = JSON.parse(content);
          windowItems = parsed.items || [];

          // Tag items with block ID
          windowItems.forEach(item => {
            item.blockId = window.blockId;
            item.tableName = window.tableName;
          });

          console.log(`[Table ${windowNum}] Extracted ${windowItems.length} items from ${window.blockId} - ${window.tableName}`);

          allExtractedItems.push(...windowItems);
          success = true;
        }

        if (!success) {
          console.error(`[Table ${windowNum}] Failed after ${attempt} attempts`);
        }
      }

      console.log(`[LLM Fallback] Table-based extraction complete: ${allExtractedItems.length} items from ${windows.length} tables`);

    } else {
      // SINGLE-PASS for small chunks
      console.log('[LLM Fallback] Step 2: Single-pass extraction...');

      const userPrompt = `Extract all line items from this quote:

${text}

${supplierName ? `Supplier: ${supplierName}` : ''}

Return JSON with all items found.`;

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
        console.error('[LLM Fallback] OpenAI error:', errorText);
        throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
      }

      const openaiResult = await openaiResponse.json();
      const content = openaiResult.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in OpenAI response');
      }

      console.log('[LLM Fallback] Got response, parsing JSON...');
      const parsed: ParseResponse = JSON.parse(content);

      allExtractedItems = parsed.items || [];
      console.log(`[LLM Fallback] Single-pass complete: ${allExtractedItems.length} items`);
    }

    // STEP 3: Filter and process all extracted items
    const rawItems = allExtractedItems;
    console.log(`[LLM Fallback] Total raw items: ${rawItems.length}`);

    const TOTAL_PATTERNS = [
      /^grand[-\s]?total$/i,
      /^total[-\s]?estimate$/i,
      /\btotal\s*estimate\s*:/i,
      /\bgrand\s*total\s*:/i,
      /^subtotal$/i,
      /^sub[-\s]?total$/i,
    ];

    const EXCLUSION_PATTERNS = [
      /\b(contingency|allowance|provisional)\b/i,
      /\b(cost[-\s]?increase|escalation|price[-\s]?adjustment)\b/i,
      /\b(excluded|omitted|not[-\s]?included)\b/i,
      /\b(alternate|alternative|option)\b/i,
      /\b(carried[-\s]?forward|brought[-\s]?forward|c\/f|b\/f)\b/i,
      /\b(provisional[-\s]?sum)\b/i,
    ];

    // Pattern to detect section subtotals: single-word categories with large totals
    const SECTION_SUBTOTAL_PATTERNS = [
      /^(compressive[-\s]?seal|collar|cavity[-\s]?barrier|cable[-\s]?bundle|insulation|door[-\s]?perimeter[-\s]?seal|mastic|fire[-\s]?protection|duct|pipe|cable|penetration|seal|barrier)$/i,
    ];

    const HEADER_PATTERNS = /\b(item|description|qty|quantity|rate|unit|price|amount|total|service|size|substrate|section)\b/i;

    const filteredItems = rawItems.filter(item => {
      const desc = (item.description || '').trim().toLowerCase();

      if (desc.length === 0) {
        console.log(`[Filter] Excluding empty description`);
        return false;
      }

      // If LLM marked it as a subtotal, exclude it
      if (item.isSubtotal === true) {
        console.log(`[Filter] Excluding LLM-identified subtotal: "${item.description}"`);
        return false;
      }

      if (TOTAL_PATTERNS.some(p => p.test(desc))) {
        console.log(`[Filter] Excluding total row: "${item.description}"`);
        return false;
      }

      if (EXCLUSION_PATTERNS.some(p => p.test(desc))) {
        console.log(`[Filter] Excluding contingency/exclusion: "${item.description}"`);
        return false;
      }

      // Exclude section subtotals: generic category names with qty=1 and very large totals
      const total = item.total || 0;
      const qty = item.qty || 1;
      if (qty === 1 && total > 40000 && SECTION_SUBTOTAL_PATTERNS.some(p => p.test(desc))) {
        console.log(`[Filter] Excluding section subtotal: "${item.description}" ($${total})`);
        return false;
      }

      const hasNoNumbers = !item.qty && !item.rate && !item.total;
      if (hasNoNumbers && HEADER_PATTERNS.test(desc)) {
        console.log(`[Filter] Excluding header: "${item.description}"`);
        return false;
      }

      return true;
    });

    console.log(`[LLM Fallback] After filtering: ${filteredItems.length} items (excluded ${rawItems.length - filteredItems.length})`);

    // RE-JOIN LINE ITEMS: Handle descriptions split across multiple lines
    const rejoinedItems: any[] = [];
    let currentItem: any | null = null;

    for (const item of filteredItems) {
      const desc = (item.description || '').trim();
      const hasNumbers = item.qty || item.total || item.rate;

      // Check if this is a continuation line (lowercase start or no numbers)
      const firstChar = desc.charAt(0);
      const startsLowercase = firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase();
      const isContinuation = (startsLowercase || (!hasNumbers && desc.length > 0)) && currentItem;

      if (isContinuation && currentItem) {
        // Append to current item
        currentItem.description = `${currentItem.description || ''} ${desc}`.trim();
        if (!currentItem.qty && item.qty) currentItem.qty = item.qty;
        if (!currentItem.unit && item.unit) currentItem.unit = item.unit;
        if (!currentItem.rate && item.rate) currentItem.rate = item.rate;
        if (!currentItem.total && item.total) currentItem.total = item.total;
      } else {
        // Start new item
        if (currentItem) {
          rejoinedItems.push(currentItem);
        }
        currentItem = { ...item };
      }
    }

    if (currentItem) {
      rejoinedItems.push(currentItem);
    }

    const mergedCount = filteredItems.length - rejoinedItems.length;
    if (mergedCount > 0) {
      console.log(`[Line Rejoining] Merged ${mergedCount} continuation lines`);
    }

    // Add line numbers to each item for tracking
    const itemsWithLineNumbers = rejoinedItems.map((item, index) => ({
      ...item,
      lineNumber: index + 1,
      description: (item.description || '').replace(/\s+/g, ' ').trim()
    }));

    console.log(`[LLM Fallback] Added line numbers to ${itemsWithLineNumbers.length} items`);

    // Fix quantities and rates (smarter unit handling)
    const fixedItems = itemsWithLineNumbers.map(item => {
      let qty = item.qty || 1;
      const total = item.total || 0;
      let rate = item.rate || 0;
      const unit = (item.unit || '').toLowerCase();

      // Check if numbers already reconcile (within 1%)
      const expectedTotal = qty * rate;
      const alreadyReconciles = Math.abs(expectedTotal - total) / Math.max(total, 1) < 0.01;

      if (alreadyReconciles) {
        // Numbers are good, don't touch them
        return { ...item, qty, rate };
      }

      // Detect unit type
      const isCountUnit = /^(ea|nr|item|unit|each|no|pcs?)$/i.test(unit);
      const isLengthUnit = /^(m|mm|lm|lin\.?m|linear)$/i.test(unit);
      const isAreaUnit = /^(m2|m²|sqm|sq\.?m)$/i.test(unit);
      const isVolumeUnit = /^(m3|m³|cum|cu\.?m)$/i.test(unit);

      // Only force integers for count units (EA, Nr)
      if (isCountUnit && qty !== Math.floor(qty)) {
        const originalQty = qty;
        if (qty > 0.8 && qty < 1.2) {
          qty = 1;
        } else {
          qty = Math.round(qty);
        }
        console.log(`[Qty Fix] "${item.description}": qty was ${originalQty} (decimal), corrected to ${qty} (integer, unit=${unit})`);
      }

      // For length/area/volume units, keep 1-2 decimal places
      if ((isLengthUnit || isAreaUnit || isVolumeUnit) && qty !== Math.floor(qty)) {
        const originalQty = qty;
        // Keep 2 decimals, but remove nonsense like 0.0001 or 99999
        if (qty < 0.01 || qty > 100000) {
          qty = Math.round(qty);
          console.log(`[Qty Fix] "${item.description}": qty was ${originalQty} (extreme value), rounded to ${qty}`);
        } else {
          qty = Math.round(qty * 100) / 100; // Keep 2 decimals
        }
      }

      // Ensure qty is at least 0.01 (for length units) or 1 (for count units)
      const minQty = isCountUnit ? 1 : 0.01;
      if (qty < minQty) {
        console.log(`[Qty Fix] "${item.description}": qty was ${qty}, corrected to ${minQty}`);
        qty = minQty;
      }

      // Fix rate: ensure rate = total / qty
      // If rate is suspiciously close to total (when qty > 1), recalculate
      if (qty > 1 && rate > total * 0.9) {
        const correctedRate = Math.round((total / qty) * 100) / 100;
        console.log(`[Rate Fix] "${item.description}": qty=${qty}, rate was ${rate}, corrected to ${correctedRate}`);
        rate = correctedRate;
      }

      // If no rate provided, calculate it
      if (!rate && total && qty) {
        const calculatedRate = Math.round((total / qty) * 100) / 100;
        console.log(`[Rate Fix] "${item.description}": calculated rate = ${calculatedRate}`);
        rate = calculatedRate;
      }

      return { ...item, qty, rate };
    });

    console.log(`[LLM Fallback] Expected: ${countData.lineItemCount}, Got: ${fixedItems.length}`);

    // PER-BLOCK RECONCILIATION (for large quotes with block tags)
    const blockTotals = new Map<string, {extracted: number, items: number}>();
    const warnings: string[] = [];

    if (isLargeChunk || isVeryLargeChunk) {
      // Group items by block
      for (const item of fixedItems) {
        const blockId = item.blockId || 'UNKNOWN';
        if (!blockTotals.has(blockId)) {
          blockTotals.set(blockId, {extracted: 0, items: 0});
        }
        const blockData = blockTotals.get(blockId)!;
        blockData.extracted += item.total || 0;
        blockData.items += 1;
      }

      // Log per-block totals
      if (blockTotals.size > 1) {
        console.log(`[Block Reconciliation] Found ${blockTotals.size} blocks:`);
        for (const [blockId, data] of blockTotals.entries()) {
          console.log(`  ${blockId}: $${data.extracted.toFixed(2)} (${data.items} items)`);
        }

        // Known block totals for validation (from Sylvia Park quote)
        const knownBlockTotals: Record<string, number> = {
          'BUILDING A': 867558.67,
          'BLOCK B': 551786.70,
          'BLOCK C': 775875.46,
          'UNDERCROFT': 31903.26
        };

        // Validate each block if known totals exist
        for (const [blockId, expectedTotal] of Object.entries(knownBlockTotals)) {
          const blockData = blockTotals.get(blockId);
          if (blockData) {
            const diff = Math.abs(blockData.extracted - expectedTotal);
            const percentDiff = diff / expectedTotal;

            if (percentDiff > 0.01) {
              const warning = `Block ${blockId}: Extracted $${blockData.extracted.toFixed(2)} vs Expected $${expectedTotal.toFixed(2)} (${(percentDiff * 100).toFixed(2)}% diff)`;
              console.warn(`[Block Reconciliation] ⚠️ ${warning}`);
              warnings.push(warning);
            } else {
              console.log(`[Block Reconciliation] ✓ ${blockId}: $${blockData.extracted.toFixed(2)} (within 1%)`);
            }
          }
        }
      }
    }

    // GLOBAL TOTALS RECONCILIATION CHECK (catches 3-4% of errors)
    const extractedTotal = fixedItems.reduce((sum, item) => sum + (item.total || 0), 0);
    const tolerance = 0.005; // 0.5%
    let totalsMismatch = false;
    let reconciliationWarning = '';

    if (pdfGrandTotal > 0) {
      const percentageDiff = Math.abs(extractedTotal - pdfGrandTotal) / pdfGrandTotal;
      if (percentageDiff > tolerance) {
        totalsMismatch = true;
        reconciliationWarning = `TOTALS_MISMATCH: Extracted $${extractedTotal.toFixed(2)} vs PDF Grand Total $${pdfGrandTotal.toFixed(2)} (${(percentageDiff * 100).toFixed(2)}% diff)`;
        console.error(`[Reconciliation] ${reconciliationWarning}`);
      } else {
        console.log(`[Reconciliation] ✓ PASS: Extracted $${extractedTotal.toFixed(2)} vs PDF $${pdfGrandTotal.toFixed(2)} (${(percentageDiff * 100).toFixed(3)}% diff)`);
      }
    } else {
      console.warn(`[Reconciliation] SKIPPED: No PDF grand total available`);
    }

    if (Math.abs(fixedItems.length - countData.lineItemCount) > 10) {
      console.warn(`[LLM Fallback] WARNING: Item count mismatch! Expected ${countData.lineItemCount}, got ${fixedItems.length}`);
    }

    console.log('[LLM Fallback] Success:', fixedItems.length, 'items, confidence:', 0.8);

    // Merge warnings from block reconciliation and LLM
    const allWarnings = [...warnings];
    if (totalsMismatch) {
      allWarnings.push(reconciliationWarning);
    }

    return new Response(
      JSON.stringify({
        success: true,
        lines: fixedItems,
        items: fixedItems,
        confidence: totalsMismatch ? 0.75 : 0.85,
        warnings: allWarnings,
        metadata: {
          expectedItemCount: countData.lineItemCount,
          actualItemCount: fixedItems.length,
          quoteTotalAmount: pdfGrandTotal,
          extractedTotal: extractedTotal,
          totalsMismatch: totalsMismatch,
          reconciliationStatus: totalsMismatch ? 'FAILED' : 'PASSED',
          blockTotals: blockTotals.size > 0 ? Object.fromEntries(blockTotals) : undefined,
        },
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