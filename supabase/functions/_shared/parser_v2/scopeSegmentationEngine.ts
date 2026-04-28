/**
 * Scope Segmentation Engine — Parser V2 stage 8.
 *
 * Section-anchored classifier. Document layout (block resets + scope
 * sub-headers) is the authoritative source of truth for Main / Optional /
 * Excluded / Provisional. Item description heuristics act only as a
 * tiebreaker when no section anchor is present, and totals reconciliation
 * is a soft validator — it never invents rows.
 *
 * Pipeline:
 *   1. segmentDocument(pages) -> ordered SectionMarker[]
 *   2. For each row: anchor by globalLine -> active scope at that line
 *   3. Keyword tiebreaker for rows still Unknown
 *   4. Excluded keyword override ("by others", "not included")
 *   5. Totals reconciliation as validator (only flips Unknown/low-conf rows)
 *   6. Optional LLM resolve for residual ambiguous rows
 *   7. Confidence failsafe
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
// Section vocabulary — generic across trades and quote shapes.
// Patterns are anchored to whole-line shape so they only match true headers,
// not item descriptions that happen to contain the words.
// --------------------------------------------------------------------------

const MAIN_HEADER_PATTERNS: RegExp[] = [
  /^\s*main\s+scope\s*:?\s*$/i,
  /^\s*included\s+scope\s*:?\s*$/i,
  /^\s*base\s+scope\s*:?\s*$/i,
  /^\s*contract\s+works\s*:?\s*$/i,
  /^\s*main\s+works\s*:?\s*$/i,
  /^\s*schedule\s+of\s+works\s*:?\s*$/i,
  /^\s*included\s+items?\s*:?\s*$/i,
  /^\s*items?\s+identified\s+on\s+drawings\s*:?\s*$/i,
  /^\s*identified\s+on\s+drawings\s*:?\s*$/i,
  /^\s*penetration\s+works\s*:?\s*$/i,
  /^\s*quote\s+breakdown\s*:?\s*$/i,
  /^\s*estimate\s+summary\s*:?\s*$/i,
  /^\s*quote\s+summary\s*:?\s*$/i,
  /^\s*tender\s+summary\s*:?\s*$/i,
  /\bsub[\s-]?total\b/i,
];

const OPTIONAL_HEADER_PATTERNS: RegExp[] = [
  /^\s*optional\s+scope\s*:?\s*$/i,
  /^\s*optional\s+extras?\s*:?\s*$/i,
  /^\s*optional\s+items?\s*:?\s*$/i,
  /^\s*optional\s*:?\s*$/i,
  /^\s*add\s+to\s+scope\s*:?\s*$/i,
  /^\s*additional\s+items?\s*:?\s*$/i,
  /^\s*confirmation\s+required\s*:?\s*$/i,
  /^\s*items?\s+requiring\s+confirmation\s*:?\s*$/i,
  /^\s*items?\s+not\s+shown\s+on\s+drawings\s*:?\s*$/i,
  /^\s*not\s+shown\s+on\s+drawings\s*:?\s*$/i,
  /^\s*estimate\s+items?\s+not\s+shown\s+on\s+drawings\s*:?\s*$/i,
  /^\s*extras?\s+over\s*:?\s*$/i,
  /^\s*alternates?\s*:?\s*$/i,
  /^\s*upgrade\s+options?\s*:?\s*$/i,
  /^\s*can\s+be\s+removed\s*:?\s*$/i,
  /^\s*tbc\s+breakdown\s*:?\s*$/i,
  /^\s*items?\s+for\s+confirmation\s*:?\s*$/i,
];

const EXCLUDED_HEADER_PATTERNS: RegExp[] = [
  /^\s*exclusions?\s*:?\s*$/i,
  /^\s*excluded\s+items?\s*:?\s*$/i,
  /^\s*excluded\s*:?\s*$/i,
  /^\s*not\s+included\s*:?\s*$/i,
  /^\s*items?\s+not\s+included\s*:?\s*$/i,
  /^\s*services?\s+not\s+part\s+of\b/i,
  /^\s*clarifications?\s*:?\s*$/i,
];

const PROVISIONAL_HEADER_PATTERNS: RegExp[] = [
  /^\s*provisional\s+sums?\s*:?\s*$/i,
  /^\s*provisional\s+items?\s*:?\s*$/i,
  /^\s*provisional\s*:?\s*$/i,
  /^\s*pc\s+sums?\s*:?\s*$/i,
];

const BLOCK_RESET_RE =
  /^\s*(block|level|floor|building|tower|stage|area|zone|basement)\s+[A-Z0-9][\w-]*\b/i;

// Description-embedded block hint, e.g. "[Block B30] ..." inserted by upstream
// extractors so a row can be re-anchored to its source block even when the
// extracted_items array isn't in document order.
const BLOCK_HINT_RE =
  /\[\s*(?:block|level|floor|building|tower|stage|area|zone)\s+([A-Za-z0-9][\w-]*)\s*\]/i;

// --------------------------------------------------------------------------
// Section markers
// --------------------------------------------------------------------------

type MarkerKind =
  | "block"
  | "scope_main"
  | "scope_optional"
  | "scope_excluded"
  | "scope_provisional";

type MarkerScope = "main" | "optional" | "excluded" | "provisional" | "reset";

type SectionMarker = {
  globalLine: number;
  page: number | null;
  kind: MarkerKind;
  scope: MarkerScope;
  confidence: number;
  sourceText: string;
};

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

/**
 * Single-pass document segmentation. Walks every line once and emits an
 * ordered list of SectionMarker. Generic — no trade-specific phrases. The
 * structural cues (header shape, no $ or qty/rate columns, ALL CAPS bonus)
 * gate which lines we even consider. Header vocabulary then assigns scope.
 */
