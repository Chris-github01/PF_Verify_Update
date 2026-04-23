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
import { markLlmCallDuration, markRequestSent, markResponseReceived } from "../telemetrySink.ts";

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

export type PassiveFireSanitizerDebug = {
  input_chars: number;
  output_chars: number;
  retention_ratio: number;
  fallback_to_raw_text: boolean;
  reason: string | null;
  raw_response_text: string | null;
  parsed_json: unknown | null;
  parse_error: string | null;
  schema_error: string | null;
};

export type PassiveFireSanitizerResult = {
  clean_text: string;
  clean_pages: { pageNum: number; text: string }[];
  removed_tokens: PassiveFireRemovedToken[];
  money_candidates: PassiveFireMoneyCandidate[];
  suspicious_numerics: PassiveFireSuspiciousNumeric[];
  risk_score: number;
  sanitizer_debug: PassiveFireSanitizerDebug;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const SANITIZER_MODEL = "gpt-4.1-mini";
const PAGE_CHAR_BUDGET = 18000;
const MAX_PAGES = 12;
const SANITIZER_BUDGET_MS = 15_000;
const PER_PAGE_BUDGET_MS = 6_000;
const MIN_RETENTION_RATIO = 0.25;
const MAX_RAW_RESPONSE_PERSIST = 4000;

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

  const wallStart = Date.now();
  const llmPromise = Promise.all(
    pages.map(async (p) => {
      const budgetRemaining = Math.max(
        1000,
        SANITIZER_BUDGET_MS - (Date.now() - wallStart),
      );
      const perPageBudget = Math.min(PER_PAGE_BUDGET_MS, budgetRemaining);
      const result = await raceWithFallback(
        sanitizePage({
          text: p.text,
          pageNum: p.pageNum,
          supplier: ctx.supplier,
          fileName: ctx.fileName,
          openAIKey: ctx.openAIKey,
        }),
        perPageBudget,
        () => regexSanitizePage(p.text),
      );
      return { pageNum: p.pageNum, raw: p.text, result };
    }),
  );

  const perPage = await raceWithFallback(
    llmPromise,
    SANITIZER_BUDGET_MS,
    () =>
      pages.map((p) => ({
        pageNum: p.pageNum,
        raw: p.text,
        result: regexSanitizePage(p.text),
      })),
  );

  const elapsed = Date.now() - wallStart;
  if (elapsed > SANITIZER_BUDGET_MS) {
    console.warn(
      `[pf_sanitize] wall-clock ${elapsed}ms exceeded budget ${SANITIZER_BUDGET_MS}ms — regex fallback engaged`,
    );
  }

  const raw_input_text = pages.map((p) => p.text).join("\n\n");
  const input_chars = raw_input_text.length;

  const sanitizer_clean_pages = perPage.map((p) => ({
    pageNum: p.pageNum,
    text: p.result.clean_text || "",
  }));
  const sanitizer_clean_text = sanitizer_clean_pages.map((p) => p.text).join("\n\n").trim();
  const output_chars = sanitizer_clean_text.length;
  const retention_ratio = input_chars > 0 ? output_chars / input_chars : 0;

  // Fail-open: if sanitizer produced empty, malformed, or suspiciously
  // shrunk output, discard its pages and use the original extracted text.
  const allPagesParseFailed = perPage.every((p) => p.result.sanitizer_debug.parse_error != null);
  let fallback_to_raw_text = false;
  let reason: string | null = null;
  if (output_chars === 0) {
    fallback_to_raw_text = true;
    reason = "empty_clean_text";
  } else if (allPagesParseFailed) {
    fallback_to_raw_text = true;
    reason = "all_pages_malformed_json";
  } else if (retention_ratio < MIN_RETENTION_RATIO) {
    fallback_to_raw_text = true;
    reason = `retention_below_threshold:${retention_ratio.toFixed(3)}<${MIN_RETENTION_RATIO}`;
  }

  const clean_pages = fallback_to_raw_text
    ? pages.map((p) => ({ pageNum: p.pageNum, text: p.text }))
    : sanitizer_clean_pages.map((p, i) => ({
        pageNum: p.pageNum,
        text: p.text || pages[i]?.text || "",
      }));
  const clean_text = fallback_to_raw_text
    ? raw_input_text
    : clean_pages.map((p) => p.text).join("\n\n");

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

  const perPageDebugs = perPage.map((p) => p.result.sanitizer_debug);
  const firstParseError = perPageDebugs.find((d) => d.parse_error)?.parse_error ?? null;
  const firstSchemaError = perPageDebugs.find((d) => d.schema_error)?.schema_error ?? null;
  const concatRaw = perPageDebugs
    .map((d) => d.raw_response_text ?? "")
    .filter(Boolean)
    .join("\n---\n")
    .slice(0, MAX_RAW_RESPONSE_PERSIST);

  const sanitizer_debug: PassiveFireSanitizerDebug = {
    input_chars,
    output_chars,
    retention_ratio,
    fallback_to_raw_text,
    reason,
    raw_response_text: concatRaw || null,
    parsed_json: perPageDebugs.map((d) => d.parsed_json).filter((j) => j != null),
    parse_error: firstParseError,
    schema_error: firstSchemaError,
  };

  if (fallback_to_raw_text) {
    console.warn(
      `[pf_sanitize] fail-open engaged (${reason}) — input=${input_chars} output=${output_chars} ratio=${retention_ratio.toFixed(3)}`,
    );
  }

  return {
    clean_text,
    clean_pages,
    removed_tokens,
    money_candidates,
    suspicious_numerics,
    risk_score: riskCount > 0 ? clamp01(riskSum / riskCount) : 0,
    sanitizer_debug,
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

  markRequestSent(
    Math.round((PASSIVE_FIRE_SANITIZER_PROMPT.length + text.length) / 4),
    SANITIZER_MODEL,
  );
  const reqStart = Date.now();
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
    return emptyResult(text, {
      raw_response_text: body.slice(0, MAX_RAW_RESPONSE_PERSIST),
      parse_error: `http_${res.status}`,
    });
  }

  const json = await res.json();
  markLlmCallDuration(Date.now() - reqStart, SANITIZER_MODEL);
  markResponseReceived(json?.usage);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    return emptyResult(text, {
      raw_response_text: null,
      parse_error: "empty_response_content",
    });
  }

  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    return normaliseResult(raw, text, content);
  } catch (err) {
    console.error(`[pf_sanitize] page ${ctx.pageNum} JSON parse failed`, err);
    return emptyResult(text, {
      raw_response_text: typeof content === "string"
        ? content.slice(0, MAX_RAW_RESPONSE_PERSIST)
        : null,
      parse_error: (err as Error)?.message ?? "json_parse_failed",
    });
  }
}

