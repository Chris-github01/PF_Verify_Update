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
  raw_response?: string;
  parsed?: ValueReviewOutput;
  elapsed_ms?: number;
  cost_estimate_usd?: number;
  error?: string;
  /** true when GPT output was worse than deterministic — caller should fallback */
  fallback_to_deterministic: boolean;
  /** true when final confidence < 0.65 — caller should mark for review */
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
export function shouldRunValueReview(input: ValueReviewInput): { run: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const items = input.candidateItems;
  const totals = input.candidateTotals;

  if (input.candidateConfidence < 0.82) reasons.push(`confidence<0.82 (${input.candidateConfidence.toFixed(2)})`);

  const labelledTotal = totals.grand_total ?? totals.subtotal;
  if (labelledTotal && totals.row_sum && labelledTotal > 0) {
    const diffRatio = Math.abs(labelledTotal - totals.row_sum) / labelledTotal;
    if (diffRatio > 0.03) reasons.push(`row_sum vs labelled divergence=${(diffRatio * 100).toFixed(1)}%`);
  }

  if (items.length > 0) {
    const suspicious = items.filter(
      (it) =>
        (it.qty === 1 || it.qty === null) &&
        it.rate !== null &&
        it.total !== null &&
        Math.abs((it.rate ?? 0) - (it.total ?? 0)) < 0.01,
    ).length;
    if (suspicious / items.length > 0.15) {
      reasons.push(`>${(suspicious / items.length * 100).toFixed(0)}% rows have qty=1 with rate=total`);
    }
  }

  const optionalItems = items.filter((it) => it.scope === "Optional").length;
  if (optionalItems > 0 && !totals.optional_total) {
    reasons.push("optional items detected but optional total missing");
  }

  if ((input.duplicatesRemovedCount ?? 0) > 10) reasons.push(`duplicate removals=${input.duplicatesRemovedCount}`);
  if (items.length > 20) reasons.push(`row_count=${items.length}>20`);
  if ((input.arithmeticMismatchCount ?? 0) > 0) reasons.push(`arithmetic mismatches=${input.arithmeticMismatchCount}`);

  return { run: reasons.length > 0, reasons };
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

function validateGptJson(obj: unknown): ValueReviewOutput | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  if (!o.final_totals || typeof o.final_totals !== "object") return null;
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
  return { items, final_totals, document_confidence, warnings };
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
    return { used: false, skipped_reason: "no trigger met", trigger_reasons: [], fallback_to_deterministic: false, mark_for_review: false };
  }
  if (!opts.openAiKey) {
    return { used: false, skipped_reason: "OPENAI_API_KEY missing", trigger_reasons: decision.reasons, fallback_to_deterministic: false, mark_for_review: false };
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
      return {
        used: false,
        trigger_reasons: decision.reasons,
        skipped_reason: `HTTP ${res.status}`,
        error: errText.slice(0, 300),
        fallback_to_deterministic: true,
        mark_for_review: false,
      };
    }

    const body = await res.json();
    const raw = body?.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        used: true,
        trigger_reasons: decision.reasons,
        raw_response: raw.slice(0, 1000),
        error: "Invalid JSON from GPT",
        fallback_to_deterministic: true,
        mark_for_review: true,
        elapsed_ms: Date.now() - started,
        cost_estimate_usd: estimateCostUsd(userMessage.length, raw.length),
      };
    }

    const validated = validateGptJson(parsed);
    if (!validated) {
      return {
        used: true,
        trigger_reasons: decision.reasons,
        raw_response: raw.slice(0, 1000),
        error: "GPT JSON failed schema validation",
        fallback_to_deterministic: true,
        mark_for_review: true,
        elapsed_ms: Date.now() - started,
        cost_estimate_usd: estimateCostUsd(userMessage.length, raw.length),
      };
    }

    const evaluation = evaluateGptOutput(input.candidateItems, validated);
    const warnings = [...validated.warnings];
    if (evaluation.arithmetic_mismatches > 0) {
      warnings.push(`${evaluation.arithmetic_mismatches} GPT-corrected rows failed arithmetic recheck`);
    }
    validated.warnings = warnings;

    return {
      used: true,
      trigger_reasons: decision.reasons,
      raw_response: raw.slice(0, 1000),
      parsed: validated,
      fallback_to_deterministic: evaluation.fallback,
      mark_for_review: evaluation.mark_for_review,
      elapsed_ms: Date.now() - started,
      cost_estimate_usd: estimateCostUsd(userMessage.length, raw.length),
    };
  } catch (err) {
    return {
      used: false,
      trigger_reasons: decision.reasons,
      skipped_reason: "network/exception",
      error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      fallback_to_deterministic: true,
      mark_for_review: false,
      elapsed_ms: Date.now() - started,
    };
  }
}
