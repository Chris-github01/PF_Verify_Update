/**
 * scopeSegmentationLLM — OpenAI client used by the Scope Segmentation Engine.
 *
 * Hardened against parser_v2 outer-timeout regressions:
 *   - Per-call 8s hard cap (PER_REQUEST_BUDGET_MS).
 *   - Caller-supplied wall-clock deadline (`deadlineEpochMs`); subsequent
 *     batches short-circuit if the deadline is exceeded.
 *   - Zero retries — a slow/failed call must not consume more than its slice.
 *   - Tolerant JSON parsing (fence-strip + salvage).
 */

import {
  SCOPE_SEGMENTATION_SYSTEM_PROMPT,
  buildScopeSegmentationUserPrompt,
  buildScopeSegmentationReviewPrompt,
  type ScopeSegmentationLLMRow,
  type ScopeSegmentationLLMHeading,
} from "./scopeSegmentationPrompt.ts";

export const SCOPE_SEGMENTATION_MODEL = "gpt-5.4-mini";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
export const PER_REQUEST_BUDGET_MS = 8_000;
const MAX_COMPLETION_TOKENS = 4000;
const SINGLE_BATCH_LIMIT = 120;
const SPLIT_BATCH_SIZE = 80;

export type LLMScopeCategory = "Main" | "Optional" | "Excluded" | "Unknown";

export type LLMItemResult = {
  row_id: string;
  scope_category: LLMScopeCategory;
  confidence: number;
  reason: string;
  evidence?: {
    page?: number | null;
    heading?: string | null;
    signal?: string | null;
  } | null;
};

export type LLMSummary = {
  main_sum: number | null;
  optional_sum: number | null;
  excluded_sum: number | null;
  unknown_sum: number | null;
  main_total_match: boolean | null;
  optional_total_match: boolean | null;
  overall_confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  notes: string[];
};

export type LLMClassifyResult = {
  items: LLMItemResult[];
  summary: LLMSummary | null;
  rawResponses: string[];
  errors: string[];
  modelUsed: string;
  batches: number;
  rowsSent: number;
  timedOut: boolean;
};

export type ClassifyRowsArgs = {
  openAIKey: string;
  supplier: string;
  trade: string;
  quote_type: string;
  main_total: number | null;
  optional_total: number | null;
  grand_total: number | null;
  page_count: number;
  important_document_context: string;
  headings: ScopeSegmentationLLMHeading[];
  rows: ScopeSegmentationLLMRow[];
  /** Wall-clock deadline (Date.now() + budget). Calls past this are skipped. */
  deadlineEpochMs: number;
};

export type ClassifyReviewArgs = {
  openAIKey: string;
  main_total: number | null;
  optional_total: number | null;
  main_sum: number;
  optional_sum: number;
  important_document_context: string;
  headings: ScopeSegmentationLLMHeading[];
  rows: ScopeSegmentationLLMRow[];
  deadlineEpochMs: number;
};

export async function classifyRowsLLM(
  args: ClassifyRowsArgs,
): Promise<LLMClassifyResult> {
  const allRows = args.rows;
  const result: LLMClassifyResult = {
    items: [],
    summary: null,
    rawResponses: [],
    errors: [],
    modelUsed: SCOPE_SEGMENTATION_MODEL,
    batches: 0,
    rowsSent: allRows.length,
    timedOut: false,
  };
  if (!args.openAIKey) {
    result.errors.push("missing_openai_key");
    return result;
  }
  if (allRows.length === 0) return result;
  if (remainingBudget(args.deadlineEpochMs) <= 250) {
    result.errors.push("deadline_exhausted_before_first_call");
    result.timedOut = true;
    return result;
  }

  const batches: ScopeSegmentationLLMRow[][] =
    allRows.length <= SINGLE_BATCH_LIMIT
      ? [allRows]
      : chunkRows(allRows, SPLIT_BATCH_SIZE);

  result.batches = batches.length;

  const seen = new Set<string>();
  for (let i = 0; i < batches.length; i++) {
    const remaining = remainingBudget(args.deadlineEpochMs);
    if (remaining <= 250) {
      result.errors.push(`batch_${i}:deadline_exhausted`);
      result.timedOut = true;
      break;
    }
    const batch = batches[i];
    const userPrompt = buildScopeSegmentationUserPrompt({
      supplier: args.supplier,
      trade: args.trade,
      quote_type: args.quote_type,
      main_total: args.main_total,
      optional_total: args.optional_total,
      grand_total: args.grand_total,
      page_count: args.page_count,
      important_document_context: args.important_document_context,
      headings: args.headings,
      rows: batch,
    });
    const call = await callLLMOnce({
      openAIKey: args.openAIKey,
      systemPrompt: SCOPE_SEGMENTATION_SYSTEM_PROMPT,
      userPrompt,
      label: `batch ${i + 1}/${batches.length}`,
      timeoutMs: Math.min(PER_REQUEST_BUDGET_MS, remaining),
    });
    if (call.rawResponse) result.rawResponses.push(call.rawResponse);
    if (call.error) {
      result.errors.push(`batch_${i}:${call.error}`);
      if (call.timedOut) result.timedOut = true;
      continue;
    }
    const parsed = parseLLMPayload(call.content ?? "");
    if (parsed.parseError) {
      result.errors.push(`batch_${i}:parse:${parsed.parseError}`);
    }
    for (const item of parsed.items) {
      if (!item.row_id || seen.has(item.row_id)) continue;
      seen.add(item.row_id);
      result.items.push(item);
    }
    if (!result.summary && parsed.summary) {
      result.summary = parsed.summary;
    }
  }

  return result;
}

