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
/**
 * Extraction diagnostics — captured per-run so the UI can show exactly
 * what the extractor returned, even when zero rows were produced.
 */
export type ExtractionDiagnostics = {
  raw_response_sample: string | null;
  raw_response_chars: number;
  successful_responses: number;
  empty_content_count: number;
  malformed_json_count: number;
  malformed_samples: string[];
};

let EXTRACTION_DIAGNOSTICS: ExtractionDiagnostics | null = null;

export function installExtractionDiagnostics(): ExtractionDiagnostics {
  EXTRACTION_DIAGNOSTICS = {
    raw_response_sample: null,
    raw_response_chars: 0,
    successful_responses: 0,
    empty_content_count: 0,
    malformed_json_count: 0,
    malformed_samples: [],
  };
  return EXTRACTION_DIAGNOSTICS;
}

export function clearExtractionDiagnostics(): void {
  EXTRACTION_DIAGNOSTICS = null;
}

export function getExtractionDiagnostics(): ExtractionDiagnostics | null {
  return EXTRACTION_DIAGNOSTICS;
}

export function recordExtractionResponse(content: string | null | undefined): void {
  if (!EXTRACTION_DIAGNOSTICS) return;
  if (content == null || content === "") {
    EXTRACTION_DIAGNOSTICS.empty_content_count += 1;
    return;
  }
  EXTRACTION_DIAGNOSTICS.successful_responses += 1;
  EXTRACTION_DIAGNOSTICS.raw_response_chars += content.length;
  if (EXTRACTION_DIAGNOSTICS.raw_response_sample == null) {
    EXTRACTION_DIAGNOSTICS.raw_response_sample = content.slice(0, 500);
  }
}

export function recordMalformedExtractionJson(content: string | null | undefined): void {
  if (!EXTRACTION_DIAGNOSTICS) return;
  EXTRACTION_DIAGNOSTICS.malformed_json_count += 1;
  if (content && EXTRACTION_DIAGNOSTICS.malformed_samples.length < 3) {
    EXTRACTION_DIAGNOSTICS.malformed_samples.push(content.slice(0, 300));
  }
}

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