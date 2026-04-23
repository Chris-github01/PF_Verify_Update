import { CARPENTRY_PROMPT } from "../prompts/carpentryPrompt.ts";
import type { ParsedLineItemV2 } from "../runParserV2.ts";
import { runExtractorLLM } from "./_extractorRuntime.ts";

export async function extractCarpentry(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
  extraUserContext?: Record<string, unknown>;
}): Promise<ParsedLineItemV2[]> {
  return await runExtractorLLM({
    systemPrompt: CARPENTRY_PROMPT,
    trade: "carpentry",
    rawText: ctx.rawText,
    pages: ctx.pages,
    quoteType: ctx.quoteType,
    supplier: ctx.supplier,
    openAIKey: ctx.openAIKey,
    extraUserContext: {
      focus: "Carpentry / joinery scope: framing, timber, plasterboard, doors, hardware, fit-off.",
      ...(ctx.extraUserContext ?? {}),
    },
  });
}
