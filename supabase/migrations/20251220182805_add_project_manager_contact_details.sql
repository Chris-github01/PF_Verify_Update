/*
  # Add Project Manager Contact Details
  
  1. Changes
    - Add `project_manager_name` text field to projects table
    - Add `project_manager_email` text field to projects table
    - Add `project_manager_phone` text field to projects table
  
  2. Purpose
    - Allow storing custom project manager contact details
    - Enable editing of project manager information in Contract Manager
    - Provide complete contact information for handover documents
*/

-- Add project manager contact fields to projects table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_manager_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN project_manager_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_manager_email'
  ) THEN
    ALTER TABLE projects ADD COLUMN project_manager_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'project_manager_phone'
  ) THEN
    ALTER TABLE projects ADD COLUMN project_manager_phone text;
  END IF;
END $$;
