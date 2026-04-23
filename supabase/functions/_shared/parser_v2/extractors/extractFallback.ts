/**
 * extractFallback — generic extractor used when trade is unknown or primary
 * extractor fails. Emits trade-agnostic rows with conservative confidence.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";
import { runExtractorLLM } from "./_extractorRuntime.ts";

const FALLBACK_PROMPT = `You are a construction quote extractor. Return JSON: {"items":[{"item_number","description","quantity","unit","unit_price","total_price","scope_category":"main|optional|excluded","trade":"unknown","sub_scope","frr","confidence":0..1}]}. Extract every priced line item. Do not invent rows. If a field is unknown, return null.`;

export async function extractFallback(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
  extraUserContext?: Record<string, unknown>;
}): Promise<ParsedLineItemV2[]> {
  const rows = await runExtractorLLM({
    systemPrompt: FALLBACK_PROMPT,
    trade: "unknown",
    rawText: ctx.rawText,
    pages: ctx.pages,
    quoteType: ctx.quoteType,
    supplier: ctx.supplier,
    openAIKey: ctx.openAIKey,
    extraUserContext: ctx.extraUserContext,
  });
  return rows.map((r) => ({ ...r, confidence: Math.min(r.confidence, 0.55) }));
}
