/**
 * scopeSegmentationLLM — Stage 10 v3 (LLM Native).
 *
 * The LLM is the SOLE classifier. There is no deterministic fallback.
 *
 * Chunking:
 *   - ≤220 rows: single pass.
 *   - >220 rows: chunks of 90 with overlap of 12 rows on each side
 *     (overlap rows give the model the same anchoring context as in
 *     the neighbouring chunk so block-reset boundaries don't get
 *     mis-classified at the seam).
 *
 * Budget:
 *   - Stage wall-clock: 30s hard cap (`STAGE_BUDGET_MS`).
 *   - Per-call HTTP timeout: 25s, narrowed to remaining budget.
 *   - Single attempt per chunk. No retries.
 *
 * Output: structured success or structured failure. On failure the
 * caller MUST surface the error — there is no legacy fallback.
 */

import {
  SCOPE_SEGMENTATION_SYSTEM_PROMPT_V3,
  buildScopeUserPromptV3,
  type ScopeRowPacket,
} from "./scopeSegmentationPrompt.ts";

export const SCOPE_SEGMENTATION_MODEL = "gpt-5.4-mini";
export const STAGE10_VERSION = "llm_native_v3";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const STAGE_BUDGET_MS = 30_000;
const PER_CALL_TIMEOUT_MS = 25_000;
const MAX_COMPLETION_TOKENS = 6000;

export const SINGLE_PASS_LIMIT = 220;
export const CHUNK_SIZE = 90;
export const CHUNK_OVERLAP = 12;

export type LLMScope = "Main" | "Optional" | "Excluded" | "Metadata";

export type LLMRowResult = {
  row_index: number;
  scope: LLMScope;
  confidence: number;
  section_id: string | null;
  group_id: string | null;
  rationale_short: string;
  heading_basis: string | null;
};

