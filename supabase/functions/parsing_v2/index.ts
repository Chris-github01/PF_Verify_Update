import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type {
  NormalizedLineItem,
  ParseV2Request,
  ParsingV2Result,
  RawLineItem,
  SmartChunk,
  TradeType,
} from "./types.ts";
import { detectStructure } from "./structureDetector.ts";
import { createSmartChunks } from "./smartChunker.ts";
import { parseDeterministic } from "./deterministicParser.ts";
import { normalizeWithLLM } from "./llmNormalizer.ts";
import { validateItems } from "./validationEngine.ts";
import {
  dedupeKey,
  extractDocumentTotal,
  extractFRR,
  PARSER_VERSION,
  roundTo2,
  safeNum,
} from "./utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function rawToNormalized(
  raw: RawLineItem,
  chunk: SmartChunk,
  chunkIndex: number
): NormalizedLineItem {
  const qty = safeNum(raw.qty ?? 1);
  const rate = safeNum(raw.rate ?? raw.total ?? 0);
  const total = safeNum(raw.total ?? (qty * rate));

  const inferredTotal = total > 0 ? total : roundTo2(qty * rate);
  const inferredRate = rate > 0 ? rate : (qty > 0 ? roundTo2(inferredTotal / qty) : 0);

  const desc = (raw.description ?? "").trim();

  return {
    description: desc,
    qty: qty > 0 ? qty : 1,
    unit: (raw.unit ?? "ea").toLowerCase().trim() || "ea",
    rate: inferredRate,
    total: inferredTotal,
    section: chunk.section,
    block: chunk.block,
    isOptional: /\b(optional|option\s+\d|alt\b|\(opt\))\b/i.test(desc),
    isAdjustment: false,
    isSummaryRow: false,
    frr: extractFRR(desc),
    sourceChunk: chunkIndex,
    confidence: raw.confidence,
    parseMethod: raw.parseMethod,
  };
}

function deduplicateItems(items: NormalizedLineItem[]): NormalizedLineItem[] {
  const seen = new Map<string, number>();
  const result: NormalizedLineItem[] = [];

  for (const item of items) {
    if (item.isAdjustment) {
      result.push(item);
      continue;
    }
    const key = dedupeKey(item);
    if (!seen.has(key)) {
      seen.set(key, result.length);
      result.push(item);
    }
  }

  return result;
}

function mergeChunkItems(
  allChunkResults: Array<{ chunkIndex: number; items: RawLineItem[]; chunk: SmartChunk }>
): NormalizedLineItem[] {
  const normalized: NormalizedLineItem[] = [];

  for (const { chunkIndex, items, chunk } of allChunkResults) {
    for (const raw of items) {
      if (!raw.description || raw.description.trim().length < 3) continue;
      const item = rawToNormalized(raw, chunk, chunkIndex);
      if (item.total <= 0 && !item.isAdjustment) continue;
      normalized.push(item);
    }
  }

  return deduplicateItems(normalized);
}