export async function classifyRowsLLMReview(
  args: ClassifyReviewArgs,
): Promise<LLMClassifyResult> {
  const result: LLMClassifyResult = {
    items: [],
    summary: null,
    rawResponses: [],
    errors: [],
    modelUsed: SCOPE_SEGMENTATION_MODEL,
    batches: 0,
    rowsSent: args.rows.length,
    timedOut: false,
  };
  if (!args.openAIKey) {
    result.errors.push("missing_openai_key");
    return result;
  }
  if (args.rows.length === 0) return result;
  const remaining = remainingBudget(args.deadlineEpochMs);
  if (remaining <= 250) {
    result.errors.push("review:deadline_exhausted");
    result.timedOut = true;
    return result;
  }

  const userPrompt = buildScopeSegmentationReviewPrompt({
    main_total: args.main_total,
    optional_total: args.optional_total,
    main_sum: args.main_sum,
    optional_sum: args.optional_sum,
    rows: args.rows,
    important_document_context: args.important_document_context,
    headings: args.headings,
  });
  result.batches = 1;

  const call = await callLLMOnce({
    openAIKey: args.openAIKey,
    systemPrompt: SCOPE_SEGMENTATION_SYSTEM_PROMPT,
    userPrompt,
    label: "review_pass",
    timeoutMs: Math.min(PER_REQUEST_BUDGET_MS, remaining),
  });
  if (call.rawResponse) result.rawResponses.push(call.rawResponse);
  if (call.error) {
    result.errors.push(`review:${call.error}`);
    if (call.timedOut) result.timedOut = true;
    return result;
  }
  const parsed = parseLLMPayload(call.content ?? "");
  if (parsed.parseError) {
    result.errors.push(`review:parse:${parsed.parseError}`);
  }
  result.items = parsed.items;
  result.summary = parsed.summary;
  return result;
}

// --------------------------------------------------------------------------
// Internal: HTTP + parsing
// --------------------------------------------------------------------------

type CallArgs = {
  openAIKey: string;
  systemPrompt: string;
  userPrompt: string;
  label: string;
  timeoutMs: number;
};

type CallResult = {
  content: string | null;
  rawResponse: string | null;
  error: string | null;
  httpStatus: number | null;
  timedOut: boolean;
};

