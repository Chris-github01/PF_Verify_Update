/*
  # Add metadata column to parsing_jobs table

  1. Changes
    - Add `metadata` JSONB column to `parsing_jobs` table
    - This column stores additional context like dashboard_mode for proper quote creation

  2. Purpose
    - Enables passing dashboard context from import to parsing job
    - Ensures quotes are created with correct revision_number based on import context
*/

-- Add metadata column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;
