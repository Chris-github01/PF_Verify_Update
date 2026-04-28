/**
 * Scope Segmentation Engine — Parser V2 stage 8.
 *
 * Inserted after `extraction` and before `pf_authoritative_total`. Re-tags
 * each extracted row with one of Main / Optional / Excluded / Unknown based
 * on structural evidence rather than row-by-row guesses.
 *
 * Layer order:
 *   1. Explicit label detection (rawText scan + heading map)
 *   2. Page / block inheritance (Block / Building / Level / Tower / Stage)
 *   3. Description keyword classifier
 *   4. Total reconciliation solver (greedy + small subset, +/- 1.5%)
 *   5. Confidence scoring
 *
 * The engine NEVER mutates totals. It only updates `scope_category`,
 * `scope_confidence`, and `scope_reason` on items. When deterministic
 * confidence < 0.85 for any row, an LLM pass is run for that batch only.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";
import {
  SCOPE_SEGMENTATION_SYSTEM_PROMPT,
  buildScopeSegmentationUserPrompt,
} from "./prompts/scopeSegmentationPrompt.ts";

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export type ScopeLabel = "Main" | "Optional" | "Excluded" | "Unknown";

export type ScopeSegmentationItem = ParsedLineItemV2 & {
  scope_segmentation_label?: ScopeLabel;
  scope_confidence?: number;
  scope_reason?: string;
};

export type ScopeSegmentationSummary = {
  main_sum: number;
  optional_sum: number;
  excluded_sum: number;
  unknown_sum: number;
  matched_main_total: boolean;
  matched_optional_total: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  llm_used: boolean;
  llm_resolved_rows: number;
  headings_detected: number;
  layers_applied: string[];
};

export type ScopeSegmentationResult = {
  items: ScopeSegmentationItem[];
  summary: ScopeSegmentationSummary;
};

export type ScopeSegmentationInput = {
  extracted_items: ParsedLineItemV2[];
  rawText: string;
  allPages: { pageNum: number; text: string }[];
  quote_type: string;
  trade: string;
  supplier: string;
  authoritative_totals: {
    main_total: number | null;
    optional_total: number | null;
  };
  openAIKey?: string;
};

// --------------------------------------------------------------------------
// Heading detection (Layer 1)
// --------------------------------------------------------------------------

const MAIN_LABEL_PATTERNS: RegExp[] = [
  /\bincluded\s+scope\b/i,
  /\bquote\s+summary\b/i,
  /\bsub[\s-]?total\b/i,
  /\bbase\s+scope\b/i,
  /\bcontract\s+works\b/i,
  /\bmain\s+works\b/i,
  /\bschedule\s+of\s+works\b/i,
  /\bincluded\s+items\b/i,
  /\bitems?\s+identified\s+on\s+drawings\b/i,
  /\bidentified\s+on\s+drawings\b/i,
  /\bpenetration\s+works\b/i,
  /\bestimate\s+summary\b/i,
  /\bquote\s+breakdown\b/i,
  /\bmain\s+scope\b/i,
];

const OPTIONAL_LABEL_PATTERNS: RegExp[] = [
  /\boptional\s+scope\b/i,
  /\boptional\s+extras?\b/i,
  /\badd\s+to\s+scope\b/i,
  /\bconfirmation\s+required\b/i,
  /\bnot\s+shown\s+on\s+drawings\b/i,
  /\bextra\s+over\b/i,
  /\bTBC\s+breakdown\b/i,
  /\bitems?\s+with\s+confirmation\b/i,
  /\bitems?\s+requiring\s+confirmation\b/i,
  /\bcan\s+be\s+removed\b/i,
  /\bestimate\s+items\s+not\s+shown\s+on\s+drawings\b/i,
  /\boptional\b/i,
  /\barchitectural\s*\/?\s*structural\s+details?\b/i,
];

const EXCLUDED_LABEL_PATTERNS: RegExp[] = [
  /\bexclusions?\b/i,
  /\bexcluded\b/i,
  /\bby\s+others\b/i,
  /\bno\s+allowance\b/i,
  /\bnot\s+included\b/i,
  /\bclarifications?\b/i,
];

const BLOCK_RESET_RE =
  /^\s*(block|level|floor|building|tower|stage|area|zone|basement)\s+[A-Z0-9][\w-]*\b/i;

type Heading = {
  text: string;
  type: ScopeLabel; // Main | Optional | Excluded
  page: number | null;
  globalLine: number;
};

type BlockMarker = {
  text: string;
  page: number | null;
  globalLine: number;
};

function detectHeadings(
  rawText: string,
  pages: { pageNum: number; text: string }[],
): { headings: Heading[]; blocks: BlockMarker[] } {
  const headings: Heading[] = [];
  const blocks: BlockMarker[] = [];
  const lines = buildIndexedLines(rawText, pages);
  for (const { line, page, idx } of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 200) continue;
    if (BLOCK_RESET_RE.test(trimmed)) {
      blocks.push({ text: trimmed.slice(0, 120), page, globalLine: idx });
      continue;
    }
    const isHeaderShape =
      trimmed === trimmed.toUpperCase() ||
      /^[A-Z][A-Za-z\s\/\-&()]{2,80}[:]?$/.test(trimmed) ||
      trimmed.endsWith(":");
    const looksLikePrice = /\$|\d[\d,]*\.\d{2}/.test(trimmed);
    if (looksLikePrice && !/\bsub[\s-]?total\b/i.test(trimmed)) continue;
    if (!isHeaderShape && !/sub[\s-]?total/i.test(trimmed)) continue;
    if (matchesAny(trimmed, EXCLUDED_LABEL_PATTERNS)) {
      headings.push({ text: trimmed.slice(0, 120), type: "Excluded", page, globalLine: idx });
    } else if (matchesAny(trimmed, OPTIONAL_LABEL_PATTERNS)) {
      headings.push({ text: trimmed.slice(0, 120), type: "Optional", page, globalLine: idx });
    } else if (matchesAny(trimmed, MAIN_LABEL_PATTERNS)) {
      headings.push({ text: trimmed.slice(0, 120), type: "Main", page, globalLine: idx });
    }
  }
  return { headings, blocks };
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  for (const re of patterns) if (re.test(text)) return true;
  return false;
}

function buildIndexedLines(
  rawText: string,
  pages: { pageNum: number; text: string }[],
): Array<{ line: string; page: number | null; idx: number }> {
  if (pages && pages.length > 0) {
    const out: Array<{ line: string; page: number | null; idx: number }> = [];
    let idx = 0;
    for (const p of pages) {
      const lines = (p.text ?? "").split(/\r?\n/);
      for (const line of lines) {
        out.push({ line, page: p.pageNum, idx });
        idx++;
      }
    }
    return out;
  }
  return rawText.split(/\r?\n/).map((line, idx) => ({ line, page: null, idx }));
}

function nearestHeading(
  page: number | null,
  headings: Heading[],
  blocks: BlockMarker[],
  rowGlobalLine: number | null,
): { heading: Heading | null; block: BlockMarker | null } {
  let heading: Heading | null = null;
  let block: BlockMarker | null = null;
  for (const h of headings) {
    if (rowGlobalLine != null) {
      if (h.globalLine <= rowGlobalLine) heading = h;
      else break;
    } else if (page != null && h.page != null && h.page <= page) {
      heading = h;
    }
  }
  for (const b of blocks) {
    if (rowGlobalLine != null) {
      if (b.globalLine <= rowGlobalLine) block = b;
      else break;
    } else if (page != null && b.page != null && b.page <= page) {
      block = b;
    }
  }
  // A block reset that came AFTER the last heading clears optional/excluded
  // inheritance and resets to default (Main per PER-BLOCK DEFAULT).
  if (heading && block && block.globalLine > heading.globalLine) {
    if (heading.type === "Optional" || heading.type === "Excluded") {
      heading = null;
    }
  }
  return { heading, block };
}

// --------------------------------------------------------------------------
// Layer 3 — keyword classifier
// --------------------------------------------------------------------------

const OPTIONAL_DESC_RE =
  /\b(optional|add\s+to\s+scope|flush\s*box|not\s+shown\s+on\s+drawings|extra\s+over|TBC|perimeter\s+seal|lift\s+door\s+seal|upgrade|alternate|provisional)\b/i;

const EXCLUDED_DESC_RE =
  /\b(by\s+others|provisional\s+only|no\s+tested\s+solution|rate\s+only|not\s+included)\b/i;

const MAIN_DESC_RE =
  /\b(identified\s+on\s+drawings|standard\s+penetration|main\s+scope|sub[\s-]?total)\b/i;

function keywordClassify(desc: string): { label: ScopeLabel; reason: string } | null {
  if (!desc) return null;
  if (EXCLUDED_DESC_RE.test(desc)) return { label: "Excluded", reason: "keyword:excluded" };
  if (OPTIONAL_DESC_RE.test(desc)) return { label: "Optional", reason: "keyword:optional" };
  if (MAIN_DESC_RE.test(desc)) return { label: "Main", reason: "keyword:main" };
  return null;
}

// --------------------------------------------------------------------------
// Row indexing
// --------------------------------------------------------------------------

type WorkingRow = {
  row_id: string;
  index: number;
  item: ParsedLineItemV2;
  globalLine: number | null;
  label: ScopeLabel;
  confidence: number;
  reason: string;
};

type PageIndex = {
  byPage: Map<number, { startGlobalLine: number; lowerText: string }>;
  fullLower: string;
};

function buildPageIndex(
  rawText: string,
  pages: { pageNum: number; text: string }[],
): PageIndex {
  const byPage = new Map<number, { startGlobalLine: number; lowerText: string }>();
  let idx = 0;
  if (pages && pages.length > 0) {
    for (const p of pages) {
      const text = p.text ?? "";
      byPage.set(p.pageNum, { startGlobalLine: idx, lowerText: text.toLowerCase() });
      idx += text.split(/\r?\n/).length;
    }
  }
  return { byPage, fullLower: rawText.toLowerCase() };
}

/**
 * Locate a row in the raw text. Critical for multi-block quotes where the
 * same description repeats per block: we MUST scope to source_page when
 * available, and consume matches in document order so the Nth occurrence
 * of a description on a page aligns with the Nth row that references it.
 */
