/**
 * classifyQuoteType — LLM classifier for quote structure.
 *
 * itemized : detailed schedule with qty/unit/rate/total per row
 * lump_sum : single total with descriptive scope, no qty breakdown
 * hybrid   : prelims + itemized schedule + optional scope combined
 */

import { QUOTE_TYPE_PROMPT } from "../prompts/quoteTypePrompt.ts";

export type QuoteType = "itemized" | "lump_sum" | "hybrid" | "unknown";

export type QuoteTypeClassification = {
  quoteType: QuoteType;
  confidence: number;
  signals: string[];
};

export async function classifyQuoteType(ctx: {
  rawText: string;
  openAIKey: string;
}): Promise<QuoteTypeClassification> {
  const snippet = ctx.rawText.slice(0, 6000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: QUOTE_TYPE_PROMPT },
          { role: "user", content: snippet },
        ],
      }),
    });
    if (!res.ok) throw new Error(`classifyQuoteType HTTP ${res.status}`);
    const json = await res.json();
    const raw = JSON.parse(json.choices[0].message.content);
    return {
      quoteType: normaliseQuoteType(raw.quote_type),
      confidence: clamp01(Number(raw.confidence ?? 0)),
      signals: Array.isArray(raw.signals) ? raw.signals.map(String) : [],
    };
  } catch (err) {
    console.error("[classifyQuoteType] fallback to heuristic", err);
    return heuristicQuoteType(ctx.rawText);
  }
}

function heuristicQuoteType(text: string): QuoteTypeClassification {
  const t = text.toLowerCase();
  const rowCount = (text.match(/\n\s*\d{1,3}[\s.)]/g) ?? []).length;
  const hasQtyUnitRate = /\bqty|quantity|unit\s*rate|unit\s*price/.test(t);
  const hasLumpSum = /lump\s*sum|fixed\s*price/.test(t);
  const hasPrelims = /\bprelims?|preliminaries|mobilisation/.test(t);

  if (hasPrelims && rowCount > 5) {
    return { quoteType: "hybrid", confidence: 0.55, signals: ["prelims_section", "itemized_rows"] };
  }
  if (rowCount > 10 && hasQtyUnitRate) {
    return { quoteType: "itemized", confidence: 0.6, signals: ["row_count", "qty_headers"] };
  }
  if (hasLumpSum && rowCount < 5) {
    return { quoteType: "lump_sum", confidence: 0.6, signals: ["lump_sum_marker"] };
  }
  return { quoteType: "unknown", confidence: 0.3, signals: ["heuristic_uncertain"] };
}

function normaliseQuoteType(v: unknown): QuoteType {
  const s = String(v ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (s === "itemized" || s === "itemised") return "itemized";
  if (s === "lump_sum" || s === "lumpsum") return "lump_sum";
  if (s === "hybrid") return "hybrid";
  return "unknown";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
