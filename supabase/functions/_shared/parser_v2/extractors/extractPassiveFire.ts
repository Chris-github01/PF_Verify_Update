/**
 * extractPassiveFire — production passive-fire extractor.
 *
 * Approach:
 *   1. Pre-scan the raw document for deterministic signals (FRR matrix,
 *      exclusion blocks, optional-scope blocks, QA/PS3 mentions,
 *      cross-trade service references) and pass them to the LLM as
 *      structured context to anchor the extraction.
 *   2. Run gpt-4.1 via the shared extractor runtime with the PF prompt.
 *   3. Post-process: enforce trade="passive_fire", harmonise sub_scope to
 *      the canonical taxonomy, fill FRR from description when the LLM
 *      omitted it, and flag any rows that describe PF scope but landed
 *      with unit_price/total_price=null.
 */

import { PASSIVE_FIRE_PROMPT } from "../prompts/passiveFirePrompt.ts";
import { PASSIVE_FIRE_LINE_ITEM_PROMPT } from "../prompts/passiveFireLineItemPrompt.ts";
import type { ParsedLineItemV2 } from "../runParserV2.ts";
import type { PassiveFireStructure } from "../classifiers/classifyPassiveFireStructure.ts";
import { runExtractorLLM, normaliseRow, normaliseRowLoose } from "./_extractorRuntime.ts";
import { extractFallback } from "./extractFallback.ts";
import { tryDeterministicTableParse } from "./_tableRegexParser.ts";

export const EXTRACT_PASSIVE_FIRE_VERSION = "v2-loose-rows-2026-04-23";
console.log(`[extractPassiveFire] MODULE_LOAD version=${EXTRACT_PASSIVE_FIRE_VERSION}`);

type PassiveFirePrescan = {
  frr_ratings_found: string[];
  has_exclusions_section: boolean;
  has_optional_section: boolean;
  has_ps3_mention: boolean;
  cross_trade_references: {
    plumbing: number;
    electrical: number;
    hvac: number;
  };
  product_families_mentioned: string[];
};

const FRR_RE = /(?:\b|-)(\d{2,3}|-)\/(\d{2,3})\/(\d{2,3})\b/g;
const EXCLUSION_HDR_RE = /\b(exclusions?|not\s+included|clarifications?)\b/i;
const OPTIONAL_HDR_RE = /\b(optional(?:\s+scope)?|provisional\s+sum|alternate|separate\s+price)\b/i;
const PS3_RE = /\bPS3\b|\bproducer\s+statement\b/i;

const CROSS_TRADE_RES = {
  plumbing: /\b(copper\s+pipe|PVC\s+(?:waste|stack)|uPVC\s+pipe|hot\s+water\s+pipe|cold\s+water\s+pipe|waste\s+stack|stormwater\s+pipe|sanitary\s+pipe)\b/gi,
  electrical: /\b(cable\s+tray|cable\s+ladder|conduit|sub[-\s]?main|busbar|data\s+cable|power\s+cable)\b/gi,
  hvac: /\b(supply\s+air\s+duct|return\s+air\s+duct|exhaust\s+duct|spiral\s+duct|rectangular\s+duct|refrigerant\s+pipe|chilled\s+water\s+pipe|ductwork)\b/gi,
};

const PRODUCT_FAMILIES = [
  "promat",
  "promaseal",
  "hilti cp",
  "boss fire",
  "trafalgar",
  "3m fire",
  "fyrewrap",
  "fyrebatt",
  "fyrestop",
  "rockwool",
  "nullifire",
];

