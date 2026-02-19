/*
  # Add Parsing Reconciliation Fields

  1. New Columns
    - `raw_items_count` (integer) - Number of items LLM initially returned
    - `final_items_count` (integer) - Number of items actually saved to quote_items
    - `items_total` (numeric) - Sum of all quote_items.total_price
    - `document_total` (numeric, nullable) - Extracted "Grand Total (excl GST)" from PDF
    - `remainder_amount` (numeric) - Difference between document_total and items_total
    - `has_adjustment` (boolean) - Whether an adjustment line was added
    - `parsing_version` (text) - Version identifier for parsing logic used

  2. Changes
    - Ensures consistent item counts and totals across all UI pages
    - Enables reconciliation between parsed items and document totals
    - Tracks parsing pipeline versions for debugging

  3. Notes
    - All existing quotes will have NULL for new fields
    - New parsing logic will populate these fields
    - UI pages should use final_items_count as source of truth
*/

-- Add new tracking fields to quotes table
DO $$
BEGIN
  -- Raw items count (what LLM returned)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'raw_items_count'
  ) THEN
    ALTER TABLE quotes ADD COLUMN raw_items_count integer DEFAULT 0;
  END IF;

  -- Final items count (what was actually saved)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'final_items_count'
  ) THEN
    ALTER TABLE quotes ADD COLUMN final_items_count integer DEFAULT 0;
  END IF;

  -- Sum of all quote_items totals
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'items_total'
  ) THEN
    ALTER TABLE quotes ADD COLUMN items_total numeric DEFAULT 0;
  END IF;

  -- Extracted document total from PDF text
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'document_total'
  ) THEN
    ALTER TABLE quotes ADD COLUMN document_total numeric;
  END IF;

  -- Remainder after reconciliation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'remainder_amount'
  ) THEN
    ALTER TABLE quotes ADD COLUMN remainder_amount numeric DEFAULT 0;
  END IF;

  -- Whether adjustment line was added
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'has_adjustment'
  ) THEN
    ALTER TABLE quotes ADD COLUMN has_adjustment boolean DEFAULT false;
  END IF;

  -- Parsing version for tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'parsing_version'
  ) THEN
    ALTER TABLE quotes ADD COLUMN parsing_version text;
  END IF;
END $$;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_quotes_final_items_count ON quotes(final_items_count);
CREATE INDEX IF NOT EXISTS idx_quotes_has_adjustment ON quotes(has_adjustment) WHERE has_adjustment = true;
CREATE INDEX IF NOT EXISTS idx_quotes_parsing_version ON quotes(parsing_version);

-- Add helpful comments
COMMENT ON COLUMN quotes.raw_items_count IS 'Number of items initially extracted by LLM';
COMMENT ON COLUMN quotes.final_items_count IS 'Number of items actually saved to quote_items (source of truth)';
COMMENT ON COLUMN quotes.items_total IS 'Sum of all quote_items.total_price';
COMMENT ON COLUMN quotes.document_total IS 'Grand Total (excl GST) extracted from PDF text';
COMMENT ON COLUMN quotes.remainder_amount IS 'Difference between document_total and items_total';
COMMENT ON COLUMN quotes.has_adjustment IS 'True if an adjustment line was added to match document_total';
COMMENT ON COLUMN quotes.parsing_version IS 'Version identifier for parsing logic (e.g., v3.2-2026-02-20)';