function segmentDocument(
  rawText: string,
  pages: { pageNum: number; text: string }[],
): SectionMarker[] {
  const markers: SectionMarker[] = [];
  const lines = buildIndexedLines(rawText, pages);
  for (const { line, page, idx } of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 200) continue;

    // Block resets first — they can appear with or without surrounding columns.
    if (BLOCK_RESET_RE.test(trimmed)) {
      markers.push({
        globalLine: idx,
        page,
        kind: "block",
        scope: "reset",
        confidence: 0.85,
        sourceText: trimmed.slice(0, 120),
      });
      continue;
    }

    const looksLikePrice = /\$|\d[\d,]*\.\d{2}/.test(trimmed);
    const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
    const isHeaderShape =
      isAllCaps ||
      /^[A-Z][A-Za-z\s\/\-&()]{2,80}[:]?$/.test(trimmed) ||
      trimmed.endsWith(":");

    const isSubtotalLine = /\bsub[\s-]?total\b/i.test(trimmed);

    // Lines with prices are not headers, except subtotal rollups which still
    // indicate the boundary of the preceding section.
    if (looksLikePrice && !isSubtotalLine) continue;
    if (!isHeaderShape && !isSubtotalLine) continue;

    let scope: MarkerScope | null = null;
    let kind: MarkerKind | null = null;
    // ALL CAPS headers get a confidence bump because that's the strongest
    // structural signal in printed quotes.
    const baseConf = isAllCaps ? 0.95 : 0.82;

    if (matchesAny(trimmed, EXCLUDED_HEADER_PATTERNS)) {
      scope = "excluded";
      kind = "scope_excluded";
    } else if (matchesAny(trimmed, PROVISIONAL_HEADER_PATTERNS)) {
      scope = "provisional";
      kind = "scope_provisional";
    } else if (matchesAny(trimmed, OPTIONAL_HEADER_PATTERNS)) {
      scope = "optional";
      kind = "scope_optional";
    } else if (matchesAny(trimmed, MAIN_HEADER_PATTERNS)) {
      scope = "main";
      kind = "scope_main";
    }

    if (scope && kind) {
      markers.push({
        globalLine: idx,
        page,
        kind,
        scope,
        confidence: baseConf,
        sourceText: trimmed.slice(0, 120),
      });
    }
  }
  return markers;
}

/**
 * Walk the marker list and find the active scope at a given globalLine.
 * Block markers reset scope inheritance — items in a new block default to
 * Main until a scope sub-header appears within that block.
 */
function anchorRow(
  globalLine: number | null,
  markers: SectionMarker[],
): {
  scope: MarkerScope | null;
  marker: SectionMarker | null;
  block: SectionMarker | null;
} {
  if (globalLine == null) return { scope: null, marker: null, block: null };
  let scope: MarkerScope | null = null;
  let marker: SectionMarker | null = null;
  let block: SectionMarker | null = null;
  for (const m of markers) {
    if (m.globalLine > globalLine) break;
    if (m.kind === "block") {
      block = m;
      // Block reset clears any inherited scope from a previous block.
      scope = null;
      marker = null;
    } else {
      scope = m.scope;
      marker = m;
    }
  }
  return { scope, marker, block };
}

function extractBlockHint(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const m = desc.match(BLOCK_HINT_RE);
  if (!m) return null;
  return normaliseBlockToken(m[1]);
}

