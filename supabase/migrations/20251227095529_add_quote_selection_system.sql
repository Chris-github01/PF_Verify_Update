/*
  # Add Quote Selection System

  1. Changes
    - Add `is_selected` boolean column to quotes table
    - Defaults to true (all quotes selected by default when imported)
    - Add index for performance on selection queries
    
  2. Purpose
    - Allow users to select which quotes to process in workflows
    - Only selected quotes flow through Review & Clean → Intelligence → Scope Matrix → Reports
    
  3. Notes
    - Default true ensures backward compatibility
    - Existing quotes will be automatically selected
*/

-- Add is_selected column to quotes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'is_selected'
  ) THEN
    ALTER TABLE quotes ADD COLUMN is_selected boolean DEFAULT true NOT NULL;
  END IF;
END $$;

-- Add index for performance when filtering by selection
CREATE INDEX IF NOT EXISTS idx_quotes_is_selected 
  ON quotes(project_id, is_selected) 
  WHERE is_selected = true;

-- Create helper function to toggle quote selection
CREATE OR REPLACE FUNCTION toggle_quote_selection(quote_id_param uuid, selected_param boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE quotes
  SET is_selected = selected_param
  WHERE id = quote_id_param;
END;
$$;

-- Create helper function to bulk select/deselect quotes for a project
CREATE OR REPLACE FUNCTION bulk_toggle_quotes_selection(project_id_param uuid, selected_param boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE quotes
  SET is_selected = selected_param
  WHERE project_id = project_id_param;
END;
$$;