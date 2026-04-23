import { PLUMBING_PROMPT } from "../prompts/plumbingPrompt.ts";
import type { ParsedLineItemV2 } from "../runParserV2.ts";
import { runExtractorLLM } from "./_extractorRuntime.ts";

export async function extractPlumbing(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
}): Promise<ParsedLineItemV2[]> {
  return await runExtractorLLM({
    systemPrompt: PLUMBING_PROMPT,
    trade: "plumbing",
    rawText: ctx.rawText,
    pages: ctx.pages,
    quoteType: ctx.quoteType,
    supplier: ctx.supplier,
    openAIKey: ctx.openAIKey,
    extraUserContext: {
      focus:
        "Plumbing scope: hot/cold water, sanitary, stormwater, drainage, fixtures, insulation. Ignore fire-rated penetration sealing — that is passive fire scope.",
    },
  });
}
