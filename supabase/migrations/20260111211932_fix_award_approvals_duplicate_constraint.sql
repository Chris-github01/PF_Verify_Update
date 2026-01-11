/*
  # Fix Award Approvals Duplicate Records

  1. Changes
    - Delete duplicate approval records keeping only the most recent
    - Add unique constraint to prevent multiple approvals per report
    - Add index for better query performance

  2. Security
    - Maintains existing RLS policies
*/

-- First, delete any duplicate approval records, keeping only the most recent per report
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY award_report_id 
      ORDER BY approved_at DESC, created_at DESC
    ) as rn
  FROM award_approvals
)
DELETE FROM award_approvals
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add unique constraint to prevent multiple approvals for same report
-- Drop the constraint first if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'award_approvals_report_id_unique'
  ) THEN
    ALTER TABLE award_approvals DROP CONSTRAINT award_approvals_report_id_unique;
  END IF;
END $$;

-- Now add the unique constraint
ALTER TABLE award_approvals
  ADD CONSTRAINT award_approvals_report_id_unique 
  UNIQUE (award_report_id);

-- Create index to support the unique constraint
CREATE INDEX IF NOT EXISTS idx_award_approvals_report_id_unique 
  ON award_approvals(award_report_id);