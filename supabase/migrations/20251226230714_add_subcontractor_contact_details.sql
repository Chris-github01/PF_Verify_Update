/*
  # Add Subcontractor Contact Details to Projects
  
  1. New Columns
    - `projects.subcontractor_name` (text)
      - Name of the subcontractor/supplier
      - Editable field for subcontractor name
    
    - `projects.quantity_surveyor_name` (text)
    - `projects.quantity_surveyor_phone` (text)
    - `projects.quantity_surveyor_email` (text)
      - Quantity Surveyor/Commercial Contact details
    
    - `projects.site_manager_name` (text)
    - `projects.site_manager_phone` (text)
    - `projects.site_manager_email` (text)
      - Site Manager contact details
    
    - `projects.health_safety_officer_name` (text)
    - `projects.health_safety_officer_phone` (text)
    - `projects.health_safety_officer_email` (text)
      - Health & Safety Officer contact details
    
    - `projects.accounts_name` (text)
    - `projects.accounts_phone` (text)
    - `projects.accounts_email` (text)
      - Accounts department contact details
    
    - `projects.document_controller_name` (text)
    - `projects.document_controller_phone` (text)
    - `projects.document_controller_email` (text)
      - Document Controller contact details
  
  2. Purpose
    - Store subcontractor team contact information
    - All fields are optional
    - Display in Contract Summary
    - Include in PDF exports (Site Handover, Senior Management Pack)
  
  3. Security
    - No RLS changes needed (projects table already secured)
    - Values are contract-level subcontractor contacts
*/

-- Add subcontractor name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'subcontractor_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN subcontractor_name text;
    
    COMMENT ON COLUMN projects.subcontractor_name IS 
      'Name of the subcontractor/supplier';
  END IF;
END $$;

-- Add Quantity Surveyor contact fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'quantity_surveyor_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN quantity_surveyor_name text;
    
    COMMENT ON COLUMN projects.quantity_surveyor_name IS 
      'Quantity Surveyor / Commercial Contact name';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'quantity_surveyor_phone'
  ) THEN
    ALTER TABLE projects ADD COLUMN quantity_surveyor_phone text;
    
    COMMENT ON COLUMN projects.quantity_surveyor_phone IS 
      'Quantity Surveyor / Commercial Contact phone number';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'quantity_surveyor_email'
  ) THEN
    ALTER TABLE projects ADD COLUMN quantity_surveyor_email text;
    
    COMMENT ON COLUMN projects.quantity_surveyor_email IS 
      'Quantity Surveyor / Commercial Contact email address';
  END IF;
END $$;

-- Add Site Manager contact fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'site_manager_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN site_manager_name text;
    
    COMMENT ON COLUMN projects.site_manager_name IS 
      'Site Manager contact name';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'site_manager_phone'
  ) THEN
    ALTER TABLE projects ADD COLUMN site_manager_phone text;
    
    COMMENT ON COLUMN projects.site_manager_phone IS 
      'Site Manager phone number';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'site_manager_email'
  ) THEN
    ALTER TABLE projects ADD COLUMN site_manager_email text;
    
    COMMENT ON COLUMN projects.site_manager_email IS 
      'Site Manager email address';
  END IF;
END $$;

-- Add Health & Safety Officer contact fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'health_safety_officer_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN health_safety_officer_name text;
    
    COMMENT ON COLUMN projects.health_safety_officer_name IS 
      'Health & Safety Officer contact name';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'health_safety_officer_phone'
  ) THEN
    ALTER TABLE projects ADD COLUMN health_safety_officer_phone text;
    
    COMMENT ON COLUMN projects.health_safety_officer_phone IS 
      'Health & Safety Officer phone number';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'health_safety_officer_email'
  ) THEN
    ALTER TABLE projects ADD COLUMN health_safety_officer_email text;
    
    COMMENT ON COLUMN projects.health_safety_officer_email IS 
      'Health & Safety Officer email address';
  END IF;
END $$;

-- Add Accounts contact fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'accounts_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN accounts_name text;
    
    COMMENT ON COLUMN projects.accounts_name IS 
      'Accounts department contact name';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'accounts_phone'
  ) THEN
    ALTER TABLE projects ADD COLUMN accounts_phone text;
    
    COMMENT ON COLUMN projects.accounts_phone IS 
      'Accounts department phone number';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'accounts_email'
  ) THEN
    ALTER TABLE projects ADD COLUMN accounts_email text;
    
    COMMENT ON COLUMN projects.accounts_email IS 
      'Accounts department email address';
  END IF;
END $$;

-- Add Document Controller contact fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'document_controller_name'
  ) THEN
    ALTER TABLE projects ADD COLUMN document_controller_name text;
    
    COMMENT ON COLUMN projects.document_controller_name IS 
      'Document Controller contact name';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'document_controller_phone'
  ) THEN
    ALTER TABLE projects ADD COLUMN document_controller_phone text;
    
    COMMENT ON COLUMN projects.document_controller_phone IS 
      'Document Controller phone number';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'document_controller_email'
  ) THEN
    ALTER TABLE projects ADD COLUMN document_controller_email text;
    
    COMMENT ON COLUMN projects.document_controller_email IS 
      'Document Controller email address';
  END IF;
END $$;