function normaliseResult(
  raw: Record<string, unknown>,
  fallbackText: string,
  rawResponseText: string,
): PassiveFireSanitizerResult {
  const hasCleanText = typeof raw.clean_text === "string" && raw.clean_text.trim().length > 0;
  const clean_text = hasCleanText ? (raw.clean_text as string) : fallbackText;
  const input_chars = fallbackText.length;
  const output_chars = clean_text.length;
  const schema_error = hasCleanText ? null : "missing_or_empty_clean_text";
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
    sanitizer_debug: {
      input_chars,
      output_chars,
      retention_ratio: input_chars > 0 ? output_chars / input_chars : 0,
      fallback_to_raw_text: false,
      reason: null,
      raw_response_text: rawResponseText.slice(0, MAX_RAW_RESPONSE_PERSIST),
      parsed_json: raw,
      parse_error: null,
      schema_error,
    },
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

function emptyResult(
  fallback: string,
  debugOverrides?: Partial<PassiveFireSanitizerDebug>,
): PassiveFireSanitizerResult {
  return {
    clean_text: fallback,
    clean_pages: [],
    removed_tokens: [],
    money_candidates: [],
    suspicious_numerics: [],
    risk_score: 0,
    sanitizer_debug: {
      input_chars: fallback.length,
      output_chars: fallback.length,
      retention_ratio: 1,
      fallback_to_raw_text: false,
      reason: null,
      raw_response_text: null,
      parsed_json: null,
      parse_error: null,
      schema_error: null,
      ...(debugOverrides ?? {}),
    },
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

async function raceWithFallback<T>(
  primary: Promise<T>,
  timeoutMs: number,
  fallback: () => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<{ __timeout: true }>((resolve) => {
    timer = setTimeout(() => resolve({ __timeout: true }), timeoutMs);
  });
  try {
    const winner = await Promise.race([primary, timeoutPromise]);
    if ((winner as { __timeout?: boolean }).__timeout) {
      console.warn(`[pf_sanitize] LLM exceeded ${timeoutMs}ms — using regex fallback`);
      return fallback();
    }
    return winner as T;
  } catch (err) {
    console.warn(`[pf_sanitize] LLM threw (${(err as Error)?.message ?? err}) — regex fallback`);
    return fallback();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Deterministic regex-based PF sanitizer. Fast fallback when the LLM
 * sanitizer exceeds its budget. Strips / tags the same OCR noise classes
 * the LLM targets so downstream pricing logic never sees them as money.
 */
export function regexSanitizePage(text: string): PassiveFireSanitizerResult {
  const input_chars = text.length;
  const removed: PassiveFireRemovedToken[] = [];
  let cleaned = text;

  const patterns: {
    re: RegExp;
    reason: PassiveFireRemovedToken["reason"];
    replace: (m: string) => string;
  }[] = [
    {
      re: /\b(?:\+?61|\+?64|0)[\s-]?[2-9](?:[\s-]?\d){7,9}\b/g,
      reason: "phone_number",
      replace: () => "[PHONE]",
    },
    {
      re: /\b(?:0[2-9]|1[38]00)[\s-]?\d{3}[\s-]?\d{3,4}\b/g,
      reason: "phone_number",
      replace: () => "[PHONE]",
    },
    {
      re: /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,
      reason: "date",
      replace: () => "[DATE]",
    },
    {
      re: /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4}\b/gi,
      reason: "date",
      replace: () => "[DATE]",
    },
    {
      re: /\b(?:Quote|Ref|Reference|Job|PO|Invoice|Order)[\s#:.-]*[A-Z]{0,4}[\s-]?\d{3,10}\b/gi,
      reason: "reference_number",
      replace: () => "[REF]",
    },
    {
      re: /\b-?\/(?:30|60|90|120|180|240)\/(?:30|60|90|120|180|240)\b/g,
      reason: "fire_rating",
      replace: (m) => m,
    },
    {
      re: /\bFRR[\s:]*-?\/?\d{2,3}\/?\d{2,3}\/?\d{0,3}\b/gi,
      reason: "fire_rating",
      replace: (m) => m,
    },
    {
      re: /\b\d{1,4}\s*(?:mm|cm|m|in|inch|inches|ft|"|')\s*(?:x|×|by)\s*\d{1,4}\s*(?:mm|cm|m|in|inch|inches|ft|"|')?\b/gi,
      reason: "dimension",
      replace: () => "[DIM]",
    },
    {
      re: /\bPage\s+\d+\s*(?:of\s+\d+)?\b/gi,
      reason: "page_number",
      replace: () => "[PAGE]",
    },
    {
      re: /\b(?:Unit|Level|Suite|Shop|Apt)\s+\d+[A-Z]?\b/gi,
      reason: "address_number",
      replace: () => "[ADDR]",
    },
    {
      re: /\b[A-Z]{2,}-\d{3,}(?:-[A-Z0-9]+)*\b/g,
      reason: "product_code",
      replace: (m) => m,
    },
  ];

  for (const { re, reason, replace } of patterns) {
    cleaned = cleaned.replace(re, (match) => {
      const contextStart = Math.max(0, cleaned.indexOf(match) - 40);
      removed.push({
        value: match,
        normalized: match.replace(/\s+/g, " ").trim(),
        reason,
        line_context: cleaned.substring(contextStart, contextStart + 80),
      });
      return replace(match);
    });
  }

  const money_candidates: PassiveFireMoneyCandidate[] = [];
  const moneyRe = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = moneyRe.exec(cleaned)) !== null) {
    const ctxStart = Math.max(0, m.index - 40);
    money_candidates.push({
      value: m[0],
      normalized: Number(m[1].replace(/,/g, "")),
      context: cleaned.substring(ctxStart, m.index + m[0].length + 40),
    });
  }

  const suspicious_numerics: PassiveFireSuspiciousNumeric[] = [];
  const suspiciousRe = /\b\d{1,3}(?:[lI|O]\d{3})+\b/g;
  let s: RegExpExecArray | null;
  while ((s = suspiciousRe.exec(text)) !== null) {
    suspicious_numerics.push({
      value: s[0],
      reason: "ocr_digit_letter_substitution",
    });
  }

  const risk_score = clamp01(suspicious_numerics.length / 10);

  return {
    clean_text: cleaned,
    clean_pages: [],
    removed_tokens: removed,
    money_candidates,
    suspicious_numerics,
    risk_score,
    sanitizer_debug: {
      input_chars,
      output_chars: cleaned.length,
      retention_ratio: input_chars > 0 ? cleaned.length / input_chars : 0,
      fallback_to_raw_text: false,
      reason: "regex_sanitizer",
      raw_response_text: null,
      parsed_json: null,
      parse_error: null,
      schema_error: null,
    },
  };
}
