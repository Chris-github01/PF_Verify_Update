/*
  # Add Contract Manager Missing Fields

  1. New Columns
    - Add `client` to projects table
    - Add `main_contractor` to projects table
    - Add `project_manager_name` to projects table
    - Add `project_manager_email` to projects table
    - Add `project_manager_phone` to projects table
    - Add `payment_terms` to projects table
    - Add `liquidated_damages` to projects table
    - Add `retention_percentage` to projects table

  2. Purpose
    - Enable full Contract Manager PDF generation
    - Support Senior Management Pack with complete project information
    - Enable Cash Flow Forecast calculations
*/

-- Add missing fields to projects table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'client'
  ) THEN
    ALTER TABLE projects ADD COLUMN client TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'main_contractor'
  ) THEN
    ALTER TABLE projects ADD COLUMN main_contractor TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_manager_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN project_manager_name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_manager_email'
  ) THEN
    ALTER TABLE projects ADD COLUMN project_manager_email TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_manager_phone'
  ) THEN
    ALTER TABLE projects ADD COLUMN project_manager_phone TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'payment_terms'
  ) THEN
    ALTER TABLE projects ADD COLUMN payment_terms TEXT DEFAULT '20th following month, 22 working days';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'liquidated_damages'
  ) THEN
    ALTER TABLE projects ADD COLUMN liquidated_damages TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'retention_percentage'
  ) THEN
    ALTER TABLE projects ADD COLUMN retention_percentage NUMERIC(5,2) DEFAULT 5.00;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client);
CREATE INDEX IF NOT EXISTS idx_projects_main_contractor ON projects(main_contractor);

-- Comments
COMMENT ON COLUMN projects.client IS 'Client/End customer name for the project';
COMMENT ON COLUMN projects.main_contractor IS 'Main/Head contractor name';
COMMENT ON COLUMN projects.project_manager_name IS 'Project Manager name';
COMMENT ON COLUMN projects.project_manager_email IS 'Project Manager email address';
COMMENT ON COLUMN projects.project_manager_phone IS 'Project Manager phone number';
COMMENT ON COLUMN projects.payment_terms IS 'Payment terms for the contract';
COMMENT ON COLUMN projects.liquidated_damages IS 'Liquidated damages clause (e.g., "$1500.00 per calendar day")';
COMMENT ON COLUMN projects.retention_percentage IS 'Retention percentage (default 5%)';