function findRowGlobalLine(
  desc: string,
  sourcePage: number | null,
  rawText: string,
  pageIndex: PageIndex,
  cursors: { perPage: Map<string, number>; full: Map<string, number> },
): number | null {
  if (!desc) return null;
  const needle = desc.split(/\s+/).slice(0, 6).join(" ").toLowerCase();
  if (needle.length < 6) return null;

  if (sourcePage != null) {
    const page = pageIndex.byPage.get(sourcePage);
    if (page) {
      const key = `${sourcePage}|${needle}`;
      const startFrom = cursors.perPage.get(key) ?? 0;
      const local = page.lowerText.indexOf(needle, startFrom);
      if (local !== -1) {
        cursors.perPage.set(key, local + needle.length);
        const upTo = page.lowerText.slice(0, local);
        const linesIntoPage = (upTo.match(/\n/g) ?? []).length;
        return page.startGlobalLine + linesIntoPage;
      }
    }
  }

  // Fallback: search whole document with a consume cursor.
  const startFrom = cursors.full.get(needle) ?? 0;
  const idx = pageIndex.fullLower.indexOf(needle, startFrom);
  if (idx === -1) return null;
  cursors.full.set(needle, idx + needle.length);
  const upTo = rawText.slice(0, idx);
  return (upTo.match(/\n/g) ?? []).length;
}

