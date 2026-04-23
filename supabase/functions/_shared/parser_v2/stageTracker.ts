/**
 * Stage tracker — records the lifecycle of each pipeline stage so
 * callers (UI, dashboards) can see exactly which stage failed and which
 * stages passed.
 *
 * Stage lifecycle:
 *   pending  → start() → running → succeed()/fail()/skip() → passed|failed|skipped
 *
 * The tracker stores stages in insertion order and never throws; it is
 * safe to call from within try/catch blocks during a failing run.
 */

export type StageStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface StageRecord {
  name: string;
  status: StageStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
}

export interface StageCompletion {
  tokens_in?: number | null;
  tokens_out?: number | null;
}

export class StageTracker {
  private stages: StageRecord[] = [];
  private byName = new Map<string, StageRecord>();

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
      return;
    }
    const record: StageRecord = {
      name,
      status: "running",
      started_at: now,
      completed_at: null,
      duration_ms: null,
      error_message: null,
      tokens_in: null,
      tokens_out: null,
    };
    this.stages.push(record);
    this.byName.set(name, record);
  }

  succeed(name: string, completion?: StageCompletion): void {
    const record = this.byName.get(name);
    if (!record) return;
    this.finalise(record, "passed");
    if (completion?.tokens_in != null) record.tokens_in = completion.tokens_in;
    if (completion?.tokens_out != null) record.tokens_out = completion.tokens_out;
  }

  fail(name: string, err: unknown, completion?: StageCompletion): void {
    const record = this.byName.get(name) ?? this.ensureStarted(name);
    this.finalise(record, "failed");
    record.error_message = formatError(err);
    if (completion?.tokens_in != null) record.tokens_in = completion.tokens_in;
    if (completion?.tokens_out != null) record.tokens_out = completion.tokens_out;
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
      return;
    }
    const record: StageRecord = {
      name,
      status: "skipped",
      started_at: now,
      completed_at: now,
      duration_ms: 0,
      error_message: reason ?? null,
      tokens_in: null,
      tokens_out: null,
    };
    this.stages.push(record);
    this.byName.set(name, record);
  }

  /** Mark every not-yet-finished stage as failed with the given error. */
  failAllInFlight(err: unknown): void {
    for (const record of this.stages) {
      if (record.status === "running" || record.status === "pending") {
        this.finalise(record, "failed");
        record.error_message = formatError(err);
      }
    }
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