function normaliseBlockToken(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function indexBlocksByToken(markers: SectionMarker[]): Map<string, SectionMarker> {
  const map = new Map<string, SectionMarker>();
  for (const b of markers) {
    if (b.kind !== "block") continue;
    const m = b.sourceText.match(
      /^\s*(?:block|level|floor|building|tower|stage|area|zone|basement)\s+([A-Za-z0-9][\w-]*)/i,
    );
    if (!m) continue;
    const tokenFull = normaliseBlockToken(m[1]);
    if (tokenFull && !map.has(tokenFull)) map.set(tokenFull, b);
    const digits = tokenFull.replace(/^[a-z]+/, "");
    if (digits && digits !== tokenFull && !map.has(digits)) map.set(digits, b);
    const withB = /^[0-9]+$/.test(tokenFull) ? `b${tokenFull}` : null;
    if (withB && !map.has(withB)) map.set(withB, b);
  }
  return map;
}

// --------------------------------------------------------------------------
// Keyword tiebreaker (Layer 3 — generic only)
// --------------------------------------------------------------------------

const OPTIONAL_DESC_RE =
  /\b(optional|add\s+to\s+scope|not\s+shown\s+on\s+drawings|extra\s+over|TBC|alternate|upgrade)\b/i;

const EXCLUDED_DESC_RE =
  /\b(by\s+others|provisional\s+only|no\s+tested\s+solution|rate\s+only|not\s+included)\b/i;

const MAIN_DESC_RE =
  /\b(identified\s+on\s+drawings|main\s+scope|sub[\s-]?total)\b/i;

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
  hadAnchor: boolean;
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
  const cleaned = desc.replace(BLOCK_HINT_RE, "").trim();
  const needle = cleaned.split(/\s+/).slice(0, 6).join(" ").toLowerCase();
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

  const startFrom = cursors.full.get(needle) ?? 0;
  const idx = pageIndex.fullLower.indexOf(needle, startFrom);
  if (idx === -1) return null;
  cursors.full.set(needle, idx + needle.length);
  const upTo = rawText.slice(0, idx);
  return (upTo.match(/\n/g) ?? []).length;
}

// --------------------------------------------------------------------------
// Totals reconciliation — soft validator only.
// Only flips rows that lacked a section anchor (hadAnchor === false) and have
// confidence < 0.6. Never invents synthetic rows.
// --------------------------------------------------------------------------

const TOTALS_TOLERANCE = 0.015;

function withinTolerance(actual: number, target: number): boolean {
  if (target <= 0) return false;
  return Math.abs(actual - target) / target <= TOTALS_TOLERANCE;
}

function sumByLabel(rows: WorkingRow[], label: ScopeLabel): number {
  return rows
    .filter((r) => r.label === label)
    .reduce((s, r) => s + (r.item.total_price ?? 0), 0);
}

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

    // Only un-anchored, low-confidence rows are reassignable. This keeps the
    // section-anchored layer authoritative and prevents the engine from
    // fabricating moves to balance arithmetic at the cost of correctness.
    const candidates = rows
      .filter(
        (r) =>
          r.label === from &&
          !r.hadAnchor &&
          r.confidence < 0.6 &&
          (r.item.total_price ?? 0) > 0,
      )
      .sort((a, b) => a.confidence - b.confidence);

    const picked = pickSubsetByValue(candidates, delta);
    for (const r of picked) {
      r.label = to;
      r.reason = `totals_validator:${from}->${to}`;
      r.confidence = Math.max(r.confidence, 0.65);
      changed++;
    }
    if (picked.length === 0) break;
  }
  return { changed };
}