// --------------------------------------------------------------------------
// Layer 4 — totals reconciliation
// --------------------------------------------------------------------------

const TOTALS_TOLERANCE = 0.015; // 1.5%

function withinTolerance(actual: number, target: number): boolean {
  if (target <= 0) return false;
  return Math.abs(actual - target) / target <= TOTALS_TOLERANCE;
}

function sumByLabel(rows: WorkingRow[], label: ScopeLabel): number {
  return rows
    .filter((r) => r.label === label)
    .reduce((s, r) => s + (r.item.total_price ?? 0), 0);
}

/**
 * If the current Main sum is materially over the authoritative Main target
 * but the Optional sum is materially under the authoritative Optional, find
 * the smallest set of low-confidence Main rows whose values would fix both
 * sums when reassigned to Optional. Same logic in reverse.
 *
 * Greedy small-subset search bounded to top 12 candidates by confidence (asc)
 * to stay O(n^2) at worst.
 */
function reconcileTotals(
  rows: WorkingRow[],
  totals: { main_total: number | null; optional_total: number | null },
): { changed: number } {
  const mainTarget = totals.main_total ?? null;
  const optTarget = totals.optional_total ?? null;
  if (mainTarget == null && optTarget == null) return { changed: 0 };

  let changed = 0;

  for (let pass = 0; pass < 2; pass++) {
    const currentMain = sumByLabel(rows, "Main");
    const currentOpt = sumByLabel(rows, "Optional");

    const overMain = mainTarget != null && currentMain > mainTarget * (1 + TOTALS_TOLERANCE);
    const underOpt = optTarget != null && currentOpt < optTarget * (1 - TOTALS_TOLERANCE);
    const overOpt = optTarget != null && currentOpt > optTarget * (1 + TOTALS_TOLERANCE);
    const underMain = mainTarget != null && currentMain < mainTarget * (1 - TOTALS_TOLERANCE);

    let from: ScopeLabel | null = null;
    let to: ScopeLabel | null = null;
    let delta = 0;
    if (overMain && underOpt) {
      from = "Main";
      to = "Optional";
      delta = currentMain - (mainTarget ?? 0);
    } else if (overOpt && underMain) {
      from = "Optional";
      to = "Main";
      delta = currentOpt - (optTarget ?? 0);
    } else {
      break;
    }
    if (delta <= 0) break;

    const candidates = rows
      .filter((r) => r.label === from && r.confidence < 0.9 && (r.item.total_price ?? 0) > 0)
      .sort((a, b) => a.confidence - b.confidence)
      .slice(0, 80);

    const picked = pickSubsetByValue(candidates, delta);
    for (const r of picked) {
      r.label = to;
      r.reason = `totals_reconciliation:${from}->${to}`;
      r.confidence = Math.max(r.confidence, 0.7);
      changed++;
    }
    if (picked.length === 0) break;
  }
  return { changed };
}

