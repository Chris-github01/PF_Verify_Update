/*
  # Add trade column to award_reports

  1. Changes
    - Add `trade` column to award_reports table
    - Set default to 'passive_fire' for existing records
    - Add index on (project_id, trade) for efficient filtering

  2. Notes
    - Existing award reports will be tagged as passive_fire
    - Future reports will be tagged with the current trade when generated
*/

-- Add trade column to award_reports
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'trade'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN trade text DEFAULT 'passive_fire';
    
    -- Add index for efficient filtering
    CREATE INDEX IF NOT EXISTS idx_award_reports_project_trade 
      ON award_reports(project_id, trade);
  END IF;
END $$;
