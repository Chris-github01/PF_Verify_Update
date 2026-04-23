import { ACTIVE_FIRE_PROMPT } from "../prompts/activeFirePrompt.ts";
import type { ParsedLineItemV2 } from "../runParserV2.ts";
import { runExtractorLLM } from "./_extractorRuntime.ts";

export async function extractActiveFire(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
  extraUserContext?: Record<string, unknown>;
}): Promise<ParsedLineItemV2[]> {
  return await runExtractorLLM({
    systemPrompt: ACTIVE_FIRE_PROMPT,
    trade: "active_fire",
    rawText: ctx.rawText,
    pages: ctx.pages,
    quoteType: ctx.quoteType,
    supplier: ctx.supplier,
    openAIKey: ctx.openAIKey,
    extraUserContext: {
      focus:
        "Active fire scope: sprinklers, hydrants, hose reels, fire alarm/detection, EWIS, pumps, tank. Exclude passive-fire penetration sealing.",
      ...(ctx.extraUserContext ?? {}),
    },
  });
}
