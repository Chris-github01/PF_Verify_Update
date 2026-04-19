/*
  # Add Parser Observability Fields

  Adds fields to parsing_jobs to support:
  - Granular stage tracking (current_stage)
  - Attempt counting to break retry loops (attempt_count)
  - Which parsers were used (primary_parser, fallback_parser, final_parser_used)
  - Last error details (last_error, last_error_code)
  - Full execution trace stored as JSONB (trace_json)

  ## New Columns
  - `current_stage` (text) — human-readable stage label e.g. "Running LLM Extraction Pass"
  - `attempt_count` (integer) — how many times this job has been dispatched (start + resume calls)
  - `primary_parser` (text) — which parser was tried first
  - `fallback_parser` (text) — which fallback was used (null if primary succeeded)
  - `final_parser_used` (text) — the parser that produced the final accepted result
  - `last_error` (text) — most recent error message
  - `last_error_code` (text) — machine-readable error code
  - `trace_json` (jsonb) — full parser_attempt_order trace array
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'current_stage'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN current_stage text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'attempt_count'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN attempt_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'primary_parser'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN primary_parser text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'fallback_parser'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN fallback_parser text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'final_parser_used'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN final_parser_used text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'last_error'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN last_error text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'last_error_code'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN last_error_code text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'trace_json'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN trace_json jsonb DEFAULT NULL;
  END IF;
END $$;