export type LLMSummary = {
  main_count: number;
  optional_count: number;
  excluded_count: number;
  metadata_count: number;
  block_resets_seen: number;
  overall_confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type LLMClassifyResultOk = {
  status: "ok";
  stage10_version: typeof STAGE10_VERSION;
  runtime_ms: number;
  model_used: string;
  rows: LLMRowResult[];
  warnings: string[];
  summary: LLMSummary;
  chunks_used: number;
  rows_sent: number;
};

export type LLMClassifyResultFailed = {
  status: "failed";
  stage10_version: typeof STAGE10_VERSION;
  runtime_ms: number;
  model_used: string;
  error_type:
    | "missing_openai_key"
    | "deadline_exhausted"
    | "http_error"
    | "timeout"
    | "empty_response"
    | "parse_error"
    | "missing_rows"
    | "network"
    | "unknown";
  debug_hint: string;
  rows: LLMRowResult[];
  warnings: string[];
  chunks_attempted: number;
  rows_sent: number;
};

export type LLMClassifyResult = LLMClassifyResultOk | LLMClassifyResultFailed;

export type ClassifyArgs = {
  openAIKey: string;
  supplier: string;
  trade: string;
  quote_type: string;
  page_count: number;
  rows: ScopeRowPacket[];
};

export async function classifyRowsLLMV3(
  args: ClassifyArgs,
): Promise<LLMClassifyResult> {
  const start = Date.now();
  const deadline = start + STAGE_BUDGET_MS;
  const warnings: string[] = [];
  const allRows = args.rows;

  if (!args.openAIKey) {
    return {
      status: "failed",
      stage10_version: STAGE10_VERSION,
      runtime_ms: Date.now() - start,
      model_used: SCOPE_SEGMENTATION_MODEL,
      error_type: "missing_openai_key",
      debug_hint: "openAIKey not provided to scope segmentation engine",
      rows: [],
      warnings,
      chunks_attempted: 0,
      rows_sent: allRows.length,
    };
  }

  if (allRows.length === 0) {
    return {
      status: "ok",
      stage10_version: STAGE10_VERSION,
      runtime_ms: Date.now() - start,
      model_used: SCOPE_SEGMENTATION_MODEL,
      rows: [],
      warnings,
      summary: {
        main_count: 0,
        optional_count: 0,
        excluded_count: 0,
        metadata_count: 0,
        block_resets_seen: 0,
        overall_confidence: "HIGH",
      },
      chunks_used: 0,
      rows_sent: 0,
    };
  }

  const chunks = buildChunks(allRows);
  const isChunked = chunks.length > 1;

  type ChunkOutcome = {
    chunkIndex: number;
    label: string;
    rows: LLMRowResult[];
    error: string | null;
    error_type: LLMClassifyResultFailed["error_type"] | null;
  };
  const outcomes: ChunkOutcome[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining <= 500) {
      return {
        status: "failed",
        stage10_version: STAGE10_VERSION,
        runtime_ms: Date.now() - start,
        model_used: SCOPE_SEGMENTATION_MODEL,
        error_type: "deadline_exhausted",
        debug_hint: `wall-clock deadline reached after ${i}/${chunks.length} chunks`,
        rows: dedupeRows(outcomes.flatMap((o) => o.rows)),
        warnings,
        chunks_attempted: i,
        rows_sent: allRows.length,
      };
    }
    const label = `chunk_${i + 1}_of_${chunks.length}`;
    const userPrompt = buildScopeUserPromptV3({
      supplier: args.supplier,
      trade: args.trade,
      quote_type: args.quote_type,
      page_count: args.page_count,
      rows: chunks[i],
      chunk_label: label,
      is_chunked: isChunked,
    });
    const timeoutMs = Math.min(PER_CALL_TIMEOUT_MS, remaining);
    const call = await callLLMOnce({
      openAIKey: args.openAIKey,
      systemPrompt: SCOPE_SEGMENTATION_SYSTEM_PROMPT_V3,
      userPrompt,
      label,
      timeoutMs,
    });
    if (call.error) {
      outcomes.push({
        chunkIndex: i,
        label,
        rows: [],
        error: call.error,
        error_type: call.error_type,
      });
      warnings.push(`${label}:${call.error}`);
      continue;
    }
    const parsed = parsePayload(call.content ?? "");
    if (parsed.parseError) {
      outcomes.push({
        chunkIndex: i,
        label,
        rows: parsed.rows,
        error: parsed.parseError,
        error_type: "parse_error",
      });
      warnings.push(`${label}:parse:${parsed.parseError}`);
      continue;
    }
    outcomes.push({
      chunkIndex: i,
      label,
      rows: parsed.rows,
      error: null,
      error_type: null,
    });
  }

  const merged = mergeChunkRows(outcomes.map((o) => o.rows));
  const expectedIndices = new Set(allRows.map((r) => r.row_index));
  const gotIndices = new Set(merged.map((r) => r.row_index));
  const missing: number[] = [];
  for (const idx of expectedIndices) if (!gotIndices.has(idx)) missing.push(idx);

  const fatalFailureChunks = outcomes.filter((o) => o.error && o.rows.length === 0);
  if (fatalFailureChunks.length === outcomes.length) {
    const first = fatalFailureChunks[0];
    return {
      status: "failed",
      stage10_version: STAGE10_VERSION,
      runtime_ms: Date.now() - start,
      model_used: SCOPE_SEGMENTATION_MODEL,
      error_type: first?.error_type ?? "unknown",
      debug_hint: `all ${outcomes.length} chunk(s) failed: ${first?.error ?? "unknown"}`,
      rows: [],
      warnings,
      chunks_attempted: outcomes.length,
      rows_sent: allRows.length,
    };
  }

  if (missing.length > 0) {
    const sample = missing.slice(0, 10).join(",");
    warnings.push(`missing_rows:count=${missing.length}:sample=[${sample}]`);
    if (merged.length === 0) {
      return {
        status: "failed",
        stage10_version: STAGE10_VERSION,
        runtime_ms: Date.now() - start,
        model_used: SCOPE_SEGMENTATION_MODEL,
        error_type: "missing_rows",
        debug_hint: `LLM returned 0 rows; expected ${allRows.length}`,
        rows: [],
        warnings,
        chunks_attempted: outcomes.length,
        rows_sent: allRows.length,
      };
    }
  }

  const summary = buildSummary(merged);
  return {
    status: "ok",
    stage10_version: STAGE10_VERSION,
    runtime_ms: Date.now() - start,
    model_used: SCOPE_SEGMENTATION_MODEL,
    rows: merged,
    warnings,
    summary,
    chunks_used: outcomes.length,
    rows_sent: allRows.length,
  };
}

function buildChunks(rows: ScopeRowPacket[]): ScopeRowPacket[][] {
  if (rows.length <= SINGLE_PASS_LIMIT) return [rows];
  const out: ScopeRowPacket[][] = [];
  let cursor = 0;
  while (cursor < rows.length) {
    const start = Math.max(0, cursor - (out.length === 0 ? 0 : CHUNK_OVERLAP));
    const end = Math.min(rows.length, cursor + CHUNK_SIZE);
    const slice = rows.slice(start, end + (end < rows.length ? CHUNK_OVERLAP : 0));
    out.push(slice);
    cursor = end;
  }
  return out;
}

function mergeChunkRows(perChunk: LLMRowResult[][]): LLMRowResult[] {
  const byIndex = new Map<number, LLMRowResult>();
  for (const chunk of perChunk) {
    for (const row of chunk) {
      const existing = byIndex.get(row.row_index);
      if (!existing) {
        byIndex.set(row.row_index, row);
        continue;
      }
      // Higher confidence wins on overlap. Tie → keep first.
      if (row.confidence > existing.confidence + 0.05) {
        byIndex.set(row.row_index, row);
      }
    }
  }
  return [...byIndex.values()].sort((a, b) => a.row_index - b.row_index);
}

