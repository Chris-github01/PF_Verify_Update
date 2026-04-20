/**
 * GPT-4o-mini Value Reviewer
 *
 * Validates and corrects deterministic parser output.
 * NOT used for metadata/tagging — used for VALUE DECISION MAKING:
 *   - qty/rate/total column alignment
 *   - rows using total as unit rate
 *   - incorrectly defaulted qty=1 rows
 *   - optional items mixed into main
 *   - row-sum vs labelled grand total conflicts
 *   - incorrect duplicate removals
 *   - final trusted document totals
 */

export interface CandidateItem {
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  scope?: "Main" | "Optional" | "Excluded" | null;
  line_number?: number | null;
  block?: string | null;
  confidence?: number | null;
}

export interface CandidateTotals {
  grand_total: number | null;
  subtotal: number | null;
  optional_total: number | null;
  row_sum: number | null;
  source: string | null;
  labelled_total_label?: string | null;
}

export interface ValueReviewInput {
  documentText: string;
  candidateItems: CandidateItem[];
  candidateTotals: CandidateTotals;
  warnings: string[];
  candidateConfidence: number;
  duplicatesRemovedCount?: number;
  arithmeticMismatchCount?: number;
  /** true when final total came from row_sum while no labelled total was found */
  rowSumChosenWithoutLabelledTotal?: boolean;
}

export interface TriggerDebugEntry {
  id: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  name: string;
  threshold: string;
  measured: string | number | boolean | null;
  fired: boolean;
}

export interface ValueReviewItem {
  description: string;
  qty: number | null;
  unit: string;
  rate: number | null;
  total: number | null;
  scope: "Main" | "Optional" | "Excluded";
  confidence: number;
  reason: string;
}

export interface ValueReviewTotals {
  main_total: number | null;
  optional_total: number | null;
  excluded_total: number | null;
  grand_total: number | null;
}

export interface ValueReviewOutput {
  items: ValueReviewItem[];
  final_totals: ValueReviewTotals;
  document_confidence: number;
  warnings: string[];
}

export interface ValueReviewResult {
  used: boolean;
  skipped_reason?: string;
  trigger_reasons: string[];
  trigger_debug: TriggerDebugEntry[];
  raw_response?: string;
  parsed?: ValueReviewOutput;
  elapsed_ms?: number;
  cost_estimate_usd?: number;
  error?: string;
  error_detail?: string;
  http_status?: number;
  fallback_to_deterministic: boolean;
  mark_for_review: boolean;
}

const SYSTEM_PROMPT = `You are a commercial construction quote parser.
Your task is to validate and correct extracted quote values.

Rules:
1. Never invent numbers.
2. Prefer labelled totals:
   Grand Total > Total Ex GST > Contract Sum > Subtotal > Row Sum
3. If qty x rate is approximately equal to total, trust row.
4. If row total equals unit rate and qty missing, likely unit rate/total confusion.
5. Preserve unknown values as null.
6. Detect Optional / Add Alternate / Excluded sections.
7. Keep repeated rows if they belong to different blocks / locations.
8. Return only valid JSON.`;

const MAX_DOCUMENT_TEXT_CHARS = 60_000;
const MAX_CANDIDATE_ITEMS = 400;

/**
 * Decide whether GPT value review should run based on deterministic output.
 */
const SCOPE_HINT_REGEX = /\b(optional|add[\s-]?alternate|excluded|exclusion|variation|provisional[\s-]?sum|extra|extras|add[\s-]?on)\b/i;

