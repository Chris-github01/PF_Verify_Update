/*
  # Add Missing Columns to Organisations and Projects Tables
  
  1. Changes to `organisations` table
    - Add `licensed_trades` (text array) - List of trades this org has licensed
    - Add `subscription_status` (text) - Current subscription status
    
  2. Changes to `projects` table
    - Add `client` (text) - Client name for the project
    - Add `reference` (text) - Project reference number
    
  3. Security
    - No RLS changes needed - existing policies will cover new columns
*/

-- Add missing columns to organisations table
DO $$
BEGIN
  -- Add licensed_trades column (array of text)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'licensed_trades'
  ) THEN
    ALTER TABLE organisations 
    ADD COLUMN licensed_trades text[] DEFAULT '{}';
  END IF;

  -- Add subscription_status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organisations' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE organisations 
    ADD COLUMN subscription_status text DEFAULT 'trial';
  END IF;
END $$;

-- Add missing columns to projects table
DO $$
BEGIN
  -- Add client column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'client'
  ) THEN
    ALTER TABLE projects 
    ADD COLUMN client text DEFAULT '';
  END IF;

  -- Add reference column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'reference'
  ) THEN
    ALTER TABLE projects 
    ADD COLUMN reference text DEFAULT '';
  END IF;
END $$;
