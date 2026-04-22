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

const EXTRACTOR_MODEL = "gpt-4.1";
const CHUNK_CHAR_BUDGET = 18000;
const MAX_CHUNKS = 8;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_RETRIES = 3;

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

export type ExtractorResult = {
  items: ParsedLineItemV2[];
  chunks_attempted: number;
  chunks_succeeded: number;
  raw_rows: number;
  dedup_removed: number;
};

export async function runExtractorLLM(ctx: ExtractorContext): Promise<ParsedLineItemV2[]> {
  const res = await runExtractorLLMWithTelemetry(ctx);
  return res.items;
}

export async function runExtractorLLMWithTelemetry(
  ctx: ExtractorContext,
): Promise<ExtractorResult> {
  const chunks = buildChunks(ctx.pages, ctx.rawText).slice(0, MAX_CHUNKS);
  const all: ParsedLineItemV2[] = [];
  let succeeded = 0;

  for (let i = 0; i < chunks.length; i++) {
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

    const rows = await callOpenAIWithRetry({
      openAIKey: ctx.openAIKey,
      systemPrompt: ctx.systemPrompt,
      userPayload,
      trade: ctx.trade,
      chunkIndex: i,
    });
    if (rows != null) {
      succeeded++;
      const mapper = ctx.rowMapper ?? normaliseRow;
      for (const r of rows) all.push(mapper(r as Record<string, unknown>, ctx.trade));
    }
  }

  const deduped = dedupe(all);
  return {
    items: deduped,
    chunks_attempted: chunks.length,
    chunks_succeeded: succeeded,
    raw_rows: all.length,
    dedup_removed: all.length - deduped.length,
  };
}

async function callOpenAIWithRetry(args: {
  openAIKey: string;
  systemPrompt: string;
  userPayload: Record<string, unknown>;
  trade: string;
  chunkIndex: number;
}): Promise<unknown[] | null> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
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
            { role: "user", content: JSON.stringify(args.userPayload) },
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
      const content = json?.choices?.[0]?.message?.content;
      if (!content) return [];
      const parsed = JSON.parse(content);
      return Array.isArray(parsed.items) ? parsed.items : [];
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
