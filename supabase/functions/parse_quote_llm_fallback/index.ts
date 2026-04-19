import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  sanitizePlumbingItems,
  PLUMBING_SYSTEM_PROMPT,
  PASSIVE_FIRE_SYSTEM_PROMPT,
} from "../_shared/plumbingSanitizer.ts";

// =============================================================================
// parse_quote_llm_fallback  — Line-Item Truth Engine
//
// Architecture:
//   1. Tables / schedules are PRIMARY source of truth
//   2. Parse every priced row, tagged by section
//   3. Detect: Main Scope | Optional Scope | Excluded / NIC
//   4. Sum each section independently
//   5. Summary page totals are VALIDATION only
//   6. If line-item main total differs from summary: return both + explanation
// =============================================================================

const PARSER_USED = "gpt-4o_line_item_truth_engine_v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LlmLineItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  section?: string;
  frr?: string;
  scope_category: "base" | "optional" | "exclusion";
  raw_source?: string;
  confidence?: number;
  section_heading?: string;
}

export interface TruthEngineOutput {
  main_items: LlmLineItem[];
  optional_items: LlmLineItem[];
  excluded_items: LlmLineItem[];
  main_scope_total: number;
  optional_scope_total: number;
  excluded_total: number;
  summary_total: number | null;
  variance_percent: number | null;
  confidence: number;
  reasoning: string;
  warnings: string[];
  parser_used: string;
  items: LlmLineItem[];
  document_grand_total: number | null;
  document_sub_total: number | null;
}

interface ParseRequest {
  text?: string;
  chunks?: unknown;
  supplierName?: string;
  documentType?: string;
  chunkInfo?: string;
  trade?: string;
}

// ---------------------------------------------------------------------------
// DETERMINISTIC PRE-TAGGING — runs before LLM, labels rows by regex
// Reads the raw text line by line and emits a tag map keyed by line index.
// ---------------------------------------------------------------------------

const OPTIONAL_HEADING_RE =
  /^\s*(optional\s+(extras?|scope|items?|works?|add[-\s]?ons?)|add\s+to\s+scope|alternate[s]?|addendum|provisional\s+(sum[s]?|items?)|pc\s+sum[s]?|prime\s+cost\s+sum[s]?|add[-\s]alt[s]?)/i;

const EXCLUDED_HEADING_RE =
  /^\s*(exclusion[s]?|not\s+included|nic\b|by\s+others?|scope\s+exclusions?|items?\s+excluded|excluded\s+items?|not\s+in\s+contract|not\s+in\s+scope)/i;

const MAIN_SCOPE_HEADING_RE =
  /^\s*(main\s+(scope|contract|works?)|base\s+(scope|contract|works?)|base\s+bid|schedule\s+of\s+(works?|rates?)|contract\s+works?|scope\s+of\s+works?|bill\s+of\s+quantities|boq|trade\s+works?)/i;

const OPTIONAL_INLINE_RE =
  /^(optional|provisional|pc\s+sum|prime\s+cost|alternate|add\s+alt|add[-\s]on|addendum)\s*[\-–:]/i;

const EXCLUDED_INLINE_RE =
  /^(nic|not\s+included|by\s+others?|excluded?|not\s+in\s+scope|not\s+in\s+contract)\s*[\-–:]/i;

type ScopeTag = "base" | "optional" | "exclusion";

function deterministicTagLines(text: string): Map<number, ScopeTag> {
  const tagMap = new Map<number, ScopeTag>();
  const lines = text.split("\n");
  let currentTag: ScopeTag = "base";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (OPTIONAL_HEADING_RE.test(trimmed)) {
      currentTag = "optional";
      tagMap.set(i, "optional");
      continue;
    }
    if (EXCLUDED_HEADING_RE.test(trimmed)) {
      currentTag = "exclusion";
      tagMap.set(i, "exclusion");
      continue;
    }
    if (MAIN_SCOPE_HEADING_RE.test(trimmed)) {
      currentTag = "base";
      tagMap.set(i, "base");
      continue;
    }

    if (OPTIONAL_INLINE_RE.test(trimmed)) {
      tagMap.set(i, "optional");
    } else if (EXCLUDED_INLINE_RE.test(trimmed)) {
      tagMap.set(i, "exclusion");
    } else {
      tagMap.set(i, currentTag);
    }
  }

  return tagMap;
}