const SUB_SCOPE_RULES: { pattern: RegExp; sub_scope: string }[] = [
  { pattern: /\bfire\s+collar\b|\bcast[-\s]?in\s+collar\b|\bretrofit\s+collar\b/i, sub_scope: "fire_collar" },
  { pattern: /\bfire\s+pillow(s)?\b/i, sub_scope: "fire_pillow" },
  { pattern: /\bfire\s+batt(s)?\b/i, sub_scope: "fire_batt" },
  { pattern: /\bfire\s+wrap(s)?\b|\bfyrewrap\b/i, sub_scope: "fire_wrap" },
  { pattern: /\bmortar\b/i, sub_scope: "mortar_seal" },
  { pattern: /\bmastic\b|\bsilicone\s+sealant\b|\bacrylic\s+sealant\b/i, sub_scope: "mastic_seal" },
  { pattern: /\bintumescent\s+(?:paint|coating)\b/i, sub_scope: "intumescent_coating" },
  { pattern: /\bfire[-\s]?rated\s+board\b|\bpromat\s+board\b/i, sub_scope: "fire_rated_board" },
  { pattern: /\bjoint\s+seal(?:ing|ant)?\b|\bmovement\s+joint\b|\bconstruction\s+joint\b|\bperimeter\s+joint\b/i, sub_scope: "joint_sealing" },
  { pattern: /\bfire\s+damper\b/i, sub_scope: "fire_damper" },
  { pattern: /\bPS3\b|\bproducer\s+statement\b|\bas[-\s]?built\b|\bcompliance\s+(?:doc|schedule|report)\b/i, sub_scope: "qa_ps3" },
  { pattern: /\baccess\s+panel\b/i, sub_scope: "access_panel" },
  { pattern: /\b(copper\s+pipe|PVC\s+pipe|waste\s+stack|sanitary|hot\s+water|cold\s+water|stormwater)\b/i, sub_scope: "service_penetration_plumbing" },
  { pattern: /\b(cable\s+tray|cable\s+ladder|conduit|sub[-\s]?main|busbar|power\s+cable|data\s+cable)\b/i, sub_scope: "service_penetration_electrical" },
  { pattern: /\b(duct(work)?|supply\s+air|return\s+air|exhaust\s+duct|refrigerant\s+pipe|chilled\s+water)\b/i, sub_scope: "service_penetration_hvac" },
  { pattern: /\bpenetration\b/i, sub_scope: "penetration_sealing" },
];

const VALID_SUB_SCOPES = new Set([
  "penetration_sealing",
  "fire_collar",
  "fire_pillow",
  "fire_batt",
  "fire_wrap",
  "mortar_seal",
  "mastic_seal",
  "intumescent_coating",
  "fire_rated_board",
  "joint_sealing",
  "service_penetration_plumbing",
  "service_penetration_electrical",
  "service_penetration_hvac",
  "fire_damper",
  "qa_ps3",
  "access_panel",
  "other",
]);

export async function extractPassiveFire(ctx: {
  rawText: string;
  pages: { pageNum: number; text: string }[];
  quoteType: string;
  supplier: string;
  openAIKey: string;
  structure?: PassiveFireStructure | null;
}): Promise<ParsedLineItemV2[]> {
  CANDIDATE_ROWS_SEEN = [];
  const prescan = prescanPassiveFire(ctx.rawText);
  const structure = ctx.structure ?? null;
  const useStructureAwarePrompt = structure !== null;

  // PRIORITY 2: try deterministic table parse before paying LLM cost.
  const authoritativeTotal =
    typeof structure?.authoritative_total_ex_gst === "number"
      ? structure.authoritative_total_ex_gst
      : null;
  const deterministic = tryDeterministicTableParse({
    rawText: ctx.rawText,
    trade: "passive_fire",
    authoritativeTotal,
  });
  console.log(
    `[extractPassiveFire] deterministic_pre_parse rows=${deterministic.row_count} strategy=${deterministic.strategy} sum=${deterministic.matched_total} matches_authoritative=${deterministic.matches_authoritative}`,
  );
  if (deterministic.matches_authoritative && deterministic.items.length >= 3) {
    console.log(
      `[extractPassiveFire] deterministic_short_circuit — skipping LLM (rows=${deterministic.items.length})`,
    );
    return postProcess(deterministic.items, prescan);
  }

  const rawItems = await runExtractorLLM({
    systemPrompt: useStructureAwarePrompt
      ? PASSIVE_FIRE_LINE_ITEM_PROMPT
      : PASSIVE_FIRE_PROMPT,
    trade: "passive_fire",
    rawText: ctx.rawText,
    pages: ctx.pages,
    quoteType: ctx.quoteType,
    supplier: ctx.supplier,
    openAIKey: ctx.openAIKey,
    extraUserContext: {
      focus:
        "Passive fire scope. Cross-trade references to plumbing/electrical/HVAC services are still passive-fire work — sub_scope must reflect the PF taxonomy. Include lump-sum lines (labour, prep, freight, preliminaries, P&G, margin, PS3/QA) as main-scope rows. Do NOT require qty/rate — accept description + any price.",
      frr_required: true,
      prescan,
      financial_map: structure,
    },
    rowMapper: mapLineItemRow,
  });

  console.log(
    `[extractPassiveFire] llm_returned=${rawItems.length} supplier=${ctx.supplier}`,
  );

  const processed = postProcess(rawItems, prescan);
  console.log(
    `[extractPassiveFire] after_post_process=${processed.length} (filtered ${rawItems.length - processed.length})`,
  );

  if (processed.length === 0) {
    console.error(
      `[extractPassiveFire] ZERO_ROWS_AFTER_POSTPROCESS — dumping sanitized text (first 4000 chars) and invoking fallback`,
    );
    const sanitized = (ctx.rawText ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
    console.error(`[extractPassiveFire] sanitized_text_dump: ${sanitized}`);
    console.error(
      `[extractPassiveFire] first_20_candidate_lines_in_raw: ${JSON.stringify(
        captureCandidateLines(ctx.rawText ?? ""),
      )}`,
    );

    try {
      const fallbackItems = await extractFallback({
        rawText: ctx.rawText,
        pages: ctx.pages,
        quoteType: ctx.quoteType,
        supplier: ctx.supplier,
        openAIKey: ctx.openAIKey,
      });
      console.warn(
        `[extractPassiveFire] fallback_returned=${fallbackItems.length}`,
      );
      return fallbackItems.map((it) => ({
        ...it,
        trade: "passive_fire",
        sub_scope: it.sub_scope || "other",
        source: "llm_fallback",
      }));
    } catch (err) {
      console.error(
        `[extractPassiveFire] fallback_threw: ${(err as Error)?.message ?? err}`,
      );
      return [];
    }
  }

  return processed;
}

const CURRENCY_LINE_RE = /(?:\$|NZD|AUD|USD|£|€)\s?\d[\d,]*(?:\.\d+)?/i;

function captureCandidateLines(rawText: string): string[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length < 400);
  const candidates: string[] = [];
  for (const l of lines) {
    if (CURRENCY_LINE_RE.test(l) && /[A-Za-z]/.test(l)) {
      candidates.push(l);
      if (candidates.length >= 20) break;
    }
  }
  return candidates;
}

