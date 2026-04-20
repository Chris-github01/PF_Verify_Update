/**
 * Consensus Totals Engine
 *
 * After final row classification (Main / Optional / Excluded), compute a single
 * authoritative set of totals that combines:
 *   - summed row totals per scope
 *   - explicit labelled totals parsed from the raw document text
 *
 * Priority (consensus):
 *   1. If document grand_total AND optional_total are both labelled,
 *      main_total = grand_total - optional_total
 *   2. Else if document main_total / subtotal is explicitly labelled, use it
 *   3. Else use the summed Main rows
 *
 * grand_total priority: labelled > (main + optional) > summed rows
 */

export type ConsensusScope = "Main" | "Optional" | "Excluded";

export interface ScopedRow {
  description?: string;
  qty?: number | null;
  unit?: string | null;
  rate?: number | null;
  total?: number | null;
  scope?: ConsensusScope | "main" | "optional" | "excluded" | null;
}

export interface GrandTotalCandidate {
  label: string;
  value: number;
  position: number;
  page: number;
  within_summary_block: boolean;
  score: number;
  reasons: string[];
  deprioritised: boolean;
  banned: boolean;
  ban_reason: string | null;
  allow_category: string | null;
  context_snippet: string;
}

/**
 * Hard ban list: these label fragments describe sectional / package /
 * schedule figures and MUST NEVER be treated as the authoritative contract
 * total, regardless of surrounding context.
 */
const GRAND_TOTAL_BAN_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bworks\s+total\b/i, reason: "banned label: works total" },
  { re: /\bsection\s+total\b/i, reason: "banned label: section total" },
  { re: /\bpackage\s+total\b/i, reason: "banned label: package total" },
  { re: /\bbase\s+rate\b/i, reason: "banned label: base rate" },
  { re: /\bschedule\s+total\b/i, reason: "banned label: schedule total" },
  { re: /\btrade\s+total\b/i, reason: "banned label: trade total" },
  { re: /\bsub\s*-?\s*total\b/i, reason: "banned label: subtotal" },
  { re: /\bitem\s+total\b/i, reason: "banned label: item total" },
  { re: /\bgroup\s+total\b/i, reason: "banned label: group total" },
  { re: /\bstage\s+total\b/i, reason: "banned label: stage total" },
  { re: /\bbuilding\s+total\b/i, reason: "banned label: building total" },
  { re: /\bfloor\s+total\b/i, reason: "banned label: floor total" },
  { re: /\blevel\s+total\b/i, reason: "banned label: level total" },
  { re: /\barea\s+total\b/i, reason: "banned label: area total" },
  { re: /\bzone\s+total\b/i, reason: "banned label: zone total" },
  { re: /\bpenetration\s+(?:works\s+)?total\b/i, reason: "banned label: penetration works total" },
  { re: /\bfire\s+(?:rating|stopping|collar|door|damper)[^\n]{0,40}total\b/i, reason: "banned label: fire-rating sectional total" },
];

/**
 * Allow list: only labels matching one of these precise categories may be
 * treated as a grand-total candidate. Each entry defines a capture regex and
 * a category name recorded for audit traceability.
 */
