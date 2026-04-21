import { ELECTRICAL_PROMPT } from "../prompts/electricalPrompt.ts";
import type { ParsedLineItemV2 } from "../runParserV2.ts";
import { runExtractorLLM } from "./_extractorRuntime.ts";

export async function extractElectrical(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
}): Promise<ParsedLineItemV2[]> {
  return await runExtractorLLM({
    systemPrompt: ELECTRICAL_PROMPT,
    trade: "electrical",
    rawText: ctx.rawText,
    pages: ctx.pages,
    quoteType: ctx.quoteType,
    supplier: ctx.supplier,
    openAIKey: ctx.openAIKey,
    extraUserContext: {
      focus: "Electrical scope: cabling, switchboards, lighting, power circuits, testing & commissioning.",
    },
  });
}
