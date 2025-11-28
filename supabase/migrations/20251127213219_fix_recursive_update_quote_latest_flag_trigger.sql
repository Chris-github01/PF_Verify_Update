/*
  # Fix recursive trigger causing stack depth exceeded
  
  ## Problem
  The `update_quote_latest_flag` trigger was causing infinite recursion:
  1. INSERT/UPDATE on quotes triggers the function
  2. Function does UPDATE quotes SET is_latest = true WHERE id = NEW.id
  3. This UPDATE triggers the same function again
  4. Infinite loop → stack depth exceeded
  
  This only manifests on large quotes because small quotes complete quickly
  before hitting the recursion limit.
  
  ## Solution
  Check if is_latest actually needs to change before updating. Only update
  if the value is different, preventing self-triggering.
  
  Also change the trigger to AFTER INSERT only (not UPDATE), since we only
  need to set latest flag when a NEW quote is added, not on every update.
*/

-- Drop the old trigger
DROP TRIGGER IF EXISTS on_quote_update_latest_flag ON quotes;

-- Recreate the function with recursion protection
CREATE OR REPLACE FUNCTION update_quote_latest_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
BEGIN
  -- Only process if this is a new quote or revision_number changed
  IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.revision_number != NEW.revision_number) THEN
    
    -- Set all other quotes for this supplier to not latest
    UPDATE quotes
    SET is_latest = false
    WHERE project_id = NEW.project_id
      AND supplier_name = NEW.supplier_name
      AND id != NEW.id
      AND is_latest = true;  -- Only update if currently true (avoid unnecessary updates)
    
    -- Set this quote to latest ONLY if it's not already
    IF NEW.is_latest = false OR NEW.is_latest IS NULL THEN
      UPDATE quotes
      SET is_latest = true
      WHERE id = NEW.id;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger to fire AFTER INSERT only
CREATE TRIGGER on_quote_update_latest_flag
  AFTER INSERT ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_quote_latest_flag();
