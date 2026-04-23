/**
 * selectPassiveFireAuthoritativeTotal — LLM-driven selector that picks the
 * single authoritative "main scope" total excl GST for a passive fire quote.
 *
 * Runs AFTER the structure analyst and line-item extractor. Its input is
 * the financial map, the extracted items, and every candidate total
 * detected in the raw text. Output is used by totals reconciliation as
 * the anchoring figure so we never double-count summary + breakdown
 * pages, never pick a phone number as a total, and never replace a
 * master roll-up with a subordinate building/block total.
 */

import { PASSIVE_FIRE_TOTAL_SELECTOR_PROMPT } from "../prompts/passiveFireTotalSelectorPrompt.ts";
import { markLlmCallDuration, markRequestSent, markResponseReceived } from "../telemetrySink.ts";
import type { ParsedLineItemV2 } from "../runParserV2.ts";
import type { PassiveFireStructure } from "./classifyPassiveFireStructure.ts";

export type PassiveFireTotalRejection = {
  value: number | string;
  page: number | null;
  reason:
    | "footer_phone"
    | "optional_scope"
    | "duplicate_rollup"
    | "intermediate_subtotal"
    | "rate_card"
    | "metadata"
    | "implausible_outlier"
    | "other";
};

export type PassiveFireAuthoritativeTotal = {
  selected_main_total_ex_gst: number | null;
  selected_label: string | null;
  selected_page: number | null;
  optional_total_ex_gst: number | null;
  ps3_qa_total_ex_gst: number | null;
  selection_reason: string;
  rejected_candidates: PassiveFireTotalRejection[];
  confidence: number;
};

