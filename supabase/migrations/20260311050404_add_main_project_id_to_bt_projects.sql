/*
  # Add main_project_id to bt_projects

  ## Summary
  Links each Baseline Tracker project to the main application project (from the `projects` table).
  This allows the BT module to filter and display only the BT projects that belong to the
  currently selected project in the main app workflow.

  ## Changes
  - `bt_projects`: adds `main_project_id` (uuid, nullable) — references the main `projects` table
  - Index added for fast lookup by main_project_id
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bt_projects' AND column_name = 'main_project_id'
  ) THEN
    ALTER TABLE bt_projects ADD COLUMN main_project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bt_projects_main_project_id ON bt_projects(main_project_id);
