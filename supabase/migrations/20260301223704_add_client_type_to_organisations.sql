/*
  # Add client_type to organisations

  ## Summary
  Adds a `client_type` column to the organisations table to differentiate between
  Main Contractor and Sub-contractor clients. This drives conditional feature access
  in the application — Sub-contractor clients see the SCC (Subcontract Commercial Control)
  module instead of the main contractor procurement workflow.

  ## Changes
  ### Modified Tables
  - `organisations`
    - Added `client_type` text column (default: 'main_contractor')
    - Constrained to: 'main_contractor' | 'sub_contractor'

  ## Notes
  - All existing organisations default to 'main_contractor' (backward compatible)
  - No data loss — safe additive migration
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'client_type'
  ) THEN
    ALTER TABLE organisations
      ADD COLUMN client_type text NOT NULL DEFAULT 'main_contractor'
        CHECK (client_type IN ('main_contractor', 'sub_contractor'));
  END IF;
END $$;
