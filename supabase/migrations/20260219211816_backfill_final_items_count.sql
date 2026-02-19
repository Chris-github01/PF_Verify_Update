/*
  # Backfill final_items_count for existing quotes

  1. Purpose
    - Fix quotes where final_items_count was set to 0 during incomplete v3 parsing
    - Update final_items_count to match actual count in quote_items table
    
  2. Changes
    - Updates all quotes where final_items_count is 0 or NULL
    - Sets final_items_count to the actual COUNT from quote_items
    
  3. Notes
    - Safe to run multiple times (idempotent)
    - Only updates quotes with final_items_count = 0 or NULL
*/

-- Update quotes with final_items_count = 0 or NULL
UPDATE quotes
SET final_items_count = (
  SELECT COUNT(*)
  FROM quote_items
  WHERE quote_items.quote_id = quotes.id
)
WHERE final_items_count IS NULL OR final_items_count = 0;

-- Also update items_total for consistency
UPDATE quotes
SET items_total = (
  SELECT COALESCE(SUM(total_price), 0)
  FROM quote_items
  WHERE quote_items.quote_id = quotes.id
)
WHERE final_items_count IS NOT NULL
  AND (items_total IS NULL OR items_total = 0);

-- Log the update
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM quotes
  WHERE final_items_count IS NOT NULL AND final_items_count > 0;
  
  RAISE NOTICE 'Backfilled final_items_count for % quotes', updated_count;
END $$;