export function shouldRunValueReview(
  input: ValueReviewInput,
): { run: boolean; reasons: string[]; debug: TriggerDebugEntry[] } {
  const items = input.candidateItems;
  const totals = input.candidateTotals;
  const debug: TriggerDebugEntry[] = [];

  // A: >25% rows qty=1
  const qtyOneCount = items.filter((it) => it.qty === 1).length;
  const qtyOneRatio = items.length > 0 ? qtyOneCount / items.length : 0;
  debug.push({
    id: "A",
    name: ">25% rows qty=1",
    threshold: ">0.25",
    measured: `${qtyOneCount}/${items.length}=${(qtyOneRatio * 100).toFixed(1)}%`,
    fired: qtyOneRatio > 0.25,
  });

  // B: >10% rows rate == total
  const rateEqTotalCount = items.filter(
    (it) =>
      it.rate !== null &&
      it.total !== null &&
      it.rate > 0 &&
      Math.abs((it.rate ?? 0) - (it.total ?? 0)) < 0.01,
  ).length;
  const rateEqTotalRatio = items.length > 0 ? rateEqTotalCount / items.length : 0;
  debug.push({
    id: "B",
    name: ">10% rows rate==total",
    threshold: ">0.10",
    measured: `${rateEqTotalCount}/${items.length}=${(rateEqTotalRatio * 100).toFixed(1)}%`,
    fired: rateEqTotalRatio > 0.10,
  });

  // C: any row OR raw text contains scope hint words
  const hintInItems = items.some((it) => SCOPE_HINT_REGEX.test(it.description || ""));
  const hintInText = SCOPE_HINT_REGEX.test(input.documentText || "");
  debug.push({
    id: "C",
    name: "scope hint (Optional|Excluded|Variation|Extra)",
    threshold: "presence",
    measured: `itemMatch=${hintInItems},textMatch=${hintInText}`,
    fired: hintInItems || hintInText,
  });

  // D: duplicate removals > 5
  const dupRemoved = input.duplicatesRemovedCount ?? 0;
  debug.push({
    id: "D",
    name: "duplicate removals >5",
    threshold: ">5",
    measured: dupRemoved,
    fired: dupRemoved > 5,
  });

  // E: items > 25
  debug.push({
    id: "E",
    name: "items>25",
    threshold: ">25",
    measured: items.length,
    fired: items.length > 25,
  });

  // F: row_sum chosen as final total while labelled totals missing
  const labelledMissing =
    (totals.grand_total === null || totals.grand_total === 0) &&
    (totals.subtotal === null || totals.subtotal === 0);
  const rowSumChosen =
    input.rowSumChosenWithoutLabelledTotal === true ||
    (labelledMissing && (totals.row_sum ?? 0) > 0) ||
    (typeof totals.source === "string" && /row[_ -]?sum/i.test(totals.source));
  debug.push({
    id: "F",
    name: "row_sum chosen while labelled totals missing",
    threshold: "true",
    measured: `labelledMissing=${labelledMissing},rowSumChosen=${rowSumChosen},source=${totals.source ?? "null"}`,
    fired: rowSumChosen && labelledMissing,
  });

  // G: confidence <= 0.80
  debug.push({
    id: "G",
    name: "confidence<=0.80",
    threshold: "<=0.80",
    measured: input.candidateConfidence.toFixed(3),
    fired: input.candidateConfidence <= 0.80,
  });

  const reasons = debug.filter((d) => d.fired).map((d) => `${d.id}:${d.name} [${d.measured}]`);
  return { run: reasons.length > 0, reasons, debug };
}

