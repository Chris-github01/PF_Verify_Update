/**
 * classifyTrade — primary trade detection.
 *
 * Strategy (deterministic-first):
 *   1. Score Passive Fire signals (FRR ratings, penetration sealing, fire
 *      collars/pillows/batts/wraps, intumescent, PS3 certificates). If the
 *      score clears the PF threshold the document is PF regardless of what
 *      other trade services are referenced.
 *   2. Score each install trade (plumbing, electrical, hvac, active fire,
 *      carpentry) using domain keyword families.
 *   3. If the top install trade dominates AND PF signals are weak → that
 *      install trade wins.
 *   4. Ambiguous cases call gpt-4o-mini with the scored signals as context.
 *   5. LLM failure falls back to the deterministic top scorer.
 *
 * Passive Fire primacy rule:
 *   Passive fire quotes routinely reference plumbing/electrical/HVAC
 *   services passing through fire-rated barriers. Service-trade keywords
 *   (e.g. "copper pipe", "cable tray") alone must NOT downgrade PF when
 *   fire-stopping/FRR language is the dominant frame.
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
  signals?: Record<string, number>;
};

type ScoreMap = Record<Trade, number>;

const PF_PATTERNS: RegExp[] = [
  /\bFRR\b/i,
  /-\/\d{2,3}\/\d{2,3}/,
  /\b\d{2,3}\/\d{2,3}\/\d{2,3}\b/,
  /\bpenetration(?:\s+(?:sealing|seal|system))?\b/i,
  /\bfire[-\s]?stop(?:ping|ped)?\b/i,
  /\bfire[-\s]?seal(?:ing|ant|ed)?\b/i,
  /\bintumescent\b/i,
  /\bfire[-\s]?collar(s)?\b/i,
  /\bfire[-\s]?pillow(s)?\b/i,
  /\bfire[-\s]?batt(s)?\b/i,
  /\bfire[-\s]?wrap(s)?\b/i,
  /\bmortar\s+seal\b/i,
  /\bhilti\s+cp\b/i,
  /\bprom(at|aseal|astop)\b/i,
  /\bfire[-\s]?rated\s+(?:board|blanket|batt|barrier|wall|floor)\b/i,
  /\bPS3\b/,
  /\bpassive\s+fire\b/i,
  /\bfirestop\b/i,
];

const ACTIVE_FIRE_PATTERNS: RegExp[] = [
  /\bsprinkler(s|\s+head)?\b/i,
  /\bhydrant(s)?\b/i,
  /\bhose\s+reel\b/i,
  /\bfire\s+(?:alarm|detector|indicator\s+panel|pump)\b/i,
  /\bsmoke\s+detector\b/i,
  /\bFIP\b/,
  /\bEWIS\b/,
];

const ELECTRICAL_PATTERNS: RegExp[] = [
  /\bcable\s+tray\b/i,
  /\bswitchboard\b/i,
  /\bMCCB\b/,
  /\bRCD\b/,
  /\blighting\s+(?:circuit|point|fitting)\b/i,
  /\bGPO\b/,
  /\bconduit\b/i,
  /\bluminaire\b/i,
  /\bsub[-\s]?main\b/i,
  /\bdistribution\s+board\b/i,
];

const PLUMBING_PATTERNS: RegExp[] = [
  /\bhot\s+water\s+(?:unit|system|cylinder)\b/i,
  /\bcold\s+water\s+(?:service|main)\b/i,
  /\bsanitary\s+(?:drain|stack|fixture)\b/i,
  /\bstormwater\b/i,
  /\bcopper\s+pipe\b/i,
  /\bPEX\b/,
  /\bbackflow\s+preventer\b/i,
  /\btundish\b/i,
  /\bgas\s+fit(?:ting|ter)\b/i,
  /\bWC\s+pan\b/i,
];

const HVAC_PATTERNS: RegExp[] = [
  /\bductwork\b/i,
  /\bAHU\b/,
  /\bVAV\b/,
  /\bFCU\b/,
  /\bchiller\b/i,
  /\bcondenser\s+unit\b/i,
  /\bsupply\s+air\s+(?:diffuser|grille)\b/i,
  /\bexhaust\s+fan\b/i,
  /\brefrigerant\s+pipe\b/i,
];

const CARPENTRY_PATTERNS: RegExp[] = [
  /\btimber\s+(?:framing|stud|wall|floor)\b/i,
  /\bjoinery\b/i,
  /\bplasterboard\b/i,
  /\bskirting\b/i,
  /\barchitrave\b/i,
  /\bLVL\b/,
  /\bMDF\b/,
];

export async function classifyTrade(ctx: {
  rawText: string;
  fileName: string;
  supplierHint?: string;
  tradeHint?: string;
  openAIKey: string;
}): Promise<TradeClassification> {
  const scores = scoreSignals(ctx.rawText);
  applyHintBias(scores, ctx.tradeHint, ctx.fileName, ctx.supplierHint);

  const ranked = rank(scores);
  const top = ranked[0];
  const second = ranked[1];
  const pfScore = scores.passive_fire;

  if (pfScore >= 8) {
    return {
      trade: "passive_fire",
      confidence: confidenceFromScore(pfScore),
      rationale: "deterministic:passive_fire_dominant",
      secondary_trades: secondariesFrom(scores, "passive_fire"),
      signals: scores,
    };
  }

  const margin = top.score - (second?.score ?? 0);
  const install = top.trade;
  if (
    install !== "passive_fire" &&
    install !== "unknown" &&
    top.score >= 5 &&
    margin >= 3 &&
    pfScore <= 2
  ) {
    return {
      trade: install,
      confidence: confidenceFromScore(top.score),
      rationale: `deterministic:${install}_dominant_margin_${margin}`,
      secondary_trades: secondariesFrom(scores, install),
      signals: scores,
    };
  }

  if (pfScore >= 4 && pfScore >= top.score - 1) {
    return {
      trade: "passive_fire",
      confidence: confidenceFromScore(pfScore),
      rationale: "deterministic:passive_fire_primacy_over_service_trade",
      secondary_trades: secondariesFrom(scores, "passive_fire"),
      signals: scores,
    };
  }

  try {
    const llm = await callLLMClassifier(ctx, scores);
    return { ...llm, signals: scores };
  } catch (err) {
    console.error("[classifyTrade] LLM failed, deterministic fallback", err);
    if (top.score === 0) {
      return {
        trade: "unknown",
        confidence: 0.2,
        rationale: "deterministic:no_signals",
        secondary_trades: [],
        signals: scores,
      };
    }
    return {
      trade: top.trade,
      confidence: confidenceFromScore(top.score),
      rationale: `deterministic:${top.trade}_fallback_after_llm_error`,
      secondary_trades: secondariesFrom(scores, top.trade),
      signals: scores,
    };
  }
}

async function callLLMClassifier(
  ctx: {
    rawText: string;
    fileName: string;
    supplierHint?: string;
    tradeHint?: string;
    openAIKey: string;
  },
  signals: ScoreMap,
): Promise<TradeClassification> {
  const snippet = ctx.rawText.slice(0, 10000);
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
          deterministic_signals: signals,
          document_excerpt: snippet,
        }),
      },
    ],
  };
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
  return {
    trade: normaliseTrade(raw.trade),
    confidence: clamp01(Number(raw.confidence ?? 0)),
    rationale: `llm:${String(raw.rationale ?? "").slice(0, 200)}`,
    secondary_trades: Array.isArray(raw.secondary_trades)
      ? raw.secondary_trades.map(normaliseTrade).filter((t) => t !== "unknown")
      : [],
  };
}

function scoreSignals(text: string): ScoreMap {
  return {
    passive_fire: countMatches(text, PF_PATTERNS),
    active_fire: countMatches(text, ACTIVE_FIRE_PATTERNS),
    electrical: countMatches(text, ELECTRICAL_PATTERNS),
    plumbing: countMatches(text, PLUMBING_PATTERNS),
    hvac: countMatches(text, HVAC_PATTERNS),
    carpentry: countMatches(text, CARPENTRY_PATTERNS),
    unknown: 0,
  };
}

function countMatches(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const p of patterns) {
    const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
    const matches = text.match(re);
    if (matches) total += Math.min(matches.length, 6);
  }
  return total;
}

function applyHintBias(
  scores: ScoreMap,
  tradeHint?: string,
  fileName?: string,
  supplierHint?: string,
): void {
  const hint = normaliseTrade(tradeHint);
  if (hint !== "unknown") scores[hint] += 1;
  const corpus = `${fileName ?? ""} ${supplierHint ?? ""}`.toLowerCase();
  if (/passive\s*fire|firestop|penetration/.test(corpus)) scores.passive_fire += 2;
  if (/sprinkler|fire\s*alarm/.test(corpus)) scores.active_fire += 2;
  if (/plumb/.test(corpus)) scores.plumbing += 2;
  if (/elec/.test(corpus)) scores.electrical += 2;
  if (/hvac|mech|air\s*con/.test(corpus)) scores.hvac += 2;
  if (/carpen|joinery/.test(corpus)) scores.carpentry += 2;
}

function rank(scores: ScoreMap): { trade: Trade; score: number }[] {
  return (Object.keys(scores) as Trade[])
    .filter((t) => t !== "unknown")
    .map((t) => ({ trade: t, score: scores[t] }))
    .sort((a, b) => b.score - a.score);
}

function secondariesFrom(scores: ScoreMap, primary: Trade): Trade[] {
  return rank(scores)
    .filter((r) => r.trade !== primary && r.score >= 2)
    .slice(0, 3)
    .map((r) => r.trade);
}

function confidenceFromScore(score: number): number {
  if (score >= 12) return 0.95;
  if (score >= 8) return 0.85;
  if (score >= 5) return 0.7;
  if (score >= 3) return 0.55;
  if (score >= 1) return 0.4;
  return 0.2;
}

function normaliseTrade(v: unknown): Trade {
  const s = String(v ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (["passive_fire", "passivefire", "pf", "firestopping"].includes(s)) return "passive_fire";
  if (["active_fire", "activefire", "af", "sprinkler"].includes(s)) return "active_fire";
  if (s === "electrical" || s === "electrician") return "electrical";
  if (s === "plumbing" || s === "plumber") return "plumbing";
  if (s === "hvac" || s === "mechanical" || s === "airconditioning") return "hvac";
  if (s === "carpentry" || s === "joinery") return "carpentry";
  return "unknown";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
