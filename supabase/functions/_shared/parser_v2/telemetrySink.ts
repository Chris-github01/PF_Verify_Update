/**
 * telemetrySink — module-level bridge between deep LLM call sites
 * (sanitizer, structure analyst, extractor runtime, authoritative-total
 * selector, validators) and the active StageTracker.
 *
 * Parser V2 stages run sequentially, so a single module-level "active
 * tracker" reference is safe. LLM callers don't need to know which
 * stage they belong to — they just call markResponseReceived(usage)
 * after parsing the OpenAI response, and the tracker writes tokens
 * against whichever stage is currently marked as running.
 *
 * All functions are no-ops when no tracker is installed, so legacy
 * callers and unit tests are unaffected.
 */

import type { StageTracker } from "./stageTracker.ts";

let ACTIVE_TRACKER: StageTracker | null = null;

export function installActiveTracker(tracker: StageTracker): void {
  ACTIVE_TRACKER = tracker;
}

export function clearActiveTracker(): void {
  ACTIVE_TRACKER = null;
}

export function getActiveTracker(): StageTracker | null {
  return ACTIVE_TRACKER;
}

/**
 * Called just before an outbound LLM request is sent. Lets the durable
 * sink emit a "request in flight" snapshot so the DB shows the stage
 * as running even if the outer request is then killed by a timeout.
 */
export function markRequestSent(approxTokensIn?: number, model?: string): void {
  const tracker = ACTIVE_TRACKER;
  if (!tracker) return;
  const name = tracker.getCurrentStage();
  if (!name) return;
  if (approxTokensIn != null && Number.isFinite(approxTokensIn)) {
    tracker.setTokens(name, { tokens_in: Math.round(approxTokensIn) });
  } else {
    tracker.setTokens(name, {});
  }
  if (model) tracker.recordLlmCall(name, { model });
}

export function markLlmCallDuration(durationMs: number, model?: string): void {
  const tracker = ACTIVE_TRACKER;
  if (!tracker) return;
  const name = tracker.getCurrentStage();
  if (!name) return;
  tracker.recordLlmCall(name, {
    duration_ms: durationMs,
    model: model ?? null,
  });
}

/**
 * Called immediately after an OpenAI response body is parsed. Pass the
 * usage block verbatim; missing fields are handled gracefully.
 */
export function markResponseReceived(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): void {
  const tracker = ACTIVE_TRACKER;
  if (!tracker) return;
  const name = tracker.getCurrentStage();
  if (!name) return;
  const patch: { tokens_in?: number; tokens_out?: number } = {};
  if (usage?.prompt_tokens != null && Number.isFinite(usage.prompt_tokens)) {
    patch.tokens_in = Math.round(usage.prompt_tokens);
  }
  if (usage?.completion_tokens != null && Number.isFinite(usage.completion_tokens)) {
    patch.tokens_out = Math.round(usage.completion_tokens);
  }
  tracker.setTokens(name, patch);
}