/** Estimate GPT-4o-mini cost: ~$0.15/M input tokens, ~$0.60/M output tokens. */
function estimateCostUsd(promptChars: number, responseChars: number): number {
  const inputTokens = promptChars / 4;
  const outputTokens = responseChars / 4;
  return (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.60;
}

function truncateDocumentText(text: string): string {
  if (text.length <= MAX_DOCUMENT_TEXT_CHARS) return text;
  const head = text.slice(0, Math.floor(MAX_DOCUMENT_TEXT_CHARS * 0.7));
  const tail = text.slice(text.length - Math.floor(MAX_DOCUMENT_TEXT_CHARS * 0.3));
  return `${head}\n...[truncated]...\n${tail}`;
}

function truncateCandidateItems(items: CandidateItem[]): CandidateItem[] {
  if (items.length <= MAX_CANDIDATE_ITEMS) return items;
  return items.slice(0, MAX_CANDIDATE_ITEMS);
}

function validateGptJson(obj: unknown): { ok: ValueReviewOutput } | { reason: string } {
  if (!obj || typeof obj !== "object") return { reason: `root not object (typeof=${typeof obj})` };
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.items)) {
    const keys = Object.keys(o).slice(0, 20).join(",");
    return { reason: `items not array (typeof=${typeof o.items}); top-level keys=[${keys}]` };
  }
  if (!o.final_totals || typeof o.final_totals !== "object") {
    return { reason: `final_totals missing or not object (typeof=${typeof o.final_totals})` };
  }
  const items = (o.items as unknown[])
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const it = raw as Record<string, unknown>;
      const scope = typeof it.scope === "string" && ["Main", "Optional", "Excluded"].includes(it.scope) ? it.scope : "Main";
      return {
        description: typeof it.description === "string" ? it.description : "",
        qty: typeof it.qty === "number" ? it.qty : null,
        unit: typeof it.unit === "string" ? it.unit : "",
        rate: typeof it.rate === "number" ? it.rate : null,
        total: typeof it.total === "number" ? it.total : null,
        scope: scope as "Main" | "Optional" | "Excluded",
        confidence: typeof it.confidence === "number" ? it.confidence : 0.7,
        reason: typeof it.reason === "string" ? it.reason : "",
      } as ValueReviewItem;
    })
    .filter((x): x is ValueReviewItem => x !== null && x.description.length > 0);

  const ft = o.final_totals as Record<string, unknown>;
  const final_totals: ValueReviewTotals = {
    main_total: typeof ft.main_total === "number" ? ft.main_total : null,
    optional_total: typeof ft.optional_total === "number" ? ft.optional_total : null,
    excluded_total: typeof ft.excluded_total === "number" ? ft.excluded_total : null,
    grand_total: typeof ft.grand_total === "number" ? ft.grand_total : null,
  };
  const document_confidence = typeof o.document_confidence === "number" ? o.document_confidence : 0.7;
  const warnings = Array.isArray(o.warnings) ? (o.warnings as unknown[]).filter((w) => typeof w === "string").map((w) => w as string) : [];
  if (items.length === 0) {
    const rawItemCount = (o.items as unknown[]).length;
    return { reason: `all ${rawItemCount} items rejected (missing description or non-object entries)` };
  }
  return { ok: { items, final_totals, document_confidence, warnings } };
}

/**
 * Post-review validation:
 *   - Recheck arithmetic qty*rate ≈ total
 *   - If GPT drops too many items vs deterministic, fallback
 *   - If GPT confidence < 0.65, mark for review
 */
function evaluateGptOutput(
  deterministic: CandidateItem[],
  gpt: ValueReviewOutput,
): { fallback: boolean; mark_for_review: boolean; arithmetic_mismatches: number } {
  let arithmeticMismatches = 0;
  for (const it of gpt.items) {
    if (it.qty !== null && it.rate !== null && it.total !== null && it.total > 0) {
      const expected = it.qty * it.rate;
      const tol = Math.max(it.total * 0.02, 0.5);
      if (Math.abs(expected - it.total) > tol) arithmeticMismatches++;
    }
  }

  const itemLossRatio = deterministic.length > 0
    ? Math.max(0, (deterministic.length - gpt.items.length) / deterministic.length)
    : 0;

  const fallback =
    itemLossRatio > 0.40 ||
    (gpt.final_totals.grand_total === null && gpt.final_totals.main_total === null) ||
    gpt.items.length === 0;

  const mark_for_review = gpt.document_confidence < 0.65;

  return { fallback, mark_for_review, arithmetic_mismatches: arithmeticMismatches };
}

/**
 * Run the GPT-4o-mini value reviewer.
 * Returns `used=false` with `skipped_reason` when triggers are not met or key absent.
 */
