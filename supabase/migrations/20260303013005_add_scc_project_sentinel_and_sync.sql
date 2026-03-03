/*
  # SCC Project Sentinel & Quote Sync

  ## Summary
  SCC Quote Import reuses the core quote parsing pipeline (start_parsing_job →
  process_parsing_job). That pipeline requires a project_id. This migration:

  1. Adds `is_scc_sentinel` flag to projects so we can identify the auto-created
     SCC workspace project per organisation without polluting the main project list.
  2. Adds `scc_import_id` to parsing_jobs so we can link a parsing job back to
     the scc_quote_imports record that triggered it.
  3. Adds a helper function `get_or_create_scc_sentinel_project` that returns
     (or creates) a hidden sentinel project for SCC use within an org.

  ## Modified Tables
  - `projects` — new boolean column `is_scc_sentinel DEFAULT false`
  - `parsing_jobs` — new uuid column `scc_import_id` referencing scc_quote_imports

  ## New Functions
  - `get_or_create_scc_sentinel_project(org_id uuid)` — SECURITY DEFINER helper
*/

-- Add sentinel flag to projects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'is_scc_sentinel'
  ) THEN
    ALTER TABLE projects ADD COLUMN is_scc_sentinel boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add scc_import_id to parsing_jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parsing_jobs' AND column_name = 'scc_import_id'
  ) THEN
    ALTER TABLE parsing_jobs ADD COLUMN scc_import_id uuid REFERENCES scc_quote_imports(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_scc_import ON parsing_jobs(scc_import_id) WHERE scc_import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_scc_sentinel ON projects(organisation_id, is_scc_sentinel) WHERE is_scc_sentinel = true;

-- Helper: get or create the SCC sentinel project for an organisation
CREATE OR REPLACE FUNCTION get_or_create_scc_sentinel_project(org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_id uuid;
BEGIN
  SELECT id INTO project_id
  FROM projects
  WHERE organisation_id = org_id
    AND is_scc_sentinel = true
  LIMIT 1;

  IF project_id IS NULL THEN
    INSERT INTO projects (
      organisation_id,
      name,
      is_scc_sentinel,
      status
    )
    VALUES (
      org_id,
      '_SCC Workspace',
      true,
      'active'
    )
    RETURNING id INTO project_id;
  END IF;

  RETURN project_id;
END;
$$;
