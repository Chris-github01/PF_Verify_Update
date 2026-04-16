/*
  # Add resolution metadata columns to quotes table

  ## Summary
  Adds authoritative total resolution fields to the quotes table so the UI
  can always read quote.total_amount as the single source of truth, with full
  audit trail of how that total was derived.

  ## New Columns
  - `resolved_total` — the authoritative resolved total (same value as total_amount after fix)
  - `resolution_source` — where the total came from: 'document_grand_total', 'document_sub_total', 'line_items_sum'
  - `resolution_confidence` — HIGH / MEDIUM / LOW
  - `document_grand_total` — the grand total extracted directly from raw PDF text
  - `document_sub_total` — the sub-total extracted from raw PDF text
  - `optional_scope_total` — sum of optional/add-to-scope items (excluded from main total)
  - `original_line_items_total` — raw sum of all parsed line items before resolution

  ## Notes
  All columns are nullable — existing quotes are unaffected.
  No data is dropped or altered.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'resolved_total'
  ) THEN
    ALTER TABLE quotes ADD COLUMN resolved_total numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'resolution_source'
  ) THEN
    ALTER TABLE quotes ADD COLUMN resolution_source text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'resolution_confidence'
  ) THEN
    ALTER TABLE quotes ADD COLUMN resolution_confidence text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'document_grand_total'
  ) THEN
    ALTER TABLE quotes ADD COLUMN document_grand_total numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'document_sub_total'
  ) THEN
    ALTER TABLE quotes ADD COLUMN document_sub_total numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'optional_scope_total'
  ) THEN
    ALTER TABLE quotes ADD COLUMN optional_scope_total numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'original_line_items_total'
  ) THEN
    ALTER TABLE quotes ADD COLUMN original_line_items_total numeric;
  END IF;
END $$;
