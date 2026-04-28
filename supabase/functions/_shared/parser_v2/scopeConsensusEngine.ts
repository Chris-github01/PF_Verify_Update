/**
 * scopeConsensusEngine — weighted 3-pass consensus classifier plus a
 * consistency pass over rows that conflict with their section-mates.
 *
 * Passes:
 *   1. structural (weight 0.50)
 *   2. semantic   (weight 0.30)
 *   3. commercial (weight 0.20)
 *
 * Per row:
 *   - collect one vote per pass (Main/Optional/Excluded/Metadata)
 *   - weight each vote by (passWeight * normalisedConfidence)
 *   - pick the class with the highest weighted score
 *
 * Consistency pass:
 *   - group rows by detected_section (after consensus)
 *   - for each group, if any row's class disagrees with the group
 *     majority, re-submit the whole group to the LLM with the
 *     consistency prompt and take the new classification
 *
 * The engine returns the same ScopeSegmentationResult shape as v4 so
 * runParserV2 can consume it without branching.
 */

import type { ParsedLineItemV2 } from "./runParserV2.ts";
import {
  classifyRowsLLMV4,
  SCOPE_SEGMENTATION_MODEL,
  type LLMClassifyResult,
  type LLMRowResult,
  type LLMScope,
} from "./scopeSegmentationLLM.ts";
import type {
  ScopeSegmentationInput,
  ScopeSegmentationItem,
  ScopeSegmentationResult,
  ScopeLabel,
} from "./scopeSegmentationEngine.ts";
import type { ScopeRowPacket } from "./scopeSegmentationPrompt.ts";
import {
  STRUCTURAL_PROMPT,
  SEMANTIC_PROMPT,
  COMMERCIAL_PROMPT,
  CONSISTENCY_PROMPT,
} from "./scopeConsensusPrompts.ts";
import { buildRowPacketsForConsensus } from "./scopeSegmentationEngine.ts";

export const CONSENSUS_VERSION = "llm_scope_consensus_v1";

const WEIGHTS: Record<"structural" | "semantic" | "commercial", number> = {
  structural: 0.5,
  semantic: 0.3,
  commercial: 0.2,
};

type PassTag = "structural" | "semantic" | "commercial";

type PassResult = {
  tag: PassTag;
  status: "ok" | "failed";
  runtime_ms: number;
  rows: Map<number, LLMRowResult>;
  error: string | null;
  error_type: string | null;
  warnings: string[];
};

export type ConsensusRowAudit = {
  row_index: number;
  final_scope: LLMScope;
  final_confidence: number;
  detected_section: string | null;
  votes: Array<{
    pass: PassTag;
    scope: LLMScope | null;
    confidence: number;
  }>;
  consistency_flipped: boolean;
  consistency_from: LLMScope | null;
};

export type ConsensusSummary = {
  consensus_version: string;
  status: "ok" | "failed";
  runtime_ms: number;
  model_used: string;
  passes: Array<{
    tag: PassTag;
    status: "ok" | "failed";
    runtime_ms: number;
    error: string | null;
  }>;
  rows_classified_main: number;
  rows_classified_optional: number;
  rows_classified_excluded: number;
  rows_classified_metadata: number;
  rows_classified_unknown: number;
  main_total: number;
  optional_total: number;
  overall_confidence: "HIGH" | "MEDIUM" | "LOW";
  consistency_flips: number;
  error: string | null;
  debug_hint: string | null;
  requires_scope_review: boolean;
};

export type ConsensusResult = {
  items: ScopeSegmentationItem[];
  summary: ConsensusSummary;
  audit: ConsensusRowAudit[];
};

