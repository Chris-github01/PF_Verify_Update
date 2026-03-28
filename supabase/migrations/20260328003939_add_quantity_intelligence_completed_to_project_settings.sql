/*
  # Add quantity_intelligence_completed flag to project_settings

  Adds a dedicated boolean column to project_settings to track whether
  the Quantity Intelligence workflow step has been completed for a project.

  1. Changes
    - project_settings: add column quantity_intelligence_completed (boolean, default false)

  2. Notes
    - Uses IF NOT EXISTS pattern to be safe on re-run
    - The column is also written via the settings JSONB field for backward compat;
      this explicit column allows typed queries and indexing in future
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_settings' AND column_name = 'quantity_intelligence_completed'
  ) THEN
    ALTER TABLE project_settings ADD COLUMN quantity_intelligence_completed boolean DEFAULT false;
  END IF;
END $$;
