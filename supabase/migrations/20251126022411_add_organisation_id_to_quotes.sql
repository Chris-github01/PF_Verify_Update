/*
  # Add organisation_id to quotes table

  1. Changes
    - Add `organisation_id` column to `quotes` table
    - Add foreign key constraint to `organisations` table
    - Add index for performance
    - Backfill existing quotes with organisation_id from their projects
*/

-- Add organisation_id column
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE;

-- Backfill organisation_id from projects
UPDATE quotes q
SET organisation_id = p.organisation_id
FROM projects p
WHERE q.project_id = p.id
  AND q.organisation_id IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE quotes 
ALTER COLUMN organisation_id SET NOT NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_quotes_organisation_id ON quotes(organisation_id);
