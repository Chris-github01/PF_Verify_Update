/*
  # Add Missing Columns to award_reports Table

  This migration adds the missing columns that the application expects but are not present in the database schema.

  ## Changes
  1. Add `generated_at` column (timestamp) - timestamp when the report was generated
  2. Add `result_json` column (jsonb) - the generated report data
  3. Add `params_json` column (jsonb) - the parameters used to generate the report
  4. Add `quotes_checksum` column (text) - checksum of the quotes used
  5. Add `created_by` column (uuid) - user who created the report
  6. Add `approved_supplier_id` column (uuid) - the approved supplier quote ID

  ## Notes
  - The table already has `report_data` which might be similar to `result_json`, but we'll keep both for compatibility
  - Uses IF NOT EXISTS to prevent errors if columns already exist
*/

DO $$
BEGIN
  -- Add generated_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'generated_at'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN generated_at timestamptz DEFAULT now();
  END IF;

  -- Add result_json if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'result_json'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN result_json jsonb;
  END IF;

  -- Add params_json if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'params_json'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN params_json jsonb;
  END IF;

  -- Add quotes_checksum if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'quotes_checksum'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN quotes_checksum text;
  END IF;

  -- Add created_by if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN created_by uuid REFERENCES auth.users(id);
  END IF;

  -- Add approved_supplier_id if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'award_reports' AND column_name = 'approved_supplier_id'
  ) THEN
    ALTER TABLE award_reports ADD COLUMN approved_supplier_id uuid;
  END IF;
END $$;

-- Copy data from report_data to result_json if result_json is NULL
UPDATE award_reports
SET result_json = report_data
WHERE result_json IS NULL AND report_data IS NOT NULL;

-- Set generated_at to created_at for existing records where generated_at is NULL
UPDATE award_reports
SET generated_at = created_at
WHERE generated_at IS NULL OR generated_at = '1970-01-01 00:00:00+00';
