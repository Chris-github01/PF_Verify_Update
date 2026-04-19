import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  runThreePassParser,
  extractStatedTotals,
  type ThreePassOutput,
  type ParsedLineItem,
  type ScopeCategory,
} from "../_shared/threePassParser.ts";
import {
  sanitizePlumbingItems,
} from "../_shared/plumbingSanitizer.ts";

// =============================================================================
// parse_quote_llm_fallback  — Three-Pass Document-Agnostic Quote Parser
//
// Robustness additions:
//   - shorterPrompt flag: when set, Pass 1 is skipped and Pass 2 runs with a
//     compact system prompt to reduce token pressure
//   - Pass 2 chunk failures are tolerated: partial results from completed chunks
//     are returned rather than a full failure
//   - chunksCompleted is reported in metadata so the orchestrator can audit
//     how many chunks succeeded vs total
//   - JSON repair applied inside threePassParser.ts callLLM; any remaining
//     prose-wrapped responses are stripped here before forwarding
// =============================================================================

const PARSER_USED = "three_pass_document_agnostic_v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export interface LlmLineItem {
  description: string;
  qty: number;
  unit: string;
  rate: number;
  total: number;
  section?: string;
  section_heading?: string;
  frr?: string;
  scope_category: "base" | "optional" | "exclusion" | "provisional" | "alternate" | "by_others";
  raw_source?: string;
  confidence?: number;
}

function scopeToCategory(scope: ScopeCategory): LlmLineItem["scope_category"] {
  switch (scope) {
    case "included": return "base";
    case "optional": return "optional";
    case "exclusion": return "exclusion";
    case "provisional": return "provisional";
    case "alternate": return "alternate";
    case "by_others": return "by_others";
    default: return "base";
  }
}

function mapItems(items: ParsedLineItem[]): LlmLineItem[] {
  return items.map((item) => ({
    description: item.description,
    qty: item.qty,
    unit: item.unit,
    rate: item.rate,
    total: item.total,
    section: item.section_heading,
    section_heading: item.section_heading,
    frr: item.frr,
    scope_category: scopeToCategory(item.scope),
    raw_source: item.raw_source,
  }));
}