async function callLLMOnce(args: CallArgs): Promise<CallResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), args.timeoutMs);
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        Authorization: `Bearer ${args.openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SCOPE_SEGMENTATION_MODEL,
        response_format: { type: "json_object" },
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        reasoning_effort: "low",
        verbosity: "low",
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        content: null,
        rawResponse: null,
        error: `http_${res.status}:${body.slice(0, 200)}`,
        httpStatus: res.status,
        timedOut: false,
      };
    }
    const json = await res.json().catch(() => null) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const content = json?.choices?.[0]?.message?.content ?? null;
    if (!content || typeof content !== "string") {
      return {
        content: null,
        rawResponse: null,
        error: "empty_response_content",
        httpStatus: res.status,
        timedOut: false,
      };
    }
    return {
      content,
      rawResponse: content.slice(0, 20_000),
      error: null,
      httpStatus: res.status,
      timedOut: false,
    };
  } catch (err) {
    const isAbort = (err as Error)?.name === "AbortError";
    const errMsg = isAbort
      ? `timeout_${args.timeoutMs}ms`
      : `network:${(err as Error)?.message ?? String(err)}`.slice(0, 200);
    console.warn(`[scopeSegmentationLLM] ${args.label} failed: ${errMsg}`);
    return {
      content: null,
      rawResponse: null,
      error: errMsg,
      httpStatus: null,
      timedOut: isAbort,
    };
  } finally {
    clearTimeout(timer);
  }
}

type ParsedPayload = {
  items: LLMItemResult[];
  summary: LLMSummary | null;
  parseError: string | null;
};

function parseLLMPayload(raw: string): ParsedPayload {
  const stripped = stripJsonFences(raw);
  let parsed: unknown = null;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    parseError = (err as Error)?.message ?? "json_parse_failed";
  }

  if (parsed == null || typeof parsed !== "object") {
    const salvaged = salvageItems(stripped);
    return { items: salvaged, summary: null, parseError };
  }

  const root = parsed as Record<string, unknown>;
  const itemsArr = Array.isArray(root.items)
    ? root.items
    : Array.isArray(root.rows)
    ? root.rows
    : Array.isArray(root.results)
    ? root.results
    : [];
  const items: LLMItemResult[] = [];
  for (const it of itemsArr as Array<Record<string, unknown>>) {
    const norm = normaliseItem(it);
    if (norm) items.push(norm);
  }

  const summary = normaliseSummary(root.summary);

  return { items, summary, parseError: items.length === 0 ? parseError : null };
}

function normaliseItem(raw: Record<string, unknown>): LLMItemResult | null {
  const row_id = raw.row_id ?? raw.rowId ?? raw.id;
  if (row_id == null) return null;
  const label = normaliseLabel(raw.scope_category ?? raw.scope ?? raw.category);
  if (!label) return null;
  const confidence = clamp01(Number(raw.confidence ?? 0.6));
  const reason = String(raw.reason ?? "").slice(0, 200);
  const evidence = raw.evidence && typeof raw.evidence === "object"
    ? {
        page: toIntOrNull((raw.evidence as Record<string, unknown>).page),
        heading: optString((raw.evidence as Record<string, unknown>).heading),
        signal: optString((raw.evidence as Record<string, unknown>).signal),
      }
    : null;
  return { row_id: String(row_id), scope_category: label, confidence, reason, evidence };
}

function normaliseSummary(raw: unknown): LLMSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const conf = String(r.overall_confidence ?? "").toUpperCase();
  const overall_confidence: LLMSummary["overall_confidence"] =
    conf === "HIGH" || conf === "MEDIUM" || conf === "LOW" ? conf : null;
  const notesRaw = Array.isArray(r.notes) ? r.notes : [];
  const notes = notesRaw.map((n) => String(n)).slice(0, 20);
  return {
    main_sum: toNumberOrNull(r.main_sum),
    optional_sum: toNumberOrNull(r.optional_sum),
    excluded_sum: toNumberOrNull(r.excluded_sum),
    unknown_sum: toNumberOrNull(r.unknown_sum),
    main_total_match: toBoolOrNull(r.main_total_match),
    optional_total_match: toBoolOrNull(r.optional_total_match),
    overall_confidence,
    notes,
  };
}

function normaliseLabel(v: unknown): LLMScopeCategory | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "main") return "Main";
  if (s === "optional" || s === "provisional") return "Optional";
  if (s === "excluded" || s === "exclusion") return "Excluded";
  if (s === "unknown") return "Unknown";
  return null;
}

function stripJsonFences(s: string): string {
  let out = (s ?? "").trim();
  out = out.replace(/^```(?:json|JSON)?\s*\n?/i, "");
  out = out.replace(/\n?```\s*$/i, "");
  return out.trim();
}

function salvageItems(raw: string): LLMItemResult[] {
  const out: LLMItemResult[] = [];
  const re = /\{[^{}]*?"row_id"\s*:\s*"[^"]+"[^{}]*\}/gs;
  const matches = raw.match(re);
  if (!matches) return out;
  for (const m of matches) {
    try {
      const obj = JSON.parse(m) as Record<string, unknown>;
      const norm = normaliseItem(obj);
      if (norm) out.push(norm);
    } catch {
      // best-effort
    }
  }
  return out;
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(rows.slice(i, i + size));
  }
  return out;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s()]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: unknown): number | null {
  const n = toNumberOrNull(v);
  return n == null ? null : Math.round(n);
}

function toBoolOrNull(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (s === "true" || s === "yes") return true;
  if (s === "false" || s === "no") return false;
  return null;
}

function optString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function remainingBudget(deadlineEpochMs: number): number {
  return Math.max(0, deadlineEpochMs - Date.now());
}