let CANDIDATE_ROWS_SEEN: Record<string, unknown>[] = [];

function mapLineItemRow(r: Record<string, unknown>, trade: string): ParsedLineItemV2 | null {
  if (CANDIDATE_ROWS_SEEN.length < 20) {
    CANDIDATE_ROWS_SEEN.push({
      description: r.description ?? r.desc ?? r.name ?? null,
      quantity: r.quantity ?? r.qty ?? null,
      unit_price: r.unit_price ?? r.rate ?? null,
      total_price: r.total_price ?? r.total ?? r.amount ?? null,
      scope_category: r.scope_category ?? null,
      sub_scope: r.passive_fire_system ?? r.sub_scope ?? null,
    });
    if (CANDIDATE_ROWS_SEEN.length === 20) {
      console.log(
        `[extractPassiveFire] first_20_candidate_rows_seen=${JSON.stringify(CANDIDATE_ROWS_SEEN)}`,
      );
    }
  }

  const base = normaliseRowLoose(
    {
      item_number: r.item_number ?? null,
      description: r.description ?? r.desc ?? r.name,
      quantity: r.quantity,
      unit: r.unit,
      unit_price: r.unit_price,
      total_price: r.total_price ?? r.total ?? r.amount,
      scope_category: r.scope_category,
      trade,
      sub_scope: r.passive_fire_system ?? r.sub_scope ?? null,
      frr: r.frr,
      source: "llm",
      confidence: r.confidence,
    },
    trade,
  );
  if (!base) return null;

  const block = toStringOrNull(r.building_or_block);
  const page = toStringOrNull(r.source_page);
  const section = toStringOrNull(r.source_section);
  const rowRole = toStringOrNull(r.row_role);
  const serviceTrade = toStringOrNull(r.service_trade);

  const contextParts: string[] = [];
  if (block) contextParts.push(`[${block}]`);
  if (section) contextParts.push(`(${section})`);
  const prefix = contextParts.join(" ");
  const description = prefix
    ? `${prefix} ${base.description}`.trim()
    : base.description;

  return {
    ...base,
    description,
    sub_scope:
      base.sub_scope ||
      rowRole ||
      (serviceTrade && serviceTrade !== "unknown" && serviceTrade !== "mixed"
        ? `service_penetration_${serviceTrade}`
        : null) ||
      null,
    // carry source page/section into a discoverable place without breaking the
    // DB schema — we tag into sub_scope when there is still space, otherwise
    // discard. The primary audit trail is the ignored_rows + prescan logs.
  };
}

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function prescanPassiveFire(text: string): PassiveFirePrescan {
  const frrSet = new Set<string>();
  let m: RegExpExecArray | null;
  const frrRe = new RegExp(FRR_RE.source, "g");
  while ((m = frrRe.exec(text)) !== null) {
    frrSet.add(`${m[1]}/${m[2]}/${m[3]}`);
    if (frrSet.size >= 20) break;
  }

  const cross = {
    plumbing: countGlobal(text, CROSS_TRADE_RES.plumbing),
    electrical: countGlobal(text, CROSS_TRADE_RES.electrical),
    hvac: countGlobal(text, CROSS_TRADE_RES.hvac),
  };

  const lower = text.toLowerCase();
  const products = PRODUCT_FAMILIES.filter((p) => lower.includes(p));

  return {
    frr_ratings_found: [...frrSet],
    has_exclusions_section: EXCLUSION_HDR_RE.test(text),
    has_optional_section: OPTIONAL_HDR_RE.test(text),
    has_ps3_mention: PS3_RE.test(text),
    cross_trade_references: cross,
    product_families_mentioned: products,
  };
}