const GRAND_TOTAL_ALLOW_CATEGORIES: Array<{ category: string; re: RegExp }> = [
  { category: "total_excl_gst", re: /\b(total\s*\(\s*excl?\.?\s*gst\s*\))[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/gi },
  { category: "total_excl_gst", re: /\b(total\s+excluding\s+gst)[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/gi },
  { category: "total_excl_gst", re: /\b(total\s+ex\.?\s+gst)[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/gi },
  { category: "grand_total", re: /\b(grand\s+total)[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/gi },
  { category: "quote_total", re: /\b(quote\s+total)[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/gi },
  { category: "contract_sum", re: /\b(contract\s+sum)[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/gi },
  { category: "tender_total", re: /\b(tender\s+total)[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/gi },
  { category: "lump_sum", re: /\b(?:fixed\s+)?(lump\s+sum)(?:\s+(?:total|price|amount))?[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/gi },
];

/** Pull the ~120 characters of context immediately preceding a match to look
 * for ban-list qualifiers (e.g. "Penetration Works " before "Total"). */
function getPrecedingContext(rawText: string, position: number, window = 120): string {
  return rawText.slice(Math.max(0, position - window), position);
}

/** Classify a raw label match against the ban / allow lists. */
function classifyGrandLabel(
  rawText: string,
  label: string,
  position: number,
  category: string,
): { banned: boolean; reason: string | null } {
  const preceding = getPrecedingContext(rawText, position);
  const labelPlusPre = `${preceding} ${label}`;
  for (const b of GRAND_TOTAL_BAN_PATTERNS) {
    if (b.re.test(label) || b.re.test(labelPlusPre)) {
      return { banned: true, reason: b.reason };
    }
  }
  // Extra guard for lump_sum: must not sit immediately after a sectional word
  // (e.g. "Package Lump Sum" should be rejected — already covered above for
  // "Package Total" but lump-sum-specific variants are handled here).
  if (category === "lump_sum") {
    if (/\b(package|section|works|schedule|trade|stage|area|zone|floor|level|building|item|group|option(?:al)?)\s+(?:lump\s+sum|price)\b/i.test(labelPlusPre)) {
      return { banned: true, reason: "banned label: sectional lump sum" };
    }
  }
  return { banned: false, reason: null };
}

export interface LabelledTotals {
  grand_total: number | null;
  main_total: number | null;
  optional_total: number | null;
  excluded_total: number | null;
  subtotal: number | null;
  summary_total: number | null;
  summary_total_position: number | null;
  summary_optional_total: number | null;
  grand_candidates: GrandTotalCandidate[];
  summary_block_position: number | null;
  labels_found: Array<{ label: string; value: number; kind: "grand" | "main" | "optional" | "excluded" | "subtotal" | "summary_grand" | "summary_optional"; position: number }>;
}

export type ParseAnomaly =
  | "row_sum_only"
  | "multiple_grand_totals"
  | "subtotal_plus_qa_match"
  | "optional_detected"
  | "dual_option_detected"
  | "no_labelled_totals"
  | "outside_tolerance"
  | "negative_main_clamped"
  | "row_sum_rejected_inflated"
  | "summary_total_trusted"
  | "schedule_subtotals_ignored";

export interface QuoteVariant {
  variant_index: number;
  variant_label: string;
  main_total: number;
  optional_total: number;
  grand_total: number;
  is_primary: boolean;
  source_evidence: {
    grand_label_position: number | null;
    subtotal_label_position: number | null;
    grand_value: number;
    subtotal_value: number | null;
  };
}

export interface TotalsEvidenceSnapshot {
  resolution_source: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  tolerance_applied: { absolute: number; percent: number; effective: number };
  labelled: LabelledTotals;
  summed: { main: number; optional: number; excluded: number };
  final: { main: number; optional: number; excluded: number; grand: number };
  delta_vs_labelled_grand: number | null;
  within_tolerance: boolean | null;
  dual_option_suspected: boolean;
  dual_option_reasons: string[];
  distinct_grand_totals: number[];
  page_footer_totals_found: boolean;
  parse_anomalies: ParseAnomaly[];
  variants: QuoteVariant[];
  subtotal_plus_optional_matches_grand: boolean | null;
  summary_total_detected: boolean;
  summary_total_value: number | null;
  summary_block_position: number | null;
  grand_total_candidates: GrandTotalCandidate[];
  chosen_grand_candidate_position: number | null;
  row_sum_rejected: boolean;
  authoritative_grand_source: "summary" | "labelled_grand" | "labelled_main" | "summed" | "none";
  notes: string[];
  decided_at: string;
}

export interface ConsensusTotalsResult {
  main_total: number;
  optional_total: number;
  excluded_total: number;
  grand_total: number;
  resolution_source:
    | "consensus[grand-optional]"
    | "consensus[labelled-main]"
    | "consensus[main+optional]"
    | "consensus[subtotal+qa=grand]"
    | "summary_page_total"
    | "labelled_grand_total"
    | "summed_main_rows"
    | "summed_rows_fallback";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  summed_main: number;
  summed_optional: number;
  summed_excluded: number;
  labelled: LabelledTotals;
  notes: string[];
  requires_review: boolean;
  review_reason: string | null;
  parse_anomalies: ParseAnomaly[];
  variants: QuoteVariant[];
  evidence: TotalsEvidenceSnapshot;
}

/**
 * Compute the reconciliation tolerance for a labelled grand total.
 * Per product spec: tolerance = max(1% of value, $1).
 */
export function computeTotalsTolerance(value: number): { absolute: number; percent: number; effective: number } {
  const absolute = 1;
  const percent = Math.abs(value) * 0.01;
  const effective = Math.max(absolute, percent);
  return { absolute, percent, effective };
}

/** Parse a currency-ish number from raw text, tolerating $, commas, and trailing decimals. */
function parseCurrency(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.\-]/g, "").replace(/(\..*)\./g, "$1");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

const LABEL_GROUPS: Array<{ kind: LabelledTotals["labels_found"][number]["kind"]; patterns: RegExp[] }> = [
  {
    kind: "grand",
    patterns: [
      /\b(grand\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(quote\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(total\s*(?:\(ex|excl\.?|excluding)\s*gst\)?)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(contract\s*sum)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(total\s*(?:price|amount|contract|tender))\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ],
  },
  {
    kind: "optional",
    patterns: [
      /\b(optional\s*(?:extras?|items?|scope)\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(total\s*optional(?:\s*extras?)?)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(add\s*alternates?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(provisional\s*sums?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ],
  },
  {
    kind: "main",
    patterns: [
      /\b(base\s*scope\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(main\s*scope\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(scope\s*of\s*works\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ],
  },
  {
    kind: "excluded",
    patterns: [
      /\b(excluded\s*(?:items?|scope)?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(exclusions?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ],
  },
  {
    kind: "subtotal",
    patterns: [
      /\b(sub\s*-?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ],
  },
];

/** Approximate page number from a character offset using form-feed or explicit page markers. */
function estimatePageNumber(rawText: string, position: number): number {
  const before = rawText.slice(0, position);
  const formFeeds = (before.match(/\f/g) ?? []).length;
  if (formFeeds > 0) return formFeeds + 1;
  const pageMatches = before.match(/\bPage\s+(\d+)\s+of\s+\d+\b/gi);
  if (pageMatches && pageMatches.length > 0) {
    const last = pageMatches[pageMatches.length - 1];
    const n = parseInt(last.replace(/\D+/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  // Fallback: estimate ~3500 chars per page.
  return Math.floor(position / 3500) + 1;
}

/**
 * Score a grand-total candidate using surrounding semantic context.
 * Higher is better. Candidates within a "QUOTE SUMMARY" block and/or on page 1
 * receive a boost; candidates near Optional/Package/Breakdown/Section labels are
 * deprioritised.
 */
function scoreGrandCandidate(
  rawText: string,
  match: { label: string; value: number; position: number },
  summaryBlockStart: number | null,
  summaryBlockEnd: number | null,
): { score: number; reasons: string[]; withinSummary: boolean; page: number; snippet: string; deprioritised: boolean } {
  const reasons: string[] = [];
  let score = 0;

  const ctxStart = Math.max(0, match.position - 220);
  const ctxEnd = Math.min(rawText.length, match.position + (match.label?.length ?? 0) + 120);
  const snippet = rawText.slice(ctxStart, ctxEnd).replace(/\s+/g, " ").trim();
  const pre = rawText.slice(ctxStart, match.position).toLowerCase();
  const post = rawText.slice(match.position, ctxEnd).toLowerCase();
  const ctx = `${pre} ${post}`;

  const withinSummary =
    summaryBlockStart !== null &&
    summaryBlockEnd !== null &&
    match.position >= summaryBlockStart &&
    match.position <= summaryBlockEnd;
  if (withinSummary) {
    score += 4;
    reasons.push("inside QUOTE SUMMARY block (+4)");
  }

  const page = estimatePageNumber(rawText, match.position);
  if (page === 1) {
    score += 2;
    reasons.push("page 1 (+2)");
  } else if (page === 2) {
    score += 1;
    reasons.push("page 2 (+1)");
  }

  const lbl = (match.label ?? "").toLowerCase();
  if (/total\s*\(?\s*excl?\.?|total\s*\(ex(?:cl)?|total\s*excluding\s*gst/.test(lbl)) {
    score += 3;
    reasons.push("label 'Total (excl GST)' (+3)");
  }
  if (/\bgrand\s*total\b/.test(lbl)) {
    score += 2;
    reasons.push("label 'Grand Total' (+2)");
  }
  if (/\bcontract\s*sum\b|\bquote\s*total\b/.test(lbl)) {
    score += 2;
    reasons.push("label 'Contract Sum'/'Quote Total' (+2)");
  }

  // Deprioritisation terms — when these appear within ~200 chars before the
  // label, the total is almost certainly a sectional / optional / package
  // figure rather than the authoritative contract sum.
  const negatives: Array<{ re: RegExp; penalty: number; reason: string }> = [
    { re: /\boptional\b/, penalty: 4, reason: "near 'Optional' (-4)" },
    { re: /\badd\s*to\s*scope\b/, penalty: 4, reason: "near 'Add to Scope' (-4)" },
    { re: /\badd\s*alternates?\b/, penalty: 4, reason: "near 'Add Alternate' (-4)" },
    { re: /\bpackage\b/, penalty: 3, reason: "near 'Package' (-3)" },
    { re: /\bbreakdown\b/, penalty: 3, reason: "near 'Breakdown' (-3)" },
    { re: /\bsection\s*\w*\s*total\b/, penalty: 3, reason: "near 'Section Total' (-3)" },
    { re: /\bsub\s*-?\s*total\b/, penalty: 2, reason: "near 'Subtotal' (-2)" },
    { re: /\bexcluded?\b/, penalty: 2, reason: "near 'Excluded' (-2)" },
    { re: /\bprovisional\s*sum/, penalty: 3, reason: "near 'Provisional Sum' (-3)" },
    { re: /\balternative\b/, penalty: 2, reason: "near 'Alternative' (-2)" },
  ];
  let deprioritised = false;
  for (const n of negatives) {
    if (n.re.test(pre) || n.re.test(post.slice(0, 40))) {
      score -= n.penalty;
      reasons.push(n.reason);
      deprioritised = true;
    }
  }

  // Tiny-value heuristic: grand totals usually dwarf line items; penalise
  // candidates with suspiciously tiny values when larger peers exist (handled
  // by caller via comparison). Not applied here.

  return { score, reasons, withinSummary, page, snippet, deprioritised };
}

export function parseLabelledTotals(rawText: string): LabelledTotals {
  const out: LabelledTotals = {
    grand_total: null,
    main_total: null,
    optional_total: null,
    excluded_total: null,
    subtotal: null,
    summary_total: null,
    summary_total_position: null,
    summary_optional_total: null,
    grand_candidates: [],
    summary_block_position: null,
    labels_found: [],
  };
  if (!rawText) return out;

  // Detect a "QUOTE SUMMARY" / "PRICING SUMMARY" section (page-1 trust).
  const summaryHeaderRegex = /\b(quote\s*summary|pricing\s*summary|summary\s*of\s*pricing|tender\s*summary|proposal\s*summary)\b/i;
  const summaryMatch = summaryHeaderRegex.exec(rawText);
  const summaryBlockStart: number | null = summaryMatch ? summaryMatch.index : null;
  const summaryBlockEnd: number | null =
    summaryBlockStart !== null ? Math.min(rawText.length, summaryBlockStart + 4500) : null;
  out.summary_block_position = summaryBlockStart;

  // Enumerate ALL grand-like label occurrences across the whole document, then
  // rank them by semantic context. This replaces the previous "first hit inside
  // summary block" heuristic which could latch onto a package/breakdown total
  // that happened to appear before the authoritative figure.
  const rawCandidates: Array<{ label: string; value: number; position: number; category: string }> = [];
  const seenPositions = new Set<string>();
  for (const entry of GRAND_TOTAL_ALLOW_CATEGORIES) {
    const p = entry.re;
    const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText)) !== null) {
      const value = parseCurrency(m[2] ?? "");
      if (value === null || value <= 0) continue;
      const key = `${m.index}:${value}`;
      if (seenPositions.has(key)) continue;
      seenPositions.add(key);
      rawCandidates.push({ label: m[1], value, position: m.index, category: entry.category });
    }
  }

  const scored: GrandTotalCandidate[] = rawCandidates.map((c) => {
    const s = scoreGrandCandidate(rawText, c, summaryBlockStart, summaryBlockEnd);
    const classification = classifyGrandLabel(rawText, c.label, c.position, c.category);
    return {
      label: c.label,
      value: c.value,
      position: c.position,
      page: s.page,
      within_summary_block: s.withinSummary,
      score: classification.banned ? -999 : s.score,
      reasons: classification.banned
        ? [...s.reasons, classification.reason ?? "banned"]
        : s.reasons,
      deprioritised: s.deprioritised,
      banned: classification.banned,
      ban_reason: classification.reason,
      allow_category: c.category,
      context_snippet: s.snippet,
    };
  });

  // Sort by score desc, then within-summary preference, then higher value
  // (authoritative contract sums are usually the largest figure), then earlier
  // position as final tiebreak (page-1 bias).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.within_summary_block !== b.within_summary_block) {
      return a.within_summary_block ? -1 : 1;
    }
    if (b.value !== a.value) return b.value - a.value;
    return a.position - b.position;
  });

  out.grand_candidates = scored;

  // Select the highest-confidence summary total. It must:
  //   - have a positive score, OR
  //   - be inside the QUOTE SUMMARY block (even with small score)
  //   - not be deprioritised unless it's the only candidate
  let chosen: GrandTotalCandidate | null = null;
  for (const c of scored) {
    if (c.banned) continue;
    if (c.deprioritised) continue;
    if (c.within_summary_block || c.score >= 3) {
      chosen = c;
      break;
    }
  }
  if (!chosen) {
    chosen = scored.find((c) => !c.banned && c.score > 0 && !c.deprioritised) ?? null;
  }
  if (!chosen) {
    // Fall back to any non-banned candidate regardless of deprioritisation.
    chosen = scored.find((c) => !c.banned) ?? null;
  }
  // Intentionally do NOT fall back to banned candidates — a sectional /
  // package / works total must never be surfaced as the authoritative figure.

  if (chosen) {
    out.summary_total = chosen.value;
    out.summary_total_position = chosen.position;
    out.labels_found.push({
      label: `summary_total:${chosen.label}`,
      value: chosen.value,
      kind: "summary_grand",
      position: chosen.position,
    });
  }

  // Summary-block optional total (separate "add to scope" figure).
  if (summaryBlockStart !== null && summaryBlockEnd !== null) {
    const windowText = rawText.slice(summaryBlockStart, summaryBlockEnd);
    const summaryOptionalPatterns: RegExp[] = [
      /\b(optional\s*(?:add\s*to\s*scope|extras?|items?|scope)?\s*total)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(add\s*to\s*scope(?:\s*total)?)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
      /\b(total\s*optional(?:\s*extras?|\s*add\s*to\s*scope)?)\b[^\n$]*?\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    ];
    for (const p of summaryOptionalPatterns) {
      const m = p.exec(windowText);
      if (!m) continue;
      const v = parseCurrency(m[2] ?? "");
      if (v === null || v <= 0) continue;
      // Do not adopt the optional total if it equals the chosen summary total
      // (avoids double-counting when the same figure is matched by both).
      if (chosen && Math.abs(v - chosen.value) < 0.01) continue;
      out.summary_optional_total = v;
      out.labels_found.push({
        label: "summary_optional",
        value: v,
        kind: "summary_optional",
        position: summaryBlockStart + m.index,
      });
      break;
    }
  }

  for (const group of LABEL_GROUPS) {
    for (const pattern of group.patterns) {
      const g = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      let m: RegExpExecArray | null;
      while ((m = g.exec(rawText)) !== null) {
        const label = m[1];
        const value = parseCurrency(m[2] ?? "");
        if (value === null || value <= 0) continue;
        out.labels_found.push({ label, value, kind: group.kind, position: m.index });
      }
    }
  }

  // Prefer the LAST-OCCURRING labelled total per kind (footer bias).
  // Suppliers typically state the authoritative total at the bottom of the
  // document; earlier occurrences are usually running subtotals or per-section
  // breakdowns that should not be treated as the canonical value. Falling back
  // to "largest" previously caused inflated optional totals and incorrect main
  // resolution when a section subtotal happened to exceed the true footer total.
  const pickLastOccurring = (kind: LabelledTotals["labels_found"][number]["kind"]): number | null => {
    const hits = out.labels_found.filter((l) => l.kind === kind);
    if (hits.length === 0) return null;
    // Already in match-emit order (forward scan per pattern), but patterns are
    // scanned in declared order per kind — sort by position to guarantee
    // document-order selection regardless of pattern iteration.
    hits.sort((a, b) => a.position - b.position);
    return hits[hits.length - 1].value;
  };

  out.grand_total = pickLastOccurring("grand");
  out.main_total = pickLastOccurring("main");
  out.optional_total = pickLastOccurring("optional");
  out.excluded_total = pickLastOccurring("excluded");
  out.subtotal = pickLastOccurring("subtotal");
  return out;
}

function normalizeScope(s: ScopedRow["scope"]): ConsensusScope {
  if (!s) return "Main";
  const v = String(s).toLowerCase();
  if (v === "optional") return "Optional";
  if (v === "excluded") return "Excluded";
  return "Main";
}

function sumBy(rows: ScopedRow[], scope: ConsensusScope): number {
  return rows.reduce((acc, r) => {
    if (normalizeScope(r.scope) !== scope) return acc;
    const t = Number(r.total ?? 0);
    return acc + (Number.isFinite(t) ? t : 0);
  }, 0);
}

/**
 * Run consensus total resolution.
 * Produces final main/optional/excluded/grand totals and a resolution_source tag.
 */
export function resolveConsensusTotals(
  rows: ScopedRow[],
  rawText: string,
): ConsensusTotalsResult {
  const labelled = parseLabelledTotals(rawText);
  const summed_main = round2(sumBy(rows, "Main"));
  const summed_optional = round2(sumBy(rows, "Optional"));
  const summed_excluded = round2(sumBy(rows, "Excluded"));
  const notes: string[] = [];

  let main_total: number;
  let optional_total: number;
  let excluded_total: number;
  let grand_total: number;
  let resolution_source: ConsensusTotalsResult["resolution_source"];
  let confidence: ConsensusTotalsResult["confidence"];

  const hasLabelledGrand = labelled.grand_total !== null && labelled.grand_total > 0;
  const hasLabelledOptional = labelled.optional_total !== null && labelled.optional_total > 0;
  const hasLabelledMain = labelled.main_total !== null && labelled.main_total > 0;
  const hasLabelledSubtotal = labelled.subtotal !== null && labelled.subtotal > 0;
  const hasLabelledExcluded = labelled.excluded_total !== null && labelled.excluded_total > 0;
  const hasSummaryTotal = labelled.summary_total !== null && (labelled.summary_total ?? 0) > 0;
  const hasSummaryOptional = labelled.summary_optional_total !== null && (labelled.summary_optional_total ?? 0) > 0;

  // Row-sum inflation rejection: when we have an authoritative labelled total
  // (summary page OR labelled grand) and the summed Main rows exceed it by more
  // than 1.3x, the summed rows are almost certainly counting schedule line
  // items + sectional subtotals + grand totals + optionals — reject them.
  const authoritativeGrand = hasSummaryTotal
    ? (labelled.summary_total as number)
    : hasLabelledGrand
      ? (labelled.grand_total as number)
      : null;
  const rowSumInflated =
    authoritativeGrand !== null &&
    authoritativeGrand > 0 &&
    summed_main > authoritativeGrand * 1.3;
  let rowSumsRejected = false;
  if (rowSumInflated) {
    rowSumsRejected = true;
    notes.push(
      `row-sum rejected: summed_main(${summed_main}) > 1.3x labelled authoritative total(${authoritativeGrand})`,
    );
  }

  // Strict precedence per product spec:
  //   1. Explicit labelled totals (labelled main / subtotal)
  //   2. Grand total minus optionals (both labelled)
  //   3. Classified row sums (Main + Optional)
  //   4. Raw row_sum fallback
  const raw_row_sum = round2(summed_main + summed_optional + summed_excluded);

  // Priority 0 (strongest): if labelled subtotal + labelled optional == labelled grand
  //   within tolerance, trust the grand total — all three numbers corroborate.
  //   "qa" in product spec = quote additional (aka optional scope).
  const preCheckTolerance = computeTotalsTolerance(labelled.grand_total ?? 0);
  const subtotalPlusQaMatch =
    hasLabelledGrand && hasLabelledSubtotal && hasLabelledOptional &&
    Math.abs(
      ((labelled.subtotal ?? 0) + (labelled.optional_total ?? 0)) - (labelled.grand_total ?? 0),
    ) <= preCheckTolerance.effective;

  if (hasSummaryTotal) {
    // Priority 0 (strongest): QUOTE SUMMARY page provides the authoritative
    // contract total. Breakdown/schedule pages must not contribute additive
    // totals when a summary total exists. Optional scope uses the summary-block
    // optional total when present, else labelled optional, else summed optional
    // capped by (grand - any main/subtotal labels to avoid overflow).
    grand_total = round2(labelled.summary_total as number);
    if (hasSummaryOptional) {
      optional_total = round2(labelled.summary_optional_total as number);
    } else if (hasLabelledOptional) {
      optional_total = round2(labelled.optional_total as number);
    } else {
      // Fall back to summed optional only if it does not push main negative.
      const candidateOpt = summed_optional;
      optional_total = candidateOpt > 0 && candidateOpt < grand_total ? candidateOpt : 0;
    }
    // Main is ALWAYS derived from the summary grand total (never summed rows)
    // because schedule pages contain additive inflation.
    main_total = round2(Math.max(0, grand_total - optional_total));
    excluded_total = hasLabelledExcluded ? round2(labelled.excluded_total as number) : summed_excluded;
    resolution_source = "summary_page_total";
    confidence = "HIGH";
    notes.push(
      `P0-summary: QUOTE SUMMARY authoritative total(${grand_total}), optional(${optional_total}), main(${main_total}) — schedule row sums discarded`,
    );
    if (rowSumsRejected) {
      notes.push(
        `schedule subtotals ignored: summed_main(${summed_main}) rejected in favour of summary total`,
      );
    }
  } else if (subtotalPlusQaMatch) {
    grand_total = round2(labelled.grand_total as number);
    main_total = round2(labelled.subtotal as number);
    optional_total = round2(labelled.optional_total as number);
    excluded_total = hasLabelledExcluded ? round2(labelled.excluded_total as number) : summed_excluded;
    resolution_source = "consensus[subtotal+qa=grand]";
    confidence = "HIGH";
    notes.push(
      `P0: subtotal(${main_total}) + optional(${optional_total}) = grand(${grand_total}) within tolerance — grand trusted`,
    );
  } else if (rowSumsRejected && hasLabelledGrand) {
    // Labelled grand total is authoritative when summed rows are inflated —
    // never fall through to P3 row-sum branch.
    grand_total = round2(labelled.grand_total as number);
    optional_total = hasLabelledOptional ? round2(labelled.optional_total as number) : 0;
    main_total = round2(Math.max(0, grand_total - optional_total));
    excluded_total = hasLabelledExcluded ? round2(labelled.excluded_total as number) : summed_excluded;
    resolution_source = "labelled_grand_total";
    confidence = "MEDIUM";
    notes.push(
      `P0-inflation-guard: labelled grand(${grand_total}) trusted over inflated summed_main(${summed_main})`,
    );
  } else if (hasLabelledMain || hasLabelledSubtotal) {
    // Priority 1: explicit labelled main total
    main_total = round2((hasLabelledMain ? labelled.main_total : labelled.subtotal) as number);
    optional_total = hasLabelledOptional ? round2(labelled.optional_total as number) : summed_optional;
    excluded_total = hasLabelledExcluded ? round2(labelled.excluded_total as number) : summed_excluded;
    grand_total = hasLabelledGrand ? round2(labelled.grand_total as number) : round2(main_total + optional_total);
    resolution_source = "consensus[labelled-main]";
    confidence = "HIGH";
    notes.push(`P1: main = labelled ${hasLabelledMain ? "main_total" : "subtotal"}(${main_total})`);
  } else if (hasLabelledGrand && hasLabelledOptional) {
    // Priority 2: grand - optional
    grand_total = round2(labelled.grand_total as number);
    optional_total = round2(labelled.optional_total as number);
    main_total = round2(Math.max(0, grand_total - optional_total));
    excluded_total = hasLabelledExcluded ? round2(labelled.excluded_total as number) : summed_excluded;
    resolution_source = "consensus[grand-optional]";
    confidence = "HIGH";
    notes.push(`P2: main = labelled grand(${grand_total}) - labelled optional(${optional_total})`);
  } else if (hasLabelledGrand) {
    // Priority 2 (partial): labelled grand only
    grand_total = round2(labelled.grand_total as number);
    optional_total = summed_optional;
    excluded_total = hasLabelledExcluded ? round2(labelled.excluded_total as number) : summed_excluded;
    main_total = summed_optional > 0 ? round2(Math.max(0, grand_total - summed_optional)) : round2(grand_total);
    resolution_source = "labelled_grand_total";
    confidence = "MEDIUM";
    notes.push(`P2-partial: main = labelled grand(${grand_total}) - summed optional(${summed_optional})`);
  } else if (summed_main > 0 || summed_optional > 0) {
    // Priority 3: classified row sums
    main_total = summed_main;
    optional_total = summed_optional;
    excluded_total = summed_excluded;
    grand_total = round2(summed_main + summed_optional);
    resolution_source = "consensus[main+optional]";
    confidence = summed_main > 0 ? "MEDIUM" : "LOW";
    notes.push(`P3: grand = summed main(${summed_main}) + summed optional(${summed_optional})`);
  } else if (raw_row_sum > 0) {
    // Priority 4: raw row_sum fallback
    main_total = raw_row_sum;
    optional_total = 0;
    excluded_total = summed_excluded;
    grand_total = raw_row_sum;
    resolution_source = "summed_rows_fallback";
    confidence = "LOW";
    notes.push(`P4: raw_row_sum(${raw_row_sum}) — no labels, no classification`);
  } else {
    main_total = 0;
    optional_total = 0;
    excluded_total = summed_excluded;
    grand_total = 0;
    resolution_source = "summed_rows_fallback";
    confidence = "LOW";
    notes.push("no labelled totals and no priced rows — review required");
  }

  // Sanity: reconcile labelled grand vs main+optional using tolerance = max(1%, $1).
  // Was previously a flat 2% which caused false-positive HIGH on small-value quotes.
  const tolerance = computeTotalsTolerance(labelled.grand_total ?? grand_total);
  let deltaVsLabelled: number | null = null;
  let withinTolerance: boolean | null = null;
  if (hasLabelledGrand && resolution_source !== "consensus[grand-optional]") {
    const calc = main_total + optional_total;
    const labelledGrand = labelled.grand_total as number;
    if (labelledGrand > 0) {
      const absDelta = Math.abs(calc - labelledGrand);
      deltaVsLabelled = round2(absDelta);
      withinTolerance = absDelta <= tolerance.effective;
      if (!withinTolerance) {
        confidence = confidence === "HIGH" ? "MEDIUM" : "LOW";
        notes.push(
          `labelled grand(${labelledGrand}) disagrees with main+optional(${round2(calc)}) by $${round2(absDelta)} ` +
          `(tolerance max(1%,$1) = $${round2(tolerance.effective)})`
        );
      } else {
        notes.push(`within tolerance: delta $${round2(absDelta)} <= $${round2(tolerance.effective)}`);
      }
    }
  }

  // Dual-option PDF detection (generic, no supplier rules).
  // Signal A: >=2 distinct labelled grand totals at distant positions.
  // Signal B: summed_main exceeds labelled_grand by >=40% with optional scope
  //           not accounting for the overflow (rows from 2 options collapsed).
  // Signal C: >=2 subtotal labels each ~= a separate grand value (option blocks).
  const dual_option_reasons: string[] = [];
  const grandLabels = labelled.labels_found.filter((l) => l.kind === "grand");
  const distinctGrands = Array.from(
    new Set(grandLabels.map((l) => round2(l.value))),
  ).filter((v) => v > 0);
  if (distinctGrands.length >= 2) {
    const minPos = Math.min(...grandLabels.map((l) => l.position));
    const maxPos = Math.max(...grandLabels.map((l) => l.position));
    if (maxPos - minPos > 1000) {
      dual_option_reasons.push(
        `multiple distinct grand totals at distant positions: [${distinctGrands.join(", ")}] spread=${maxPos - minPos}`,
      );
    }
  }
  if (hasLabelledGrand) {
    const lg = labelled.grand_total as number;
    const mainOverflowRatio = lg > 0 ? summed_main / lg : 0;
    const uncoveredOverflow = summed_main - (lg + summed_optional);
    if (mainOverflowRatio >= 1.4 && uncoveredOverflow > tolerance.effective) {
      dual_option_reasons.push(
        `summed_main(${summed_main}) exceeds labelled_grand(${lg}) by ${(mainOverflowRatio * 100 - 100).toFixed(0)}% — suggests two options merged`,
      );
    }
  }
  const subtotalLabels = labelled.labels_found.filter((l) => l.kind === "subtotal");
  const distinctSubtotals = Array.from(
    new Set(subtotalLabels.map((l) => round2(l.value))),
  ).filter((v) => v > 0);
  if (
    distinctSubtotals.length >= 2 &&
    distinctGrands.length >= 2 &&
    Math.min(...distinctSubtotals) > 0
  ) {
    const ratio = Math.max(...distinctSubtotals) / Math.min(...distinctSubtotals);
    if (ratio >= 1.15 && ratio <= 3) {
      dual_option_reasons.push(
        `multiple subtotals of different magnitudes alongside multiple grand totals — option blocks suspected`,
      );
    }
  }
  const dual_option_suspected = dual_option_reasons.length > 0;
  if (dual_option_suspected) {
    notes.push(`dual-option PDF suspected: ${dual_option_reasons.join("; ")}`);
  }

  const page_footer_totals_found = grandLabels.length > 0 || labelled.subtotal !== null;

  // No negative main totals ever (Priority rule 4).
  let negativeMainClamped = false;
  if (main_total < 0) {
    notes.push(`main_total clamp: raw ${main_total} < 0 — forced to 0`);
    main_total = 0;
    negativeMainClamped = true;
  }
  if (optional_total < 0) optional_total = 0;
  if (excluded_total < 0) excluded_total = 0;

  // Parse anomaly badges.
  const parse_anomalies: ParseAnomaly[] = [];
  const anyLabels = labelled.labels_found.length > 0;
  if (!anyLabels) parse_anomalies.push("no_labelled_totals");
  if (resolution_source === "summed_rows_fallback" || (!anyLabels && raw_row_sum > 0)) {
    parse_anomalies.push("row_sum_only");
  }
  if (distinctGrands.length >= 2) parse_anomalies.push("multiple_grand_totals");
  if (subtotalPlusQaMatch) parse_anomalies.push("subtotal_plus_qa_match");
  if (hasLabelledOptional || summed_optional > 0) parse_anomalies.push("optional_detected");
  if (dual_option_suspected) parse_anomalies.push("dual_option_detected");
  if (withinTolerance === false) parse_anomalies.push("outside_tolerance");
  if (negativeMainClamped) parse_anomalies.push("negative_main_clamped");
  if (hasSummaryTotal) parse_anomalies.push("summary_total_trusted");
  if (rowSumsRejected) {
    parse_anomalies.push("row_sum_rejected_inflated");
    parse_anomalies.push("schedule_subtotals_ignored");
  }

  // Build quote_variants. When dual-option is suspected, each distinct grand
  // label becomes its own variant so items are NEVER merged across options.
  // Primary variant = the footer-selected (last-occurring) grand total, which
  // matches what the rest of the pipeline treats as canonical.
  const variants: QuoteVariant[] = [];
  if (dual_option_suspected && distinctGrands.length >= 2) {
    const sortedGrandHits = [...grandLabels].sort((a, b) => a.position - b.position);
    const primaryGrandValue = sortedGrandHits[sortedGrandHits.length - 1]?.value ?? null;
    const seen = new Set<number>();
    let idx = 0;
    for (const hit of sortedGrandHits) {
      const gv = round2(hit.value);
      if (seen.has(gv)) continue;
      seen.add(gv);
      const nearestSubtotal = [...subtotalLabels]
        .filter((s) => s.position < hit.position)
        .sort((a, b) => b.position - a.position)[0] ?? null;
      const subVal = nearestSubtotal ? round2(nearestSubtotal.value) : null;
      const optVal = subVal !== null ? round2(Math.max(0, gv - subVal)) : 0;
      variants.push({
        variant_index: idx,
        variant_label: `Option ${idx + 1}`,
        main_total: subVal !== null ? subVal : gv,
        optional_total: optVal,
        grand_total: gv,
        is_primary: primaryGrandValue !== null && round2(primaryGrandValue) === gv,
        source_evidence: {
          grand_label_position: hit.position,
          subtotal_label_position: nearestSubtotal?.position ?? null,
          grand_value: gv,
          subtotal_value: subVal,
        },
      });
      idx += 1;
    }
    if (!variants.some((v) => v.is_primary) && variants.length > 0) {
      variants[variants.length - 1].is_primary = true;
    }
  }

  // Confidence recalibration based on evidence quality:
  //   HIGH:   labelled grand + (subtotal+qa match OR labelled main) AND within tolerance AND not dual-option
  //   MEDIUM: labelled grand OR labelled main, minor gaps (no tolerance break, no dual-option)
  //   LOW:    row_sum_only, outside_tolerance, dual_option unresolved, or no labels at all
  const hasStrongEvidence =
    subtotalPlusQaMatch ||
    (hasLabelledGrand && (hasLabelledMain || (hasLabelledSubtotal && hasLabelledOptional)));
  const hasBrokenEvidence =
    withinTolerance === false ||
    dual_option_suspected ||
    parse_anomalies.includes("row_sum_only") ||
    parse_anomalies.includes("no_labelled_totals");

  if (hasBrokenEvidence) {
    confidence = "LOW";
  } else if (hasStrongEvidence && grand_total > 0) {
    confidence = "HIGH";
  } else if (hasLabelledGrand || hasLabelledMain || hasLabelledSubtotal) {
    confidence = "MEDIUM";
  } else {
    confidence = "LOW";
  }

  // Review gate: raw-row-sum fallback is explicitly untrusted.
  let requires_review = false;
  let review_reason: string | null = null;
  if (resolution_source === "summed_rows_fallback") {
    requires_review = true;
    review_reason = "totals resolved via raw row-sum fallback — no labelled totals and no classified rows";
  } else if (confidence === "LOW") {
    requires_review = true;
    review_reason = "totals confidence LOW";
  } else if (!(grand_total > 0)) {
    requires_review = true;
    review_reason = "zero grand total";
  } else if (withinTolerance === false) {
    // Priority rule 6: if uncertain -> review_required.
    requires_review = true;
    review_reason = `labelled grand vs main+optional outside tolerance (delta $${deltaVsLabelled})`;
    confidence = confidence === "HIGH" ? "MEDIUM" : confidence;
  } else if (dual_option_suspected) {
    requires_review = true;
    review_reason = `dual-option quote suspected — ${dual_option_reasons[0]}`;
    confidence = confidence === "HIGH" ? "MEDIUM" : confidence;
  } else if (
    !hasLabelledGrand &&
    !hasLabelledMain &&
    !hasLabelledSubtotal &&
    summed_main + summed_optional > 0
  ) {
    // No labelled evidence whatsoever — uncertain by definition.
    requires_review = true;
    review_reason = "no labelled totals found in document — totals inferred from row sums only";
    confidence = "LOW";
  }

  const evidence: TotalsEvidenceSnapshot = {
    resolution_source,
    confidence,
    tolerance_applied: tolerance,
    labelled,
    summed: { main: summed_main, optional: summed_optional, excluded: summed_excluded },
    final: { main: main_total, optional: optional_total, excluded: excluded_total, grand: grand_total },
    delta_vs_labelled_grand: deltaVsLabelled,
    within_tolerance: withinTolerance,
    dual_option_suspected,
    dual_option_reasons,
    distinct_grand_totals: distinctGrands,
    page_footer_totals_found,
    parse_anomalies,
    variants,
    subtotal_plus_optional_matches_grand: subtotalPlusQaMatch || null,
    summary_total_detected: hasSummaryTotal,
    summary_total_value: hasSummaryTotal ? (labelled.summary_total as number) : null,
    summary_block_position: labelled.summary_block_position,
    grand_total_candidates: labelled.grand_candidates,
    chosen_grand_candidate_position: labelled.summary_total_position,
    row_sum_rejected: rowSumsRejected,
    authoritative_grand_source: hasSummaryTotal
      ? "summary"
      : hasLabelledGrand
        ? "labelled_grand"
        : hasLabelledMain || hasLabelledSubtotal
          ? "labelled_main"
          : grand_total > 0
            ? "summed"
            : "none",
    notes: [...notes],
    decided_at: new Date().toISOString(),
  };

  return {
    main_total,
    optional_total,
    excluded_total,
    grand_total,
    resolution_source,
    confidence,
    summed_main,
    summed_optional,
    summed_excluded,
    labelled,
    notes,
    requires_review,
    review_reason,
    evidence,
    parse_anomalies,
    variants,
  };
}

/**
 * Confidence ordering helper. HIGH > MEDIUM > LOW.
 * Used by the writer to prevent lower-confidence reparses from overwriting
 * a previously-stored HIGH confidence totals decision.
 */
export function confidenceRank(c: string | null | undefined): number {
  if (c === "HIGH") return 3;
  if (c === "MEDIUM") return 2;
  if (c === "LOW") return 1;
  return 0;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
