/*
  # Add Contract Financial Settings

  ## Summary
  Adds editable financial settings for contract management to allow users to configure retention rates and other contract parameters.

  1. Changes to `projects` table
    - `retention_percentage` (decimal) - Retention percentage (default 3%)
    - `main_contractor_name` (text) - Name of the main contractor
    - `payment_terms` (text) - Payment terms description
    - `liquidated_damages` (text) - Liquidated damages terms

  2. Security
    - Existing RLS policies apply
    - Fields are editable by organization members

  3. Notes
    - Retention percentage is stored as a decimal (e.g., 3.0 for 3%)
    - Default retention is 3% (industry standard)
    - All fields are nullable for flexibility
*/

-- Add retention percentage and contract fields to projects table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'retention_percentage'
  ) THEN
    ALTER TABLE projects ADD COLUMN retention_percentage decimal(5,2) DEFAULT 3.0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'main_contractor_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN main_contractor_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'payment_terms'
  ) THEN
    ALTER TABLE projects ADD COLUMN payment_terms text DEFAULT '20th following month, 22 working days';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'liquidated_damages'
  ) THEN
    ALTER TABLE projects ADD COLUMN liquidated_damages text DEFAULT 'None specified';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN projects.retention_percentage IS 'Retention percentage for contract (e.g., 3.0 for 3%)';
COMMENT ON COLUMN projects.main_contractor_name IS 'Name of the main contractor';
COMMENT ON COLUMN projects.payment_terms IS 'Payment terms description';
COMMENT ON COLUMN projects.liquidated_damages IS 'Liquidated damages terms';