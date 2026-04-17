import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  sanitizePlumbingItems,
  PLUMBING_SYSTEM_PROMPT,
  PASSIVE_FIRE_SYSTEM_PROMPT,
} from "../_shared/plumbingSanitizer.ts";

// =============================================================================
// parse_quote_llm_fallback
//
// PRIMARY LLM parser for PDF quote documents.
// Model: gpt-4o (configurable via OPENAI_MODEL env / system_config)
//
// Returns strict shape:
//   { items[], confidence, warnings[], document_grand_total,
//     document_sub_total, optional_scope_total, parser_used }
//
// Chunking: auto-triggered for docs > 5 000 chars, with overlap.
// =============================================================================

const PARSER_USED = "gpt-4o_llm_primary";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---------------------------------------------------------------------------
// Canonical output type
// ---------------------------------------------------------------------------

export interface LlmLineItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  section?: string;
  frr?: string;
  scope_category?: "base" | "optional" | "exclusion";
  raw_source?: string;
  confidence?: number;
}

export interface LlmParserOutput {
  items: LlmLineItem[];
  confidence: number;
  warnings: string[];
  document_grand_total: number | null;
  document_sub_total: number | null;
  optional_scope_total: number | null;
  parser_used: string;
}

// ---------------------------------------------------------------------------
// Request shape (backward compat)
// ---------------------------------------------------------------------------

interface ParseRequest {
  text?: string;
  chunks?: unknown;
  supplierName?: string;
  documentType?: string;
  chunkInfo?: string;
  trade?: string;
}

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — generic trades (plumbing/passive_fire handled separately)
// ---------------------------------------------------------------------------

const GENERIC_SYSTEM_PROMPT = `You are an expert at extracting line items from construction subcontractor quotes.

ARCHITECTURE
Quotes are typically hierarchical:
  1. Document totals / summary page   → NEVER extract as items
  2. Section subtotals                → NEVER extract as items
  3. Individual priced line items     → ALWAYS extract

ITEMS TO EXTRACT
Extract a row only when ALL of the following are present:
  • A description (product / service name)
  • A quantity (numeric)
  • A unit rate (numeric)
  • A total (numeric, should equal qty × rate within 5%)

ITEMS TO SKIP — NEVER include these:
  • Rows where description matches: Total, Sub-Total, Subtotal, Grand Total,
    Net Total, Contract Sum, Contract Value, Quote Total, Tender Sum,
    Project Total, Lump Sum Total, P&G, Margin, GST, Allowance (standalone),
    Carried Forward, B/F, Brought Forward, Page Total
  • Section header rows (no numbers, just headings)
  • Rows where the value equals the arithmetic sum of all other rows
  • Blank rows or purely narrative rows

OPTIONAL SCOPE DETECTION
If you see any section/item clearly labelled:
  "Optional", "Provisional", "PC Sum", "Prime Cost", "Alternate",
  "Add Alt", "Addendum", "Excluded Scope", "By Others"
  → set scope_category = "optional" on those items.

EXCLUSION DETECTION
Items listed under "Exclusions", "Not Included", "By Others" sections
  → set scope_category = "exclusion" (still extract them for reference).

All other items → scope_category = "base".

FRR / FIRE RATINGS
If the description or a nearby column mentions a Fire Resistance Rating
(e.g., "90/90/-", "60 min", "FRL 120/-/-")
  → set frr to that value. Otherwise leave frr as empty string.

MULTI-LINE ITEMS
Some items have the description on one line and the numbers on the next.
ALWAYS look at the previous line when a line starts with numbers only.
Join them into a single item.

CARRIED FORWARD / PAGE TOTAL ROWS
Lines containing "Carried Forward", "C/F", "B/F", "Brought Forward",
"Page Total", "Page Sub-Total" must be IGNORED entirely.

UNIT NORMALISATION
If the unit column shows "0", "-", "N/A", or is blank → use "ea".
NEVER output unit = 0.

CONFIDENCE SCORING
Return a confidence value 0–1 reflecting extraction quality:
  0.90–1.00  clean structured table, totals verified
  0.70–0.89  good extraction, minor issues
  0.50–0.69  partial extraction or ambiguous structure
  0.00–0.49  very uncertain

Deduct:
  −0.10 per 3 malformed rows detected
  −0.15 if totals mismatch by more than 20%
  −0.10 if too few rows for document length

RETURN FORMAT (strict JSON, no markdown):
{
  "items": [
    {
      "description": "string",
      "qty": number,
      "unit": "string",
      "rate": number,
      "total": number,
      "section": "string",
      "frr": "string",
      "scope_category": "base" | "optional" | "exclusion",
      "raw_source": "original text line(s) verbatim"
    }
  ],
  "confidence": number,
  "warnings": ["string"],
  "document_grand_total": number | null,
  "document_sub_total": number | null,
  "optional_scope_total": number | null
}`;

