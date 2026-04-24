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

  const reconciled = reconcileWithStructure(processed, structure);
  console.log(
    `[extractPassiveFire] after_reconcile=${reconciled.length} reclassified=${reconciled.length - processed.length + (processed.length - reconciled.length)}`,
  );

  if (reconciled.length === 0) {
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

  return reconciled;
}

/**
 * Reconcile extracted rows against Prompt 2 (structure) totals. If the sum of
 * scope_category="main" rows materially overshoots structure.main_scope_subtotal
 * while structure.optional_scope_total is non-trivial and structure.confidence
 * is reasonable, reclassify the largest main rows whose source context looks
 * optional (sub_scope/description tokens) until the main total lands within
 * tolerance. Trade-agnostic in shape; tuned for PF overshoot caused by
 * missed section-header inheritance.
 */
function reconcileWithStructure(
  items: ParsedLineItemV2[],
  structure: PassiveFireStructure | null,
): ParsedLineItemV2[] {
  if (!structure) return items;

  const OPTIONAL_HEADER_RE =
    /\b(optional|add[-\s]?(?:to[-\s]?)?scope|add[-\s]?on|provisional|extra[-\s]?over|alternate|alternative|priced\s+separately|separate\s+price|price\s+on\s+application|if\s+accepted|if\s+required|tbc|client\s+to\s+confirm|architectural\s*\/?\s*structural\s+details?|flush\s+box(?:es)?)\b/i;

  const optionalSections = structure.sections
    .filter(
      (s) =>
        s.section_role === "optional" ||
        OPTIONAL_HEADER_RE.test(s.section_name ?? ""),
    )
    .map((s) => ({
      name: s.section_name.toLowerCase().trim(),
      tokens: tokenize(s.section_name),
    }))
    .filter((s) => s.tokens.length > 0);

  const optionalSectionFromStructure = optionalSections.length > 0;

  // PASS 1 — deterministic section-name match.
  // Any row whose source_section matches an optional Prompt 2 section gets
  // reclassified, regardless of overshoot magnitude.
  const pass1Idx = new Set<number>();
  if (optionalSectionFromStructure) {
    items.forEach((it, idx) => {
      if (it.scope_category !== "main") return;
      const rowSection = (it.source_section ?? "").toString();
      if (!rowSection) return;
      const rowTokens = tokenize(rowSection);
      if (rowTokens.length === 0) return;
      const matched = optionalSections.some((s) =>
        tokenOverlap(rowTokens, s.tokens) >= 0.5 ||
        rowSection.toLowerCase().includes(s.name) ||
        s.name.includes(rowSection.toLowerCase()),
      );
      if (matched) pass1Idx.add(idx);
    });
  }

  // PASS 2 — inline optional header keywords in source_section or description.
  // This catches cases where Prompt 2 missed the header but the LLM captured
  // it into source_section (or left a breadcrumb in the description).
  const pass2Idx = new Set<number>();
  items.forEach((it, idx) => {
    if (it.scope_category !== "main") return;
    if (pass1Idx.has(idx)) return;
    const section = (it.source_section ?? "").toString();
    if (section && OPTIONAL_HEADER_RE.test(section)) {
      pass2Idx.add(idx);
      return;
    }
  });

  // PASS 3 — overshoot-triggered token overlap against optional section
  // tokens on description (handles rows where source_section was lost).
  const pass3Idx = new Set<number>();
  const mainTarget = structure.main_scope_subtotal;
  const hasConfidence =
    Number.isFinite(structure.confidence) && structure.confidence >= 0.5;
  if (mainTarget != null && mainTarget > 0 && hasConfidence) {
    const sumMainAfter12 = items.reduce((acc, it, idx) => {
      if (it.scope_category !== "main") return acc;
      if (pass1Idx.has(idx) || pass2Idx.has(idx)) return acc;
      return acc + (it.total_price ?? 0);
    }, 0);
    const deviation = (sumMainAfter12 - mainTarget) / mainTarget;
    if (deviation > 0.2 && optionalSectionFromStructure) {
      const rows = items
        .map((it, idx) => ({ it, idx }))
        .filter(
          (r) =>
            r.it.scope_category === "main" &&
            !pass1Idx.has(r.idx) &&
            !pass2Idx.has(r.idx),
        )
        .sort((a, b) => (b.it.total_price ?? 0) - (a.it.total_price ?? 0));
      let remaining = sumMainAfter12 - mainTarget;
      for (const { it, idx } of rows) {
        if (remaining <= 0) break;
        const descTokens = tokenize(it.description ?? "");
        const subTokens = tokenize(it.sub_scope ?? "");
        const matched = optionalSections.some(
          (s) =>
            tokenOverlap(descTokens, s.tokens) >= 0.5 ||
            tokenOverlap(subTokens, s.tokens) >= 0.5,
        );
        if (!matched) continue;
        pass3Idx.add(idx);
        remaining -= it.total_price ?? 0;
      }
    }
  }

  // PASS 4 — page-range inheritance from Prompt 2. For each row, find the
  // section in structure.sections whose `page` is the closest page <= row
  // source_page. That section's section_role is the authoritative scope
  // for the row (ancestor-stack inheritance). This is trade-agnostic and
  // relies entirely on Prompt 2's structural analysis — no hardcoded
  // keywords on row descriptions, so it generalises to any quote.
  const pass4Idx = new Set<number>();
  const excludedByPage = new Set<number>();
  const pagedSections = [...structure.sections]
    .filter((s) => s.page != null && Number.isFinite(s.page))
    .sort((a, b) => (a.page as number) - (b.page as number));
  if (pagedSections.length > 0) {
    const roleForPage = (page: number | null | undefined) => {
      if (page == null || !Number.isFinite(page)) return null;
      let role: typeof pagedSections[number]["section_role"] | null = null;
      let name: string | null = null;
      for (const s of pagedSections) {
        if ((s.page as number) <= page) {
          role = s.section_role;
          name = s.section_name;
        } else break;
      }
      return role == null ? null : { role, name };
    };
    items.forEach((it, idx) => {
      if (it.scope_category !== "main") return;
      if (pass1Idx.has(idx) || pass2Idx.has(idx) || pass3Idx.has(idx)) return;
      const ctx = roleForPage(it.source_page ?? null);
      if (!ctx) return;
      if (ctx.role === "optional") pass4Idx.add(idx);
      else if (ctx.role === "excluded") excludedByPage.add(idx);
    });
  }

  const all = new Set<number>([
    ...pass1Idx,
    ...pass2Idx,
    ...pass3Idx,
    ...pass4Idx,
  ]);
  if (all.size === 0 && excludedByPage.size === 0) {
    console.log(
      `[extractPassiveFire] reconcile: no rows reclassified (optional_sections=${optionalSections.length}, paged_sections=${pagedSections.length})`,
    );
    return items;
  }

  const reclassifiedTotal = items.reduce(
    (acc, it, idx) => (all.has(idx) ? acc + (it.total_price ?? 0) : acc),
    0,
  );
  const excludedTotal = items.reduce(
    (acc, it, idx) =>
      excludedByPage.has(idx) ? acc + (it.total_price ?? 0) : acc,
    0,
  );
  console.warn(
    `[extractPassiveFire] reconcile: reclassified ${all.size} rows ` +
      `($${reclassifiedTotal.toFixed(2)}) main→optional, dropped ${excludedByPage.size} excluded ` +
      `($${excludedTotal.toFixed(2)}) ` +
      `[pass1=${pass1Idx.size} pass2=${pass2Idx.size} pass3=${pass3Idx.size} pass4=${pass4Idx.size}] ` +
      `main_target=${mainTarget ?? "null"} optional_target=${structure.optional_scope_total ?? "null"}`,
  );

  return items
    .map((it, idx) =>
      all.has(idx) ? { ...it, scope_category: "optional" as const } : it,
    )
    .filter((_, idx) => !excludedByPage.has(idx));
}

