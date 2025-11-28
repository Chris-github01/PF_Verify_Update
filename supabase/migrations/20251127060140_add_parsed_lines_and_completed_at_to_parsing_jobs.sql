/*
  # Add missing columns to parsing_jobs

  ## Changes
  1. Add `parsed_lines` (jsonb) - stores the final parsed line items
  2. Add `completed_at` (timestamptz) - timestamp when job completed
  
  ## Notes
  - Both columns are nullable
  - Uses IF NOT EXISTS pattern for safety
*/

DO $$
BEGIN
  -- Add parsed_lines column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'parsed_lines'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN parsed_lines jsonb;
  END IF;

  -- Add completed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN completed_at timestamptz;
  END IF;
END $$;

COMMENT ON COLUMN parsing_jobs.parsed_lines IS 'Final parsed line items after all chunks are processed';
COMMENT ON COLUMN parsing_jobs.completed_at IS 'Timestamp when parsing job completed';
