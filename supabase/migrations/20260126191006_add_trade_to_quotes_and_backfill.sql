/*
  # Add Trade Column to Quotes and Backfill Existing Data

  1. Changes
    - Add `trade` column to quotes table if it doesn't exist
    - Set default to 'passive_fire' for backward compatibility
    - Backfill existing quotes with 'passive_fire' trade
    - Add index for efficient filtering by trade

  2. Security
    - No RLS changes needed - inherits from existing quotes policies

  3. Data Safety
    - Uses IF NOT EXISTS to prevent errors
    - Backfills existing data before making column NOT NULL
    - Preserves all existing data

  CRITICAL: This migration ensures existing quotes are not lost when trade filtering is applied
*/

-- Add trade column to quotes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'trade'
  ) THEN
    ALTER TABLE quotes ADD COLUMN trade text DEFAULT 'passive_fire';

    -- Add comment explaining the column
    COMMENT ON COLUMN quotes.trade IS 'Trade module for this quote (passive_fire, electrical, plumbing, hvac, active_fire)';
  END IF;
END $$;

-- Backfill existing quotes with 'passive_fire' as the default trade
-- This ensures no data is lost when filtering by trade
UPDATE quotes
SET trade = 'passive_fire'
WHERE trade IS NULL;

-- Now make the column NOT NULL with default
ALTER TABLE quotes
ALTER COLUMN trade SET NOT NULL,
ALTER COLUMN trade SET DEFAULT 'passive_fire';

-- Add check constraint for valid trade values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotes_trade_check'
  ) THEN
    ALTER TABLE quotes
    ADD CONSTRAINT quotes_trade_check
    CHECK (trade IN ('passive_fire', 'electrical', 'plumbing', 'hvac', 'active_fire'));
  END IF;
END $$;

-- Create index for efficient filtering by trade
CREATE INDEX IF NOT EXISTS idx_quotes_trade
  ON quotes(trade);

-- Create composite index for common query pattern (project + trade)
CREATE INDEX IF NOT EXISTS idx_quotes_project_trade
  ON quotes(project_id, trade);
