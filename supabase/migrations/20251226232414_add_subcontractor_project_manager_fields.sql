/*
  # Add Subcontractor Project Manager Contact Fields
  
  1. New Columns
    - `projects.subcontractor_project_manager_name` (text)
    - `projects.subcontractor_project_manager_phone` (text)
    - `projects.subcontractor_project_manager_email` (text)
      - Dedicated fields for subcontractor's Project Manager contact
  
  2. Purpose
    - Separate subcontractor's Project Manager from Site Manager
    - All fields are optional
    - Complete the 6 contact roles as specified
  
  3. Security
    - No RLS changes needed (projects table already secured)
*/

-- Add Subcontractor Project Manager contact fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'subcontractor_project_manager_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN subcontractor_project_manager_name text;
    
    COMMENT ON COLUMN projects.subcontractor_project_manager_name IS 
      'Subcontractor Project Manager contact name';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'subcontractor_project_manager_phone'
  ) THEN
    ALTER TABLE projects ADD COLUMN subcontractor_project_manager_phone text;
    
    COMMENT ON COLUMN projects.subcontractor_project_manager_phone IS 
      'Subcontractor Project Manager phone number';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'subcontractor_project_manager_email'
  ) THEN
    ALTER TABLE projects ADD COLUMN subcontractor_project_manager_email text;
    
    COMMENT ON COLUMN projects.subcontractor_project_manager_email IS 
      'Subcontractor Project Manager email address';
  END IF;
END $$;
