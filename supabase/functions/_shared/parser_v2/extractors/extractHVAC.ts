import { HVAC_PROMPT } from "../prompts/hvacPrompt.ts";
import type { ParsedLineItemV2 } from "../runParserV2.ts";
import { runExtractorLLM } from "./_extractorRuntime.ts";

export async function extractHVAC(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
}): Promise<ParsedLineItemV2[]> {
  return await runExtractorLLM({
    systemPrompt: HVAC_PROMPT,
    trade: "hvac",
    rawText: ctx.rawText,
    pages: ctx.pages,
    quoteType: ctx.quoteType,
    supplier: ctx.supplier,
    openAIKey: ctx.openAIKey,
    extraUserContext: {
      focus:
        "HVAC / mechanical scope: ductwork, AHU/FCU/VAV, chillers, controls, commissioning. Fire dampers remain HVAC unless explicitly sold as passive-fire scope.",
    },
  });
}
