/*
  # Add needs_async_processing flag to parsing_jobs

  1. Changes
    - Adds `needs_async_processing` boolean column (default false) to `parsing_jobs`
    - Set to true when a parsing job's total wall-clock runtime exceeds 90 seconds,
      signalling that the job should be retried in an async worker rather than
      attempted inline again.

  2. Notes
    - Non-destructive, idempotent. No RLS change required (existing policies cover all columns).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'needs_async_processing'
  ) THEN
    ALTER TABLE parsing_jobs
      ADD COLUMN needs_async_processing boolean DEFAULT false;
  END IF;
END $$;