const STOPWORDS = new Set([
  "the",
  "and",
  "or",
  "of",
  "to",
  "a",
  "an",
  "in",
  "on",
  "for",
  "with",
  "scope",
  "section",
  "items",
  "details",
  "detail",
  "extras",
  "general",
  "passive",
  "fire",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared++;
  const denom = Math.min(setA.size, setB.size);
  return denom === 0 ? 0 : shared / denom;
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
      unit_price: r.unit_price ?? r.unit_rate ?? r.rate ?? r.unitRate,
      total_price: r.total_price ?? r.line_total ?? r.lineTotal ?? r.total ?? r.amount,
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
  const pageNum = toNumberOrNull(r.source_page);
  const section = toStringOrNull(r.source_section);
  const rowRole = toStringOrNull(r.row_role);
  const serviceTrade = toStringOrNull(r.service_trade);
  const systemName = toStringOrNull(r.system_name) ?? toStringOrNull(r.passive_fire_system);
  const penetrationType = toStringOrNull(r.penetration_type);
  const frr = toStringOrNull(r.frr);

  let description = base.description;

  const hasSystem = systemName && !description.toLowerCase().includes(systemName.toLowerCase());
  const hasFrr = frr && !description.toLowerCase().includes(frr.toLowerCase());
  const hasService =
    serviceTrade &&
    serviceTrade !== "unknown" &&
    serviceTrade !== "mixed" &&
    !description.toLowerCase().includes(serviceTrade.toLowerCase());

  const enrichParts: string[] = [];
  if (hasService) enrichParts.push(serviceTrade!);
  if (penetrationType && !description.toLowerCase().includes(penetrationType.toLowerCase())) {
    enrichParts.push(penetrationType.replace(/_/g, " "));
  }
  if (enrichParts.length > 0) {
    description = `${enrichParts.join(" ")} ${description}`.trim();
  }
  if (hasFrr) description = `${description} ${frr}`.trim();
  if (hasSystem) description = `${description} — ${systemName}`.trim();

  if (block) {
    description = `[${block}] ${description}`.trim();
  }

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
    source_section: section,
    source_page: pageNum,
    building_or_block: block,
  };
}

function toStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
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
