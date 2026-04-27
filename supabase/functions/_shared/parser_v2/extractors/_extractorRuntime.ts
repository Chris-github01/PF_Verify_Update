/**
 * Shared LLM runtime used by every trade extractor.
 *
 * - Uses gpt-4.1 for extraction (high-fidelity line-item work).
 * - Chunks input with sentence-aware breaks and page hints.
 * - Retries transient failures with exponential backoff.
 * - Tolerant JSON parsing: fence-strip, root-key aliases, per-field aliases,
 *   lenient row validation, and regex salvage when JSON.parse fails.
 * - Per-chunk telemetry exposed via takeLastExtractorDebug().
 */

import type { ParsedLineItemV2 } from "../runParserV2.ts";
import { markLlmCallDuration, markRequestSent, markResponseReceived } from "../telemetrySink.ts";

const EXTRACTOR_MODEL = "gpt-4.1";
const CHUNK_CHAR_BUDGET = 6000;
const MAX_CHUNKS = 20;
const CHUNK_CONCURRENCY = 10;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_RETRIES = 1;
const EXTRACTION_STAGE_BUDGET_MS = 90_000;
const PER_CHUNK_BUDGET_MS = 60_000;
const PER_REQUEST_BUDGET_MS = 55_000;
const LLM_MAX_TOKENS = 16000;
const MAX_RAW_RESPONSE_PERSIST = 20_000;

export type ExtractorContext = {
  systemPrompt: string;
  trade: string;
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
  extraUserContext?: Record<string, unknown>;
  rowMapper?: (raw: Record<string, unknown>, trade: string) => ParsedLineItemV2 | null;
};

export type ExtractorEmptyReason =
  | "no_items_key"
  | "parse_failed"
  | "schema_failed"
  | "all_rows_invalid"
  | "empty_array"
  | "mapper_rejected"
  | "empty_response_content"
  | "chunk_timeout_or_failure"
  | "skipped_no_budget"
  | null;

export type ExtractorChunkDebug = {
  chunk_index: number;
  page_range: string;
  raw_response_text: string | null;
  parsed_json: unknown | null;
  top_level_keys: string[];
  parse_error: string | null;
  schema_error: string | null;
  rows_received: number;
  rows_after_normalize: number;
  rows_after_validation: number;
  empty_reason: ExtractorEmptyReason;
  salvaged: boolean;
  root_alias_used: string | null;
};

