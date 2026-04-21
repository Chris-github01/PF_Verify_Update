/**
 * extractPassiveFire — most advanced extractor.
 *
 * Understands FRR ratings (e.g. -/120/120, 90/90/90), penetration types,
 * and cross-trade references (plumbing/electrical/HVAC services passing
 * through fire-rated barriers). Outputs line items with passive-fire
 * sub_scope even when the underlying service references another trade.
 */

import { PASSIVE_FIRE_PROMPT } from "../prompts/passiveFirePrompt.ts";
import type { ParsedLineItemV2 } from "../runParserV2.ts";
import { runExtractorLLM } from "./_extractorRuntime.ts";

export async function extractPassiveFire(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
}): Promise<ParsedLineItemV2[]> {
  return await runExtractorLLM({
    systemPrompt: PASSIVE_FIRE_PROMPT,
    trade: "passive_fire",
    rawText: ctx.rawText,
    pages: ctx.pages,
    quoteType: ctx.quoteType,
    supplier: ctx.supplier,
    openAIKey: ctx.openAIKey,
    extraUserContext: {
      focus:
        "Passive fire scope. Reference plumbing/electrical/HVAC services where relevant but keep sub_scope tagged as passive fire work (penetration_sealing, fire_collar, intumescent_coating, etc).",
      frr_required: true,
    },
  });
}
