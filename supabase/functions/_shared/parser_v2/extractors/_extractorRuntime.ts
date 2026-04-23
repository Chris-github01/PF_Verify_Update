/**
 * Shared LLM runtime used by every trade extractor.
 *
 * - Uses gpt-4.1 for extraction (high-fidelity line-item work).
 * - Classifiers stay on gpt-4o-mini elsewhere.
 * - Chunks input with sentence-aware breaks and page hints.
 * - Retries transient failures with exponential backoff.
 * - Deduplicates across chunks on a canonical key.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";
import { markLlmCallDuration, markRequestSent, markResponseReceived } from "../telemetrySink.ts";

const EXTRACTOR_MODEL = "gpt-4.1";
const CHUNK_CHAR_BUDGET = 18000;
const MAX_CHUNKS = 8;
const CHUNK_CONCURRENCY = 4;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_RETRIES = 3;
const EXTRACTION_STAGE_BUDGET_MS = 35_000;
const PER_CHUNK_BUDGET_MS = 18_000;

export type ExtractorContext = {
  systemPrompt: string;
  trade: string;
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
  extraUserContext?: Record<string, unknown>;
  rowMapper?: (raw: Record<string, unknown>, trade: string) => ParsedLineItemV2;
};

export type ExtractorChunkDebug = {
  chunk_index: number;
  page_range: string;
  raw_response_text: string | null;
  parsed_json: unknown | null;
  parse_error: string | null;
  schema_error: string | null;
  rows_before_validation: number;
  rows_after_validation: number;
};

export type ExtractorResult = {
  items: ParsedLineItemV2[];
  chunks_attempted: number;
  chunks_succeeded: number;
  raw_rows: number;
  dedup_removed: number;
  debug: ExtractorChunkDebug[];
};

const MAX_RAW_RESPONSE_PERSIST = 4000;

let LAST_EXTRACTOR_DEBUG: ExtractorChunkDebug[] = [];

export function takeLastExtractorDebug(): ExtractorChunkDebug[] {
  const d = LAST_EXTRACTOR_DEBUG;
  LAST_EXTRACTOR_DEBUG = [];
  return d;
}

export async function runExtractorLLM(ctx: ExtractorContext): Promise<ParsedLineItemV2[]> {
  const res = await runExtractorLLMWithTelemetry(ctx);
  LAST_EXTRACTOR_DEBUG = res.debug;
  return res.items;
}

export async function runExtractorLLMWithTelemetry(
  ctx: ExtractorContext,
): Promise<ExtractorResult> {
  const chunks = buildChunks(ctx.pages, ctx.rawText).slice(0, MAX_CHUNKS);
  const all: ParsedLineItemV2[] = [];
  let succeeded = 0;
  const debug: ExtractorChunkDebug[] = [];
  const stageStart = Date.now();

  const remainingBudget = () =>
    Math.max(0, EXTRACTION_STAGE_BUDGET_MS - (Date.now() - stageStart));

  const runChunk = async (
    i: number,
  ): Promise<{ rows: unknown[] | null; debug: ExtractorChunkDebug }> => {
    const chunk = chunks[i];
    const userPayload = {
      trade: ctx.trade,
      quote_type: ctx.quoteType,
      supplier: ctx.supplier,
      chunk_index: i,
      chunk_total: chunks.length,
      page_range: chunk.pageRange,
      document_chunk: chunk.text,
      context: ctx.extraUserContext ?? {},
    };
    const budget = Math.min(PER_CHUNK_BUDGET_MS, remainingBudget());
    if (budget < 1000) {
      console.warn(`[extractor:${ctx.trade}] chunk ${i} skipped — no budget remaining`);
      return {
        rows: null,
        debug: {
          chunk_index: i,
          page_range: chunk.pageRange,
          raw_response_text: null,
          parsed_json: null,
          parse_error: "skipped_no_budget",
          schema_error: null,
          rows_before_validation: 0,
          rows_after_validation: 0,
        },
      };
    }
    const result = await raceOrNull(
      callOpenAIWithRetry({
        openAIKey: ctx.openAIKey,
        systemPrompt: ctx.systemPrompt,
        userPayload,
        trade: ctx.trade,
        chunkIndex: i,
      }),
      budget,
      `chunk ${i}`,
    );
    if (result == null) {
      return {
        rows: null,
        debug: {
          chunk_index: i,
          page_range: chunk.pageRange,
          raw_response_text: null,
          parsed_json: null,
          parse_error: "chunk_timeout_or_failure",
          schema_error: null,
          rows_before_validation: 0,
          rows_after_validation: 0,
        },
      };
    }
    return {
      rows: result.rows,
      debug: {
        chunk_index: i,
        page_range: chunk.pageRange,
        raw_response_text: result.rawResponseText,
        parsed_json: result.parsedJson,
        parse_error: result.parseError,
        schema_error: result.schemaError,
        rows_before_validation: result.rows?.length ?? 0,
        rows_after_validation: result.rows?.length ?? 0,
      },
    };
  };

  const mapper = ctx.rowMapper ?? normaliseRow;
  for (let start = 0; start < chunks.length; start += CHUNK_CONCURRENCY) {
    if (remainingBudget() < 1000) {
      console.warn(
        `[extractor:${ctx.trade}] stage budget exhausted at batch ${start}/${chunks.length} — returning partial`,
      );
      break;
    }
    const batch = chunks
      .slice(start, start + CHUNK_CONCURRENCY)
      .map((_, offset) => runChunk(start + offset));
    const results = await Promise.all(batch);
    for (const r of results) {
      debug.push(r.debug);
      if (r.rows != null) {
        succeeded++;
        for (const row of r.rows) all.push(mapper(row as Record<string, unknown>, ctx.trade));
      }
    }
  }

  const elapsed = Date.now() - stageStart;
  if (elapsed > EXTRACTION_STAGE_BUDGET_MS) {
    console.warn(
      `[extractor:${ctx.trade}] stage wall-clock ${elapsed}ms exceeded budget ${EXTRACTION_STAGE_BUDGET_MS}ms — ${succeeded}/${chunks.length} chunks succeeded`,
    );
  }

  const deduped = dedupe(all);
  return {
    items: deduped,
    chunks_attempted: chunks.length,
    chunks_succeeded: succeeded,
    raw_rows: all.length,
    dedup_removed: all.length - deduped.length,
    debug,
  };
}

type ChunkCallResult = {
  rows: unknown[] | null;
  rawResponseText: string | null;
  parsedJson: unknown | null;
  parseError: string | null;
  schemaError: string | null;
};

async function callOpenAIWithRetry(args: {
  openAIKey: string;
  systemPrompt: string;
  userPayload: Record<string, unknown>;
  trade: string;
  chunkIndex: number;
}): Promise<ChunkCallResult | null> {
  let lastErr: unknown = null;
  const userJson = JSON.stringify(args.userPayload);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      markRequestSent(
        Math.round((args.systemPrompt.length + userJson.length) / 4),
        EXTRACTOR_MODEL,
      );
      const reqStart = Date.now();
      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.openAIKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EXTRACTOR_MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: args.systemPrompt },
            { role: "user", content: userJson },
          ],
        }),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`transient HTTP ${res.status}`);
      }
      if (!res.ok) {
        const bodyTxt = await res.text().catch(() => "");
        throw new Error(`fatal HTTP ${res.status}: ${bodyTxt.slice(0, 200)}`);
      }
      const json = await res.json();
      markLlmCallDuration(Date.now() - reqStart, EXTRACTOR_MODEL);
      markResponseReceived(json?.usage);
      const content = json?.choices?.[0]?.message?.content;
      if (!content) {
        return {
          rows: [],
          rawResponseText: null,
          parsedJson: null,
          parseError: "empty_response_content",
          schemaError: null,
        };
      }
      const rawResponseText = typeof content === "string"
        ? content.slice(0, MAX_RAW_RESPONSE_PERSIST)
        : null;
      try {
        const parsed = JSON.parse(content);
        const hasItemsArray = Array.isArray(parsed?.items);
        return {
          rows: hasItemsArray ? parsed.items : [],
          rawResponseText,
          parsedJson: parsed,
          parseError: null,
          schemaError: hasItemsArray ? null : "missing_items_array",
        };
      } catch (parseErr) {
        return {
          rows: [],
          rawResponseText,
          parsedJson: null,
          parseError: (parseErr as Error)?.message ?? "json_parse_failed",
          schemaError: null,
        };
      }
    } catch (err) {
      lastErr = err;
      const backoff = 400 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  console.error(
    `[extractor:${args.trade}] chunk ${args.chunkIndex} failed after ${MAX_RETRIES} attempts`,
    lastErr,
  );
  return null;
}

export function normaliseRow(r: Record<string, unknown>, trade: string): ParsedLineItemV2 {
  return {
    item_number: r.item_number == null ? null : String(r.item_number),
    description: String(r.description ?? "").trim(),
    quantity: toNumberOrNull(r.quantity),
    unit: r.unit == null ? null : String(r.unit),
    unit_price: toNumberOrNull(r.unit_price),
    total_price: toNumberOrNull(r.total_price),
    scope_category: normaliseScope(r.scope_category),
    trade: String(r.trade ?? trade),
    sub_scope: r.sub_scope == null ? null : String(r.sub_scope),
    frr: r.frr == null ? null : String(r.frr),
    source: "llm",
    confidence: clamp01(Number(r.confidence ?? 0.6)),
  };
}

function normaliseScope(v: unknown): "main" | "optional" | "excluded" {
  const s = String(v ?? "main").toLowerCase();
  if (s.startsWith("opt") || s.includes("provisional")) return "optional";
  if (s.startsWith("excl") || s === "exclusion") return "excluded";
  return "main";
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

async function raceOrNull<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutP = new Promise<{ __timeout: true }>((resolve) => {
    timer = setTimeout(() => resolve({ __timeout: true }), timeoutMs);
  });
  try {
    const winner = await Promise.race([promise, timeoutP]);
    if ((winner as { __timeout?: boolean }).__timeout) {
      console.warn(`[extractor] ${label} exceeded ${timeoutMs}ms — skipping chunk`);
      return null;
    }
    return winner as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type Chunk = { text: string; pageRange: string };

function buildChunks(
  pages: { pageNum: number; text: string }[],
  rawText: string,
): Chunk[] {
  if (!pages || pages.length === 0) {
    return chunkRawText(rawText).map((text, idx) => ({
      text,
      pageRange: `chunk_${idx + 1}`,
    }));
  }
  const chunks: Chunk[] = [];
  let buffer = "";
  let firstPage = pages[0].pageNum;
  let lastPage = pages[0].pageNum;

  const flush = () => {
    if (!buffer.trim()) return;
    chunks.push({ text: buffer, pageRange: `p${firstPage}-p${lastPage}` });
    buffer = "";
  };

  for (const p of pages) {
    const block = `\n\n[Page ${p.pageNum}]\n${p.text}`;
    if (buffer.length + block.length > CHUNK_CHAR_BUDGET && buffer.length > 0) {
      flush();
      firstPage = p.pageNum;
    }
    if (!buffer) firstPage = p.pageNum;
    lastPage = p.pageNum;
    buffer += block;
  }
  flush();
  return chunks;
}

function chunkRawText(text: string): string[] {
  if (text.length <= CHUNK_CHAR_BUDGET) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + CHUNK_CHAR_BUDGET);
    if (end < text.length) {
      const slice = text.slice(i, end);
      const lastBreak = slice.lastIndexOf("\n");
      if (lastBreak > CHUNK_CHAR_BUDGET * 0.5) end = i + lastBreak;
    }
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

function dedupe(items: ParsedLineItemV2[]): ParsedLineItemV2[] {
  const seen = new Map<string, ParsedLineItemV2>();
  for (const it of items) {
    const key = canonicalKey(it);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, it);
      continue;
    }
    if (it.confidence > existing.confidence) seen.set(key, it);
  }
  return [...seen.values()];
}

function canonicalKey(it: ParsedLineItemV2): string {
  const desc = it.description
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s\-\/]/g, "")
    .trim()
    .slice(0, 80);
  return [
    desc,
    it.quantity ?? "",
    it.unit ?? "",
    it.unit_price ?? "",
    it.total_price ?? "",
    it.scope_category,
  ].join("|");
}