export type ExtractorResult = {
  items: ParsedLineItemV2[];
  chunks_attempted: number;
  chunks_succeeded: number;
  raw_rows: number;
  dedup_removed: number;
  debug: ExtractorChunkDebug[];
};

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

  const baseDebug = (i: number, pageRange: string): ExtractorChunkDebug => ({
    chunk_index: i,
    page_range: pageRange,
    raw_response_text: null,
    parsed_json: null,
    top_level_keys: [],
    parse_error: null,
    schema_error: null,
    rows_received: 0,
    rows_after_normalize: 0,
    rows_after_validation: 0,
    empty_reason: null,
    salvaged: false,
    root_alias_used: null,
  });

  const runChunk = async (
    i: number,
  ): Promise<{ rows: unknown[] | null; debug: ExtractorChunkDebug }> => {
    const chunk = chunks[i];
    const d = baseDebug(i, chunk.pageRange);
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
      d.empty_reason = "skipped_no_budget";
      d.parse_error = "skipped_no_budget";
      return { rows: null, debug: d };
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
      d.empty_reason = "chunk_timeout_or_failure";
      d.parse_error = "chunk_timeout_or_failure";
      return { rows: null, debug: d };
    }
    d.raw_response_text = result.rawResponseText;
    d.parsed_json = result.parsedJson;
    d.top_level_keys = result.topLevelKeys;
    d.parse_error = result.parseError;
    d.schema_error = result.schemaError;
    d.rows_received = result.rows?.length ?? 0;
    d.empty_reason = result.emptyReason;
    d.salvaged = result.salvaged;
    d.root_alias_used = result.rootAliasUsed;
    return { rows: result.rows, debug: d };
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
      if (r.rows != null) {
        succeeded++;
        let validCount = 0;
        for (const row of r.rows) {
          const mapped = mapper(row as Record<string, unknown>, ctx.trade);
          if (mapped) {
            all.push(mapped);
            validCount++;
          }
        }
        r.debug.rows_after_normalize = validCount;
        r.debug.rows_after_validation = validCount;
        if (r.debug.empty_reason == null && validCount === 0) {
          if (r.debug.rows_received === 0) {
            r.debug.empty_reason = "empty_array";
          } else {
            r.debug.empty_reason = "mapper_rejected";
          }
        }
      }
      debug.push(r.debug);
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
  topLevelKeys: string[];
  parseError: string | null;
  schemaError: string | null;
  emptyReason: ExtractorEmptyReason;
  salvaged: boolean;
  rootAliasUsed: string | null;
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
    const abortCtl = new AbortController();
    const abortTimer = setTimeout(() => abortCtl.abort(), PER_REQUEST_BUDGET_MS);
    try {
      markRequestSent(
        Math.round((args.systemPrompt.length + userJson.length) / 4),
        EXTRACTOR_MODEL,
      );
      const reqStart = Date.now();
      const res = await fetch(OPENAI_URL, {
        method: "POST",
        signal: abortCtl.signal,
        headers: {
          Authorization: `Bearer ${args.openAIKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: EXTRACTOR_MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          max_tokens: LLM_MAX_TOKENS,
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
      if (!content || typeof content !== "string") {
        return {
          rows: [],
          rawResponseText: null,
          parsedJson: null,
          topLevelKeys: [],
          parseError: "empty_response_content",
          schemaError: null,
          emptyReason: "empty_response_content",
          salvaged: false,
          rootAliasUsed: null,
        };
      }
      const rawResponseText = content.slice(0, MAX_RAW_RESPONSE_PERSIST);
      const stripped = stripJsonFences(content);
      let parsed: unknown = null;
      let parseError: string | null = null;
      try {
        parsed = JSON.parse(stripped);
      } catch (parseErr) {
        parseError = (parseErr as Error)?.message ?? "json_parse_failed";
      }

      if (parsed != null) {
        const topLevelKeys =
          typeof parsed === "object" && !Array.isArray(parsed)
            ? Object.keys(parsed as Record<string, unknown>)
            : Array.isArray(parsed) ? ["<root_array>"] : [];
        const picked = pickRowsArray(parsed);
        if (picked.rows != null) {
          return {
            rows: picked.rows,
            rawResponseText,
            parsedJson: parsed,
            topLevelKeys,
            parseError: null,
            schemaError: null,
            emptyReason: picked.rows.length === 0 ? "empty_array" : null,
            salvaged: false,
            rootAliasUsed: picked.alias,
          };
        }
        console.warn(
          `[extractor:${args.trade}] chunk ${args.chunkIndex} no_items_key — top_level=${JSON.stringify(topLevelKeys)}`,
        );
        return {
          rows: [],
          rawResponseText,
          parsedJson: parsed,
          topLevelKeys,
          parseError: null,
          schemaError: "no_items_key",
          emptyReason: "no_items_key",
          salvaged: false,
          rootAliasUsed: null,
        };
      }

      // JSON.parse failed — try regex salvage
      const salvaged = salvageJsonRows(content);
      if (salvaged.length > 0) {
        console.warn(
          `[extractor:${args.trade}] chunk ${args.chunkIndex} JSON parse failed — salvaged ${salvaged.length} rows via regex`,
        );
        return {
          rows: salvaged,
          rawResponseText,
          parsedJson: null,
          topLevelKeys: [],
          parseError,
          schemaError: null,
          emptyReason: null,
          salvaged: true,
          rootAliasUsed: "salvage",
        };
      }
      return {
        rows: [],
        rawResponseText,
        parsedJson: null,
        topLevelKeys: [],
        parseError,
        schemaError: null,
        emptyReason: "parse_failed",
        salvaged: false,
        rootAliasUsed: null,
      };
    } catch (err) {
      lastErr = err;
      const isAbort = (err as Error)?.name === "AbortError";
      if (isAbort) {
        console.warn(
          `[extractor:${args.trade}] chunk ${args.chunkIndex} attempt ${attempt} aborted after ${PER_REQUEST_BUDGET_MS}ms`,
        );
        break;
      }
      const backoff = 300 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
    } finally {
      clearTimeout(abortTimer);
    }
  }
  console.error(
    `[extractor:${args.trade}] chunk ${args.chunkIndex} failed after ${MAX_RETRIES} attempts`,
    lastErr,
  );
  return null;
}

function stripJsonFences(s: string): string {
  let out = s.trim();
  out = out.replace(/^```(?:json|JSON)?\s*\n?/i, "");
  out = out.replace(/\n?```\s*$/i, "");
  return out.trim();
}

const ROOT_ALIASES = [
  "items",
  "line_items",
  "lineItems",
  "rows",
  "quote_items",
  "quoteItems",
  "data",
  "entries",
  "results",
];

function pickRowsArray(
  parsed: unknown,
): { rows: unknown[] | null; alias: string | null } {
  if (parsed == null) return { rows: null, alias: null };
  if (Array.isArray(parsed)) return { rows: parsed, alias: "<root_array>" };
  if (typeof parsed !== "object") return { rows: null, alias: null };
  const obj = parsed as Record<string, unknown>;
  for (const alias of ROOT_ALIASES) {
    const v = obj[alias];
    if (Array.isArray(v)) return { rows: v, alias };
  }
  // Look one level deeper for common wrapper shapes
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      const inner = v as Record<string, unknown>;
      for (const alias of ROOT_ALIASES) {
        const iv = inner[alias];
        if (Array.isArray(iv)) return { rows: iv, alias: `${k}.${alias}` };
      }
    }
  }
  return { rows: null, alias: null };
}

/** Recover row-like `{...}` objects from free-text when JSON.parse fails. */
function salvageJsonRows(raw: string): unknown[] {
  const out: unknown[] = [];
  const stripped = stripJsonFences(raw);
  const re = /\{[^{}]*?"(?:description|desc|name)"\s*:\s*"[^"]*"[^{}]*\}/gs;
  const matches = stripped.match(re);
  if (!matches) return out;
  for (const m of matches) {
    try {
      const obj = JSON.parse(m);
      if (obj && typeof obj === "object") out.push(obj);
    } catch {
      // ignore — best-effort salvage
    }
  }
  return out;
}

/**
 * Map a raw LLM row into our canonical line-item shape. Tolerates field
 * aliases (desc/description, qty/quantity, rate/unit_price, total/total_price/amount).
 * Returns `null` if the row does not meet the minimum threshold:
 *   - non-empty description
 *   - AND at least one of (quantity, unit_price, total_price) is numeric
 */
export function normaliseRow(
  r: Record<string, unknown>,
  trade: string,
): ParsedLineItemV2 | null {
  const description = String(r.description ?? r.desc ?? r.name ?? "").trim();
  const quantity = toNumberOrNull(r.quantity ?? r.qty ?? r.qnty);
  const unit_price = toNumberOrNull(r.unit_price ?? r.rate ?? r.unitRate ?? r.unit_rate);
  const total_price = toNumberOrNull(
    r.total_price ?? r.total ?? r.amount ?? r.line_total ?? r.lineTotal,
  );

  if (!description) return null;
  if (quantity == null && unit_price == null && total_price == null) return null;

  return {
    item_number:
      r.item_number == null && r.itemNumber == null && r.line_id == null
        ? null
        : String(r.item_number ?? r.itemNumber ?? r.line_id),
    description,
    quantity,
    unit: r.unit == null && r.uom == null ? null : String(r.unit ?? r.uom),
    unit_price,
    total_price,
    scope_category: normaliseScope(r.scope_category ?? r.scope ?? r.category),
    trade: String(r.trade ?? trade),
    sub_scope:
      r.sub_scope == null && r.subScope == null
        ? null
        : String(r.sub_scope ?? r.subScope),
    frr: r.frr == null ? null : String(r.frr),
    source: "llm",
    confidence: clamp01(Number(r.confidence ?? 0.6)),
  };
}

/**
 * Relaxed variant of normaliseRow for trades where description-only lump sums
 * (labour, preliminaries, prep, freight, P&G, margin, QA/PS3) are legitimate.
 *
 * Acceptance criteria — description + ANY of:
 *   - numeric quantity OR unit_price OR total_price
 *   - product code pattern (alphanum with digits, e.g. "CP 606", "FS-ONE MAX")
 *   - currency-inline in description (e.g. "Supply & install fire collars — $4,250")
 *   - description length >= 6 chars (lump-sum textual line)
 */
const PRODUCT_CODE_RE = /\b[A-Z]{2,}[\s\-]?\d{1,5}[A-Z]?\b|\b\d{2,}[A-Z]{2,}\b/;
const CURRENCY_INLINE_RE = /(?:\$|NZD|AUD|USD|£|€)\s?\d[\d,]*(?:\.\d+)?/i;

export function normaliseRowLoose(
  r: Record<string, unknown>,
  trade: string,
): ParsedLineItemV2 | null {
  const description = String(r.description ?? r.desc ?? r.name ?? r.item ?? "").trim();
  const quantity = toNumberOrNull(r.quantity ?? r.qty ?? r.qnty);
  const unit_price = toNumberOrNull(r.unit_price ?? r.rate ?? r.unitRate ?? r.unit_rate);
  const total_price = toNumberOrNull(
    r.total_price ?? r.total ?? r.amount ?? r.line_total ?? r.lineTotal ?? r.price,
  );

  if (!description) return null;

  const hasNumeric = quantity != null || unit_price != null || total_price != null;
  const hasProductCode = PRODUCT_CODE_RE.test(description);
  const hasInlineCurrency = CURRENCY_INLINE_RE.test(description);
  const isLongEnough = description.length >= 6;

  if (!hasNumeric && !hasProductCode && !hasInlineCurrency && !isLongEnough) {
    return null;
  }

  return {
    item_number:
      r.item_number == null && r.itemNumber == null && r.line_id == null
        ? null
        : String(r.item_number ?? r.itemNumber ?? r.line_id),
    description,
    quantity,
    unit: r.unit == null && r.uom == null ? null : String(r.unit ?? r.uom),
    unit_price,
    total_price,
    scope_category: normaliseScope(r.scope_category ?? r.scope ?? r.category),
    trade: String(r.trade ?? trade),
    sub_scope:
      r.sub_scope == null && r.subScope == null
        ? null
        : String(r.sub_scope ?? r.subScope),
    frr: r.frr == null ? null : String(r.frr),
    source: "llm",
    confidence: clamp01(Number(r.confidence ?? 0.55)),
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
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s()]/g, ""));
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
    if (winner && typeof winner === "object" && (winner as { __timeout?: boolean }).__timeout) {
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
  const bannerPreamble = buildBannerPreamble(pages);
  const chunks: Chunk[] = [];
  let buffer = "";
  let firstPage = pages[0].pageNum;
  let lastPage = pages[0].pageNum;

  const flush = () => {
    if (!buffer.trim()) return;
    const text = bannerPreamble ? `${bannerPreamble}\n\n${buffer}` : buffer;
    chunks.push({ text, pageRange: `p${firstPage}-p${lastPage}` });
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

function buildBannerPreamble(pages: { pageNum: number; text: string }[]): string {
  type BannerHit = { page: number; role: "main" | "optional"; banner: string };
  const optionalPatterns: RegExp[] = [
    /not\s+shown\s+on\s+drawings/i,
    /items?\s+with\s+confirmation/i,
    /optional\s+scope/i,
    /optional\s+items?/i,
    /optional\s+extras?/i,
    /add[\s-]?to[\s-]?scope/i,
    /add[\s-]?ons?/i,
    /provisional\s+(scope|sum|breakdown)/i,
    /extra\s+over\b/i,
    /tbc\s+breakdown/i,
    /alternat(e|ive)\s+scope/i,
  ];
  const mainPatterns: RegExp[] = [
    /items?\s+identified\s+on\s+drawings/i,
    /identified\s+on\s+drawings/i,
    /\bon\s+drawings\b/i,
    /main\s+scope(\s+breakdown)?/i,
    /included\s+scope(\s+breakdown)?/i,
    /base\s+scope/i,
    /scope\s+breakdown/i,
    /scope\s+of\s+works/i,
    /quote\s+breakdown/i,
  ];

  const hits: BannerHit[] = [];
  for (const p of pages) {
    const head = p.text.slice(0, 600);
    let isOptional = false;
    let matched: string | null = null;
    for (const re of optionalPatterns) {
      const m = head.match(re);
      if (m) { isOptional = true; matched = m[0]; break; }
    }
    if (!matched) {
      for (const re of mainPatterns) {
        const m = head.match(re);
        if (m) { matched = m[0]; break; }
      }
    }
    if (matched) {
      hits.push({
        page: p.pageNum,
        role: isOptional ? "optional" : "main",
        banner: matched.replace(/\s+/g, " ").trim().slice(0, 80),
      });
    }
  }
  if (hits.length === 0) return "";

  const lines: string[] = [];
  lines.push("[BANNER MAP — DETERMINISTIC, USE THIS FOR scope_category]");
  lines.push("Each entry is the page where a scope banner was detected. The banner applies from that page until the next entry. Use this to set scope_category for every row.");
  for (const h of hits) {
    lines.push(`  page ${h.page}: role=${h.role}  banner="${h.banner}"`);
  }
  lines.push("Rules:");
  lines.push(" 1. For every extracted row, find the most recent BANNER MAP entry whose page <= row.source_page.");
  lines.push(" 2. If that entry's role = main, scope_category MUST be \"main\".");
  lines.push(" 3. If that entry's role = optional, scope_category MUST be \"optional\".");
  lines.push(" 4. If a row's source_page is BEFORE the first banner entry, default scope_category = main.");
  lines.push(" 5. The banner map OVERRIDES in-table sub-headers like \"Electrical Penetrations\" / \"Hydraulic Penetrations\" for SCOPE classification.");
  return lines.join("\n");
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
    (it as { source_page?: number }).source_page ?? "",
    (it as { parent_section?: string }).parent_section ?? "",
  ].join("|");
}
