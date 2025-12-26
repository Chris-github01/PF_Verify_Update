/*
  # Add Insurance Requirements to Projects
  
  1. New Columns
    - `projects.public_liability_insurance` (numeric)
      - Stores public liability insurance amount required (e.g., 10000000 for $10M)
      - Default: 10000000 (NZD $10M)
    - `projects.motor_vehicle_insurance` (numeric)
      - Stores motor vehicle insurance amount required
      - Default: 5000000 (NZD $5M)
  
  2. Purpose
    - Track insurance requirements from head contract
    - Display in Contract Summary
    - Include in PDF exports (Site Handover, Senior Management Pack)
  
  3. Security
    - No RLS changes needed (projects table already secured)
    - Values are contract-level requirements
*/

-- Add public liability insurance column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'public_liability_insurance'
  ) THEN
    ALTER TABLE projects ADD COLUMN public_liability_insurance numeric DEFAULT 10000000;
    
    COMMENT ON COLUMN projects.public_liability_insurance IS 
      'Public liability insurance amount required by head contract (NZD)';
  END IF;
END $$;

-- Add motor vehicle insurance column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'motor_vehicle_insurance'
  ) THEN
    ALTER TABLE projects ADD COLUMN motor_vehicle_insurance numeric DEFAULT 5000000;
    
    COMMENT ON COLUMN projects.motor_vehicle_insurance IS 
      'Motor vehicle insurance amount required by head contract (NZD)';
  END IF;
END $$;