export type PassiveFireTotalCandidate = {
  value: number;
  label: string | null;
  page: number | null;
  context_snippet: string | null;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const SELECTOR_MODEL = "gpt-4.1";
const MAX_ITEMS_SENT = 120;
const MAX_SNIPPET_CHARS = 220;

export async function selectPassiveFireAuthoritativeTotal(ctx: {
  structure: PassiveFireStructure | null;
  items: ParsedLineItemV2[];
  rawText: string;
  pages: { pageNum: number; text: string }[];
  supplier: string;
  openAIKey: string;
}): Promise<PassiveFireAuthoritativeTotal> {
  const candidates = extractCandidateTotals(ctx.rawText, ctx.pages);

  const payload = {
    supplier: ctx.supplier,
    financial_map: ctx.structure,
    line_items_summary: summariseItems(ctx.items),
    candidate_totals: candidates,
  };

  const userJson = JSON.stringify(payload);
  markRequestSent(
    Math.round((PASSIVE_FIRE_TOTAL_SELECTOR_PROMPT.length + userJson.length) / 4),
    SELECTOR_MODEL,
  );
  const reqStart = Date.now();
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.openAIKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SELECTOR_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PASSIVE_FIRE_TOTAL_SELECTOR_PROMPT },
        { role: "user", content: userJson },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `selectPassiveFireAuthoritativeTotal HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  const json = await res.json();
  markLlmCallDuration(Date.now() - reqStart, SELECTOR_MODEL);
  markResponseReceived(json?.usage);
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("selectPassiveFireAuthoritativeTotal empty response");

  return normaliseResult(JSON.parse(content) as Record<string, unknown>);
}

function summariseItems(items: ParsedLineItemV2[]) {
  const main = items.filter((i) => i.scope_category === "main");
  const optional = items.filter((i) => i.scope_category === "optional");
  const excluded = items.filter((i) => i.scope_category === "excluded");
  const sum = (xs: ParsedLineItemV2[]) =>
    xs.reduce((acc, it) => acc + (it.total_price ?? 0), 0);
  return {
    item_count: items.length,
    main_count: main.length,
    optional_count: optional.length,
    excluded_count: excluded.length,
    main_total_sum: round2(sum(main)),
    optional_total_sum: round2(sum(optional)),
    excluded_total_sum: round2(sum(excluded)),
    sample: items.slice(0, MAX_ITEMS_SENT).map((it) => ({
      description: it.description.slice(0, 120),
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price,
      total_price: it.total_price,
      scope_category: it.scope_category,
      sub_scope: it.sub_scope,
      frr: it.frr,
    })),
  };
}

const MONEY_RE =
  /(?:NZ?\$|AUD?\$|\$)\s?([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/g;
const PLAIN_NUMBER_RE = /\b([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)\b/g;
const TOTAL_LABEL_RE =
  /(grand\s+total|total\s+(?:excl|incl|ex|inc|excluding|including)[^\n]{0,30}(?:gst|g\.s\.t)?|total\s+estimate[^\n]{0,80}|quote\s+summary\s+total|sub[-\s]?total|subtotal|master\s+total|building\s+total|block\s+total|basement\s+total|ps3\s*(?:&|and)?\s*qa|qa\s*(?:&|and)?\s*ps3|optional\s+scope\s+total|add\s+to\s+scope|extra\s+over)/i;

function extractCandidateTotals(
  rawText: string,
  pages: { pageNum: number; text: string }[],
): PassiveFireTotalCandidate[] {
  const out: PassiveFireTotalCandidate[] = [];
  const source: { page: number | null; text: string }[] =
    pages && pages.length > 0
      ? pages.map((p) => ({ page: p.pageNum, text: p.text }))
      : [{ page: null, text: rawText }];

  for (const { page, text } of source) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!TOTAL_LABEL_RE.test(line)) continue;

      const snippet = [
        lines[i - 1] ?? "",
        line,
        lines[i + 1] ?? "",
      ]
        .join(" | ")
        .slice(0, MAX_SNIPPET_CHARS);

      const found = new Set<string>();
      let m: RegExpExecArray | null;
      const moneyRe = new RegExp(MONEY_RE.source, "g");
      while ((m = moneyRe.exec(snippet)) !== null) found.add(m[1]);
      if (found.size === 0) {
        const plainRe = new RegExp(PLAIN_NUMBER_RE.source, "g");
        while ((m = plainRe.exec(snippet)) !== null) found.add(m[1]);
      }
      for (const raw of found) {
        const value = Number(raw.replace(/,/g, ""));
        if (!Number.isFinite(value) || value < 100 || value > 50_000_000) continue;
        out.push({
          value,
          label: line.trim().slice(0, 160),
          page,
          context_snippet: snippet,
        });
        if (out.length >= 60) return out;
      }
    }
  }
  return out;
}

function normaliseResult(raw: Record<string, unknown>): PassiveFireAuthoritativeTotal {
  return {
    selected_main_total_ex_gst: toNumberOrNull(raw.selected_main_total_ex_gst),
    selected_label: toStringOrNull(raw.selected_label),
    selected_page: toNumberOrNull(raw.selected_page),
    optional_total_ex_gst: toNumberOrNull(raw.optional_total_ex_gst),
    ps3_qa_total_ex_gst: toNumberOrNull(raw.ps3_qa_total_ex_gst),
    selection_reason: String(raw.selection_reason ?? ""),
    rejected_candidates: Array.isArray(raw.rejected_candidates)
      ? (raw.rejected_candidates as unknown[]).map(normaliseRejection)
      : [],
    confidence: clamp01(Number(raw.confidence ?? 0)),
  };
}

function normaliseRejection(v: unknown): PassiveFireTotalRejection {
  const r = (v ?? {}) as Record<string, unknown>;
  const reasonRaw = String(r.reason ?? "other").toLowerCase();
  const allowed: PassiveFireTotalRejection["reason"][] = [
    "footer_phone",
    "optional_scope",
    "duplicate_rollup",
    "intermediate_subtotal",
    "rate_card",
    "metadata",
    "implausible_outlier",
    "other",
  ];
  const rawValue = r.value;
  const value =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? rawValue
        : String(rawValue ?? "");
  return {
    value,
    page: toNumberOrNull(r.page),
    reason: (allowed as string[]).includes(reasonRaw)
      ? (reasonRaw as PassiveFireTotalRejection["reason"])
      : "other",
  };
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