function pickSubsetByValue(rows: WorkingRow[], target: number): WorkingRow[] {
  if (rows.length === 0 || target <= 0) return [];
  // Greedy: take rows largest-first, stop when the sum is within tolerance of target.
  const sorted = [...rows].sort(
    (a, b) => (b.item.total_price ?? 0) - (a.item.total_price ?? 0),
  );
  const picked: WorkingRow[] = [];
  let total = 0;
  for (const r of sorted) {
    const v = r.item.total_price ?? 0;
    if (total + v <= target * (1 + TOTALS_TOLERANCE)) {
      picked.push(r);
      total += v;
      if (total >= target * (1 - TOTALS_TOLERANCE)) break;
    }
  }
  return picked;
}

// --------------------------------------------------------------------------
// Layer 5 — confidence aggregation
// --------------------------------------------------------------------------

function bumpConfidence(row: WorkingRow, evidence: number, reason: string): void {
  if (evidence > row.confidence) {
    row.confidence = evidence;
    row.reason = reason;
  }
}

// --------------------------------------------------------------------------
// LLM pass for ambiguous rows (confidence < 0.85)
// --------------------------------------------------------------------------

const LLM_MODEL = "gpt-4o-mini";
const LLM_TIMEOUT_MS = 25_000;
const LLM_MAX_ROWS = 60;

