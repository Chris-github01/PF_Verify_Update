/**
 * Shared LLM runtime used by every trade extractor.
 * Chunks text, calls gpt-4o-mini with a JSON schema, merges rows.
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";

const CHUNK_CHAR_BUDGET = 14000;
const MAX_CHUNKS = 6;

export async function runExtractorLLM(ctx: {
  systemPrompt: string;
  trade: string;
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
  extraUserContext?: Record<string, unknown>;
}): Promise<ParsedLineItemV2[]> {
  const chunks = chunkText(ctx.rawText, CHUNK_CHAR_BUDGET).slice(0, MAX_CHUNKS);
  const all: ParsedLineItemV2[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const userPayload = {
      trade: ctx.trade,
      quote_type: ctx.quoteType,
      supplier: ctx.supplier,
      chunk_index: i,
      chunk_total: chunks.length,
      document_chunk: chunk,
      context: ctx.extraUserContext ?? {},
    };

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
            { role: "system", content: ctx.systemPrompt },
            { role: "user", content: JSON.stringify(userPayload) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`extractor HTTP ${res.status}`);
      const json = await res.json();
      const parsed = JSON.parse(json.choices[0].message.content);
      const rows = Array.isArray(parsed.items) ? parsed.items : [];
      for (const r of rows) all.push(normaliseRow(r, ctx.trade));
    } catch (err) {
      console.error(`[extractor:${ctx.trade}] chunk ${i} failed`, err);
    }
  }

  return dedupe(all);
}

function normaliseRow(r: Record<string, unknown>, trade: string): ParsedLineItemV2 {
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
  if (s.startsWith("opt")) return "optional";
  if (s.startsWith("excl")) return "excluded";
  return "main";
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function chunkText(text: string, budget: number): string[] {
  if (text.length <= budget) return [text];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + budget);
    const slice = text.slice(i, end);
    const lastBreak = slice.lastIndexOf("\n");
    if (lastBreak > budget * 0.5 && end < text.length) end = i + lastBreak;
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

function dedupe(items: ParsedLineItemV2[]): ParsedLineItemV2[] {
  const seen = new Set<string>();
  const out: ParsedLineItemV2[] = [];
  for (const it of items) {
    const key = `${it.description.toLowerCase().replace(/\s+/g, " ").trim()}|${it.quantity ?? ""}|${it.unit_price ?? ""}|${it.total_price ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
