/*
  # Add Scope Matrix Workflow Tracking

  1. Changes
    - Add `scope_matrix_completed` boolean column to projects table
    - Tracks whether the scope matrix has been successfully generated
    - Used to show workflow completion status in the project dashboard

  2. Default Values
    - Defaults to false (not completed)
    - Updated to true when user confirms and generates scope matrix
*/

-- Add scope matrix completion tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'scope_matrix_completed'
  ) THEN
    ALTER TABLE projects ADD COLUMN scope_matrix_completed boolean DEFAULT false;
  END IF;
END $$;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_projects_scope_matrix_completed
  ON projects(scope_matrix_completed);