export async function runScopeConsensusEngine(
  input: ScopeSegmentationInput,
): Promise<ConsensusResult> {
  const start = Date.now();
  const items = input.extracted_items;

  if (items.length === 0) {
    return {
      items: [],
      summary: emptySummary(Date.now() - start),
      audit: [],
    };
  }

  const packets = buildRowPacketsForConsensus(items, input.allPages ?? []);
  const totalsByRow = new Map<number, number | null>();
  for (let i = 0; i < items.length; i++) {
    totalsByRow.set(i, items[i].total_price ?? null);
  }

  const passes = await Promise.all([
    runPass("structural", STRUCTURAL_PROMPT, packets, totalsByRow, input),
    runPass("semantic", SEMANTIC_PROMPT, packets, totalsByRow, input),
    runPass("commercial", COMMERCIAL_PROMPT, packets, totalsByRow, input),
  ]);

  const allFailed = passes.every((p) => p.status === "failed");
  if (allFailed) {
    const first = passes[0];
    const passthrough = items.map((it, i) => ({
      ...it,
      scope_segmentation_label: "Unknown" as ScopeLabel,
      scope_confidence: 0,
      scope_reason: `consensus_all_passes_failed:${first.error ?? "unknown"}`.slice(0, 200),
      scope_section_id: null,
      scope_group_id: null,
      scope_heading_basis: null,
    })) as ScopeSegmentationItem[];
    return {
      items: passthrough,
      summary: {
        ...emptySummary(Date.now() - start),
        status: "failed",
        passes: passes.map((p) => ({
          tag: p.tag,
          status: p.status,
          runtime_ms: p.runtime_ms,
          error: p.error,
        })),
        rows_classified_unknown: items.length,
        error: first.error,
        debug_hint: `all 3 passes failed; first=${first.error_type}:${first.error}`,
        requires_scope_review: true,
      },
      audit: [],
    };
  }

  // Weighted vote per row.
  const audit: ConsensusRowAudit[] = [];
  const finalByIndex = new Map<number, {
    scope: LLMScope;
    confidence: number;
    basis: LLMRowResult["basis"];
    detected_section: string;
    rationale: string;
  }>();

  for (let i = 0; i < items.length; i++) {
    const votes: ConsensusRowAudit["votes"] = [];
    const scores: Record<LLMScope, number> = {
      Main: 0,
      Optional: 0,
      Excluded: 0,
      Metadata: 0,
    };
    let bestSection = "";
    let bestBasis: LLMRowResult["basis"] = "row_text";
    let bestRationale = "";
    let bestVoteWeight = -1;

    for (const p of passes) {
      if (p.status !== "ok") {
        votes.push({ pass: p.tag, scope: null, confidence: 0 });
        continue;
      }
      const r = p.rows.get(i);
      if (!r) {
        votes.push({ pass: p.tag, scope: null, confidence: 0 });
        continue;
      }
      votes.push({ pass: p.tag, scope: r.scope, confidence: r.confidence });
      const contribution = WEIGHTS[p.tag] * (r.confidence / 100);
      scores[r.scope] += contribution;
      if (contribution > bestVoteWeight) {
        bestVoteWeight = contribution;
        bestSection = r.detected_section || bestSection;
        bestBasis = r.basis;
        bestRationale = r.rationale_short;
      }
    }

    const finalScope = pickWinner(scores);
    const finalConfidence = Math.round(
      Math.min(100, (scores[finalScope] / totalWeight(passes)) * 100),
    );
    finalByIndex.set(i, {
      scope: finalScope,
      confidence: finalConfidence,
      basis: bestBasis,
      detected_section: bestSection,
      rationale: bestRationale || `consensus:${finalScope.toLowerCase()}`,
    });
    audit.push({
      row_index: i,
      final_scope: finalScope,
      final_confidence: finalConfidence,
      detected_section: bestSection || null,
      votes,
      consistency_flipped: false,
      consistency_from: null,
    });
  }

  // Consistency pass — group by detected_section, re-evaluate rows that
  // conflict with their group majority.
  const flips = await runConsistencyPass({
    input,
    items,
    packets,
    finalByIndex,
    audit,
  });

  // Apply final classifications to items.
  const items_out: ScopeSegmentationItem[] = items.map((it, i) => {
    const f = finalByIndex.get(i);
    if (!f) {
      return {
        ...it,
        scope_segmentation_label: "Unknown" as ScopeLabel,
        scope_confidence: 0,
        scope_reason: "consensus:missing_vote",
        scope_section_id: null,
        scope_group_id: null,
        scope_heading_basis: null,
      };
    }
    return {
      ...it,
      scope_category: mapToDownstream(f.scope),
      scope_segmentation_label: f.scope as ScopeLabel,
      scope_confidence: f.confidence,
      scope_reason: f.rationale,
      scope_section_id: f.detected_section || null,
      scope_group_id: null,
      scope_heading_basis: f.basis,
    };
  });

  const summary = buildSummary({
    start,
    items,
    finalByIndex,
    totalsByRow,
    passes,
    flips,
  });

  return { items: items_out, summary, audit };
}

// --------------------------------------------------------------------------
// Pass execution
// --------------------------------------------------------------------------