function dedupeRows(rows: LLMRowResult[]): LLMRowResult[] {
  return mergeChunkRows([rows]);
}

function buildSummary(rows: LLMRowResult[]): LLMSummary {
  let main = 0;
  let optional = 0;
  let excluded = 0;
  let metadata = 0;
  const sections = new Set<string>();
  let confSum = 0;
  for (const r of rows) {
    if (r.scope === "Main") main++;
    else if (r.scope === "Optional") optional++;
    else if (r.scope === "Excluded") excluded++;
    else if (r.scope === "Metadata") metadata++;
    if (r.section_id) sections.add(r.section_id);
    confSum += r.confidence;
  }
  const avg = rows.length > 0 ? confSum / rows.length : 0;
  const overall: "HIGH" | "MEDIUM" | "LOW" =
    avg >= 0.85 ? "HIGH" : avg >= 0.65 ? "MEDIUM" : "LOW";
  return {
    main_count: main,
    optional_count: optional,
    excluded_count: excluded,
    metadata_count: metadata,
    block_resets_seen: sections.size,
    overall_confidence: overall,
  };
}

// --------------------------------------------------------------------------
// HTTP + parsing
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
  error: string | null;
  error_type: LLMClassifyResultFailed["error_type"] | null;
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
        error: `http_${res.status}:${body.slice(0, 200)}`,
        error_type: "http_error",
      };
    }
    const json = (await res.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const content = json?.choices?.[0]?.message?.content ?? null;
    if (!content || typeof content !== "string") {
      return { content: null, error: "empty_response", error_type: "empty_response" };
    }
    return { content, error: null, error_type: null };
  } catch (err) {
    const isAbort = (err as Error)?.name === "AbortError";
    const msg = isAbort
      ? `timeout_${args.timeoutMs}ms`
      : `network:${(err as Error)?.message ?? String(err)}`.slice(0, 200);
    console.warn(`[scopeSegmentationLLM:v3] ${args.label} failed: ${msg}`);
    return {
      content: null,
      error: msg,
      error_type: isAbort ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timer);
  }
}

type ParsedPayload = {
  rows: LLMRowResult[];
  parseError: string | null;
};

function parsePayload(raw: string): ParsedPayload {
  const stripped = stripJsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    return {
      rows: salvageRows(stripped),
      parseError: (err as Error)?.message ?? "json_parse_failed",
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return { rows: [], parseError: "non_object_payload" };
  }
  const root = parsed as Record<string, unknown>;
  const arr = Array.isArray(root.rows)
    ? root.rows
    : Array.isArray(root.items)
    ? root.items
    : [];
  const out: LLMRowResult[] = [];
  for (const it of arr as Array<Record<string, unknown>>) {
    const norm = normaliseRow(it);
    if (norm) out.push(norm);
  }
  return { rows: out, parseError: out.length === 0 ? "zero_rows_parsed" : null };
}

function normaliseRow(raw: Record<string, unknown>): LLMRowResult | null {
  const idxRaw = raw.row_index ?? raw.rowIndex ?? raw.index ?? raw.row_id;
  const idx = Number(idxRaw);
  if (!Number.isFinite(idx)) return null;
  const scope = normaliseScope(raw.scope ?? raw.scope_category ?? raw.category);
  if (!scope) return null;
  const confidence = clamp01(Number(raw.confidence ?? 0.6));
  return {
    row_index: Math.round(idx),
    scope,
    confidence,
    section_id: optString(raw.section_id),
    group_id: optString(raw.group_id),
    rationale_short: String(raw.rationale_short ?? raw.reason ?? "").slice(0, 200),
    heading_basis: optString(raw.heading_basis),
  };
}

function normaliseScope(v: unknown): LLMScope | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "main") return "Main";
  if (s === "optional" || s === "provisional") return "Optional";
  if (s === "excluded" || s === "exclusion") return "Excluded";
  if (s === "metadata" || s === "subtotal" || s === "total") return "Metadata";
  return null;
}

function stripJsonFences(s: string): string {
  let out = (s ?? "").trim();
  out = out.replace(/^```(?:json|JSON)?\s*\n?/i, "");
  out = out.replace(/\n?```\s*$/i, "");
  return out.trim();
}

function salvageRows(raw: string): LLMRowResult[] {
  const out: LLMRowResult[] = [];
  const re = /\{[^{}]*?"row_index"\s*:\s*\d+[^{}]*\}/gs;
  const matches = raw.match(re);
  if (!matches) return out;
  for (const m of matches) {
    try {
      const obj = JSON.parse(m) as Record<string, unknown>;
      const norm = normaliseRow(obj);
      if (norm) out.push(norm);
    } catch {
      // best-effort
    }
  }
  return out;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function optString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 160) : null;
}