// ---------------------------------------------------------------------------
// Fetch with timeout
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 50000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`OpenAI request timeout after ${timeoutMs}ms`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Chunking helpers
// ---------------------------------------------------------------------------

function shouldChunk(text: string): boolean {
  return text.length > 5000;
}

function chunkByLinesWithOverlap(
  text: string,
  maxChars = 3200,
  overlapLines = 12,
): { section: string; content: string }[] {
  const lines = text.split("\n");
  const chunks: { section: string; content: string }[] = [];
  let current: string[] = [];
  let n = 1;

  for (const line of lines) {
    current.push(line);
    if (current.join("\n").length >= maxChars) {
      chunks.push({ section: `Section ${n++}`, content: current.join("\n") });
      current = current.slice(Math.max(0, current.length - overlapLines));
    }
  }
  if (current.length) {
    chunks.push({ section: `Section ${n}`, content: current.join("\n") });
  }
  console.log(`[LLMPrimary] Line-overlap chunking → ${chunks.length} chunks`);
  return chunks;
}

function chunkBySections(
  text: string,
): { section: string; content: string }[] {
  const SECTION_RE =
    /^([A-Z][A-Za-z0-9 &\/\-]{2,60})(?:\s+\$[\d,]+\.?\d*)?$/m;
  const lines = text.split("\n");
  const chunks: { section: string; content: string }[] = [];
  const OVERLAP = 12;
  let sectionName = "Main";
  let buf: string[] = [];

  const flush = () => {
    if (buf.length > 8) {
      chunks.push({ section: sectionName, content: buf.join("\n") });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(SECTION_RE);
    if (m && line.length < 90) {
      flush();
      const tail = buf.slice(Math.max(0, buf.length - OVERLAP));
      sectionName = m[1].trim();
      buf = [...tail, line];
      continue;
    }
    buf.push(line);
    if (buf.join("\n").length > 3200) {
      const label = `${sectionName} (part ${chunks.filter((c) => c.section.startsWith(sectionName)).length + 1})`;
      chunks.push({ section: label, content: buf.join("\n") });
      buf = buf.slice(Math.max(0, buf.length - OVERLAP));
    }
  }
  flush();

  if (chunks.length <= 1 && text.length > 4000) {
    return chunkByLinesWithOverlap(text, 3200, 12);
  }
  console.log(
    `[LLMPrimary] Section chunking → ${chunks.length} chunks:`,
    chunks.map((c) => c.section),
  );
  return chunks;
}

// ---------------------------------------------------------------------------
// Document totals extractor (regex, runs on full raw text)
// ---------------------------------------------------------------------------

function extractDocumentTotals(text: string): {
  grand_total_excl_gst: number | null;
  sub_total: number | null;
  gst_amount: number | null;
  grand_total_incl_gst: number | null;
  optional_scope_total: number | null;
} {
  const t = text.replace(/\u00A0/g, " ").replace(/\s+/g, " ");

  const parseMoney = (s: string): number | null => {
    const cleaned = s.replace(/[^0-9.]/g, "");
    const v = parseFloat(cleaned);
    return v > 0 && Number.isFinite(v) ? v : null;
  };

  const grab = (re: RegExp): number | null => {
    const m = t.match(re);
    return m ? parseMoney(m[1]) : null;
  };

  let grandExcl =
    grab(/Grand\s+Total\s*\(exclu?d?i?n?g?\s+GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Grand\s+Total\s+excl?\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Grand\s+Total\s+ex\.?\s*GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Total\s+\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Contract\s+Sum\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Tender\s+Sum\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const subTotal =
    grab(/Sub[\s-]?Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Net\s+Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const gst =
    grab(/GST\s*\(10%\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const grandIncl =
    grab(/Grand\s+Total\s*\(inclu?d?i?n?g?\s+GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Total\s+\(incl\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  const optionalTotal =
    grab(/Optional\s+(?:Scope\s+)?Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Provisional\s+(?:Sum\s+)?Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/PC\s+Sum\s+Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

  return {
    grand_total_excl_gst: grandExcl,
    sub_total: subTotal,
    gst_amount: gst,
    grand_total_incl_gst: grandIncl,
    optional_scope_total: optionalTotal,
  };
}

// ---------------------------------------------------------------------------
// Plumbing regex fallback for level-based pricing tables
// ---------------------------------------------------------------------------

function parseSumFromTokens(numbers: string[]): number {
  const tokens = numbers.map((n) => n.replace(/,/g, ""));
  let i = tokens.length - 1;
  let candidate = tokens[i];
  let val = parseFloat(candidate);
  while (i > 0 && tokens[i - 1].length <= 2) {
    i--;
    candidate = tokens[i] + candidate;
    val = parseFloat(candidate);
  }
  while (val < 1000 && i > 0) {
    i--;
    candidate = tokens[i] + candidate;
    val = parseFloat(candidate);
  }
  return val >= 1000 ? val : 0;
}

function extractPlumbingLevelTable(text: string): LlmLineItem[] {
  const results: LlmLineItem[] = [];
  const LEVEL_RE =
    /^(lower\s+ground(?:\s+level)?|upper\s+ground(?:\s+level)?|ground(?:\s+level)?|basement|level\s+\d+|floor\s+\d+|roof(?:\s+level)?|plant\s+room|car\s+park(?:\s+level)?|podium(?:\s+level)?)/i;
  const SKIP_RE =
    /^(total|sub\s*total|grand\s*total|items?|plumbing|description|levels?|sum|note)/i;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || SKIP_RE.test(line)) continue;
    const lm = line.match(LEVEL_RE);
    if (!lm) continue;
    const numbers = line.match(/[\d,]+(?:\.\d+)?/g);
    if (!numbers) continue;
    const sumVal = parseSumFromTokens(numbers);
    if (!sumVal || sumVal < 1000) continue;
    const label =
      lm[0]
        .trim()
        .replace(/\b(\w)/g, (c) => c.toUpperCase())
        .replace(/\s+/g, " ") + " - Plumbing Works";
    results.push({
      description: label,
      qty: 1,
      unit: "LS",
      rate: sumVal,
      total: sumVal,
      section: "Main",
      scope_category: "base",
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Post-processing: fix duplicate-total artefact, merge multiline, dedupe
// ---------------------------------------------------------------------------

function fixDuplicateTotals(items: LlmLineItem[]): LlmLineItem[] {
  const freq = new Map<number, number>();
  items.forEach((i) => freq.set(i.total, (freq.get(i.total) ?? 0) + 1));
  const maxFreq = Math.max(0, ...freq.values());
  if (maxFreq < 10) return items;

  console.warn(
    `[LLMPrimary] ${maxFreq} items share the same total — recalculating from qty×rate`,
  );
  return items.map((item) => {
    const calc = (item.qty ?? 0) * (item.rate ?? 0);
    return calc > 0 && calc !== item.total ? { ...item, total: calc } : item;
  });
}

function filterCarriedForward(items: LlmLineItem[]): LlmLineItem[] {
  const CF_RE =
    /carried\s+forward|c\s*\/\s*f|b\s*\/\s*f|brought\s+forward|page\s+(sub\s*-?\s*)?total/i;
  return items.filter((i) => !CF_RE.test(i.description ?? ""));
}

function normaliseUnits(items: LlmLineItem[]): LlmLineItem[] {
  return items.map((i) => ({
    ...i,
    unit: !i.unit || i.unit === "0" || i.unit === "-" || i.unit === "N/A"
      ? "ea"
      : i.unit,
  }));
}

function dedupeByRawSource(items: LlmLineItem[]): LlmLineItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.raw_source
      ? i.raw_source.trim()
      : `${i.description}|${i.qty}|${i.rate}|${i.total}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Confidence scoring (post-processing, augments LLM self-reported score)
// ---------------------------------------------------------------------------

function computeConfidence(params: {
  llmConfidence: number;
  itemCount: number;
  textLength: number;
  rowTotal: number;
  documentTotal: number | null;
  malformedCount: number;
  chunked: boolean;
  chunkCount: number;
}): number {
  const {
    llmConfidence,
    itemCount,
    textLength,
    rowTotal,
    documentTotal,
    malformedCount,
    chunked,
    chunkCount,
  } = params;

  let score = llmConfidence;

  // Too few rows for document size
  const linesEstimate = textLength / 60;
  if (linesEstimate > 200 && itemCount < 5) score -= 0.15;
  else if (linesEstimate > 100 && itemCount < 3) score -= 0.20;

  // Malformed rows
  if (malformedCount > 0) score -= 0.10 * Math.floor(malformedCount / 3);

  // Totals mismatch
  if (documentTotal && documentTotal > 0 && rowTotal > 0) {
    const variance = Math.abs(documentTotal - rowTotal) / documentTotal;
    if (variance > 0.30) score -= 0.20;
    else if (variance > 0.20) score -= 0.10;
    else if (variance < 0.02) score += 0.05;
  }

  // Zero items is worst case
  if (itemCount === 0) return 0;

  // Small bonus for multi-chunk success
  if (chunked && chunkCount > 1 && itemCount > 10) score += 0.03;

  return Math.min(1.0, Math.max(0, score));
}

// ---------------------------------------------------------------------------
// Call OpenAI for a single text block
// ---------------------------------------------------------------------------

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  timeoutMs: number,
): Promise<{
  items: LlmLineItem[];
  confidence: number;
  warnings: string[];
  document_grand_total: number | null;
  document_sub_total: number | null;
  optional_scope_total: number | null;
}> {
  const res = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_completion_tokens: maxTokens,
      }),
    },
    timeoutMs,
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty content in OpenAI response");

  const parsed = JSON.parse(content);
  return {
    items: parsed.items ?? [],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
    warnings: parsed.warnings ?? [],
    document_grand_total: parsed.document_grand_total ?? null,
    document_sub_total: parsed.document_sub_total ?? null,
    optional_scope_total: parsed.optional_scope_total ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient } = await import("npm:@supabase/supabase-js@2.57.4");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: configData } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "OPENAI_API_KEY")
      .maybeSingle();

    const openaiApiKey = configData?.value ?? Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          items: [],
          confidence: 0,
          warnings: ["OpenAI API key not configured"],
          document_grand_total: null,
          document_sub_total: null,
          optional_scope_total: null,
          parser_used: PARSER_USED,
        } satisfies LlmParserOutput & { success: boolean }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: modelConfig } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "OPENAI_MODEL")
      .maybeSingle();

    const model = modelConfig?.value ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

    const body: ParseRequest = await req.json();
    const { text, supplierName, trade } = body;

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          items: [],
          confidence: 0,
          warnings: ["No text provided"],
          document_grand_total: null,
          document_sub_total: null,
          optional_scope_total: null,
          parser_used: PARSER_USED,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tradeLower = (trade ?? "").toLowerCase();
    const isPlumbing = tradeLower === "plumbing";
    const isPassiveFire = tradeLower === "passive_fire";

    const systemPrompt = isPlumbing
      ? PLUMBING_SYSTEM_PROMPT
      : isPassiveFire
      ? PASSIVE_FIRE_SYSTEM_PROMPT
      : GENERIC_SYSTEM_PROMPT;

    const textLength = text.length;
    const chunked = shouldChunk(text);
    console.log(
      `[LLMPrimary] model=${model} trade=${trade ?? "generic"} chars=${textLength} chunked=${chunked}`,
    );

    let allItems: LlmLineItem[] = [];
    let allWarnings: string[] = [];
    let llmGrandTotal: number | null = null;
    let llmSubTotal: number | null = null;
    let llmOptionalTotal: number | null = null;
    let rawLlmConfidence = 0;
    let chunkCount = 0;

    if (chunked) {
      const chunks = chunkBySections(text);
      chunkCount = chunks.length;
      let confSum = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(
          `[LLMPrimary] chunk ${i + 1}/${chunks.length}: ${chunk.section} (${chunk.content.length} chars)`,
        );
        const userPrompt = [
          `Supplier: ${supplierName ?? "Unknown"}`,
          `Section: ${chunk.section}`,
          `Trade: ${trade ?? "general"}`,
          ``,
          chunk.content,
        ].join("\n");

        try {
          const result = await callOpenAI(
            openaiApiKey,
            model,
            systemPrompt,
            userPrompt,
            4096,
            45000,
          );
          const taggedItems = result.items.map((it) => ({
            ...it,
            section: it.section || chunk.section,
          }));
          allItems.push(...taggedItems);
          allWarnings.push(...result.warnings);
          confSum += result.confidence;
          if (result.document_grand_total) {
            llmGrandTotal = (llmGrandTotal ?? 0) + result.document_grand_total;
          }
          if (result.document_sub_total) {
            llmSubTotal = (llmSubTotal ?? 0) + result.document_sub_total;
          }
          if (result.optional_scope_total) {
            llmOptionalTotal = (llmOptionalTotal ?? 0) + result.optional_scope_total;
          }
          console.log(
            `[LLMPrimary] chunk ${i + 1} → ${result.items.length} items (conf=${result.confidence.toFixed(2)})`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[LLMPrimary] chunk ${i + 1} failed:`, msg);
          allWarnings.push(`Section "${chunk.section}" parse failed: ${msg}`);
        }
      }

      rawLlmConfidence = chunks.length > 0 ? confSum / chunks.length : 0;
    } else {
      const userPrompt = [
        `Supplier: ${supplierName ?? "Unknown"}`,
        `Trade: ${trade ?? "general"}`,
        ``,
        text,
      ].join("\n");

      console.log("[LLMPrimary] single-shot call");
      const result = await callOpenAI(
        openaiApiKey,
        model,
        systemPrompt,
        userPrompt,
        16384,
        50000,
      );
      allItems = result.items;
      allWarnings = result.warnings;
      rawLlmConfidence = result.confidence;
      llmGrandTotal = result.document_grand_total;
      llmSubTotal = result.document_sub_total;
      llmOptionalTotal = result.optional_scope_total;
      chunkCount = 1;
    }

    console.log(`[LLMPrimary] raw LLM items: ${allItems.length}`);

    // Plumbing-specific: regex fallback if LLM returned nothing
    if (isPlumbing && allItems.length === 0) {
      console.log("[LLMPrimary] Plumbing: LLM returned 0 items — regex level-table fallback");
      const levelItems = extractPlumbingLevelTable(text);
      if (levelItems.length > 0) {
        allItems = levelItems;
        allWarnings.push("Items extracted via regex level-table fallback (LLM returned 0 items)");
      }
    }

    // Plumbing sanitizer — strip summary rows
    let plumbingDetectedTotal: number | null = null;
    if (isPlumbing) {
      const { cleanedItems, quoteTotalFound } = sanitizePlumbingItems(
        allItems as unknown as Record<string, unknown>[],
        null,
      );
      const before = allItems.length;
      allItems = cleanedItems as unknown as LlmLineItem[];
      plumbingDetectedTotal = quoteTotalFound;
      console.log(
        `[LLMPrimary] Plumbing sanitizer: ${before} → ${allItems.length} items (removed ${before - allItems.length})`,
      );
    }

    // Post-processing pipeline
    allItems = filterCarriedForward(allItems);
    allItems = fixDuplicateTotals(allItems);
    allItems = normaliseUnits(allItems);
    allItems = dedupeByRawSource(allItems);

    // Count malformed rows (qty × rate deviates > 10% from total)
    let malformedCount = 0;
    for (const item of allItems) {
      const calc = (item.qty ?? 0) * (item.rate ?? 0);
      if (calc > 0 && item.total > 0) {
        const dev = Math.abs(calc - item.total) / item.total;
        if (dev > 0.10) malformedCount++;
      }
    }

    // Document totals from raw text (regex, authoritative)
    const regexTotals = extractDocumentTotals(text);
    console.log("[LLMPrimary] regex totals:", regexTotals);

    const documentGrandTotal =
      regexTotals.grand_total_excl_gst ??
      plumbingDetectedTotal ??
      llmGrandTotal ??
      null;

    const documentSubTotal =
      regexTotals.sub_total ?? llmSubTotal ?? null;

    const optionalItemsSum = allItems
      .filter((i) => i.scope_category === "optional")
      .reduce((s, i) => s + (i.total ?? 0), 0);
    const optionalScopeTotal =
      regexTotals.optional_scope_total ??
      llmOptionalTotal ??
      (optionalItemsSum > 0 ? optionalItemsSum : null);

    const rowTotal = allItems.reduce((s, i) => s + (i.total ?? 0), 0);

    if (documentGrandTotal && Math.abs(rowTotal - documentGrandTotal) > 100) {
      allWarnings.push(
        `Items row-sum ($${rowTotal.toFixed(2)}) differs from document total ($${documentGrandTotal.toFixed(2)})`,
      );
    }

    const confidence = computeConfidence({
      llmConfidence: rawLlmConfidence,
      itemCount: allItems.length,
      textLength,
      rowTotal,
      documentTotal: documentGrandTotal,
      malformedCount,
      chunked,
      chunkCount,
    });

    console.log(
      `[LLMPrimary] final: items=${allItems.length} confidence=${confidence.toFixed(2)}` +
        ` grandTotal=${documentGrandTotal ?? "N/A"} rowTotal=${rowTotal.toFixed(2)}`,
    );

    const output: LlmParserOutput = {
      items: allItems,
      confidence,
      warnings: allWarnings,
      document_grand_total: documentGrandTotal,
      document_sub_total: documentSubTotal,
      optional_scope_total: optionalScopeTotal,
      parser_used: PARSER_USED,
    };

    return new Response(
      JSON.stringify({
        success: true,
        ...output,
        lines: allItems,
        totals: {
          subtotal: documentSubTotal ?? rowTotal,
          grandTotal: documentGrandTotal ?? rowTotal,
          quotedTotal: documentGrandTotal,
          gst: regexTotals.gst_amount,
        },
        metadata: {
          supplier: supplierName,
          itemCount: allItems.length,
          chunked,
          chunkCount,
          malformedRows: malformedCount,
          model,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[LLMPrimary] unhandled error:", msg);
    return new Response(
      JSON.stringify({
        success: false,
        items: [],
        lines: [],
        confidence: 0,
        warnings: [`Parse failed: ${msg}`],
        document_grand_total: null,
        document_sub_total: null,
        optional_scope_total: null,
        parser_used: PARSER_USED,
        totals: {},
        metadata: {},
        error: msg,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