// Apply deterministic tags to LLM-returned items using raw_source matching
function applyDeterministicTags(
  items: LlmLineItem[],
  rawText: string,
): LlmLineItem[] {
  const tagMap = deterministicTagLines(rawText);
  const lines = rawText.split("\n");

  return items.map((item) => {
    if (!item.raw_source) return item;

    const rawLines = item.raw_source.split("\n").map((l) => l.trim()).filter(Boolean);
    let bestTag: ScopeTag | null = null;

    for (let li = 0; li < lines.length; li++) {
      if (rawLines.some((rl) => lines[li].includes(rl) && rl.length > 8)) {
        const tag = tagMap.get(li);
        if (tag && tag !== "base") {
          bestTag = tag;
          break;
        }
        if (!bestTag) bestTag = tag ?? "base";
      }
    }

    if (bestTag && bestTag !== item.scope_category) {
      return { ...item, scope_category: bestTag };
    }
    return item;
  });
}

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — Truth Engine version
// ---------------------------------------------------------------------------

const TRUTH_ENGINE_SYSTEM_PROMPT = `You are a construction quote analyst — a line-item truth engine.

## PRIMARY OBJECTIVE
Tables and schedules are the primary source of truth.
Parse EVERY priced row from the schedule/BOQ tables.
Summary page totals are for validation only — not primary truth.

## SECTION DETECTION (CRITICAL)
As you read the document, track which section each row belongs to:

### MAIN SCOPE (scope_category = "base")
All standard contract work items. Default unless section heading says otherwise.
Includes: trade works, base contract items, standard bill of quantities items.

### OPTIONAL SCOPE (scope_category = "optional")
Items under ANY heading matching:
  - "Optional", "Optional Extras", "Optional Scope", "Add to Scope"
  - "Provisional Sum", "PC Sum", "Prime Cost Sum"
  - "Alternate", "Add Alt", "Addendum"
  - "Provisional Items"
Also: any row where description STARTS WITH "Optional -", "Alt -", "PC Sum -"

### EXCLUDED / NIC (scope_category = "exclusion")
Items under ANY heading matching:
  - "Exclusions", "Not Included", "NIC", "By Others"
  - "Scope Exclusions", "Items Excluded", "Not in Contract"
Also: rows starting with "NIC -", "By Others -", "Excluded -"

## WHAT TO EXTRACT
Extract a row ONLY when it has:
  - A description (product/service name)
  - A quantity (numeric, can be 1 for lump sum)
  - A unit rate (numeric)
  - A total (numeric)

## WHAT TO SKIP — NEVER include:
  - Rows whose description is: Total, Sub-Total, Grand Total, Net Total,
    Contract Sum, Contract Value, Quote Total, Tender Sum, Project Total,
    Lump Sum Total, GST, Margin, P&G, Carried Forward, B/F, Page Total,
    Brought Forward, Section Total
  - Section header rows with no numbers
  - Rows whose value equals the sum of all other rows (document total row)
  - Blank or purely narrative rows

## SECTION HEADING TRACKING
When you encounter a section heading, record it in "section_heading" field
on all subsequent items until the next heading is encountered.
This is how the section total validation works.

## FRR / FIRE RATINGS
If description mentions a fire resistance rating (e.g. "90/90/-", "60 min", "FRL 120/-/-")
→ set frr to that value. Otherwise set frr = "".

## MULTI-LINE ITEMS
If a line has only numbers (qty, rate, total) with no description,
look at the PREVIOUS line for the description and join them.

## UNIT NORMALISATION
If unit is "0", "-", "N/A", or blank → use "ea"

## CONFIDENCE SCORING (0–1)
  0.90–1.00: clean table, all rows extracted, totals verified
  0.70–0.89: good extraction, minor issues
  0.50–0.69: partial extraction or ambiguous structure
  0.00–0.49: very uncertain, poor structure

Deductions:
  −0.10 per 3 malformed rows
  −0.15 if main-scope row total vs summary differs > 20%
  −0.10 if too few rows for document length
  −0.05 if section detection is ambiguous

## RETURN FORMAT (strict JSON, no markdown):
{
  "items": [
    {
      "description": "string",
      "qty": number,
      "unit": "string",
      "rate": number,
      "total": number,
      "section": "string",
      "section_heading": "string",
      "frr": "string",
      "scope_category": "base" | "optional" | "exclusion",
      "raw_source": "original text line(s) verbatim"
    }
  ],
  "confidence": number,
  "warnings": ["string"],
  "document_grand_total": number | null,
  "document_sub_total": number | null,
  "optional_scope_total": number | null,
  "reasoning": "Brief explanation of section detection decisions"
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

function chunkBySections(text: string): { section: string; content: string }[] {
  const SECTION_RE =
    /^([A-Z][A-Za-z0-9 &\/\-]{2,60})(?:\s+\$[\d,]+\.?\d*)?$/m;
  const lines = text.split("\n");
  const chunks: { section: string; content: string }[] = [];
  const OVERLAP = 16;
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
    return chunkByLinesWithOverlap(text, 3200, 16);
  }
  console.log(
    `[TruthEngine] Section chunking → ${chunks.length} chunks:`,
    chunks.map((c) => c.section),
  );
  return chunks;
}

function chunkByLinesWithOverlap(
  text: string,
  maxChars = 3200,
  overlapLines = 16,
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
  console.log(`[TruthEngine] Line-overlap chunking → ${chunks.length} chunks`);
  return chunks;
}

// ---------------------------------------------------------------------------
// Document totals extractor (regex — summary page validation source)
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

  const grandExcl =
    grab(/Grand\s+Total\s*\(exclu?d?i?n?g?\s+GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Grand\s+Total\s+excl?\.?\s+GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Grand\s+Total\s+ex\.?\s*GST\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Total\s+\(excl\.?\s*GST\)\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Contract\s+Sum\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Tender\s+Sum\s*:?\s*\$?\s*([\d,]+\.?\d*)/i) ??
    grab(/Grand\s+Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);

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
// Post-processing pipeline
// ---------------------------------------------------------------------------

function fixDuplicateTotals(items: LlmLineItem[]): LlmLineItem[] {
  const freq = new Map<number, number>();
  items.forEach((i) => freq.set(i.total, (freq.get(i.total) ?? 0) + 1));
  const maxFreq = Math.max(0, ...freq.values());
  if (maxFreq < 10) return items;

  console.warn(
    `[TruthEngine] ${maxFreq} items share the same total — recalculating from qty×rate`,
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
// Variance engine — compares line-item truth to summary page
// ---------------------------------------------------------------------------

function computeVariance(
  lineItemTotal: number,
  summaryTotal: number | null,
): { variance_percent: number | null; explanation: string } {
  if (!summaryTotal || summaryTotal <= 0) {
    return {
      variance_percent: null,
      explanation: "No summary total found in document — line-item total is authoritative.",
    };
  }

  if (lineItemTotal <= 0) {
    return {
      variance_percent: null,
      explanation: "No main-scope line items extracted — cannot compute variance.",
    };
  }

  const variance_percent =
    ((lineItemTotal - summaryTotal) / summaryTotal) * 100;
  const absVariance = Math.abs(variance_percent);
  const formatted = variance_percent.toFixed(2);

  if (absVariance < 0.5) {
    return {
      variance_percent,
      explanation: `Line-item main total ($${lineItemTotal.toFixed(2)}) matches summary total ($${summaryTotal.toFixed(2)}) within 0.5% — high confidence.`,
    };
  }

  if (absVariance < 5) {
    return {
      variance_percent,
      explanation: `Minor variance of ${formatted}% detected. Line-item total: $${lineItemTotal.toFixed(2)}, summary total: $${summaryTotal.toFixed(2)}. Likely rounding or minor scope difference.`,
    };
  }

  if (absVariance < 20) {
    return {
      variance_percent,
      explanation: `Moderate variance of ${formatted}% detected. Line-item total: $${lineItemTotal.toFixed(2)}, summary total: $${summaryTotal.toFixed(2)}. Check for optional items incorrectly included in main scope, or missing rows.`,
    };
  }

  return {
    variance_percent,
    explanation: `SIGNIFICANT variance of ${formatted}% detected. Line-item total: $${lineItemTotal.toFixed(2)}, summary total: $${summaryTotal.toFixed(2)}. Possible causes: optional scope mixed into main, missing sections, summary page out of date, or arithmetic error in original document. Human review recommended.`,
  };
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

function computeConfidence(params: {
  llmConfidence: number;
  itemCount: number;
  textLength: number;
  mainTotal: number;
  summaryTotal: number | null;
  malformedCount: number;
  chunked: boolean;
  chunkCount: number;
  variancePercent: number | null;
}): number {
  const {
    llmConfidence,
    itemCount,
    textLength,
    mainTotal,
    summaryTotal,
    malformedCount,
    chunked,
    chunkCount,
    variancePercent,
  } = params;

  let score = llmConfidence;

  const linesEstimate = textLength / 60;
  if (linesEstimate > 200 && itemCount < 5) score -= 0.15;
  else if (linesEstimate > 100 && itemCount < 3) score -= 0.20;

  if (malformedCount > 0) score -= 0.10 * Math.floor(malformedCount / 3);

  if (variancePercent !== null) {
    const absV = Math.abs(variancePercent);
    if (absV > 20) score -= 0.20;
    else if (absV > 5) score -= 0.10;
    else if (absV < 0.5 && summaryTotal && mainTotal > 0) score += 0.05;
  }

  if (itemCount === 0) return 0;

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
  reasoning: string;
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
    reasoning: parsed.reasoning ?? "",
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
          main_items: [],
          optional_items: [],
          excluded_items: [],
          main_scope_total: 0,
          optional_scope_total: 0,
          excluded_total: 0,
          summary_total: null,
          variance_percent: null,
          confidence: 0,
          reasoning: "OpenAI API key not configured",
          warnings: ["OpenAI API key not configured"],
          document_grand_total: null,
          document_sub_total: null,
          parser_used: PARSER_USED,
        }),
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
          main_items: [],
          optional_items: [],
          excluded_items: [],
          main_scope_total: 0,
          optional_scope_total: 0,
          excluded_total: 0,
          summary_total: null,
          variance_percent: null,
          confidence: 0,
          reasoning: "No text provided",
          warnings: ["No text provided"],
          document_grand_total: null,
          document_sub_total: null,
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
      : TRUTH_ENGINE_SYSTEM_PROMPT;

    const textLength = text.length;
    const chunked = shouldChunk(text);
    console.log(
      `[TruthEngine] model=${model} trade=${trade ?? "generic"} chars=${textLength} chunked=${chunked}`,
    );

    let allItems: LlmLineItem[] = [];
    let allWarnings: string[] = [];
    let llmGrandTotal: number | null = null;
    let llmSubTotal: number | null = null;
    let llmOptionalTotal: number | null = null;
    let rawLlmConfidence = 0;
    let chunkCount = 0;
    let combinedReasoning = "";

    if (chunked) {
      const chunks = chunkBySections(text);
      chunkCount = chunks.length;
      let confSum = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(
          `[TruthEngine] chunk ${i + 1}/${chunks.length}: ${chunk.section} (${chunk.content.length} chars)`,
        );
        const userPrompt = [
          `Supplier: ${supplierName ?? "Unknown"}`,
          `Section: ${chunk.section}`,
          `Trade: ${trade ?? "general"}`,
          ``,
          `INSTRUCTION: Parse every priced line item. Tag each as base/optional/exclusion based on section headings.`,
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
            scope_category: it.scope_category ?? "base",
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
          if (result.reasoning) {
            combinedReasoning += `[${chunk.section}]: ${result.reasoning} `;
          }
          console.log(
            `[TruthEngine] chunk ${i + 1} → ${result.items.length} items (conf=${result.confidence.toFixed(2)})`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[TruthEngine] chunk ${i + 1} failed:`, msg);
          allWarnings.push(`Section "${chunk.section}" parse failed: ${msg}`);
        }
      }

      rawLlmConfidence = chunks.length > 0 ? confSum / chunks.length : 0;
    } else {
      const userPrompt = [
        `Supplier: ${supplierName ?? "Unknown"}`,
        `Trade: ${trade ?? "general"}`,
        ``,
        `INSTRUCTION: This is the full document. Parse every priced line item.`,
        `Tag each item as base/optional/exclusion based on section headings within the document.`,
        `Return main_scope items, optional_scope items, and excluded items separately.`,
        ``,
        text,
      ].join("\n");

      console.log("[TruthEngine] single-shot call");
      const result = await callOpenAI(
        openaiApiKey,
        model,
        systemPrompt,
        userPrompt,
        16384,
        50000,
      );
      allItems = result.items.map((it) => ({
        ...it,
        scope_category: it.scope_category ?? "base",
      }));
      allWarnings = result.warnings;
      rawLlmConfidence = result.confidence;
      llmGrandTotal = result.document_grand_total;
      llmSubTotal = result.document_sub_total;
      llmOptionalTotal = result.optional_scope_total;
      combinedReasoning = result.reasoning ?? "";
      chunkCount = 1;
    }

    console.log(`[TruthEngine] raw LLM items: ${allItems.length}`);

    // Plumbing-specific: regex fallback if LLM returned nothing
    if (isPlumbing && allItems.length === 0) {
      console.log("[TruthEngine] Plumbing: LLM returned 0 items — regex level-table fallback");
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
        `[TruthEngine] Plumbing sanitizer: ${before} → ${allItems.length} items`,
      );
    }

    // Apply deterministic section tags (overrides LLM where regex is more certain)
    allItems = applyDeterministicTags(allItems, text);

    // Post-processing pipeline
    allItems = filterCarriedForward(allItems);
    allItems = fixDuplicateTotals(allItems);
    allItems = normaliseUnits(allItems);
    allItems = dedupeByRawSource(allItems);

    // Section segregation
    const mainItems = allItems.filter((i) => i.scope_category === "base");
    const optionalItems = allItems.filter((i) => i.scope_category === "optional");
    const excludedItems = allItems.filter((i) => i.scope_category === "exclusion");

    const mainScopeTotal = mainItems.reduce((s, i) => s + (i.total ?? 0), 0);
    const optionalScopeTotal = optionalItems.reduce((s, i) => s + (i.total ?? 0), 0);
    const excludedTotal = excludedItems.reduce((s, i) => s + (i.total ?? 0), 0);

    console.log(
      `[TruthEngine] sections — main: ${mainItems.length} items ($${mainScopeTotal.toFixed(2)})` +
      ` | optional: ${optionalItems.length} items ($${optionalScopeTotal.toFixed(2)})` +
      ` | excluded: ${excludedItems.length} items ($${excludedTotal.toFixed(2)})`,
    );

    // Document totals from raw text (regex — summary page validation)
    const regexTotals = extractDocumentTotals(text);
    console.log("[TruthEngine] regex summary totals:", regexTotals);

    const summaryTotal =
      regexTotals.grand_total_excl_gst ??
      plumbingDetectedTotal ??
      llmGrandTotal ??
      null;

    const documentSubTotal = regexTotals.sub_total ?? llmSubTotal ?? null;

    // Variance engine: line-item truth vs summary page
    const { variance_percent, explanation: varianceExplanation } =
      computeVariance(mainScopeTotal, summaryTotal);

    if (variance_percent !== null && Math.abs(variance_percent) > 0.5) {
      allWarnings.push(varianceExplanation);
    }

    // Build reasoning
    const sections = [];
    if (mainItems.length > 0) sections.push(`${mainItems.length} main-scope items ($${mainScopeTotal.toFixed(2)})`);
    if (optionalItems.length > 0) sections.push(`${optionalItems.length} optional items ($${optionalScopeTotal.toFixed(2)})`);
    if (excludedItems.length > 0) sections.push(`${excludedItems.length} excluded items ($${excludedTotal.toFixed(2)})`);

    const reasoning = [
      combinedReasoning.trim(),
      sections.length > 0 ? `Extracted: ${sections.join(", ")}.` : "",
      varianceExplanation,
    ].filter(Boolean).join(" ").trim();

    // Malformed row count
    let malformedCount = 0;
    for (const item of allItems) {
      const calc = (item.qty ?? 0) * (item.rate ?? 0);
      if (calc > 0 && item.total > 0) {
        const dev = Math.abs(calc - item.total) / item.total;
        if (dev > 0.10) malformedCount++;
      }
    }

    const confidence = computeConfidence({
      llmConfidence: rawLlmConfidence,
      itemCount: allItems.length,
      textLength,
      mainTotal: mainScopeTotal,
      summaryTotal,
      malformedCount,
      chunked,
      chunkCount,
      variancePercent: variance_percent,
    });

    const optionalScopeTotalFinal =
      regexTotals.optional_scope_total ??
      llmOptionalTotal ??
      (optionalScopeTotal > 0 ? optionalScopeTotal : null);

    console.log(
      `[TruthEngine] final: items=${allItems.length} confidence=${confidence.toFixed(2)}` +
      ` mainTotal=${mainScopeTotal.toFixed(2)} summaryTotal=${summaryTotal ?? "N/A"}` +
      ` variance=${variance_percent !== null ? variance_percent.toFixed(2) + "%" : "N/A"}`,
    );

    const output: TruthEngineOutput = {
      main_items: mainItems,
      optional_items: optionalItems,
      excluded_items: excludedItems,
      main_scope_total: mainScopeTotal,
      optional_scope_total: optionalScopeTotal,
      excluded_total: excludedTotal,
      summary_total: summaryTotal,
      variance_percent,
      confidence,
      reasoning,
      warnings: allWarnings,
      parser_used: PARSER_USED,
      items: allItems,
      document_grand_total: summaryTotal,
      document_sub_total: documentSubTotal,
    };

    return new Response(
      JSON.stringify({
        success: true,
        ...output,
        lines: allItems,
        totals: {
          main_scope_total: mainScopeTotal,
          optional_scope_total: optionalScopeTotal,
          excluded_total: excludedTotal,
          summary_total: summaryTotal,
          variance_percent,
          subtotal: documentSubTotal ?? mainScopeTotal,
          grandTotal: summaryTotal ?? mainScopeTotal,
          quotedTotal: summaryTotal,
          gst: regexTotals.gst_amount,
        },
        metadata: {
          supplier: supplierName,
          itemCount: allItems.length,
          mainItemCount: mainItems.length,
          optionalItemCount: optionalItems.length,
          excludedItemCount: excludedItems.length,
          chunked,
          chunkCount,
          malformedRows: malformedCount,
          model,
          engine: "line_item_truth_v2",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[TruthEngine] unhandled error:", msg);
    return new Response(
      JSON.stringify({
        success: false,
        items: [],
        lines: [],
        main_items: [],
        optional_items: [],
        excluded_items: [],
        main_scope_total: 0,
        optional_scope_total: 0,
        excluded_total: 0,
        summary_total: null,
        variance_percent: null,
        confidence: 0,
        reasoning: `Parse failed: ${msg}`,
        warnings: [`Parse failed: ${msg}`],
        document_grand_total: null,
        document_sub_total: null,
        parser_used: PARSER_USED,
        totals: {},
        metadata: {},
        error: msg,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
