/*
  # Add parser timing columns and success_slow_finalize status

  1. Changes to `parsing_jobs`
    - Add status value `success_slow_finalize` to CHECK constraint
    - Add `parser_started_at` (timestamptz) — when runParserV2 began
    - Add `last_stage_completed_at` (timestamptz) — most recent terminal stage write
    - Add `success_committed_at` (timestamptz) — when we committed success to the job
    - Add `timeout_fired_at` (timestamptz) — when the 110s watchdog fired (if it did)
    - Add `pure_parsing_ms` (integer) — wall clock spent inside runParserV2
    - Add `finalize_ms` (integer) — wall clock spent persisting results after parsing
    - Add `total_runtime_ms` (integer) — total wall clock of the request

  2. Rationale
    - Operators need to distinguish real failures from watchdog-overrun successes.
    - Explicit timestamps let us prove the order of events: parser finished → success
      committed → (optional) timeout fired. A timeout firing after a committed success
      must never overwrite the job status.

  3. Security
    - No RLS changes. Existing policies continue to apply.
*/

ALTER TABLE parsing_jobs
  DROP CONSTRAINT IF EXISTS parsing_jobs_status_check;

ALTER TABLE parsing_jobs
  ADD CONSTRAINT parsing_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'processing'::text,
    'completed'::text,
    'failed'::text,
    'review_required'::text,
    'success_slow_finalize'::text
  ]));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'parser_started_at'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN parser_started_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'last_stage_completed_at'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN last_stage_completed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'success_committed_at'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN success_committed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'timeout_fired_at'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN timeout_fired_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'pure_parsing_ms'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN pure_parsing_ms integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'finalize_ms'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN finalize_ms integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'total_runtime_ms'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN total_runtime_ms integer;
  END IF;
END $$;