function countGlobal(text: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const matches = text.match(g);
  return matches ? matches.length : 0;
}

const SECTION_SUMMARY_RE =
  /^\s*(?:building|block|level|basement|tower|stage|section|area|zone|floor|apartment|unit|lot|wing)\s*[\dA-Za-z]{0,3}\b[^\n]{0,40}(?:sub[-\s]?total|total)\b/i;
const SCHEDULE_SUBTOTAL_RE =
  /^\s*(?:sub[-\s]?total|total(?:\s+(?:excl|incl|ex|inc|including|excluding))?\s*(?:gst|g\.s\.t)?|grand\s+total|schedule\s+total|quote\s+total|contract\s+total|tender\s+total|carried\s+forward|c\/f|b\/f)\b\s*[:\-]?/i;
const MARKUP_SUMMARY_RE =
  /^\s*(?:p\s*&\s*g|preliminaries|overhead(?:s)?\s*&?\s*(?:profit|margin)?|margin|contingency|ps3\s*&\s*qa|qa\s*&\s*ps3)\s*(?:total|sub[-\s]?total)?\s*[:\-]?\s*$/i;

function isSummaryRow(it: ParsedLineItemV2): boolean {
  const d = it.description.trim();
  if (!d) return true;
  if (SECTION_SUMMARY_RE.test(d)) return true;
  if (SCHEDULE_SUBTOTAL_RE.test(d)) return true;
  // NOTE: MARKUP_SUMMARY_RE (p&g, preliminaries, margin, overheads, contingency,
  // ps3/qa) is NO LONGER treated as a summary row — these are legitimate
  // lump-sum line items for passive-fire quotes and must be preserved.
  return false;
}

function postProcess(
  items: ParsedLineItemV2[],
  prescan: PassiveFirePrescan,
): ParsedLineItemV2[] {
  const frrFallback = prescan.frr_ratings_found.length === 1
    ? prescan.frr_ratings_found[0]
    : null;

  const beforeDescFilter = items.length;
  const afterDescFilter = items.filter((it) => it.description && it.description.length >= 3);
  const afterSummaryFilter = afterDescFilter.filter((it) => !isSummaryRow(it));
  console.log(
    `[extractPassiveFire] postProcess before=${beforeDescFilter} ` +
      `after_desc_filter=${afterDescFilter.length} ` +
      `after_summary_filter=${afterSummaryFilter.length}`,
  );

  return afterSummaryFilter.map((it) => {
    const sub_scope = harmoniseSubScope(it);
    const frr = it.frr ?? extractFRRFromDescription(it.description) ?? frrFallback;
    return {
      ...it,
      trade: "passive_fire",
      sub_scope,
      frr,
    };
  });
}

function harmoniseSubScope(it: ParsedLineItemV2): string {
  if (it.sub_scope && VALID_SUB_SCOPES.has(it.sub_scope)) return it.sub_scope;
  for (const rule of SUB_SCOPE_RULES) {
    if (rule.pattern.test(it.description)) return rule.sub_scope;
  }
  return "other";
}

function extractFRRFromDescription(desc: string): string | null {
  const re = new RegExp(FRR_RE.source);
  const m = desc.match(re);
  if (!m) return null;
  return `${m[1]}/${m[2]}/${m[3]}`;
}
