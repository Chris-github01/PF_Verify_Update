/*
  # Add trade column to parsing_jobs

  1. Changes
    - Add `trade` column to parsing_jobs table with default 'passive_fire'
    - Backfill existing parsing jobs based on their linked quotes
    - Add index for efficient filtering

  2. Notes
    - Jobs without quotes will default to 'passive_fire'
    - This enables proper trade isolation at the parsing job level
*/

-- Add trade column
ALTER TABLE parsing_jobs ADD COLUMN IF NOT EXISTS trade text DEFAULT 'passive_fire';

-- Backfill trade from linked quotes
UPDATE parsing_jobs pj
SET trade = q.trade
FROM quotes q
WHERE pj.quote_id = q.id
  AND pj.trade = 'passive_fire';

-- Add index
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_project_trade ON parsing_jobs(project_id, trade);
