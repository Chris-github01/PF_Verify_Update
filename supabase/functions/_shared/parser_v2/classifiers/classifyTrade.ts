/**
 * classifyTrade — LLM classifier that assigns a primary trade.
 *
 * Passive Fire is the most advanced lane and is preferred whenever
 * penetration sealing, FRR ratings, or fire-stopping scope appears.
 */

import { TRADE_CLASSIFIER_PROMPT } from "../prompts/tradeClassifierPrompt.ts";

export type Trade =
  | "passive_fire"
  | "active_fire"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "carpentry"
  | "unknown";

export type TradeClassification = {
  trade: Trade;
  confidence: number;
  rationale: string;
  secondary_trades: Trade[];
};

export async function classifyTrade(ctx: {
  rawText: string;
  fileName: string;
  supplierHint?: string;
  tradeHint?: string;
  openAIKey: string;
}): Promise<TradeClassification> {
  const snippet = ctx.rawText.slice(0, 8000);

  const body = {
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: TRADE_CLASSIFIER_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          file_name: ctx.fileName,
          supplier_hint: ctx.supplierHint ?? null,
          trade_hint: ctx.tradeHint ?? null,
          document_excerpt: snippet,
        }),
      },
    ],
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`classifyTrade HTTP ${res.status}`);
    const json = await res.json();
    const raw = JSON.parse(json.choices[0].message.content);
    const normalised: TradeClassification = {
      trade: normaliseTrade(raw.trade),
      confidence: clamp01(Number(raw.confidence ?? 0)),
      rationale: String(raw.rationale ?? ""),
      secondary_trades: Array.isArray(raw.secondary_trades)
        ? raw.secondary_trades.map(normaliseTrade)
        : [],
    };
    return normalised;
  } catch (err) {
    console.error("[classifyTrade] fallback to heuristic", err);
    return heuristicTrade(ctx);
  }
}

function heuristicTrade(ctx: {
  rawText: string;
  tradeHint?: string;
}): TradeClassification {
  if (ctx.tradeHint) {
    return {
      trade: normaliseTrade(ctx.tradeHint),
      confidence: 0.4,
      rationale: "heuristic:tradeHint",
      secondary_trades: [],
    };
  }
  const t = ctx.rawText.toLowerCase();
  if (/\bfrr\b|penetration|fire\s*stopping|fire\s*sealing|intumescent/.test(t)) {
    return { trade: "passive_fire", confidence: 0.55, rationale: "heuristic:passive_fire_signals", secondary_trades: [] };
  }
  if (/\bsprinkler|fire\s*alarm|detector|hydrant/.test(t)) {
    return { trade: "active_fire", confidence: 0.55, rationale: "heuristic:active_fire_signals", secondary_trades: [] };
  }
  if (/\bcable|switchboard|mccb|lighting\s*circuit/.test(t)) {
    return { trade: "electrical", confidence: 0.5, rationale: "heuristic:electrical_signals", secondary_trades: [] };
  }
  if (/\bhot\s*water|cold\s*water|drainage|sanitary|stormwater/.test(t)) {
    return { trade: "plumbing", confidence: 0.5, rationale: "heuristic:plumbing_signals", secondary_trades: [] };
  }
  if (/\bductwork|ahu|vav|chiller|supply\s*air/.test(t)) {
    return { trade: "hvac", confidence: 0.5, rationale: "heuristic:hvac_signals", secondary_trades: [] };
  }
  if (/\btimber|joinery|framing|plasterboard/.test(t)) {
    return { trade: "carpentry", confidence: 0.5, rationale: "heuristic:carpentry_signals", secondary_trades: [] };
  }
  return { trade: "unknown", confidence: 0.2, rationale: "heuristic:no_signal", secondary_trades: [] };
}

function normaliseTrade(v: unknown): Trade {
  const s = String(v ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (["passive_fire", "passivefire", "pf"].includes(s)) return "passive_fire";
  if (["active_fire", "activefire", "af"].includes(s)) return "active_fire";
  if (s === "electrical") return "electrical";
  if (s === "plumbing") return "plumbing";
  if (s === "hvac" || s === "mechanical") return "hvac";
  if (s === "carpentry" || s === "joinery") return "carpentry";
  return "unknown";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
