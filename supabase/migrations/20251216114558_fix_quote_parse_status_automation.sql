/*
  # Fix Quote Parse Status Automation

  1. Changes
    - Creates a trigger to automatically set parse_status to 'success' when line items are added
    - Updates existing quotes with line items to have 'success' status
    - Ensures audit dashboard shows accurate data

  2. Purpose
    - Fixes the issue where quotes with line items remained in 'pending' status
    - Ensures the Executive Dashboard displays quote statistics correctly
    - Automates the status update process for future quotes
*/

-- Create function to auto-update parse status when line items are added
CREATE OR REPLACE FUNCTION auto_update_quote_parse_status()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- When quote_items are inserted, update the parent quote's parse status
  UPDATE quotes
  SET 
    parse_status = 'success',
    parsed_at = COALESCE(parsed_at, now()),
    line_item_count = (
      SELECT COUNT(*)
      FROM quote_items
      WHERE quote_id = NEW.quote_id
    )
  WHERE id = NEW.quote_id
    AND parse_status = 'pending';
  
  RETURN NEW;
END;
$$;

-- Create trigger on quote_items insert
DROP TRIGGER IF EXISTS trigger_auto_update_quote_parse_status ON quote_items;

CREATE TRIGGER trigger_auto_update_quote_parse_status
  AFTER INSERT ON quote_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_quote_parse_status();

-- Update all existing quotes that have line items but are still pending
UPDATE quotes
SET 
  parse_status = 'success',
  parsed_at = COALESCE(parsed_at, updated_at)
WHERE parse_status = 'pending'
  AND line_item_count > 0
  AND EXISTS (
    SELECT 1 FROM quote_items WHERE quote_items.quote_id = quotes.id
  );

COMMENT ON FUNCTION auto_update_quote_parse_status IS 'Automatically updates quote parse_status to success when line items are added';