async function runPass(
  tag: PassTag,
  systemPrompt: string,
  packets: ScopeRowPacket[],
  totalsByRow: Map<number, number | null>,
  input: ScopeSegmentationInput,
): Promise<PassResult> {
  const passStart = Date.now();
  const result: LLMClassifyResult = await classifyRowsLLMV4({
    openAIKey: input.openAIKey ?? "",
    supplier: input.supplier,
    trade: input.trade,
    quote_type: input.quote_type,
    page_count: input.allPages?.length ?? 0,
    rows: packets,
    totals_by_row: totalsByRow,
    systemPromptOverride: systemPrompt,
    variantTag: tag,
  });
  if (result.status === "failed") {
    return {
      tag,
      status: "failed",
      runtime_ms: Date.now() - passStart,
      rows: new Map(),
      error: result.error,
      error_type: result.error_type,
      warnings: result.warnings,
    };
  }
  const byIdx = new Map<number, LLMRowResult>();
  for (const r of result.rows) byIdx.set(r.row_index, r);
  return {
    tag,
    status: "ok",
    runtime_ms: Date.now() - passStart,
    rows: byIdx,
    error: null,
    error_type: null,
    warnings: result.warnings,
  };
}

// --------------------------------------------------------------------------
// Consistency pass
// --------------------------------------------------------------------------

type FinalMap = Map<
  number,
  {
    scope: LLMScope;
    confidence: number;
    basis: LLMRowResult["basis"];
    detected_section: string;
    rationale: string;
  }
>;

async function runConsistencyPass(args: {
  input: ScopeSegmentationInput;
  items: ParsedLineItemV2[];
  packets: ScopeRowPacket[];
  finalByIndex: FinalMap;
  audit: ConsensusRowAudit[];
}): Promise<number> {
  const { input, packets, finalByIndex, audit } = args;

  // Group rows by detected_section.
  const groups = new Map<string, number[]>();
  for (const [idx, f] of finalByIndex.entries()) {
    const key = (f.detected_section || "").trim().toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(idx);
  }

  let flips = 0;
  for (const [, indices] of groups) {
    if (indices.length < 2) continue;
    const counts: Record<LLMScope, number> = {
      Main: 0,
      Optional: 0,
      Excluded: 0,
      Metadata: 0,
    };
    for (const idx of indices) counts[finalByIndex.get(idx)!.scope]++;
    const majorityScope = pickWinner({
      Main: counts.Main,
      Optional: counts.Optional,
      Excluded: counts.Excluded,
      Metadata: counts.Metadata,
    } as Record<LLMScope, number>);

    // Find conflicting rows (non-Metadata mismatches — Metadata rows
    // like subtotals are allowed to differ).
    const conflicting = indices.filter((idx) => {
      const s = finalByIndex.get(idx)!.scope;
      return s !== majorityScope && s !== "Metadata";
    });
    if (conflicting.length === 0) continue;
    if (conflicting.length > 40) continue; // keep the reviewer packet small

    // Submit ALL rows in the group (not just conflicting) so the model
    // has the full picture.
    const groupPackets = indices
      .map((i) => packets[i])
      .filter((p): p is ScopeRowPacket => !!p);
    if (groupPackets.length === 0) continue;

    const review = await classifyRowsLLMV4({
      openAIKey: input.openAIKey ?? "",
      supplier: input.supplier,
      trade: input.trade,
      quote_type: input.quote_type,
      page_count: input.allPages?.length ?? 0,
      rows: groupPackets,
      systemPromptOverride: CONSISTENCY_PROMPT,
      variantTag: "consistency",
    });
    if (review.status !== "ok") continue;

    for (const r of review.rows) {
      const prev = finalByIndex.get(r.row_index);
      if (!prev) continue;
      if (prev.scope === r.scope) continue;
      const entry = audit.find((a) => a.row_index === r.row_index);
      if (entry) {
        entry.consistency_flipped = true;
        entry.consistency_from = prev.scope;
        entry.final_scope = r.scope;
        entry.final_confidence = Math.max(prev.confidence, r.confidence);
      }
      finalByIndex.set(r.row_index, {
        scope: r.scope,
        confidence: Math.max(prev.confidence, r.confidence),
        basis: r.basis,
        detected_section: prev.detected_section,
        rationale: `consistency_pass:${r.rationale_short}`.slice(0, 200),
      });
      flips++;
    }
  }
  return flips;
}

// --------------------------------------------------------------------------
// Math helpers
// --------------------------------------------------------------------------

