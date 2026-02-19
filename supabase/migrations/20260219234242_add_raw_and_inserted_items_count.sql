/*
  # Add Raw and Inserted Items Count Tracking

  1. Purpose
    - Track both raw parsed item count and final inserted item count
    - Enables transparency about filtering/normalization process
    - Resolves UI discrepancy where import shows 122 items but only 95 are stored
    
  2. New Columns
    - `raw_items_count` - Total items parsed from document (before filtering)
    - `inserted_items_count` - Actual items inserted to quote_items table (after filtering/normalization)
    
  3. Changes
    - Add columns to quotes table
    - Backfill inserted_items_count from current items_count
    - Update UI will display inserted_items_count for consistency
    
  4. Notes
    - raw_items_count will be NULL for old quotes (parsed before this migration)
    - inserted_items_count will match items_count for existing quotes
*/

-- Add raw_items_count column (tracks original parsed count before filtering)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'raw_items_count'
  ) THEN
    ALTER TABLE quotes ADD COLUMN raw_items_count INTEGER DEFAULT NULL;
  END IF;
END $$;

-- Add inserted_items_count column (tracks final inserted count after filtering)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'inserted_items_count'
  ) THEN
    ALTER TABLE quotes ADD COLUMN inserted_items_count INTEGER DEFAULT NULL;
  END IF;
END $$;

-- Backfill inserted_items_count from current items_count for existing quotes
UPDATE quotes
SET inserted_items_count = items_count
WHERE inserted_items_count IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_quotes_inserted_items_count 
  ON quotes(inserted_items_count);

-- Add comment for documentation
COMMENT ON COLUMN quotes.raw_items_count IS 'Original number of items parsed from document before filtering/normalization';
COMMENT ON COLUMN quotes.inserted_items_count IS 'Final number of items inserted to quote_items table after filtering/normalization';
