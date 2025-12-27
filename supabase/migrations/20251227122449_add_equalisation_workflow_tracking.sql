/*
  # Add Equalisation Analysis Workflow Tracking

  1. Changes
    - Add `equalisation_completed` boolean column to projects table
    - Tracks whether the equalisation analysis has been successfully completed
    - Used to show workflow completion status in the project dashboard

  2. Default Values
    - Defaults to false (not completed)
    - Updated to true when user completes equalisation analysis
*/

-- Add equalisation completion tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'equalisation_completed'
  ) THEN
    ALTER TABLE projects ADD COLUMN equalisation_completed boolean DEFAULT false;
  END IF;
END $$;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_projects_equalisation_completed
  ON projects(equalisation_completed);