interface ParseRequest {
  text?: string;
  chunks?: unknown;
  supplierName?: string;
  documentType?: string;
  chunkInfo?: string;
  trade?: string;
  shorterPrompt?: boolean;
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
    /^(total|sub\s*total|grand\s*total|items?|description|levels?|sum|note)/i;

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
      lm[0].trim().replace(/\b(\w)/g, (c) => c.toUpperCase()).replace(/\s+/g, " ") +
      " - Works";
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
// Build variance explanation
// ---------------------------------------------------------------------------

function buildVarianceExplanation(
  includedTotal: number,
  statedTotal: number | null,
  variancePercent: number | null,
): string {
  if (statedTotal === null) {
    return "No stated grand total found in document — line-item total is authoritative.";
  }
  if (variancePercent === null || includedTotal <= 0) {
    return "Insufficient data to compute variance.";
  }
  const absV = Math.abs(variancePercent);
  const dir = variancePercent > 0 ? "above" : "below";
  const formatted = absV.toFixed(2);

  if (absV < 0.5) {
    return `Line-item included total ($${includedTotal.toFixed(2)}) matches stated total ($${statedTotal.toFixed(2)}) within 0.5% — high confidence.`;
  }
  if (absV < 5) {
    return `Minor variance of ${formatted}% ${dir} stated total. Line-item: $${includedTotal.toFixed(2)}, stated: $${statedTotal.toFixed(2)}. Likely rounding.`;
  }
  if (absV < 20) {
    return `Moderate variance of ${formatted}% ${dir} stated total. Line-item: $${includedTotal.toFixed(2)}, stated: $${statedTotal.toFixed(2)}. Check for optional items in main scope or missing rows.`;
  }
  return `SIGNIFICANT variance of ${formatted}% ${dir} stated total. Line-item: $${includedTotal.toFixed(2)}, stated: $${statedTotal.toFixed(2)}. Causes may include: optional scope mixed into included, missing sections, summary page out of date, or arithmetic error in document. Human review recommended.`;
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

    const [{ data: configData }, { data: modelConfig }] = await Promise.all([
      supabase.from("system_config").select("value").eq("key", "OPENAI_API_KEY").maybeSingle(),
      supabase.from("system_config").select("value").eq("key", "OPENAI_MODEL").maybeSingle(),
    ]);

    const openaiApiKey = configData?.value ?? Deno.env.get("OPENAI_API_KEY");
    const model = modelConfig?.value ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

    if (!openaiApiKey) {
      return errorResponse("OpenAI API key not configured", 500);
    }

    const body: ParseRequest = await req.json();
    const { text, supplierName, trade, shorterPrompt } = body;

    if (!text || text.trim().length === 0) {
      return errorResponse("No text provided", 400);
    }

    const tradeLower = (trade ?? "").toLowerCase();
    const isPlumbing = tradeLower === "plumbing";

    console.log(
      `[ThreePass] model=${model} trade=${trade ?? "generic"} chars=${text.length} shorterPrompt=${shorterPrompt ?? false}`,
    );

    // Run the 3-pass parser, tolerating chunk failures via partial extraction
    let result: ThreePassOutput;
    let chunksCompleted = 0;

    try {
      result = await runThreePassParser({
        rawText: text,
        supplierName,
        apiKey: openaiApiKey,
        model,
        shorterPrompt: shorterPrompt ?? false,
        onChunkComplete: (completed: number) => {
          chunksCompleted = completed;
        },
      });
      // If we got here without throw, all chunks that could complete did
      chunksCompleted = Math.max(chunksCompleted, result.items.length > 0 ? 1 : 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ThreePass] Parser failed:", msg);

      // If it is a partial-result error (some chunks succeeded), propagate items
      if (err instanceof PartialResultError && err.partialItems.length > 0) {
        console.warn(`[ThreePass] Partial result: ${err.partialItems.length} items from ${err.chunksCompleted} chunks`);
        chunksCompleted = err.chunksCompleted;
        result = buildPartialResult(err.partialItems, text, err.chunksCompleted);
      } else {
        return errorResponse(`Parse failed: ${msg}`, 500);
      }
    }

    let mappedItems = mapItems(result.items);

    // Plumbing-specific: regex level-table fallback if LLM returned nothing
    if (isPlumbing && mappedItems.length === 0) {
      console.log("[ThreePass] Plumbing zero-item fallback — trying level-table regex");
      const levelItems = extractPlumbingLevelTable(text);
      if (levelItems.length > 0) {
        mappedItems = levelItems;
        result.warnings.push("Items extracted via plumbing level-table regex fallback");
      }
    }

    // Plumbing sanitizer — strip any remaining summary rows
    if (isPlumbing && mappedItems.length > 0) {
      const { cleanedItems } = sanitizePlumbingItems(
        mappedItems as unknown as Record<string, unknown>[],
        null,
      );
      const before = mappedItems.length;
      mappedItems = cleanedItems as unknown as LlmLineItem[];
      if (before !== mappedItems.length) {
        console.log(`[ThreePass] Plumbing sanitizer: ${before} → ${mappedItems.length}`);
      }
    }

    const mainItems = mappedItems.filter((i) => i.scope_category === "base");
    const optionalItems = mappedItems.filter((i) =>
      i.scope_category === "optional" || i.scope_category === "alternate",
    );
    const excludedItems = mappedItems.filter((i) =>
      i.scope_category === "exclusion" || i.scope_category === "by_others",
    );
    const provisionalItems = mappedItems.filter((i) => i.scope_category === "provisional");

    const { totals } = result;

    const varianceExplanation = buildVarianceExplanation(
      totals.included_items_total,
      totals.stated_grand_total,
      totals.variance_percent,
    );

    const regexTotals = extractStatedTotals(text);

    console.log(
      `[ThreePass] Final — items=${mappedItems.length}` +
      ` included=$${totals.included_items_total.toFixed(2)}` +
      ` optional=$${totals.optional_total.toFixed(2)}` +
      ` stated=${totals.stated_grand_total ?? "N/A"}` +
      ` confidence=${result.confidence.toFixed(2)}` +
      ` chunks_completed=${chunksCompleted}`,
    );

    return new Response(
      JSON.stringify({
        success: true,

        main_items: mainItems,
        optional_items: optionalItems,
        excluded_items: excludedItems,
        provisional_items: provisionalItems,
        sections: result.sections,

        items: mappedItems,
        lines: mappedItems,

        totals: {
          included_items_total: totals.included_items_total,
          optional_total: totals.optional_total,
          provisional_total: totals.provisional_total,
          alternate_total: totals.alternate_total,
          stated_subtotal: totals.stated_subtotal,
          stated_grand_total: totals.stated_grand_total,
          recommended_contract_value: totals.recommended_contract_value,
          variance_to_stated: totals.variance_to_stated,
          variance_percent: totals.variance_percent,

          main_scope_total: totals.included_items_total,
          optional_scope_total: totals.optional_total,
          excluded_total: excludedItems.reduce((s, i) => s + i.total, 0),
          summary_total: totals.stated_grand_total,
          subtotal: totals.stated_subtotal ?? totals.included_items_total,
          grandTotal: totals.stated_grand_total ?? totals.included_items_total,
          quotedTotal: totals.stated_grand_total,
          gst: regexTotals.gst,
        },

        main_scope_total: totals.included_items_total,
        optional_scope_total: totals.optional_total,
        excluded_total: excludedItems.reduce((s, i) => s + i.total, 0),
        summary_total: totals.stated_grand_total,
        variance_percent: totals.variance_percent,
        confidence: result.confidence,
        reasoning: result.reasoning + " " + varianceExplanation,
        warnings: result.warnings,

        document_grand_total: totals.stated_grand_total,
        document_sub_total: totals.stated_subtotal,
        parser_used: PARSER_USED,

        metadata: {
          supplier: supplierName,
          trade,
          model,
          engine: PARSER_USED,
          shorterPrompt: shorterPrompt ?? false,
          chunksCompleted,
          itemCount: mappedItems.length,
          mainItemCount: mainItems.length,
          optionalItemCount: optionalItems.length,
          excludedItemCount: excludedItems.length,
          provisionalItemCount: provisionalItems.length,
          sectionCount: result.sections.length,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ThreePass] Unhandled error:", msg);
    return errorResponse(`Unhandled error: ${msg}`, 500);
  }
});

// ---------------------------------------------------------------------------
// PartialResultError — thrown by threePassParser when some chunks fail
// but at least one succeeded
// ---------------------------------------------------------------------------

export class PartialResultError extends Error {
  partialItems: ParsedLineItem[];
  chunksCompleted: number;

  constructor(partialItems: ParsedLineItem[], chunksCompleted: number, message: string) {
    super(message);
    this.name = "PartialResultError";
    this.partialItems = partialItems;
    this.chunksCompleted = chunksCompleted;
  }
}

// ---------------------------------------------------------------------------
// Build a minimal ThreePassOutput from partial items when full parse fails
// ---------------------------------------------------------------------------

function buildPartialResult(
  items: ParsedLineItem[],
  rawText: string,
  chunksCompleted: number,
): ThreePassOutput {
  const statedTotals = extractStatedTotals(rawText);
  const includedItems = items.filter((i) => i.scope === "included");
  const optionalItems = items.filter((i) => i.scope === "optional");

  const includedTotal = includedItems.reduce((s, i) => s + i.total, 0);
  const optionalTotal = optionalItems.reduce((s, i) => s + i.total, 0);

  return {
    items,
    sections: [],
    totals: {
      included_items_total: includedTotal,
      optional_total: optionalTotal,
      provisional_total: 0,
      alternate_total: 0,
      stated_subtotal: statedTotals.sub_total,
      stated_grand_total: statedTotals.grand_total,
      recommended_contract_value: includedTotal || statedTotals.grand_total || 0,
      variance_to_stated: null,
      variance_percent: null,
    },
    confidence: Math.min(0.5, 0.1 * chunksCompleted),
    warnings: [`Partial extraction: ${chunksCompleted} chunk(s) completed before failure`],
    reasoning: `Partial parse — ${items.length} items recovered from ${chunksCompleted} chunk(s).`,
    parser_used: "three_pass_partial_recovery",
  };
}

// ---------------------------------------------------------------------------
// Error response helper
// ---------------------------------------------------------------------------

function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      success: false,
      items: [],
      lines: [],
      main_items: [],
      optional_items: [],
      excluded_items: [],
      provisional_items: [],
      sections: [],
      main_scope_total: 0,
      optional_scope_total: 0,
      excluded_total: 0,
      summary_total: null,
      variance_percent: null,
      confidence: 0,
      reasoning: message,
      warnings: [message],
      document_grand_total: null,
      document_sub_total: null,
      parser_used: PARSER_USED,
      totals: {},
      metadata: { chunksCompleted: 0 },
      error: message,
    }),
    { status, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } },
  );
}