function pickWinner(scores: Record<LLMScope, number>): LLMScope {
  const order: LLMScope[] = ["Main", "Optional", "Excluded", "Metadata"];
  let best: LLMScope = "Main";
  let bestScore = -Infinity;
  for (const k of order) {
    if (scores[k] > bestScore) {
      bestScore = scores[k];
      best = k;
    }
  }
  return best;
}

function totalWeight(passes: PassResult[]): number {
  let w = 0;
  for (const p of passes) if (p.status === "ok") w += WEIGHTS[p.tag];
  return w > 0 ? w : 1;
}

function mapToDownstream(s: LLMScope): "main" | "optional" | "excluded" {
  if (s === "Main") return "main";
  if (s === "Optional") return "optional";
  return "excluded";
}

function buildSummary(args: {
  start: number;
  items: ParsedLineItemV2[];
  finalByIndex: FinalMap;
  totalsByRow: Map<number, number | null>;
  passes: PassResult[];
  flips: number;
}): ConsensusSummary {
  const { start, items, finalByIndex, totalsByRow, passes, flips } = args;
  let main = 0, optional = 0, excluded = 0, metadata = 0, unknown = 0;
  let mainTotal = 0, optionalTotal = 0, confSum = 0;
  for (let i = 0; i < items.length; i++) {
    const f = finalByIndex.get(i);
    if (!f) { unknown++; continue; }
    if (f.scope === "Main") main++;
    else if (f.scope === "Optional") optional++;
    else if (f.scope === "Excluded") excluded++;
    else if (f.scope === "Metadata") metadata++;
    confSum += f.confidence;
    const t = totalsByRow.get(i);
    if (typeof t === "number" && Number.isFinite(t)) {
      if (f.scope === "Main") mainTotal += t;
      else if (f.scope === "Optional") optionalTotal += t;
    }
  }
  const avg = items.length > 0 ? confSum / items.length : 0;
  const overall: "HIGH" | "MEDIUM" | "LOW" =
    avg >= 85 ? "HIGH" : avg >= 65 ? "MEDIUM" : "LOW";
  return {
    consensus_version: CONSENSUS_VERSION,
    status: "ok",
    runtime_ms: Date.now() - start,
    model_used: SCOPE_SEGMENTATION_MODEL,
    passes: passes.map((p) => ({
      tag: p.tag,
      status: p.status,
      runtime_ms: p.runtime_ms,
      error: p.error,
    })),
    rows_classified_main: main,
    rows_classified_optional: optional,
    rows_classified_excluded: excluded,
    rows_classified_metadata: metadata,
    rows_classified_unknown: unknown,
    main_total: round2(mainTotal),
    optional_total: round2(optionalTotal),
    overall_confidence: overall,
    consistency_flips: flips,
    error: null,
    debug_hint: null,
    requires_scope_review: overall === "LOW" || unknown > 0,
  };
}

function emptySummary(runtime_ms: number): ConsensusSummary {
  return {
    consensus_version: CONSENSUS_VERSION,
    status: "ok",
    runtime_ms,
    model_used: SCOPE_SEGMENTATION_MODEL,
    passes: [],
    rows_classified_main: 0,
    rows_classified_optional: 0,
    rows_classified_excluded: 0,
    rows_classified_metadata: 0,
    rows_classified_unknown: 0,
    main_total: 0,
    optional_total: 0,
    overall_confidence: "HIGH",
    consistency_flips: 0,
    error: null,
    debug_hint: null,
    requires_scope_review: false,
  };
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function consensusToSegmentationResult(
  r: ConsensusResult,
): ScopeSegmentationResult {
  return {
    items: r.items,
    summary: {
      stage10_version: r.summary.consensus_version,
      status: r.summary.status,
      runtime_ms: r.summary.runtime_ms,
      model_used: r.summary.model_used,
      rows_classified_main: r.summary.rows_classified_main,
      rows_classified_optional: r.summary.rows_classified_optional,
      rows_classified_excluded: r.summary.rows_classified_excluded,
      rows_classified_metadata: r.summary.rows_classified_metadata,
      rows_classified_unknown: r.summary.rows_classified_unknown,
      main_total: r.summary.main_total,
      optional_total: r.summary.optional_total,
      overall_confidence: r.summary.overall_confidence,
      warnings: [],
      error: r.summary.error,
      error_type: r.summary.error ? "consensus_error" : null,
      debug_hint: r.summary.debug_hint,
      chunks_used: 0,
      rows_sent: r.items.length,
      requires_scope_review: r.summary.requires_scope_review,
    },
  };
}
