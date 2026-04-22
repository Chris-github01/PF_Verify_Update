/**
 * classifyPassiveFireStructure — pre-extraction structural analyst for
 * passive fire quotes.
 *
 * Runs ONCE before the line-item extractor when trade=passive_fire.
 * It identifies which page/section carries the authoritative total, which
 * sections are optional/excluded/terms-only, and which numeric strings in
 * the document must be ignored (phone numbers, FRR codes, reference codes,
 * etc.). Downstream totals reconciliation uses the authoritative total as
 * the anchor so we do not double-count summary + breakdown pages.
 */

import { PASSIVE_FIRE_STRUCTURE_PROMPT } from "../prompts/passiveFireStructurePrompt.ts";

export type PassiveFireSectionRole =
  | "main_included"
  | "optional"
  | "excluded"
  | "rates_reference"
  | "terms"
  | "summary"
  | "breakdown"
  | "non_financial_metadata";

export type PassiveFireFinancialStructure =
  | "summary_plus_breakdown"
  | "building_rollup"
  | "block_rollup"
  | "schedule_only"
  | "other";

export type PassiveFireStructureSection = {
  page: number | null;
  section_name: string;
  section_role: PassiveFireSectionRole;
  rolled_into_master_total: boolean | null;
  section_total: number | null;
  notes: string;
};

export type PassiveFireNumericRedFlag = {
  value: string;
  reason: "phone" | "date" | "quote_number" | "frr" | "reference_code" | "page_number" | "other";
};

export type PassiveFireStructure = {
  trade: "passive_fire";
  quote_type: "itemized" | "lump_sum" | "hybrid" | "unknown";
  financial_structure: PassiveFireFinancialStructure;
  authoritative_total_ex_gst: number | null;
  authoritative_total_label: string | null;
  authoritative_total_page: number | null;
  main_scope_subtotal: number | null;
  optional_scope_total: number | null;
  ps3_qa_total: number | null;
  included_extra_over_total: number | null;
  sections: PassiveFireStructureSection[];
  numeric_red_flags: PassiveFireNumericRedFlag[];
  confidence: number;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const STRUCTURE_MODEL = "gpt-4.1";
const MAX_TEXT_BUDGET = 24000;

export async function classifyPassiveFireStructure(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  fileName: string;
  supplier: string;
  openAIKey: string;
}): Promise<PassiveFireStructure> {
  const payload = {
    supplier: ctx.supplier,
    file_name: ctx.fileName,
    pages: buildPageSummary(ctx.pages, ctx.rawText),
  };

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.openAIKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: STRUCTURE_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PASSIVE_FIRE_STRUCTURE_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`classifyPassiveFireStructure HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("classifyPassiveFireStructure empty response");

  const raw = JSON.parse(content) as Record<string, unknown>;
  return normaliseStructure(raw);
}

function buildPageSummary(
  pages: { pageNum: number; text: string }[],
  rawText: string,
): Array<{ page: number; text: string }> {
  if (!pages || pages.length === 0) {
    return [{ page: 1, text: rawText.slice(0, MAX_TEXT_BUDGET) }];
  }
  const perPageBudget = Math.floor(MAX_TEXT_BUDGET / Math.min(pages.length, 12));
  return pages.slice(0, 12).map((p) => ({
    page: p.pageNum,
    text: p.text.slice(0, perPageBudget),
  }));
}

function normaliseStructure(raw: Record<string, unknown>): PassiveFireStructure {
  return {
    trade: "passive_fire",
    quote_type: normaliseQuoteType(raw.quote_type),
    financial_structure: normaliseFinancialStructure(raw.financial_structure),
    authoritative_total_ex_gst: toNumberOrNull(raw.authoritative_total_ex_gst),
    authoritative_total_label: toStringOrNull(raw.authoritative_total_label),
    authoritative_total_page: toNumberOrNull(raw.authoritative_total_page),
    main_scope_subtotal: toNumberOrNull(raw.main_scope_subtotal),
    optional_scope_total: toNumberOrNull(raw.optional_scope_total),
    ps3_qa_total: toNumberOrNull(raw.ps3_qa_total),
    included_extra_over_total: toNumberOrNull(raw.included_extra_over_total),
    sections: Array.isArray(raw.sections)
      ? (raw.sections as unknown[]).map(normaliseSection)
      : [],
    numeric_red_flags: Array.isArray(raw.numeric_red_flags)
      ? (raw.numeric_red_flags as unknown[]).map(normaliseRedFlag)
      : [],
    confidence: clamp01(Number(raw.confidence ?? 0)),
  };
}

function normaliseSection(v: unknown): PassiveFireStructureSection {
  const r = (v ?? {}) as Record<string, unknown>;
  return {
    page: toNumberOrNull(r.page),
    section_name: String(r.section_name ?? "").trim(),
    section_role: normaliseSectionRole(r.section_role),
    rolled_into_master_total:
      typeof r.rolled_into_master_total === "boolean" ? r.rolled_into_master_total : null,
    section_total: toNumberOrNull(r.section_total),
    notes: String(r.notes ?? ""),
  };
}

function normaliseRedFlag(v: unknown): PassiveFireNumericRedFlag {
  const r = (v ?? {}) as Record<string, unknown>;
  const reason = String(r.reason ?? "other").toLowerCase();
  const allowed: PassiveFireNumericRedFlag["reason"][] = [
    "phone",
    "date",
    "quote_number",
    "frr",
    "reference_code",
    "page_number",
    "other",
  ];
  return {
    value: String(r.value ?? ""),
    reason: (allowed as string[]).includes(reason)
      ? (reason as PassiveFireNumericRedFlag["reason"])
      : "other",
  };
}

function normaliseQuoteType(v: unknown): PassiveFireStructure["quote_type"] {
  const s = String(v ?? "unknown").toLowerCase().replace(/[\s-]/g, "_");
  if (s === "itemized" || s === "itemised") return "itemized";
  if (s === "lump_sum" || s === "lumpsum") return "lump_sum";
  if (s === "hybrid") return "hybrid";
  return "unknown";
}

function normaliseFinancialStructure(v: unknown): PassiveFireFinancialStructure {
  const s = String(v ?? "other").toLowerCase();
  const allowed: PassiveFireFinancialStructure[] = [
    "summary_plus_breakdown",
    "building_rollup",
    "block_rollup",
    "schedule_only",
    "other",
  ];
  return (allowed as string[]).includes(s) ? (s as PassiveFireFinancialStructure) : "other";
}

function normaliseSectionRole(v: unknown): PassiveFireSectionRole {
  const s = String(v ?? "breakdown").toLowerCase();
  const allowed: PassiveFireSectionRole[] = [
    "main_included",
    "optional",
    "excluded",
    "rates_reference",
    "terms",
    "summary",
    "breakdown",
    "non_financial_metadata",
  ];
  return (allowed as string[]).includes(s) ? (s as PassiveFireSectionRole) : "breakdown";
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
