/*
  # Add LLM audit fields to parsing_jobs

  ## Purpose
  Track the exact LLM execution result for every parse job so that failures can
  be diagnosed without inspecting logs.

  ## New columns on parsing_jobs
  - `llm_attempted`         (boolean) — whether the LLM path was entered at all
  - `llm_success`           (boolean) — whether LLM returned usable items
  - `llm_fail_reason`       (text)    — classified failure: timeout | json_parse | token_limit | api_error | empty_response | null
  - `llm_chunks_completed`  (integer) — how many Pass 2 chunks succeeded before fallback
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'llm_attempted'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN llm_attempted boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'llm_success'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN llm_success boolean DEFAULT null;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'llm_fail_reason'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN llm_fail_reason text DEFAULT null;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'llm_chunks_completed'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN llm_chunks_completed integer DEFAULT null;
  END IF;
END $$;