async function processChunk(
  chunk: SmartChunk,
  chunkIndex: number,
  tradeType: TradeType,
  openaiApiKey: string | undefined
): Promise<{
  deterministicItems: RawLineItem[];
  llmItems: RawLineItem[];
  usedLLM: boolean;
}> {
  const deterministicItems = parseDeterministic(chunk);

  const chunkLineCount = chunk.chunkText.split("\n").filter((l) => l.trim()).length;
  const deterministicCoverage = chunkLineCount > 0
    ? deterministicItems.length / chunkLineCount
    : 0;

  const needsLLM =
    openaiApiKey &&
    (deterministicItems.length === 0 ||
      deterministicCoverage < 0.2 ||
      chunk.estimatedItemCount > deterministicItems.length * 1.5);

  let llmItems: RawLineItem[] = [];
  if (needsLLM && openaiApiKey) {
    try {
      llmItems = await normalizeWithLLM(
        chunk,
        deterministicItems,
        tradeType,
        openaiApiKey
      );
    } catch (err) {
      console.warn(`[Orchestrator] LLM fallback failed for chunk ${chunkIndex}:`, err);
    }
  }

  return {
    deterministicItems,
    llmItems,
    usedLLM: llmItems.length > 0,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startMs = Date.now();

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Use POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: ParseV2Request;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { text, tradeType, documentTotal: providedDocTotal, filename, openaiApiKey } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Field 'text' is required and must be a non-empty string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = openaiApiKey ?? Deno.env.get("OPENAI_API_KEY");

    console.log(`[ParsingV2] Starting — ${text.length} chars, trade=${tradeType ?? "auto"}, file=${filename ?? "unknown"}`);

    // Stage 1: Structure Detection
    console.log("[ParsingV2] Stage 1: Structure Detection");
    const structure = detectStructure(text);
    const detectedTrade: TradeType = tradeType ?? structure.metadata.estimatedTradeType;
    const documentTotal = providedDocTotal ?? structure.metadata.grandTotal ?? extractDocumentTotal(text);

    console.log(`[ParsingV2] Trade: ${detectedTrade}, Document total: ${documentTotal ?? "N/A"}`);
    console.log(`[ParsingV2] Structure: ${structure.sections.length} sections, ${structure.blocks.length} blocks, ${structure.tables.length} tables`);

    // Stage 2: Smart Chunking
    console.log("[ParsingV2] Stage 2: Smart Chunking");
    const chunks = createSmartChunks(text, structure);
    console.log(`[ParsingV2] Created ${chunks.length} chunks`);

    // Stage 3 + 4: Process each chunk (deterministic → LLM fallback)
    console.log("[ParsingV2] Stage 3+4: Deterministic Parsing + LLM Fallback");

    const allChunkResults: Array<{
      chunkIndex: number;
      items: RawLineItem[];
      chunk: SmartChunk;
    }> = [];

    let chunksWithDeterministic = 0;
    let chunksWithLLM = 0;
    let rawItemCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const { deterministicItems, llmItems, usedLLM } = await processChunk(
        chunk,
        i,
        detectedTrade,
        apiKey
      );

      const combinedItems = [...deterministicItems, ...llmItems];
      allChunkResults.push({ chunkIndex: i, items: combinedItems, chunk });

      if (deterministicItems.length > 0) chunksWithDeterministic++;
      if (usedLLM) chunksWithLLM++;
      rawItemCount += combinedItems.length;

      console.log(
        `[ParsingV2] Chunk ${i + 1}/${chunks.length} "${chunk.section}": ` +
        `${deterministicItems.length} deterministic + ${llmItems.length} LLM = ${combinedItems.length} items`
      );
    }

    // Merge and deduplicate
    console.log("[ParsingV2] Merging and deduplicating items");
    const mergedItems = mergeChunkItems(allChunkResults);
    console.log(`[ParsingV2] After dedup: ${mergedItems.length} items (from ${rawItemCount} raw)`);

    // Stage 5: Validation Engine
    console.log("[ParsingV2] Stage 5: Validation");
    const validation = validateItems(mergedItems, documentTotal ?? null);

    const processingMs = Date.now() - startMs;

    const result: ParsingV2Result = {
      success: true,
      items: validation.validItems,
      validation,
      structure,
      chunks,
      meta: {
        totalChunks: chunks.length,
        chunksWithDeterministicItems: chunksWithDeterministic,
        chunksWithLlmFallback: chunksWithLLM,
        rawItemCount,
        finalItemCount: validation.validItems.length,
        documentTotal: documentTotal ?? null,
        itemsTotal: validation.itemsTotal,
        processingMs,
        parserVersion: PARSER_VERSION,
      },
    };

    console.log(
      `[ParsingV2] Complete — ${validation.validItems.length} valid items, ` +
      `score=${validation.score}, ${processingMs}ms`
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const processingMs = Date.now() - startMs;
    console.error("[ParsingV2] Fatal error:", err);

    const errorResult: Partial<ParsingV2Result> = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      meta: {
        totalChunks: 0,
        chunksWithDeterministicItems: 0,
        chunksWithLlmFallback: 0,
        rawItemCount: 0,
        finalItemCount: 0,
        documentTotal: null,
        itemsTotal: 0,
        processingMs,
        parserVersion: PARSER_VERSION,
      },
    };

    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
