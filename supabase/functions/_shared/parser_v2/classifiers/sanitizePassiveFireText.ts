/**
 * sanitizePassiveFireText — pre-LLM numeric sanitizer for passive fire
 * quotes. Runs as the very first stage on PF quotes, before the structure
 * analyst and line-item extractor. It strips / tags OCR noise that
 * downstream pricing logic would otherwise misread as money (phone
 * numbers, dates, quote numbers, addresses, page numbers, FRR codes,
 * product codes, dimensions) and flags suspicious OCR numeric
 * corruption.
 *
 * Returns a cleaned rawText + per-page cleaned pages that the rest of
 * the PF pipeline consumes. Also returns money candidates and
 * suspicious numerics for telemetry and the authoritative total
 * selector.
 */

import { PASSIVE_FIRE_SANITIZER_PROMPT } from "../prompts/passiveFireSanitizerPrompt.ts";
import { markRequestSent, markResponseReceived } from "../telemetrySink.ts";

export type PassiveFireRemovedToken = {
  value: string;
  normalized: string;
  reason:
    | "phone_number"
    | "date"
    | "reference_number"
    | "email_domain_numeric"
    | "page_number"
    | "address_number"
    | "fire_rating"
    | "product_code"
    | "dimension"
    | "other";
  line_context: string;
};

export type PassiveFireMoneyCandidate = {
  value: string;
  normalized: number | null;
  context: string;
};

export type PassiveFireSuspiciousNumeric = {
  value: string;
  reason: string;
};

export type PassiveFireSanitizerResult = {
  clean_text: string;
  clean_pages: { pageNum: number; text: string }[];
  removed_tokens: PassiveFireRemovedToken[];
  money_candidates: PassiveFireMoneyCandidate[];
  suspicious_numerics: PassiveFireSuspiciousNumeric[];
  risk_score: number;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const SANITIZER_MODEL = "gpt-4.1";
const PAGE_CHAR_BUDGET = 18000;
const MAX_PAGES = 12;

const REMOVED_REASONS: PassiveFireRemovedToken["reason"][] = [
  "phone_number",
  "date",
  "reference_number",
  "email_domain_numeric",
  "page_number",
  "address_number",
  "fire_rating",
  "product_code",
  "dimension",
  "other",
];

export async function sanitizePassiveFireText(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  supplier: string;
  fileName: string;
  openAIKey: string;
}): Promise<PassiveFireSanitizerResult> {
  const pages =
    ctx.pages && ctx.pages.length > 0
      ? ctx.pages.slice(0, MAX_PAGES)
      : [{ pageNum: 1, text: ctx.rawText.slice(0, PAGE_CHAR_BUDGET) }];

  const perPage: { pageNum: number; raw: string; result: PassiveFireSanitizerResult }[] =
    await Promise.all(
      pages.map(async (p) => {
        const result = await sanitizePage({
          text: p.text,
          pageNum: p.pageNum,
          supplier: ctx.supplier,
          fileName: ctx.fileName,
          openAIKey: ctx.openAIKey,
        });
        return { pageNum: p.pageNum, raw: p.text, result };
      }),
    );

  const clean_pages = perPage.map((p) => ({
    pageNum: p.pageNum,
    text: p.result.clean_text || p.raw,
  }));
  const clean_text = clean_pages.map((p) => p.text).join("\n\n");

  const removed_tokens: PassiveFireRemovedToken[] = [];
  const money_candidates: PassiveFireMoneyCandidate[] = [];
  const suspicious_numerics: PassiveFireSuspiciousNumeric[] = [];
  let riskSum = 0;
  let riskCount = 0;

  for (const p of perPage) {
    removed_tokens.push(...p.result.removed_tokens);
    money_candidates.push(...p.result.money_candidates);
    suspicious_numerics.push(...p.result.suspicious_numerics);
    if (Number.isFinite(p.result.risk_score)) {
      riskSum += p.result.risk_score;
      riskCount++;
    }
  }

  return {
    clean_text,
    clean_pages,
    removed_tokens,
    money_candidates,
    suspicious_numerics,
    risk_score: riskCount > 0 ? clamp01(riskSum / riskCount) : 0,
  };
}

async function sanitizePage(ctx: {
  text: string;
  pageNum: number;
  supplier: string;
  fileName: string;
  openAIKey: string;
}): Promise<PassiveFireSanitizerResult> {
  const text = ctx.text.slice(0, PAGE_CHAR_BUDGET);
  const payload = {
    supplier: ctx.supplier,
    file_name: ctx.fileName,
    page: ctx.pageNum,
    text,
  };

  markRequestSent(Math.round((PASSIVE_FIRE_SANITIZER_PROMPT.length + text.length) / 4));
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.openAIKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SANITIZER_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PASSIVE_FIRE_SANITIZER_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[pf_sanitize] page ${ctx.pageNum} HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
    return emptyResult(text);
  }

  const json = await res.json();
  markResponseReceived(json?.usage);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) return emptyResult(text);

  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    return normaliseResult(raw, text);
  } catch (err) {
    console.error(`[pf_sanitize] page ${ctx.pageNum} JSON parse failed`, err);
    return emptyResult(text);
  }
}

function normaliseResult(
  raw: Record<string, unknown>,
  fallbackText: string,
): PassiveFireSanitizerResult {
  const clean_text =
    typeof raw.clean_text === "string" && raw.clean_text.trim().length > 0
      ? raw.clean_text
      : fallbackText;
  return {
    clean_text,
    clean_pages: [],
    removed_tokens: Array.isArray(raw.removed_tokens)
      ? (raw.removed_tokens as unknown[]).map(normaliseRemoved)
      : [],
    money_candidates: Array.isArray(raw.money_candidates)
      ? (raw.money_candidates as unknown[]).map(normaliseMoney)
      : [],
    suspicious_numerics: Array.isArray(raw.suspicious_numerics)
      ? (raw.suspicious_numerics as unknown[]).map(normaliseSuspicious)
      : [],
    risk_score: clamp01(Number(raw.risk_score ?? 0)),
  };
}

function normaliseRemoved(v: unknown): PassiveFireRemovedToken {
  const r = (v ?? {}) as Record<string, unknown>;
  const reason = String(r.reason ?? "other").toLowerCase();
  return {
    value: String(r.value ?? ""),
    normalized: String(r.normalized ?? r.value ?? ""),
    reason: (REMOVED_REASONS as string[]).includes(reason)
      ? (reason as PassiveFireRemovedToken["reason"])
      : "other",
    line_context: String(r.line_context ?? ""),
  };
}

function normaliseMoney(v: unknown): PassiveFireMoneyCandidate {
  const r = (v ?? {}) as Record<string, unknown>;
  return {
    value: String(r.value ?? ""),
    normalized: toNumberOrNull(r.normalized ?? r.value),
    context: String(r.context ?? ""),
  };
}

function normaliseSuspicious(v: unknown): PassiveFireSuspiciousNumeric {
  const r = (v ?? {}) as Record<string, unknown>;
  return {
    value: String(r.value ?? ""),
    reason: String(r.reason ?? ""),
  };
}

function emptyResult(fallback: string): PassiveFireSanitizerResult {
  return {
    clean_text: fallback,
    clean_pages: [],
    removed_tokens: [],
    money_candidates: [],
    suspicious_numerics: [],
    risk_score: 0,
  };
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