export async function runValueReview(
  input: ValueReviewInput,
  opts: { openAiKey: string; forceRun?: boolean },
): Promise<ValueReviewResult> {
  const decision = shouldRunValueReview(input);
  if (!opts.forceRun && !decision.run) {
    return {
      used: false,
      skipped_reason: "no trigger met",
      trigger_reasons: [],
      trigger_debug: decision.debug,
      fallback_to_deterministic: false,
      mark_for_review: false,
    };
  }
  if (!opts.openAiKey) {
    return {
      used: false,
      skipped_reason: "OPENAI_API_KEY missing",
      trigger_reasons: decision.reasons,
      trigger_debug: decision.debug,
      fallback_to_deterministic: false,
      mark_for_review: false,
    };
  }

  const userPayload = {
    document_text: truncateDocumentText(input.documentText),
    candidate_items: truncateCandidateItems(input.candidateItems),
    candidate_totals: input.candidateTotals,
    warnings: input.warnings.slice(0, 20),
  };

  const userMessage = JSON.stringify(userPayload);
  const started = Date.now();

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[GPT Value Review] HTTP ${res.status} — ${errText.slice(0, 500)}`);
      return {
        used: false,
        trigger_reasons: decision.reasons,
        trigger_debug: decision.debug,
        skipped_reason: `HTTP ${res.status}`,
        http_status: res.status,
        error: `OpenAI HTTP ${res.status}`,
        error_detail: errText.slice(0, 600),
        fallback_to_deterministic: true,
        mark_for_review: false,
        elapsed_ms: Date.now() - started,
      };
    }

    const body = await res.json();
    const raw = body?.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (je) {
      console.error("[GPT Value Review] JSON parse failed:", je);
      return {
        used: true,
        trigger_reasons: decision.reasons,
        trigger_debug: decision.debug,
        raw_response: raw.slice(0, 1000),
        error: "Invalid JSON from GPT",
        error_detail: je instanceof Error ? je.message.slice(0, 400) : String(je).slice(0, 400),
        fallback_to_deterministic: true,
        mark_for_review: true,
        elapsed_ms: Date.now() - started,
        cost_estimate_usd: estimateCostUsd(userMessage.length, raw.length),
      };
    }

    const validation = validateGptJson(parsed);
    if ("reason" in validation) {
      console.error(
        `[GPT Value Review] schema validation failed: ${validation.reason} | raw_preview=${raw.slice(0, 300)}`,
      );
      return {
        used: true,
        trigger_reasons: decision.reasons,
        trigger_debug: decision.debug,
        raw_response: raw.slice(0, 2000),
        error: "GPT JSON failed schema validation",
        error_detail: validation.reason,
        fallback_to_deterministic: true,
        mark_for_review: true,
        elapsed_ms: Date.now() - started,
        cost_estimate_usd: estimateCostUsd(userMessage.length, raw.length),
      };
    }
    const validated = validation.ok;

    const evaluation = evaluateGptOutput(input.candidateItems, validated);
    const warnings = [...validated.warnings];
    if (evaluation.arithmetic_mismatches > 0) {
      warnings.push(`${evaluation.arithmetic_mismatches} GPT-corrected rows failed arithmetic recheck`);
    }
    validated.warnings = warnings;

    return {
      used: true,
      trigger_reasons: decision.reasons,
      trigger_debug: decision.debug,
      raw_response: raw.slice(0, 1000),
      parsed: validated,
      fallback_to_deterministic: evaluation.fallback,
      mark_for_review: evaluation.mark_for_review,
      elapsed_ms: Date.now() - started,
      cost_estimate_usd: estimateCostUsd(userMessage.length, raw.length),
    };
  } catch (err) {
    console.error("[GPT Value Review] network/exception:", err);
    return {
      used: false,
      trigger_reasons: decision.reasons,
      trigger_debug: decision.debug,
      skipped_reason: "network/exception",
      error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      error_detail: err instanceof Error && err.stack ? err.stack.slice(0, 800) : undefined,
      fallback_to_deterministic: true,
      mark_for_review: false,
      elapsed_ms: Date.now() - started,
    };
  }
}