function pickSubsetByValue(rows: WorkingRow[], target: number): WorkingRow[] {
  if (rows.length === 0 || target <= 0) return [];
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
// Confidence helpers
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
  markers: SectionMarker[],
  totals: { main_total: number | null; optional_total: number | null },
  openAIKey: string,
): Promise<{ resolved: number }> {
  const batch = ambiguous.slice(0, LLM_MAX_ROWS);
  if (batch.length === 0) return { resolved: 0 };

  const headingsForPrompt = markers
    .filter((m) => m.kind !== "block")
    .slice(0, 40)
    .map((m) => `[${labelForMarker(m)}] ${m.sourceText}`);

  const userPrompt = buildScopeSegmentationUserPrompt({
    mainTotal: totals.main_total,
    optionalTotal: totals.optional_total,
    headings: headingsForPrompt,
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

function labelForMarker(m: SectionMarker): ScopeLabel {
  if (m.scope === "main") return "Main";
  if (m.scope === "optional" || m.scope === "provisional") return "Optional";
  if (m.scope === "excluded") return "Excluded";
  return "Unknown";
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
  const markers = segmentDocument(input.rawText, input.allPages ?? []);
  const headingsCount = markers.filter((m) => m.kind !== "block").length;
  const blockCount = markers.filter((m) => m.kind === "block").length;
  layers.push("layer1_segmentation");
  if (blockCount > 0) layers.push("layer2_blocks");

  const pageIndex = buildPageIndex(input.rawText, input.allPages ?? []);
  const cursors = { perPage: new Map<string, number>(), full: new Map<string, number>() };
  const blockByToken = indexBlocksByToken(markers);

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
    let globalLine = findRowGlobalLine(
      item.description ?? "",
      item.source_page ?? null,
      input.rawText,
      pageIndex,
      cursors,
    );
    const hint = extractBlockHint(item.description);
    if (hint) {
      const hinted = blockByToken.get(hint);
      if (hinted) {
        if (globalLine == null || globalLine < hinted.globalLine) {
          globalLine = hinted.globalLine + 1;
        }
      }
    }
    rowsByIndex[idx] = {
      row_id: `r${idx}`,
      index: idx,
      item,
      globalLine,
      label: initial,
      confidence: 0.4,
      reason: "initial:from_extractor",
      hadAnchor: false,
    };
  }
  const rows: WorkingRow[] = rowsByIndex.filter((r): r is WorkingRow => r != null);

  // Layer 1+2: section anchoring — authoritative.
  for (const r of rows) {
    const { scope, marker, block } = anchorRow(r.globalLine, markers);
    if (scope === "main") {
      r.label = "Main";
      bumpConfidence(
        r,
        marker?.confidence ?? 0.9,
        `section:main:${marker?.sourceText.slice(0, 60) ?? ""}`,
      );
      r.hadAnchor = true;
    } else if (scope === "optional" || scope === "provisional") {
      r.label = "Optional";
      bumpConfidence(
        r,
        marker?.confidence ?? 0.9,
        `section:${scope}:${marker?.sourceText.slice(0, 60) ?? ""}`,
      );
      r.hadAnchor = true;
    } else if (scope === "excluded") {
      r.label = "Excluded";
      bumpConfidence(
        r,
        marker?.confidence ?? 0.9,
        `section:excluded:${marker?.sourceText.slice(0, 60) ?? ""}`,
      );
      r.hadAnchor = true;
    } else if (block) {
      // Inside a block but no scope sub-header preceding this row: default to
      // Main per per-block default rule. Modest confidence so keyword/totals
      // layers can still flip.
      r.label = "Main";
      bumpConfidence(r, 0.72, `block_default:${block.sourceText.slice(0, 60)}`);
      r.hadAnchor = true;
    }
  }

  // Layer 3: keyword tiebreaker — only fires for rows without a strong section
  // anchor. Generic vocabulary only; no trade-specific phrases.
  layers.push("layer3_keyword_tiebreak");
  for (const r of rows) {
    if (r.confidence >= 0.8) continue;
    const kw = keywordClassify(r.item.description ?? "");
    if (!kw) continue;
    r.label = kw.label;
    bumpConfidence(r, 0.6, `tiebreak:${kw.reason}`);
  }

  // Decisive override: "by others" / "not included" always demote to Excluded
  // regardless of section, because that wording is explicit on the row itself.
  for (const r of rows) {
    if (EXCLUDED_DESC_RE.test(r.item.description ?? "")) {
      r.label = "Excluded";
      bumpConfidence(r, 0.9, "row_override:excluded");
    }
  }

  // Layer 4: totals reconciliation — soft validator (only un-anchored, low-conf rows).
  const recon = reconcileTotals(rows, input.authoritative_totals);
  if (recon.changed > 0) layers.push("layer4_totals_validator");

  // LLM pass for any rows still ambiguous.
  let llm_used = false;
  let llm_resolved = 0;
  const ambiguous = rows.filter((r) => r.confidence < 0.85);
  if (ambiguous.length > 0 && input.openAIKey) {
    llm_used = true;
    layers.push("llm_resolution");
    const out = await llmResolve(ambiguous, markers, input.authoritative_totals, input.openAIKey);
    llm_resolved = out.resolved;
  }

  // Failsafe: any row still below 0.45 confidence reverts to Unknown.
  layers.push("layer5_confidence");
  for (const r of rows) {
    if (r.confidence < 0.45) {
      r.label = "Unknown";
      r.reason = `failsafe:preserve_extractor_tag:${r.item.scope_category}`;
    }
  }

  // Compose output items. Internal scope_category stays lowercase; only
  // cross-write when confidence >= 0.7 and the engine label maps to a valid
  // downstream value.
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
      headings_detected: headingsCount,
      layers_applied: layers,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
