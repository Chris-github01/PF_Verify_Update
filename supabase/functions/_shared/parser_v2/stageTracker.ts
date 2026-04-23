/**
 * Stage tracker — records the lifecycle of each pipeline stage so
 * callers (UI, dashboards, durable DB telemetry) can see exactly which
 * stage is running, which stages passed/failed, and the token usage of
 * each LLM call in real time.
 *
 * Stage lifecycle:
 *   pending  -> start() -> running -> succeed()/fail()/skip() -> passed|failed|skipped
 *
 * A sink callback fires after every mutation (start, setTokens, succeed,
 * fail, skip, failAllInFlight) so the caller can persist the snapshot
 * to the database before the outer request is torn down by a timeout.
 * The tracker stores stages in insertion order and never throws; it is
 * safe to call from within try/catch blocks during a failing run.
 */

export type StageStatus = "pending" | "running" | "passed" | "empty" | "failed" | "skipped";

export interface StageRecord {
  name: string;
  status: StageStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  model: string | null;
  request_count: number;
  request_durations_ms: number[];
}

export interface StageCompletion {
  tokens_in?: number | null;
  tokens_out?: number | null;
}

export type StageSink = (snapshot: StageRecord[]) => void;

export class StageTracker {
  private stages: StageRecord[] = [];
  private byName = new Map<string, StageRecord>();
  private currentStageName: string | null = null;
  private sink: StageSink | null = null;

  setSink(sink: StageSink | null): void {
    this.sink = sink;
  }

  getCurrentStage(): string | null {
    return this.currentStageName;
  }

  /**
   * Wraps an async stage so it records start/complete/fail automatically.
   * If the fn throws, the stage is marked failed and the error is re-thrown.
   */
  async run<T>(
    name: string,
    fn: () => Promise<T>,
    opts?: { onComplete?: (value: T) => StageCompletion | undefined },
  ): Promise<T> {
    this.start(name);
    try {
      const value = await fn();
      const completion = opts?.onComplete?.(value);
      this.succeed(name, completion);
      return value;
    } catch (err) {
      this.fail(name, err);
      throw err;
    }
  }

  start(name: string): void {
    const existing = this.byName.get(name);
    const now = new Date().toISOString();
    if (existing) {
      existing.status = "running";
      existing.started_at = now;
      existing.completed_at = null;
      existing.duration_ms = null;
      existing.error_message = null;
    } else {
      const record: StageRecord = {
        name,
        status: "running",
        started_at: now,
        completed_at: null,
        duration_ms: null,
        error_message: null,
        tokens_in: null,
        tokens_out: null,
        model: null,
        request_count: 0,
        request_durations_ms: [],
      };
      this.stages.push(record);
      this.byName.set(name, record);
    }
    this.currentStageName = name;
    this.emit();
  }

  recordLlmCall(
    name: string,
    patch: { model?: string | null; duration_ms?: number | null },
  ): void {
    const record = this.byName.get(name);
    if (!record) return;
    if (patch.model) record.model = patch.model;
    if (patch.duration_ms != null && Number.isFinite(patch.duration_ms)) {
      record.request_count += 1;
      record.request_durations_ms.push(Math.round(patch.duration_ms));
    }
    this.emit();
  }

  succeed(name: string, completion?: StageCompletion): void {
    const record = this.byName.get(name);
    if (!record) return;
    this.finalise(record, "passed");
    if (completion?.tokens_in != null) record.tokens_in = completion.tokens_in;
    if (completion?.tokens_out != null) record.tokens_out = completion.tokens_out;
    if (this.currentStageName === name) this.currentStageName = null;
    this.emit();
  }

  /**
   * Mark a stage as empty — the call succeeded (no exception/timeout) but
   * returned no usable payload. Used for sanitizer that produced no clean
   * text and for extractors that returned zero rows.
   */
  markEmpty(name: string, reason?: string, completion?: StageCompletion): void {
    const record = this.byName.get(name) ?? this.ensureStarted(name);
    this.finalise(record, "empty");
    if (reason) record.error_message = reason;
    if (completion?.tokens_in != null) record.tokens_in = completion.tokens_in;
    if (completion?.tokens_out != null) record.tokens_out = completion.tokens_out;
    if (this.currentStageName === name) this.currentStageName = null;
    this.emit();
  }

  fail(name: string, err: unknown, completion?: StageCompletion): void {
    const record = this.byName.get(name) ?? this.ensureStarted(name);
    this.finalise(record, "failed");
    record.error_message = formatError(err);
    if (completion?.tokens_in != null) record.tokens_in = completion.tokens_in;
    if (completion?.tokens_out != null) record.tokens_out = completion.tokens_out;
    if (this.currentStageName === name) this.currentStageName = null;
    this.emit();
  }

  skip(name: string, reason?: string): void {
    const now = new Date().toISOString();
    const existing = this.byName.get(name);
    if (existing) {
      existing.status = "skipped";
      existing.completed_at = now;
      existing.duration_ms = existing.started_at
        ? new Date(now).getTime() - new Date(existing.started_at).getTime()
        : 0;
      existing.error_message = reason ?? null;
    } else {
      const record: StageRecord = {
        name,
        status: "skipped",
        started_at: now,
        completed_at: now,
        duration_ms: 0,
        error_message: reason ?? null,
        tokens_in: null,
        tokens_out: null,
        model: null,
        request_count: 0,
        request_durations_ms: [],
      };
      this.stages.push(record);
      this.byName.set(name, record);
    }
    if (this.currentStageName === name) this.currentStageName = null;
    this.emit();
  }

  /**
   * Update token counts on a (typically still-running) stage and emit
   * immediately so the durable sink can persist mid-stage progress.
   */
  setTokens(name: string, patch: { tokens_in?: number | null; tokens_out?: number | null }): void {
    const record = this.byName.get(name);
    if (!record) return;
    if (patch.tokens_in != null) record.tokens_in = patch.tokens_in;
    if (patch.tokens_out != null) record.tokens_out = patch.tokens_out;
    this.emit();
  }

  /** Mark every not-yet-finished stage as failed with the given error. */
  failAllInFlight(err: unknown): void {
    for (const record of this.stages) {
      if (record.status === "running" || record.status === "pending") {
        this.finalise(record, "failed");
        record.error_message = formatError(err);
      }
    }
    this.currentStageName = null;
    this.emit();
  }

  snapshot(): StageRecord[] {
    return this.stages.map((s) => ({ ...s }));
  }

  firstFailure(): StageRecord | null {
    return this.stages.find((s) => s.status === "failed") ?? null;
  }

  private ensureStarted(name: string): StageRecord {
    this.start(name);
    return this.byName.get(name)!;
  }

  private finalise(record: StageRecord, status: StageStatus): void {
    const now = new Date().toISOString();
    record.status = status;
    record.completed_at = now;
    record.duration_ms = record.started_at
      ? new Date(now).getTime() - new Date(record.started_at).getTime()
      : 0;
  }

  private emit(): void {
    if (!this.sink) return;
    try {
      this.sink(this.snapshot());
    } catch {
      // sink must never break the pipeline
    }
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  if (typeof err === "string") return err.slice(0, 500);
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return "Unknown error";
  }
}

/**
 * Error type used inside runParserV2 so the process_parsing_job handler
 * can recover the partial stage timeline even when the pipeline throws.
 */
export class ParserV2StageError extends Error {
  stages: StageRecord[];
  failedStage: string;

  constructor(message: string, failedStage: string, stages: StageRecord[]) {
    super(message);
    this.name = "ParserV2StageError";
    this.failedStage = failedStage;
    this.stages = stages;
  }
}
