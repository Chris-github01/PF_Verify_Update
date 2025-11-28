/*
  # Add scope_category column to quote_items

  This migration adds the missing scope_category column that is required by the award report generation.

  ## Changes
  1. Add `scope_category` column (text) - categorizes items for scope analysis
  
  ## Notes
  - Uses IF NOT EXISTS to prevent errors if column already exists
  - Defaults to NULL to allow existing records
*/

DO $$
BEGIN
  -- Add scope_category if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quote_items' AND column_name = 'scope_category'
  ) THEN
    ALTER TABLE quote_items ADD COLUMN scope_category text;
  END IF;
END $$;
