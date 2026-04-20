/*
  # Allow "review_required" status on parsing_jobs

  ## Summary
  Parser trust stabilization: when the parser produces a zero grand-total but the
  job does not otherwise fail, we must not silently mark the job as "completed".
  This migration expands the existing CHECK constraint on `parsing_jobs.status` to
  add a new allowed value: `review_required`.

  ## Changes
  1. Drop existing CHECK constraint `parsing_jobs_status_check`
  2. Recreate it with the expanded allowed value set:
     - pending
     - processing
     - completed
     - failed
     - review_required (NEW)

  ## Notes
  - Non-destructive: no existing rows are modified.
  - No column added or removed.
  - Safe to deploy while `process_parsing_job` is running; new status is only
    written by the updated edge function.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parsing_jobs_status_check'
      AND conrelid = 'public.parsing_jobs'::regclass
  ) THEN
    ALTER TABLE public.parsing_jobs DROP CONSTRAINT parsing_jobs_status_check;
  END IF;
END $$;

ALTER TABLE public.parsing_jobs
  ADD CONSTRAINT parsing_jobs_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'processing'::text,
    'completed'::text,
    'failed'::text,
    'review_required'::text
  ]));
