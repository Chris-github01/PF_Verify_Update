/*
  # Add SCC Import Source Tracking to BT Baseline Headers

  ## Summary
  Adds a reference column on bt_baseline_headers to record which SCC quote import
  was used to establish the baseline, enabling full traceability from the BT
  baseline back to the original parsed quote.

  ## Changes
  - bt_baseline_headers: new nullable column `scc_import_id` (uuid, FK to scc_quote_imports)

  ## Notes
  - Column is nullable — manually-created baselines will have NULL here
  - No RLS changes required; existing policies on bt_baseline_headers already cover this column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bt_baseline_headers' AND column_name = 'scc_import_id'
  ) THEN
    ALTER TABLE bt_baseline_headers
      ADD COLUMN scc_import_id uuid REFERENCES scc_quote_imports(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bt_baseline_headers_scc_import_id
  ON bt_baseline_headers(scc_import_id)
  WHERE scc_import_id IS NOT NULL;