async function llmResolve(
  ambiguous: WorkingRow[],
  headings: Heading[],
  totals: { main_total: number | null; optional_total: number | null },
  openAIKey: string,
): Promise<{ resolved: number }> {
  const batch = ambiguous.slice(0, LLM_MAX_ROWS);
  if (batch.length === 0) return { resolved: 0 };

  const userPrompt = buildScopeSegmentationUserPrompt({
    mainTotal: totals.main_total,
    optionalTotal: totals.optional_total,
    headings: headings.slice(0, 40).map((h) => `[${h.type}] ${h.text}`),
    rows: batch.map((r) => ({
      row_id: r.row_id,
      description: r.item.description,
      total_price: r.item.total_price,
      source_page: r.item.source_page ?? null,
      nearest_heading: r.reason,
      current_scope: r.label,
    })),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SCOPE_SEGMENTATION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`scope_segmentation llm HTTP ${res.status}`);
    const json = await res.json();
    const raw = JSON.parse(json.choices[0].message.content ?? "{}");
    const items: Array<{
      row_id?: string;
      scope_category?: string;
      confidence?: number;
      reason?: string;
    }> = Array.isArray(raw.items) ? raw.items : [];
    const byId = new Map(batch.map((r) => [r.row_id, r] as const));
    let resolved = 0;
    for (const it of items) {
      if (!it.row_id) continue;
      const target = byId.get(String(it.row_id));
      if (!target) continue;
      const label = normaliseLabel(it.scope_category);
      if (!label) continue;
      const conf = clamp01(Number(it.confidence ?? 0.7));
      if (conf < 0.6) continue;
      target.label = label;
      target.confidence = Math.max(target.confidence, conf);
      target.reason = `llm:${(it.reason ?? "").slice(0, 80) || "structural"}`;
      resolved++;
    }
    return { resolved };
  } catch (err) {
    console.error("[scopeSegmentationEngine] llm pass failed", err);
    return { resolved: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function normaliseLabel(v: unknown): ScopeLabel | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "main") return "Main";
  if (s === "optional") return "Optional";
  if (s === "excluded") return "Excluded";
  if (s === "unknown") return "Unknown";
  return null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// --------------------------------------------------------------------------
// Public entry point
// --------------------------------------------------------------------------

export async function runScopeSegmentationEngine(
  input: ScopeSegmentationInput,
): Promise<ScopeSegmentationResult> {
  const layers: string[] = [];
  const { headings, blocks } = detectHeadings(input.rawText, input.allPages ?? []);
  layers.push("layer1_headings");
  if (blocks.length > 0) layers.push("layer2_blocks");

  // Build working rows. Map existing lowercase scope_category to capitalized label.
  const pageIndex = buildPageIndex(input.rawText, input.allPages ?? []);
  const cursors = { perPage: new Map<string, number>(), full: new Map<string, number>() };
  // Process in (page, original index) order so the Nth occurrence of a
  // repeating description gets the Nth match position on its page.
  const orderedItems = input.extracted_items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const pa = a.item.source_page ?? Number.POSITIVE_INFINITY;
      const pb = b.item.source_page ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return a.idx - b.idx;
    });
  const rowsByIndex = new Array<WorkingRow | null>(input.extracted_items.length).fill(null);
  for (const { item, idx } of orderedItems) {
    const initial: ScopeLabel =
      item.scope_category === "main"
        ? "Main"
        : item.scope_category === "optional"
        ? "Optional"
        : item.scope_category === "excluded"
        ? "Excluded"
        : "Unknown";
    const globalLine = findRowGlobalLine(
      item.description ?? "",
      item.source_page ?? null,
      input.rawText,
      pageIndex,
      cursors,
    );
    rowsByIndex[idx] = {
      row_id: `r${idx}`,
      index: idx,
      item,
      globalLine,
      label: initial,
      confidence: 0.4, // base prior — existing tag is only weak evidence
      reason: "initial:from_extractor",
    };
  }
  const rows: WorkingRow[] = rowsByIndex.filter((r): r is WorkingRow => r != null);

  // Layer 1 + 2: heading + block inheritance
  for (const r of rows) {
    const { heading, block } = nearestHeading(
      r.item.source_page ?? null,
      headings,
      blocks,
      r.globalLine,
    );
    if (heading) {
      r.label = heading.type;
      bumpConfidence(r, 0.92, `heading:${heading.type}:${heading.text.slice(0, 60)}`);
    } else if (block) {
      // Block reset with no overriding heading => default Main per PER-BLOCK
      // DEFAULT rule. Keep confidence modest; the keyword/totals layers may
      // still flip individual rows.
      r.label = "Main";
      bumpConfidence(r, 0.75, `block_default:${block.text.slice(0, 60)}`);
    }
  }

  // Layer 3: keyword classifier — only acts when current confidence is low or
  // the keyword evidence is stronger than what we have.
  layers.push("layer3_keywords");
  for (const r of rows) {
    const kw = keywordClassify(r.item.description ?? "");
    if (!kw) continue;
    if (r.confidence < 0.85) {
      r.label = kw.label;
      bumpConfidence(r, 0.82, kw.reason);
    } else if (r.label !== kw.label && kw.label === "Excluded") {
      // Excluded keyword is decisive — "by others" overrides any heading.
      r.label = "Excluded";
      bumpConfidence(r, 0.9, kw.reason);
    }
  }

  // Layer 4: totals reconciliation
  const recon = reconcileTotals(rows, input.authoritative_totals);
  if (recon.changed > 0) layers.push("layer4_totals_reconciliation");

  // LLM pass for any rows still ambiguous (confidence < 0.85)
  let llm_used = false;
  let llm_resolved = 0;
  const ambiguous = rows.filter((r) => r.confidence < 0.85);
  if (ambiguous.length > 0 && input.openAIKey) {
    llm_used = true;
    layers.push("llm_resolution");
    const out = await llmResolve(
      ambiguous,
      headings,
      input.authoritative_totals,
      input.openAIKey,
    );
    llm_resolved = out.resolved;
  }

  // Failsafe: any row still below 0.45 confidence reverts to its original
  // extractor tag and is marked Unknown for the engine summary view.
  layers.push("layer5_confidence");
  for (const r of rows) {
    if (r.confidence < 0.45) {
      r.label = "Unknown";
      r.reason = `failsafe:preserve_extractor_tag:${r.item.scope_category}`;
    }
  }

  // Compose output items. Internal scope_category stays lowercase to avoid
  // breaking downstream stages; we only cross-write when the engine has
  // strong evidence (>= 0.7) AND the engine label maps to a downstream-
  // valid value (main / optional / excluded). "Unknown" preserves the
  // existing tag exactly.
  const items: ScopeSegmentationItem[] = rows.map((r) => {
    const downstream =
      r.label === "Main"
        ? "main"
        : r.label === "Optional"
        ? "optional"
        : r.label === "Excluded"
        ? "excluded"
        : null;
    const next: ScopeSegmentationItem = {
      ...r.item,
      scope_segmentation_label: r.label,
      scope_confidence: Number(r.confidence.toFixed(3)),
      scope_reason: r.reason,
    };
    if (downstream && r.confidence >= 0.7) {
      next.scope_category = downstream as ParsedLineItemV2["scope_category"];
    }
    return next;
  });

  // Summary
  const sumFor = (label: ScopeLabel) =>
    rows
      .filter((r) => r.label === label)
      .reduce((s, r) => s + (r.item.total_price ?? 0), 0);
  const main_sum = sumFor("Main");
  const optional_sum = sumFor("Optional");
  const excluded_sum = sumFor("Excluded");
  const unknown_sum = sumFor("Unknown");

  const matched_main_total =
    input.authoritative_totals.main_total != null
      ? withinTolerance(main_sum, input.authoritative_totals.main_total)
      : false;
  const matched_optional_total =
    input.authoritative_totals.optional_total != null
      ? withinTolerance(optional_sum, input.authoritative_totals.optional_total)
      : false;

  const avgConfidence =
    rows.length > 0 ? rows.reduce((s, r) => s + r.confidence, 0) / rows.length : 0;
  let confidence: "HIGH" | "MEDIUM" | "LOW";
  if (
    (matched_main_total || input.authoritative_totals.main_total == null) &&
    avgConfidence >= 0.85
  ) {
    confidence = "HIGH";
  } else if (avgConfidence >= 0.65) {
    confidence = "MEDIUM";
  } else {
    confidence = "LOW";
  }

  return {
    items,
    summary: {
      main_sum: round2(main_sum),
      optional_sum: round2(optional_sum),
      excluded_sum: round2(excluded_sum),
      unknown_sum: round2(unknown_sum),
      matched_main_total,
      matched_optional_total,
      confidence,
      llm_used,
      llm_resolved_rows: llm_resolved,
      headings_detected: headings.length,
      layers_applied: layers,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
