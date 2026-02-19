/*
  # Add Quote Reconciliation Fields

  1. New Columns
    - `document_total_excl_gst` (numeric) - The actual total from the PDF document (extracted via regex)
    - `items_total` (numeric) - Sum of all parsed line items
    - `reconciliation_applied` (boolean) - Whether reconciliation logic was needed
    - `has_adjustment_item` (boolean) - Whether an auto-adjustment item was added
    - `optional_items_included` (boolean) - Whether optional items are included in the total

  2. Purpose
    - Track the source of truth (document total) vs parsed items total
    - Flag when reconciliation was needed (indicates parsing quality)
    - Help debug and audit parsing accuracy
    - Support the new parsing logic that doesn't blindly delete LS items

  3. Notes
    - These fields improve transparency in the parsing process
    - `document_total_excl_gst` is extracted using deterministic regex, not LLM
    - `items_total` allows comparison to detect parsing issues
*/

-- Add reconciliation tracking fields to quotes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'document_total_excl_gst'
  ) THEN
    ALTER TABLE quotes ADD COLUMN document_total_excl_gst numeric(12,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'items_total'
  ) THEN
    ALTER TABLE quotes ADD COLUMN items_total numeric(12,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'reconciliation_applied'
  ) THEN
    ALTER TABLE quotes ADD COLUMN reconciliation_applied boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'has_adjustment_item'
  ) THEN
    ALTER TABLE quotes ADD COLUMN has_adjustment_item boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'optional_items_included'
  ) THEN
    ALTER TABLE quotes ADD COLUMN optional_items_included boolean DEFAULT false;
  END IF;
END $$;

-- Add helpful comments
COMMENT ON COLUMN quotes.document_total_excl_gst IS 'Total extracted directly from PDF using regex (source of truth)';
COMMENT ON COLUMN quotes.items_total IS 'Sum of all parsed line items';
COMMENT ON COLUMN quotes.reconciliation_applied IS 'Whether reconciliation logic was needed to match document total';
COMMENT ON COLUMN quotes.has_adjustment_item IS 'Whether an auto-adjustment item was added to reconcile totals';
COMMENT ON COLUMN quotes.optional_items_included IS 'Whether optional items are included in the total';
