/*
  # Add per-stage observability to parsing_jobs

  1. Changes
    - Adds `pipeline_stages` JSONB column to `parsing_jobs` to store an
      ordered array of stage records for each run.
    - Each stage record has the shape:
        { name, status, started_at, completed_at, duration_ms,
          error_message, tokens_in, tokens_out }
    - Default value is an empty array so existing rows stay valid.
    - Adds a GIN index for lookups when debugging failed stages.

  2. Security
    - RLS is already enabled on `parsing_jobs`. No policy changes needed:
      the new column is read/written through existing policies.

  3. Notes
    - Non-destructive. No data is dropped or rewritten.
    - Column is nullable; callers may omit it entirely.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'pipeline_stages'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN pipeline_stages JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_parsing_jobs_pipeline_stages_gin
  ON parsing_jobs USING GIN (pipeline_stages);

COMMENT ON COLUMN parsing_jobs.pipeline_stages IS
  'Ordered array of pipeline stage records {name,status,started_at,completed_at,duration_ms,error_message,tokens_in,tokens_out}.';
